import React from "react";
import { Box, Text } from "ink";
import { Palette } from "../theme.js";

/**
 * OptionList — tüm seçilebilir listeler için tek, tutarlı, yüksek kaliteli
 * satır bileşeni. CompletionMenu, ModelPicker ve ask-question (QA) bunu
 * kullanır; böylece marker/renk/hizalama her yerde aynı.
 *
 * Görsel dil:
 *  - Seçili satır: accent sol kenar-bar `▌` + bold accent etiket.
 *  - Çok-seçim: `[x]` / `[ ]` kutucuk.
 *  - İki sütun: etiket (hizalı) + dim açıklama (kalan genişliğe truncate).
 *  - Uzun listelerde seçilinin etrafında kayan pencere + `n/m` footer.
 *
 * Manuel `│` box-drawing yok (kırılgan); satırlar tek <Text>, ANSI renk
 * inline — Ink flex wrap riski yok.
 */

const ACCENT = Palette.main;

export interface Option {
  /** Sol sütun (komut adı, model, seçenek metni). */
  label: string;
  /** Sağ sütun (dim açıklama). */
  description?: string;
  /** Etiketten önce gelen küçük ikon (sağlayıcı simgesi vb.). */
  icon?: string;
  /** Etiketten sonra gelen küçük rozet (ör. "✓ current"). */
  badge?: string;
  /** Rozet rengi (varsayılan yeşil). */
  badgeColor?: string;
}

interface OptionListProps {
  items: Option[];
  selectedIndex: number;
  /** Toplam genişlik (truncation için). */
  cols: number;
  /** Aynı anda görünecek maksimum satır. */
  maxVisible?: number;
  /** Çok-seçim modu (kutucuk gösterir). */
  multi?: boolean;
  /** Çok-seçimde işaretli index'ler. */
  checked?: Set<number>;
  /** Accent rengi (varsayılan turuncu). */
  accent?: string;
  /** Sol iç boşluk (kapsayan kutuya göre). */
  indent?: number;
}

/** ANSI kaçışlarını sayma dışı bırakarak görünür genişlik. */
function visLen(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function truncate(s: string, max: number): string {
  if (max <= 0) return "";
  if (s.length <= max) return s;
  if (max === 1) return "…";
  return s.slice(0, max - 1) + "…";
}

export const OptionList: React.FC<OptionListProps> = ({
  items,
  selectedIndex,
  cols,
  maxVisible = 8,
  multi = false,
  checked,
  accent = ACCENT,
  indent = 0,
}) => {
  if (items.length === 0) return null;

  // ── Kayan pencere (seçili ortada) ───────────────────────────────────────
  const windowStart = Math.max(
    0,
    Math.min(
      selectedIndex - Math.floor(maxVisible / 2),
      Math.max(0, items.length - maxVisible),
    ),
  );
  const windowEnd = Math.min(windowStart + maxVisible, items.length);
  const visible = items.slice(windowStart, windowEnd);

  // ── Sütun genişlikleri ──────────────────────────────────────────────────
  // Sol dekor: bar(1) + boşluk(1) + [kutucuk(4)] + [ikon(2)] = değişken.
  const decoW = 2 + (multi ? 4 : 0);
  const labelMax = Math.min(
    30,
    Math.max(...items.map((i) => visLen(i.label) + (i.icon ? 2 : 0))),
  );
  const usable = Math.max(20, cols - indent);
  const descMax = Math.max(0, usable - decoW - labelMax - 3);

  const rows: React.ReactNode[] = visible.map((item, vi) => {
    const idx = windowStart + vi;
    const sel = idx === selectedIndex;
    const isChecked = checked?.has(idx) ?? false;

    const bar = sel ? (
      <Text color={accent} bold>
        {"▌ "}
      </Text>
    ) : (
      <Text>{"  "}</Text>
    );

    const box = multi ? (
      <Text color={isChecked ? accent : undefined} dimColor={!isChecked && !sel}>
        {isChecked ? "[x] " : "[ ] "}
      </Text>
    ) : null;

    const iconEl = item.icon ? (
      <Text color={sel ? accent : undefined} dimColor={!sel}>
        {item.icon + " "}
      </Text>
    ) : null;

    const labelText = truncate(item.label, labelMax - (item.icon ? 2 : 0));
    const labelPad = " ".repeat(
      Math.max(1, labelMax - visLen(labelText) - (item.icon ? 2 : 0) + 2),
    );

    const desc =
      item.description && descMax > 4
        ? truncate(item.description, descMax)
        : "";

    return (
      <Box key={idx}>
        {bar}
        {box}
        {iconEl}
        <Text color={sel ? accent : undefined} bold={sel} dimColor={!sel}>
          {labelText}
        </Text>
        {desc ? (
          <Text dimColor>{labelPad + desc}</Text>
        ) : null}
        {item.badge ? (
          <Text color={item.badgeColor ?? Palette.success}>{" " + item.badge}</Text>
        ) : null}
      </Box>
    );
  });

  return (
    <Box flexDirection="column">
      {rows}
      {items.length > maxVisible && (
        <Box>
          <Text dimColor>{`  ↑↓ · ${selectedIndex + 1}/${items.length}`}</Text>
        </Box>
      )}
    </Box>
  );
};
