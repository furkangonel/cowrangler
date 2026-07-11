import { describe, it, expect, beforeAll } from "vitest";
import { setProjectContext, setActiveSessionId } from "@cowrangler/core/project_context.js";
import { getScopePaths, orderedScopePaths, describeContextScopes } from "@cowrangler/core/context_scopes.js";

beforeAll(() => {
  setProjectContext("/tmp/proj");
  setActiveSessionId("s1");
});

describe("context_scopes — kanonik üç-katman yollar", () => {
  // Session katmanı artık global proje deposunda (proje dizinini kirletmez):
  //   ~/.cowrangler/projects/<label>-<hash>/context/...
  // Bu yüzden session yolları proje dizini altında OLMAMALI.
  it("skills: proje-lokal proje, global-store session", () => {
    const s = getScopePaths("skills");
    expect(s.project).toBe("/tmp/proj/.cowrangler/skills");
    expect(s.session).toMatch(/\/projects\/proj-[0-9a-f]{16}\/context\/skills\/s1$/);
    expect(s.session).not.toContain("/tmp/proj/");
    expect(s.global).toMatch(/\.cowrangler\/skills$/);
  });

  it("agents: proje-lokal proje, global-store session", () => {
    const a = getScopePaths("agents");
    expect(a.project).toBe("/tmp/proj/.cowrangler/agents");
    expect(a.session).toMatch(/\/projects\/proj-[0-9a-f]{16}\/context\/agents\/s1$/);
    expect(a.session).not.toContain("/tmp/proj/");
    expect(a.global).toMatch(/\.cowrangler\/agents$/);
  });

  it("memory: global(md)/proje(dir)/session(store md)", () => {
    const m = getScopePaths("memory");
    expect(m.project).toBe("/tmp/proj/.cowrangler/memory");
    expect(m.session).toMatch(/\/projects\/proj-[0-9a-f]{16}\/context\/memory\/s1\.md$/);
    expect(m.session).not.toContain("/tmp/proj/");
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
    expect(getScopePaths("skills", "other").session).toMatch(
      /\/projects\/proj-[0-9a-f]{16}\/context\/skills\/other$/,
    );
  });

  it("describeContextScopes tüm haritayı verir", () => {
    const map = describeContextScopes();
    expect(Object.keys(map).sort()).toEqual(["agents", "instructions", "memory", "skills"]);
  });
});
