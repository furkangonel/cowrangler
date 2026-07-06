import { describe, it, expect, vi } from "vitest";
import { PluginManager } from "../packages/core/src/plugins.js";
import { registerDynamicModel, getModelMeta } from "../packages/core/src/model_metadata.js";
import { resolveEndpoint } from "../packages/core/src/model/driver.js";

describe("Plugin Interceptor & Dynamic Models", () => {
  it("should dynamically register custom models", () => {
    registerDynamicModel("google/custom-plugin-model", {
      contextWindow: 999_000,
      maxOutputTokens: 9_999,
      inputPricePerMToken: 0,
      outputPricePerMToken: 0,
      supportsThinking: true,
      supportsVision: true,
      supportsCaching: true,
      nativeToolCalling: true,
      provider: "google",
      displayName: "Custom Plugin Model",
    });

    const meta = getModelMeta("google/custom-plugin-model");
    expect(meta).not.toBeNull();
    expect(meta?.displayName).toBe("Custom Plugin Model");
    expect(meta?.contextWindow).toBe(999_000);
  });

  it("should bypass API key check and apply dynamic interceptor headers/fetch", () => {
    const manager = PluginManager.getInstance();
    
    const dummyFetch = vi.fn();
    
    manager.registerProviderInterceptor("google", {
      apiKey: "custom-plugin-oauth-token",
      headers: {
        "X-Custom-Plugin-Header": "verified",
      },
      fetch: dummyFetch,
    });

    // Verify resolveEndpoint resolves correct apiKey, headers and fetch override
    const endpoint = resolveEndpoint(
      "google/custom-plugin-model",
      "google",
      {} // empty env
    );

    expect(endpoint.apiKey).toBe("custom-plugin-oauth-token");
    expect(endpoint.headers).toEqual({
      "X-Custom-Plugin-Header": "verified",
    });
    expect(endpoint.fetch).toBe(dummyFetch);
  });
});
