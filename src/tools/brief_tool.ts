/**
 * BriefTool — Agent'tan kullanıcıya doğrudan iletişim aracı.
 *
 * CLI_CONVERSATION.md mimarisine göre tasarlandı:
 * - `normal`   : Kullanıcının sorusuna verilen yanıt
 * - `proactive`: Kullanıcı sormadan gönderilen bildirim (arka plan tamamlandı, bloker bulundu, vs.)
 *
 * Agent bu tool'u kullanarak yapılandırılmış mesajlar gönderir.
 * UI katmanı (AgentTurn.tsx) bu mesajları özel formatta gösterir.
 */
import { z } from "zod";
import { registerTool } from "./registry.js";

export interface BriefMessage {
  message: string;
  status: "normal" | "proactive";
  attachments?: string[];
  sentAt: string; // ISO 8601
}

// Global mesaj kuyruğu — UI katmanı bu kuyruğu okur
const _briefQueue: BriefMessage[] = [];

export function getBriefMessages(): BriefMessage[] {
  return _briefQueue;
}

export function clearBriefMessages(): void {
  _briefQueue.length = 0;
}

export function getLastBriefMessage(): BriefMessage | undefined {
  return _briefQueue[_briefQueue.length - 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL REGISTRATION
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "send_message",
  `Send a structured message to the user. Use this tool to communicate results,
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
  z.object({
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
  async ({
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

    _briefQueue.push(brief);

    // Return a sentinel so the LLM knows the message was dispatched
    return `[MESSAGE_SENT:${status}] Message delivered to user at ${brief.sentAt}`;
  },
);
