import { z } from "zod";
import axios from "axios";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { registerTool } from "./registry.js";

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

// ─────────────────────────────────────────────────────────────────────────────
// FETCH WEBPAGE (read-only, converts to Markdown)
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "fetch_webpage",
  "Fetch a web page and return its content as clean Markdown. Strips navigation, scripts, and ads.",
  z.object({
    url: z.string().url(),
    selector: z.string().optional().describe("CSS selector to extract a specific section (e.g., 'article', 'main', '#content')"),
    max_length: z.number().optional().default(8000).describe("Max characters to return (default: 8000)"),
  }),
  async ({ url, selector, max_length }: { url: string; selector?: string; max_length: number }) => {
    try {
      const { data } = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
        },
        timeout: 15000,
      });

      const $ = cheerio.load(data);
      $("script, style, nav, footer, header, .nav, .menu, .sidebar, .ad, .advertisement, iframe").remove();

      const target = selector ? $(selector) : $("body");
      const markdownContent = turndown.turndown(target.html() || $.html());
      const trimmed = markdownContent.trim().slice(0, max_length);

      return `--- [${url}] ---\n${trimmed}${markdownContent.length > max_length ? "\n\n[Content truncated...]" : ""}\n--- END ---`;
    } catch (e: any) {
      return `ERROR fetching ${url}: ${e.message}`;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// HTTP REQUEST (full method support — GET, POST, PUT, PATCH, DELETE)
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "http_request",
  "Make an HTTP request to any API endpoint. Supports GET, POST, PUT, PATCH, DELETE with headers and body.",
  z.object({
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
    url: z.string().url(),
    headers: z.record(z.string()).optional().describe("Request headers as key-value pairs"),
    body: z.any().optional().describe("Request body (will be JSON-serialized for non-GET requests)"),
    timeout: z.number().optional().default(15000).describe("Timeout in milliseconds (default: 15000)"),
  }),
  async ({ method, url, headers, body, timeout }: {
    method: string; url: string; headers?: Record<string, string>;
    body?: any; timeout: number;
  }) => {
    try {
      const response = await axios({
        method: method.toLowerCase() as any,
        url,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "cowrangler/1.1.0",
          ...headers,
        },
        data: body !== undefined ? body : undefined,
        timeout,
        validateStatus: () => true, // Don't throw on 4xx/5xx
      });

      const responseBody = typeof response.data === "object"
        ? JSON.stringify(response.data, null, 2)
        : String(response.data);

      const truncated = responseBody.length > 6000
        ? responseBody.slice(0, 6000) + "\n[Response truncated...]"
        : responseBody;

      return [
        `HTTP ${response.status} ${response.statusText}`,
        `URL: ${method} ${url}`,
        `Content-Type: ${response.headers["content-type"] || "unknown"}`,
        `\n${truncated}`,
      ].join("\n");
    } catch (e: any) {
      return `ERROR: ${e.message}`;
    }
  },
);
