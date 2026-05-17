/**
 * StatusBar — Ink TUI için istek-bazlı durum çubuğu.
 *
 * Davranış kuralları:
 *   • Sadece agent meşgulken (busy=true) görünür, boştayken gizlenir.
 *   • Sayaç anlık istek süresini gösterir (oturum toplam süresi değil).
 *     İstek başladığında 0:00'dan başlar, istek bitince bileşen kaybolur.
 *
 *
 * Genişlik modları (buildStatusBarText ile aynı eşikler):
 *   < 52  →  ◆ model · 0:07
 *   52-76 →  ◆ model · 23% · 0:07
 *   ≥ 76  →  ◆ model │ 45k/200k │ █░░░░ 23% │ 0:07
 *
 * Renk kodlaması:
 *   normal   → dim (soluk)
 *   warning  → #F5A623 amber (%85+)
 *   critical → #FF3B30 kırmızı bold (%95+)
 */

import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { Agent } from "../../core/agent.js";
import { buildStatusBarText } from "../../core/context_engine.js";

interface StatusBarProps {
  agent: Agent;
  termCols: number;
  /** Durum çubuğunu göster/gizle. false → null render edilir. */
  busy: boolean;
  /** Mevcut isteğin başlangıç epoch ms'i (Date.now()). busy=false'da yok sayılır. */
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
  // 200 ms'de bir yenile — anlık sayaç için yeterince akıcı,
  // fazla render yaratmayacak kadar seyrek.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, [busy]);

  // Busy değilse hiç render etme
  if (!busy) return null;

  // Anlık istek süresi — oturum toplam süresi değil
  const elapsedMs = Date.now() - runStartMs;

  // Context snapshot'ını al; sessionDurationMs'i anlık süreyle geçersiz kıl.
  // lastRoundDurationMs = 0 → geniş modda önceki turdan kalan "2.3s" çıkmaz.
  const snap = {
    ...agent.getContextSnapshot(),
    sessionDurationMs: elapsedMs,
    lastRoundDurationMs: 0,
  };

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
