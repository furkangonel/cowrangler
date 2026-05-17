/**
 * Batch Runner — JSONL dosyasından paralel görev çalıştırma.
 *
 *
 *
 * Kullanım:
 *   cowrangler batch run --file tasks.jsonl [--concurrency 3] [--output results.jsonl]
 *
 * tasks.jsonl formatı (her satır bir JSON nesnesi):
 *   {"id": "task-1", "prompt": "Summarize this file", "model": "claude-sonnet-4-5"}
 *   {"id": "task-2", "prompt": "Write a test for X"}
 *   ...
 *
 * results.jsonl formatı:
 *   {"id": "task-1", "status": "success", "output": "...", "durationMs": 3200, "tokenCount": 450}
 *   {"id": "task-2", "status": "error", "error": "...", "durationMs": 500}
 *   ...
 */

import fs from "fs";
import readline from "readline";
import {
  getConfig,
  loadEnvironmentVariables,
  initEnvironment,
} from "../core/init.js";
import { getLogger } from "../core/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface BatchTask {
  id: string;
  prompt: string;
  /** Override model for this specific task */
  model?: string;
  /** Override max iterations */
  maxIterations?: number;
  /** Override system prompt */
  systemPrompt?: string;
  /** Max retry count for this task */
  maxRetries?: number;
}

export interface BatchResult {
  id: string;
  status: "success" | "error" | "skipped";
  output?: string;
  error?: string;
  tokenCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  toolCallCount?: number;
  durationMs: number;
  attempt: number;
}

export interface BatchRunOptions {
  file: string;
  outputFile?: string;
  concurrency?: number;
  maxRetries?: number;
  verbose?: boolean;
}

export interface BatchRunSummary {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  totalDurationMs: number;
  totalTokens: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// JSONL READER
// ─────────────────────────────────────────────────────────────────────────────

async function readTasksFromJsonl(filePath: string): Promise<BatchTask[]> {
  const tasks: BatchTask[] = [];
  const fileStream = fs.createReadStream(filePath, "utf-8");
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue; // boş satır veya yorum
    try {
      const obj = JSON.parse(trimmed);
      if (!obj.prompt) {
        console.warn(`  ⚠ Line ${lineNum}: missing 'prompt' field — skipped`);
        continue;
      }
      tasks.push({
        id: obj.id ?? `task-${lineNum}`,
        prompt: obj.prompt,
        model: obj.model,
        maxIterations: obj.maxIterations ?? obj.max_iterations,
        systemPrompt: obj.systemPrompt ?? obj.system_prompt,
        maxRetries: obj.maxRetries ?? obj.max_retries,
      });
    } catch {
      console.warn(`  ⚠ Line ${lineNum}: invalid JSON — skipped`);
    }
  }
  return tasks;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS BAR
// ─────────────────────────────────────────────────────────────────────────────

class ProgressBar {
  private total: number;
  private completed = 0;
  private succeeded = 0;
  private failed = 0;
  private startMs = Date.now();

  constructor(total: number) {
    this.total = total;
  }

  increment(status: "success" | "error"): void {
    this.completed++;
    if (status === "success") this.succeeded++;
    else this.failed++;
    this._render();
  }

  private _render(): void {
    const pct = Math.round((this.completed / this.total) * 100);
    const filled = Math.round(pct / 5);
    const bar = "█".repeat(filled) + "░".repeat(20 - filled);
    const elapsed = ((Date.now() - this.startMs) / 1000).toFixed(1);
    const remaining = this.total - this.completed;
    process.stdout.write(
      `\r  [${bar}] ${pct}%  ✓${this.succeeded} ✗${this.failed} ⏳${remaining}  ${elapsed}s  `,
    );
  }

