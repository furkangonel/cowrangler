/**
 * Google Cloud Code Assist adapter (Gemini CLI + Antigravity).
 *
 * Gemini-CLI and Antigravity subscriptions don't authenticate the public
 * generativelanguage API. They talk to the internal Cloud Code Assist endpoint
 * (`/v1internal:streamGenerateContent`) with an OAuth bearer token + a discovered
 * GCP projectId, and wrap the standard GenerateContent request/response in an
 * envelope. This is exactly what the Gemini CLI and Antigravity clients do.
 *
 * Rather than hand-roll a whole LanguageModelV1, we reuse `@ai-sdk/google` (which
 * already speaks the standard GenerateContent JSON) and intercept its `fetch`:
 *   • rewrite the URL   `…/models/<id>:streamGenerateContent`  → `<endpoint>/v1internal:streamGenerateContent`
 *   • wrap the body     `<stdRequest>`  →  `{ project, model, request:<stdRequest>, … }`
 *   • swap auth         `x-goog-api-key` header  →  `Authorization: Bearer <token>`
 *   • unwrap the reply  each chunk is `{ response:<stdChunk> }` → `<stdChunk>`
 *
 * Wire behaviour mirrors caveman-code / pi-ai's `google-gemini-cli` provider.
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModelV1 } from "ai";

export type CloudCodeVariant = "gemini" | "antigravity";

const PROD_ENDPOINT = "https://cloudcode-pa.googleapis.com";
const ANTIGRAVITY_ENDPOINTS = [
  "https://daily-cloudcode-pa.sandbox.googleapis.com",
  "https://autopush-cloudcode-pa.sandbox.googleapis.com",
  PROD_ENDPOINT,
];

const DEFAULT_ANTIGRAVITY_VERSION = "1.18.4";

const GEMINI_CLI_HEADERS: Record<string, string> = {
  "User-Agent": "google-cloud-sdk vscode_cloudshelleditor/0.1",
  "X-Goog-Api-Client": "gl-node/22.17.0",
  "Client-Metadata": JSON.stringify({
    ideType: "IDE_UNSPECIFIED",
    platform: "PLATFORM_UNSPECIFIED",
    pluginType: "GEMINI",
  }),
};

function antigravityHeaders(): Record<string, string> {
  const version = process.env.PI_AI_ANTIGRAVITY_VERSION || DEFAULT_ANTIGRAVITY_VERSION;
  return { "User-Agent": `antigravity/${version} darwin/arm64` };
}

// Antigravity requires a signature system instruction (compact form, matches
// caveman-code / CLIProxyAPI).
const ANTIGRAVITY_SYSTEM_INSTRUCTION =
  "You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding." +
  "You are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question." +
  "**Absolute paths only**" +
  "**Proactiveness**";

// Sentinel that tells the Gemini API to skip thought-signature validation for
// unsigned functionCall parts. @ai-sdk/google doesn't round-trip Gemini 3's
// `thoughtSignature`, so replayed tool calls fail with HTTP 400 "Function call
// is missing a thought_signature". Only Gemini 3 models enforce this.
const SKIP_THOUGHT_SIGNATURE = "skip_thought_signature_validator";

/** For Gemini 3 models, stamp unsigned functionCall parts with the skip sentinel. */
function injectThoughtSignatures(request: any, modelId: string): any {
  if (!/gemini-3/i.test(modelId)) return request;
  const contents = request?.contents;
  if (!Array.isArray(contents)) return request;
  for (const c of contents) {
    if (!c || !Array.isArray(c.parts)) continue;
    for (const p of c.parts) {
      if (p && p.functionCall && !p.thoughtSignature) p.thoughtSignature = SKIP_THOUGHT_SIGNATURE;
    }
  }
  return request;
}

/** Prepend the Antigravity system instruction into the standard request body. */
function applyAntigravitySystem(request: any): any {
  const existing = request?.systemInstruction?.parts ?? [];
  return {
    ...request,
    systemInstruction: {
      role: "user",
      parts: [
        { text: ANTIGRAVITY_SYSTEM_INSTRUCTION },
        { text: `Please ignore following [ignore]${ANTIGRAVITY_SYSTEM_INSTRUCTION}[/ignore]` },
        ...existing,
      ],
    },
  };
}

/** Transform a Cloud Code SSE stream so each `data:` line's `.response` is surfaced
 *  as the standard chunk the @ai-sdk/google parser expects. */
