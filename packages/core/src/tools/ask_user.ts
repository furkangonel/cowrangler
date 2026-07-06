import { z } from 'zod'
import { registerTool } from './registry.js'

// Options may arrive as plain strings or as rich {label, description} objects —
// different models format them differently, so we accept both and normalize.
const optionSchema = z.string()

export const askUserDef = {
  name: 'ask_user',
  description: 'Use this tool to ask the user one or more multiple-choice questions, with the goal of clarifying underspecified requirements, getting design feedback, or resolving ambiguity. Execution will pause until the user responds. Options must be plain strings.',
  parameters: z.object({
    questions: z.array(z.object({
      question: z.string().describe('The question to ask the user.'),
      options: z.array(optionSchema).describe('The options as strings. At least 2.'),
      is_multi_select: z.boolean().optional().describe('If true, the user can select multiple options.')
    }))
  })
}

/** Collapse a string option into a single display string. */
function normalizeOption(opt: string): string {
  return opt
}

let askResolver: ((answer: string) => void) | null = null
let askTimeout: ReturnType<typeof setTimeout> | null = null

/** Resolve the pending ask (if any) and clear its timeout. */
function settleAskUser(answer: string) {
  if (askTimeout) {
    clearTimeout(askTimeout)
    askTimeout = null
  }
  if (askResolver) {
    const r = askResolver
    askResolver = null
    r(answer)
  }
}

export function resolveAskUser(answer: string) {
  settleAskUser(answer)
}

/**
 * Unblock a pending ask_user without a real answer — used when the user presses
 * Stop. The awaiting tool resolves with a sentinel so the agent loop can wake up
 * and honour the interrupt flag instead of hanging forever on user input.
 */
export function cancelPendingAskUser() {
  settleAskUser('[interrupted]')
}

/** Is the agent currently parked waiting for a user answer? */
export function hasPendingAskUser(): boolean {
  return askResolver !== null
}

// Subscribe to ask user events so UI can show the prompt
export interface AskUserPayload {
  questions: { question: string; options: string[]; is_multi_select: boolean }[]
  meta?: {
    projectId?: string | null;
    sessionId?: string | null;
  }
}

export type AskUserListener = (payload: AskUserPayload) => void
let listener: AskUserListener | null = null
export function setAskUserListener(cb: AskUserListener | null) {
  listener = cb
}

/** Default: 5 min. 0 disables the timeout. Overridable per call or via env. */
const DEFAULT_ASK_TIMEOUT_MS = 5 * 60_000
const DEFAULT_TIMEOUT_ANSWER =
  '[no-response] The user did not answer in time. Proceed with your best judgment and sensible defaults. Do not call ask_user again this turn.'

export interface AskUserOptions {
  /** Auto-resolve after this many ms so the agent never hangs forever. 0 = wait indefinitely. */
  timeoutMs?: number
  /** Answer to resolve with when the timeout fires. */
  timeoutAnswer?: string
}

export async function executeAskUser(
  args: z.infer<typeof askUserDef.parameters>,
  meta?: { projectId?: string | null, sessionId?: string | null },
  opts?: AskUserOptions
): Promise<string> {
  let activeSessionId = meta && typeof meta === 'object' && 'sessionId' in meta ? (meta as any).sessionId : undefined;
  if (!activeSessionId) {
    try {
      const { getActiveSessionId } = await import("../project_context.js");
      activeSessionId = getActiveSessionId();
    } catch {
      // ignore
    }
  }

  // Normalize to the shape every UI expects: options are plain strings,
  // is_multi_select is always a boolean.
  const payload: AskUserPayload = {
    meta: {
      ...(meta && typeof meta === 'object' ? meta : {}),
      sessionId: activeSessionId,
    },
    questions: (args.questions ?? []).map(q => {
      // LLMs sometimes pass a single string with newlines instead of an array of options.
      // We split them here so the UI can render them as distinct selectable choices.
      const normalizedOptions = (q.options ?? [])
        .map(normalizeOption)
        .flatMap(opt => opt.split('\n').map(s => s.trim()).filter(Boolean));

      return {
        question: q.question,
        options: normalizedOptions,
        is_multi_select: q.is_multi_select ?? false,
      };
    }),
  }
  // A new question supersedes any still-pending one — otherwise the older
  // Promise would never resolve and that agent would hang forever.
  settleAskUser('[superseded] A newer question replaced this one. Continue without this answer.')

  const envTimeout = parseInt(process.env.COWRANGLER_ASK_USER_TIMEOUT_MS ?? '', 10)
  const timeoutMs = opts?.timeoutMs ?? (Number.isFinite(envTimeout) ? envTimeout : DEFAULT_ASK_TIMEOUT_MS)

  return new Promise((resolve) => {
    askResolver = resolve
    if (timeoutMs > 0) {
      askTimeout = setTimeout(() => {
        settleAskUser(opts?.timeoutAnswer ?? DEFAULT_TIMEOUT_ANSWER)
      }, timeoutMs)
    }
    if (listener) {
      listener(payload)
    } else {
      // Fallback if no UI is attached
      console.log(`[QA Tool] Agent asks: ${JSON.stringify(payload.questions)}`)
    }
  })
}

registerTool(
  askUserDef.name,
  askUserDef.description,
  askUserDef.parameters,
  executeAskUser
)
