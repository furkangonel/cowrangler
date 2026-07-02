#!/usr/bin/env node
/**
 * microbench — küçük, tekrarlanabilir ajan değerlendirme koşucusu.
 *
 * `cowrangler serve` çalışırken, tasks.json içindeki her görevi POST /chat ile
 * koşar, her görevin `verify` regex'iyle geçme durumunu ölçer ve toplam token +
 * geçme oranını raporlar. Model/prompt değişikliklerinin ajan performansına
 * etkisini objektif ölçmek için.
 *
 * Kullanım:
 *   1) cowrangler serve            # ayrı terminalde
 *   2) node scripts/microbench/run.mjs [--url http://127.0.0.1:8787] [--token X]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const url = arg("--url", "http://127.0.0.1:8787");
const token = arg("--token", process.env.COWRANGLER_SERVE_TOKEN || "");

const tasksPath = path.join(__dir, "tasks.json");
const tasks = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));

async function chat(message) {
  const res = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

let pass = 0, totalTokens = 0;
const rows = [];
for (const t of tasks) {
  const started = Date.now();
  try {
    const r = await chat(t.prompt);
    const ok = new RegExp(t.verify, "i").test(r.text ?? "");
    if (ok) pass++;
    totalTokens += r.tokenCount ?? 0;
    rows.push({ id: t.id, ok, tokens: r.tokenCount ?? 0, ms: Date.now() - started });
  } catch (e) {
    rows.push({ id: t.id, ok: false, tokens: 0, ms: Date.now() - started, error: String(e.message) });
  }
  // Her görev sonrası bağlamı temizle
  await fetch(`${url}/reset`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} }).catch(() => {});
}

console.table(rows);
console.log(`\nPass: ${pass}/${tasks.length}   Total tokens: ${totalTokens}`);
process.exit(pass === tasks.length ? 0 : 1);
