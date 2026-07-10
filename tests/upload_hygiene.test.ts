import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  sanitizeUploadName,
  uniqueUploadName,
  uploadRelPath,
} from "../apps/desktop/src/electron/ipc/upload_hygiene";

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cowrangler-upload-"));
  tmpDirs.push(dir);
  return dir;
}

describe("upload hygiene", () => {
  it("sanitizes uploaded file names without preserving path traversal", () => {
    expect(sanitizeUploadName("../../evil file!!.PNG")).toBe("evil file_.png");
    expect(sanitizeUploadName("...")).toBe("file");
    expect(sanitizeUploadName("résumé final.pdf")).toBe("r_sum_ final.pdf");
  });

  it("generates deterministic unique names inside the upload directory", () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, "report.pdf"), "existing");

    expect(uniqueUploadName(dir, "report.pdf")).toBe("report-1.pdf");
  });

  it("returns normalized upload-relative paths", () => {
    expect(uploadRelPath("../unsafe name.PNG")).toBe("uploads/unsafe name.png");
  });
});