function unwrapSseStream(res: Response): Response {
  if (!res.body) return res
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ""
  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? "" // keep the last (possibly incomplete) line
      for (const line of lines) {
        controller.enqueue(encoder.encode(rewriteLine(line) + "\n"))
      }
    },
    flush(controller) {
      if (buffer) controller.enqueue(encoder.encode(rewriteLine(buffer)))
    },
  })
  function rewriteLine(line: string): string {
    if (!line.startsWith("data:")) return line
    const payload = line.slice(5).trim()
    if (!payload || payload === "[DONE]") return line
    try {
      const obj = JSON.parse(payload)
      const inner = obj?.response ?? obj
      return `data: ${JSON.stringify(inner)}`
    } catch {
      return line
    }
  }
  const headers = new Headers(res.headers)
  headers.delete("content-length")
  return new Response(res.body.pipeThrough(transform), { status: res.status, statusText: res.statusText, headers })
}

/** Unwrap a non-streaming Cloud Code JSON response ({ response: <stdChunk> }). */
async function unwrapJsonResponse(res: Response): Promise<Response> {
  const text = await res.text()
  try {
    const obj = JSON.parse(text)
    const inner = obj?.response ?? obj
    const headers = new Headers(res.headers)
    headers.delete("content-length")
    return new Response(JSON.stringify(inner), { status: res.status, statusText: res.statusText, headers })
  } catch {
    return new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers })
  }
}

/**
 * Build a LanguageModelV1 that routes through Cloud Code Assist using an OAuth
 * token + projectId. `variant` selects Antigravity (sandbox endpoints, agent
 * request type, antigravity UA) vs Gemini-CLI (prod endpoint).
 */
export function makeCloudCodeModel(opts: {
  variant: CloudCodeVariant
  modelId: string
  token: string
  projectId: string
}): LanguageModelV1 {
  const isAntigravity = opts.variant === "antigravity"
  const endpoints = isAntigravity ? ANTIGRAVITY_ENDPOINTS : [PROD_ENDPOINT]
  const extraHeaders = isAntigravity ? antigravityHeaders() : GEMINI_CLI_HEADERS

  const customFetch: typeof fetch = async (input, init) => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url
    const m = urlStr.match(/\/models\/[^:]+:(streamGenerateContent|generateContent)/)
    // Not a generate call (or no body) → pass through untouched.
    if (!m || !init?.body) return fetch(input as any, init)

    const method = m[1]
    const isStream = method === "streamGenerateContent"
    const rawBody = typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as any)
    let stdRequest: any
    try { stdRequest = JSON.parse(rawBody) } catch { return fetch(input as any, init) }
    if (isAntigravity) stdRequest = applyAntigravitySystem(stdRequest)
    stdRequest = injectThoughtSignatures(stdRequest, opts.modelId)

    const envelope = {
      project: opts.projectId,
      model: opts.modelId,
      request: stdRequest,
      ...(isAntigravity ? { requestType: "agent" } : {}),
      userAgent: isAntigravity ? "antigravity" : "cowrangler",
      requestId: `${isAntigravity ? "agent" : "cw"}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    }
    const body = JSON.stringify(envelope)

    const headers = new Headers(init.headers as any)
    headers.delete("x-goog-api-key")
    headers.set("Authorization", `Bearer ${opts.token}`)
    headers.set("Content-Type", "application/json")
    if (isStream) headers.set("Accept", "text/event-stream")
    for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v)

    const query = isStream ? "?alt=sse" : ""
    let lastRes: Response | undefined
    for (const endpoint of endpoints) {
      const target = `${endpoint}/v1internal:${method}${query}`
      const res = await fetch(target, { method: "POST", headers, body, signal: init.signal as AbortSignal | undefined })
      if (res.ok) return isStream ? unwrapSseStream(res) : await unwrapJsonResponse(res)
      lastRes = res
      // 403/404 → endpoint not enabled for this account; cascade to the next.
      if (res.status === 403 || res.status === 404) continue
      break
    }
    return lastRes ?? new Response("Cloud Code Assist request failed", { status: 502 })
  }

  const google = createGoogleGenerativeAI({ apiKey: "oauth-cloudcode", fetch: customFetch })
  return google(opts.modelId)
}

/** Resolve the connected Cloud Code variant + creds from env (set by applyOAuthEnv). */
export function resolveCloudCodeCreds(preferAntigravity: boolean): { variant: CloudCodeVariant; token: string; projectId: string } | null {
  const ag = process.env.COWRANGLER_OAUTH_ANTIGRAVITY
  const agProj = process.env.COWRANGLER_OAUTH_ANTIGRAVITY_PROJECT
  const gem = process.env.COWRANGLER_OAUTH_GEMINI
  const gemProj = process.env.COWRANGLER_OAUTH_GEMINI_PROJECT
  if (preferAntigravity && ag && agProj) return { variant: "antigravity", token: ag, projectId: agProj }
  if (gem && gemProj) return { variant: "gemini", token: gem, projectId: gemProj }
  if (ag && agProj) return { variant: "antigravity", token: ag, projectId: agProj }
  return null
}
