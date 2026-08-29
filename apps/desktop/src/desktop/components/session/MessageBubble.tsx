import React, { useState, useEffect, useRef } from "react";
import { AssistantMessage } from "./AssistantMessage";
import { ToolGroup } from "./ToolGroup";
import { RobotLoader } from "../shared/RobotLoader";
import { CopyButton } from "../shared/CopyButton";
import { ClampText } from "../ClampText";
import { TimelineSegment } from "../../stores/agent.store";
import { useUIStore } from "../../stores/ui.store";
import { parseAttachments, isImagePath, useLocalImage, fileName } from "../../lib/attachments";
import { Brain, ChevronDown, ChevronRight, ArchiveRestore, FileText, ImageOff } from "lucide-react";

// context_engine.ts'in ürettiği sıkıştırma özet mesajlarının önek imzası.
// Kaynak: packages/core/src/context_engine.ts → compress()
const COMPACTION_MARKER = /^\[CONVERSATION SUMMARY — (\d+) earlier messages compressed\]/;

function formatDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

interface UIMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

interface Props {
  message: UIMessage;
  /** O asistan turunun kronolojik segment akışı (text ↔ tool grupları) */
  timeline?: TimelineSegment[];
  isLast?: boolean;
}

/**
 * Model "thinking" (reasoning) bloğu.
 *  • Canlı (isLive): otomatik açık, canlı süre sayacı, akan metin auto-scroll,
 *    animasyonlu "Thinking…" başlığı. Kullanıcı yine de katlayabilir.
 *  • Bitince: otomatik katlanır, başlık "Thought for Xs" olur; kullanıcı
 *    accordion'u açıp tüm düşünce sürecini inceleyebilir.
 */
function ReasoningBlock({ text, isLive = false }: { text: string; isLive?: boolean }) {
  // Kullanıcı elle açıp/kapattıysa otomatik davranış devre dışı kalsın.
  const userToggled = useRef(false);
  const [isOpen, setIsOpen] = useState(isLive);

  // Süre takibi: canlıyken sayacı işlet, bitince dondur.
  const startedAt = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [finalMs, setFinalMs] = useState<number | null>(null);

  useEffect(() => {
    if (isLive) {
      if (startedAt.current == null) startedAt.current = Date.now();
      const t = setInterval(() => setElapsed(Date.now() - (startedAt.current ?? Date.now())), 100);
      return () => clearInterval(t);
    }
    // Canlıdan bitişe geçiş: süreyi dondur, kullanıcı dokunmadıysa katla.
    if (startedAt.current != null && finalMs == null) {
      setFinalMs(Date.now() - startedAt.current);
    }
    if (!userToggled.current) setIsOpen(false);
  }, [isLive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Canlıyken akan metni en alta kaydır.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isLive && isOpen && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [text, isLive, isOpen]);

  const toggle = () => {
    userToggled.current = true;
    setIsOpen((v) => !v);
  };

  const durationLabel =
    finalMs != null ? `Thought for ${formatDuration(finalMs)}` : null;

  return (
    <div
      className={`border rounded-xl my-2 overflow-hidden max-w-3xl select-none transition-all duration-300 ${
        isLive
          ? "border-accent/30 bg-accent/[0.04]"
          : "border-border-subtle bg-bg-secondary/50"
      }`}
    >
      <button
        onClick={toggle}
        className="flex items-center justify-between w-full px-4 py-2.5 text-xs font-medium text-text-secondary hover:bg-bg-hover transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Brain
            className={`w-4 h-4 ${isLive ? "text-accent animate-pulse" : "text-text-muted"}`}
          />
          {isLive ? (
            <span className="flex items-center gap-2">
              <span className="shimmer-text">Thinking</span>
              <span className="tabular-nums text-text-muted">{formatDuration(elapsed)}</span>
            </span>
          ) : (
            <span>{durationLabel ?? "Thought Process"}</span>
          )}
        </div>
        <div className="text-text-muted">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>
      {isOpen && (
        <div
          ref={bodyRef}
          className="px-4 py-3.5 text-[13px] text-text-muted whitespace-pre-wrap font-mono border-t border-border-subtle leading-relaxed max-h-96 overflow-y-auto select-text bg-bg-tertiary/30 shadow-inner"
        >
          {text}
          {isLive && <span className="inline-block w-1.5 h-3.5 ml-0.5 align-middle bg-accent/70 animate-pulse" />}
        </div>
      )}
    </div>
  );
}

/** Bağlam sıkıştırmasının olduğu noktayı gösteren ince ayraç (normal bubble yerine). */
function CompactionDivider({ compressedCount, summary }: { compressedCount: number; summary: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3 my-3 select-none">
      <div className="flex-1 h-px bg-border-subtle" />
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] font-medium text-text-muted hover:text-text-secondary transition-colors whitespace-nowrap"
        title="Eski mesajlar bağlamı sığdırmak için özetlendi"
      >
        <ArchiveRestore className="w-3.5 h-3.5" />
        {compressedCount} earlier message{compressedCount === 1 ? "" : "s"} compressed
      </button>
      <div className="flex-1 h-px bg-border-subtle" />
      {expanded && (
        <div className="basis-full order-last px-4 py-2 mt-1 text-[12px] text-text-muted whitespace-pre-wrap rounded-lg bg-bg-tertiary/40 border border-border-subtle max-h-64 overflow-y-auto">
          {summary}
        </div>
      )}
    </div>
  );
}

