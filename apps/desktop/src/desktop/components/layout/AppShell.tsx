import React, { useState, useEffect, useRef } from "react";
import {
  PanelRight, PanelLeft, Plus, Terminal, LayoutGrid, Play,
  MoreHorizontal, ListChecks, ListTodo, ShieldAlert,
} from "lucide-react";
import { useAgentStore } from "../../stores/agent.store";
import { Octopus } from "../shared/Octopus";
import { Sidebar } from "./Sidebar";
import { RightPanel } from "./RightPanel";
import { ProjectHome } from "../project/ProjectHome";
import { SessionView } from "../session/SessionView";
import { CodeSessionView } from "../session/CodeSessionView";
import { ErrorBoundary } from "../shared/ErrorBoundary";
import { FEATURES } from "../../lib/features";
import { NewProjectModal } from "../project/NewProjectModal";

import { useProjectsStore } from "../../stores/projects.store";
import { useSessionsStore } from "../../stores/sessions.store";
import { useSettingsStore } from "../../stores/settings.store";
import { useUIStore, CodeRightTab } from "../../stores/ui.store";

export function AppShell() {
  const { activeProjectId, projects } = useProjectsStore();
  const { activeSessionId } = useSessionsStore();
  const sandbox = useSettingsStore((s) => s.config.sandbox ?? {});
  const {
    newProjectModalOpen,
    rightPanelOpen,
    toggleRightPanel,
    setNewProjectModal,
    sidebarCollapsed,
    toggleSidebar,
    activeTab,
    codeRightTab,
    toggleCodeRightTab,
    setCodeRightTab,
  } = useUIStore();

  const project = projects.find((p) => p.id === activeProjectId);
  const showSession =
    activeTab === "projects" && !!activeProjectId && !!activeSessionId;
  const showProjectHome =
    activeTab === "projects" && !!activeProjectId && !activeSessionId;
  const showEmptyProjects = activeTab === "projects" && !activeProjectId;
  const showCode = FEATURES.code && activeTab === "code";
  const sandboxLowTrust =
    sandbox.enabled === false ||
    sandbox.provider === "fallback" ||
    sandbox.allowUnsandboxed === true;

  return (
    <div className="flex flex-col h-screen bg-bg-primary overflow-hidden">
      {/* ── macOS titlebar ─────────────────────────────────────────────── */}
      <div
        className="drag-region flex-shrink-0 flex items-center bg-bg-secondary border-b border-border-subtle"
        style={{
          height: "var(--titlebar-height)",
          paddingLeft: "82px",
          paddingRight: "12px",
        }}
      >
        {/* Sidebar toggle */}
        <button
          onClick={toggleSidebar}
          title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          className="no-drag p-1.5 rounded-md text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors mr-2"
        >
          <PanelLeft size={15} />
        </button>

        {/* Title */}
        <span className="text-xs font-medium truncate flex items-center gap-1.5">
          {activeTab === "code" ? (
            <span className="brand-serif text-text-primary text-md tracking-tight">
              Code
            </span>
          ) : project ? (
            <>
              <span className="text-base leading-none">{project.icon}</span>
              <span className="text-text-primary font-medium">
                {project.name}
              </span>
            </>
          ) : (
            <span className="brand-serif text-text-primary text-md tracking-tight">
              Cowrangler
            </span>
          )}
        </span>

        {/* Right controls */}
        <div className="ml-auto flex items-center gap-0.5 no-drag">
          {sandboxLowTrust && (
            <div
              className="mr-2 flex items-center gap-1 rounded-md border border-orange-500/40 bg-orange-500/10 px-2 py-1 text-[11px] font-medium text-orange-600 dark:text-orange-400"
              title="Sandbox isolation is disabled or unavailable. Moderate and higher risk actions require approval."
            >
              <ShieldAlert size={13} />
              <span>Low-trust</span>
            </div>
          )}

          {/* Code tab: right tab toggle buttons */}
          {showCode && (
            <div className="flex items-center gap-0.5 mr-1 pr-2">
              <TabToggleBtn
                active={codeRightTab === 'terminal'}
                onClick={() => toggleCodeRightTab('terminal')}
                title="Terminal"
                icon={<Terminal size={14} />}
              />
              <TabToggleBtn
                active={codeRightTab === 'files'}
                onClick={() => toggleCodeRightTab('files')}
                title="Diff"
                icon={<LayoutGrid size={14} />}
              />
              <TabToggleBtn
                active={codeRightTab === 'run'}
                onClick={() => toggleCodeRightTab('run')}
                title="Preview"
                icon={<Play size={14} />}
              />
              <CodeMoreMenu
                active={codeRightTab === 'plan' || codeRightTab === 'task'}
                onOpen={(tab) => setCodeRightTab(tab)}
              />
            </div>
          )}

          {/* Global right panel toggle (hidden on code tab) */}
          {!showCode && (
            <button
              onClick={toggleRightPanel}
              title="Toggle side panel"
              className="p-1.5 rounded-md text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors"
            >
              <PanelRight size={15} />
            </button>
          )}
        </div>
      </div>

      {/* ── Main layout ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {!sidebarCollapsed && <Sidebar />}

        <main className="flex flex-col flex-1 overflow-hidden bg-bg-primary">
          {showEmptyProjects && (
            <ErrorBoundary label="Empty projects">
              <EmptyState onNew={() => setNewProjectModal(true)} />
            </ErrorBoundary>
          )}
          {showProjectHome && (
            <ErrorBoundary label="Project home">
              <ProjectHome projectId={activeProjectId!} />
            </ErrorBoundary>
          )}
          {showSession && (
            <ErrorBoundary label="Session">
              <SessionView
                projectId={activeProjectId!}
                sessionId={activeSessionId!}
              />
            </ErrorBoundary>
          )}
          {showCode && (
            <ErrorBoundary label="Code session">
              <CodeSessionView />
            </ErrorBoundary>
          )}
        </main>

        <ErrorBoundary label="Right panel">
          <RightPanel />
        </ErrorBoundary>
      </div>

      {newProjectModalOpen && <NewProjectModal />}
    </div>
  );
}

/* ── Section toggle button ──────────────────────────────────────────────── */
function TabToggleBtn({
  active,
  onClick,
  title,
  icon,
}: {
  active: boolean
  onClick: () => void
  title: string
  icon: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
        active
          ? "text-text-primary bg-bg-hover"
          : "text-text-muted hover:text-text-secondary hover:bg-bg-hover/50"
      }`}
    >
      {icon}
    </button>
  )
}

/* ── Code header kebab (⋯) — Plan / Task read-only views ────────────────── */
function CodeMoreMenu({
  active,
  onOpen,
}: {
  active: boolean
  onOpen: (tab: "plan" | "task") => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const hasPlan = useAgentStore((s) => !!s.currentPlan)
  const hasTasks = useAgentStore((s) => s.progress.length > 0)

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onOutside)
    return () => document.removeEventListener("mousedown", onOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="More"
        className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
          active || open
            ? "text-text-primary bg-bg-hover"
            : "text-text-muted hover:text-text-secondary hover:bg-bg-hover/50"
        }`}
      >
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1.5 z-50 w-48 bg-bg-secondary border border-border rounded-xl shadow-pop p-1 animate-slide-up">
          <MoreMenuItem
            icon={<ListChecks size={13} />}
            label="Plan"
            hint={hasPlan ? undefined : "No plan yet"}
            disabled={!hasPlan}
            onClick={() => { setOpen(false); onOpen("plan") }}
          />
          <MoreMenuItem
            icon={<ListTodo size={13} />}
            label="Tasks"
            hint={hasTasks ? undefined : "No tasks yet"}
            disabled={!hasTasks}
            onClick={() => { setOpen(false); onOpen("task") }}
          />
        </div>
      )}
    </div>
  )
}

