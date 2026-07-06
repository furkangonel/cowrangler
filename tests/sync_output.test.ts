/**
 * sync-output — birim testleri (WP-1: CLI in-place render / DEC 2026).
 */

import { describe, it, expect } from "vitest";
import {
  classifySyncOutputSupport,
  installSyncOutput,
  BEGIN_SYNC,
  END_SYNC,
} from "../apps/cli/src/ui/ink/sync-output.js";

function fakeStream(isTTY: boolean) {
  const writes: any[] = [];
  const s: any = {
    isTTY,
    write: (chunk: any) => {
      writes.push(chunk);
      return true;
    },
  };
  return { s, writes };
}

describe("classifySyncOutputSupport", () => {
  it("non-TTY → disabled", () => {
    const { s } = fakeStream(false);
    expect(classifySyncOutputSupport(s, {})).toBe("disabled");
  });

  it("düz TTY → enabled", () => {
    const { s } = fakeStream(true);
    expect(classifySyncOutputSupport(s, {})).toBe("enabled");
  });

  it("tmux içinde → disabled (passthrough gerektirir)", () => {
    const { s } = fakeStream(true);
    expect(classifySyncOutputSupport(s, { TMUX: "/tmp/x" })).toBe("disabled");
  });

  it("TERM=screen* → disabled", () => {
    const { s } = fakeStream(true);
    expect(classifySyncOutputSupport(s, { TERM: "screen-256color" })).toBe(
      "disabled",
    );
  });

  it("kaçış valfi COWRANGLER_NO_SYNC=1 → disabled", () => {
    const { s } = fakeStream(true);
    expect(classifySyncOutputSupport(s, { COWRANGLER_NO_SYNC: "1" })).toBe(
      "disabled",
    );
  });
});

describe("installSyncOutput", () => {
  it("enabled'da string frame'leri BEGIN/END ile tek write'ta sarar", () => {
    const { s, writes } = fakeStream(true);
    const uninstall = installSyncOutput(s, {});
    s.write("frame");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toBe(BEGIN_SYNC + "frame" + END_SYNC);
    uninstall();
  });

  it("uninstall sonrası orijinal write geri döner (sarma yok)", () => {
    const { s, writes } = fakeStream(true);
    const uninstall = installSyncOutput(s, {});
    uninstall();
    s.write("after");
    expect(writes[0]).toBe("after");
  });

  it("disabled ortamda no-op (sarma yok)", () => {
    const { s, writes } = fakeStream(false);
    const uninstall = installSyncOutput(s, {});
    s.write("plain");
    expect(writes[0]).toBe("plain");
    uninstall();
  });

  it("boş string sarılmaz", () => {
    const { s, writes } = fakeStream(true);
    const uninstall = installSyncOutput(s, {});
    s.write("");
    expect(writes[0]).toBe("");
    uninstall();
  });
});
