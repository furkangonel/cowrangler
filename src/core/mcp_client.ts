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
import { registerTool } from "../tools/registry.js";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface MCPServerStdioConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;
  connect_timeout?: number;
}

export interface MCPServerHTTPConfig {
  url: string;
  headers?: Record<string, string>;
  transport?: "http" | "sse";
  timeout?: number;
}

export type MCPServerConfig = MCPServerStdioConfig | MCPServerHTTPConfig;

export interface MCPServerStatus {
  name: string;
  type: "stdio" | "http" | "sse";
  connected: boolean;
  toolCount: number;
  error?: string;
}

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

  constructor(
    private name: string,
    private config: MCPServerConfig,
  ) {}

  async connect(): Promise<boolean> {
    for (let attempt = 0; attempt < MAX_RECONNECT_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        const delay = BASE_RECONNECT_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }

      try {
        await this._doConnect();
        this.reconnectAttempts = 0;
        return true;
      } catch (err: any) {
        this.lastError = err.message ?? String(err);
        this.reconnectAttempts = attempt + 1;
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
      transport = new StdioClientTransport({
        command: cfg.command,
        args: cfg.args ?? [],
        env: filterEnvForSubprocess(cfg.env),
        stderr: "pipe",
      });
    } else {
      const cfg = this.config as MCPServerHTTPConfig;
      const url = new URL(cfg.url);

      if (cfg.transport === "sse") {
        transport = new SSEClientTransport(url, {
          requestInit: {
            headers: cfg.headers ?? {},
          },
        });
      } else {
        transport = new StreamableHTTPClientTransport(url, {
          requestInit: {
            headers: cfg.headers ?? {},
          },
        });
      }
    }

    await this.client.connect(transport);
    this.connected = true;

    // Araçları keşfet ve registry'ye ekle
    await this._discoverTools();
  }

  private async _discoverTools(): Promise<void> {
    if (!this.client) return;

    try {
      const result = await this.client.listTools();
      const tools = result.tools ?? [];

      for (const tool of tools) {
        const toolName = `mcp_${this.name}_${tool.name}`;
        const description = `[MCP:${this.name}] ${tool.description ?? tool.name}`;

        // Tool şemasını zod'a dönüştür (basit object geçişi)
        const parameters = z.object({}).passthrough();

        registerTool(
          toolName,
          description,
          parameters,
          async (args: Record<string, unknown>) => {
            return this.callTool(tool.name, args);
          },
        );
      }

      this.toolCount = tools.length;
    } catch (err: any) {
      throw new Error(`Tool discovery failed for ${this.name}: ${err.message}`);
    }
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
      const result = await this.client!.callTool({
        name: toolName,
        arguments: args,
      });

      // Sonucu string'e dönüştür
      if (result.content && Array.isArray(result.content)) {
        return result.content
          .map((c: any) => {
            if (c.type === "text") return c.text;
            if (c.type === "image") return `[image: ${c.mimeType}]`;
            return JSON.stringify(c);
          })
          .join("\n");
      }

      return JSON.stringify(result);
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
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP MANAGER
// ─────────────────────────────────────────────────────────────────────────────

export class MCPManager {
  private servers = new Map<string, MCPServerConnection>();
  private initialized = false;

  async init(serverConfigs: Record<string, MCPServerConfig>): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const connectPromises = Object.entries(serverConfigs).map(
      async ([name, config]) => {
        const conn = new MCPServerConnection(name, config);
        this.servers.set(name, conn);
        await conn.connect();
      },
    );

    // Paralel bağlantı — başarısız olanlar diğerlerini engellemez
    await Promise.allSettled(connectPromises);
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
