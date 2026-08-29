import React, { useState, useEffect, useRef } from "react";
import {
  ArrowRight, FolderOpen, PanelLeft, Terminal, LayoutGrid, Play,
  MoreHorizontal, ListChecks, ListTodo, ShieldAlert, ShieldCheck, Sparkles,
} from "lucide-react";
import { useAgentStore } from "../../stores/agent.store";
import { Sidebar } from "./Sidebar";
import { RightPanel } from "./RightPanel";
import { CodeSessionView } from "../session/CodeSessionView";
import { ErrorBoundary } from "../shared/ErrorBoundary";
import { NewProjectModal } from "../project/NewProjectModal";

import { useProjectsStore } from "../../stores/projects.store";
import { useSettingsStore } from "../../stores/settings.store";
import { useUIStore } from "../../stores/ui.store";
import { ipc } from "../../lib/ipc";

export function AppShell() {
  const { activeProjectId, projects, addFolder } = useProjectsStore();
  const sandbox = useSettingsStore((s) => s.config.sandbox ?? {});
  const [sandboxRuntimeHealthy, setSandboxRuntimeHealthy] = useState<boolean | null>(null);
  const [sandboxPolicyEnabled, setSandboxPolicyEnabled] = useState(true);
  const {
    newProjectModalOpen,
    setNewProjectModal,
    sidebarCollapsed,
    toggleSidebar,
    codeRightTab,
    toggleCodeRightTab,
    setCodeRightTab,
    openSettings,
  } = useUIStore();

  const project = projects.find((p) => p.id === activeProjectId);
  const showCode = !!project?.workdir;
  const sandboxLowTrust =
    sandboxPolicyEnabled === false ||
    sandbox.provider === "fallback" ||
    sandboxRuntimeHealthy === false;

  useEffect(() => {
    let active = true;
    const refreshSecurityState = async () => {
      try {
        const [health, policy] = await Promise.all([
          ipc.settings.sandboxHealth(),
          window.electronAPI.permissions.get(),
        ]);
        if (!active) return;
        setSandboxRuntimeHealthy(health.isolated);
        setSandboxPolicyEnabled(policy.sandbox.enabled);
      } catch {
        if (active) setSandboxRuntimeHealthy(false);
      }
    };
    void refreshSecurityState();
    window.addEventListener("cowrangler:permissions-changed", refreshSecurityState);
    return () => {
      active = false;
      window.removeEventListener("cowrangler:permissions-changed", refreshSecurityState);
    };
  }, []);

  async function reconnectProject() {
    if (!project) return
    const folder = await ipc.fs.pickFolder()
    if (folder) await addFolder(project.id, folder)
  }

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
          {project ? (
            <>
              <FolderTitleIcon />
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

        </div>
      </div>

      {/* ── Main layout ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className="flex flex-col flex-1 overflow-hidden bg-bg-primary">
          {showCode && (
            <ErrorBoundary label="Code session">
              <CodeSessionView projectId={project!.id} projectWorkdir={project!.workdir!} />
            </ErrorBoundary>
          )}
          {!showCode && (
            <ErrorBoundary label="Empty projects">
              <EmptyState
                hasProject={!!project}
                onPrimary={() => project ? void reconnectProject() : setNewProjectModal(true)}
                onSettings={() => openSettings('models')}
                onDesign={() => void ipc.design.openWindow()}
              />
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

function FolderTitleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="text-text-muted">
      <path d="M2.5 6.5A1.5 1.5 0 0 1 4 5h4l1.6 2H16a1.5 1.5 0 0 1 1.5 1.5V15A1.5 1.5 0 0 1 16 16.5H4A1.5 1.5 0 0 1 2.5 15V6.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

/* ── Empty state ────────────────────────────────────────────────────────── */
function EmptyState({ hasProject, onPrimary, onSettings, onDesign }: {
  hasProject: boolean
  onPrimary: () => void
  onSettings: () => void
  onDesign: () => void
}) {
  return (
    <div className="welcome-stage animate-fade-in">
      <div className="welcome-stage__glow" aria-hidden="true" />
      <div className="welcome-stage__content">
        <div className="workbench-eyebrow"><Sparkles size={13} /> Cowrangler local workspace</div>
        <h1>{hasProject ? 'Reconnect the work.' : 'Bring the work.'}<br /><span>Keep control of the outcome.</span></h1>
        <p>{hasProject
          ? 'Choose the source folder for this project. Its conversations and settings will reconnect automatically.'
          : 'Open a folder and work with an AI agent that can inspect, change and verify — without moving your source code to a Cowrangler cloud.'}</p>
        <div className="welcome-stage__actions">
          <button onClick={onPrimary} className="primary-action"><FolderOpen size={17} /> {hasProject ? 'Reconnect folder' : 'Open local project'} <ArrowRight size={15} /></button>
          <button onClick={onDesign} className="quiet-action">Open Design</button>
          <button onClick={onSettings} className="quiet-action">Choose a model</button>
        </div>
        <div className="welcome-stage__proof">
          <span><ShieldCheck size={14} /> Local-first files</span>
          <span>Explicit approvals</span>
          <span>Bounded storage</span>
        </div>
      </div>
    </div>
  );
}
