/**
 * ModelPicker — Arrow key ile gezilen interaktif model seçici.
 *
 * Kullanım:
 *   • cowrangler model     → standalone mod (ana TUI başlamadan önce)
 *   • /model (args yok)   → inline mod (Ana TUI içinde overlay olarak)
 *
 * Kontroller:
 *   ↑ / ↓     — listede gezin
 *   Harf yaz  — filtrele (prefix arama)
 *   Enter     — seç ve kapat
 *   Esc       — iptal et (değişiklik yok)
 *
 * Gösterilen modeller:
 *   1. config.yaml'daki saved_models
 *   2. Bunlar yoksa varsayılan öneri listesi
 *   Aktif model ▶ ile işaretlenir, filtre uygulandığında kaybolur.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import fs from "fs";
import yaml from "js-yaml";
import { DIRS } from "../../core/init.js";

// Kullanıcıya sunulan varsayılan model önerileri (saved_models boşsa gösterilir)
const DEFAULT_SUGGESTIONS: Array<{ model: string; label: string }> = [
  { model: "claude-sonnet-4-6",       label: "Anthropic Claude Sonnet 4.6" },
  { model: "claude-opus-4-6",         label: "Anthropic Claude Opus 4.6" },
  { model: "anthropic/claude-haiku-4-5-20251001", label: "Anthropic Claude Haiku 4.5" },
  { model: "gpt-4o",                  label: "OpenAI GPT-4o" },
  { model: "gpt-4o-mini",             label: "OpenAI GPT-4o mini" },
  { model: "openai/o3",               label: "OpenAI o3" },
  { model: "gemini-2.5-pro",          label: "Google Gemini 2.5 Pro" },
  { model: "gemini-2.0-flash",        label: "Google Gemini 2.0 Flash" },
  { model: "groq/llama-3.3-70b-versatile", label: "Groq Llama 3.3 70B" },
  { model: "openrouter/anthropic/claude-3-5-sonnet", label: "OpenRouter → Claude 3.5 Sonnet" },
  { model: "openrouter/google/gemini-2.5-pro", label: "OpenRouter → Gemini 2.5 Pro" },
  { model: "openrouter/meta-llama/llama-4-maverick", label: "OpenRouter → Llama 4 Maverick" },
];

export interface ModelPickerProps {
  /** Şu an aktif olan model adı. */
  currentModel: string;
  /** Kullanıcı bir model seçtiğinde çağrılır. */
  onSelect: (model: string) => void;
  /** Kullanıcı Esc ile iptal ettiğinde çağrılır. */
  onCancel: () => void;
  /** Terminal genişliği (çerçeve boyutu için). */
  termCols: number;
}

/** config.yaml'dan saved_models listesini okur. */
function loadSavedModels(): string[] {
  try {
    if (fs.existsSync(DIRS.global.config)) {
      const cfg = (yaml.load(fs.readFileSync(DIRS.global.config, "utf-8")) as any) || {};
      if (Array.isArray(cfg.saved_models) && cfg.saved_models.length > 0) {
        return cfg.saved_models as string[];
      }
    }
  } catch {
    // Config okunamazsa varsayılana düş
  }
  return [];
}

/** Model string'inden gösterim etiketini çıkarır. */
function modelLabel(model: string): string {
  // saved_models'deki default suggestions'da varsa güzel etiket kullan
  const found = DEFAULT_SUGGESTIONS.find((s) => s.model === model);
  if (found) return found.label;
  return model;
}

/** Provider prefix'ini belirler ve ikon döner. */
function providerIcon(model: string): string {
  if (model.startsWith("claude-") || model.startsWith("anthropic/")) return "◆";
  if (model.startsWith("gpt-") || model.startsWith("o") || model.startsWith("openai/")) return "◈";
  if (model.startsWith("gemini-") || model.startsWith("google/")) return "✦";
  if (model.startsWith("groq/")) return "⚡";
  if (model.startsWith("vertex/")) return "☁";
  if (model.startsWith("copilot/")) return "○";
  if (model.startsWith("openrouter/")) return "⊕";
  return "◇";
}

