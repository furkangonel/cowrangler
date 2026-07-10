import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  TrajectoryRecorder,
  TRAJECTORY_RESULT_MAX_CHARS,
  loadTrajectory,
} from "@cowrangler/core/trajectory.js";

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tmpFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cowrangler-trajectory-"));
  tmpDirs.push(dir);
  return path.join(dir, "trajectory.json");
}

describe("TrajectoryRecorder tool call results", () => {
  it("persists a tool call's result and error flag", () => {
    const rec = new TrajectoryRecorder("sess-1", "test-model");
    rec.recordTurn({
      userMessage: "read the file",
      assistantResponse: "done",
      toolCalls: [{ name: "read_file", args: { path: "a.txt" }, result: "file contents", isError: false }],
      inputTokens: 10,
      outputTokens: 5,
      tokenCount: 15,
      durationMs: 100,
    });

    const file = tmpFile();
    rec.save(file);
    const loaded = loadTrajectory(file);

    expect(loaded.turns[0].toolCalls[0].result).toBe("file contents");
    expect(loaded.turns[0].toolCalls[0].isError).toBe(false);
    expect(loaded.turns[0].toolCalls[0].resultTruncated).toBeUndefined();
  });

  it("marks an error result", () => {
    const rec = new TrajectoryRecorder("sess-1", "test-model");
    rec.recordTurn({
      userMessage: "delete a protected file",
      assistantResponse: "blocked",
      toolCalls: [{ name: "delete_file", args: { path: "/etc/passwd" }, result: "BLOCKED: dangerous", isError: true }],
      inputTokens: 10,
      outputTokens: 5,
      tokenCount: 15,
      durationMs: 20,
    });

    const file = tmpFile();
    rec.save(file);
    const loaded = loadTrajectory(file);

    expect(loaded.turns[0].toolCalls[0].isError).toBe(true);
  });

  it("respects TRAJECTORY_RESULT_MAX_CHARS as the caller-facing truncation limit", () => {
    const longResult = "x".repeat(TRAJECTORY_RESULT_MAX_CHARS + 500);
    const truncated = longResult.slice(0, TRAJECTORY_RESULT_MAX_CHARS);

    const rec = new TrajectoryRecorder("sess-1", "test-model");
    rec.recordTurn({
      userMessage: "dump a huge file",
      assistantResponse: "done",
      toolCalls: [{ name: "read_file", args: {}, result: truncated, resultTruncated: true }],
      inputTokens: 10,
      outputTokens: 5,
      tokenCount: 15,
      durationMs: 20,
    });

    const file = tmpFile();
    rec.save(file);
    const loaded = loadTrajectory(file);

    expect(loaded.turns[0].toolCalls[0].result?.length).toBe(TRAJECTORY_RESULT_MAX_CHARS);
    expect(loaded.turns[0].toolCalls[0].resultTruncated).toBe(true);
  });

  it("tool calls without a resolved result stay name/args-only (backward compatible)", () => {
    const rec = new TrajectoryRecorder("sess-1", "test-model");
    rec.recordTurn({
      userMessage: "hi",
      assistantResponse: "hello",
      toolCalls: [{ name: "read_file", args: { path: "a.txt" } }],
      inputTokens: 1,
      outputTokens: 1,
      tokenCount: 2,
      durationMs: 5,
    });

    const file = tmpFile();
    rec.save(file);
    const loaded = loadTrajectory(file);

    expect(loaded.turns[0].toolCalls[0].result).toBeUndefined();
  });
});
