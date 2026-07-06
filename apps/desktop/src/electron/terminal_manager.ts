/**
 * TerminalManager — desktop sağ panelindeki gerçek pty terminalleri yönetir.
 *
 * Her terminal, o oturumun proje dizininde (cwd) çalışan bağımsız bir pty
 * sürecidir. Birden fazla terminal (sekme) aynı anda yaşayabilir; her biri
 * kendi id'siyle izlenir. Veri akışı main → renderer 'term:data' kanalıyla,
 * çıkış 'term:exit' ile bildirilir.
 *
 * node-pty native bir modül olduğundan electron-rebuild akışına dahildir
 * (bkz. package.json → scripts.desktop:rebuild).
 */
import os from "os";
import * as pty from "node-pty";

type DataCb = (data: string) => void;
type ExitCb = (code: number) => void;

export interface CreateTerminalOpts {
  id: string;
  cwd?: string | null;
  cols?: number;
  rows?: number;
  shell?: string;
}

function defaultShell(): string {
  if (process.platform === "win32") {
    return process.env.COMSPEC || "powershell.exe";
  }
  return process.env.SHELL || "/bin/bash";
}

export class TerminalManager {
  private terms = new Map<string, pty.IPty>();

  create(opts: CreateTerminalOpts, onData: DataCb, onExit: ExitCb): void {
    // Aynı id ile ikinci kez create çağrılırsa eskisini kapat.
    if (this.terms.has(opts.id)) this.kill(opts.id);

    const shell = opts.shell || defaultShell();
    const cwd =
      opts.cwd && opts.cwd.trim().length > 0 ? opts.cwd : os.homedir();

    const proc = pty.spawn(shell, [], {
      name: "xterm-color",
      cwd,
      env: process.env as Record<string, string>,
      cols: opts.cols && opts.cols > 0 ? opts.cols : 80,
      rows: opts.rows && opts.rows > 0 ? opts.rows : 24,
    });

    proc.onData((d) => {
      if (this.terms.get(opts.id) === proc) onData(d);
    });
    proc.onExit(({ exitCode }) => {
      if (this.terms.get(opts.id) === proc) {
        this.terms.delete(opts.id);
        onExit(exitCode);
      }
    });

    this.terms.set(opts.id, proc);
  }

  write(id: string, data: string): void {
    this.terms.get(id)?.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    try {
      if (cols > 0 && rows > 0) this.terms.get(id)?.resize(cols, rows);
    } catch {
      /* pty kapanmışsa yoksay */
    }
  }

  kill(id: string): void {
    const p = this.terms.get(id);
    if (p) {
      try {
        p.kill();
      } catch {
        /* zaten ölmüş olabilir */
      }
      this.terms.delete(id);
    }
  }

  has(id: string): boolean {
    return this.terms.has(id);
  }

  killAll(): void {
    for (const p of this.terms.values()) {
      try {
        p.kill();
      } catch {
        /* yoksay */
      }
    }
    this.terms.clear();
  }
}
