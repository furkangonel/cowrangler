/**
 * Trajectory Recording — birim testleri
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal TrajectoryRecorder re-implementation (isolated from logger/agent deps)
// ─────────────────────────────────────────────────────────────────────────────

interface TurnData {
  index: number;
  userMessage: string;
  assistantResponse: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  inputTokens: number;
  outputTokens: number;
  tokenCount: number;
  durationMs: number;
  timestamp: number;
}

interface TrajectoryData {
  meta: {
    version: number;
    model: string;
    startedAt: number;
    endedAt: number;
    totalTokens: number;
    totalTurns: number;
    platform: string;
  };
  turns: TurnData[];
  assertions?: any[];
}

class TestTrajectoryRecorder {
  private turns: TurnData[] = [];
  private model: string;
  private platform: string;
  private startedAt: number;

  constructor(model: string, platform = "test") {
    this.model = model;
    this.platform = platform;
    this.startedAt = Date.now();
  }

  recordTurn(params: {
    userMessage: string;
    assistantResponse: string;
    toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
    inputTokens: number;
    outputTokens: number;
    tokenCount: number;
    durationMs: number;
  }): void {
    this.turns.push({
      index: this.turns.length,
      userMessage: params.userMessage,
      assistantResponse: params.assistantResponse,
      toolCalls: params.toolCalls ?? [],
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      tokenCount: params.tokenCount,
      durationMs: params.durationMs,
      timestamp: Date.now(),
    });
  }

  save(filePath: string): string {
    const totalTokens = this.turns.reduce((s, t) => s + t.tokenCount, 0);
    const data: TrajectoryData = {
      meta: {
        version: 1,
        model: this.model,
        startedAt: this.startedAt,
        endedAt: Date.now(),
        totalTokens,
        totalTurns: this.turns.length,
        platform: this.platform,
      },
      turns: this.turns,
    };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    return filePath;
  }

  get turnCount(): number {
    return this.turns.length;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Assertion runner (mirrors production implementation)
// ─────────────────────────────────────────────────────────────────────────────

interface Assertion {
  description: string;
  turnIndex: number;
  field: "assistantResponse" | "inputTokens" | "outputTokens";
  check: "contains" | "not_contains" | "equals" | "matches" | "min" | "max";
  value: string | number;
}

function runAssertions(
  traj: TrajectoryData,
  assertions: Assertion[],
): Array<{ description: string; passed: boolean; actual?: unknown; expected: unknown }> {
  return assertions.map((a) => {
    const idx = a.turnIndex < 0 ? traj.turns.length + a.turnIndex : a.turnIndex;
    const turn = traj.turns[idx];
    if (!turn) {
      return { description: a.description, passed: false, expected: a.value };
    }

    let actual: string | number;
    switch (a.field) {
      case "assistantResponse":
        actual = turn.assistantResponse;
        break;
      case "inputTokens":
        actual = turn.inputTokens;
        break;
      case "outputTokens":
        actual = turn.outputTokens;
        break;
      default:
        actual = "";
    }

    let passed = false;
    switch (a.check) {
      case "contains":
        passed = String(actual).includes(String(a.value));
        break;
      case "not_contains":
        passed = !String(actual).includes(String(a.value));
        break;
      case "equals":
        passed = actual === a.value;
        break;
      case "matches":
        passed = new RegExp(String(a.value)).test(String(actual));
        break;
      case "min":
        passed = Number(actual) >= Number(a.value);
        break;
      case "max":
        passed = Number(actual) <= Number(a.value);
        break;
    }

    return { description: a.description, passed, actual, expected: a.value };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("TrajectoryRecorder", () => {
  let tmpDir: string;
  let recorder: TestTrajectoryRecorder;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "traj-test-"));
    recorder = new TestTrajectoryRecorder("claude-sonnet-4-5");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("starts with 0 turns", () => {
    expect(recorder.turnCount).toBe(0);
  });

  it("records turns correctly", () => {
    recorder.recordTurn({
      userMessage: "Hello",
      assistantResponse: "Hi there!",
      inputTokens: 10,
      outputTokens: 20,
      tokenCount: 30,
      durationMs: 500,
    });
    expect(recorder.turnCount).toBe(1);
  });

  it("assigns sequential indexes to turns", () => {
    for (let i = 0; i < 5; i++) {
      recorder.recordTurn({
        userMessage: `msg ${i}`,
        assistantResponse: `resp ${i}`,
        inputTokens: 5,
        outputTokens: 5,
        tokenCount: 10,
        durationMs: 100,
      });
    }
    const filePath = path.join(tmpDir, "traj.json");
    recorder.save(filePath);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as TrajectoryData;
    expect(data.turns.map((t) => t.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it("saves valid JSON to file", () => {
    recorder.recordTurn({
      userMessage: "Test",
      assistantResponse: "Response",
      inputTokens: 15,
      outputTokens: 25,
      tokenCount: 40,
      durationMs: 800,
    });

    const filePath = path.join(tmpDir, "trajectory.json");
    recorder.save(filePath);

    expect(fs.existsSync(filePath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as TrajectoryData;
    expect(data.meta.model).toBe("claude-sonnet-4-5");
    expect(data.meta.version).toBe(1);
    expect(data.meta.totalTurns).toBe(1);
    expect(data.meta.totalTokens).toBe(40);
    expect(data.turns).toHaveLength(1);
    expect(data.turns[0].userMessage).toBe("Test");
    expect(data.turns[0].assistantResponse).toBe("Response");
  });

  it("computes totalTokens correctly across multiple turns", () => {
    for (let i = 0; i < 3; i++) {
      recorder.recordTurn({
        userMessage: `q${i}`,
        assistantResponse: `a${i}`,
        inputTokens: 10,
        outputTokens: 20,
        tokenCount: 30,
        durationMs: 200,
      });
    }
    const filePath = path.join(tmpDir, "traj.json");
    recorder.save(filePath);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as TrajectoryData;
    expect(data.meta.totalTokens).toBe(90); // 3 * 30
  });

  it("records tool calls per turn", () => {
    recorder.recordTurn({
      userMessage: "Search for something",
      assistantResponse: "Found it",
      toolCalls: [{ name: "web_search", args: { query: "test" } }],
      inputTokens: 20,
      outputTokens: 30,
      tokenCount: 50,
      durationMs: 1200,
    });

    const filePath = path.join(tmpDir, "traj.json");
    recorder.save(filePath);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as TrajectoryData;
    expect(data.turns[0].toolCalls).toHaveLength(1);
    expect(data.turns[0].toolCalls[0].name).toBe("web_search");
  });
});

describe("Trajectory Assertions", () => {
  const sampleTraj: TrajectoryData = {
    meta: {
      version: 1,
      model: "claude-sonnet-4-5",
      startedAt: 1000,
      endedAt: 5000,
      totalTokens: 100,
      totalTurns: 2,
      platform: "test",
    },
    turns: [
      {
        index: 0,
        userMessage: "What is 2+2?",
        assistantResponse: "The answer is 4.",
        toolCalls: [],
        inputTokens: 20,
        outputTokens: 15,
        tokenCount: 35,
        durationMs: 500,
        timestamp: 1000,
      },
      {
        index: 1,
        userMessage: "Explain gravity",
        assistantResponse: "Gravity is a fundamental force...",
        toolCalls: [],
        inputTokens: 30,
        outputTokens: 35,
        tokenCount: 65,
        durationMs: 1200,
        timestamp: 2000,
      },
    ],
  };

  it("passes 'contains' assertion when text is present", () => {
    const results = runAssertions(sampleTraj, [
      {
        description: "Contains expected answer",
        turnIndex: 0,
        field: "assistantResponse",
        check: "contains",
        value: "4",
      },
    ]);
    expect(results[0].passed).toBe(true);
  });

  it("fails 'contains' assertion when text is absent", () => {
    const results = runAssertions(sampleTraj, [
      {
        description: "Should not contain 'wrong'",
        turnIndex: 0,
        field: "assistantResponse",
        check: "contains",
        value: "wrong answer",
      },
    ]);
    expect(results[0].passed).toBe(false);
  });

  it("passes 'not_contains' assertion", () => {
    const results = runAssertions(sampleTraj, [
      {
        description: "Does not mention error",
        turnIndex: 0,
        field: "assistantResponse",
        check: "not_contains",
        value: "error",
      },
    ]);
    expect(results[0].passed).toBe(true);
  });

  it("passes 'min' assertion on token count", () => {
    const results = runAssertions(sampleTraj, [
      {
        description: "Has at least 10 input tokens",
        turnIndex: 1,
        field: "inputTokens",
        check: "min",
        value: 10,
      },
    ]);
    expect(results[0].passed).toBe(true);
  });

  it("fails 'max' assertion when exceeded", () => {
    const results = runAssertions(sampleTraj, [
      {
        description: "Output tokens < 10",
        turnIndex: 1,
        field: "outputTokens",
        check: "max",
        value: 10,
      },
    ]);
    expect(results[0].passed).toBe(false); // 35 > 10
  });

  it("handles negative turnIndex (last turn)", () => {
    const results = runAssertions(sampleTraj, [
      {
        description: "Last turn contains gravity",
        turnIndex: -1,
        field: "assistantResponse",
        check: "contains",
        value: "Gravity",
      },
    ]);
    expect(results[0].passed).toBe(true);
  });

  it("fails gracefully when turnIndex is out of range", () => {
    const results = runAssertions(sampleTraj, [
      {
        description: "Non-existent turn",
        turnIndex: 99,
        field: "assistantResponse",
        check: "contains",
        value: "anything",
      },
    ]);
    expect(results[0].passed).toBe(false);
  });

  it("passes 'matches' regex assertion", () => {
    const results = runAssertions(sampleTraj, [
      {
        description: "Matches number pattern",
        turnIndex: 0,
        field: "assistantResponse",
        check: "matches",
        value: "\\d+",
      },
    ]);
    expect(results[0].passed).toBe(true);
  });
});
