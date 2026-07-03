/**
 * feature_flags — birim testleri (WP-1: gateway opsiyonelleştirme).
 */

import { describe, it, expect, afterEach } from "vitest";
import { isGatewayEnabled } from "../src/core/feature_flags.js";

const ORIGINAL = process.env.ENABLE_GATEWAY;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ENABLE_GATEWAY;
  else process.env.ENABLE_GATEWAY = ORIGINAL;
});

describe("isGatewayEnabled", () => {
  it("varsayılan olarak kapalıdır (env yokken)", () => {
    delete process.env.ENABLE_GATEWAY;
    expect(isGatewayEnabled()).toBe(false);
  });

  it("boş string kapalı sayılır", () => {
    process.env.ENABLE_GATEWAY = "";
    expect(isGatewayEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes", "on", " On "])(
    "'%s' değeri açık sayılır",
    (val) => {
      process.env.ENABLE_GATEWAY = val;
      expect(isGatewayEnabled()).toBe(true);
    },
  );

  it.each(["0", "false", "no", "off", "maybe"])(
    "'%s' değeri kapalı sayılır",
    (val) => {
      process.env.ENABLE_GATEWAY = val;
      expect(isGatewayEnabled()).toBe(false);
    },
  );
});
