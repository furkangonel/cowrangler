/**
 * trace format — birim testleri (WP-1/WP-2: süreç yansıtma / path kısaltma).
 */

import { describe, it, expect } from "vitest";
import os from "os";
import { formatArgs, formatElapsed } from "../apps/cli/src/ui/ink/format.js";

const HOME = os.homedir();

describe("formatArgs — path kısaltma", () => {
  it("$HOME path key'ini ~ ile kısaltır", () => {
    expect(formatArgs("edit_file", { path: `${HOME}/dev/foo.ts` })).toBe(
      "~/dev/foo.ts",
    );
  });

  it("read_file offset+limit → path:start-end", () => {
    expect(
      formatArgs("read_file", { path: `${HOME}/x.ts`, offset: 10, limit: 40 }),
    ).toBe("~/x.ts:10-49");
  });

  it("grep pattern + path (path kısaltılır)", () => {
    expect(
      formatArgs("grep_files", { pattern: "TODO", path: `${HOME}/dev` }),
    ).toBe("TODO  ~/dev");
  });

  it("bash komutu dokunulmadan geçer (path değil)", () => {
    expect(formatArgs("execute_bash", { command: "npm test" })).toBe(
      "npm test",
    );
  });

  it("HOME dışındaki path kısaltılmaz", () => {
    expect(formatArgs("read_file", { path: "/etc/hosts" })).toBe("/etc/hosts");
  });
});

describe("formatElapsed", () => {
  it("ms → saniye (1 ondalık)", () => {
    expect(formatElapsed(1234)).toBe("1.2s");
    expect(formatElapsed(300)).toBe("0.3s");
  });
});
