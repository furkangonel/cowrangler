/**
 * Kanban Web Server — Express + SSE tabanlı canlı kanban panosu.
 *
 * Endpoint'ler:
 *   GET  /              → board.html (self-contained UI)
 *   GET  /api/tasks     → tüm görevler JSON
 *   GET  /api/tasks/:id → tekil görev + yorumlar + bağımlılıklar
 *   POST /api/tasks     → yeni görev oluştur
 *   PATCH /api/tasks/:id/status  → durum güncelle
 *   POST /api/tasks/:id/comment  → yorum ekle
 *   GET  /api/stats     → board istatistikleri
 *   GET  /api/events    → SSE canlı güncellemeler (task değişiklikleri)
 *
 * Kullanım:
 *   cowrangler kanban board          → sunucuyu başlat + tarayıcıyı aç
 *   cowrangler kanban board --no-open → sadece sunucu
 */

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getKanbanDB } from "./db.js";
import {
  initEnvironment,
  loadEnvironmentVariables,
  LOCAL_DIR,
} from "../core/init.js";
import { getLogger } from "../core/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Assets dizini: dist/assets/ (build sonrası) veya repo root assets/ (geliştirme)
const ASSETS_DIRS = [
  path.join(__dirname, "../assets"),      // dist/assets/
  path.join(__dirname, "../../assets"),   // geliştirme: src/../assets/
];

