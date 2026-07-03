import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { ProgressPanel } from "../panels/ProgressPanel";
import { ContextPanel } from "../panels/ContextPanel";
import { WorkingFoldersPanel } from "../panels/WorkingFoldersPanel";
import { InstructionsPanel } from "../panels/InstructionsPanel";
import { ScheduledPanel } from "../panels/ScheduledPanel";
import { useUIStore } from "../../stores/ui.store";
import { useProjectsStore } from "../../stores/projects.store";
import { useSessionsStore } from "../../stores/sessions.store";
import { GLOBAL_PROJECT_ID } from "../session/GlobalChatView";

export function RightPanel() {
  const { rightPanelOpen, activeGlobalSessionId, activeTab } = useUIStore();
  const { activeProjectId } = useProjectsStore();
  const { activeSessionId } = useSessionsStore();

  if (!rightPanelOpen) return null;

  // Chat modunda (General Chat) sağ panel hiç gösterilmez.
  if (activeTab === "chats") return null;

  // Global (projesiz) sohbet: proje sessionlarındaki panel deneyimini burada da
  // ver — Progress + Context (aktif skill'ler dahil). Working Folders / Instructions
  // proje kavramına bağlı olduğundan atlanır.
  // NOT: `activeProjectId`'e bakmak yeterli değil — "chats" sekmesine geçince
  // önceki projenin id'si store'da bayat kalıyor, bu yüzden sekmeyi baz al.
  const isGlobal =
    activeTab === "chats" ||
    !activeProjectId ||
    activeProjectId === GLOBAL_PROJECT_ID;

  if (isGlobal) {
    return (
      <aside
        className="flex flex-col flex-shrink-0 border-l border-border-subtle bg-bg-secondary overflow-y-auto animate-slide-in p-3 gap-3"
        style={{ width: "var(--right-panel-width)" }}
      >
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-3">
            <CollapsibleBox title="Progress" defaultOpen>
              <ProgressPanel
                projectId={GLOBAL_PROJECT_ID}
                sessionId={activeGlobalSessionId}
              />
            </CollapsibleBox>

            <CollapsibleBox title="Context" defaultOpen>
              <ContextPanel projectId={GLOBAL_PROJECT_ID} isSession />
            </CollapsibleBox>
          </div>
        </div>
      </aside>
    );
  }

  // Project session vs project home
  const isSession = !!activeSessionId;

  return (
    <aside
      className="flex flex-col flex-shrink-0 border-l border-border-subtle bg-bg-secondary overflow-y-auto animate-slide-in p-3 gap-3"
      style={{ width: "var(--right-panel-width)" }}
    >
      <div className="flex-1 overflow-y-auto">
        {isSession ? (
          // ─── Session view ─────────────────────────────────────────────────
          <div className="flex flex-col gap-3">
            <CollapsibleBox title="Progress" defaultOpen>
              <ProgressPanel
                projectId={activeProjectId}
                sessionId={activeSessionId}
              />
            </CollapsibleBox>

            <CollapsibleBox title="Working Folders" defaultOpen>
              <WorkingFoldersPanel projectId={activeProjectId} />
            </CollapsibleBox>

            <CollapsibleBox title="Context" defaultOpen={false}>
              <ContextPanel projectId={activeProjectId} isSession={isSession} />
            </CollapsibleBox>
          </div>
        ) : (
          // ─── Project home view ────────────────────────────────────────────
          <div className="flex flex-col gap-3">
            <CollapsibleBox title="Instructions" defaultOpen>
              <InstructionsPanel projectId={activeProjectId} />
            </CollapsibleBox>

            <CollapsibleBox title="Context" defaultOpen>
              <ContextPanel projectId={activeProjectId} isSession={isSession} />
            </CollapsibleBox>
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── CollapsibleBox ──────────────────────────────────────────────────────────

interface BoxProps {
  title: string;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}

function CollapsibleBox({
  title,
  defaultOpen = true,
  badge,
  children,
}: BoxProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col bg-bg-elevated border border-border-subtle/60"
      style={{
        boxShadow:
          "0 1px 3px rgb(var(--shadow-rgb) / 0.06), 0 2px 8px rgb(var(--shadow-rgb) / 0.05)",
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-bg-hover/30 transition-colors group"
      >
        <span className="flex items-center gap-2">
          {badge}
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
            {title}
          </span>
        </span>
        <ChevronDown
          size={12}
          className={`text-text-muted/60 transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
        />
      </button>

      {open && (
        <div className="border-t border-border-subtle/40 px-1 pt-1 pb-2">
          {children}
        </div>
      )}
    </div>
  );
}
