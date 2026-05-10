/**
 * BriefTool — Agent'tan kullanıcıya doğrudan iletişim aracı.
 *
 * CLI_CONVERSATION.md mimarisine göre tasarlandı:
 * - `normal`   : Kullanıcının sorusuna verilen yanıt
 * - `proactive`: Kullanıcı sormadan gönderilen bildirim (arka plan tamamlandı, bloker bulundu, vs.)
 *
 * ISOLATION: Module-level global state kaldırıldı.
 * Her Agent instance kendi BriefBuffer'ına sahip. Paralel subagent'lar
 * birbirinin mesajlarını artık ezmez.
 *
 * Kullanım (Agent class içinde):
 *   this.briefBuffer = new BriefBuffer();
 *   // getTools() içinde: tools['send_message'] = createSendMessageTool(this.briefBuffer)
 */
import { z } from "zod";

export interface BriefMessage {
  message: string;
  status: "normal" | "proactive";
  attachments?: string[];
  sentAt: string; // ISO 8601
}

// ─────────────────────────────────────────────────────────────────────────────
// BRIEF BUFFER — per-agent instance, no shared global state
// ─────────────────────────────────────────────────────────────────────────────
export class BriefBuffer {
  private _queue: BriefMessage[] = [];

  push(msg: BriefMessage): void {
    this._queue.push(msg);
  }

  getAll(): BriefMessage[] {
    return this._queue;
  }

  getLast(): BriefMessage | undefined {
    return this._queue[this._queue.length - 1];
  }

  clear(): void {
    this._queue.length = 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FACTORY — returns a tool schema bound to a specific BriefBuffer instance
// ─────────────────────────────────────────────────────────────────────────────
export function createSendMessageTool(buffer: BriefBuffer) {
  return {
    description: `Send a structured message to the user. Use this tool to communicate results,
status updates, or important findings.

Status types:
- "normal"    → Reply to what the user just asked. Use after completing a task.
- "proactive" → Surface something the user hasn't asked for but needs to know NOW:
                task completion while they were away, a blocker you hit, a security
                finding, or any unsolicited but important status update.

Best practices:
- Always call this at the end of every agent turn with a clear summary
- Use markdown formatting in the message for readability
- Attach relevant files (logs, diffs, screenshots) via the attachments field
- Prefer "proactive" when the agent took autonomous action or found something critical`,
    parameters: z.object({
      message: z
        .string()
        .describe(
          "The message for the user. Supports markdown formatting. Be concise but complete.",
        ),
      status: z
        .enum(["normal", "proactive"])
        .describe(
          'Use "proactive" when surfacing something the user did not ask for. Use "normal" when replying to what they just said.',
        ),
      attachments: z
        .array(z.string())
        .optional()
        .describe(
          "Optional file paths (absolute or relative to cwd) to attach. " +
            "Use for screenshots, diffs, logs, or any file the user should see alongside your message.",
        ),
    }),
    execute: async ({
      message,
      status,
      attachments,
    }: {
      message: string;
      status: "normal" | "proactive";
      attachments?: string[];
    }) => {
      const brief: BriefMessage = {
        message,
        status,
        attachments: attachments ?? [],
        sentAt: new Date().toISOString(),
      };
      buffer.push(brief);
      return `[MESSAGE_SENT:${status}] Message delivered to user at ${brief.sentAt}`;
    },
  };
}
