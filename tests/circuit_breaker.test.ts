import { describe, it, expect, beforeEach } from "vitest";
import {
  isCircuitOpen,
  recordFailure,
  recordSuccess,
  resetCircuitBreakers,
} from "@cowrangler/core/model/native/circuit_breaker.js";

describe("circuit_breaker", () => {
  beforeEach(() => resetCircuitBreakers());

  it("stays closed below the failure threshold", () => {
    recordFailure("openai", { maxConsecutiveFailures: 3, cooldownMs: 1000 });
    recordFailure("openai", { maxConsecutiveFailures: 3, cooldownMs: 1000 });
    expect(isCircuitOpen("openai")).toBe(false);
  });

  it("opens after reaching the consecutive failure threshold", () => {
    for (let i = 0; i < 3; i++) recordFailure("openai", { maxConsecutiveFailures: 3, cooldownMs: 1000 });
    expect(isCircuitOpen("openai")).toBe(true);
  });

  it("closes again after cooldown elapses", async () => {
    for (let i = 0; i < 3; i++) recordFailure("openai", { maxConsecutiveFailures: 3, cooldownMs: 20 });
    expect(isCircuitOpen("openai")).toBe(true);
    await new Promise((r) => setTimeout(r, 30));
    expect(isCircuitOpen("openai")).toBe(false);
  });

  it("a success resets the consecutive failure count", () => {
    recordFailure("anthropic", { maxConsecutiveFailures: 3, cooldownMs: 1000 });
    recordFailure("anthropic", { maxConsecutiveFailures: 3, cooldownMs: 1000 });
    recordSuccess("anthropic");
    recordFailure("anthropic", { maxConsecutiveFailures: 3, cooldownMs: 1000 });
    expect(isCircuitOpen("anthropic")).toBe(false);
  });

  it("tracks providers independently", () => {
    for (let i = 0; i < 3; i++) recordFailure("openai", { maxConsecutiveFailures: 3, cooldownMs: 1000 });
    expect(isCircuitOpen("openai")).toBe(true);
    expect(isCircuitOpen("anthropic")).toBe(false);
  });
});
