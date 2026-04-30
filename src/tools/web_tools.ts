import { z } from "zod";
import axios from "axios";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { registerTool } from "./registry.js";

const turndown = new TurndownService({ headingStyle: "atx" });

registerTool(
  "fetch_webpage",
  "Verilen URL'deki web sayfasının içeriğini çeker ve Markdown formatına çevirir.",
  z.object({
    url: z.string().url(),
  }),
  async ({ url }: { url: string }) => {
    try {
      const { data } = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        },
        timeout: 10000,
      });
      const $ = cheerio.load(data);
      $("script, style, nav, footer, header").remove();
      const markdownContent = turndown.turndown($.html());
      return `--- CONTENT FROM ${url} ---\n${markdownContent.trim()}\n--- END ---`;
    } catch (e: any) {
      return `HATA Web sayfası okunamadı: ${e.message}`;
    }
  },
);