export const ModelPicker: React.FC<ModelPickerProps> = ({
  currentModel,
  onSelect,
  onCancel,
  termCols,
}) => {
  const [filter, setFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Model listesi: önce saved_models, yoksa varsayılan öneriler
  const allModels = useMemo(() => {
    const saved = loadSavedModels();
    if (saved.length > 0) return saved;
    return DEFAULT_SUGGESTIONS.map((s) => s.model);
  }, []);

  // Filtrelenmiş liste
  const filtered = useMemo(() => {
    if (!filter) return allModels;
    const q = filter.toLowerCase();
    return allModels.filter(
      (m) =>
        m.toLowerCase().includes(q) ||
        modelLabel(m).toLowerCase().includes(q),
    );
  }, [allModels, filter]);

  // Seçili index'i filtre değişiminde sınırla
  useEffect(() => {
    if (selectedIndex >= filtered.length) setSelectedIndex(0);
  }, [filtered.length, selectedIndex]);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      if (filtered.length > 0) onSelect(filtered[selectedIndex]);
      else onCancel();
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1));
      return;
    }
    if (key.backspace || key.delete) {
      setFilter((f) => f.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setFilter((f) => f + input);
    }
  });

  const boxWidth = Math.min(termCols - 4, 64);
  const innerWidth = boxWidth - 4; // border + padding

  // Görünür pencere: maksimum 8 satır
  const VISIBLE = 8;
  const windowStart = Math.max(
    0,
    Math.min(selectedIndex - Math.floor(VISIBLE / 2), filtered.length - VISIBLE),
  );
  const visibleItems = filtered.slice(windowStart, windowStart + VISIBLE);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="#FF4C00"
      paddingX={1}
      width={boxWidth}
    >
      {/* Başlık */}
      <Box marginBottom={1}>
        <Text color="#FF4C00" bold>
          {"  Model Seç "}
        </Text>
        <Text dimColor>
          {"— ↑↓ gezin · Enter seç · Esc iptal"}
        </Text>
      </Box>

      {/* Filtre kutusu */}
      <Box marginBottom={1}>
        <Text dimColor>{"  🔍 "}</Text>
        <Text>{filter || ""}</Text>
        <Text color="#FF4C00">{"█"}</Text>
        {filter === "" && (
          <Text dimColor>{"  filtre için yaz..."}</Text>
        )}
      </Box>

      {/* Model listesi */}
      {filtered.length === 0 ? (
        <Box paddingLeft={2}>
          <Text dimColor>{"Eşleşen model yok."}</Text>
        </Box>
      ) : (
        visibleItems.map((model, i) => {
          const realIndex = windowStart + i;
          const isSelected = realIndex === selectedIndex;
          const isCurrent = model === currentModel;
          const icon = providerIcon(model);
          const label = modelLabel(model);

          return (
            <Box key={model} paddingLeft={1}>
              <Text color={isSelected ? "#FF4C00" : undefined} bold={isSelected}>
                {isSelected ? "▶ " : "  "}
              </Text>
              <Text
                color={isSelected ? "#FF4C00" : isCurrent ? "#34C759" : undefined}
                bold={isSelected}
                dimColor={!isSelected && !isCurrent}
              >
                {icon} {model.padEnd(Math.max(0, innerWidth - label.length - 6))}
              </Text>
              <Text dimColor={!isSelected}>{label}</Text>
              {isCurrent && (
                <Text color="#34C759">{" ✓"}</Text>
              )}
            </Box>
          );
        })
      )}

      {/* Sayfalama ipucu */}
      {filtered.length > VISIBLE && (
        <Box marginTop={1} paddingLeft={2}>
          <Text dimColor>
            {`${windowStart + 1}–${Math.min(windowStart + VISIBLE, filtered.length)} / ${filtered.length} model`}
          </Text>
        </Box>
      )}

      {/* Scope ipucu */}
      <Box marginTop={1} paddingLeft={1}>
        <Text dimColor>{"  Global kayıt için: /model add <isim>"}</Text>
      </Box>
    </Box>
  );
};
