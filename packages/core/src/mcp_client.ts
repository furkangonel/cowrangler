/**
 * MCP Client — Model Context Protocol sunucu istemcisi.
 *
 *
 *
 * Özellikler:
 * - Stdio transport: subprocess başlatarak MCP server'a bağlan
 * - HTTP/StreamableHTTP transport: uzak MCP server
 * - SSE transport: Server-Sent Events
 * - Exponential backoff ile otomatik yeniden bağlanma (5 deneme)
 * - Tool keşfi: MCP araçlarını tool registry'ye otomatik ekle
 * - Ortam değişkeni filtreleme: API anahtarları subprocess'e sızmasın
 * - Sampling desteği: MCP server LLM completion talep edebilir
 *
 * Config (config.yaml):
 *   mcp_servers:
 *     filesystem:
 *       command: "npx"
 *       args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
 *       timeout: 120
 *     github:
 *       command: "npx"
 *       args: ["-y", "@modelcontextprotocol/server-github"]
 *       env:
 *         GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_..."
 *     remote:
 *       url: "https://my-mcp-server.example.com/mcp"
 *       headers:
 *         Authorization: "Bearer sk-..."
 *     sse_server:
 *       url: "http://localhost:8000/sse"
 *       transport: "sse"
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { registerTool, unregisterTool } from "./tools/registry.js";
import { getSecrets } from "./credential_vault.js";
import { LoopbackOAuthProvider } from "./oauth_provider.js";
import { jsonSchema } from "ai";
import { z } from "zod";
import {
  checkConfigTrust,
  checkToolsTrust,
  trustServerConfig,
  trustServerTools,
  type TrustStatus,
} from "./mcp_trust.js";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface MCPServerStdioConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;
  connect_timeout?: number;
  /** Değerleri credential_vault'ta tutulan env anahtarları (düz metin DEĞİL). */
  secrets?: string[];
}

export interface MCPServerHTTPConfig {
  url: string;
  headers?: Record<string, string>;
  transport?: "http" | "sse";
  timeout?: number;
  /** Değeri vault'ta tutulan tek gizli değerden bir header üret (ör. Authorization: Bearer …). */
  secrets?: string[];
  secretsHeader?: string;
  /** true ise: gerçek OAuth (vault'taki token'lar; gerekirse refresh) kullan. */
  oauth?: boolean;
}

export type MCPServerConfig = MCPServerStdioConfig | MCPServerHTTPConfig;

export interface MCPServerStatus {
  name: string;
  type: "stdio" | "http" | "sse";
  connected: boolean;
  toolCount: number;
  error?: string;
  /** İlk-kullanım güven durumu — bkz. mcp_trust.ts. */
  trust: TrustStatus;
}

/**
 * Yeni ya da config/araç listesi değişmiş bir sunucu bağlanmadan/tool'ları
 * kaydetmeden önce çağrılır. `true` dönerse mevcut parmak izi güvenilir
 * olarak kaydedilir. Callback verilmezse (headless/CLI) otomatik güvenilir
 * sayılır — geriye dönük uyumluluk için.
 */
export type MCPTrustApprover = (
  serverName: string,
  status: TrustStatus,
  config: MCPServerConfig,
) => boolean | Promise<boolean>;

// API anahtarları subprocess'e sızmasın — engel listesi
const BLOCKED_ENV_PATTERNS = [
  /API_KEY/i,
  /SECRET/i,
  /TOKEN(?!_DIR|_FILE)/i,
  /PASSWORD/i,
  /CREDENTIAL/i,
  /PRIVATE_KEY/i,
];

function filterEnvForSubprocess(
  extraEnv: Record<string, string> = {},
): Record<string, string> {
  const filtered: Record<string, string> = {};

  // Mevcut process env'inden güvenli olanları aktar
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (BLOCKED_ENV_PATTERNS.some((p) => p.test(key))) continue;
    filtered[key] = value;
  }

  // Explicit olarak belirtilen env değerlerini ekle (bunlar bilinçli olarak verildi)
  for (const [key, value] of Object.entries(extraEnv)) {
    filtered[key] = value;
  }

  return filtered;
}

