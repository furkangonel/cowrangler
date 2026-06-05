/**
 * Kanban Dispatcher — Görevleri subagent'lara dağıtan döngü.
 *
 * İki mod:
 * - Manuel:  `cowrangler kanban dispatch` → foreground, Ctrl+C ile dur
 * - Daemon:  `cowrangler kanban daemon start` → arka plan, PID dosyası ile yönetim
 *
 * Döngü mantığı:
 *   1. reclaim() — timeout'lu görevleri serbest bırak
 *   2. claim()   — sıradaki pending görevi al (atomik)
 *   3. spawn_subagent ile çalıştır
 *   4. markDone / markFailed
 *   5. TICK_MS bekle → tekrar
 *
 * Dayanıklılık:
 * - MAX_CONCURRENT worker aynı anda çalışır
 * - Hata → markFailed → fail_count artar → 5. hatada auto-block
 * - Dispatcher crash → reclaim ile görevler geri alınır
 */

import { getKanbanDB, KanbanTask } from "./db.js";
import {
  getConfig,
  loadEnvironmentVariables,
  initEnvironment,
  LOCAL_DIR,
} from "../core/init.js";
import { Agent } from "../core/agent.js";
import { LLM } from "../core/llm.js";
import { getLogger } from "../core/logger.js";
import path from "path";
import fs from "fs";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const TICK_MS = 10_000; // Her 10 saniyede bir kontrol
const MAX_CONCURRENT = 3;
const DAEMON_PID_FILE = path.join(LOCAL_DIR, "kanban-daemon.pid");

// ─────────────────────────────────────────────────────────────────────────────
// DISPATCHER
// ─────────────────────────────────────────────────────────────────────────────

