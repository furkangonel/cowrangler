/**
 * oauth_provider — uzak (remote) MCP connector'ları için GERÇEK OAuth 2.0 akışı.
 *
 * MCP SDK'nın `OAuthClientProvider` arayüzünü uygular. SDK; keşif (.well-known),
 * dinamik istemci kaydı (RFC 7591), PKCE üretimi ve token değişimini/yenilemesini
 * kendi yürütür. Bu sınıfın görevi yalnızca:
 *   1) loopback (127.0.0.1) callback sunucusu açıp `?code=` yakalamak,
 *   2) sistem tarayıcısını yetkilendirme URL'sine yönlendirmek,
 *   3) istemci bilgisi + token + PKCE verifier'ı şifreli kasada saklamak.
 *
 * `authorizeConnector()` interaktif akışı baştan sona koşar; başarıda token'lar
 * kasaya yazılır ve sonraki MCP yüklemelerinde `attachSilentAuth()` ile sessizce
 * (gerekirse refresh_token ile) kullanılır.
 */

import http from "http";
import { AddressInfo } from "net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientMetadata,
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  getSecret,
  setSecret,
} from "./credential_vault.js";

type Opener = (url: string) => void | Promise<void>;

const VAULT_NS = (id: string) => `oauth:${id}`;

const CALLBACK_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Cowrangler</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#1F1E1D;color:#F5F4EE;display:flex;
align-items:center;justify-content:center;height:100vh;margin:0}.c{text-align:center}.d{width:44px;height:44px;
border-radius:50%;background:#F26A38;display:inline-flex;align-items:center;justify-content:center;margin-bottom:14px}
h1{font-size:17px;margin:0 0 6px}p{color:#B0ADA5;font-size:13px;margin:0}</style></head>
<body><div class="c"><div class="d">✓</div><h1>Connected</h1><p>You can close this window and return to Cowrangler.</p></div></body></html>`;

export class LoopbackOAuthProvider implements OAuthClientProvider {
  private server: http.Server | null = null;
  private _redirectUrl: string;
  private codeResolve: ((code: string) => void) | null = null;
  private codeReject: ((err: Error) => void) | null = null;
  private expectedState: string | undefined;

  private constructor(
    private id: string,
    private opener: Opener,
    redirectUrl: string,
  ) {
    this._redirectUrl = redirectUrl;
  }

  /** İnteraktif akış için: loopback sunucusu başlatır, dinamik bir port alır. */
  static async createInteractive(id: string, opener: Opener): Promise<LoopbackOAuthProvider> {
    const provider = new LoopbackOAuthProvider(id, opener, "http://127.0.0.1/callback");
    await provider.startServer();
    setSecret(VAULT_NS(id), "redirect", provider._redirectUrl);
    return provider;
  }

  /** Sessiz (load-time) kullanım: sunucu açmaz; kayıtlı redirect'i kullanır. */
  static createSilent(id: string): LoopbackOAuthProvider {
    const redirect = getSecret(VAULT_NS(id), "redirect") ?? "http://127.0.0.1/callback";
    return new LoopbackOAuthProvider(id, () => {}, redirect);
  }

  private startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        try {
          const u = new URL(req.url ?? "/", this._redirectUrl);
          if (!u.pathname.startsWith("/callback")) {
            res.writeHead(404).end();
            return;
          }
          const code = u.searchParams.get("code");
          const state = u.searchParams.get("state");
          const err = u.searchParams.get("error");
          res.writeHead(200, { "Content-Type": "text/html" }).end(CALLBACK_HTML);
          if (err) {
            this.codeReject?.(new Error(`Authorization denied: ${err}`));
          } else if (!code) {
            this.codeReject?.(new Error("No authorization code returned."));
          } else if (this.expectedState && state && state !== this.expectedState) {
            this.codeReject?.(new Error("State mismatch — possible CSRF, aborted."));
          } else if (code) {
            this.codeResolve?.(code);
          }
        } catch (e: any) {
          try { res.writeHead(500).end(); } catch { /* noop */ }
          this.codeReject?.(e);
        }
      });
      this.server.on("error", reject);
      this.server.listen(0, "127.0.0.1", () => {
        const addr = this.server!.address() as AddressInfo;
        this._redirectUrl = `http://127.0.0.1:${addr.port}/callback`;
        resolve();
      });
    });
  }

  /** redirectToAuthorization tetiklendikten sonra callback kodunu bekler. */
  waitForCode(timeoutMs = 180_000): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.codeResolve = resolve;
      this.codeReject = reject;
      const t = setTimeout(() => reject(new Error("Authorization timed out.")), timeoutMs);
      const clear = () => clearTimeout(t);
      const wrap = (fn: (v: any) => void) => (v: any) => { clear(); fn(v); };
      this.codeResolve = wrap(resolve);
      this.codeReject = wrap(reject);
    });
  }

  async dispose(): Promise<void> {
    await new Promise<void>((r) => {
      if (!this.server) return r();
      this.server.close(() => r());
    });
    this.server = null;
  }

  // ── OAuthClientProvider arayüzü ─────────────────────────────────────────────

  get redirectUrl(): string {
    return this._redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Cowrangler",
      redirect_uris: [this._redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  async state(): Promise<string> {
    const s = Math.random().toString(36).slice(2) + Date.now().toString(36);
    this.expectedState = s;
    setSecret(VAULT_NS(this.id), "state", s);
    return s;
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    const raw = getSecret(VAULT_NS(this.id), "client");
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as OAuthClientInformationMixed;
    } catch {
      return undefined;
    }
  }

  saveClientInformation(info: OAuthClientInformationMixed): void {
    setSecret(VAULT_NS(this.id), "client", JSON.stringify(info));
  }

  tokens(): OAuthTokens | undefined {
    const raw = getSecret(VAULT_NS(this.id), "tokens");
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as OAuthTokens;
    } catch {
      return undefined;
    }
  }

  saveTokens(tokens: OAuthTokens): void {
    setSecret(VAULT_NS(this.id), "tokens", JSON.stringify(tokens));
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    await this.opener(authorizationUrl.toString());
  }

  saveCodeVerifier(codeVerifier: string): void {
    setSecret(VAULT_NS(this.id), "verifier", codeVerifier);
  }

  codeVerifier(): string {
    return getSecret(VAULT_NS(this.id), "verifier") ?? "";
  }

  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery"): void {
    const ns = VAULT_NS(this.id);
    if (scope === "all" || scope === "tokens") setSecret(ns, "tokens", "");
    if (scope === "all" || scope === "verifier") setSecret(ns, "verifier", "");
    if (scope === "all" || scope === "client") setSecret(ns, "client", "");
  }
}

