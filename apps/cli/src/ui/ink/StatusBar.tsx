/**
 * StatusBar — Ink TUI için kalıcı oturum durum çubuğu.
 *
 * Davranış kuralları:
 *   • Her zaman görünürdür (busy veya idle).
 *   • BUSY modda: anlık istek süresi sayar (0:00'dan başlar), toplam oturum
 *     süresi context engine'den alınır.
 *   • IDLE modda: toplam oturum süresi ve son turdaki süre gösterilir.
 *
 * Genişlik modları (buildStatusBarText ile aynı eşikler):
 *   < 52  →  ◆ model · 0:07
 *   52-76 →  ◆ model · 23% · 🗜2 · 0:07
 *   ≥ 76  →  ◆ model │ 12k/128k │ ██░░░ 9% │ 🗜 2 │ 3:41:05 │ 2.3s
 *
 * Renk kodlaması:
 *   normal   → dim (soluk)
 *   warning  → #F5A623 amber (%85+)
 *   critical → #FF3B30 kırmızı bold (%95+)
 */

import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { Agent } from "@cowrangler/core/agent.js";
import { buildStatusBarText } from "@cowrangler/core/context_engine.js";

interface StatusBarProps {
  agent: Agent;
  termCols: number;
  /** Agent şu an çalışıyor mu. Süre gösterimini etkiler. */
  busy: boolean;
  /** Mevcut isteğin başlangıç epoch ms'i (Date.now()). Sadece busy=true'da kullanılır. */
  runStartMs: number;
}

function styleToColor(
  style: "normal" | "warning" | "critical",
): string | undefined {
  if (style === "warning") return "#F5A623";
  if (style === "critical") return "#FF3B30";
  return undefined; // dim
}

export const StatusBar: React.FC<StatusBarProps> = ({
  agent,
  termCols,
  busy,
  runStartMs,
}) => {
  // 200 ms'de bir yenile — hem busy hem idle'da oturum sayacını canlı tutar.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, []); // bağımlılık yok — her zaman çalışır

  const baseSnap = agent.getContextSnapshot();

  let snap: typeof baseSnap;

  if (busy) {
    // BUSY: anlık istek süresi sayacı (0'dan başlar), son tur süresi gizlenir.
    const elapsedMs = Date.now() - runStartMs;
    snap = {
      ...baseSnap,
      sessionDurationMs: elapsedMs,
      lastRoundDurationMs: 0,
    };
  } else {
    // IDLE: gerçek oturum süresi + son tur süresi (varsa).
    snap = baseSnap;
  }

  const { text, style } = buildStatusBarText(
    snap,
    agent.modelShortName,
    termCols,
  );
  const color = styleToColor(style);

  return (
    <Box marginTop={0} paddingLeft={1}>
      {color ? (
        <Text color={color} bold={style === "critical"}>
          {text}
        </Text>
      ) : (
        <Text dimColor>{text}</Text>
      )}
    </Box>
  );
};
