import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * data_layout — kanonik veri yerleşiminin sözleşmesini kilitler:
 *   - ÜRETİLEN / OTURUM verisi (history, recall, tasks, context, audit) global
 *     proje deposuna (~/.cowrangler/projects/<label>-<hash>/) gider — proje
 *     dizinine ASLA yazılmaz.
 *   - PROJE-YAZIMI verisi (memory, skills, agents) ve tek istisna olan plans,
 *     {workdir}/.cowrangler altında kalır.
 *   - migrateProjectLayout eski kirli yerleşimi güvenli+idempotent taşır.
 *
 * COWRANGLER_HOME'u dinamik import'tan ÖNCE geçici bir dizine sabitleriz; böylece
 * gerçek ~/.cowrangler'a dokunmayız (modül GLOBAL_HOME'u yükleme anında okur).
 */

let PC: typeof import("@cowrangler/core/project_context.js");
let HOME: string;

beforeAll(async () => {
  HOME = fs.mkdtempSync(path.join(os.tmpdir(), "cw-home-"));
  process.env.COWRANGLER_HOME = HOME;
  PC = await import("@cowrangler/core/project_context.js");
});

describe("data_layout — global proje deposu yolları", () => {
  it("store, COWRANGLER_HOME/projects altında ve etiket+hash içerir", () => {
    const wd = "/tmp/some/My Proj";
    const store = PC.projectStoreDirFor(wd);
    expect(store.startsWith(path.join(HOME, "projects"))).toBe(true);
    expect(store).toMatch(/\/My_Proj-[0-9a-f]{16}$/); // güvensiz karakterler temizlenir
  });

  it("aynı yol → aynı store; farklı yol → farklı store", () => {
    expect(PC.projectStoreDirFor("/a/b")).toBe(PC.projectStoreDirFor("/a/b"));
    expect(PC.projectStoreDirFor("/a/b")).not.toBe(PC.projectStoreDirFor("/a/c"));
  });

  it("üretilen veri getter'ları store altında — proje dizininde DEĞİL", () => {
    const wd = fs.mkdtempSync(path.join(os.tmpdir(), "cw-proj-"));
    PC.setProjectContext(wd);
    PC.setActiveSessionId("s1");
    const store = PC.projectStoreDirFor(wd);

    for (const p of [
      PC.getProjectHistoryFile(),
      PC.getProjectRecallFile(),
      PC.getProjectAuditLog(),
      PC.getProjectTasksDir(),
      PC.getProjectContextDir(),
      PC.getProjectContextSkillsDir(),
    ]) {
      expect(p.startsWith(store)).toBe(true);
      expect(p.startsWith(wd)).toBe(false);
    }
    expect(PC.getProjectRecallFile()).toBe(path.join(store, "memory", "recall.jsonl"));
    expect(PC.getProjectAuditLog()).toBe(path.join(store, "audit.log"));
  });

  it("proje-yazımı getter'ları {workdir}/.cowrangler altında", () => {
    const wd = fs.mkdtempSync(path.join(os.tmpdir(), "cw-proj-"));
    PC.setProjectContext(wd);
    expect(PC.getProjectMemoryDir()).toBe(path.join(wd, ".cowrangler", "memory"));
    expect(PC.getProjectLocalSkillsDir()).toBe(path.join(wd, ".cowrangler", "skills"));
    expect(PC.getProjectLocalAgentsDir()).toBe(path.join(wd, ".cowrangler", "agents"));
  });

  it("plans BİLİNÇLİ istisna: {workdir}/.cowrangler/plans altında kalır", () => {
    const wd = fs.mkdtempSync(path.join(os.tmpdir(), "cw-proj-"));
    PC.setProjectContext(wd);
    PC.setActiveSessionId("s9");
    expect(PC.getProjectPlanFile()).toBe(path.join(wd, ".cowrangler", "plans", "s9.md"));
  });
});