function MoreMenuItem({
  icon, label, hint, disabled, onClick,
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      <span className="text-text-muted">{icon}</span>
      <span className="text-xs font-medium flex-1">{label}</span>
      {hint && <span className="text-[10px] text-text-muted">{hint}</span>}
    </button>
  )
}

/* ── Empty state ────────────────────────────────────────────────────────── */
function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 text-center px-8 animate-fade-in">
      {/* Avatar */}

      <Octopus size={56} />

      {/* Text */}
      <div className="space-y-2 max-w-sm">
        <h3 className="text-2xl font-sans text-text-primary tracking-tight">
          Welcome to Cowrangler
        </h3>
        <p className="text-text-secondary text-md leading-relaxed">
          Create a project so the agent can work on your files, take on tasks,
          and track progress live.
        </p>
      </div>

      {/* CTA */}
      <button
        onClick={onNew}
        className="no-drag flex items-center gap-2 px-5 py-2.5 rounded-xl text-accent-fg text-sm font-medium
                   transition-all active:scale-[0.97]"
        style={{
          background:
            "linear-gradient(160deg, rgb(var(--accent)) 0%, rgb(var(--accent-press)) 100%)",
          boxShadow:
            "0 3px 12px color-mix(in srgb, rgb(var(--accent)) 35%, transparent), 0 1px 3px rgb(var(--shadow-rgb) / 0.10)",
        }}
      >
        <Plus size={16} />
        Create new project
      </button>
    </div>
  );
}
