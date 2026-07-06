import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { ProgressPanel } from "../panels/ProgressPanel";
import { ContextPanel } from "../panels/ContextPanel";
import { WorkingFoldersPanel } from "../panels/WorkingFoldersPanel";
import { InstructionsPanel } from "../panels/InstructionsPanel";
import { DiffPanel } from "../code/DiffPanel";
import { TerminalPanel } from "../code/TerminalPanel";
import { LivePreviewPanel } from "../code/LivePreviewPanel";
import { CodePlanPanel } from "../code/CodePlanPanel";
import { CodeTaskPanel } from "../code/CodeTaskPanel";
import { useUIStore } from "../../stores/ui.store";
import { useProjectsStore } from "../../stores/projects.store";
import { useSessionsStore } from "../../stores/sessions.store";

export function RightPanel() {
  const {
    rightPanelOpen,
    activeTab,
    codeRightTab,
  } = useUIStore();
  const { activeProjectId } = useProjectsStore();
  const { activeSessionId } = useSessionsStore();

  if (!rightPanelOpen) return null;

  // Code sekmesi: sağ panel section'ları codeRightTab ile yönetilir (Terminal | Files | Run).
  // Eğer null ise panel kapalıdır.
  if (activeTab === "code") {
    if (!codeRightTab) return null;

    return (
      <aside
        className="flex flex-col flex-shrink-0 border-l border-border-subtle bg-bg-secondary animate-slide-in"
        style={{ width: "var(--right-panel-width)" }}
      >
        <div className="flex-1 min-h-0 overflow-hidden">
          {codeRightTab === "terminal" && <TerminalPanel />}
          {codeRightTab === "files" && <DiffPanel />}
          {codeRightTab === "run" && <LivePreviewPanel />}
          {codeRightTab === "plan" && <CodePlanPanel />}
          {codeRightTab === "task" && <CodeTaskPanel />}
        </div>
      </aside>
    );
  }

  // Proje seçilmemişse (Cowork boş durumu) sağ panel gösterilmez.
  if (!activeProjectId) return null;

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
                projectId={activeProjectId!}
                sessionId={activeSessionId}
              />
            </CollapsibleBox>

            <CollapsibleBox title="Working Folders" defaultOpen>
              <WorkingFoldersPanel projectId={activeProjectId!} />
            </CollapsibleBox>

            <CollapsibleBox title="Context" defaultOpen={false}>
              <ContextPanel
                projectId={activeProjectId!}
                isSession={isSession}
              />
            </CollapsibleBox>
          </div>
        ) : (
          // ─── Project home view ────────────────────────────────────────────
          <div className="flex flex-col gap-3">
            <CollapsibleBox title="Instructions" defaultOpen>
              <InstructionsPanel projectId={activeProjectId!} />
            </CollapsibleBox>

            <CollapsibleBox title="Context" defaultOpen>
              <ContextPanel
                projectId={activeProjectId!}
                isSession={isSession}
              />
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
  /** Controlled mode: pass open + onToggle together. */
  open?: boolean;
  onToggle?: () => void;
  /** Uncontrolled fallback when open/onToggle are not provided. */
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}

function CollapsibleBox({
  title,
  open: controlledOpen,
  onToggle,
  defaultOpen = true,
  badge,
  children,
}: BoxProps) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined && onToggle !== undefined;
  const open = isControlled ? controlledOpen : localOpen;
  const toggle = isControlled ? onToggle : () => setLocalOpen((o) => !o);

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col bg-bg-elevated border border-border-subtle/60"
      style={{
        boxShadow:
          "0 1px 3px rgb(var(--shadow-rgb) / 0.06), 0 2px 8px rgb(var(--shadow-rgb) / 0.05)",
      }}
    >
      <button
        onClick={toggle}
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
