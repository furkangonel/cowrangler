/**
 * LSP Server — Language Server Protocol temel implementasyonu.
 *
 *
 * Protokol: JSON-RPC 2.0 over stdio (LSP standart transport).
 *
 * Desteklenen özellikler:
 * - initialize / initialized handshake
 * - textDocument/didOpen, didChange, didClose
 * - textDocument/hover      → AI açıklaması
 * - textDocument/completion → cowrangler anahtar kelime + AI tamamlama
 * - $/cancelRequest desteği
 *
 * VS Code entegrasyonu:
 *   .vscode/settings.json veya extensions üzerinden LSP client kurulabilir.
 *   Örnek: "cowrangler.lsp.enabled": true, "cowrangler.lsp.command": "cowrangler lsp"
 */

import * as readline from "readline";
import { getLogger } from "../core/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// LSP TYPES (subset of LSP 3.17 spec)
// ─────────────────────────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

type Position = { line: number; character: number };
type Range = { start: Position; end: Position };

interface TextDocumentItem {
  uri: string;
  languageId: string;
  version: number;
  text: string;
}

interface TextDocumentIdentifier {
  uri: string;
}

interface MarkupContent {
  kind: "plaintext" | "markdown";
  value: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT STORE
// ─────────────────────────────────────────────────────────────────────────────

class DocumentStore {
  private docs = new Map<
    string,
    { text: string; languageId: string; version: number }
  >();

  open(item: TextDocumentItem): void {
    this.docs.set(item.uri, {
      text: item.text,
      languageId: item.languageId,
      version: item.version,
    });
  }

  change(uri: string, text: string, version: number): void {
    const existing = this.docs.get(uri);
    if (existing) {
      existing.text = text;
      existing.version = version;
    }
  }

  close(uri: string): void {
    this.docs.delete(uri);
  }

  get(
    uri: string,
  ): { text: string; languageId: string; version: number } | undefined {
    return this.docs.get(uri);
  }

  getWordAt(uri: string, position: Position): string {
    const doc = this.docs.get(uri);
    if (!doc) return "";
    const lines = doc.text.split("\n");
    const line = lines[position.line] ?? "";
    const char = position.character;

    // Kelime sınırlarını bul
    let start = char;
    let end = char;
    while (start > 0 && /\w/.test(line[start - 1])) start--;
    while (end < line.length && /\w/.test(line[end])) end++;
    return line.slice(start, end);
  }

