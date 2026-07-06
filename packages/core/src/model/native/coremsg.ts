/**
 * Geçiş köprüsü: vercel `CoreMessage[]` ↔ port `Message[]`.
 *
 * agent.ts geçmişi bugün CoreMessage[] tutuyor. Native yol devreye girene kadar
 * bu köprü iki dünyayı çevirir. `ai` TİPİ İMPORT ETMEZ — CoreMessage yapısal
 * `any` olarak ele alınır, böylece native/ modülü SDK-temiz kalır.
 *
 * `ai` tamamen kaldırılıp geçmiş port formatında saklanınca bu dosya silinir.
 */

import type { ContentPart, Message, Role } from "./types.js";

type AnyMsg = { role: string; content: any };

// ── CoreMessage[] → Message[] ──────────────────────────────────────────────

export function fromCoreMessages(msgs: AnyMsg[]): Message[] {
  return msgs.map(fromCoreMessage);
}

export function fromCoreMessage(m: AnyMsg): Message {
  const role = m.role as Role;

  if (typeof m.content === "string") {
    return { role, content: m.content };
  }

  const parts: ContentPart[] = [];
  for (const part of m.content ?? []) {
    switch (part.type) {
      case "text":
        parts.push({ type: "text", text: part.text ?? "" });
        break;
      case "reasoning":
        parts.push({ type: "reasoning", text: part.text ?? "" });
        break;
      case "tool-call":
        parts.push({ type: "tool_call", id: part.toolCallId, name: part.toolName, args: part.args ?? {} });
        break;
      case "tool-result":
        parts.push({
          type: "tool_result",
          id: part.toolCallId,
          name: part.toolName,
          result: part.result,
          isError: part.isError,
        });
        break;
      // image / file parçaları şimdilik atlanır (metin ajanı)
    }
  }
  return { role, content: parts };
}

// ── Message[] → CoreMessage[] ──────────────────────────────────────────────

export function toCoreMessages(msgs: Message[]): AnyMsg[] {
  return msgs.map(toCoreMessage);
}

export function toCoreMessage(m: Message): AnyMsg {
  if (typeof m.content === "string") {
    return { role: m.role, content: m.content };
  }
  const content = m.content.map((p): any => {
    switch (p.type) {
      case "text":
        return { type: "text", text: p.text };
      case "reasoning":
        return { type: "reasoning", text: p.text };
      case "tool_call":
        return { type: "tool-call", toolCallId: p.id, toolName: p.name, args: p.args ?? {} };
      case "tool_result":
        return { type: "tool-result", toolCallId: p.id, toolName: p.name, result: p.result, isError: p.isError };
    }
  });
  return { role: m.role, content };
}