export class KanbanDispatcher {
  private running = false;
  private activeWorkers = 0;
  private workerPromises: Set<Promise<void>> = new Set();
  private tickTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly profileName: string = "dispatcher",
    private readonly board?: string,
    private readonly maxConcurrent: number = MAX_CONCURRENT,
  ) {}

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    this.running = true;
    const log = getLogger();
    log.info("kanban", `Dispatcher started — profile: ${this.profileName}, max_concurrent: ${this.maxConcurrent}`);

    // İlk tick hemen çalışsın
    await this._tick();

    // Periyodik döngü
    const loop = async (): Promise<void> => {
      while (this.running) {
        await new Promise((resolve) => {
          this.tickTimer = setTimeout(resolve, TICK_MS);
        });
        if (this.running) {
          await this._tick();
        }
      }
    };

    await loop();
  }

  stop(): void {
    this.running = false;
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
    getLogger().info("kanban", "Dispatcher stopping — waiting for active workers...");
  }

  /** Tüm aktif worker'ların bitmesini bekle */
  async drain(): Promise<void> {
    await Promise.allSettled([...this.workerPromises]);
  }

  // ── Tick ────────────────────────────────────────────────────────────────────

  private async _tick(): Promise<void> {
    const db = getKanbanDB();
    const log = getLogger();

    // Timeout'lu görevleri serbest bırak
    const reclaimed = db.reclaim(this.board);
    if (reclaimed > 0) {
      log.info("kanban", `Reclaimed ${reclaimed} stale task(s)`);
    }

    // Kapasite doluysa bekle
    if (this.activeWorkers >= this.maxConcurrent) return;

    // Yeni görev al
    const slotsAvailable = this.maxConcurrent - this.activeWorkers;
    for (let i = 0; i < slotsAvailable; i++) {
      const task = db.claim(this.profileName, this.board);
      if (!task) break; // Bekleyen görev yok

      log.info("kanban", `Claimed task: [${task.id.slice(0, 8)}] ${task.title}`);

      const workerPromise = this._runTask(task).finally(() => {
        this.activeWorkers--;
        this.workerPromises.delete(workerPromise);
      });

      this.activeWorkers++;
      this.workerPromises.add(workerPromise);
    }
  }

  // ── Worker ───────────────────────────────────────────────────────────────────

  private async _runTask(task: KanbanTask): Promise<void> {
    const db = getKanbanDB();
    const log = getLogger();

    db.markRunning(task.id);
    log.info("kanban", `Running task: [${task.id.slice(0, 8)}] ${task.title}`);

    try {
      const config = getConfig();
      const llm = new LLM(config.model);

      const workerSystemPrompt = `You are a focused task execution agent working on a single kanban task.
Complete the task efficiently and return a clear summary of what was accomplished.
If you cannot complete the task, explain exactly why and what is blocking you.`;

      const subAgent = new Agent(llm, workerSystemPrompt, 20, undefined, "kanban");

      const taskPrompt = [
        `KANBAN TASK [${task.id.slice(0, 8)}]`,
        `Title: ${task.title}`,
        task.description ? `Description: ${task.description}` : "",
        task.tags.length > 0 ? `Tags: ${task.tags.join(", ")}` : "",
        ``,
        `Complete this task and return a concise summary of results.`,
      ]
        .filter(Boolean)
        .join("\n");

      const { text: output } = await subAgent.chat(taskPrompt);

      db.markDone(task.id, output);
      db.addComment(task.id, this.profileName, `✓ Completed automatically.\n\n${output.slice(0, 500)}`);
      log.info("kanban", `Task done: [${task.id.slice(0, 8)}] ${task.title}`);
    } catch (err: any) {
      const errorMsg = err?.message ?? String(err);
      db.markFailed(task.id, errorMsg);
      db.addComment(
        task.id,
        this.profileName,
        `✗ Failed: ${errorMsg.slice(0, 300)}`,
      );
      log.error("kanban", `Task failed: [${task.id.slice(0, 8)}] ${task.title} — ${errorMsg}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DAEMON YÖNETIMI
// ─────────────────────────────────────────────────────────────────────────────

export function isDaemonRunning(): boolean {
  if (!fs.existsSync(DAEMON_PID_FILE)) return false;
  try {
    const pid = parseInt(fs.readFileSync(DAEMON_PID_FILE, "utf-8").trim(), 10);
    if (isNaN(pid)) return false;
    // Sinyal 0 ile process varlığını kontrol et
    process.kill(pid, 0);
    return true;
  } catch {
    // Process yok — eski PID dosyasını temizle
    try {
      fs.unlinkSync(DAEMON_PID_FILE);
    } catch {}
    return false;
  }
}

export function writeDaemonPid(): void {
  fs.mkdirSync(path.dirname(DAEMON_PID_FILE), { recursive: true });
  fs.writeFileSync(DAEMON_PID_FILE, String(process.pid), "utf-8");
}

export function stopDaemon(): boolean {
  if (!fs.existsSync(DAEMON_PID_FILE)) return false;
  try {
    const pid = parseInt(fs.readFileSync(DAEMON_PID_FILE, "utf-8").trim(), 10);
    if (isNaN(pid)) return false;
    process.kill(pid, "SIGTERM");
    fs.unlinkSync(DAEMON_PID_FILE);
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Foreground dispatch — cowrangler kanban dispatch
 * Ctrl+C ile graceful shutdown.
 */
export async function runDispatcherForeground(opts: {
  profile?: string;
  board?: string;
  maxConcurrent?: number;
}): Promise<void> {
  initEnvironment();
  loadEnvironmentVariables();

  const dispatcher = new KanbanDispatcher(
    opts.profile ?? "cowrangler",
    opts.board,
    opts.maxConcurrent ?? MAX_CONCURRENT,
  );

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.log("\nShutting down dispatcher...");
    dispatcher.stop();
    await dispatcher.drain();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log(`Kanban dispatcher running (Ctrl+C to stop)...`);
  await dispatcher.start();
}

/**
 * Daemon mode — cowrangler kanban daemon start
 * Arka planda çalışır, PID dosyası yazar.
 */
export async function runDispatcherDaemon(opts: {
  profile?: string;
  board?: string;
  maxConcurrent?: number;
}): Promise<void> {
  initEnvironment();
  loadEnvironmentVariables();

  if (isDaemonRunning()) {
    console.error("Daemon is already running.");
    process.exit(1);
  }

  // Detach: stdin/stdout kapat, yeni process group oluştur
  try {
    process.stdout.write(""); // flush
    if (process.stdout.isTTY) process.stdout.uncork?.();
  } catch {}

  writeDaemonPid();

  // Kapatılma sinyalinde PID temizle
  const cleanup = (): void => {
    try {
      fs.unlinkSync(DAEMON_PID_FILE);
    } catch {}
  };
  process.on("exit", cleanup);
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  const dispatcher = new KanbanDispatcher(
    opts.profile ?? "daemon",
    opts.board,
    opts.maxConcurrent ?? MAX_CONCURRENT,
  );

  await dispatcher.start();
}
