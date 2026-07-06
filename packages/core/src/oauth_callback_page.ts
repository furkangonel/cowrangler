/**
 * oauth_callback_page — OAuth loopback callback için ORTAK "bağlantı başarılı" sayfası.
 *
 * Hem `oauth_provider` (uzak MCP connector'ları) hem `oauth_subscriptions`
 * (Claude/ChatGPT/Copilot/Gemini/Antigravity abonelik girişi) aynı profesyonel
 * ekranı ve aynı marka ikonunu kullanır.
 *
 * • Uygulama ikonu `assets/icon.png`, favicon `assets/favicon.ico`.
 * • icon.png ~1.6MB olduğundan HTML'e gömülmez; loopback sunucusundan
 *   diskten servis edilir (`serveOAuthAsset`). Böylece sayfa hafif kalır.
 * • favicon.ico küçük olduğundan base64 olarak da gömülür (disk bulunamazsa
 *   yedek olarak çalışır).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { ServerResponse } from "http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** icon.png / favicon.ico'nun bulunduğu `assets` dizinini çözer (dev + paketli). */
function resolveAssetsDir(): string {
  const candidates = [
    path.resolve(__dirname, "../../assets"), // dist/core → dist/../assets? (repo/assets)
    path.resolve(__dirname, "../assets"),
    path.resolve(__dirname, "../../../assets"),
    (process as any).resourcesPath
      ? path.join((process as any).resourcesPath, "assets")
      : "",
    path.resolve(process.cwd(), "assets"),
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    try {
      if (fs.existsSync(path.join(c, "icon.png"))) return c;
    } catch {
      /* erişilemeyen aday → sonrakini dene */
    }
  }
  return candidates[0];
}

const ASSETS_DIR = resolveAssetsDir();

/** favicon'u yedek için base64 data-URI olarak yükle (disk servisi başarısız olursa). */
function loadFaviconDataUri(): string {
  try {
    const buf = fs.readFileSync(path.join(ASSETS_DIR, "favicon.ico"));
    return `data:image/x-icon;base64,${buf.toString("base64")}`;
  } catch {
    return "";
  }
}

const FAVICON_DATA_URI = loadFaviconDataUri();

/**
 * Loopback sunucusuna gelen `/icon.png` ve `/favicon.ico` isteklerini diskten
 * karşılar. İstek bu asset'lerden biriyse yanıtı yazar ve `true` döner; değilse
 * hiçbir şey yapmaz ve `false` döner (çağıran normal callback akışına devam eder).
 */
export function serveOAuthAsset(pathname: string, res: ServerResponse): boolean {
  let file: string | null = null;
  let type = "";

  if (pathname === "/icon.png" || pathname.endsWith("/icon.png")) {
    file = path.join(ASSETS_DIR, "icon.png");
    type = "image/png";
  } else if (pathname === "/favicon.ico" || pathname.endsWith("/favicon.ico")) {
    file = path.join(ASSETS_DIR, "favicon.ico");
    type = "image/x-icon";
  }

  if (!file) return false;

  try {
    if (!fs.existsSync(file)) {
      res.writeHead(404).end();
      return true;
    }
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "public, max-age=3600",
    });
    fs.createReadStream(file).pipe(res);
  } catch {
    try {
      res.writeHead(500).end();
    } catch {
      /* noop */
    }
  }
  return true;
}

/**
 * "Bağlantı başarılı" HTML sayfasını üretir.
 * @param headline büyük başlık (ör. "Connection Successful" / "Signed in")
 * @param sub      alt açıklama satırı
 */
export function buildCallbackHtml(
  headline = "Connection Successful",
  sub = "You can securely close this browser tab and return to Cowrangler.",
): string {
  const faviconTag = FAVICON_DATA_URI
    ? `<link rel="icon" type="image/x-icon" href="${FAVICON_DATA_URI}">`
    : `<link rel="icon" type="image/x-icon" href="/favicon.ico">`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cowrangler — ${headline}</title>
${faviconTag}
<style>
  :root {
    --bg: #0B0B0C;
    --card: #161618;
    --card-border: rgba(255,255,255,0.06);
    --text: #F5F4EE;
    --muted: #9A9A96;
    --accent: #E4A672;
    --success: #10B981;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background:
      radial-gradient(900px 500px at 50% -10%, rgba(228,166,114,0.10), transparent 60%),
      radial-gradient(700px 500px at 50% 120%, rgba(16,185,129,0.06), transparent 60%),
      var(--bg);
    color: var(--text);
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    margin: 0;
    -webkit-font-smoothing: antialiased;
  }
  .container {
    position: relative;
    text-align: center;
    background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0)) , var(--card);
    padding: 44px 40px 40px;
    border-radius: 22px;
    box-shadow: 0 24px 60px rgba(0,0,0,0.45), 0 2px 0 rgba(255,255,255,0.03) inset;
    border: 1px solid var(--card-border);
    max-width: 380px;
    width: calc(100% - 40px);
    animation: rise 480ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .brand-mark {
    position: relative;
    width: 84px;
    height: 84px;
    margin: 0 auto 22px;
  }
  .brand-mark img {
    width: 84px;
    height: 84px;
    border-radius: 22%;
    box-shadow: 0 8px 24px rgba(0,0,0,0.55);
    display: block;
  }
  .check {
    position: absolute;
    right: -6px;
    bottom: -6px;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--success);
    border: 3px solid var(--card);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(16,185,129,0.4);
    animation: pop 420ms cubic-bezier(0.16, 1, 0.3, 1) 260ms both;
  }
  .check svg { width: 16px; height: 16px; }
  .check path {
    stroke-dasharray: 20;
    stroke-dashoffset: 20;
    animation: draw 320ms ease-out 460ms forwards;
  }
  .wordmark {
    font-size: 12px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--accent);
    margin: 0 0 10px;
    font-weight: 600;
  }
  h1 { font-size: 22px; margin: 0 0 10px; font-weight: 650; letter-spacing: -0.01em; }
  p { color: var(--muted); font-size: 14.5px; margin: 0; line-height: 1.55; }
  .hint { margin-top: 22px; font-size: 12.5px; color: rgba(154,154,150,0.7); }
  @keyframes rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
  @keyframes pop  { from { opacity: 0; transform: scale(0.4); } to { opacity: 1; transform: scale(1); } }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  @media (prefers-reduced-motion: reduce) {
    .container, .check, .check path { animation: none; }
    .check path { stroke-dashoffset: 0; }
  }
</style>
</head>
<body>
  <div class="container">
    <div class="brand-mark">
      <img src="/icon.png" alt="Cowrangler" />
      <span class="check" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 12.5l4.2 4.2L19 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
    </div>
    <p class="wordmark">Cowrangler</p>
    <h1>${headline}</h1>
    <p>${sub}</p>
    <p class="hint">This tab will close automatically…</p>
  </div>
  <script>
    // Bazı tarayıcılar script'le açılmayan sekmeleri kapatmaya izin vermez; sessizce dener.
    setTimeout(function () { try { window.close(); } catch (e) {} }, 2500);
  </script>
</body>
</html>`;
}
