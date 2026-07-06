/**
 * Preview IPC — Code sağ panelindeki canlı önizleme için yerel dev-server
 * tespiti (WP-5).
 *
 *   preview:detect(workdir?) → { url, port } | null
 *
 * Yaygın dev portlarını (Vite/CRA/Astro/Next…) sırayla yoklar; ilk açık portu
 * döner. Ayrıca workdir/package.json script'lerinden ipucu almaya çalışır
 * (dev script'i bir port belirtiyorsa onu öne alır).
 */
import type { IpcMain } from "electron";
import net from "net";
import fs from "fs";
import path from "path";

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

/** package.json dev script'inden port ipucu çıkar (ör. "--port 5199"). */
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
    /* yoksay */
  }
  return null;
}

export function registerPreviewIPC(ipcMain: IpcMain): void {
  ipcMain.handle("preview:detect", async (_e, workdir?: string) => {
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
  });

  // Belirli bir URL/port canlı mı? (manuel giriş doğrulaması için)
  ipcMain.handle("preview:check", async (_e, port: number) => {
    return { open: await isPortOpen(port) };
  });
}
