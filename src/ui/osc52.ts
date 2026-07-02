/**
 * osc52 — terminal panosuna kopyalama (OSC 52 escape dizisi).
 *
 * SSH/uzak oturumlar dahil, terminal destekliyorsa metni sistem panosuna yazar.
 * Yerel makinede ek olarak pbcopy/xclip/clip denenir.
 */

import { execFileSync } from "child_process";

export function osc52Copy(text: string): boolean {
  try {
    const b64 = Buffer.from(text, "utf-8").toString("base64");
    // OSC 52 — çoğu modern terminal (iTerm2, kitty, wezterm, tmux passthrough) destekler
    process.stdout.write(`\x1b]52;c;${b64}\x07`);

    // Yerel yardımcılar (best-effort, sessiz)
    try {
      if (process.platform === "darwin") execFileSync("pbcopy", { input: text });
      else if (process.platform === "win32") execFileSync("clip", { input: text });
      else execFileSync("xclip", ["-selection", "clipboard"], { input: text });
    } catch { /* pano yardımcısı yoksa yalnızca OSC52 kullanılır */ }

    return true;
  } catch {
    return false;
  }
}
