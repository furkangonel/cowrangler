import { z } from "zod";
import { registerTool } from "./registry.js";
import { SUB_AGENTS } from "../core/subagents.js";
import { Agent } from "../core/agent.js";
import { LLM } from "../core/llm.js";
import { getConfig } from "../core/init.js";

registerTool(
  "get_current_time",
  "Sistemin güncel tarih ve saat bilgisini ISO 8601 formatında döndürür.",
  z.object({}),
  async () => {
    return new Date().toISOString().replace("T", " ").substring(0, 19);
  },
);

registerTool(
  "spawn_subagent",
  "Karmaşık, okuma/planlama veya derin doğrulama gerektiren görevleri uzmanlaşmış bir alt ajana devretmek için kullanın.",
  z.object({
    agentType: z
      .enum(["explore", "plan", "verify"])
      .describe("Çağrılacak alt ajanın türü"),
    taskDescription: z
      .string()
      .describe("Alt ajana verilecek detaylı görev açıklaması"),
  }),
  async ({
    agentType,
    taskDescription,
  }: {
    agentType: string;
    taskDescription: string;
  }) => {
    const agentDef = SUB_AGENTS[agentType];
    if (!agentDef) return `HATA: ${agentType} adında bir alt ajan bulunamadı.`;

    const config = getConfig();
    const subLlm = new LLM(config.model, config.temperature);

    // Kiritik: Alt ajana, sadece kendisine izin verilen araçları (allowedTools) geçiyoruz
    const subAgent = new Agent(
      subLlm,
      agentDef.systemPrompt,
      15,
      agentDef.allowedTools,
    );

    try {
      const result = await subAgent.chat(`GÖREV:\n${taskDescription}`);
      return `--- [ALT AJAN (${agentType}) RAPORU] ---\n${result}\n--- [RAPOR SONU] ---`;
    } catch (e: any) {
      return `HATA: Alt ajan çalıştırılırken çöktü: ${e.message}`;
    }
  },
);
