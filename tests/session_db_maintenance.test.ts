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

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cowrangler-session-db-"));
  tmpDirs.push(dir);
  return dir;
}

function makeSession(db: SessionDB, endedAt: number, pinned = false): string {
  const id = db.createSession({ source: "cli", model: "test-model" });
  db.appendMessage({ sessionId: id, role: "user", content: "hello" });
  db.closeSession(id, { input_tokens: 1, output_tokens: 1, tool_call_count: 0 });
  (db as any).db.prepare(`UPDATE sessions SET ended_at = ?, pinned = ? WHERE id = ?`).run(endedAt, pinned ? 1 : 0, id);
  return id;
}

describe("SessionDB maintenance", () => {
  it("archives sessions older than the cutoff and writes them to disk", () => {
    const dir = tmpDir();
    const db = new SessionDB(path.join(dir, "sessions.db"));
    const archiveDir = path.join(dir, "archive");

    const oldTs = Date.now() - 200 * 24 * 60 * 60 * 1000;
    const recentTs = Date.now();
    const oldId = makeSession(db, oldTs);
    const recentId = makeSession(db, recentTs);

    const archived = db.archiveOldSessions({ olderThanMs: 90 * 24 * 60 * 60 * 1000, archiveDir });

    expect(archived).toBe(1);
    expect(db.getSession(oldId)).toBeNull();
    expect(db.getSession(recentId)).not.toBeNull();
    expect(fs.existsSync(path.join(archiveDir, `session-${oldId}.json`))).toBe(true);

    const dump = JSON.parse(fs.readFileSync(path.join(archiveDir, `session-${oldId}.json`), "utf8"));
    expect(dump.session.id).toBe(oldId);
    expect(dump.messages.length).toBe(1);

    db.close();
  });

  it("never archives pinned sessions", () => {
    const dir = tmpDir();
    const db = new SessionDB(path.join(dir, "sessions.db"));
    const archiveDir = path.join(dir, "archive");

    const oldTs = Date.now() - 200 * 24 * 60 * 60 * 1000;
    const pinnedId = makeSession(db, oldTs, true);

    const archived = db.archiveOldSessions({ olderThanMs: 90 * 24 * 60 * 60 * 1000, archiveDir });

    expect(archived).toBe(0);
    expect(db.getSession(pinnedId)).not.toBeNull();

    db.close();
  });

  it("runMaintenance archives, vacuums, and records last_maintenance_at", () => {
    const dir = tmpDir();
    const db = new SessionDB(path.join(dir, "sessions.db"));
    const archiveDir = path.join(dir, "archive");

    makeSession(db, Date.now() - 200 * 24 * 60 * 60 * 1000);

    const result = db.runMaintenance({ olderThanMs: 90 * 24 * 60 * 60 * 1000, archiveDir });
    expect(result.archivedCount).toBe(1);

    // İkinci çağrı henüz interval dolmadığı için no-op döner.
    const skipped = db.maybeRunMaintenance({ archiveDir, minIntervalMs: 24 * 60 * 60 * 1000 });
    expect(skipped).toBeNull();

    db.close();
  });
});
