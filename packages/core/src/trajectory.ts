/**
 * Trajectory Recorder — Oturum geçmişini kaydet ve tekrar oynat.
 *
 *
 * Özellikler:
 * - Her konuşma turunu kaydet (user/assistant/tool calls)
 * - JSON dosyasına export et
 * - `cowrangler replay <file>` ile geçmiş oturumu tekrar çalıştır
 * - Assertion testi: beklenen çıktılar kontrol edilir
 */

import fs from "fs";
import path from "path";
import { DIRS } from "./init.js";
import { getLogger } from "./logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface TrajectoryTurn {
  index: number;
  userMessage: string;
  assistantResponse: string;
  toolCalls: TrajectoryToolCall[];
  inputTokens: number;
  outputTokens: number;
  tokenCount: number;
  durationMs: number;
  timestamp: number;
}

export interface TrajectoryToolCall {
  name: string;
  args: Record<string, unknown>;
  /** true ise result kaydedilmedi (gizlilik / boyut) */
  resultTruncated?: boolean;
}

export interface TrajectoryMeta {
  version: number;
  sessionId: string | null;
  model: string;
  startedAt: number;
  endedAt: number;
  totalTokens: number;
  totalTurns: number;
  platform: string;
}

export interface TrajectoryFile {
  meta: TrajectoryMeta;
  turns: TrajectoryTurn[];
  /** Kullanıcı tanımlı test assertion'ları */
  assertions?: TrajectoryAssertion[];
}

export interface TrajectoryAssertion {
  description: string;
  /** Hangi turn'ü test ediyoruz (0-indexed, -1 = son turn) */
  turnIndex: number;
  /** Kontrol edilecek alanı belirten dot-path: "assistantResponse", "toolCalls[0].name" */
  field: "assistantResponse" | "toolCalls" | "inputTokens" | "outputTokens";
  /** Kontrol türü */
  check: "contains" | "not_contains" | "equals" | "matches" | "min" | "max";
  value: string | number;
}

export interface AssertionResult {
  description: string;
  passed: boolean;
  actual?: string | number;
  expected: string | number;
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRAJECTORY RECORDER
// ─────────────────────────────────────────────────────────────────────────────

export class TrajectoryRecorder {
  private turns: TrajectoryTurn[] = [];
  private sessionId: string | null;
  private model: string;
  private platform: string;
  private startedAt: number;
  /** Kaydedilen trajectory dosyası yolu (save() sonrası set edilir) */
  private savedPath: string | null = null;

  constructor(
    sessionId: string | null,
    model: string,
    platform: string = "cli",
  ) {
    this.sessionId = sessionId;
    this.model = model;
    this.platform = platform;
    this.startedAt = Date.now();
  }

  // ── Kayıt ─────────────────────────────────────────────────────────────────

  recordTurn(params: {
    userMessage: string;
    assistantResponse: string;
    toolCalls?: TrajectoryToolCall[];
    inputTokens: number;
    outputTokens: number;
    tokenCount: number;
    durationMs: number;
  }): void {
    this.turns.push({
      index: this.turns.length,
      userMessage: params.userMessage,
      assistantResponse: params.assistantResponse,
      toolCalls: params.toolCalls ?? [],
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      tokenCount: params.tokenCount,
      durationMs: params.durationMs,
      timestamp: Date.now(),
    });

    getLogger().info("agent", `Trajectory turn ${this.turns.length} recorded`, {
      toolCallCount: (params.toolCalls ?? []).length,
      durationMs: params.durationMs,
    });
  }

  // ── Kaydetme ───────────────────────────────────────────────────────────────

