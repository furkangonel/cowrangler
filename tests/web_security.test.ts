import { describe, expect, it } from "vitest";
import {
  assertPublicHttpUrl,
  formatSearchResults,
  isBlockedNetworkAddress,
  normalizeBraveApiResults,
} from "@cowrangler/core/tools/web_tools.js";

describe("web tool network guard", () => {
  it("blocks private and local network addresses", () => {
    expect(isBlockedNetworkAddress("127.0.0.1")).toBe(true);
    expect(isBlockedNetworkAddress("10.1.2.3")).toBe(true);
    expect(isBlockedNetworkAddress("172.16.0.1")).toBe(true);
    expect(isBlockedNetworkAddress("192.168.1.1")).toBe(true);
    expect(isBlockedNetworkAddress("169.254.169.254")).toBe(true);
    expect(isBlockedNetworkAddress("::1")).toBe(true);
    expect(isBlockedNetworkAddress("fd00::1")).toBe(true);
    expect(isBlockedNetworkAddress("fe80::1")).toBe(true);
  });

  it("allows public IP literals", () => {
    expect(isBlockedNetworkAddress("93.184.216.34")).toBe(false);
    expect(isBlockedNetworkAddress("2606:2800:220:1:248:1893:25c8:1946")).toBe(false);
  });

  it("rejects non-http schemes before making a request", async () => {
    await expect(assertPublicHttpUrl("file:///etc/passwd")).rejects.toThrow(/http and https/);
  });

  it("rejects loopback URL literals before DNS lookup", async () => {
    await expect(assertPublicHttpUrl("http://127.0.0.1:3000")).rejects.toThrow(/private network/);
  });
});

describe("web search helpers", () => {
  it("normalizes Brave Search API web results", () => {
    const results = normalizeBraveApiResults(
      {
        web: {
          results: [
            {
              title: " First result ",
              url: "https://example.com/one",
              description: " Summary ",
            },
            { title: "Ignored", url: "javascript:void(0)", description: "Bad URL" },
            {
              title: "Second result",
              url: "https://example.com/two",
              description: "",
            },
          ],
        },
      },
      2,
    );

    expect(results).toEqual([
      { title: "First result", url: "https://example.com/one", snippet: "Summary" },
      { title: "Second result", url: "https://example.com/two", snippet: "" },
    ]);
  });

  it("marks HTML search output as degraded fallback", () => {
    const output = formatSearchResults(
      "cow milk prices",
      [{ title: "Market report", url: "https://example.com/report", snippet: "Daily prices" }],
      "HTML fallback: Google Search",
      "BRAVE_SEARCH_API_KEY is not configured; used degraded HTML fallback",
    );

    expect(output).toContain("Source: HTML fallback: Google Search");
    expect(output).toContain("degraded HTML fallback");
  });
});