/** Bir uzak connector için tokens var mı (UI: "Authorized" rozeti). */
export function hasOAuthTokens(id: string): boolean {
  const raw = getSecret(VAULT_NS(id), "tokens");
  return !!raw && raw.length > 2;
}

export interface AuthorizeResult {
  ok: boolean;
  toolCount?: number;
  error?: string;
}

/**
 * İnteraktif OAuth akışını baştan sona koşar:
 * connect → (401) → tarayıcıda yetkilendir → finishAuth(code) → reconnect.
 * Başarıda token'lar kasaya yazılır.
 */
export async function authorizeConnector(
  id: string,
  url: string,
  kind: "http" | "sse",
  opener: Opener,
): Promise<AuthorizeResult> {
  let provider: LoopbackOAuthProvider | null = null;
  let client: Client | null = null;
  try {
    provider = await LoopbackOAuthProvider.createInteractive(id, opener);
    const target = new URL(url);
    const transport =
      kind === "sse"
        ? new SSEClientTransport(target, { authProvider: provider })
        : new StreamableHTTPClientTransport(target, { authProvider: provider });

    client = new Client(
      { name: `cowrangler-oauth-${id}`, version: "1.0.0" },
      { capabilities: {} },
    );

    try {
      // Tokens zaten varsa bu doğrudan bağlanır.
      await client.connect(transport);
    } catch (e: any) {
      if (e instanceof UnauthorizedError || /unauthor/i.test(String(e?.message ?? e))) {
        const code = await provider.waitForCode();
        await transport.finishAuth(code);
        await client.connect(transport);
      } else {
        throw e;
      }
    }

    let toolCount = 0;
    try {
      toolCount = (await client.listTools()).tools?.length ?? 0;
    } catch {
      /* araç keşfi opsiyonel */
    }
    return { ok: true, toolCount };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  } finally {
    try { await client?.close(); } catch { /* noop */ }
    try { await provider?.dispose(); } catch { /* noop */ }
  }
}