  /**
   * Trajectory'yi JSON dosyasına kaydet.
   *
   * @param filePath Hedef dosya yolu. Belirtilmezse ~/.cowrangler/trajectories/ altına kaydedilir.
   * @returns Kaydedilen dosya yolu
   */
  save(filePath?: string): string {
    const dir = filePath
      ? path.dirname(filePath)
      : path.join(DIRS.global.base, "trajectories");

    fs.mkdirSync(dir, { recursive: true });

    const defaultName = `trajectory-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
    const targetPath = filePath ?? path.join(dir, defaultName);

    const totalTokens = this.turns.reduce((s, t) => s + t.tokenCount, 0);
    const data: TrajectoryFile = {
      meta: {
        version: 1,
        sessionId: this.sessionId,
        model: this.model,
        startedAt: this.startedAt,
        endedAt: Date.now(),
        totalTokens,
        totalTurns: this.turns.length,
        platform: this.platform,
      },
      turns: this.turns,
    };

    fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), "utf-8");
    this.savedPath = targetPath;

    getLogger().info("agent", `Trajectory saved: ${targetPath}`, {
      turns: this.turns.length,
      totalTokens,
    });

    return targetPath;
  }

  get turnCount(): number {
    return this.turns.length;
  }

  get lastSavedPath(): string | null {
    return this.savedPath;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REPLAY
// ─────────────────────────────────────────────────────────────────────────────

export interface ReplayOptions {
  file: string;
  /** Sadece belirli turn'leri çalıştır (0-indexed) */
  turns?: number[];
  /** Assertion'ları çalıştır */
  assert?: boolean;
  /** Çıktıyı ekrana bas */
  verbose?: boolean;
  /** Replay yerine sadece trajectory meta'sını göster */
  inspect?: boolean;
}

export interface ReplayResult {
  turnIndex: number;
  userMessage: string;
  replayedResponse: string;
  originalResponse: string;
  durationMs: number;
}

/**
 * Trajectory dosyasını yükle ve parse et.
 */
export function loadTrajectory(filePath: string): TrajectoryFile {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Trajectory file not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw) as TrajectoryFile;
  if (!data.meta || !data.turns) {
    throw new Error(`Invalid trajectory file format: ${filePath}`);
  }
  return data;
}

/**
 * Trajectory'yi tekrar çalıştır (aynı prompt'ları tekrar gönder).
 */
export async function replayTrajectory(
  options: ReplayOptions,
): Promise<ReplayResult[]> {
  const traj = loadTrajectory(options.file);

  if (options.inspect) {
    return []; // inspect modu — sadece meta gösterilir, run edilmez
  }

  const { Agent } = await import("./agent.js");
  const { LLM } = await import("./llm.js");
  const { getConfig, loadEnvironmentVariables, initEnvironment } =
    await import("./init.js");

  initEnvironment();
  loadEnvironmentVariables();
  const config = getConfig();

  const model = traj.meta.model ?? config.model;
  const llm = new LLM(model);
  const agent = new Agent(
    llm,
    config.system_prompt,
    config.max_iterations,
    undefined,
    "replay",
  );

  const targetTurns =
    options.turns && options.turns.length > 0
      ? traj.turns.filter((t) => options.turns!.includes(t.index))
      : traj.turns;

  const results: ReplayResult[] = [];

  for (const turn of targetTurns) {
    const start = Date.now();
    const result = await agent.chat(turn.userMessage);
    const durationMs = Date.now() - start;

    if (options.verbose) {
      console.log(`\n  ── Turn ${turn.index} ────────────────────────────────`);
      console.log(`  User: ${turn.userMessage.slice(0, 120)}...`);
      console.log(`  Original : ${turn.assistantResponse.slice(0, 200)}...`);
      console.log(`  Replayed : ${result.text.slice(0, 200)}...`);
      console.log(
        `  Duration : ${durationMs}ms (original: ${turn.durationMs}ms)`,
      );
    }

    results.push({
      turnIndex: turn.index,
      userMessage: turn.userMessage,
      replayedResponse: result.text,
      originalResponse: turn.assistantResponse,
      durationMs,
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSERTION TESTING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Trajectory assertion'larını çalıştır.
 * Assertion dosyadan gelir (trajectory.assertions) veya dışarıdan geçirilebilir.
 */
export function runAssertions(
  traj: TrajectoryFile,
  overrides?: TrajectoryAssertion[],
): AssertionResult[] {
  const assertions = overrides ?? traj.assertions ?? [];
  if (assertions.length === 0) return [];

  const results: AssertionResult[] = [];

  for (const assertion of assertions) {
    const turnIdx =
      assertion.turnIndex < 0
        ? traj.turns.length + assertion.turnIndex
        : assertion.turnIndex;

    const turn = traj.turns[turnIdx];
    if (!turn) {
      results.push({
        description: assertion.description,
        passed: false,
        expected: assertion.value,
        reason: `Turn ${turnIdx} not found (trajectory has ${traj.turns.length} turns)`,
      });
      continue;
    }

    let actual: string | number;
    switch (assertion.field) {
      case "assistantResponse":
        actual = turn.assistantResponse;
        break;
      case "toolCalls":
        actual = JSON.stringify(turn.toolCalls);
        break;
      case "inputTokens":
        actual = turn.inputTokens;
        break;
      case "outputTokens":
        actual = turn.outputTokens;
        break;
      default:
        actual = "";
    }

    let passed = false;
    let reason: string | undefined;

    switch (assertion.check) {
      case "contains":
        passed = String(actual).includes(String(assertion.value));
        break;
      case "not_contains":
        passed = !String(actual).includes(String(assertion.value));
        break;
      case "equals":
        passed = actual === assertion.value;
        break;
      case "matches":
        try {
          passed = new RegExp(String(assertion.value)).test(String(actual));
        } catch {
          passed = false;
          reason = "Invalid regex";
        }
        break;
      case "min":
        passed = Number(actual) >= Number(assertion.value);
        break;
      case "max":
        passed = Number(actual) <= Number(assertion.value);
        break;
    }

    results.push({
      description: assertion.description,
      passed,
      actual,
      expected: assertion.value,
      reason,
    });
  }

  return results;
}
