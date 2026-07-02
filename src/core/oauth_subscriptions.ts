/**
 * oauth_subscriptions — LLM ABONELİK OAuth girişi.
 *
 * API key yerine, kullanıcının zaten ödediği aboneliklerle giriş:
 *   • Claude Pro/Max   (Anthropic)      — PKCE + loopback 53692 / manuel kod
 *   • ChatGPT Plus     (OpenAI Codex)   — PKCE + loopback 1455
 *   • GitHub Copilot                    — device-code flow
 *   • Gemini           (Google CLI)     — PKCE + loopback 8085
 *   • Antigravity      (Google)         — PKCE + loopback 51121
 *
 * Token'lar şifreli kasada (`credential_vault`, namespace "oauth-sub") saklanır.
 * `getValidAccessToken()` süresi dolmak üzereyse otomatik yeniler.
 * `applyOAuthEnv()` başlangıçta çağrılır; geçerli token'ları çözer ve
 * `llm.ts`'in okuduğu env işaretlerini kurar.
 *
 * Not: client_id'ler ilgili resmi CLI istemcilerinin herkese açık public
 * client kimlikleridir (gizli değildir; PKCE ile korunur).
 */

import http from "http";
import crypto from "crypto";
import { getSecret, setSecret, getSecretMode } from "./credential_vault.js";

// ── Ortak tipler ─────────────────────────────────────────────────────────────

export type OAuthProviderId =
  | "anthropic"
  | "openai"
  | "copilot"
  | "gemini"
  | "antigravity";

export interface OAuthCreds {
  access: string;
  refresh: string;
  /** epoch ms — access token bitiş zamanı */
  expires: number;
  /** sağlayıcıya özgü ekstra alanlar (account_id, project_id, api base…) */
  [k: string]: unknown;
}

export interface LoginCallbacks {
  /** Yetkilendirme URL'sini kullanıcıya göster / tarayıcıda aç. */
  onAuth: (info: { url: string; instructions?: string }) => void;
  /** Kullanıcıdan manuel giriş iste (device kodu, yapıştırılan redirect URL). */
  onPrompt?: (p: { message: string; placeholder?: string }) => Promise<string>;
  onProgress?: (msg: string) => void;
  signal?: AbortSignal;
}

const VAULT_NS = "oauth-sub";

// ── PKCE ─────────────────────────────────────────────────────────────────────

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function randomState(): string {
  return b64url(crypto.randomBytes(16));
}

// ── Loopback callback sunucusu ───────────────────────────────────────────────

const CALLBACK_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Cowrangler</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#1F1E1D;color:#F5F4EE;display:flex;
align-items:center;justify-content:center;height:100vh;margin:0}.c{text-align:center}.d{width:44px;height:44px;
border-radius:50%;background:#F26A38;display:inline-flex;align-items:center;justify-content:center;margin-bottom:14px}
h1{font-size:17px;margin:0 0 6px}p{color:#B0ADA5;font-size:13px;margin:0}</style></head>
<body><div class="c"><div class="d">✓</div><h1>Signed in</h1><p>You can close this window and return to Cowrangler.</p></div></body></html>`;

interface Loopback {
  waitForCode: (timeoutMs?: number) => Promise<{ code: string; state?: string }>;
  close: () => void;
}

function startLoopback(port: number, pathName: string): Promise<Loopback> {
  return new Promise((resolve, reject) => {
    let onCode: ((v: { code: string; state?: string }) => void) | null = null;
    let onErr: ((e: Error) => void) | null = null;

    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url || "", `http://localhost:${port}`);
        if (!url.pathname.startsWith(pathName)) {
          res.writeHead(404).end();
          return;
        }
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state") ?? undefined;
        const error = url.searchParams.get("error");
        res.writeHead(200, { "Content-Type": "text/html" }).end(CALLBACK_HTML);
        if (error) onErr?.(new Error(`OAuth error: ${error}`));
        else if (code) onCode?.({ code, state });
      } catch (e: any) {
        onErr?.(e);
      }
    });

    server.on("error", (e) => reject(e));
    server.listen(port, "127.0.0.1", () => {
      resolve({
        waitForCode: (timeoutMs = 300_000) =>
          new Promise((res, rej) => {
            const t = setTimeout(() => rej(new Error("OAuth timed out")), timeoutMs);
            onCode = (v) => { clearTimeout(t); res(v); };
            onErr = (e) => { clearTimeout(t); rej(e); };
          }),
        close: () => { try { server.close(); } catch { /* yok say */ } },
      });
    });
  });
}

