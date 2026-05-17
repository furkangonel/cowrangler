/**
 * Plugin Sistemi — yaşam döngüsü hook'ları ve harici araç ekleme.
 *
 *
 *
 * Plugin yapısı (ESM):
 *   export function register(ctx: PluginContext): void { ... }
 *
 * Desteklenen hook event'leri:
 *   pre_tool_call   — araç çağrısı öncesi (args değiştirilebilir)
 *   post_tool_call  — araç çağrısı sonrası
 *   pre_llm_call    — LLM çağrısı öncesi (messages değiştirilebilir)
 *   post_llm_call   — LLM çağrısı sonrası (usage takibi)
 *   on_session_start — oturum başlangıcı
 *   on_session_end   — oturum sonu
 *
 * Discovery yolları:
 *   ~/.cowrangler/plugins/<name>/index.js   (global)
 *   ./.cowrangler/plugins/<name>/index.js   (local — öncelikli)
 */

import fs from "fs";
import path from "path";
import { DIRS } from "./init.js";
import { registerTool } from "../tools/registry.js";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type HookEvent =
  | "pre_tool_call"
  | "post_tool_call"
  | "pre_llm_call"
  | "post_llm_call"
  | "on_session_start"
  | "on_session_end";

export type HookFn = (data: any) => void | Promise<void>;

export interface PluginContext {
  /** Yaşam döngüsü hook'u kaydet */
  registerHook(event: HookEvent, fn: HookFn): void;

  /** Yeni araç kaydet */
  registerTool(
    name: string,
    description: string,
    parameters: any,
    execute: Function,
  ): void;

  /** CLI komutu kaydet */
  registerCliCommand(
    name: string,
    description: string,
    handler: (args: string[]) => void | Promise<void>,
  ): void;

  /** Plugin metadata */
  readonly pluginName: string;
  readonly pluginDir: string;
}

export interface PluginRegistration {
  name: string;
  dir: string;
  source: "global" | "local";
  active: boolean;
  error?: string;
}

export interface CliCommandRegistration {
  name: string;
  description: string;
  handler: (args: string[]) => void | Promise<void>;
  pluginName: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// PLUGIN MANAGER
// ─────────────────────────────────────────────────────────────────────────────

export class PluginManager {
  private hooks = new Map<HookEvent, HookFn[]>();
  private plugins: PluginRegistration[] = [];
  private cliCommands: CliCommandRegistration[] = [];
  private loaded = false;

  constructor() {
    // Tüm event türleri için boş dizi oluştur
    const events: HookEvent[] = [
      "pre_tool_call",
      "post_tool_call",
      "pre_llm_call",
      "post_llm_call",
      "on_session_start",
      "on_session_end",
    ];
    for (const e of events) this.hooks.set(e, []);
  }

  // ── Plugin Discovery ────────────────────────────────────────────────────────

  async loadAll(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;

    // Global plugins önce yüklenir, local'lar override edebilir
    await this._loadFromDir(DIRS.global.base, "global");
    await this._loadFromDir(DIRS.local.base, "local");
  }

  private async _loadFromDir(
    baseDir: string,
    source: "global" | "local",
  ): Promise<void> {
    const pluginsDir = path.join(baseDir, "plugins");
    if (!fs.existsSync(pluginsDir)) return;

    let entries: string[];
    try {
      entries = fs.readdirSync(pluginsDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const pluginDir = path.join(pluginsDir, entry);
      if (!fs.statSync(pluginDir).isDirectory()) continue;

      // index.js veya index.mjs ara
      const entryFiles = ["index.js", "index.mjs"];
      let entryFile: string | null = null;
      for (const f of entryFiles) {
        if (fs.existsSync(path.join(pluginDir, f))) {
          entryFile = path.join(pluginDir, f);
          break;
        }
      }

      if (!entryFile) continue;

      const registration: PluginRegistration = {
        name: entry,
        dir: pluginDir,
        source,
        active: false,
      };

      try {
        const ctx = this._createContext(entry, pluginDir);
        const module = await import(`file://${entryFile}`);

        if (typeof module.register === "function") {
          await module.register(ctx);
          registration.active = true;
        } else {
          registration.error = "No 'register' export found";
        }
      } catch (err: any) {
        registration.error = err.message ?? String(err);
      }

      this.plugins.push(registration);
    }
  }

  private _createContext(pluginName: string, pluginDir: string): PluginContext {
    const self = this;
    return {
      pluginName,
      pluginDir,

      registerHook(event: HookEvent, fn: HookFn) {
        const list = self.hooks.get(event) ?? [];
        list.push(fn);
        self.hooks.set(event, list);
      },

      registerTool(name, description, parameters, execute) {
        registerTool(name, description, parameters, execute);
      },

      registerCliCommand(name, description, handler) {
        self.cliCommands.push({ name, description, handler, pluginName });
      },
    };
  }

  // ── Hook Emitter ─────────────────────────────────────────────────────────────

  /** Senkron emit — hata fırlatsa bile diğer hook'lar çalışır */
  emit(event: HookEvent, data?: any): void {
    const fns = this.hooks.get(event) ?? [];
    for (const fn of fns) {
      try {
        fn(data);
      } catch (err) {
        // Plugin hatası uygulamayı durdurmamalı
        console.error(`[plugin:${event}] hook error:`, err);
      }
    }
  }

  /** Async emit — await ile beklenir, sıralı çalışır */
  async emitAsync(event: HookEvent, data?: any): Promise<void> {
    const fns = this.hooks.get(event) ?? [];
    for (const fn of fns) {
      try {
        await fn(data);
      } catch (err) {
        console.error(`[plugin:${event}] async hook error:`, err);
      }
    }
  }

  // ── CLI Command Routing ───────────────────────────────────────────────────────

  getCliCommands(): CliCommandRegistration[] {
    return [...this.cliCommands];
  }

  async runCliCommand(name: string, args: string[]): Promise<boolean> {
    const cmd = this.cliCommands.find((c) => c.name === name);
    if (!cmd) return false;
    await cmd.handler(args);
    return true;
  }

  // ── Status ───────────────────────────────────────────────────────────────────

  getPlugins(): PluginRegistration[] {
    return [...this.plugins];
  }

  summary(): string {
    const active = this.plugins.filter((p) => p.active).length;
    const total = this.plugins.length;
    const hooks = [...this.hooks.values()].reduce((s, a) => s + a.length, 0);
    return `${active}/${total} plugins active, ${hooks} hooks registered, ${this.cliCommands.length} CLI commands`;
  }
}

// Singleton
let _instance: PluginManager | null = null;

export function getPluginManager(): PluginManager {
  if (!_instance) {
    _instance = new PluginManager();
  }
  return _instance;
}

export async function initPlugins(): Promise<void> {
  await getPluginManager().loadAll();
}
