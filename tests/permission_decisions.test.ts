import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SessionDB } from "@cowrangler/core/session_db.js";

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeDb(): SessionDB {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cowrangler-perm-audit-"));
  tmpDirs.push(dir);
  return new SessionDB(path.join(dir, "sessions.db"));
}

describe("SessionDB permission decision audit records", () => {
  it("records an allowed decision", () => {
    const db = makeDb();
    const sessionId = db.createSession({ source: "cli", model: "test-model" });

    db.recordPermissionDecision({
      sessionId,
      toolName: "read_file",
      riskLevel: "safe",
      decision: "allowed",
      source: "auto",
    });

    const rows = db.listPermissionDecisions({ sessionId });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      session_id: sessionId,
      tool_name: "read_file",
      risk_level: "safe",
      decision: "allowed",
      source: "auto",
    });

    db.close();
  });

  it("records a denied decision with a reason and extra_info", () => {
    const db = makeDb();
    const sessionId = db.createSession({ source: "cli", model: "test-model" });

    db.recordPermissionDecision({
      sessionId,
      toolName: "execute_bash",
      riskLevel: "dangerous",
      decision: "denied",
      source: "user",
      reason: "User denied permission.",
      extraInfo: "rm -rf /tmp/x",
    });

    const rows = db.listPermissionDecisions({ sessionId });
    expect(rows[0].decision).toBe("denied");
    expect(rows[0].reason).toBe("User denied permission.");
    expect(rows[0].extra_info).toBe("rm -rf /tmp/x");

    db.close();
  });

  it("filters by tool name across sessions", () => {
    const db = makeDb();
    const s1 = db.createSession({ source: "cli", model: "m" });
    const s2 = db.createSession({ source: "cli", model: "m" });

    db.recordPermissionDecision({ sessionId: s1, toolName: "write_file", riskLevel: "moderate", decision: "allowed", source: "auto" });
    db.recordPermissionDecision({ sessionId: s2, toolName: "delete_file", riskLevel: "dangerous", decision: "denied", source: "user" });

    expect(db.listPermissionDecisions({ toolName: "write_file" })).toHaveLength(1);
    expect(db.listPermissionDecisions({ toolName: "delete_file" })).toHaveLength(1);
    expect(db.listPermissionDecisions({})).toHaveLength(2);

    db.close();
  });

  it("deleting a session cascades to its permission decisions", () => {
    const db = makeDb();
    const sessionId = db.createSession({ source: "cli", model: "m" });
    db.recordPermissionDecision({ sessionId, toolName: "read_file", riskLevel: "safe", decision: "allowed", source: "auto" });

    db.deleteSession(sessionId);

    expect(db.listPermissionDecisions({ sessionId })).toHaveLength(0);

    db.close();
  });
});