async function postForm(url: string, body: Record<string, string>): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body).toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 200)}`); }
}

async function openBrowser(url: string): Promise<void> {
  try {
    const { platform } = process;
    const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
    const { spawn } = await import("child_process");
    spawn(cmd, [url], { shell: platform === "win32", stdio: "ignore", detached: true }).unref();
  } catch { /* tarayıcı açılamadıysa kullanıcı URL'yi elle açar */ }
}

const dec = (s: string) => Buffer.from(s, "base64").toString("utf-8");

// ── Sağlayıcı tanımları ──────────────────────────────────────────────────────

interface ProviderDef {
  id: OAuthProviderId;
  name: string;
  login(cb: LoginCallbacks): Promise<OAuthCreds>;
  refresh(creds: OAuthCreds): Promise<OAuthCreds>;
}

// —— Anthropic (Claude Pro/Max) ————————————————————————————————————————
const ANTHROPIC = {
  clientId: dec("OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl"),
  authorize: "https://claude.ai/oauth/authorize",
  token: "https://platform.claude.com/v1/oauth/token",
  port: 53692,
  path: "/callback",
  scopes: "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload",
};

const anthropicProvider: ProviderDef = {
  id: "anthropic",
  name: "Claude Pro/Max (Anthropic)",
  async login(cb) {
    const { verifier, challenge } = generatePKCE();
    const redirect = `http://localhost:${ANTHROPIC.port}${ANTHROPIC.path}`;
    const state = randomState();
    const server = await startLoopback(ANTHROPIC.port, ANTHROPIC.path);
    try {
      const params = new URLSearchParams({
        response_type: "code",
        client_id: ANTHROPIC.clientId,
        redirect_uri: redirect,
        scope: ANTHROPIC.scopes,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
      });
      const url = `${ANTHROPIC.authorize}?${params.toString()}`;
      cb.onAuth({ url, instructions: "Complete login in your browser." });
      await openBrowser(url);
      const { code } = await server.waitForCode();
      cb.onProgress?.("Exchanging authorization code…");
      const json = await postForm(ANTHROPIC.token, {
        grant_type: "authorization_code",
        code,
        client_id: ANTHROPIC.clientId,
        redirect_uri: redirect,
        code_verifier: verifier,
        state,
      });
      return {
        access: json.access_token,
        refresh: json.refresh_token,
        expires: Date.now() + (json.expires_in ?? 3600) * 1000,
      };
    } finally {
      server.close();
    }
  },
  async refresh(creds) {
    const json = await postForm(ANTHROPIC.token, {
      grant_type: "refresh_token",
      refresh_token: creds.refresh,
      client_id: ANTHROPIC.clientId,
    });
    return {
      access: json.access_token,
      refresh: json.refresh_token ?? creds.refresh,
      expires: Date.now() + (json.expires_in ?? 3600) * 1000,
    };
  },
};

// —— OpenAI (ChatGPT Plus / Codex) ————————————————————————————————————
const OPENAI = {
  clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
  authorize: "https://auth.openai.com/oauth/authorize",
  token: "https://auth.openai.com/oauth/token",
  redirect: "http://localhost:1455/auth/callback",
  port: 1455,
  path: "/auth/callback",
  scope: "openid profile email offline_access",
};

