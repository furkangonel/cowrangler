import React, { useState } from "react";
import { AssistantMessage } from "./AssistantMessage";
import { ToolGroup } from "./ToolGroup";
import { Octopus } from "../shared/Octopus";
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
  const [isOpen, setIsOpen] = useState(true);
  
  return (
    <div className="border border-amber-500/20 bg-amber-500/5 rounded-lg my-2 overflow-hidden max-w-2xl select-none">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-2 text-xs font-semibold text-amber-500 hover:bg-amber-500/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 animate-pulse text-amber-500" />
          <span>Düşünme Süreci</span>
        </div>
        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {isOpen && (
        <div className="px-4 py-3 text-xs text-slate-400 whitespace-pre-wrap font-mono border-t border-amber-500/10 leading-relaxed max-h-60 overflow-y-auto select-text">
          {text}
        </div>
      )}
    </div>
  );
}

export function MessageBubble({ message, timeline, isLast = false }: Props) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tr-md text-md selectable bg-user-bubble border border-user-bubble-border text-text-primary">
          <p className="whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
          </p>
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
          {isLast && <Octopus size={26} />}
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-2">
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
        </div>
      </div>
    );
  }

  return null;
}
