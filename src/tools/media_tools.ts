/**
 * media_tools — görsel üretimi (generate_image) ve görsel analizi (analyze_image).
 *
 * Design modu ile sinerjik: placeholder/asset üretimi ve mockup→analiz.
 * Sağlayıcı API'lerini doğrudan çağırır (OpenAI images / vision, Google Gemini),
 * mevcut API anahtarına veya abonelik OAuth token'ına göre.
 */

import { z } from "zod";
import fs from "fs";
import path from "path";
import { registerTool } from "./registry.js";

function firstKey(...names: string[]): string | undefined {
  for (const n of names) if (process.env[n]) return process.env[n];
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERATE IMAGE
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "generate_image",
  "Generate an image from a text prompt and save it to disk. Uses OpenAI images (gpt-image-1) when OPENAI_API_KEY is set, otherwise Google Imagen via GOOGLE_GENERATIVE_AI_API_KEY. Returns the saved file path.",
  z.object({
    prompt: z.string().describe("Text description of the image to generate"),
    output_path: z.string().optional().describe("Where to save (default: cowrangler-image-<ts>.png in cwd)"),
    size: z.string().optional().default("1024x1024").describe("Image size, e.g. 1024x1024"),
  }),
  async ({ prompt, output_path, size = "1024x1024" }: { prompt: string; output_path?: string; size?: string }) => {
    const out = output_path
      ? path.resolve(output_path)
      : path.resolve(process.cwd(), `cowrangler-image-${Date.now()}.png`);
    try {
      const openaiKey = firstKey("OPENAI_API_KEY", "COWRANGLER_OAUTH_OPENAI");
      if (openaiKey) {
        const res = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "gpt-image-1", prompt, size, n: 1 }),
        });
        const j: any = await res.json();
        if (!res.ok) return `ERROR (OpenAI images): ${j?.error?.message ?? JSON.stringify(j).slice(0, 200)}`;
        const b64 = j?.data?.[0]?.b64_json;
        const url = j?.data?.[0]?.url;
        if (b64) fs.writeFileSync(out, Buffer.from(b64, "base64"));
        else if (url) {
          const img = await fetch(url);
          fs.writeFileSync(out, Buffer.from(await img.arrayBuffer()));
        } else return "ERROR: no image data returned.";
        return `OK: image saved → ${out}`;
      }

      const googleKey = firstKey("GOOGLE_GENERATIVE_AI_API_KEY", "COWRANGLER_OAUTH_GOOGLE");
      if (googleKey) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${googleKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1 } }),
          },
        );
        const j: any = await res.json();
        if (!res.ok) return `ERROR (Imagen): ${j?.error?.message ?? JSON.stringify(j).slice(0, 200)}`;
        const b64 = j?.predictions?.[0]?.bytesBase64Encoded;
        if (!b64) return "ERROR: no image data returned.";
        fs.writeFileSync(out, Buffer.from(b64, "base64"));
        return `OK: image saved → ${out}`;
      }

      return "ERROR: image generation needs OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY (or `cowrangler login`).";
    } catch (e: any) {
      return `ERROR generating image: ${e?.message ?? String(e)}`;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// ANALYZE IMAGE (vision)
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "analyze_image",
  "Analyze a local image file (screenshot, mockup, diagram, photo) and answer a question about it using a vision model. Useful for reproducing a design from an image or reading UI details.",
  z.object({
    path: z.string().describe("Path to the local image file (png/jpg/webp/gif)"),
    question: z.string().optional().default("Describe this image in detail.").describe("What to ask about the image"),
  }),
  async ({ path: imgPath, question = "Describe this image in detail." }: { path: string; question?: string }) => {
    try {
      const abs = path.resolve(imgPath);
      if (!fs.existsSync(abs)) return `File not found: ${imgPath}`;
      const ext = path.extname(abs).slice(1).toLowerCase();
      const mime = ext === "jpg" ? "jpeg" : ext;
      const b64 = fs.readFileSync(abs).toString("base64");
      const dataUrl = `data:image/${mime};base64,${b64}`;

      // OpenAI-uyumlu vision (OpenAI, OpenRouter, veya OAuth)
      const openaiKey = firstKey("OPENAI_API_KEY", "COWRANGLER_OAUTH_OPENAI");
      const orKey = process.env.OPENROUTER_API_KEY;
      if (openaiKey || orKey) {
        const base = openaiKey ? "https://api.openai.com/v1" : "https://openrouter.ai/api/v1";
        const model = openaiKey ? "gpt-4o-mini" : "openai/gpt-4o-mini";
        const res = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey ?? orKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [{
              role: "user",
              content: [
                { type: "text", text: question },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            }],
            max_tokens: 1024,
          }),
        });
        const j: any = await res.json();
        if (!res.ok) return `ERROR (vision): ${j?.error?.message ?? JSON.stringify(j).slice(0, 200)}`;
        return j?.choices?.[0]?.message?.content ?? "No answer returned.";
      }

      // Anthropic vision
      const anthropicKey = firstKey("ANTHROPIC_API_KEY");
      if (anthropicKey) {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-3-5-sonnet-latest",
            max_tokens: 1024,
            messages: [{
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: `image/${mime}`, data: b64 } },
                { type: "text", text: question },
              ],
            }],
          }),
        });
        const j: any = await res.json();
        if (!res.ok) return `ERROR (vision): ${j?.error?.message ?? JSON.stringify(j).slice(0, 200)}`;
        return j?.content?.[0]?.text ?? "No answer returned.";
      }

      return "ERROR: vision needs OPENAI_API_KEY, OPENROUTER_API_KEY or ANTHROPIC_API_KEY (or `cowrangler login`).";
    } catch (e: any) {
      return `ERROR analyzing image: ${e?.message ?? String(e)}`;
    }
  },
);