const openaiProvider: ProviderDef = {
  id: "openai",
  name: "ChatGPT Plus (OpenAI)",
  async login(cb) {
    const { verifier, challenge } = generatePKCE();
    const state = randomState();
    const server = await startLoopback(OPENAI.port, OPENAI.path);
    try {
      const url = new URL(OPENAI.authorize);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", OPENAI.clientId);
      url.searchParams.set("redirect_uri", OPENAI.redirect);
      url.searchParams.set("scope", OPENAI.scope);
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", "S256");
      url.searchParams.set("state", state);
      cb.onAuth({ url: url.toString() });
      await openBrowser(url.toString());
      const { code } = await server.waitForCode();
      cb.onProgress?.("Exchanging authorization code…");
      const json = await postForm(OPENAI.token, {
        grant_type: "authorization_code",
        code,
        client_id: OPENAI.clientId,
        redirect_uri: OPENAI.redirect,
        code_verifier: verifier,
      });
      const accountId = decodeAccountId(json.access_token);
      return {
        access: json.access_token,
        refresh: json.refresh_token,
        expires: Date.now() + (json.expires_in ?? 3600) * 1000,
        accountId,
      };
    } finally {
      server.close();
    }
  },
  async refresh(creds) {
    const json = await postForm(OPENAI.token, {
      grant_type: "refresh_token",
      refresh_token: creds.refresh,
      client_id: OPENAI.clientId,
    });
    return {
      access: json.access_token,
      refresh: json.refresh_token ?? creds.refresh,
      expires: Date.now() + (json.expires_in ?? 3600) * 1000,
      accountId: creds.accountId,
    };
  },
};

function decodeAccountId(jwt: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64").toString("utf-8"));
    return payload?.["https://api.openai.com/auth"]?.chatgpt_account_id;
  } catch { return undefined; }
}

// —— GitHub Copilot (device-code flow) ————————————————————————————————
const COPILOT = {
  clientId: dec("SXYxLmI1MDdhMDhjODdlY2ZlOTg="),
  deviceCode: "https://github.com/login/device/code",
  accessToken: "https://github.com/login/oauth/access_token",
  copilotToken: "https://api.github.com/copilot_internal/v2/token",
};

const copilotProvider: ProviderDef = {
  id: "copilot",
  name: "GitHub Copilot",
  async login(cb) {
    const dc = await postForm(COPILOT.deviceCode, { client_id: COPILOT.clientId, scope: "read:user" });
    cb.onAuth({
      url: dc.verification_uri,
      instructions: `Enter code ${dc.user_code} at ${dc.verification_uri}`,
    });
    await openBrowser(dc.verification_uri);
    const deadline = Date.now() + (dc.expires_in ?? 900) * 1000;
    let intervalMs = (dc.interval ?? 5) * 1000;
    // GitHub OAuth token (device flow polling)
    let ghToken = "";
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, intervalMs));
      const raw = await postForm(COPILOT.accessToken, {
        client_id: COPILOT.clientId,
        device_code: dc.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }).catch(() => ({}));
      if (raw.access_token) { ghToken = raw.access_token; break; }
      if (raw.error === "slow_down") intervalMs += 5000;
      else if (raw.error && raw.error !== "authorization_pending") throw new Error(String(raw.error_description ?? raw.error));
      cb.onProgress?.("Waiting for authorization…");
    }
    if (!ghToken) throw new Error("Copilot device authorization timed out");
    // GitHub OAuth token → short-lived Copilot API token
    const ct = await fetchCopilotToken(ghToken);
    return { access: ct.token, refresh: ghToken, expires: ct.expiresAt * 1000, ghToken };
  },
  async refresh(creds) {
    const gh = (creds.ghToken as string) || creds.refresh;
    const ct = await fetchCopilotToken(gh);
    return { access: ct.token, refresh: gh, expires: ct.expiresAt * 1000, ghToken: gh };
  },
};

