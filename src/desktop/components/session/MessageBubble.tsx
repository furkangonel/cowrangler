import React, { useState } from "react";
import { AssistantMessage } from "./AssistantMessage";
import { ToolGroup } from "./ToolGroup";
import { RobotLoader } from "../shared/RobotLoader";
import { CopyButton } from "../shared/CopyButton";
import { TimelineSegment } from "../../stores/agent.store";
import { Brain, ChevronDown, ChevronRight } from "lucide-react";

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

function ReasoningBlock({ text }: { text: string }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="border border-border-subtle bg-bg-secondary/50 rounded-xl my-2 overflow-hidden max-w-3xl select-none transition-all duration-300">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-2.5 text-xs font-medium text-text-secondary hover:bg-bg-hover transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Brain className="w-4 h-4 text-text-muted" />
          <span>Thought Process</span>
        </div>
        <div className="text-text-muted">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>
      {isOpen && (
        <div className="px-4 py-3.5 text-[13px] text-text-muted whitespace-pre-wrap font-mono border-t border-border-subtle leading-relaxed max-h-96 overflow-y-auto select-text bg-bg-tertiary/30 shadow-inner">
          {text}
        </div>
      )}
    </div>
  );
}

export function MessageBubble({ message, timeline, isLast = false }: Props) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end animate-fade-in group">
        <div className="flex flex-col items-end max-w-[80%]">
          <div className="px-4 py-2.5 rounded-2xl rounded-tr-md text-md selectable bg-user-bubble border border-user-bubble-border text-text-primary w-full">
            <p className="whitespace-pre-wrap break-words leading-relaxed">
              {message.content}
            </p>
          </div>
          <div className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <CopyButton text={message.content} className="text-xs flex items-center gap-1 bg-transparent hover:bg-black/5 dark:hover:bg-white/10" />
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
                return <ReasoningBlock key={seg.id} text={seg.text} />;
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
