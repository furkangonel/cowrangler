/**
 * computer_use tool — macOS masaüstü kontrolü (arka planda)
 *
 * cua-driver'ın MCP arayüzü üzerinden çalışır. Kullanıcının imlecini,
 * klavye odağını veya Space'ini ÇALMAZ — arka plan co-work modeli.
 *
 * Sadece macOS destekler; cua-driver binary gerektirir.
 *
 * Kurulum:
 *   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh)"
 */

import { z } from "zod";
import { execSync } from "child_process";
import { registerTool } from "./registry.js";
import os from "os";
import path from "path";
import fs from "fs";

// ─────────────────────────────────────────────────────────────────────────────
// Platform guard — macOS only
// ─────────────────────────────────────────────────────────────────────────────

const IS_MACOS = process.platform === "darwin";

function cuaDriverAvailable(): boolean {
  if (!IS_MACOS) return false;
  try {
    const cmd = process.env.COWRANGLER_CUA_DRIVER_CMD ?? "cua-driver";
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP client — @modelcontextprotocol/sdk ile cua-driver mcp bağlantısı
// ─────────────────────────────────────────────────────────────────────────────

interface McpToolResult {
  data: any;
  images: string[];
  structuredContent: Record<string, any> | null;
  isError: boolean;
}

class CuaDriverClient {
  private client: any = null;
  private transport: any = null;
  private connected = false;

  async ensureConnected(): Promise<void> {
    if (this.connected && this.client) return;
    // Dinamik import — @modelcontextprotocol/sdk her zaman yüklü olmayabilir
    const { Client } = await import(
      "@modelcontextprotocol/sdk/client/index.js" as any
    );
    const { StdioClientTransport } = await import(
      "@modelcontextprotocol/sdk/client/stdio.js" as any
    );

    const cmd = process.env.COWRANGLER_CUA_DRIVER_CMD ?? "cua-driver";
    this.transport = new StdioClientTransport({ command: cmd, args: ["mcp"] });
    this.client = new Client({ name: "co-wrangler", version: "1.0.0" }, {});
    await this.client.connect(this.transport);
    this.connected = true;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    await this.ensureConnected();
    const result = await this.client.callTool({ name, arguments: args });
    return extractToolResult(result);
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      try {
        await this.transport.close();
      } catch {
        // ignore
      }
    }
    this.connected = false;
    this.client = null;
    this.transport = null;
  }
}

function extractToolResult(mcpResult: any): McpToolResult {
  const images: string[] = [];
  const isError = Boolean(mcpResult?.isError);
  const structured = mcpResult?.structuredContent ?? null;
  const textChunks: string[] = [];

  for (const part of mcpResult?.content ?? []) {
    if (part?.type === "text" && part.text) {
      textChunks.push(part.text);
    } else if (part?.type === "image" && part.data) {
      images.push(part.data);
    }
  }

  let data: any = null;
  if (textChunks.length > 0) {
    const joined = textChunks.join("\n");
    try {
      data =
        joined.trimStart().startsWith("{") || joined.trimStart().startsWith("[")
          ? JSON.parse(joined)
          : joined;
    } catch {
      data = joined;
    }
  }

  return { data, images, structuredContent: structured, isError };
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton backend state — pencere bağlamını tutar
// ─────────────────────────────────────────────────────────────────────────────

const _client = new CuaDriverClient();
let _activePid: number | null = null;
let _activeWindowId: number | null = null;

// Session-scoped otomatik onay (gelecekte CLI approval callback ile genişletilebilir)
let _sessionAutoApprove = false;
const _alwaysAllow = new Set<string>();

// ─────────────────────────────────────────────────────────────────────────────
// Güvenlik — engellenen tuş kombinasyonları ve type kalıpları
// ─────────────────────────────────────────────────────────────────────────────

const SAFE_ACTIONS = new Set(["capture", "wait", "list_apps"]);
const DESTRUCTIVE_ACTIONS = new Set([
  "click",
  "double_click",
  "right_click",
  "middle_click",
  "drag",
  "scroll",
  "type",
  "key",
  "set_value",
  "focus_app",
]);

const BLOCKED_KEY_COMBOS: Set<string>[] = [
  new Set(["cmd", "shift", "backspace"]), // çöp kutusunu boşalt
  new Set(["cmd", "option", "backspace"]), // zorla sil
  new Set(["cmd", "ctrl", "q"]), // ekranı kilitle
  new Set(["cmd", "shift", "q"]), // çıkış yap
  new Set(["cmd", "option", "shift", "q"]), // zorla çıkış yap
];

const KEY_ALIASES: Record<string, string> = {
  command: "cmd",
  control: "ctrl",
  alt: "option",
  "⌘": "cmd",
  "⌥": "option",
};

const BLOCKED_TYPE_PATTERNS = [
  /curl\s+[^|]*\|\s*bash/i,
  /curl\s+[^|]*\|\s*sh/i,
  /wget\s+[^|]*\|\s*bash/i,
  /\bsudo\s+rm\s+-[rf]/i,
  /\brm\s+-rf\s+\/\s*$/i,
  /:\s*\(\)\s*\{\s*:\|:\s*&\s*\}/i, // fork bomb
];

function canonKeyCombo(keys: string): Set<string> {
  return new Set(
    keys.split(/\s*\+\s*/).map((p) => {
      const n = p.trim().toLowerCase();
      return KEY_ALIASES[n] ?? n;
    }),
  );
}

function isBlockedKeyCombo(keys: string): string | null {
  const combo = canonKeyCombo(keys);
  for (const blocked of BLOCKED_KEY_COMBOS) {
    if ([...blocked].every((k) => combo.has(k))) {
      return [...blocked].sort().join("+");
    }
  }
  return null;
}

function isBlockedType(text: string): string | null {
  for (const pat of BLOCKED_TYPE_PATTERNS) {
    if (pat.test(text)) return pat.toString();
  }
  return null;
}

function parseKeyCombo(keys: string): {
  key: string | null;
  modifiers: string[];
} {
  const MODIFIER_NAMES = new Set([
    "cmd",
    "command",
    "shift",
    "option",
    "alt",
    "ctrl",
    "control",
    "fn",
  ]);
  const parts = keys
    .split(/[+\-]/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  const modifiers: string[] = [];
  let key: string | null = null;
  for (const part of parts) {
    const normalized = KEY_ALIASES[part] ?? part;
    if (MODIFIER_NAMES.has(normalized)) {
      modifiers.push(normalized);
    } else {
      key = part;
    }
  }
  return { key, modifiers };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pencere parser yardımcıları
// ─────────────────────────────────────────────────────────────────────────────

interface WindowInfo {
  app_name: string;
  pid: number;
  window_id: number;
  z_index: number;
  off_screen: boolean;
}

interface UIElement {
  index: number;
  role: string;
  label: string;
}

const WINDOW_LINE_RE =
  /^-\s+(.+?)\s+\(pid\s+(\d+)\)\s+.*\[window_id:\s+(\d+)\]/gm;
const ELEMENT_LINE_RE = /^\s*-\s+\[(\d+)\]\s+(\w+)(?:\s+"([^"]*)")?/gm;

function parseWindowsFromText(text: string): WindowInfo[] {
  const windows: WindowInfo[] = [];
  let m: RegExpExecArray | null;
  WINDOW_LINE_RE.lastIndex = 0;
  while ((m = WINDOW_LINE_RE.exec(text)) !== null) {
    windows.push({
      app_name: m[1].trim(),
      pid: parseInt(m[2], 10),
      window_id: parseInt(m[3], 10),
      z_index: 0,
      off_screen: m[0].includes("[off-screen]"),
    });
  }
  return windows;
}

function parseElementsFromTree(markdown: string): UIElement[] {
  const elements: UIElement[] = [];
  let m: RegExpExecArray | null;
  ELEMENT_LINE_RE.lastIndex = 0;
  while ((m = ELEMENT_LINE_RE.exec(markdown)) !== null) {
    elements.push({ index: parseInt(m[1], 10), role: m[2], label: m[3] ?? "" });
  }
  return elements;
}

function parseWindowsFromResult(result: McpToolResult): WindowInfo[] {
  const sc = result.structuredContent;
  if (sc?.windows && Array.isArray(sc.windows)) {
    return (sc.windows as any[])
      .map((w) => ({
        app_name: w.app_name ?? "",
        pid: parseInt(w.pid, 10),
        window_id: parseInt(w.window_id, 10),
        z_index: w.z_index ?? 0,
        off_screen: !w.is_on_screen,
      }))
      .sort((a, b) => a.z_index - b.z_index);
  }
  const text = typeof result.data === "string" ? result.data : "";
  return parseWindowsFromText(text);
}

// ─────────────────────────────────────────────────────────────────────────────
// Aksiyon dispatch
// ─────────────────────────────────────────────────────────────────────────────

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

async function dispatch(
  action: string,
  args: Record<string, any>,
): Promise<string | ContentPart[]> {
  const captureAfter = Boolean(args.capture_after);

  // ── capture ──────────────────────────────────────────────────────────────
  if (action === "capture") {
    const mode = String(args.mode ?? "som");
    if (!["som", "vision", "ax"].includes(mode)) {
      return JSON.stringify({
        error: `Geçersiz mod: ${mode}. som|vision|ax kullanın.`,
      });
    }
    return await doCapture(mode, args.app as string | undefined);
  }

  // ── wait ─────────────────────────────────────────────────────────────────
  if (action === "wait") {
    const seconds = Math.min(30, Math.max(0.1, Number(args.seconds ?? 1)));
    await new Promise((r) => setTimeout(r, seconds * 1000));
    return JSON.stringify({ ok: true, action: "wait", seconds });
  }

  // ── list_apps ────────────────────────────────────────────────────────────
  if (action === "list_apps") {
    const result = await _client.callTool("list_apps", {});
    let apps: any[] = [];
    if (Array.isArray(result.data)) {
      apps = result.data;
    } else if (result.data?.apps) {
      apps = result.data.apps;
    } else if (typeof result.data === "string") {
      const appRe = /(.+?)\s+\(pid\s+(\d+)\)/g;
      let m: RegExpExecArray | null;
      while ((m = appRe.exec(result.data)) !== null) {
        apps.push({ name: m[1].trim(), pid: parseInt(m[2], 10) });
      }
    }
    return JSON.stringify({ apps, count: apps.length });
  }

  // ── focus_app ────────────────────────────────────────────────────────────
  if (action === "focus_app") {
    const app = args.app as string;
    if (!app) return JSON.stringify({ error: "focus_app için `app` gerekli" });
    const lwResult = await _client.callTool("list_windows", {
      on_screen_only: true,
    });
    const windows = parseWindowsFromResult(lwResult);
    const appLower = app.toLowerCase();
    const matched = windows.filter((w) =>
      w.app_name.toLowerCase().includes(appLower),
    );
    const target = matched[0] ?? windows[0];
    if (!target) {
      return JSON.stringify({
        ok: false,
        action: "focus_app",
        message: `Uygulama bulunamadı: ${app}`,
      });
    }
    _activePid = target.pid;
    _activeWindowId = target.window_id;
    const resp = JSON.stringify({
      ok: true,
      action: "focus_app",
      message: `${target.app_name} hedeflendi (pid ${_activePid}, window ${_activeWindowId}) — pencere öne alınmadı.`,
    });
    if (captureAfter) return await maybeCaptureAfter(resp, true);
    return resp;
  }

  // ── click / double_click / right_click / middle_click ────────────────────
  if (
    ["click", "double_click", "right_click", "middle_click"].includes(action)
  ) {
    if (_activePid === null) {
      return JSON.stringify({
        error: "Aktif pencere yok — önce capture() çağırın.",
      });
    }
    let toolName = "click";
    let clickCount = 1;
    let button = (args.button as string) ?? "left";

    if (action === "double_click") {
      toolName = "double_click";
      clickCount = 2;
    } else if (action === "right_click") {
      toolName = "right_click";
      button = "right";
    } else if (action === "middle_click") {
      button = "middle";
    }

    const callArgs: Record<string, any> = { pid: _activePid };
    if (args.element != null && _activeWindowId !== null) {
      callArgs.element_index = args.element;
      callArgs.window_id = _activeWindowId;
    } else if (args.coordinate) {
      callArgs.x = args.coordinate[0];
      callArgs.y = args.coordinate[1];
    } else {
      return JSON.stringify({
        error: "click için element= veya coordinate= gerekli",
      });
    }
    if (args.modifiers) callArgs.modifier = args.modifiers;

    const result = await _client.callTool(toolName, callArgs);
    const actionResult = JSON.stringify({
      ok: !result.isError,
      action,
      message:
        typeof result.data === "string"
          ? result.data
          : (result.data?.message ?? ""),
    });
    return captureAfter
      ? await maybeCaptureAfter(actionResult, !result.isError)
      : actionResult;
  }

  // ── scroll ────────────────────────────────────────────────────────────────
  if (action === "scroll") {
    if (_activePid === null) {
      return JSON.stringify({
        error: "Aktif pencere yok — önce capture() çağırın.",
      });
    }
    const scrollArgs: Record<string, any> = {
      pid: _activePid,
      direction: args.direction ?? "down",
      amount: Math.max(1, Math.min(50, Number(args.amount ?? 3))),
    };
    if (args.element != null && _activeWindowId !== null) {
      scrollArgs.element_index = args.element;
      scrollArgs.window_id = _activeWindowId;
    } else if (args.coordinate) {
      scrollArgs.x = args.coordinate[0];
      scrollArgs.y = args.coordinate[1];
    }
    const result = await _client.callTool("scroll", scrollArgs);
    const actionResult = JSON.stringify({
      ok: !result.isError,
      action: "scroll",
    });
    return captureAfter
      ? await maybeCaptureAfter(actionResult, !result.isError)
      : actionResult;
  }

  // ── type ─────────────────────────────────────────────────────────────────
  if (action === "type") {
    if (_activePid === null) {
      return JSON.stringify({
        error: "Aktif pencere yok — önce capture() çağırın.",
      });
    }
    const result = await _client.callTool("type_text_chars", {
      pid: _activePid,
      text: args.text ?? "",
    });
    const actionResult = JSON.stringify({
      ok: !result.isError,
      action: "type",
    });
    return captureAfter
      ? await maybeCaptureAfter(actionResult, !result.isError)
      : actionResult;
  }

  // ── key ───────────────────────────────────────────────────────────────────
  if (action === "key") {
    if (_activePid === null) {
      return JSON.stringify({
        error: "Aktif pencere yok — önce capture() çağırın.",
      });
    }
    const keys = String(args.keys ?? "");
    const { key, modifiers } = parseKeyCombo(keys);
    if (!key)
      return JSON.stringify({ error: `Tuş ayrıştırılamadı: '${keys}'` });

    let result: McpToolResult;
    if (modifiers.length > 0) {
      result = await _client.callTool("hotkey", {
        pid: _activePid,
        keys: [...modifiers, key],
      });
    } else {
      result = await _client.callTool("press_key", { pid: _activePid, key });
    }
    const actionResult = JSON.stringify({
      ok: !result.isError,
      action: "key",
      keys,
    });
    return captureAfter
      ? await maybeCaptureAfter(actionResult, !result.isError)
      : actionResult;
  }

  // ── set_value ─────────────────────────────────────────────────────────────
  if (action === "set_value") {
    if (_activePid === null || _activeWindowId === null) {
      return JSON.stringify({
        error: "Aktif pencere yok — önce capture() çağırın.",
      });
    }
    if (args.value == null)
      return JSON.stringify({ error: "set_value için `value` gerekli" });
    if (args.element == null)
      return JSON.stringify({ error: "set_value için `element` gerekli" });
    const result = await _client.callTool("set_value", {
      pid: _activePid,
      window_id: _activeWindowId,
      element_index: args.element,
      value: String(args.value),
    });
    const actionResult = JSON.stringify({
      ok: !result.isError,
      action: "set_value",
    });
    return captureAfter
      ? await maybeCaptureAfter(actionResult, !result.isError)
      : actionResult;
  }

  // ── drag (cua-driver desteklemiyor) ───────────────────────────────────────
  if (action === "drag") {
    return JSON.stringify({
      error: "drag, cua-driver backend tarafından desteklenmiyor.",
      hint: "Sürükle-bırak gerektiren görevler için computer_use yerine browser araçlarını kullanın.",
    });
  }

  return JSON.stringify({ error: `Bilinmeyen aksiyon: ${action}` });
}

// ─────────────────────────────────────────────────────────────────────────────
// Capture yardımcıları
// ─────────────────────────────────────────────────────────────────────────────

async function doCapture(
  mode: string,
  appFilter?: string,
): Promise<string | ContentPart[]> {
  // Pencere listesini al
  const lwResult = await _client.callTool("list_windows", {
    on_screen_only: true,
  });
  let windows = parseWindowsFromResult(lwResult);

  if (windows.length === 0) {
    return JSON.stringify({ error: "Ekranda görünen pencere bulunamadı." });
  }

  // Uygulama filtresi
  if (appFilter) {
    const appLower = appFilter.toLowerCase();
    const filtered = windows.filter((w) =>
      w.app_name.toLowerCase().includes(appLower),
    );
    if (filtered.length > 0) windows = filtered;
  }

  const target = windows.find((w) => !w.off_screen) ?? windows[0];
  _activePid = target.pid;
  _activeWindowId = target.window_id;

  let pngB64: string | null = null;
  let elements: UIElement[] = [];
  let windowTitle = "";

  if (mode === "vision") {
    const scResult = await _client.callTool("screenshot", {
      window_id: _activeWindowId,
      format: "jpeg",
      quality: 85,
    });
    if (scResult.images.length > 0) pngB64 = scResult.images[0];
  } else {
    const gwsResult = await _client.callTool("get_window_state", {
      pid: _activePid,
      window_id: _activeWindowId,
    });
    const text = typeof gwsResult.data === "string" ? gwsResult.data : "";
    const lines = text.split("\n");
    const tree = lines.slice(1).join("\n");

    if (gwsResult.images.length > 0) {
      pngB64 = gwsResult.images[0];
    }
    if (tree) {
      elements = parseElementsFromTree(tree);
    }

    const wtMatch = tree.match(/AXWindow\s+"([^"]+)"/);
    if (wtMatch) windowTitle = wtMatch[1];
  }

  // Özet metin oluştur
  const summaryLines = [
    `capture mode=${mode} app=${target.app_name}` +
      (windowTitle ? ` window="${windowTitle}"` : ""),
    `${elements.length} etkileşimli eleman:`,
    ...elements
      .slice(0, 40)
      .map(
        (e) =>
          `  #${e.index} ${e.role} "${e.label.replace(/\n/g, " ").slice(0, 60)}"`,
      ),
    ...(elements.length > 40 ? [`  ... +${elements.length - 40} daha`] : []),
  ];
  const summary = summaryLines.join("\n");

  if (pngB64 && mode !== "ax") {
    const mimeType = pngB64.startsWith("/9j/") ? "image/jpeg" : "image/png";
    return [
      { type: "text", text: summary },
      { type: "image", data: pngB64, mimeType },
    ] as ContentPart[];
  }

  return JSON.stringify({
    mode,
    app: target.app_name,
    window_title: windowTitle,
    elements: elements.map((e) => ({
      index: e.index,
      role: e.role,
      label: e.label,
    })),
    summary,
  });
}

async function maybeCaptureAfter(
  actionResult: string,
  actionOk: boolean,
): Promise<string | ContentPart[]> {
  if (!actionOk) return actionResult;
  try {
    const cap = await doCapture("som");
    if (Array.isArray(cap)) {
      // Aksiyon özetini ilk text parçasına ekle
      const prefix = `[${JSON.parse(actionResult)?.action ?? "action"}] ok=true\n\n`;
      return [
        { type: "text", text: prefix + (cap[0] as any).text },
        cap[1] as ContentPart,
      ];
    }
    return actionResult + "\n\nPost-aksiyon capture:\n" + cap;
  } catch {
    return actionResult;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ana handler
// ─────────────────────────────────────────────────────────────────────────────

async function handleComputerUse(args: {
  action: string;
  mode?: string;
  app?: string;
  element?: number;
  coordinate?: [number, number];
  button?: string;
  modifiers?: string[];
  from_element?: number;
  to_element?: number;
  from_coordinate?: [number, number];
  to_coordinate?: [number, number];
  direction?: string;
  amount?: number;
  value?: string;
  text?: string;
  keys?: string;
  seconds?: number;
  raise_window?: boolean;
  capture_after?: boolean;
}): Promise<string | ContentPart[]> {
  const action = (args.action ?? "").trim().toLowerCase();

  if (!action) {
    return JSON.stringify({ error: "action parametresi eksik" });
  }

  // Platform kontrolü
  if (!IS_MACOS) {
    return JSON.stringify({
      error: "computer_use sadece macOS'ta çalışır.",
      hint: "Bu özellik Apple Silicon veya Intel Mac gerektirir.",
    });
  }

  // cua-driver kurulum kontrolü
  if (!cuaDriverAvailable()) {
    return JSON.stringify({
      error: "cua-driver kurulu değil.",
      hint: 'Kurmak için: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh)"',
    });
  }

  // type güvenlik kontrolü
  if (action === "type") {
    const blocked = isBlockedType(args.text ?? "");
    if (blocked) {
      return JSON.stringify({
        error: `Engellenen kalıp type metninde tespit edildi.`,
        hint: "Tehlikeli kabuk kalıpları computer_use type aksiyonu üzerinden gönderilemez.",
      });
    }
  }

  // key tuş kombinasyonu güvenlik kontrolü
  if (action === "key") {
    const blocked = isBlockedKeyCombo(args.keys ?? "");
    if (blocked) {
      return JSON.stringify({
        error: `Engellenen tuş kombinasyonu: ${blocked}`,
        hint: "Yıkıcı sistem kısayolları kalıcı olarak engellendi.",
      });
    }
  }

  // Onay sistemi (session auto-approve veya always_allow yoksa)
  // Gelecekte CLI approval callback buraya eklenebilir
  if (
    DESTRUCTIVE_ACTIONS.has(action) &&
    !_sessionAutoApprove &&
    !_alwaysAllow.has(action)
  ) {
    // Şu an otomatik onay — approval callback entegrasyonu ilerleyen versiyonda
  }

  // cua-driver bağlantısını dene
  try {
    return await dispatch(action, args as any);
  } catch (err: any) {
    // Bağlantı hatası — yeniden bağlanmayı dene
    try {
      await _client.disconnect();
    } catch {
      // ignore
    }
    return JSON.stringify({
      error: `computer_use ${action} başarısız: ${err?.message ?? err}`,
      hint: "cua-driver'ın çalıştığından ve Accessibility + Screen Recording izinlerinin verildiğinden emin olun.",
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool kaydı — registerTool ile TOOL_SCHEMAS'a eklenir
// ─────────────────────────────────────────────────────────────────────────────

registerTool(
  "computer_use",
  `macOS masaüstünü arka planda kontrol et — ekran görüntüsü, fare, klavye, kaydırma.
Kullanıcının imlecini, klavye odağını veya Space'ini ÇALMAZ; arka plan co-work modeli.
Tercih edilen iş akışı: action='capture' (mode='som' numaralı element overlay'leri döndürür),
ardından güvenilirlik için element index ile tıkla. macOS zorunlu; cua-driver gerektirir.`,
  z.object({
    action: z
      .enum([
        "capture",
        "click",
        "double_click",
        "right_click",
        "middle_click",
        "drag",
        "scroll",
        "type",
        "key",
        "set_value",
        "wait",
        "list_apps",
        "focus_app",
      ])
      .describe(
        "Gerçekleştirilecek aksiyon. capture/wait/list_apps ücretsizdir. " +
          "Diğerleri masaüstü durumunu değiştirir.",
      ),
    mode: z
      .enum(["som", "vision", "ax"])
      .optional()
      .describe(
        "Capture modu. som (varsayılan): numaralı element overlay'leri + AX ağacı olan ekran görüntüsü. " +
          "vision: saf ekran görüntüsü. ax: sadece erişilebilirlik ağacı.",
      ),
    app: z
      .string()
      .optional()
      .describe(
        "İsteğe bağlı. Capture/aksiyonu belirli bir uygulamayla sınırla (ör. 'Safari').",
      ),
    element: z
      .number()
      .int()
      .optional()
      .describe(
        "Son capture(mode='som') çağrısından 1-tabanlı SOM index'i. Koordinatlardan daha güvenilir.",
      ),
    coordinate: z
      .array(z.number().int())
      .min(2)
      .max(2)
      .optional()
      .describe(
        "Mantıksal ekran uzayında piksel koordinatları [x, y]. Element index yoksa kullanın.",
      ),
    button: z
      .enum(["left", "right", "middle"])
      .optional()
      .describe("Fare düğmesi. Varsayılan: left."),
    modifiers: z
      .array(z.enum(["cmd", "shift", "option", "alt", "ctrl", "fn"]))
      .optional()
      .describe("Aksiyon sırasında basılı tutulan değiştirici tuşlar."),
    from_element: z
      .number()
      .int()
      .optional()
      .describe("Kaynak element index'i (drag)."),
    to_element: z
      .number()
      .int()
      .optional()
      .describe("Hedef element index'i (drag)."),
    from_coordinate: z
      .array(z.number().int())
      .min(2)
      .max(2)
      .optional()
      .describe("Kaynak [x,y] (drag)."),
    to_coordinate: z
      .array(z.number().int())
      .min(2)
      .max(2)
      .optional()
      .describe("Hedef [x,y] (drag)."),
    direction: z
      .enum(["up", "down", "left", "right"])
      .optional()
      .describe("Kaydırma yönü."),
    amount: z
      .number()
      .int()
      .optional()
      .describe("Kaydırma miktarı (tik). Varsayılan: 3."),
    value: z
      .string()
      .optional()
      .describe("set_value aksiyonu için: dropdown/slider değeri."),
    text: z.string().optional().describe("Yazılacak metin (type aksiyonu)."),
    keys: z
      .string()
      .optional()
      .describe(
        "Tuş kombinasyonu, ör. 'cmd+s', 'ctrl+alt+t', 'return', 'escape'.",
      ),
    seconds: z
      .number()
      .optional()
      .describe("Bekleme süresi (saniye). Maks: 30."),
    raise_window: z
      .boolean()
      .optional()
      .describe(
        "Yalnızca focus_app için. true ise pencereyi öne alır (KULLANICIYI RAHATSIZ EDER). Varsayılan: false.",
      ),
    capture_after: z
      .boolean()
      .optional()
      .describe(
        "true ise aksiyon sonrası otomatik capture alır. Aksiyonun etkisini doğrulamak için.",
      ),
  }),
  handleComputerUse,
);

export { handleComputerUse, cuaDriverAvailable };
