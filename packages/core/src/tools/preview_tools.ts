import { z } from "zod";
import net from "net";
import fs from "fs";
import path from "path";
import { registerTool } from "./registry.js";
import { getProjectWorkdir } from "../project_context.js";

const COMMON_PORTS = [5173, 3000, 4321, 8080, 8000, 4200, 3001, 5174, 1420];

function isPortOpen(port: number, host = "127.0.0.1", timeout = 300): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

function portHintFromPackage(workdir: string): number | null {
  try {
    const pkgPath = path.join(workdir, "package.json");
    if (!fs.existsSync(pkgPath)) return null;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const scripts: Record<string, string> = pkg.scripts ?? {};
    const text = Object.values(scripts).join(" ");
    const m = text.match(/(?:--port[= ]|:)(\d{4,5})\b/);
    if (m) return parseInt(m[1], 10);
  } catch {
    /* ignore */
  }
  return null;
}

export async function detectPreviewServer(workdir?: string): Promise<{ url: string; port: number } | null> {
  const ports: number[] = [];
  if (workdir) {
    const hint = portHintFromPackage(workdir);
    if (hint) ports.push(hint);
  }
  for (const p of COMMON_PORTS) if (!ports.includes(p)) ports.push(p);

  for (const port of ports) {
    if (await isPortOpen(port)) {
      return { url: `http://localhost:${port}`, port };
    }
  }
  return null;
}

// ── Shared Callback ─────────────────────────────────────────────────────────
let _onSetPreviewUrl: ((url: string) => void) | null = null;

export function onSetPreviewUrl(cb: (url: string) => void): void {
  _onSetPreviewUrl = cb;
}

export function triggerSetPreviewUrl(url: string): void {
  if (_onSetPreviewUrl) {
    _onSetPreviewUrl(url);
  }
}

// ── Process termination logic ───────────────────────────────────────────────
export async function killPortProcess(port: number): Promise<{ ok: boolean; message: string }> {
  try {
    const { execSync } = await import("child_process");
    const pidStr = execSync(`lsof -t -i :${port}`, { encoding: "utf8" }).trim();
    if (pidStr) {
      const pids = pidStr.split("\n").map(p => parseInt(p, 10)).filter(p => !isNaN(p));
      for (const pid of pids) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          // fallback to force kill
          process.kill(pid, "SIGKILL");
        }
      }
      return { ok: true, message: `Stopped process(es) on port ${port} (PID: ${pidStr}).` };
    }
    return { ok: false, message: `No process found on port ${port}.` };
  } catch (err: any) {
    return { ok: false, message: `Failed to terminate process: ${err.message}` };
  }
}

// ── GET PREVIEW URL ──────────────────────────────────────────────────────────
registerTool(
  "get_preview_url",
  "Detect and get the active local dev server URL and port if running.",
  z.object({}),
  async () => {
    const workdir = getProjectWorkdir();
    const result = await detectPreviewServer(workdir);
    if (result) {
      return `Preview is running at: ${result.url} (Port: ${result.port})`;
    }
    return `No active local preview server detected. Make sure you run your dev server (e.g. npm run dev).`;
  }
);

// ── SET PREVIEW URL ──────────────────────────────────────────────────────────
registerTool(
  "set_preview_url",
  "Navigate the desktop application's Live Preview panel to a specific URL or path (e.g. 'http://localhost:5173/dashboard' or just '/dashboard'). Use this to direct the user's attention to a newly created page or UI component.",
  z.object({
    url: z.string().describe("The target URL or relative path/route to navigate the preview to (e.g. '/profile')"),
  }),
  async ({ url }: { url: string }) => {
    let target = url.trim();
    if (!target) return "ERROR: URL cannot be empty.";

    // If it's a relative route (e.g. "/dashboard"), prepend the detected preview URL
    if (target.startsWith("/")) {
      const workdir = getProjectWorkdir();
      const detected = await detectPreviewServer(workdir);
      const base = detected ? detected.url : "http://localhost:5173";
      target = `${base}${target}`;
    } else if (!/^https?:\/\//.test(target)) {
      target = `http://${target}`;
    }

    triggerSetPreviewUrl(target);
    return `Successfully set preview navigation target to: ${target}`;
  }
);

// ── STOP PREVIEW ─────────────────────────────────────────────────────────────
registerTool(
  "stop_preview",
  "Stop the currently active local dev server by terminating the process listening on its port.",
  z.object({
    port: z.number().optional().describe("Port of the preview server to stop. If omitted, will detect the running port automatically."),
  }),
  async ({ port }: { port?: number }) => {
    let targetPort = port;
    if (!targetPort) {
      const workdir = getProjectWorkdir();
      const detected = await detectPreviewServer(workdir);
      if (!detected) return "No active preview server detected to stop.";
      targetPort = detected.port;
    }
    
    const res = await killPortProcess(targetPort);
    return res.ok ? `Success: ${res.message}` : `Error: ${res.message}`;
  }
);