function resolveAsset(filename: string): string | null {
  for (const dir of ASSETS_DIRS) {
    const p = path.join(dir, filename);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SSE CLIENT POOL
// ─────────────────────────────────────────────────────────────────────────────

const sseClients = new Set<http.ServerResponse>();

function broadcastSSE(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST ROUTER (no external deps — pure Node http)
// ─────────────────────────────────────────────────────────────────────────────

function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function html(res: http.ServerResponse, content: string): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(content);
}

// ─────────────────────────────────────────────────────────────────────────────
// KANBAN WEB SERVER
// ─────────────────────────────────────────────────────────────────────────────

export class KanbanWebServer {
  private server: http.Server;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastEventId = 0;
  private boardHtml: string;

  constructor(private readonly port: number = 4242) {
    // Board HTML'i yükle (dist veya src'den)
    const htmlPath = this._resolveHtmlPath();
    this.boardHtml = fs.existsSync(htmlPath)
      ? fs.readFileSync(htmlPath, "utf-8")
      : this._fallbackHtml();

    this.server = http.createServer(this._handler.bind(this));
  }

  private _resolveHtmlPath(): string {
    // dist klasöründeyken
    const distPath = path.join(__dirname, "board.html");
    if (fs.existsSync(distPath)) return distPath;
    // src klasöründeyken
    return path.join(__dirname, "board.html");
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, "127.0.0.1", () => {
        getLogger().info("kanban", `Web server listening on http://127.0.0.1:${this.port}`);
        // SSE için DB polling
        this._startPolling();
        resolve();
      });
    });
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    for (const client of sseClients) {
      try {
        client.end();
      } catch {}
    }
    sseClients.clear();
    this.server.close();
  }

  // ── DB Event Polling → SSE broadcast ────────────────────────────────────────

  private _startPolling(): void {
    this.pollTimer = setInterval(() => {
      try {
        const db = getKanbanDB();
        const events = db.tailEvents({ sinceId: this.lastEventId, limit: 50 });
        for (const ev of events) {
          if (ev.id > this.lastEventId) {
            this.lastEventId = ev.id;
          }
          broadcastSSE("kanban", {
            taskId: ev.task_id,
            type: ev.event_type,
            payload: JSON.parse(ev.payload),
            timestamp: ev.timestamp,
          });
        }
      } catch {
        // DB okuma hatası — sessizce devam
      }
    }, 1500); // 1.5s polling
  }

  // ── HTTP Handler ─────────────────────────────────────────────────────────────

  private async _handler(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${this.port}`);
    const pathname = url.pathname;
    const method = req.method ?? "GET";

    // CORS preflight
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    try {
      // ── Board UI
      if (method === "GET" && pathname === "/") {
        html(res, this.boardHtml);
        return;
      }

      // ── Static assets (/assets/kanban_ui_icon.png vb.)
      if (method === "GET" && pathname.startsWith("/assets/")) {
        const filename = path.basename(pathname);
        const filePath = resolveAsset(filename);
        if (!filePath) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const ext = path.extname(filename).toLowerCase();
        const mime: Record<string, string> = {
          ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
          ".svg": "image/svg+xml", ".ico": "image/x-icon",
        };
        res.writeHead(200, {
          "Content-Type": mime[ext] ?? "application/octet-stream",
          "Cache-Control": "public, max-age=86400",
        });
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      // ── SSE
      if (method === "GET" && pathname === "/api/events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        });
        res.write(": connected\n\n");
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
        return;
      }

      const db = getKanbanDB();

      // ── GET /api/tasks
      if (method === "GET" && pathname === "/api/tasks") {
        const status = url.searchParams.get("status");
        const assignedTo = url.searchParams.get("assigned_to") ?? undefined;
        const tag = url.searchParams.get("tag") ?? undefined;

        const tasks = db.list({
          status: (status as any) ?? undefined,
          assignedTo,
          tag,
        });
        json(res, 200, tasks);
        return;
      }

      // ── GET /api/tasks/:id
      const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
      if (method === "GET" && taskMatch) {
        const task = db.get(taskMatch[1]);
        if (!task) {
          json(res, 404, { error: "Task not found" });
          return;
        }
        const comments = db.getComments(task.id);
        const blockers = db.getBlockers(task.id);
        const blocked = db.getBlocked(task.id);
        json(res, 200, { ...task, comments, blockers, blocked });
        return;
      }

      // ── POST /api/tasks
      if (method === "POST" && pathname === "/api/tasks") {
        const body = await parseBody(req);
        if (!body.title) {
          json(res, 400, { error: "title is required" });
          return;
        }
        const task = db.create({
          title: body.title,
          description: body.description,
          priority: body.priority,
          tags: body.tags,
          assignTo: body.assigned_to,
        });
        json(res, 201, task);
        return;
      }

      // ── PATCH /api/tasks/:id  (full field edit)
      if (method === "PATCH" && taskMatch) {
        const body = await parseBody(req);
        const task = db.get(taskMatch[1]);
        if (!task) {
          json(res, 404, { error: "Task not found" });
          return;
        }
        db.update(task.id, {
          title: body.title,
          description: body.description,
          priority: body.priority,
          tags: Array.isArray(body.tags) ? body.tags : undefined,
          assigned_to: body.assigned_to,
        });
        json(res, 200, db.get(task.id));
        return;
      }

      // ── PATCH /api/tasks/:id/status
      const statusMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/status$/);
      if (method === "PATCH" && statusMatch) {
        const body = await parseBody(req);
        const task = db.get(statusMatch[1]);
        if (!task) {
          json(res, 404, { error: "Task not found" });
          return;
        }
        switch (body.status) {
          case "pending":   db.unblock(task.id); break;
          case "running":   db.markRunning(task.id); break;
          case "done":      db.markDone(task.id, body.output ?? "Manual completion"); break;
          case "blocked":   db.block(task.id, body.reason); break;
          default:
            json(res, 400, { error: `Invalid status: ${body.status}` });
            return;
        }
        json(res, 200, db.get(task.id));
        return;
      }

      // ── POST /api/tasks/:id/comment
      const commentMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/comment$/);
      if (method === "POST" && commentMatch) {
        const body = await parseBody(req);
        if (!body.content) {
          json(res, 400, { error: "content is required" });
          return;
        }
        db.addComment(commentMatch[1], body.author ?? "user", body.content);
        json(res, 201, { ok: true });
        return;
      }

      // ── GET /api/stats
      if (method === "GET" && pathname === "/api/stats") {
        json(res, 200, db.stats());
        return;
      }

      json(res, 404, { error: "Not found" });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
  }

  private _fallbackHtml(): string {
    return `<!DOCTYPE html><html><body><h1>board.html not found</h1>
    <p>Run <code>npm run build</code> to generate the board UI.</p></body></html>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

export async function startKanbanBoard(opts: {
  port?: number;
  openBrowser?: boolean;
}): Promise<void> {
  initEnvironment();
  loadEnvironmentVariables();

  const port = opts.port ?? 4242;
  const server = new KanbanWebServer(port);
  await server.start();

  const url = `http://127.0.0.1:${port}`;
  console.log(`\n  Kanban board: ${url}\n`);

  if (opts.openBrowser !== false) {
    const { execSync } = await import("child_process");
    try {
      const platform = process.platform;
      if (platform === "darwin") {
        execSync(`open "${url}"`, { timeout: 3000 });
      } else if (platform === "linux") {
        execSync(`xdg-open "${url}"`, { timeout: 3000 });
      } else if (platform === "win32") {
        execSync(`start "" "${url}"`, { timeout: 3000 });
      }
    } catch {
      // Tarayıcı açılamazsa URL yazdırıldı zaten
    }
  }

  // Graceful shutdown
  const shutdown = (): void => {
    console.log("\nShutting down kanban board server...");
    server.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep alive
  await new Promise<void>(() => {});
}