function isStdioConfig(cfg: MCPServerConfig): cfg is MCPServerStdioConfig {
  return "command" in cfg;
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP SERVER CONNECTION
// ─────────────────────────────────────────────────────────────────────────────

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 1000;

class MCPServerConnection {
  private client: Client | null = null;
  private connected = false;
  private toolCount = 0;
  private lastError: string | undefined;
  private reconnectAttempts = 0;
  private trust: TrustStatus = "new";
  // Bu sunucu için registry'ye eklenen araç adları — disconnect/reload'da temizlenir.
  private registeredToolNames: string[] = [];

  constructor(
    private name: string,
    private config: MCPServerConfig,
    private approve?: MCPTrustApprover,
  ) {}

  async connect(): Promise<boolean> {
    // Config parmak izini kontrol et — onay reddedilirse hiç bağlanma.
    const configStatus = checkConfigTrust(this.name, this.config);
    if (configStatus !== "trusted") {
      const approved = this.approve ? await this.approve(this.name, configStatus, this.config) : true;
      if (!approved) {
        this.trust = configStatus;
        this.lastError = `MCP server '${this.name}' not approved (${configStatus})`;
        return false;
      }
      trustServerConfig(this.name, this.config);
    }

    for (let attempt = 0; attempt < MAX_RECONNECT_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        const delay = BASE_RECONNECT_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }

      try {
        await this._doConnect();
        this.reconnectAttempts = 0;
        this.trust = "trusted";
        return true;
      } catch (err: any) {
        this.lastError = err.message ?? String(err);
        this.reconnectAttempts = attempt + 1;
        // Araç listesi onaylanmadıysa yeniden denemek kullanıcıya aynı onayı
        // tekrar tekrar sormaktan başka bir şey yapmaz — hemen vazgeç.
        if (this.trust !== "trusted" && this.trust !== "new") break;
      }
    }

    return false;
  }

  private async _doConnect(): Promise<void> {
    this.client = new Client(
      { name: `cowrangler-mcp-${this.name}`, version: "1.0.0" },
      { capabilities: { sampling: {} } },
    );

    let transport;

    if (isStdioConfig(this.config)) {
      const cfg = this.config;
      // Vault'taki gizli değerleri env'e ekle (config'te düz metin tutulmaz).
      const vaultEnv = this._resolveVaultSecrets(cfg.secrets);
      transport = new StdioClientTransport({
        command: cfg.command,
        args: cfg.args ?? [],
        env: filterEnvForSubprocess({ ...(cfg.env ?? {}), ...vaultEnv }),
        stderr: "pipe",
      });
    } else {
      const cfg = this.config as MCPServerHTTPConfig;
      const url = new URL(cfg.url);

      // Vault gizli değerinden Authorization (vb.) header üret.
      const headers: Record<string, string> = { ...(cfg.headers ?? {}) };
      if (cfg.secretsHeader && cfg.secrets?.length) {
        const v = this._resolveVaultSecrets(cfg.secrets)[cfg.secrets[0]];
        if (v) headers[cfg.secretsHeader] = `Bearer ${v}`;
      }

      // OAuth: vault'taki token'larla sessiz sağlayıcı (gerekirse refresh).
      const authProvider = cfg.oauth ? LoopbackOAuthProvider.createSilent(this.name) : undefined;

      if (cfg.transport === "sse") {
        transport = new SSEClientTransport(url, {
          ...(authProvider ? { authProvider } : {}),
          requestInit: { headers },
        });
      } else {
        transport = new StreamableHTTPClientTransport(url, {
          ...(authProvider ? { authProvider } : {}),
          requestInit: { headers },
        });
      }
    }

    await this.client.connect(transport);
    this.connected = true;

    // Araçları keşfet ve registry'ye ekle
    await this._discoverTools();
  }

  /** Bu sunucu için vault'ta saklı gizli değerleri (yalnız istenen anahtarlar) çöz. */
  private _resolveVaultSecrets(keys?: string[]): Record<string, string> {
    if (!keys || keys.length === 0) return {};
    try {
      const all = getSecrets(this.name);
      const out: Record<string, string> = {};
      for (const k of keys) if (all[k]) out[k] = all[k];
      return out;
    } catch {
      return {};
    }
  }

  private async _discoverTools(): Promise<void> {
    if (!this.client) return;

    try {
      // Yeniden keşiften önce bu sunucunun eski araçlarını registry'den temizle
      // (reload sırasında bayat/çift kayıt oluşmasını önler).
      this._unregisterTools();

      const result = await this.client.listTools();
      const tools = result.tools ?? [];

      // Araç listesi ilk kez görülüyorsa veya önceki onaydan beri değiştiyse
      // yeniden onay gerekir — sunucu bağlantı kurulduktan sonra araç setini
      // sessizce genişletip modele yeni yetenekler enjekte edemesin.
      const toolsStatus = checkToolsTrust(this.name, tools.map((t) => t.name));
      if (toolsStatus !== "trusted") {
        const approved = this.approve ? await this.approve(this.name, toolsStatus, this.config) : true;
        this.trust = approved ? "trusted" : toolsStatus;
        if (!approved) {
          this.toolCount = 0;
          throw new Error(`MCP server '${this.name}' tool list not approved (${toolsStatus})`);
        }
        trustServerTools(this.name, tools.map((t) => t.name));
      }

      for (const tool of tools) {
        const toolName = `mcp_${this.name}_${tool.name}`;
        const description = `[MCP:${this.name}] ${tool.description ?? tool.name}`;

        // KRİTİK: MCP aracının GERÇEK inputSchema'sını modele ilet. Önceden
        // z.object({}).passthrough() kullanılıyordu — bu, modele aracın hiçbir
        // parametresi yokmuş gibi gösteriyor ve model çağrıyı boş argümanla
        // yapıyordu. jsonSchema() ile MCP server'ın JSON Schema'sı doğrudan
        // AI SDK'ya geçirilir; yoksa serbest obje geçişine düşeriz.
        const inputSchema = (tool as any).inputSchema;
        const parameters =
          inputSchema && typeof inputSchema === "object"
            ? jsonSchema(inputSchema as any)
            : z.object({}).passthrough();

        registerTool(
          toolName,
          description,
          parameters,
          async (args: Record<string, unknown>) => {
            return this.callTool(tool.name, args);
          },
        );
        this.registeredToolNames.push(toolName);
      }

      this.toolCount = tools.length;
    } catch (err: any) {
      throw new Error(`Tool discovery failed for ${this.name}: ${err.message}`);
    }
  }

  /** Bu sunucuya ait tüm araçları registry'den kaldırır. */
  private _unregisterTools(): void {
    for (const name of this.registeredToolNames) unregisterTool(name);
    this.registeredToolNames = [];
    this.toolCount = 0;
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    if (!this.client || !this.connected) {
      // Yeniden bağlanmayı dene
      const reconnected = await this.connect();
      if (!reconnected) {
        throw new Error(
          `MCP server '${this.name}' is not connected. Last error: ${this.lastError}`,
        );
      }
    }

    try {
      const result: any = await this.client!.callTool({
        name: toolName,
        arguments: args,
      });

      // Sonucu string'e dönüştür — KAYIPSIZ olmalı. content bloklarının yanında
      // structuredContent ve resource_link/resource türleri de modele ulaşmalı;
      // aksi halde (ör. SketchUp save_model) dönen URL/dosya bağlantısı düşer ve
      // model "kaydettim ama link yok" durumuna girer.
      const parts: string[] = [];

      if (Array.isArray(result.content)) {
        for (const c of result.content as any[]) {
          switch (c?.type) {
            case "text":
              parts.push(c.text ?? "");
              break;
            case "image":
              parts.push(`[image: ${c.mimeType ?? "image"}]`);
              break;
            case "audio":
              parts.push(`[audio: ${c.mimeType ?? "audio"}]`);
              break;
            case "resource_link":
              // İndirilebilir/görüntülenebilir bağlantı — URI'yi mutlaka koru.
              parts.push(
                `[resource: ${c.name ?? c.uri ?? "link"}]` +
                  (c.uri ? ` ${c.uri}` : "") +
                  (c.description ? ` — ${c.description}` : ""),
              );
              break;
            case "resource": {
              const r = c.resource ?? {};
              if (r.text) parts.push(r.text);
              else
                parts.push(
                  `[resource: ${r.uri ?? "embedded"}${r.mimeType ? `, ${r.mimeType}` : ""}]`,
                );
              break;
            }
            default:
              parts.push(typeof c === "string" ? c : JSON.stringify(c));
          }
        }
      }

      // Yapısal çıktı (URL, id, istatistik vb.) — content boş olsa bile iletilmeli.
      if (
        result.structuredContent &&
        typeof result.structuredContent === "object" &&
        Object.keys(result.structuredContent).length > 0
      ) {
        parts.push(JSON.stringify(result.structuredContent));
      }

      let out = parts.join("\n").trim();
      if (!out) out = JSON.stringify(result);
      // Araç hata bayrağını modele görünür kıl — sessizce "başarılı" sanmasın.
      if (result.isError) out = `[tool error] ${out}`;
      return out;
    } catch (err: any) {
      // Credential bilgilerini hata mesajından temizle
      const cleanMsg = this._scrubCredentials(err.message ?? String(err));
      throw new Error(`MCP tool '${toolName}' failed: ${cleanMsg}`);
    }
  }

  private _scrubCredentials(msg: string): string {
    // Bilinen API key formatlarını maskele
    return msg
      .replace(/sk-[a-zA-Z0-9_-]{20,}/g, "sk-***")
      .replace(/ghp_[a-zA-Z0-9]{36}/g, "ghp_***")
      .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, "Bearer ***");
  }

  async disconnect(): Promise<void> {
    // Bağlantı kesilince araçları registry'den kaldır — bayat araçlar modele
    // sunulmaya devam etmesin.
    this._unregisterTools();
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        /* sessizce */
      }
      this.client = null;
      this.connected = false;
    }
  }

  getStatus(): MCPServerStatus {
    const type = isStdioConfig(this.config)
      ? "stdio"
      : (this.config as MCPServerHTTPConfig).transport === "sse"
        ? "sse"
        : "http";

    return {
      name: this.name,
      type,
      connected: this.connected,
      toolCount: this.toolCount,
      error: this.lastError,
      trust: this.trust,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP MANAGER
// ─────────────────────────────────────────────────────────────────────────────

export class MCPManager {
  private servers = new Map<string, MCPServerConnection>();
  private initialized = false;

  async init(serverConfigs: Record<string, MCPServerConfig>, approve?: MCPTrustApprover): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const connectPromises = Object.entries(serverConfigs).map(
      async ([name, config]) => {
        const conn = new MCPServerConnection(name, config, approve);
        this.servers.set(name, conn);
        await conn.connect();
      },
    );

    // Paralel bağlantı — başarısız olanlar diğerlerini engellemez
    await Promise.allSettled(connectPromises);
  }

  /**
   * Sunucuları yeniden yükler — kullanıcı UI'dan MCP ekleyip/kaldırınca
   * uygulamayı yeniden başlatmaya gerek kalmadan canlı olarak uygulanır.
   * Mevcut bağlantılar kapatılır, araçları registry'den temizlenir ve
   * yeni config ile sıfırdan bağlanılır.
   */
  async reload(serverConfigs: Record<string, MCPServerConfig>, approve?: MCPTrustApprover): Promise<void> {
    await this.shutdown();
    this.initialized = false;
    await this.init(serverConfigs, approve);
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const conn = this.servers.get(serverName);
    if (!conn) {
      throw new Error(`MCP server '${serverName}' not found`);
    }
    return conn.callTool(toolName, args);
  }

  getStatuses(): MCPServerStatus[] {
    return [...this.servers.values()].map((s) => s.getStatus());
  }

  async shutdown(): Promise<void> {
    const disconnects = [...this.servers.values()].map((s) => s.disconnect());
    await Promise.allSettled(disconnects);
    this.servers.clear();
  }

  summary(): string {
    const statuses = this.getStatuses();
    const connected = statuses.filter((s) => s.connected).length;
    const totalTools = statuses.reduce((s, st) => s + st.toolCount, 0);
    return `${connected}/${statuses.length} MCP servers connected, ${totalTools} tools available`;
  }
}

// Singleton
let _manager: MCPManager | null = null;

export function getMCPManager(): MCPManager {
  if (!_manager) _manager = new MCPManager();
  return _manager;
}

import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Reads MCP server configurations using Claude Desktop's directory structure format.
 * Looks for:
 * 1. ~/.cowrangler/claude_desktop_config.json (mcpServers field)
 * 2. ~/.cowrangler/extensions-installations.json (extensions map)
 */
function loadClaudeStyleMcpServers(): Record<string, MCPServerConfig> {
  const globalDir = path.join(os.homedir(), '.cowrangler');
  const servers: Record<string, MCPServerConfig> = {};

  // 1. Read claude_desktop_config.json
  const claudeConfigPath = path.join(globalDir, 'claude_desktop_config.json');
  if (fs.existsSync(claudeConfigPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf-8'));
      if (data.mcpServers && typeof data.mcpServers === 'object') {
        for (const [name, cfg] of Object.entries(data.mcpServers)) {
          servers[name] = cfg as MCPServerConfig;
        }
      }
    } catch (e) {
      console.error(`Failed to parse claude_desktop_config.json:`, e);
    }
  }

  // 2. Read extensions-installations.json
  const extPath = path.join(globalDir, 'extensions-installations.json');
  if (fs.existsSync(extPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(extPath, 'utf-8'));
      if (data.extensions && typeof data.extensions === 'object') {
        for (const [id, ext] of Object.entries(data.extensions)) {
          const mcpConfig = (ext as any)?.manifest?.server?.mcp_config;
          if (mcpConfig) {
            servers[id] = mcpConfig as MCPServerConfig;
          }
        }
      }
    } catch (e) {
      console.error(`Failed to parse extensions-installations.json:`, e);
    }
  }

  return servers;
}

/**
 * Boot the MCP manager using Claude's extension directory structure.
 */
export async function bootMcp(approve?: MCPTrustApprover): Promise<string> {
  const { getConfig } = await import("./init.js");
  const cfg = getConfig();

  // Merge traditional config.yaml servers with Claude-style config
  const legacyServers: Record<string, MCPServerConfig> = cfg.mcp_servers || {};
  const claudeStyleServers = loadClaudeStyleMcpServers();

  const servers = { ...legacyServers, ...claudeStyleServers };
  const mgr = getMCPManager();

  if (Object.keys(servers).length === 0) {
    return "0 MCP servers configured";
  }

  await mgr.init(servers, approve);
  return mgr.summary();
}

/**
 * Reloads MCP servers using Claude's directory structure.
 */
export async function reloadMcp(approve?: MCPTrustApprover): Promise<string> {
  const { getConfig } = await import("./init.js");
  const cfg = getConfig();

  const legacyServers: Record<string, MCPServerConfig> = cfg.mcp_servers || {};
  const claudeStyleServers = loadClaudeStyleMcpServers();

  const servers = { ...legacyServers, ...claudeStyleServers };
  const mgr = getMCPManager();

  await mgr.reload(servers, approve);
  return mgr.summary();
}
