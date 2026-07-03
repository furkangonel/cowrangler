/**
 * git_tools — runGit'in process.cwd() yerine getProjectWorkdir() kullandığını
 * doğrulayan entegrasyon testi (WP-1 bug fix).
 *
 * Desktop'ta process.cwd() Electron'un başlatıldığı dizindir; git komutları bu
 * yüzden yanlış depoda çalışırdı. Bu test, aktif proje dizinini ayrı bir geçici
 * git deposuna ayarlar ve git_status'un o deponun branch'ini raporladığını
 * doğrular — yani runGit çalışma dizinini getProjectWorkdir()'den alır.
 */

import { describe, it, expect, afterEach } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import "../src/tools/git_tools.js"; // tool'ları TOOL_SCHEMAS'e kaydeder
import { TOOL_SCHEMAS } from "../src/tools/registry.js";
import {
  setProjectContext,
  getProjectWorkdir,
} from "../src/core/project_context.js";

const BRANCH = "wp1-cwd-check";
let tmpRepo: string;
const original = getProjectWorkdir();

afterEach(() => {
  setProjectContext(original);
  if (tmpRepo && fs.existsSync(tmpRepo)) {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  }
});

describe("git_tools runGit çalışma dizini", () => {
  it("git_status aktif proje (getProjectWorkdir) deposunda çalışır", async () => {
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "wp1-git-"));
    const run = (c: string) => execSync(c, { cwd: tmpRepo, stdio: "pipe" });
    run(`git init -b ${BRANCH}`);
    run(`git config user.email wp1@test.local`);
    run(`git config user.name "WP1 Test"`);
    run(`git commit --allow-empty -m init`); // HEAD çözülebilsin diye ilk commit

    // Aktif proje dizinini geçici depoya işaret ettir.
    setProjectContext(tmpRepo);

    const out: any = await TOOL_SCHEMAS["git_status"].execute({});
    const text = String(out?.result ?? out);

    expect(text).toContain(`Branch: ${BRANCH}`);
  });
});
