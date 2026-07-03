import { describe, it, expect } from "vitest";
import { computeLineDiff } from "../src/desktop/lib/diff";
import { isEditTool, extractEdit } from "../src/desktop/lib/codeEdit";

// WP-3 — Code arayüzü inline diff çekirdeği testleri.

describe("computeLineDiff", () => {
  it("returns no changes for identical text", () => {
    const r = computeLineDiff("a\nb\nc", "a\nb\nc");
    expect(r.added).toBe(0);
    expect(r.removed).toBe(0);
    expect(r.lines.every((l) => l.type === "context")).toBe(true);
    expect(r.lines).toHaveLength(3);
  });

  it("detects a single changed line as one add + one del", () => {
    const r = computeLineDiff("a\nb\nc", "a\nX\nc");
    expect(r.added).toBe(1);
    expect(r.removed).toBe(1);
    const del = r.lines.find((l) => l.type === "del");
    const add = r.lines.find((l) => l.type === "add");
    expect(del?.text).toBe("b");
    expect(add?.text).toBe("X");
  });

  it("treats empty before as pure additions (new file)", () => {
    const r = computeLineDiff("", "line1\nline2");
    expect(r.removed).toBe(0);
    expect(r.added).toBe(2);
    expect(r.lines.every((l) => l.type === "add")).toBe(true);
  });

  it("treats empty after as pure deletions", () => {
    const r = computeLineDiff("x\ny", "");
    expect(r.added).toBe(0);
    expect(r.removed).toBe(2);
    expect(r.lines.every((l) => l.type === "del")).toBe(true);
  });

  it("preserves 1-indexed line numbers on both sides", () => {
    const r = computeLineDiff("a\nb", "a\nb\nc");
    const context = r.lines.filter((l) => l.type === "context");
    expect(context[0].beforeLine).toBe(1);
    expect(context[0].afterLine).toBe(1);
    const add = r.lines.find((l) => l.type === "add");
    expect(add?.afterLine).toBe(3);
    expect(add?.beforeLine).toBeUndefined();
  });

  it("handles both empty as empty diff", () => {
    const r = computeLineDiff("", "");
    expect(r.lines).toHaveLength(0);
    expect(r.added).toBe(0);
    expect(r.removed).toBe(0);
  });
});

describe("isEditTool", () => {
  it("recognizes edit/write/replace variants case-insensitively", () => {
    expect(isEditTool("edit_file")).toBe(true);
    expect(isEditTool("Write")).toBe(true);
    expect(isEditTool("str_replace")).toBe(true);
    expect(isEditTool("multi_replace")).toBe(true);
    expect(isEditTool("create_file")).toBe(true);
  });

  it("rejects non-edit tools", () => {
    expect(isEditTool("read_file")).toBe(false);
    expect(isEditTool("execute_bash")).toBe(false);
    expect(isEditTool("grep")).toBe(false);
  });
});

describe("extractEdit", () => {
  it("returns null for non-edit tools", () => {
    expect(extractEdit("read_file", { path: "a.ts" })).toBeNull();
  });

  it("extracts old_string/new_string for an Edit", () => {
    const e = extractEdit("edit_file", {
      file_path: "/repo/src/a.ts",
      old_string: "const x = 1",
      new_string: "const x = 2",
    });
    expect(e).not.toBeNull();
    expect(e!.fileName).toBe("a.ts");
    expect(e!.before).toBe("const x = 1");
    expect(e!.after).toBe("const x = 2");
    expect(e!.isFullContent).toBe(false);
  });

  it("extracts full content for a Write as new file", () => {
    const e = extractEdit("write_file", {
      path: "new.ts",
      content: "export const y = 3",
    });
    expect(e).not.toBeNull();
    expect(e!.before).toBe("");
    expect(e!.after).toBe("export const y = 3");
    expect(e!.isFullContent).toBe(true);
  });

  it("joins a multi_replace edits array", () => {
    const e = extractEdit("multi_replace", {
      file_path: "m.ts",
      edits: [
        { old_string: "a", new_string: "A" },
        { old_string: "b", new_string: "B" },
      ],
    });
    expect(e).not.toBeNull();
    expect(e!.before).toBe("a\nb");
    expect(e!.after).toBe("A\nB");
  });

  it("returns null when no recognizable payload is present", () => {
    expect(extractEdit("edit_file", { path: "a.ts" })).toBeNull();
  });

  it("falls back to 'file' when no path is given", () => {
    const e = extractEdit("write_file", { content: "hi" });
    expect(e!.fileName).toBe("file");
  });
});
