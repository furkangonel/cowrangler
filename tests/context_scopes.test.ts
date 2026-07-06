import { describe, it, expect, beforeAll } from "vitest";
import { setProjectContext, setActiveSessionId } from "@cowrangler/core/project_context.js";
import { getScopePaths, orderedScopePaths, describeContextScopes } from "@cowrangler/core/context_scopes.js";

beforeAll(() => {
  setProjectContext("/tmp/proj");
  setActiveSessionId("s1");
});

describe("context_scopes — kanonik üç-katman yollar", () => {
  it("skills: global/proje/session", () => {
    const s = getScopePaths("skills");
    expect(s.project).toBe("/tmp/proj/.cowrangler/skills");
    expect(s.session).toBe("/tmp/proj/.cowrangler/context/skills/s1");
    expect(s.global).toMatch(/\.cowrangler\/skills$/);
  });

  it("agents: global/proje/session", () => {
    const a = getScopePaths("agents");
    expect(a.project).toBe("/tmp/proj/.cowrangler/agents");
    expect(a.session).toBe("/tmp/proj/.cowrangler/context/agents/s1");
    expect(a.global).toMatch(/\.cowrangler\/agents$/);
  });

  it("memory: global(md)/proje(dir)/session(md)", () => {
    const m = getScopePaths("memory");
    expect(m.project).toBe("/tmp/proj/.cowrangler/memory");
    expect(m.session).toBe("/tmp/proj/.cowrangler/context/memory/s1.md");
    expect(m.global).toMatch(/\.cowrangler\/memory\.md$/);
  });

  it("instructions: yalnız proje (COWRNGLR.md)", () => {
    const i = getScopePaths("instructions");
    expect(i.project).toBe("/tmp/proj/COWRNGLR.md");
    expect(i.global).toBeUndefined();
    expect(i.session).toBeUndefined();
  });

  it("orderedScopePaths precedence sırasını korur (global→session)", () => {
    const ordered = orderedScopePaths("skills").map((x) => x.scope);
    expect(ordered).toEqual(["global", "project", "session"]);
    // instructions yalnız project
    expect(orderedScopePaths("instructions").map((x) => x.scope)).toEqual(["project"]);
  });

  it("explicit sessionId parametresi aktif session'ı ezer", () => {
    expect(getScopePaths("skills", "other").session).toBe("/tmp/proj/.cowrangler/context/skills/other");
  });

  it("describeContextScopes tüm haritayı verir", () => {
    const map = describeContextScopes();
    expect(Object.keys(map).sort()).toEqual(["agents", "instructions", "memory", "skills"]);
  });
});
