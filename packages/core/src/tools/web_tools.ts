import { z } from "zod";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { registerTool } from "./registry.js";
import dns from "node:dns/promises";
import net from "node:net";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

const MAX_SAFE_REDIRECTS = 5;

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export function normalizeBraveApiResults(data: any, limit: number): SearchResult[] {
  const rawResults = Array.isArray(data?.web?.results) ? data.web.results : [];
  return rawResults
    .map((item: any) => ({
      title: String(item?.title || "").trim(),
      url: String(item?.url || "").trim(),
      snippet: String(item?.description || item?.snippet || "").trim(),
    }))
    .filter((item: SearchResult) => item.title && item.url.startsWith("http"))
    .slice(0, limit);
}

export function formatSearchResults(
  query: string,
  results: SearchResult[],
  source: string,
  degradedReason?: string,
): string {
  if (results.length === 0) {
    const suffix = degradedReason ? ` ${degradedReason}` : "";
    return `No results found for: "${query}".${suffix}`;
  }

  const lines = [
    `Web search results for: "${query}"`,
    `Source: ${source}${degradedReason ? ` (${degradedReason})` : ""}`,
    `Found ${results.length} results\n`,
    ...results.map(
      (r, i) =>
        `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.snippet || "(no snippet)"}`,
    ),
  ];
  return lines.join("\n\n");
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function normalizeIpv6(ip: string): string {
  return ip.toLowerCase();
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = normalizeIpv6(ip);
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:169.254.") ||
    normalized.startsWith("::ffff:192.168.")
  );
}

export function isBlockedNetworkAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }

  const literalFamily = net.isIP(parsed.hostname);
  if (literalFamily && isBlockedNetworkAddress(parsed.hostname)) {
    throw new Error(`Blocked private network address: ${parsed.hostname}`);
  }

  const records = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
  if (records.length === 0) {
    throw new Error(`Could not resolve host: ${parsed.hostname}`);
  }

  const blocked = records.find((record) => isBlockedNetworkAddress(record.address));
  if (blocked) {
    throw new Error(`Blocked private network address: ${blocked.address}`);
  }

  return parsed;
}

async function safeAxiosRequest(config: AxiosRequestConfig, redirects = 0): Promise<AxiosResponse> {
  if (!config.url) throw new Error("Missing URL");
  const currentUrl = await assertPublicHttpUrl(config.url);
  const response = await axios({
    ...config,
    url: currentUrl.toString(),
    maxRedirects: 0,
    validateStatus: () => true,
  });

  if (
    response.status >= 300 &&
    response.status < 400 &&
    response.headers.location
  ) {
    if (redirects >= MAX_SAFE_REDIRECTS) {
      throw new Error("Too many redirects");
    }
    const nextUrl = new URL(String(response.headers.location), currentUrl).toString();
    await assertPublicHttpUrl(nextUrl);
    return safeAxiosRequest({ ...config, url: nextUrl }, redirects + 1);
  }

  return response;
}

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
      const { data } = await safeAxiosRequest({
        method: "GET",
        url,
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
// WEB SEARCH — API-first with HTML fallback
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "web_search",
  `Search the web and return top results with titles, URLs, and snippets.
Uses Brave Search API when BRAVE_SEARCH_API_KEY is configured, then falls back to HTML search in degraded mode.
Always cite sources in your reply.`,
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
    const results: SearchResult[] = [];
    let source = "HTML fallback";
    let degradedReason: string | undefined;
    const braveApiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();

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
    // STRATEGY 1: BRAVE SEARCH API
    // Stable, documented API path. HTML scraping below is only a degraded fallback.
    // ========================================================================
    if (braveApiKey) {
      try {
        const { data, status } = await axios.get(
          "https://api.search.brave.com/res/v1/web/search",
          {
            params: {
              q: query,
              count: limit,
              country: region.split("-")[1]?.toUpperCase(),
              search_lang: region.split("-")[0]?.toLowerCase(),
            },
            headers: {
              Accept: "application/json",
              "X-Subscription-Token": braveApiKey,
            },
            timeout: 10000,
            validateStatus: () => true,
          },
        );

        if (status >= 200 && status < 300) {
          results.push(...normalizeBraveApiResults(data, limit));
          if (results.length > 0) {
            source = "Brave Search API";
          } else {
            degradedReason = "Brave Search API returned no usable results; used degraded HTML fallback";
          }
        } else {
          degradedReason = `Brave Search API returned HTTP ${status}; used degraded HTML fallback`;
        }
      } catch (err: any) {
        degradedReason = `Brave Search API failed (${err.message}); used degraded HTML fallback`;
      }
    } else {
      degradedReason = "BRAVE_SEARCH_API_KEY is not configured; used degraded HTML fallback";
    }

    // ========================================================================
    // STRATEGY 2: GOOGLE SEARCH
    // Sektör standardı DOM yapısı (div.g > h3 > a) ile doğrudan kazıma.
    // ========================================================================
    if (results.length === 0) {
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
        if (results.length > 0) {
          source = "HTML fallback: Google Search";
        }
      } catch (err) {
        // Google başarısız olursa sessizce yedek plana geç
      }
    }

    // ========================================================================
    // STRATEGY 3: BRAVE SEARCH HTML FALLBACK
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
          if (results.length > 0) {
            source = "HTML fallback: Brave Search";
          }
        }
      } catch (err) {
        // İki sistem de çökerse
      }
    }

    return formatSearchResults(
      query,
      results,
      source,
      source.startsWith("HTML fallback") ? degradedReason : undefined,
    );
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
      const response = await safeAxiosRequest({
        method: method.toLowerCase() as any,
        url,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "cowrangler/2.0.1",
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
