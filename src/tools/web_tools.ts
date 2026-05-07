import { z } from "zod";
import axios from "axios";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { registerTool } from "./registry.js";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

// ─────────────────────────────────────────────────────────────────────────────
// FETCH WEBPAGE (read-only, converts to Markdown)
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "fetch_webpage",
  "Fetch a web page and return its content as clean Markdown. Strips navigation, scripts, and ads.",
  z.object({
    url: z.string().url(),
    selector: z
      .string()
      .optional()
      .describe(
        "CSS selector to extract a specific section (e.g., 'article', 'main', '#content')",
      ),
    max_length: z
      .number()
      .optional()
      .default(8000)
      .describe("Max characters to return (default: 8000)"),
  }),
  async ({
    url,
    selector,
    max_length,
  }: {
    url: string;
    selector?: string;
    max_length: number;
  }) => {
    try {
      const { data } = await axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        timeout: 15000,
      });

      const $ = cheerio.load(data);
      $(
        "script, style, nav, footer, header, .nav, .menu, .sidebar, .ad, .advertisement, iframe",
      ).remove();

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
// WEB SEARCH — Ultimate Multi-Engine (Google + Brave Fallback)
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "web_search",
  `Search the web and return top results with titles, URLs, and snippets.
Uses a highly reliable multi-engine fallback system (Google -> Brave Search).
No API key required. Always cite sources in your reply.`,
  z.object({
    query: z.string().describe("Search query"),
    max_results: z
      .number()
      .optional()
      .default(8)
      .describe("Max results to return (default: 8, max: 20)"),
    region: z
      .string()
      .optional()
      .default("tr-TR")
      .describe("Region code (e.g., tr-TR, en-US)"),
  }),
  async ({
    query,
    max_results = 8,
    region = "tr-TR",
  }: {
    query: string;
    max_results?: number;
    region?: string;
  }) => {
    const limit = Math.min(max_results, 20);
    const results: Array<{ title: string; url: string; snippet: string }> = [];

    // Gerçekçi bir tarayıcı kimliği (Headers) - Cloudflare'i atlatmak için kritik
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    };

    // ========================================================================
    // STRATEGY 1: GOOGLE SEARCH
    // Sektör standardı DOM yapısı (div.g > h3 > a) ile doğrudan kazıma.
    // ========================================================================
    try {
      const { data, status } = await axios.get(
        "https://www.google.com/search",
        {
          params: { q: query, num: limit + 3, hl: region.split("-")[0] },
          headers,
          timeout: 10000,
          validateStatus: () => true,
        },
      );

      // CAPTCHA veya Recaptcha sayfasına düşmediğimizden emin oluyoruz
      if (status === 200 && !data.includes("recaptcha")) {
        const $ = cheerio.load(data);

        $("div.g").each((_i, el) => {
          if (results.length >= limit) return false;

          const title = $(el).find("h3").text().trim();
          const url = $(el).find("a").first().attr("href") || "";

          // Google snippet'ları değişebilir, en güvenilir metin çıkarma yöntemi:
          let snippet = $(el).find(".VwiC3b").text().trim();
          if (!snippet) {
            snippet = $(el).find("div[data-sncf='1']").text().trim();
          }
          if (!snippet) {
            // Hiçbir sınıf tutmazsa, başlık hariç tüm metni temizleyip al
            snippet = $(el).text().replace(title, "").substring(0, 200).trim();
          }

          if (title && url.startsWith("http") && !url.includes("google.com")) {
            results.push({ title, url, snippet });
          }
        });
      }
    } catch (err) {
      // Google başarısız olursa sessizce yedek plana geç
    }

    // ========================================================================
    // STRATEGY 2: BRAVE SEARCH FALLBACK
    // Bot koruması neredeyse sıfırdır. Bağımsız indeks kullandığı için çok hızlıdır.
    // ========================================================================
    if (results.length === 0) {
      try {
        const { data, status } = await axios.get(
          "https://search.brave.com/search",
          {
            params: { q: query },
            headers,
            timeout: 10000,
            validateStatus: () => true,
          },
        );

        if (status === 200) {
          const $ = cheerio.load(data);

          $(".snippet").each((_i, el) => {
            if (results.length >= limit) return false;

            const title =
              $(el).find(".snippet-title").text().trim() ||
              $(el).find(".title").text().trim();
            const url = $(el).find("a").attr("href") || "";
            const snippet =
              $(el).find(".snippet-description").text().trim() ||
              $(el).find(".snippet-content").text().trim();

            if (title && url.startsWith("http")) {
              results.push({ title, url, snippet });
            }
          });
        }
      } catch (err) {
        // İki sistem de çökerse
      }
    }

    // ========================================================================
    // ÇIKTIYI FORMATLA
    // ========================================================================
    if (results.length === 0) {
      return `No results found for: "${query}". (Arama motorları şu anda gelen istekleri CAPTCHA ile doğruluyor olabilir. Lütfen birkaç dakika bekleyin.)`;
    }

    const lines = [
      `Web search results for: "${query}"`,
      `Found ${results.length} results\n`,
      ...results.map(
        (r, i) =>
          `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.snippet || "(no snippet)"}`,
      ),
    ];
    return lines.join("\n\n");
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
    headers: z
      .record(z.string())
      .optional()
      .describe("Request headers as key-value pairs"),
    body: z
      .any()
      .optional()
      .describe("Request body (will be JSON-serialized for non-GET requests)"),
    timeout: z
      .number()
      .optional()
      .default(15000)
      .describe("Timeout in milliseconds (default: 15000)"),
  }),
  async ({
    method,
    url,
    headers,
    body,
    timeout,
  }: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: any;
    timeout: number;
  }) => {
    try {
      const response = await axios({
        method: method.toLowerCase() as any,
        url,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "cowrangler/1.1.2",
          ...headers,
        },
        data: body !== undefined ? body : undefined,
        timeout,
        validateStatus: () => true, // Don't throw on 4xx/5xx
      });

      const responseBody =
        typeof response.data === "object"
          ? JSON.stringify(response.data, null, 2)
          : String(response.data);

      const truncated =
        responseBody.length > 6000
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
