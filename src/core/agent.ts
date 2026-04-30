import { generateText, CoreMessage } from "ai";
import fs from "fs";
import { LLM } from "./llm.js";
import { SkillManager } from "./skills.js";
import { TOOL_SCHEMAS } from "../tools/registry.js";
import { DIRS } from "./init.js";

export class Agent {
  public llm: LLM;
  public maxIterations: number;
  private skillManager: SkillManager;
  private baseSystemPrompt: string;
  private messages: CoreMessage[] = [];
  private allowedTools?: string[];

  constructor(
    llm: LLM,
    systemPrompt: string,
    maxIterations: number = 15,
    allowedTools?: string[],
  ) {
    this.llm = llm;
    this.maxIterations = maxIterations;
    this.allowedTools = allowedTools;
    this.skillManager = new SkillManager();
    this.baseSystemPrompt = this._buildSystemPrompt(systemPrompt);
    this.messages.push({ role: "system", content: this.baseSystemPrompt });
  }

  private _buildSystemPrompt(basePrompt: string): string {
    let finalPrompt = basePrompt;

    // 1. Proje Hafızasını (Memory) Enjekte Et
    if (fs.existsSync(DIRS.local.memory)) {
      const memoryContent = fs.readFileSync(DIRS.local.memory, "utf-8");
      finalPrompt += `\n\n[PROJECT CONTEXT & MEMORY]\nAşağıdaki bilgiler çalıştığın proje hakkında kesin bilmen ve uyman gereken mimari ve tarihsel gerçeklerdir:\n---\n${memoryContent}\n---`;
    }

    // 2. Yetenekleri (Skills) Enjekte Et
    const skills = this.skillManager.getAvailableSkills();
    if (skills.length > 0) {
      const skillsText = skills
        .map((s) => `- **${s.id}**: ${s.description}`)
        .join("\n");
      finalPrompt += `\n\n[AVAILABLE SKILLS]\nAşağıdaki SOP'lere sahipsin. Kullanıcı talebi bunlarla örtüşüyorsa önce kesinlikle \`utilize_skill\` aracıyla oku:\n${skillsText}`;
    }

    return finalPrompt;
  }

  private getTools() {
    if (!this.allowedTools || this.allowedTools.includes("*")) {
      return TOOL_SCHEMAS;
    }
    const filtered: Record<string, any> = {};
    for (const [key, value] of Object.entries(TOOL_SCHEMAS)) {
      if (this.allowedTools.includes(key)) filtered[key] = value;
    }
    return filtered;
  }

  async chat(
    userMessage: string,
    onToolCall?: (name: string, args: any) => void,
  ): Promise<string> {
    this.messages.push({ role: "user", content: userMessage });

    try {
      const result = await generateText({
        model: this.llm.getModel(),
        system: this.baseSystemPrompt,
        messages: this.messages,
        tools: this.getTools(),
        maxSteps: this.maxIterations,
        onStepFinish: ({ toolCalls }) => {
          if (toolCalls && onToolCall) {
            for (const call of toolCalls) {
              onToolCall(call.toolName, call.args);
            }
          }
        },
      });

      this.messages.push({ role: "assistant", content: result.text });
      return result.text;
    } catch (error) {
      this.messages.pop();
      throw error;
    }
  }

  reset(): void {
    // Reset atıldığında dosyadan güncel hafızayı tekrar okur
    this.baseSystemPrompt = this._buildSystemPrompt(
      this.baseSystemPrompt.split("\n\n[PROJECT CONTEXT")[0],
    );
    this.messages = [{ role: "system", content: this.baseSystemPrompt }];
  }
}