async function fetchCopilotToken(ghToken: string): Promise<{ token: string; expiresAt: number }> {
  const res = await fetch(COPILOT.copilotToken, {
    headers: { Authorization: `token ${ghToken}`, Accept: "application/json", "User-Agent": "Cowrangler" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Copilot token failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  const j = JSON.parse(text);
  return { token: j.token, expiresAt: j.expires_at ?? Math.floor(Date.now() / 1000) + 1500 };
}

// —— Google (Gemini CLI + Antigravity) ————————————————————————————————
const GEMINI = {
  // Resmi Gemini CLI public client (caveman-code / pi-ai ile birebir aynı).
  clientId: dec("NjgxMjU1ODA5Mzk1LW9vOGZ0Mm9wcmRybnA5ZTNhcWY2YXYzaG1kaWIxMzVqLmFwcHMuZ29vZ2xldXNlcmNvbnRlbnQuY29t"),
  clientSecret: dec("R09DU1BYLTR1SGdNUG0tMW83U2stZ2VWNkN1NWNsWEZzeGw="),
  redirect: "http://localhost:8085/oauth2callback",
  port: 8085,
  path: "/oauth2callback",
  scopes: [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ],
};

const ANTIGRAVITY = {
  // Antigravity'nin KENDİ public client'ı — Gemini CLI'nınkinden farklı (caveman
  // ile birebir). Daha önce yanlışlıkla GEMINI.clientId kullanılıyordu → Google
  // "Error 401: invalid_client / OAuth client was not found" veriyordu.
  clientId: dec("MTA3MTAwNjA2MDU5MS10bWhzc2luMmgyMWxjcmUyMzV2dG9sb2poNGc0MDNlcC5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbQ=="),
  clientSecret: dec("R09DU1BYLUs1OEZXUjQ4NkxkTEoxbUxCOHNYQzR6NnFEQWY="),
  redirect: "http://localhost:51121/oauth-callback",
  port: 51121,
  path: "/oauth-callback",
  scopes: [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/cclog",
    "https://www.googleapis.com/auth/experimentsandconfigs",
  ],
};

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";

// Cloud Code Assist project discovery (needed for gemini-cli / antigravity
// inference). Mirrors caveman-code / pi-ai. The projectId is stored in creds and
// exported to env so llm.ts can call `/v1internal:streamGenerateContent`.
const CLOUDCODE_PROD = "https://cloudcode-pa.googleapis.com";
const ANTIGRAVITY_DEFAULT_PROJECT = "rising-fact-p41fc";

function codeAssistHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": "google-api-nodejs-client/9.15.1",
    "X-Goog-Api-Client": "gl-node/22.17.0",
  };
}

/** Discover (or provision) the user's Cloud Code Assist projectId. */
async function discoverCloudProject(accessToken: string, isAntigravity: boolean, onProgress?: (m: string) => void): Promise<string> {
  const envProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT_ID;
  const headers = codeAssistHeaders(accessToken);
  const endpoints = isAntigravity
    ? ["https://daily-cloudcode-pa.sandbox.googleapis.com", CLOUDCODE_PROD]
    : [CLOUDCODE_PROD];

  onProgress?.("Checking for Cloud Code Assist project…");
  let loaded: any = null;
  for (const endpoint of endpoints) {
    try {
      const r = await fetch(`${endpoint}/v1internal:loadCodeAssist`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          cloudaicompanionProject: envProject,
          metadata: { ideType: "IDE_UNSPECIFIED", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI", duetProject: envProject },
        }),
      });
      if (r.ok) { loaded = await r.json(); break; }
    } catch { /* try next endpoint */ }
  }

  const projFrom = (p: any): string | undefined =>
    typeof p === "string" ? p : (p && typeof p === "object" && p.id ? p.id : undefined);

  if (loaded?.cloudaicompanionProject) {
    const p = projFrom(loaded.cloudaicompanionProject);
    if (p) return p;
  }
  if (envProject) return envProject;

  // Antigravity: skip onboarding, use its shared default project.
  if (isAntigravity) return ANTIGRAVITY_DEFAULT_PROJECT;

  // Gemini-CLI free tier: onboard to provision a managed project.
  try {
    const tier = (loaded?.allowedTiers ?? []).find((t: any) => t?.isDefault)?.id ?? "free-tier";
    onProgress?.("Provisioning Cloud Code Assist project…");
    let lro: any = await postForm2(`${CLOUDCODE_PROD}/v1internal:onboardUser`, headers, {
      tierId: tier,
      metadata: { ideType: "IDE_UNSPECIFIED", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI" },
    });
    // Poll the long-running operation until done (max ~30s).
    for (let i = 0; i < 15 && lro && !lro.done && lro.name; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const pr = await fetch(`${CLOUDCODE_PROD}/v1internal/${lro.name}`, { headers }).catch(() => null);
      if (pr?.ok) lro = await pr.json();
    }
    const p = projFrom(lro?.response?.cloudaicompanionProject);
    if (p) return p;
  } catch { /* fall through */ }

  throw new Error("Could not resolve a Cloud Code project. Set GOOGLE_CLOUD_PROJECT and retry.");
}

