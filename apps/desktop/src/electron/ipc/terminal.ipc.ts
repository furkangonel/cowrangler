/**
 * Terminal IPC — sağ panel pty terminallerinin main-taraf köprüsü.
 *
 * Kanallar:
 *   term:create   (opts)            → pty başlat
 *   term:input    (id, data)        → pty'ye yaz (klavye)
 *   term:resize   (id, cols, rows)  → pty boyutu
 *   term:kill     (id)              → pty kapat
 * Olaylar (main → renderer):
 *   term:data  { id, data }
 *   term:exit  { id, code }
 */
import type { BrowserWindow, IpcMain } from "electron";
import { TerminalManager, type CreateTerminalOpts } from "../terminal_manager.js";

let manager: TerminalManager | null = null;

export function getTerminalManager(): TerminalManager {
  if (!manager) manager = new TerminalManager();
  return manager;
}

export function registerTerminalIPC(
  ipcMain: IpcMain,
  getWindow: () => BrowserWindow | null,
): void {
  const mgr = getTerminalManager();

  ipcMain.handle("term:create", (_evt, opts: CreateTerminalOpts) => {
    mgr.create(
      opts,
      (data) => getWindow()?.webContents.send("term:data", { id: opts.id, data }),
      (code) => getWindow()?.webContents.send("term:exit", { id: opts.id, code }),
    );
    return { ok: true };
  });

  ipcMain.handle("term:input", (_evt, id: string, data: string) => {
    mgr.write(id, data);
    return { ok: true };
  });

  ipcMain.handle("term:resize", (_evt, id: string, cols: number, rows: number) => {
    mgr.resize(id, cols, rows);
    return { ok: true };
  });

  ipcMain.handle("term:kill", (_evt, id: string) => {
    mgr.kill(id);
    return { ok: true };
  });
}
