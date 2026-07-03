/**
 * core/git — WP-4 paylaşılan git çekirdeği testleri.
 *
 * Geçici bir depo kurup status/stage/unstage/commit/branch/diff/log akışını
 * doğrular. Tüm fonksiyonlar explicit `cwd` alır (getProjectWorkdir singleton'ına
 * dokunmadan) — böylece IPC'nin renderer'dan geçirdiği workdir davranışını taklit
 * eder.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import * as git from "../src/core/git.js";

let repo: string;
const run = (args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });

beforeAll(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "wp4-git-"));
  run(["init", "-b", "main"]);
  run(["config", "user.email", "wp4@test.local"]);
  run(["config", "user.name", "WP4 Test"]);
  run(["commit", "--allow-empty", "-m", "init"]);
});

afterAll(() => {
  if (repo && fs.existsSync(repo)) fs.rmSync(repo, { recursive: true, force: true });
});

describe("core/git", () => {
  it("isGitRepo geçici depoyu tanır, rasgele dizini tanımaz", () => {
    expect(git.isGitRepo(repo)).toBe(true);
    expect(git.isGitRepo(os.tmpdir())).toBe(false);
  });

  it("status temiz ağaçta clean=true, branch=main döner", () => {
    const s = git.status(repo);
    expect(s.repo).toBe(true);
    expect(s.branch).toBe("main");
    expect(s.clean).toBe(true);
    expect(s.files).toHaveLength(0);
  });

  it("yeni dosya untracked+unstaged olarak görünür", () => {
    fs.writeFileSync(path.join(repo, "a.txt"), "hello\n");
    const s = git.status(repo);
    expect(s.clean).toBe(false);
    const entry = s.files.find((f) => f.path === "a.txt");
    expect(entry).toBeTruthy();
    expect(entry!.untracked).toBe(true);
    expect(entry!.staged).toBe(false);
    expect(entry!.unstaged).toBe(true);
  });

  it("stage → dosya staged olur, unstage geri alır", () => {
    git.stage(["a.txt"], repo);
    let entry = git.status(repo).files.find((f) => f.path === "a.txt")!;
    expect(entry.staged).toBe(true);

    git.unstage(["a.txt"], repo);
    entry = git.status(repo).files.find((f) => f.path === "a.txt")!;
    expect(entry.staged).toBe(false);
    expect(entry.untracked).toBe(true);
  });

  it("commit staged değişikliği kaydeder, log'a düşer", () => {
    git.stage(["a.txt"], repo);
    const res = git.commit("feat: add a.txt", {}, repo);
    expect(res.ok).toBe(true);
    expect(git.status(repo).clean).toBe(true);

    const entries = git.log({ limit: 5 }, repo);
    expect(entries[0].subject).toBe("feat: add a.txt");
    expect(entries[0].hash).toMatch(/^[0-9a-f]{7,}$/);
  });

  it("diff --staged staged içeriği gösterir", () => {
    fs.writeFileSync(path.join(repo, "b.txt"), "line1\n");
    git.stage(["b.txt"], repo);
    const d = git.diff({ staged: true }, repo);
    expect(d).toContain("b.txt");
    expect(d).toContain("+line1");
    // temizle
    git.commit("chore: b", {}, repo);
  });

  it("branchCreate yeni branch açar ve ona geçer; branchList aktif branch'i verir", () => {
    const res = git.branchCreate("feature/x", repo);
    expect(res.ok).toBe(true);
    const bl = git.branchList(repo);
    expect(bl.current).toBe("feature/x");
    expect(bl.local).toContain("main");
    expect(bl.local).toContain("feature/x");
  });

  it("checkout var olan branch'e döner", () => {
    const res = git.checkout("main", repo);
    expect(res.ok).toBe(true);
    expect(git.branchList(repo).current).toBe("main");
  });

  it("tryGit hatalı komutta ok=false ve stderr döner", () => {
    const res = git.tryGit(["checkout", "no-such-branch"], repo);
    expect(res.ok).toBe(false);
    expect(res.stderr.length).toBeGreaterThan(0);
  });

  it("commit boş mesajda reddeder", () => {
    const res = git.commit("   ", {}, repo);
    expect(res.ok).toBe(false);
  });
});