  getLineContext(uri: string, position: Position, contextLines = 5): string {
    const doc = this.docs.get(uri);
    if (!doc) return "";
    const lines = doc.text.split("\n");
    const start = Math.max(0, position.line - contextLines);
    const end = Math.min(lines.length, position.line + contextLines + 1);
    return lines
      .slice(start, end)
      .map((l, i) => `${start + i + 1}: ${l}`)
      .join("\n");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COWRANGLER COMPLETIONS
// ─────────────────────────────────────────────────────────────────────────────

const COWRANGLER_KEYWORDS = [
  // COWRNGLR.md başlıkları
  {
    label: "## Tech Stack",
    kind: 15 /* Text */,
    detail: "COWRNGLR.md section",
  },
  { label: "## Architecture Notes", kind: 15, detail: "COWRNGLR.md section" },
  { label: "## Conventions & Rules", kind: 15, detail: "COWRNGLR.md section" },
  // Slash komutlar
  { label: "/model", kind: 14 /* Keyword */, detail: "Switch AI model" },
  { label: "/key set", kind: 14, detail: "Set API key" },
  { label: "/init", kind: 14, detail: "Initialize project context" },
  { label: "/memory", kind: 14, detail: "View/edit project memory" },
  { label: "/search", kind: 14, detail: "Search session history" },
  { label: "/usage", kind: 14, detail: "Token usage statistics" },
  {
    label: "/trajectory start",
    kind: 14,
    detail: "Start recording trajectory",
  },
  { label: "/kanban", kind: 14, detail: "Kanban board management" },
  { label: "/cron", kind: 14, detail: "Scheduled tasks" },
  { label: "/plugins", kind: 14, detail: "Plugin management" },
  { label: "/mcp", kind: 14, detail: "MCP server status" },
  { label: "/skin", kind: 14, detail: "Switch visual skin" },
  { label: "/logs", kind: 14, detail: "View log files" },
  { label: "/stop", kind: 14, detail: "Stop running agent" },
  { label: "/new", kind: 14, detail: "New session" },
];

// ─────────────────────────────────────────────────────────────────────────────
// LSP SERVER
// ─────────────────────────────────────────────────────────────────────────────

export class LSPServer {
  private docs = new DocumentStore();
  private initialized = false;
  private shutdownRequested = false;
  private pendingRequests = new Map<number | string, boolean>();

  /** AI agent — hover ve completion için (lazy init) */
  private agent: any | null = null;

  async start(): Promise<void> {
    const log = getLogger();
    log.info("gateway", "LSP server starting on stdio");

    // LSP, raw Buffer üzerinde çalışır; readline Content-Length parsing için kullanılır
    process.stdin.setEncoding("utf-8");

    let buffer = "";

    process.stdin.on("data", (chunk: string) => {
      buffer += chunk;
      this._processBuffer(buffer).then((remaining) => {
        buffer = remaining;
      });
    });

    process.stdin.on("end", () => {
      log.info("gateway", "LSP stdin closed — server exiting");
      process.exit(0);
    });

    // Başlangıç logunu stderr'e yaz (stdout LSP protokolü için)
    process.stderr.write(
      "[co-wrangler LSP] Server started, waiting for requests...\n",
    );
  }

  private async _processBuffer(buf: string): Promise<string> {
    let remaining = buf;

    while (true) {
      const headerEnd = remaining.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;

      const header = remaining.slice(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        // Geçersiz header — bir sonraki satıra atla
        remaining = remaining.slice(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;

      if (remaining.length < bodyStart + contentLength) break; // Daha veri bekleniyor

      const body = remaining.slice(bodyStart, bodyStart + contentLength);
      remaining = remaining.slice(bodyStart + contentLength);

      try {
        const msg = JSON.parse(body) as JsonRpcRequest;
        await this._handleMessage(msg);
      } catch {
        this._sendError(null, -32700, "Parse error");
      }
    }

    return remaining;
  }

  private async _handleMessage(msg: JsonRpcRequest): Promise<void> {
    const { id, method, params } = msg;

    // Cancel desteği
    if (method === "$/cancelRequest") {
      const cancelId = (params as any)?.id;
      if (cancelId !== undefined) this.pendingRequests.delete(cancelId);
      return;
    }

    // Shutdown / exit
    if (method === "shutdown") {
      this.shutdownRequested = true;
      this._sendResult(id ?? null, null);
      return;
    }
    if (method === "exit") {
      process.exit(this.shutdownRequested ? 0 : 1);
    }

    // Henüz initialize olmamışsa initialize dışında her şeyi reddet
    if (!this.initialized && method !== "initialize") {
      this._sendError(id ?? null, -32002, "Server not initialized");
      return;
    }

    if (id !== undefined && id !== null) {
      this.pendingRequests.set(id, true);
    }

    try {
      await this._dispatch(method, params, id ?? null);
    } finally {
      if (id !== undefined && id !== null) {
        this.pendingRequests.delete(id);
      }
    }
  }

  private async _dispatch(
    method: string,
    params: unknown,
    id: number | string | null,
  ): Promise<void> {
    switch (method) {
      // ── Lifecycle ─────────────────────────────────────────────────────────
      case "initialize":
        this._handleInitialize(params, id);
        break;
      case "initialized":
        this.initialized = true;
        break;

      // ── Document sync ─────────────────────────────────────────────────────
      case "textDocument/didOpen": {
        const p = params as { textDocument: TextDocumentItem };
        this.docs.open(p.textDocument);
        break;
      }
      case "textDocument/didChange": {
        const p = params as {
          textDocument: { uri: string; version: number };
          contentChanges: Array<{ text: string }>;
        };
        const lastChange = p.contentChanges[p.contentChanges.length - 1];
        if (lastChange) {
          this.docs.change(
            p.textDocument.uri,
            lastChange.text,
            p.textDocument.version,
          );
        }
        break;
      }
      case "textDocument/didClose": {
        const p = params as { textDocument: TextDocumentIdentifier };
        this.docs.close(p.textDocument.uri);
        break;
      }

      // ── Features ───────────────────────────────────────────────────────────
      case "textDocument/hover":
        await this._handleHover(params, id);
        break;
      case "textDocument/completion":
        await this._handleCompletion(params, id);
        break;

      default:
        if (id !== null) {
          this._sendError(id, -32601, `Method not found: ${method}`);
        }
    }
  }

  // ── Initialize ─────────────────────────────────────────────────────────────

  private _handleInitialize(params: unknown, id: number | string | null): void {
    this.initialized = true;
    this._sendResult(id, {
      capabilities: {
        textDocumentSync: 1, // Full sync
        hoverProvider: true,
        completionProvider: {
          triggerCharacters: ["/", "@", "#"],
          resolveProvider: false,
        },
      },
      serverInfo: {
        name: "co-wrangler-lsp",
        version: "1.0.0",
      },
    });
  }

  // ── Hover ──────────────────────────────────────────────────────────────────

  private async _handleHover(
    params: unknown,
    id: number | string | null,
  ): Promise<void> {
    const p = params as {
      textDocument: TextDocumentIdentifier;
      position: Position;
    };
    const word = this.docs.getWordAt(p.textDocument.uri, p.position);
    const context = this.docs.getLineContext(p.textDocument.uri, p.position, 3);

    if (!word.trim()) {
      this._sendResult(id, null);
      return;
    }

    try {
      // AI açıklaması için agent kullan
      const agent = await this._getAgent();
      if (!agent) {
        this._sendResult(id, {
          contents: {
            kind: "plaintext",
            value: `Symbol: ${word}`,
          } as MarkupContent,
        });
        return;
      }

      const prompt =
        `Explain the symbol/term "${word}" in the context of this code snippet. ` +
        `Be concise (2-3 sentences max). Context:\n\`\`\`\n${context}\n\`\`\``;

      const result = await agent.chat(prompt);

      this._sendResult(id, {
        contents: {
          kind: "markdown",
          value: `**${word}**\n\n${result.text}`,
        } as MarkupContent,
      });
    } catch {
      this._sendResult(id, {
        contents: {
          kind: "plaintext",
          value: word,
        } as MarkupContent,
      });
    }
  }

  // ── Completion ─────────────────────────────────────────────────────────────

  private async _handleCompletion(
    params: unknown,
    id: number | string | null,
  ): Promise<void> {
    const p = params as {
      textDocument: TextDocumentIdentifier;
      position: Position;
    };
    const word = this.docs.getWordAt(p.textDocument.uri, p.position);

    // Cowrangler keyword completions
    const filtered = COWRANGLER_KEYWORDS.filter(
      (k) => !word || k.label.toLowerCase().includes(word.toLowerCase()),
    );

    this._sendResult(id, {
      isIncomplete: false,
      items: filtered.map((k, i) => ({
        label: k.label,
        kind: k.kind,
        detail: k.detail,
        sortText: String(i).padStart(4, "0"),
      })),
    });
  }

  // ── Transport ──────────────────────────────────────────────────────────────

  private _send(msg: JsonRpcResponse | JsonRpcNotification): void {
    const body = JSON.stringify(msg);
    const header = `Content-Length: ${Buffer.byteLength(body, "utf-8")}\r\n\r\n`;
    process.stdout.write(header + body);
  }

  private _sendResult(id: number | string | null, result: unknown): void {
    this._send({ jsonrpc: "2.0", id: id!, result });
  }

  private _sendError(
    id: number | string | null,
    code: number,
    message: string,
  ): void {
    this._send({ jsonrpc: "2.0", id: id!, error: { code, message } });
  }

  // ── Agent (lazy) ───────────────────────────────────────────────────────────

  private async _getAgent(): Promise<any | null> {
    if (this.agent) return this.agent;
    try {
      const { Agent } = await import("../core/agent.js");
      const { LLM } = await import("../core/llm.js");
      const { getConfig, initEnvironment, loadEnvironmentVariables } =
        await import("../core/init.js");
      initEnvironment();
      loadEnvironmentVariables();
      const config = getConfig();
      const llm = new LLM(config.model);
      this.agent = new Agent(llm, config.system_prompt, 5, undefined, "lsp");
    } catch {
      this.agent = null;
    }
    return this.agent;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

export async function startLSPServer(): Promise<void> {
  const server = new LSPServer();
  await server.start();
}