  done(): void {
    process.stdout.write("\n");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK RUNNER
// ─────────────────────────────────────────────────────────────────────────────

async function runSingleTask(
  task: BatchTask,
  defaultModel: string,
  defaultSystemPrompt: string,
  defaultMaxIterations: number,
  maxRetries: number,
): Promise<BatchResult> {
  const startMs = Date.now();
  const log = getLogger();
  const taskMaxRetries = task.maxRetries ?? maxRetries;

  let lastError: string = "";

  for (let attempt = 1; attempt <= taskMaxRetries + 1; attempt++) {
    try {
      // Import Agent + LLM lazily — her task için taze instance
      const { Agent } = await import("../core/agent.js");
      const { LLM } = await import("../core/llm.js");

      const model = task.model ?? defaultModel;
      const systemPrompt = task.systemPrompt ?? defaultSystemPrompt;
      const maxIter = task.maxIterations ?? defaultMaxIterations;

      const llm = new LLM(model);
      const agent = new Agent(llm, systemPrompt, maxIter, undefined, "batch");

      const result = await agent.chat(task.prompt);

      log.info("agent", `Batch task ${task.id} completed`, {
        attempt,
        durationMs: Date.now() - startMs,
        tokenCount: result.tokenCount,
      });

      return {
        id: task.id,
        status: "success",
        output: result.text,
        tokenCount: result.tokenCount,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        toolCallCount: result.toolCallCount,
        durationMs: Date.now() - startMs,
        attempt,
      };
    } catch (err: any) {
      lastError = err?.message ?? String(err);
      log.warn(
        "agent",
        `Batch task ${task.id} failed (attempt ${attempt}/${taskMaxRetries + 1}): ${lastError}`,
      );

      if (attempt <= taskMaxRetries) {
        // Exponential backoff: 2s, 4s, 8s...
        await new Promise((r) =>
          setTimeout(r, 2000 * Math.pow(2, attempt - 1)),
        );
      }
    }
  }

  return {
    id: task.id,
    status: "error",
    error: lastError,
    durationMs: Date.now() - startMs,
    attempt: taskMaxRetries + 1,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BATCH RUNNER
// ─────────────────────────────────────────────────────────────────────────────

export async function runBatch(
  options: BatchRunOptions,
): Promise<BatchRunSummary> {
  initEnvironment();
  loadEnvironmentVariables();

  const config = getConfig();
  const log = getLogger();

  // ── Görevleri yükle ────────────────────────────────────────────────────────
  if (!fs.existsSync(options.file)) {
    throw new Error(`Task file not found: ${options.file}`);
  }

  const tasks = await readTasksFromJsonl(options.file);
  if (tasks.length === 0) {
    console.log("  No valid tasks found in file.");
    return {
      total: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      totalDurationMs: 0,
      totalTokens: 0,
    };
  }

  const concurrency = Math.max(1, Math.min(options.concurrency ?? 3, 10)); // 1–10 arası
  const maxRetries = options.maxRetries ?? 1;
  const outputFile =
    options.outputFile ?? options.file.replace(/\.jsonl$/, "-results.jsonl");

  console.log(
    `\n  Batch run: ${tasks.length} tasks, concurrency=${concurrency}, retries=${maxRetries}`,
  );
  console.log(`  Model: ${config.model}`);
  console.log(`  Output: ${outputFile}\n`);

  // ── Output dosyasını hazırla ────────────────────────────────────────────────
  const outputStream = fs.createWriteStream(outputFile, {
    flags: "w",
    encoding: "utf-8",
  });
  const writeResult = (result: BatchResult) => {
    outputStream.write(JSON.stringify(result) + "\n");
  };

  // ── Paralel çalıştırma ─────────────────────────────────────────────────────
  const startMs = Date.now();
  const progress = new ProgressBar(tasks.length);
  const results: BatchResult[] = [];

  // Semaphore: eşzamanlı aktif görev sayısını sınırlar
  let active = 0;
  let taskIdx = 0;

  await new Promise<void>((resolve) => {
    function scheduleNext() {
      while (active < concurrency && taskIdx < tasks.length) {
        const task = tasks[taskIdx++];
        active++;

        runSingleTask(
          task,
          config.model,
          config.system_prompt,
          config.max_iterations,
          maxRetries,
        ).then((result) => {
          results.push(result);
          writeResult(result);
          progress.increment(result.status === "success" ? "success" : "error");
          if (options.verbose) {
            const icon = result.status === "success" ? "✓" : "✗";
            console.log(
              `\n  ${icon} ${result.id} (${result.durationMs}ms${result.error ? ` — ${result.error.slice(0, 80)}` : ""})`,
            );
          }
          active--;
          log.info(
            "agent",
            `Batch task finished: ${task.id} status=${result.status}`,
          );
          scheduleNext();
          if (active === 0 && taskIdx >= tasks.length) resolve();
        });
      }
    }

    scheduleNext();
    // Edge case: dosya boşsa
    if (tasks.length === 0) resolve();
  });

  progress.done();
  outputStream.end();

  // ── Özet ───────────────────────────────────────────────────────────────────
  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "error").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const totalTokens = results.reduce((s, r) => s + (r.tokenCount ?? 0), 0);
  const totalDurationMs = Date.now() - startMs;

  const summary: BatchRunSummary = {
    total: tasks.length,
    succeeded,
    failed,
    skipped,
    totalDurationMs,
    totalTokens,
  };

  log.info(
    "agent",
    "Batch run completed",
    summary as unknown as Record<string, unknown>,
  );
  return summary;
}
