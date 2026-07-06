/**
 * Cron Scheduler — zamanlanmış görev çalıştırıcısı.
 *
 *
 * Güvenlik değişmezleri:
 * - 3 dakika sert interrupt — kontrolden çıkan agent döngüleri engellenir
 * - Dosya kilidi — aynı job'ı iki process aynı anda çalıştıramaz
 * - skip_memory=true ile çalışır — cron'un kendi bağlamı olmamalı
 * - Yakalama penceresi: period/2, 2s-120s arasında sıkıştırılmış
 */

import fs from "fs";
import path from "path";
import { DIRS } from "@cowrangler/core/init.js";
import { getCronJobStore, CronJob } from "./jobs.js";

const TICK_INTERVAL_MS = 60_000; // Her 60 saniyede kontrol
const MAX_JOB_DURATION_MS = 180_000; // 3 dakika sert interrupt
const LOCK_FILE = path.join(DIRS.global.base, "cron", ".tick.lock");

// ─────────────────────────────────────────────────────────────────────────────
// FILE LOCK — çift tetiklemeyi önle
// ─────────────────────────────────────────────────────────────────────────────

function acquireLock(): boolean {
  try {
    fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
    // O_EXCL flag → dosya zaten varsa hata fırlat
    const fd = fs.openSync(LOCK_FILE, "wx");
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
    return true;
  } catch {
    // Lock dosyası mevcut — başka bir process çalışıyor
    return false;
  }
}

function releaseLock(): void {
  try {
    fs.unlinkSync(LOCK_FILE);
  } catch {
    /* sessizce */
  }
}

function isLockStale(): boolean {
  try {
    const content = fs.readFileSync(LOCK_FILE, "utf-8");
    const pid = parseInt(content.trim());
    if (isNaN(pid)) return true;

    // Process hala çalışıyor mu?
    try {
      process.kill(pid, 0); // sinyal göndermez, sadece kontrol eder
      return false; // Hala çalışıyor
    } catch {
      return true; // Process yok → stale lock
    }
  } catch {
    return true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULER
// ─────────────────────────────────────────────────────────────────────────────

type JobRunner = (job: CronJob) => Promise<string>;

export class CronScheduler {
  private running = false;
  private tickTimer: NodeJS.Timeout | null = null;
  private jobRunner: JobRunner;

  constructor(jobRunner: JobRunner) {
    this.jobRunner = jobRunner;
  }

  start(): void {
    if (this.running) return;

    if (!acquireLock()) {
      if (isLockStale()) {
        releaseLock();
        if (!acquireLock()) {
          throw new Error("Could not acquire cron scheduler lock");
        }
      } else {
        throw new Error("Cron scheduler is already running (lock file exists)");
      }
    }

    this.running = true;
    this._scheduleTick();

    // Process sonlandığında lock'u bırak
    process.on("exit", () => releaseLock());
    process.on("SIGINT", () => {
      releaseLock();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      releaseLock();
      process.exit(0);
    });

    console.log("[cron] Scheduler started, checking every 60s");
  }

  stop(): void {
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
    this.running = false;
    releaseLock();
    console.log("[cron] Scheduler stopped");
  }

  private _scheduleTick(): void {
    if (!this.running) return;
    this.tickTimer = setTimeout(() => this._tick(), TICK_INTERVAL_MS);
  }

  private async _tick(): Promise<void> {
    if (!this.running) return;

    try {
      await this._processDueJobs();
    } catch (err) {
      console.error("[cron] Tick error:", err);
    }

    this._scheduleTick();
  }

  private async _processDueJobs(): Promise<void> {
    const store = getCronJobStore();
    const dueJobs = store.claimDue();

    if (dueJobs.length === 0) return;

    console.log(`[cron] ${dueJobs.length} job(s) due`);

    // Sıralı çalıştır — paralel değil (resource koruması)
    for (const job of dueJobs) {
      await this._runJob(job);
    }
  }

  private async _runJob(job: CronJob): Promise<void> {
    const store = getCronJobStore();
    console.log(`[cron] Running job: ${job.name} (${job.id})`);

    let timeoutHandle: NodeJS.Timeout | null = null;
    let timedOut = false;

    try {
      // Sert interrupt zamanlayıcısı — 3 dakika
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          reject(
            new Error(
              `Job '${job.name}' exceeded ${MAX_JOB_DURATION_MS / 1000}s timeout`,
            ),
          );
        }, MAX_JOB_DURATION_MS);
      });

      const result = await Promise.race([this.jobRunner(job), timeoutPromise]);

      if (timeoutHandle) clearTimeout(timeoutHandle);
      store.markComplete(job.id, result);
      console.log(`[cron] Job '${job.name}' completed`);
    } catch (err: any) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      const errorMsg = timedOut
        ? `TIMEOUT: ${err.message}`
        : (err.message ?? String(err));

      store.markFailed(job.id, errorMsg);
      console.error(`[cron] Job '${job.name}' failed:`, errorMsg);
    }
  }

  /** Manuel tetikleme */
  async runJobById(jobId: string): Promise<string> {
    const store = getCronJobStore();
    const job = store.get(jobId);
    if (!job) throw new Error(`Job '${jobId}' not found`);

    return this.jobRunner(job);
  }

  get isRunning(): boolean {
    return this.running;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DAEMON RUNNER — cowrangler cron daemon komutuyla başlatılır
// ─────────────────────────────────────────────────────────────────────────────

export async function startCronDaemon(jobRunner: JobRunner): Promise<void> {
  const scheduler = new CronScheduler(jobRunner);
  scheduler.start();

  // Daemon olarak çalış
  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      scheduler.stop();
      resolve();
    });
    process.on("SIGTERM", () => {
      scheduler.stop();
      resolve();
    });
  });
}
