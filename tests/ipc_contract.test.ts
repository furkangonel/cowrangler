/**
 * IPC Contract Tests — main <-> renderer <-> preload arasında paylaşılan bir
 * tip/kontrat tanımı yok (bkz. audit roadmap 2.7); channel adları her tarafta
 * bağımsız string literal olarak yazılıyor. Bu testler statik olarak kaynak
 * dosyaları tarayıp üç yönlü drift'i yakalar:
 *
 *   1. Renderer'ın `ipcRenderer.invoke(...)` ile çağırdığı her channel, main
 *      process'te bir `ipcMain.handle(...)` karşılığına sahip olmalı — aksi
 *      halde renderer'daki çağrı sessizce reddedilir/asılı kalır.
 *   2. Aynı channel iki kez `ipcMain.handle(...)` ile kaydedilmemeli — Electron
 *      bunu runtime'da "Attempted to register a second handler" hatasıyla
 *      fırlatır, ama bu hatayı ancak o kod yolu tetiklenince görürsünüz.
 *   3. Renderer'ın dinlediği her push-event (`ipcRenderer.on(...)`) main
 *      process'te en az bir `*.send('channel', ...)` çağrısından besleniyor
 *      olmalı — aksi halde o dinleyici asla tetiklenmez (ölü kod ya da typo).
 *
 * Gerçek bir Electron çalışma zamanı gerektirmez — kaynak metnini tarar.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const ELECTRON_DIR = path.resolve(__dirname, "../apps/desktop/src/electron");
const IPC_DIR = path.join(ELECTRON_DIR, "ipc");
const PRELOAD_FILE = path.join(ELECTRON_DIR, "preload.ts");

function readAllTs(dir: string): string {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
    .join("\n");
}

function readAllMainProcessSource(): string {
  const ipcFiles = readAllTs(IPC_DIR);
  const rootFiles = fs
    .readdirSync(ELECTRON_DIR)
    .filter((f) => f.endsWith(".ts") && f !== "preload.ts")
    .map((f) => fs.readFileSync(path.join(ELECTRON_DIR, f), "utf8"))
    .join("\n");
  return ipcFiles + "\n" + rootFiles;
}

/** `fn(` ile başlayan çağrılardan ilk string literal argümanı çıkarır. */
function extractChannels(source: string, callPattern: RegExp): string[] {
  const channels: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(callPattern, "g");
  while ((m = re.exec(source)) !== null) {
    channels.push(m[1]);
  }
  return channels;
}

describe("IPC contract (main <-> renderer <-> preload)", () => {
  const mainSource = readAllMainProcessSource();
  const preloadSource = fs.readFileSync(PRELOAD_FILE, "utf8");

  const handledChannels = extractChannels(mainSource, /ipcMain\.handle\(\s*['"]([^'"]+)['"]/);
  const onChannels = extractChannels(mainSource, /ipcMain\.on\(\s*['"]([^'"]+)['"]/);
  const registeredChannels = new Set([...handledChannels, ...onChannels]);

  const invokedChannels = extractChannels(preloadSource, /ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/);
  const sentChannels = extractChannels(preloadSource, /ipcRenderer\.send\(\s*['"]([^'"]+)['"]/);
  const listenedChannels = extractChannels(preloadSource, /ipcRenderer\.on\(\s*['"]([^'"]+)['"]/);

  const pushedChannels = new Set(extractChannels(mainSource, /\.send\(\s*['"]([^'"]+)['"]/));

  it("finds a non-trivial number of registered/invoked channels (sanity check that parsing works)", () => {
    expect(handledChannels.length).toBeGreaterThan(20);
    expect(invokedChannels.length).toBeGreaterThan(20);
  });

  it("every ipcRenderer.invoke() channel has a matching ipcMain.handle() registration", () => {
    const missing = [...new Set(invokedChannels)].filter((ch) => !registeredChannels.has(ch));
    expect(missing).toEqual([]);
  });

  it("every ipcRenderer.send() channel has a matching ipcMain.on() registration", () => {
    const missing = [...new Set(sentChannels)].filter((ch) => !registeredChannels.has(ch));
    expect(missing).toEqual([]);
  });

  it("no channel is registered with ipcMain.handle() more than once", () => {
    const seen = new Map<string, number>();
    for (const ch of handledChannels) seen.set(ch, (seen.get(ch) ?? 0) + 1);
    const duplicates = [...seen.entries()].filter(([, count]) => count > 1).map(([ch]) => ch);
    expect(duplicates).toEqual([]);
  });

  it("every ipcRenderer.on() push-event listener is fed by a main-process .send() call", () => {
    const missing = [...new Set(listenedChannels)].filter((ch) => !pushedChannels.has(ch));
    expect(missing).toEqual([]);
  });
});