/** POST JSON helper (loadCodeAssist / onboardUser use JSON bodies, not form). */
async function postForm2(url: string, headers: Record<string, string>, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { return {}; }
}

function makeGoogleProvider(
  id: OAuthProviderId,
  name: string,
  cfg: { clientId: string; clientSecret: string; redirect: string; port: number; path: string; scopes: string[] },
): ProviderDef {
  return {
    id,
    name,
    async login(cb) {
      const { verifier, challenge } = generatePKCE();
      const state = randomState();
      const server = await startLoopback(cfg.port, cfg.path);
      try {
        const params = new URLSearchParams({
          response_type: "code",
          client_id: cfg.clientId,
          redirect_uri: cfg.redirect,
          scope: cfg.scopes.join(" "),
          code_challenge: challenge,
          code_challenge_method: "S256",
          state,
          access_type: "offline",
          prompt: "consent",
        });
        const url = `${GOOGLE_AUTH}?${params.toString()}`;
        cb.onAuth({ url });
        await openBrowser(url);
        const { code } = await server.waitForCode();
        cb.onProgress?.("Exchanging authorization code…");
        const json = await postForm(GOOGLE_TOKEN, {
          grant_type: "authorization_code",
          code,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          redirect_uri: cfg.redirect,
          code_verifier: verifier,
        });
        // Discover the Cloud Code project so inference can target /v1internal.
        const projectId = await discoverCloudProject(json.access_token, id === "antigravity", cb.onProgress).catch(() => undefined);
        return {
          access: json.access_token,
          refresh: json.refresh_token,
          expires: Date.now() + (json.expires_in ?? 3600) * 1000,
          projectId,
        };
      } finally {
        server.close();
      }
    },
    async refresh(creds) {
      const json = await postForm(GOOGLE_TOKEN, {
        grant_type: "refresh_token",
        refresh_token: creds.refresh,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      });
      return {
        access: json.access_token,
        refresh: json.refresh_token ?? creds.refresh,
        expires: Date.now() + (json.expires_in ?? 3600) * 1000,
        projectId: creds.projectId, // preserve discovered project across refresh
      };
    },
  };
}

// ── Registry ─────────────────────────────────────────────────────────────────

const PROVIDERS: Record<string, ProviderDef> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  copilot: copilotProvider,
  gemini: makeGoogleProvider("gemini", "Gemini (Google)", GEMINI),
  antigravity: makeGoogleProvider("antigravity", "Antigravity (Google)", ANTIGRAVITY),
};

export const OAUTH_PROVIDER_IDS: OAuthProviderId[] = Object.keys(PROVIDERS) as OAuthProviderId[];

export function listOAuthProviders(): { id: OAuthProviderId; name: string; connected: boolean }[] {
  return OAUTH_PROVIDER_IDS.map((id) => ({
    id,
    name: PROVIDERS[id].name,
    connected: !!loadCreds(id),
  }));
}

// ── Kalıcılık ────────────────────────────────────────────────────────────────

function loadCreds(id: OAuthProviderId): OAuthCreds | null {
  const raw = getSecret(VAULT_NS, id);
  if (!raw) return null;
  try { return JSON.parse(raw) as OAuthCreds; } catch { return null; }
}

