import React from "react";
import { PanelRight, PanelLeft, Plus } from "lucide-react";
import { Octopus } from "../shared/Octopus";
import { Sidebar } from "./Sidebar";
import { RightPanel } from "./RightPanel";
import { ProjectHome } from "../project/ProjectHome";
import { SessionView } from "../session/SessionView";
import { GlobalChatView } from "../session/GlobalChatView";
import { NewProjectModal } from "../project/NewProjectModal";
import { StatusBar } from "../shared/StatusBar";
import { useProjectsStore } from "../../stores/projects.store";
import { useSessionsStore } from "../../stores/sessions.store";
import { useUIStore } from "../../stores/ui.store";

export function AppShell() {
  const { activeProjectId, projects } = useProjectsStore();
  const { activeSessionId } = useSessionsStore();
  const {
    newProjectModalOpen,
    rightPanelOpen,
    toggleRightPanel,
    setNewProjectModal,
    sidebarCollapsed,
    toggleSidebar,
    activeTab,
  } = useUIStore();

  const project = projects.find((p) => p.id === activeProjectId);
  const showSession =
    activeTab === "projects" && !!activeProjectId && !!activeSessionId;
  const showProjectHome =
    activeTab === "projects" && !!activeProjectId && !activeSessionId;
  const showEmptyProjects = activeTab === "projects" && !activeProjectId;
  const showGlobalChat = activeTab === "chats";

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
          {activeTab === "chats" ? (
            <span className="brand-serif text-text-primary text-md tracking-tight">
              General Chat
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

        {/* Right controls — chat modunda sağ panel yok, toggle da gizli */}
        <div className="ml-auto flex items-center gap-0.5 no-drag">
          {!showGlobalChat && (
            <button
              onClick={toggleRightPanel}
              title="Toggle side panel"
              className={`p-1.5 rounded-md transition-colors ${
                rightPanelOpen
                  ? "text-accent bg-accent/10"
                  : "text-text-muted hover:text-text-secondary hover:bg-bg-hover"
              }`}
            >
              <PanelRight size={15} />
            </button>
          )}
        </div>
      </div>

      {/* ── Main layout ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className="flex flex-col flex-1 overflow-hidden bg-bg-primary">
          {showEmptyProjects && (
            <EmptyState onNew={() => setNewProjectModal(true)} />
          )}
          {showProjectHome && <ProjectHome projectId={activeProjectId!} />}
          {showSession && (
            <SessionView
              projectId={activeProjectId!}
              sessionId={activeSessionId!}
            />
          )}
          {showGlobalChat && <GlobalChatView />}
        </main>

        <RightPanel />
      </div>

      <StatusBar />

      {newProjectModalOpen && <NewProjectModal />}
    </div>
  );
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