/** Tek bir görsel eki — yüklenemezse dosya chip'ine düşer. */
function ImageAttachment({ path, onOpen }: { path: string; onOpen: () => void }) {
  const { src, failed } = useLocalImage(path);
  const [imgError, setImgError] = useState(false);
  const broken = failed || imgError;

  if (!broken && !src) {
    // Yükleniyor — düzen zıplamasın diye küçük bir yer tutucu.
    return (
      <div
        className="rounded-xl border border-border-subtle bg-bg-tertiary/40 animate-pulse"
        style={{ width: 160, height: 108 }}
      />
    );
  }

  if (broken) {
    return (
      <button
        onClick={onOpen}
        title={path}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-bg-hover border border-border text-text-secondary text-xs font-medium max-w-[220px]"
      >
        <ImageOff size={11} className="flex-shrink-0 text-text-muted" />
        <span className="truncate">{fileName(path)}</span>
      </button>
    );
  }

  return (
    <button
      onClick={onOpen}
      title={fileName(path)}
      data-testid="message-image-attachment"
      className="block overflow-hidden rounded-xl border border-border-subtle bg-bg-tertiary/40 hover:border-accent/40 transition-colors"
    >
      <img
        src={src}
        alt={fileName(path)}
        onError={() => setImgError(true)}
        className="max-h-[260px] max-w-[320px] w-auto h-auto object-contain block"
      />
    </button>
  );
}

/** Kullanıcı mesajına iliştirilen dosyalar: görseller render edilir, diğerleri chip. */
function MessageAttachments({ files }: { files: string[] }) {
  const setPreviewFile = useUIStore((s) => s.setPreviewFile);
  if (!files.length) return null;

  const images = files.filter(isImagePath);
  const others = files.filter((f) => !isImagePath(f));

  return (
    <div className="flex flex-col items-end gap-1.5" data-testid="message-attachments">
      {images.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {images.map((p) => (
            <ImageAttachment key={p} path={p} onOpen={() => setPreviewFile(p)} />
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {others.map((p) => (
            <button
              key={p}
              onClick={() => setPreviewFile(p)}
              title={p}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-bg-hover border border-border text-text-secondary hover:text-text-primary text-xs font-medium max-w-[220px] transition-colors"
            >
              <FileText size={11} className="flex-shrink-0 text-text-muted" />
              <span className="truncate">{fileName(p)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MessageBubble({ message, timeline, isLast = false }: Props) {
  if (message.role === "user") {
    const compactionMatch = message.content.match(COMPACTION_MARKER);
    if (compactionMatch) {
      return (
        <CompactionDivider
          compressedCount={Number(compactionMatch[1])}
          summary={message.content.slice(compactionMatch[0].length).trim()}
        />
      );
    }
    // "Attached files:" bloğunu ham yol listesi olarak göstermek yerine ayır;
    // görseller composer'daki gibi gerçek görsel olarak render edilir.
    const { text, files } = parseAttachments(message.content);
    return (
      <div className="flex justify-end animate-fade-in group" data-testid="user-message">
        <div className="flex flex-col items-end gap-1.5 max-w-[80%]">
          <MessageAttachments files={files} />
          {text && (
            <div className="px-4 py-2.5 rounded-2xl rounded-tr-md text-md selectable bg-user-bubble border border-user-bubble-border text-[#F3F1EC] w-full">
              <ClampText
                text={text}
                className="whitespace-pre-wrap break-words leading-relaxed"
                toggleClassName="mt-1.5 text-xs font-medium text-[#F3F1EC]/70 hover:text-[#F3F1EC] hover:underline"
              />
            </div>
          )}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <CopyButton text={text || message.content} className="text-xs flex items-center gap-1 bg-transparent hover:bg-black/5 dark:hover:bg-white/10" />
          </div>
        </div>
      </div>
    );
  }

  if (message.role === "assistant") {
    const hasTimeline = !!timeline && timeline.length > 0;
    // Akan imleci yalnızca SON metin segmentinde göster.
    const lastTextIdx = hasTimeline
      ? timeline!.reduce((acc, seg, i) => (seg.kind === "text" ? i : acc), -1)
      : -1;

    return (
      <div className="flex gap-3 animate-fade-in">
        {/* Avatar — her mesajda, alt (son satır) hizalı. */}
        <div className="flex-shrink-0 w-8 flex justify-center self-end mb-1">
          {isLast && <RobotLoader size={26} active={!!message.isStreaming} />}
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-2 group">
          {hasTimeline ? (
            timeline!.map((seg, i) => {
              if (seg.kind === "text") {
                return seg.text ? (
                  <AssistantMessage
                    key={seg.id}
                    content={seg.text}
                    isStreaming={message.isStreaming && i === lastTextIdx}
                  />
                ) : null;
              } else if (seg.kind === "reasoning") {
                // Reasoning segmenti akış sırasında en sondaysa model hâlâ düşünüyor demektir.
                const isLive = !!message.isStreaming && i === timeline!.length - 1;
                return <ReasoningBlock key={seg.id} text={seg.text} isLive={isLive} />;
              } else {
                return <ToolGroup key={seg.id} calls={seg.calls} />;
              }
            })
          ) : message.content || message.isStreaming ? (
            <AssistantMessage
              content={message.content}
              isStreaming={message.isStreaming}
            />
          ) : null}
          {message.content && !message.isStreaming && (
            <div className="flex justify-start mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <CopyButton text={message.content} className="text-xs flex items-center gap-1 bg-transparent hover:bg-black/5 dark:hover:bg-white/10" />
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
