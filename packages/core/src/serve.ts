/**
 * serve — Cowrangler ajanını yerel bir HTTP servisi olarak açar.
 *
 * `cowrangler serve` ile başlatılır. Dış uygulamalar (desktop, SDK, script'ler)
 * tek, tutarlı bir API üzerinden ajanla konuşabilir.
 *
 * Uç noktalar:
 *   GET  /health                → { ok, version, model }
 *   POST /chat  { message, model? } → { text, tokenCount, durationMs }
 *   POST /reset                 → { ok }   (oturum bağlamını temizler)
 *
 * Güvenlik: config.serve.token ayarlıysa `Authorization: Bearer <token>` gerekir.
 * Varsayılan olarak yalnızca 127.0.0.1'e bağlanır.
 */

import http from "http";
import { Agent } from "./agent.js";
import { LLM } from "./llm.js";
import { getConfig, getVersion } from "./init.js";

interface ServeOpts { port?: number; host?: string; token?: string; }

export async function startServer(opts: ServeOpts = {}): Promise<void> {
  const config = getConfig();
  const port = opts.port ?? (config as any).serve?.port ?? 8787;
  const host = opts.host ?? (config as any).serve?.host ?? "127.0.0.1";
  const token = opts.token ?? (config as any).serve?.token ?? null;

  let llm = new LLM(config.model, config.temperature);
  let agent = new Agent(llm, config.system_prompt, config.max_iterations, undefined, "cli");

  // Basit istek serileştirme — tek ajan durumu, eşzamanlı çakışmayı önler.
  let chain: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run as Promise<T>;
  };

  const readBody = (req: http.IncomingMessage): Promise<any> =>
    new Promise((resolve) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    });

  const server = http.createServer(async (req, res) => {
    const send = (code: number, obj: unknown) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    try {
      if (token) {
        const auth = req.headers["authorization"];
        if (auth !== `Bearer ${token}`) return send(401, { error: "unauthorized" });
      }

      if (req.method === "GET" && req.url === "/health") {
        return send(200, { ok: true, version: getVersion(), model: llm.model });
      }

      if (req.method === "POST" && req.url === "/reset") {
        return send(200, await enqueue(async () => { agent.reset(); return { ok: true }; }));
      }

      if (req.method === "POST" && req.url === "/chat") {
        const body = await readBody(req);
        const message = String(body?.message ?? "").trim();
        if (!message) return send(400, { error: "message required" });
        const result = await enqueue(async () => {
          if (body?.model && body.model !== llm.model) {
            llm = new LLM(String(body.model), config.temperature);
            agent.setModel(llm);
          }
          return agent.chat(message);
        });
        return send(200, {
          text: (result as any).text,
          tokenCount: (result as any).tokenCount,
          durationMs: (result as any).durationMs,
        });
      }

      send(404, { error: "not found" });
    } catch (e: any) {
      send(500, { error: e?.message ?? String(e) });
    }
  });

  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  const authNote = token ? " (token required)" : "";
  console.log(`\n  Cowrangler serve → http://${host}:${port}${authNote}`);
  console.log(`  Endpoints: GET /health · POST /chat {message,model?} · POST /reset\n`);
  // Sonsuza dek çalış
  await new Promise<void>(() => {});
}