function saveCreds(id: OAuthProviderId, creds: OAuthCreds): void {
  // forcePlain: bu token'lar CLI VE desktop arasında paylaşılmak ZORUNDA
  // (bir yerde login olup diğerinde API-anahtarsız çalışmak — bkz.
  // applyOAuthEnv). electron.safeStorage yalnızca Electron sürecinde var;
  // desktop'ta "safe" modda yazılan bir hücreyi CLI hiçbir zaman çözemez
  // (aynı dosyayı paylaşsalar da). Bkz. credential_vault.ts SetSecretsOpts.
  setSecret(VAULT_NS, id, JSON.stringify(creds), { forcePlain: true });
}

export function logoutOAuth(id: OAuthProviderId): void {
  setSecret(VAULT_NS, id, null);
}

// ── Genel API ────────────────────────────────────────────────────────────────

export async function loginOAuth(id: OAuthProviderId, cb: LoginCallbacks): Promise<OAuthCreds> {
  const provider = PROVIDERS[id];
  if (!provider) throw new Error(`Unknown OAuth provider: ${id}`);
  const creds = await provider.login(cb);
  saveCreds(id, creds);
  return creds;
}

/** Geçerli access token'ı döndürür; süresi dolmak üzereyse yeniler. */
export async function getValidAccessToken(id: OAuthProviderId): Promise<OAuthCreds | null> {
  // Self-heal migration: eski sürümlerde bu kayıt (desktop'ta, Electron
  // safeStorage ile) "safe" modda yazılmış olabilir — CLI'dan asla
  // okunamaz. Şu an başarıyla çözebildiysek (yani ya zaten "plain" ya da
  // buradaki süreç Electron'un kendisi), taşınabilir "plain" moda geçir ki
  // bir sonraki CLI açılışı ayrıca login istemeden çalışsın.
  if (getSecretMode(VAULT_NS, id) === "safe") {
    const migrated = loadCreds(id);
    if (migrated) saveCreds(id, migrated); // saveCreds artık her zaman forcePlain
  }

  let creds = loadCreds(id);
  if (!creds) return null;
  // 60 sn tampon
  if (creds.expires - Date.now() < 60_000) {
    try {
      creds = await PROVIDERS[id].refresh(creds);
      saveCreds(id, creds);
    } catch {
      return creds; // yenileme başarısızsa mevcut token ile dene
    }
  }
  return creds;
}

/**
 * Başlangıçta çağrılır: bağlı tüm sağlayıcıların geçerli token'larını çözer ve
 * `llm.ts`'in okuduğu env işaretlerini kurar. Böylece OAuth ile giriş yapıldıysa
 * API key olmadan model çalışır.
 */
export async function applyOAuthEnv(): Promise<void> {
  for (const id of OAUTH_PROVIDER_IDS) {
    const creds = await getValidAccessToken(id).catch(() => null);
    if (!creds) continue;
    switch (id) {
      case "anthropic":
        if (!process.env.ANTHROPIC_API_KEY) {
          process.env.COWRANGLER_OAUTH_ANTHROPIC = creds.access;
        }
        break;
      case "openai":
        if (!process.env.OPENAI_API_KEY) {
          process.env.COWRANGLER_OAUTH_OPENAI = creds.access;
          if (creds.accountId) process.env.COWRANGLER_OAUTH_OPENAI_ACCOUNT = String(creds.accountId);
        }
        break;
      case "copilot":
        if (!process.env.GITHUB_TOKEN) {
          process.env.COWRANGLER_OAUTH_COPILOT = creds.access;
        }
        break;
      case "gemini":
        // Cloud Code Assist (gemini-cli): token + discovered projectId.
        process.env.COWRANGLER_OAUTH_GEMINI = creds.access;
        if (creds.projectId) process.env.COWRANGLER_OAUTH_GEMINI_PROJECT = String(creds.projectId);
        break;
      case "antigravity":
        process.env.COWRANGLER_OAUTH_ANTIGRAVITY = creds.access;
        if (creds.projectId) process.env.COWRANGLER_OAUTH_ANTIGRAVITY_PROJECT = String(creds.projectId);
        break;
    }
  }
}