describe("data_layout — migration (eski → yeni, güvenli & idempotent)", () => {
  it("plugin'i global'e, üretilen veriyi store'a taşır; plans+skills kalır; kalıntı silinir", () => {
    const wd = fs.mkdtempSync(path.join(os.tmpdir(), "cw-legacy-"));
    const base = path.join(wd, ".cowrangler");
    const mk = (rel: string, body = "x") => {
      const full = path.join(base, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, body, "utf-8");
    };

    // Eski, kirli yerleşim
    mk("plugins/foo/plugin.json", '{"id":"foo"}');
    mk("plugins/foo/node_modules/dep/index.js", "heavy");
    mk("history", "cmd1\ncmd2\n");
    mk("tasks/default/1.json", '{"id":"1"}');
    mk("context/skills/s1/caveman/SKILL.md", "skill");
    mk("memory/recall.jsonl", '{"ts":1}\n');
    mk("memory.md", "# Proje Hafızası (Context)\n"); // yalnız şablon başlık → silinmeli
    fs.writeFileSync(path.join(base, "tasks.json"), ""); // boş → silinmeli
    fs.writeFileSync(path.join(base, ".DS_Store"), "junk");
    mk("plans/s1.md", "plan"); // KALMALI (istisna)
    mk("skills/myskill/SKILL.md", "mine"); // KALMALI (proje-yazımı)

    PC.migrateProjectLayout(wd);
    const store = PC.projectStoreDirFor(wd);

    // Plugin → global
    expect(fs.existsSync(path.join(base, "plugins"))).toBe(false);
    expect(fs.existsSync(path.join(HOME, "plugins", "foo", "plugin.json"))).toBe(true);

    // Üretilen → store
    expect(fs.readFileSync(path.join(store, "history"), "utf-8")).toContain("cmd1");
    expect(fs.existsSync(path.join(store, "tasks", "default", "1.json"))).toBe(true);
    expect(fs.existsSync(path.join(store, "context", "skills", "s1", "caveman", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(store, "memory", "recall.jsonl"))).toBe(true);
    expect(fs.existsSync(path.join(base, "history"))).toBe(false);

    // Kalıntı temizlendi
    expect(fs.existsSync(path.join(base, "memory.md"))).toBe(false);
    expect(fs.existsSync(path.join(base, "tasks.json"))).toBe(false);
    expect(fs.existsSync(path.join(base, ".DS_Store"))).toBe(false);

    // Proje-yazımı + plans KALDI
    expect(fs.existsSync(path.join(base, "plans", "s1.md"))).toBe(true);
    expect(fs.existsSync(path.join(base, "skills", "myskill", "SKILL.md"))).toBe(true);

    // İşaretçi yazıldı
    expect(fs.existsSync(path.join(store, ".migrated"))).toBe(true);
  });

  it("anlamlı memory.md içeriği kaybolmaz → memory/project.md'ye taşınır", () => {
    const wd = fs.mkdtempSync(path.join(os.tmpdir(), "cw-legacy2-"));
    const base = path.join(wd, ".cowrangler");
    fs.mkdirSync(base, { recursive: true });
    fs.writeFileSync(path.join(base, "memory.md"), "# Notes\nGerçek mimari kararı burada.\n", "utf-8");

    PC.migrateProjectLayout(wd);

    expect(fs.existsSync(path.join(base, "memory.md"))).toBe(false);
    const moved = fs.readFileSync(path.join(base, "memory", "project.md"), "utf-8");
    expect(moved).toContain("Gerçek mimari kararı");
  });

  it("idempotent: ikinci çağrı işaretçiden sonra hiçbir şeyi bozmaz", () => {
    const wd = fs.mkdtempSync(path.join(os.tmpdir(), "cw-legacy3-"));
    const base = path.join(wd, ".cowrangler");
    fs.mkdirSync(path.join(base, "plans"), { recursive: true });
    fs.writeFileSync(path.join(base, "plans", "s1.md"), "plan", "utf-8");

    PC.migrateProjectLayout(wd);
    PC.migrateProjectLayout(wd); // tekrar — throw etmemeli
    expect(fs.existsSync(path.join(base, "plans", "s1.md"))).toBe(true);
  });
});
