import React, { useState, useRef, useEffect } from "react";
import designLogo from "@/assets/cowrangler_dsgn.png";
import {
  Plus,
  ChevronDown,
  ArrowUp,
  Search,
  Star,
  List,
  LayoutGrid,
  Paperclip,
  FolderInput,
  GitBranch,
  FolderOpen,
  Upload,
  Plug,
  MoreHorizontal,
  Pencil,
  Trash2,
  ArrowRight,
  Link2,
} from "lucide-react";
import {
  useDesignStore,
  DesignTemplateType,
  DesignProjectRecord,
  DesignSystemRecord,
} from "../../stores/design.store";
import { useSettingsStore } from "../../stores/settings.store";
import { DesignTopBar, DesignAvatar } from "./DesignTopBar";
import { FAN_TEMPLATES, ALL_TEMPLATES, TemplateMeta } from "./DesignTemplates";
import { ipc } from "../../lib/ipc";

const PLACEHOLDERS = [
  "Create a loading animation",
  "Sketch a landing page layout",
  "Animate a logo reveal",
  "Design an onboarding flow",
  "Lay out a pricing page",
];

interface Props {
  onOpen: (project: DesignProjectRecord) => void;
}

export function DesignHome({ onOpen }: Props) {
  const {
    projects,
    loadingProjects,
    loadProjects,
    createProject,
    setActiveProject,
    deleteProject,
    renameProject,
    systems,
    loadSystems,
    createSystem,
    setPending,
  } = useDesignStore();
  const { savedModels, getModel } = useSettingsStore();

  const [input, setInput] = useState("");
  const [template, setTemplate] = useState<DesignTemplateType>("blank");
  const [systemId, setSystemId] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [hoverTemplate, setHoverTemplate] = useState<DesignTemplateType | null>(
    null,
  );
  const [creating, setCreating] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [view, setView] = useState<"list" | "grid">("list");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"projects" | "systems" | "templates">(
    "projects",
  );
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadProjects();
    loadSystems();
  }, []);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Rotate the composer placeholder slowly when empty
  useEffect(() => {
    if (input) return;
    const t = setInterval(
      () => setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length),
      3800,
    );
    return () => clearInterval(t);
  }, [input]);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenu(null);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  async function create(
    name: string,
    type: DesignTemplateType,
    prompt?: string,
  ) {
    if (creating) return;
    setCreating(true);
    try {
      const project = await createProject(
        name.trim() || "Untitled",
        type,
        systemId ?? undefined,
      );
      setActiveProject(project);
      // Hand the typed prompt (and chosen model) to the editor so it starts
      // generating immediately instead of opening an empty chat.
      setPending(prompt ? { text: prompt, model: model ?? undefined } : null);
      onOpen(project);
    } finally {
      setCreating(false);
    }
  }

  function submitComposer() {
    const text = input.trim();
    if (!text) return;
    const name = text.split(/\s+/).slice(0, 6).join(" ");
    create(name, template, text);
  }

  function startTemplate(type: Exclude<DesignTemplateType, "blank">) {
    create(`Untitled ${labelFor(type)}`, type);
  }

  const modelLabel =
    (model ?? getModel())?.split("/").pop() || "Claude Opus 4.8";
  const filtered = projects.filter(
    (p) => search === "" || p.name.toLowerCase().includes(search.toLowerCase()),
  );
  const activeSystem = systems.find((s) => s.id === systemId) ?? null;
  const sortedProjects = [...filtered].sort(
    (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0),
  );
  async function togglePin(p: DesignProjectRecord) {
    await ipc.projects.update(p.id, { pinned: p.pinned ? 0 : 1 });
    loadProjects();
  }

  if (setupOpen) {
    return (
      <DesignSystemSetup
        onBack={() => setSetupOpen(false)}
        onCreate={async (data) => {
          const s = await createSystem(data);
          setSystemId(s.id);
          setSetupOpen(false);
        }}
      />
    );
  }

  return (
    <>
      <DesignTopBar />

      <div className="flex-1 overflow-y-auto">
        <div
          className="mx-auto w-full"
          style={{ maxWidth: 1080, padding: "0 40px 96px" }}
        >
          {/* Brand */}
          <div className="pt-1 pb-10 design-rise flex items-center gap-1">
            <img
              src={designLogo}
              alt="Cowrangler Design"
              className="w-16 h-16 rounded-lg object-contain flex-shrink-0"
            />
            <h2
              className="design-serif text-[26px] leading-none font-semibold"
              style={{ color: "var(--d-ink)" }}
            >
              Cowrangler Design
            </h2>
            <span
              className="text-[11px] tracking-wide"
              style={{ color: "var(--d-ink-faint)" }}
            ></span>
          </div>

          {/* Hero */}
          <h1
            className="design-serif text-center font-semibold design-rise"
            style={{
              fontSize: "clamp(28px, 4.6vw, 28px)",
              color: "var(--d-ink)",
              lineHeight: 1.05,
              marginTop: 18,
            }}
          >
            Howdy! Which design shall we tackle today?
          </h1>

          {/* Composer */}
          <Composer
            input={input}
            setInput={setInput}
            placeholder={PLACEHOLDERS[placeholderIdx]}
            inputRef={inputRef}
            template={template}
            displayTemplate={hoverTemplate ?? template}
            setTemplate={setTemplate}
            modelLabel={modelLabel}
            savedModels={savedModels}
            creating={creating}
            onSubmit={submitComposer}
            systems={systems}
            activeSystem={activeSystem}
            setSystemId={setSystemId}
            onAddSystem={() => setSetupOpen(true)}
            model={model}
            setModel={setModel}
            globalModel={getModel() ?? null}
          />

          {/* Template fan */}
          <p
            className="text-center text-sm mt-12 mb-5"
            style={{ color: "var(--d-ink-muted)" }}
          >
            Start with a template…
          </p>
          <TemplateFan
            selected={template}
            onHover={setHoverTemplate}
            onPick={(t) => setTemplate(template === t ? "blank" : t)}
          />

          <div className="text-center mt-7">
            <button
              onClick={() => create("Untitled", "blank")}
              disabled={creating}
              className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors disabled:opacity-50"
              style={{ color: "var(--d-ink-soft)" }}
            >
              …or start a blank project <ArrowRight size={14} />
            </button>
          </div>

          {/* Library */}
          <div className="mt-16">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-5">
                {(
                  [
                    ["projects", "Projects"],
                    ["systems", "Design systems"],
                    ["templates", "Templates"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className="text-sm font-medium transition-colors"
                    style={{
                      color:
                        tab === key ? "var(--d-ink)" : "var(--d-ink-muted)",
                    }}
                  >
                    {tab === key ? (
                      <span
                        className="px-2.5 py-1 rounded-lg"
                        style={{
                          background: "var(--d-surface)",
                          boxShadow: "0 1px 2px rgba(33,29,24,0.06)",
                        }}
                      >
                        {label}
                      </span>
                    ) : (
                      label
                    )}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                  style={{
                    background: "var(--d-surface)",
                    border: "1px solid var(--d-line)",
                  }}
                >
                  <Search size={13} style={{ color: "var(--d-ink-muted)" }} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search"
                    className="bg-transparent text-sm outline-none w-36"
                    style={{ color: "var(--d-ink)" }}
                  />
                </div>
                <div
                  className="flex rounded-lg overflow-hidden"
                  style={{ border: "1px solid var(--d-line)" }}
                >
                  <button
                    onClick={() => setView("list")}
                    className="w-8 h-8 flex items-center justify-center transition-colors"
                    style={{
                      background:
                        view === "list"
                          ? "var(--d-cream-2)"
                          : "var(--d-surface)",
                      color: "var(--d-ink-soft)",
                    }}
                  >
                    <List size={15} />
                  </button>
                  <button
                    onClick={() => setView("grid")}
                    className="w-8 h-8 flex items-center justify-center transition-colors"
                    style={{
                      background:
                        view === "grid"
                          ? "var(--d-cream-2)"
                          : "var(--d-surface)",
                      color: "var(--d-ink-soft)",
                    }}
                  >
                    <LayoutGrid size={15} />
                  </button>
                </div>
              </div>
            </div>

            {tab === "projects" && (
              <ProjectLibrary
                projects={sortedProjects}
                loading={loadingProjects}
                view={view}
                renaming={renaming}
                onOpen={(p) => {
                  setActiveProject(p);
                  onOpen(p);
                }}
                onTogglePin={togglePin}
                onMenu={(id, x, y) => setMenu({ id, x, y })}
                onRenameChange={(name) =>
                  setRenaming((r) => (r ? { ...r, name } : null))
                }
                onRenameCommit={async () => {
                  if (renaming) {
                    await renameProject(renaming.id, renaming.name);
                    setRenaming(null);
                  }
                }}
                onRenameCancel={() => setRenaming(null)}
              />
            )}
            {tab === "systems" && (
              <EmptyHint text="No design systems yet. Teach Cowrangler your brand so every project starts on-brand." />
            )}
            {tab === "templates" && (
              <EmptyHint text="No templates yet. Create one from any project via the project menu → Duplicate as template." />
            )}
          </div>
        </div>
      </div>

      {/* Context menu */}
      {menu && (
        <div
          ref={menuRef}
          className="fixed z-50 rounded-xl overflow-hidden py-1 design-elev-lg"
          style={{
            left: menu.x,
            top: menu.y,
            minWidth: 168,
            background: "var(--d-surface)",
            border: "1px solid var(--d-line)",
          }}
        >
          <MenuItem
            icon={<Pencil size={13} />}
            label="Rename"
            onClick={() => {
              const p = projects.find((p) => p.id === menu.id);
              if (p) setRenaming({ id: p.id, name: p.name });
              setMenu(null);
            }}
          />
          <MenuItem
            icon={<Trash2 size={13} />}
            label="Delete"
            danger
            onClick={async () => {
              await deleteProject(menu.id);
              setMenu(null);
            }}
          />
        </div>
      )}
    </>
  );
}

/* ── Composer ──────────────────────────────────────────────────────────────── */

function Composer(props: {
  input: string;
  setInput: (v: string) => void;
  placeholder: string;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  template: DesignTemplateType;
  displayTemplate: DesignTemplateType;
  setTemplate: (t: DesignTemplateType) => void;
  modelLabel: string;
  savedModels: string[];
  creating: boolean;
  onSubmit: () => void;
  systems: DesignSystemRecord[];
  activeSystem: DesignSystemRecord | null;
  setSystemId: (id: string | null) => void;
  onAddSystem: () => void;
  model: string | null;
  setModel: (m: string | null) => void;
  globalModel: string | null;
}) {
  const {
    input,
    setInput,
    placeholder,
    inputRef,
    template,
    displayTemplate,
    setTemplate,
    modelLabel,
    savedModels,
    creating,
    onSubmit,
    systems,
    activeSystem,
    setSystemId,
    onAddSystem,
    setModel,
    globalModel,
  } = props;
  const dtMeta = ALL_TEMPLATES.find((t) => t.type === displayTemplate);
  const [tplOpen, setTplOpen] = useState(false);
  const [dsOpen, setDsOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const tplRef = useRef<HTMLDivElement>(null);
  const dsRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (tplRef.current && !tplRef.current.contains(e.target as Node))
        setTplOpen(false);
      if (dsRef.current && !dsRef.current.contains(e.target as Node))
        setDsOpen(false);
      if (modelRef.current && !modelRef.current.contains(e.target as Node))
        setModelOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="mx-auto mt-8 design-rise" style={{ maxWidth: 760 }}>
      <div
        className="rounded-[28px] design-elev"
        style={{
          background: "var(--d-surface)",
          border: "1px solid var(--d-line)",
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder={placeholder}
          disabled={creating}
          className="w-full resize-none bg-transparent outline-none px-6 pt-5 pb-2 text-[15px] leading-relaxed design-composer-textarea"
          style={{ color: "var(--d-ink)" }}
        />
        <div className="flex items-center gap-2 px-3.5 pb-3.5 pt-1">
          {/* Design system */}
          <div className="relative" ref={dsRef}>
            <ComposerChip
              label="Design system"
              value={activeSystem?.name ?? "None"}
              chevron
              active={dsOpen}
              onClick={() => setDsOpen((o) => !o)}
            />
            {dsOpen && (
              <Dropdown onClose={() => setDsOpen(false)}>
                <DropdownItem
                  selected={!activeSystem}
                  onClick={() => {
                    setSystemId(null);
                    setDsOpen(false);
                  }}
                >
                  None
                </DropdownItem>
                {systems.map((s) => (
                  <DropdownItem
                    key={s.id}
                    selected={activeSystem?.id === s.id}
                    onClick={() => {
                      setSystemId(s.id);
                      setDsOpen(false);
                    }}
                  >
                    {s.name}
                  </DropdownItem>
                ))}
                <div
                  className="my-1"
                  style={{ borderTop: "1px solid var(--d-line-2)" }}
                />
                <DropdownItem
                  onClick={() => {
                    setDsOpen(false);
                    onAddSystem();
                  }}
                >
                  + Add a design system…
                </DropdownItem>
              </Dropdown>
            )}
          </div>

          {/* Template */}
          <div className="relative" ref={tplRef}>
            <ComposerChip
              label="Template"
              value={
                displayTemplate === "blank" ? "None" : (dtMeta?.label ?? "None")
              }
              chevron
              onClick={() => setTplOpen((o) => !o)}
              active={tplOpen}
              ring={displayTemplate !== "blank"}
            >
              {dtMeta && (
                <span
                  className="block flex-shrink-0"
                  style={{
                    width: 34,
                    height: 26,
                    borderRadius: 6,
                    background: "var(--d-beige)",
                    padding: 4,
                  }}
                >
                  {dtMeta.thumb}
                </span>
              )}
            </ComposerChip>
            {tplOpen && (
              <Dropdown onClose={() => setTplOpen(false)}>
                <DropdownItem
                  selected={template === "blank"}
                  onClick={() => {
                    setTemplate("blank");
                    setTplOpen(false);
                  }}
                >
                  None
                </DropdownItem>
                {ALL_TEMPLATES.map((t) => (
                  <DropdownItem
                    key={t.type}
                    selected={template === t.type}
                    onClick={() => {
                      setTemplate(t.type);
                      setTplOpen(false);
                    }}
                  >
                    {t.label}
                  </DropdownItem>
                ))}
              </Dropdown>
            )}
          </div>

          <div className="flex-1" />

          {/* Model */}
          <div className="relative" ref={modelRef}>
            <ComposerChip
              label="Model"
              value={modelLabel}
              chevron
              active={modelOpen}
              onClick={() => setModelOpen((o) => !o)}
            />
            {modelOpen && (
              <div
                className="absolute right-0 bottom-full mb-2 z-40 rounded-xl overflow-hidden py-1.5 design-elev-lg"
                style={{
                  minWidth: 200,
                  background: "var(--d-surface)",
                  border: "1px solid var(--d-line)",
                }}
              >
                <DropdownItem
                  selected={!props.model}
                  onClick={() => {
                    setModel(null);
                    setModelOpen(false);
                  }}
                >
                  Use Global Model ({globalModel?.split("/").pop() ?? "default"}
                  )
                </DropdownItem>
                {savedModels.map((m) => (
                  <DropdownItem
                    key={m}
                    selected={props.model === m}
                    onClick={() => {
                      setModel(m);
                      setModelOpen(false);
                    }}
                  >
                    {m.split("/").pop() ?? m}
                  </DropdownItem>
                ))}
                {savedModels.length === 0 && (
                  <p
                    className="px-3 py-2 text-xs italic"
                    style={{ color: "var(--d-ink-faint)" }}
                  >
                    No saved models
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Send */}
          <button
            onClick={onSubmit}
            disabled={creating}
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-white transition-all active:scale-95 disabled:opacity-60"
            style={{
              background: input.trim() ? "var(--d-clay)" : "var(--d-clay-soft)",
            }}
            title="Create"
          >
            {creating ? (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <ArrowUp size={17} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ComposerChip({
  label,
  value,
  chevron,
  square,
  active,
  ring,
  onClick,
  children,
}: {
  label?: string;
  value?: string;
  chevron?: boolean;
  square?: boolean;
  active?: boolean;
  ring?: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-xl transition-all"
      style={{
        height: 40,
        padding: square ? 0 : "0 10px",
        width: square ? 40 : undefined,
        justifyContent: square ? "center" : undefined,
        border: `1px solid ${ring ? "#5b86d6" : "var(--d-line)"}`,
        boxShadow: ring ? "0 0 0 2px rgba(91,134,214,0.25)" : undefined,
        background: active ? "var(--d-cream-2)" : "var(--d-surface)",
        color: "var(--d-ink-soft)",
      }}
    >
      {children}
      {label && (
        <span className="text-left leading-tight">
          <span
            className="block text-[10px]"
            style={{ color: "var(--d-ink-faint)" }}
          >
            {label}
          </span>
          <span
            className="block text-[13px] font-medium"
            style={{ color: "var(--d-ink)" }}
          >
            {value}
          </span>
        </span>
      )}
      {chevron && (
        <ChevronDown size={13} style={{ color: "var(--d-ink-muted)" }} />
      )}
    </button>
  );
}

function PlusMenu({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="absolute left-0 bottom-full mb-2 z-40 rounded-2xl overflow-hidden py-2 design-elev-lg"
      style={{
        minWidth: 244,
        background: "var(--d-surface)",
        border: "1px solid var(--d-line)",
      }}
    >
      <MenuLabel>Files</MenuLabel>
      <MenuItem
        icon={<Paperclip size={14} />}
        label="Attach file"
        onClick={onClose}
      />
      <MenuItem
        icon={<FolderInput size={14} />}
        label="Reference another project"
        onClick={onClose}
      />
      <Divider />
      <MenuLabel>Code</MenuLabel>
      <MenuItem
        icon={<GitBranch size={14} />}
        label="Connect GitHub"
        onClick={onClose}
      />
      <MenuItem
        icon={<FolderOpen size={14} />}
        label="Link local code…"
        onClick={onClose}
      />
      <Divider />
      <MenuLabel>Designs</MenuLabel>
      <MenuItem
        icon={<Upload size={14} />}
        label="Upload .fig file"
        onClick={onClose}
      />
      <MenuItem
        icon={<Plug size={14} />}
        label="Manage connectors"
        onClick={onClose}
      />
    </div>
  );
}

function Dropdown({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  void onClose;
  return (
    <div
      className="absolute left-0 bottom-full mb-2 z-40 rounded-xl overflow-y-auto py-1.5 design-elev-lg"
      style={{
        minWidth: 176,
        maxHeight: 300,
        background: "var(--d-surface)",
        border: "1px solid var(--d-line)",
      }}
    >
      {children}
    </div>
  );
}

function DropdownItem({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 text-sm transition-colors"
      style={{
        background: selected ? "var(--d-cream-2)" : "transparent",
        color: "var(--d-ink)",
        fontWeight: selected ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}

/* ── Template fan ──────────────────────────────────────────────────────────── */

function TemplateFan({
  selected,
  onPick,
  onHover,
}: {
  selected: DesignTemplateType;
  onPick: (t: Exclude<DesignTemplateType, "blank">) => void;
  onHover: (t: DesignTemplateType | null) => void;
}) {
  // gentle arc — outer cards rotate & drop, mirroring the reference fan.
  const rotations = [-10.5, -7, -3.5, 0, 3.5, 7, 10.5];
  const offsets = [25, 14, 5, 0, 5, 14, 25];
  return (
    <div
      className="design-fan flex items-end justify-center"
      style={{ gap: 10 }}
      onMouseLeave={() => onHover(null)}
    >
      {FAN_TEMPLATES.map((t, i) => {
        const isSel = selected === t.type;
        return (
          <button
            key={t.type}
            onClick={() => onPick(t.type)}
            onMouseEnter={() => onHover(t.type)}
            className="design-fan-card flex flex-col items-center"
            style={{
              transform: `rotate(${rotations[i]}deg) translateY(${offsets[i]}px)`,
              zIndex: isSel ? 30 : 10 - Math.abs(i - 3),
            }}
          >
            <div
              className="rounded-2xl flex items-center justify-center design-elev transition-all"
              style={{
                width: 116,
                height: 92,
                background: "var(--d-surface)",
                border: `1px solid ${isSel ? "#5b86d6" : "var(--d-line)"}`,
                boxShadow: isSel ? "0 0 0 2px rgba(91,134,214,0.3)" : undefined,
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 48,
                  borderRadius: 8,
                  background: "var(--d-beige)",
                  padding: 6,
                }}
              >
                {t.thumb}
              </div>
            </div>
            <span
              className="mt-2.5 text-[13px] font-semibold"
              style={{ color: isSel ? "#3f63a8" : "var(--d-ink-soft)" }}
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Project library ───────────────────────────────────────────────────────── */

function ProjectLibrary(props: {
  projects: DesignProjectRecord[];
  loading: boolean;
  view: "list" | "grid";
  renaming: { id: string; name: string } | null;
  onOpen: (p: DesignProjectRecord) => void;
  onTogglePin: (p: DesignProjectRecord) => void;
  onMenu: (id: string, x: number, y: number) => void;
  onRenameChange: (name: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
}) {
  const {
    projects,
    loading,
    view,
    renaming,
    onOpen,
    onTogglePin,
    onMenu,
    onRenameChange,
    onRenameCommit,
    onRenameCancel,
  } = props;

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-14 rounded-xl"
            style={{ background: "var(--d-cream-2)" }}
          />
        ))}
      </div>
    );
  }
  if (projects.length === 0) {
    return (
      <EmptyHint text="Your projects will appear here. Describe an idea above or pick a template to begin." />
    );
  }

  if (view === "grid") {
    return (
      <div className="grid grid-cols-3 gap-4">
        {projects.map((p) => (
          <div
            key={p.id}
            onClick={() => onOpen(p)}
            onContextMenu={(e) => {
              e.preventDefault();
              onMenu(p.id, e.clientX, e.clientY);
            }}
            className="group rounded-2xl overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5 design-elev"
            style={{
              background: "var(--d-surface)",
              border: "1px solid var(--d-line)",
            }}
          >
            <div
              className="h-28 flex items-center justify-center text-3xl"
              style={{ background: "linear-gradient(135deg,#f1e9da,#e6d8c4)" }}
            >
              {p.icon ?? "🎨"}
            </div>
            <div className="px-3.5 py-3 flex items-center justify-between">
              <div className="min-w-0">
                <p
                  className="text-sm font-medium truncate"
                  style={{ color: "var(--d-ink)" }}
                >
                  {p.name}
                </p>
                <p
                  className="text-xs capitalize"
                  style={{ color: "var(--d-ink-muted)" }}
                >
                  {p.designType ?? "blank"}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMenu(p.id, e.clientX, e.clientY);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-black/5"
                style={{ color: "var(--d-ink-muted)" }}
              >
                <MoreHorizontal size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div
        className="grid items-center px-4 py-2 text-xs font-medium"
        style={{
          gridTemplateColumns: "1fr 140px 120px 96px",
          color: "var(--d-ink-muted)",
          borderBottom: "1px solid var(--d-line)",
        }}
      >
        <span>Name</span>
        <span>Last viewed</span>
      </div>
      {projects.map((p) => (
        <div
          key={p.id}
          onClick={() => onOpen(p)}
          onContextMenu={(e) => {
            e.preventDefault();
            onMenu(p.id, e.clientX, e.clientY);
          }}
          className="group grid items-center px-4 py-2.5 cursor-pointer rounded-xl transition-colors hover:bg-black/[0.025]"
          style={{ gridTemplateColumns: "1fr 140px 120px 96px" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0"
              style={{ background: "var(--d-cream-2)" }}
            >
              {p.icon ?? "🎨"}
            </div>
            {renaming?.id === p.id ? (
              <input
                autoFocus
                value={renaming.name}
                onChange={(e) => onRenameChange(e.target.value)}
                onBlur={onRenameCommit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onRenameCommit();
                  if (e.key === "Escape") onRenameCancel();
                }}
                onClick={(e) => e.stopPropagation()}
                className="text-sm font-medium bg-transparent outline-none border-b"
                style={{ color: "var(--d-ink)", borderColor: "var(--d-clay)" }}
              />
            ) : (
              <span
                className="text-sm font-medium truncate"
                style={{ color: "var(--d-ink)" }}
              >
                {p.name}
              </span>
            )}
          </div>
          <span className="text-sm" style={{ color: "var(--d-ink-muted)" }}>
            {formatDate(p.updated_at)}
          </span>

          <div className="flex items-center justify-end gap-1 pr-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMenu(p.id, e.clientX, e.clientY);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-black/5"
              style={{ color: "var(--d-ink-muted)" }}
            >
              <MoreHorizontal size={15} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(p);
              }}
              className={`p-1 rounded-lg hover:bg-black/5 transition-opacity ${p.pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
              title={p.pinned ? "Unpin" : "Pin"}
            >
              <Star
                size={14}
                style={{
                  color: p.pinned ? "var(--d-clay)" : "var(--d-ink-faint)",
                  fill: p.pinned ? "var(--d-clay)" : "none",
                }}
              />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Bits ──────────────────────────────────────────────────────────────────── */

function EmptyHint({ text }: { text: string }) {
  return (
    <p
      className="text-center text-sm py-16"
      style={{ color: "var(--d-ink-faint)" }}
    >
      {text}
    </p>
  );
}
function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide"
      style={{ color: "var(--d-ink-faint)" }}
    >
      {children}
    </p>
  );
}
function Divider() {
  return (
    <div className="my-1" style={{ borderTop: "1px solid var(--d-line-2)" }} />
  );
}
function MenuItem({
  icon,
  label,
  danger,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors hover:bg-black/[0.04]"
      style={{ color: danger ? "#c0392b" : "var(--d-ink-soft)" }}
    >
      {icon}
      {label}
    </button>
  );
}

function Sticker({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed transition-transform hover:scale-105 active:scale-95"
      style={{ right: 26, bottom: 22, transform: "rotate(-9deg)" }}
      title="Set up a design system"
    >
      <div
        className="flex flex-col items-center justify-center text-center px-7 py-6"
        style={{
          width: 150,
          height: 150,
          color: "#2a3550",
          background: "var(--d-blue)",
          clipPath:
            "polygon(50% 0%,61% 8%,75% 4%,79% 19%,93% 22%,89% 37%,100% 50%,89% 63%,93% 78%,79% 81%,75% 96%,61% 92%,50% 100%,39% 92%,25% 96%,21% 81%,7% 78%,11% 63%,0% 50%,11% 37%,7% 22%,21% 19%,25% 4%,39% 8%)",
        }}
      >
        <span
          className="design-serif text-[15px] font-bold leading-tight"
          style={{ transform: "rotate(4deg)" }}
        >
          Set up a design system!
        </span>
        <span
          className="text-[9px] mt-1 leading-tight"
          style={{ transform: "rotate(4deg)" }}
        >
          Create more consistent, on-brand designs
        </span>
      </div>
    </button>
  );
}

function DesignSystemSetup({
  onBack,
  onCreate,
}: {
  onBack: () => void;
  onCreate: (data: { name: string; blurb: string; notes: string }) => void;
}) {
  const [name, setName] = useState("");
  const [blurb, setBlurb] = useState("");
  const [notes, setNotes] = useState("");
  const ready = name.trim().length > 0;

  return (
    <>
      <DesignTopBar
        border
        surface="paper"
        left={
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-medium px-2.5 py-1.5 rounded-lg"
            style={{
              border: "1px solid var(--d-line)",
              color: "var(--d-ink-soft)",
            }}
          >
            <ArrowRight size={14} style={{ transform: "rotate(180deg)" }} />{" "}
            Back
          </button>
        }
        right={
          <button
            onClick={() =>
              ready &&
              onCreate({
                name: name.trim(),
                blurb: blurb.trim(),
                notes: notes.trim(),
              })
            }
            disabled={!ready}
            className="px-3.5 py-1.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
            style={{
              background: ready ? "var(--d-clay)" : "var(--d-clay-soft)",
            }}
          >
            Create design system
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto">
        <div
          className="mx-auto"
          style={{ maxWidth: 640, padding: "40px 32px 80px" }}
        >
          <div className="text-center mb-9">
            <h1
              className="design-serif text-[34px] font-semibold"
              style={{ color: "var(--d-ink)" }}
            >
              Set up your design system
            </h1>
            <p className="text-sm mt-2" style={{ color: "var(--d-ink-muted)" }}>
              Teach Cowrangler your brand so every project starts on-brand.
            </p>
          </div>

          <Field
            label="Company name and blurb"
            hint="e.g. Impastabowl — fast-casual pasta with a kiosk, mobile app, and website"
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name of your brand or design system"
              className="w-full bg-transparent outline-none text-[15px]"
              style={{ color: "var(--d-ink)" }}
            />
          </Field>

          <Field
            label="What is it?"
            hint="A sentence or two on the product and who it's for."
          >
            <textarea
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
              rows={3}
              placeholder="Describe the product…"
              className="w-full bg-transparent outline-none resize-none text-[15px] leading-relaxed"
              style={{ color: "var(--d-ink)" }}
            />
          </Field>

          <Field
            label="Brand notes (optional)"
            hint="Palette, typography, voice, anything Claude should always honor."
          >
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="We use a warm, earthy palette with rounded corners. Voice is playful but precise…"
              className="w-full bg-transparent outline-none resize-none text-[15px] leading-relaxed"
              style={{ color: "var(--d-ink)" }}
            />
          </Field>
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <p
        className="text-sm font-semibold mb-1.5"
        style={{ color: "var(--d-ink-soft)" }}
      >
        {label}
      </p>
      <div
        className="rounded-2xl px-4 py-3"
        style={{
          background: "var(--d-surface)",
          border: "1px solid var(--d-line)",
        }}
      >
        {children}
      </div>
      {hint && (
        <p className="text-xs mt-1.5" style={{ color: "var(--d-ink-faint)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function labelFor(t: DesignTemplateType): string {
  const m = ALL_TEMPLATES.find((x) => x.type === t);
  return m?.label ?? "Project";
}
function formatDate(ms?: number): string {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}
