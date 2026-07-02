/**
 * Design Mode IPC handlers
 * Design projects are stored in ~/.cowrangler/design/<id>/ and are also
 * registered as regular projects so the existing agent infrastructure works.
 * They're filtered out of the regular project list via DESIGN_DESC_PREFIX.
 */
import { ipcMain } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { getProjectDB } from '../project_db.js'

export const DESIGN_BASE_DIR = path.join(os.homedir(), '.cowrangler', 'design')
export const DESIGN_SYSTEMS_DIR = path.join(DESIGN_BASE_DIR, '_systems')
export const DESIGN_DESC_PREFIX = '__cowrangler_design__:'

interface DesignSystemRecord {
  id: string
  name: string
  blurb: string
  notes: string
  createdAt: number
}

function listSystems(): DesignSystemRecord[] {
  try {
    return fs.readdirSync(DESIGN_SYSTEMS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => JSON.parse(fs.readFileSync(path.join(DESIGN_SYSTEMS_DIR, f), 'utf-8')) as DesignSystemRecord)
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  } catch { return [] }
}

function systemInstructions(id: string): string {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(DESIGN_SYSTEMS_DIR, `${id}.json`), 'utf-8')) as DesignSystemRecord
    return `\n\nDESIGN SYSTEM — "${s.name}":\n${s.blurb}${s.notes ? `\n\nBrand notes: ${s.notes}` : ''}\nApply this brand consistently across every screen: its palette, typography, voice, and component style.`
  } catch { return '' }
}

/**
 * Design Mode runs on the shared cowrangler core (same agent loop, project +
 * session store the CLI uses) but carries its OWN logic: every design project
 * is seeded with template-specific instructions so the agent behaves like a
 * dedicated design tool rather than a generic assistant. These are injected as
 * project instructions on creation (kept out of the system prompt so prompt
 * caching stays valid across turns).
 */
const DESIGN_BASE_PROMPT = `You are the Cowrangler Design agent — a senior product designer who ships in code.

INTERACTION MODEL (read first — overrides any general workflow guidance):
- You are an INTERACTIVE design tool, not a ticket worker. When the user's request is already specific enough to start (most of the time), BEGIN BUILDING IMMEDIATELY. Do not write a plan document and do not stop the turn to wait for typed approval.
- NEVER end a turn with a standalone message like "Waiting for user approval" or "Let me know if I should proceed". That dead-ends the conversation and loses context. It is forbidden here.
- If — and only if — you genuinely need a decision before building (the direction is ambiguous, there are two equally valid approaches, or a step is destructive), call the \`ask_user\` tool to ask INLINE. Keep it to one short question with 2–4 concrete options. Execution pauses for the answer and then continues IN THE SAME TURN with full context — so you never lose what you were doing.
- Treat any general instruction about \`write_plan\` or waiting for written approval as NOT applying in Design Mode. Here you act, and you use \`ask_user\` when you must check in.
- **START WRITING IMMEDIATELY — no preamble tools.** Do NOT call \`manage_task\`, do NOT list or scan the workspace, do NOT "check for existing assets" before you begin. Your very first action for a new design request is writing the first \`screens/NAME.ext\` file. The screens directory starts empty; there is nothing to discover.
- **NEW files need no read.** Any general "read before write" rule does NOT apply to files that don't exist yet — call \`write_file\` directly for every new screen. Only read a file before EDITING an existing one.
- **FINISH THE JOB IN ONE TURN.** Keep writing until every requested screen/asset AND its \`.meta.json\` sidecar exists. NEVER end the turn describing what you will do next — if a file is left to write, write it. Ending with "I'll now create…" or a summary of unwritten work is a failure.

THE CANVAS CONTRACT (always):
- Write each screen/asset as a SEPARATE, self-contained file inside the \`screens/\` directory.
- The canvas can render four kinds of file. Pick the right one for the job:
  • .html — self-contained page. Inline ALL CSS in <style> and ALL JS in <script>. Fonts only via <link> to Google Fonts. This is the default.
  • .jsx — a single React component for rich, stateful UI (interactive prototypes, app screens). Use \`export default function App(){…}\`. React + ReactDOM + Tailwind utility classes are injected automatically — do NOT add import lines for React/Tailwind or any build step (import lines are stripped at render). No localStorage/sessionStorage. Keep each screen to ONE component file (helpers in the same file). Shared theme variables/styles may live in a single \`screens/shared.css\` — it is auto-applied to every HTML/JSX screen, so you don't import it. Do NOT create any other separate .css/.js files.
  • .svg — a raw, standalone vector (logo, icon, illustration, simple diagram).
  • .mermaid — a Mermaid diagram definition (flowchart, sequence, ERD, journey) for structure/flow.
- Use semantic markup, a deliberate type scale, generous spacing, and a harmonious, intentional palette — production quality, never a wireframe-grey default unless asked.
- Keep ONE consistent design system across every file in a project (shared colors, type, spacing, components).
- Use realistic copy and content, not lorem ipsum, unless the user asks otherwise.
- After writing each file, confirm its filename in one short line.

THE TWEAKS CONTRACT (do this for every visual screen — it powers live editing):
- Drive every themeable value through CSS custom properties on :root — e.g. \`--accent\`, \`--bg\`, \`--text\`, \`--radius\`, \`--heading-scale\`, \`--body-scale\`. Reference them everywhere (\`color: var(--accent)\`, \`font-size: calc(1rem * var(--body-scale, 1))\`). For .jsx, declare the same vars in an injected <style> string or on a wrapper and read them in CSS.
- Alongside each screen file \`NAME.ext\`, write a sidecar \`NAME.ext.meta.json\` describing the screen so the canvas knows how to frame and tweak it:
  {
    "title": "Home",
    "device": "mobile" | "tablet" | "desktop" | null,   // set for app/site screens so the canvas shows the right device mockup; null for slides, docs, posters, diagrams
    "tweaks": [
      { "id": "accent", "label": "Accent", "type": "color",  "var": "--accent", "default": "#c1693f" },
      { "id": "radius", "label": "Corner radius", "type": "range", "var": "--radius", "min": 0, "max": 28, "step": 1, "unit": "px", "default": 14 },
      { "id": "heading", "label": "Heading size", "type": "range", "var": "--heading-scale", "min": 0.8, "max": 1.3, "step": 0.05, "default": 1 },
      { "id": "theme", "label": "Theme", "type": "select", "var": "--theme", "options": ["Stone","Moss","Dusk"], "default": "Stone" },
      { "id": "darkmode", "label": "Dark mode", "type": "toggle", "var": "--dark", "default": false }
    ]
  }
- Only list tweaks that ACTUALLY exist and matter for THAT screen — never a generic boilerplate set. Each tweak's \`var\` must be a CSS variable the screen genuinely uses. 3–6 well-chosen controls is ideal.

QUALITY BAR (aim to make the user say "wow"):
- Ship work that looks like a senior designer labored over it: confident type scale, real visual hierarchy, intentional color, generous whitespace, considered micro-detail (shadows, radii, borders that agree). Never a default-bootstrap look.
- Add tasteful motion and depth where it elevates: subtle entrance transitions, hover states, soft gradients, layering. Restraint over flashiness.
- Prefer real, specific content (names, numbers, copy) and cohesive imagery (CSS gradients, inline SVG, or Unsplash via <img> when a photo helps). No lorem ipsum, no grey placeholder boxes unless it's a wireframe.

The user works on a canvas: each file appears framed appropriately for its kind (device mockup, slide stage, page, or bare artifact). Think in discrete screens/assets, not one giant page.`

const TEMPLATE_PROMPTS: Record<string, string> = {
  prototype: `THIS PROJECT IS A PROTOTYPE — a coherent, interactive multi-screen product flow.
- Prefer .jsx component files for app screens so interactions (tabs, toggles, navigation state) actually work. Use .html only for purely static screens.
- Decide the device target with the user's intent: a mobile app → "mobile" (390×844), a web app/site → "desktop", a tablet app → "tablet". Set it in each screen's meta \`device\`. The canvas renders the matching device mockup automatically — do NOT draw your own phone frame, status bar, or browser chrome in the design itself.
- Name files by screen: home.jsx, player.jsx, profile.jsx, settings.jsx. Reuse one component language across every screen so the flow feels like one product.`,

  slides: `THIS PROJECT IS A SLIDE DECK.
- One .html file per slide, named slide-01.html, slide-02.html, … in order. meta \`device\` = null.
- Each slide is exactly 1280×720 (16:9). Use a shared master layout: consistent margins, a title zone, and a body zone.
- One idea per slide. Large, confident display type. Minimal text per slide.`,

  document: `THIS PROJECT IS A DOCUMENT.
- One .html file per section, named in reading order: cover.html, intro.html, section-1.html, … meta \`device\` = null.
- Each page is ~816px wide (US Letter at 96dpi). Design for continuous vertical reading and printing.
- Strong editorial typography: clear hierarchy, comfortable measure (~70 chars), real headings, captions, and pull quotes.`,

  wireframe: `THIS PROJECT IS A WIREFRAME.
- Deliberately low-fidelity: greyscale, boxes and placeholder blocks, simple labels, dashed containers for undecided areas. .html is fine.
- Set meta \`device\` to match the target (mobile/tablet/desktop) so it sits in the right mockup. Name files by screen: home.html, search.html, detail.html.
- Focus on layout, hierarchy, and flow — not color or polish. Keep tweaks minimal (e.g. greyscale intensity, density).`,

  animation: `THIS PROJECT IS AN ANIMATION SET.
- One self-contained .html animation per file, named by motion: loader.html, logo-reveal.html, page-transition.html. meta \`device\` = null.
- Each must auto-play and, where it loops, loop cleanly. It must fully restart when the iframe reloads (no reliance on user interaction to start).
- Center the motion on a neutral stage. Prefer CSS/Web Animations; keep JS minimal and dependency-free.`,

  'live-artifact': `THIS PROJECT IS A LIVE ARTIFACT — a data-backed dashboard, live report, or synced view.
- A .jsx component is ideal (state, charts, filters). A single index.html with inline JS also works. Set meta \`device\` to "desktop" unless it's clearly a mobile widget.
- Structure the UI around visualizing data with realistic placeholder data. Emphasize clear information architecture: tables, charts, metric cards.`,

  hyperframes: `THIS PROJECT IS A HYPERFRAME — a cinematic, video-like motion sequence (think an animated explainer shot: a plane flying a route, a chart building, a product reveal).
- Output a single index.html (1280×720 stage) with inline CSS and JS. meta \`device\` = null.
- It must read like a short film: a clear beginning → motion → a held, polished FINAL frame. The whole sequence runs ~4–8s, plays automatically when the iframe loads (the canvas "Play" button restarts it by reloading), and then HOLDS the final composition (do not loop unless asked).
- Use GSAP via CDN for a real timeline: \`<script src="https://unpkg.com/gsap@3/dist/gsap.min.js"></script>\` then \`const tl = gsap.timeline();\` and chain steps. Animate along paths where it fits (motionPath/SVG \`<path>\`, stroke-dashoffset draw-on). Keep easing tasteful (power2/expo).
- Go for spectacle with craft: layered depth, soft shadows, gradient lighting, a moving subject, labels that pop in on cue. Real content, no placeholders. Make it the kind of thing someone screen-records and shares.`,

  blank: `THIS IS A BLANK PROJECT.
- Infer the right format and file kind (.html / .jsx / .svg / .mermaid) from the user's request and follow the canvas + tweaks contracts. Set meta \`device\` only when the design is an app/site screen.`,
}

function getDesignInstructions(type: string): string {
  const t = TEMPLATE_PROMPTS[type] ? type : 'blank'
  return `${DESIGN_BASE_PROMPT}\n\n${TEMPLATE_PROMPTS[t]}`
}

export function isDesignProject(description: string | null | undefined): boolean {
  return !!description?.startsWith(DESIGN_DESC_PREFIX)
}

export function getDesignType(description: string | null | undefined): string {
  if (!isDesignProject(description)) return 'blank'
  return description!.slice(DESIGN_DESC_PREFIX.length)
}

export function registerDesignIPC(): void {
  fs.mkdirSync(DESIGN_BASE_DIR, { recursive: true })
  fs.mkdirSync(DESIGN_SYSTEMS_DIR, { recursive: true })

  // ── Design systems ────────────────────────────────────────────────────────
  ipcMain.handle('design:listSystems', () => listSystems())
  ipcMain.handle('design:createSystem', (_, data: { name: string; blurb?: string; notes?: string }) => {
    const id = `ds_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const rec: DesignSystemRecord = { id, name: data.name, blurb: data.blurb ?? '', notes: data.notes ?? '', createdAt: Date.now() }
    fs.writeFileSync(path.join(DESIGN_SYSTEMS_DIR, `${id}.json`), JSON.stringify(rec, null, 2))
    return rec
  })
  ipcMain.handle('design:deleteSystem', (_, id: string) => {
    try { fs.rmSync(path.join(DESIGN_SYSTEMS_DIR, `${id}.json`), { force: true }) } catch {}
    return { ok: true }
  })
  // Attach (or clear) a design system on an existing project — rewrites its instructions.
  ipcMain.handle('design:attachSystem', (_, { projectId, designSystemId }: { projectId: string; designSystemId: string | null }) => {
    const db = getProjectDB()
    const p = db.get(projectId)
    if (!p) return { ok: false }
    const type = getDesignType(p.description)
    db.setInstructions(projectId, getDesignInstructions(type) + (designSystemId ? systemInstructions(designSystemId) : ''))
    return { ok: true }
  })

  // ── Create project ──────────────────────────────────────────────────────────
  ipcMain.handle('design:createProject', async (_, { name, type, designSystemId }: { name: string; type: string; designSystemId?: string }) => {
    const uid = `dp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const workdir = path.join(DESIGN_BASE_DIR, uid)
    const screensDir = path.join(workdir, 'screens')
    fs.mkdirSync(screensDir, { recursive: true })

    // Initialize empty canvas state
    fs.writeFileSync(path.join(workdir, 'canvas.json'), JSON.stringify({ frames: [] }, null, 2))

    const db = getProjectDB()
    const project = db.create({
      name,
      description: `${DESIGN_DESC_PREFIX}${type}`,
      workdir,
      icon: '🎨',
      color: '#7c3aed',
    })

    // Inject template-specific design instructions so the shared core agent
    // behaves as a dedicated design tool for this project type.
    const sysInstr = designSystemId ? systemInstructions(designSystemId) : ''
    db.setInstructions(project.id, getDesignInstructions(type) + sysInstr)

    return { ...project, designType: type }
  })

  // ── List design projects ────────────────────────────────────────────────────
  ipcMain.handle('design:listProjects', () => {
    const db = getProjectDB()
    return db.list()
      .filter((p: any) => isDesignProject(p.description))
      .map((p: any) => ({ ...p, designType: getDesignType(p.description) }))
      .sort((a: any, b: any) => (b.updated_at ?? 0) - (a.updated_at ?? 0))
  })

  // ── Get canvas state ────────────────────────────────────────────────────────
  ipcMain.handle('design:getCanvas', (_, projectId: string) => {
    const db = getProjectDB()
    const project = db.get(projectId)
    if (!project?.workdir) return { frames: [] }
    const canvasPath = path.join(project.workdir, 'canvas.json')
    if (!fs.existsSync(canvasPath)) return { frames: [] }
    try {
      return JSON.parse(fs.readFileSync(canvasPath, 'utf-8'))
    } catch {
      return { frames: [] }
    }
  })

  // ── Save canvas state ───────────────────────────────────────────────────────
  ipcMain.handle('design:saveCanvas', (_, { projectId, frames }: { projectId: string; frames: any[] }) => {
    const db = getProjectDB()
    const project = db.get(projectId)
    if (!project?.workdir) return { ok: false, error: 'Project not found' }
    const canvasPath = path.join(project.workdir, 'canvas.json')
    try {
      fs.writeFileSync(canvasPath, JSON.stringify({ frames }, null, 2))
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // ── Scan for renderable screen files (html / jsx / svg / mermaid) ────────────
  const RENDERABLE = /\.(html?|jsx|svg|mermaid|mmd)$/i
  function kindOf(name: string): 'html' | 'jsx' | 'svg' | 'mermaid' {
    const ext = name.split('.').pop()?.toLowerCase()
    if (ext === 'jsx') return 'jsx'
    if (ext === 'svg') return 'svg'
    if (ext === 'mermaid' || ext === 'mmd') return 'mermaid'
    return 'html'
  }
  function readMetaSidecar(screenPath: string): any | null {
    try {
      const metaPath = `${screenPath}.meta.json`
      if (!fs.existsSync(metaPath)) return null
      return JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    } catch { return null }
  }

  ipcMain.handle('design:scanScreens', (_, projectId: string) => {
    const db = getProjectDB()
    const project = db.get(projectId)
    if (!project?.workdir) return []
    const screensDir = path.join(project.workdir, 'screens')
    if (!fs.existsSync(screensDir)) return []
    try {
      return fs.readdirSync(screensDir)
        .filter((f: string) => RENDERABLE.test(f) && !f.endsWith('.meta.json'))
        .map((f: string) => {
          const filePath = path.join(screensDir, f)
          const stat = fs.statSync(filePath)
          return { name: f, filePath, mtime: stat.mtimeMs, kind: kindOf(f), meta: readMetaSidecar(filePath) }
        })
    } catch {
      return []
    }
  })

  // ── Read a screen's tweak/meta sidecar on demand ────────────────────────────
  ipcMain.handle('design:readMeta', (_, screenPath: string) => readMetaSidecar(screenPath))

  // ── Persist tweak values back into a screen's meta sidecar ───────────────────
  ipcMain.handle('design:saveMeta', (_, { screenPath, meta }: { screenPath: string; meta: any }) => {
    try {
      fs.writeFileSync(`${screenPath}.meta.json`, JSON.stringify(meta, null, 2))
      return { ok: true }
    } catch (e: any) { return { ok: false, error: e.message } }
  })

  // ── Read a design file ──────────────────────────────────────────────────────
  ipcMain.handle('design:readFile', (_, filePath: string) => {
    if (!fs.existsSync(filePath)) return { error: 'File not found' }
    try {
      return { content: fs.readFileSync(filePath, 'utf-8') }
    } catch (e: any) {
      return { error: e.message }
    }
  })

  // ── Export project screens to a folder ──────────────────────────────────────
  ipcMain.handle('design:exportProject', (_, { projectId, destDir }: { projectId: string; destDir: string }) => {
    const db = getProjectDB()
    const project = db.get(projectId)
    if (!project?.workdir) return { ok: false, count: 0 }
    const screensDir = path.join(project.workdir, 'screens')
    if (!fs.existsSync(screensDir)) return { ok: false, count: 0 }
    const files = fs.readdirSync(screensDir).filter((f: string) => f.endsWith('.html') || f.endsWith('.htm'))
    const safe = (project.name || 'design').replace(/[^\w.-]+/g, '_')
    const target = path.join(destDir, safe)
    try {
      fs.mkdirSync(target, { recursive: true })
      for (const f of files) fs.copyFileSync(path.join(screensDir, f), path.join(target, f))
      return { ok: true, count: files.length, dir: target }
    } catch (e: any) {
      return { ok: false, count: 0, error: e.message }
    }
  })

  // ── Version history (checkpoints) ─────────────────────────────────────────────
  // A checkpoint is a full copy of screens/ + canvas.json taken before an agent
  // edit (or on demand), stored under workdir/checkpoints/<id>/. Restoring swaps
  // the live screens/ back to the snapshot so a bad iteration can be undone.
  interface CheckpointMeta { id: string; label: string; createdAt: number; fileCount: number; auto: boolean }

  function copyDir(src: string, dest: string) {
    fs.mkdirSync(dest, { recursive: true })
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name)
      const d = path.join(dest, entry.name)
      if (entry.isDirectory()) copyDir(s, d)
      else if (entry.isFile()) fs.copyFileSync(s, d)
    }
  }
  function countFiles(dir: string): number {
    if (!fs.existsSync(dir)) return 0
    return fs.readdirSync(dir).filter(f => !f.endsWith('.meta.json')).length
  }
  function checkpointsDir(workdir: string) { return path.join(workdir, 'checkpoints') }
  const MAX_CHECKPOINTS = 40

  ipcMain.handle('design:createCheckpoint', (_, { projectId, label, auto }: { projectId: string; label?: string; auto?: boolean }) => {
    const db = getProjectDB()
    const project = db.get(projectId)
    if (!project?.workdir) return { ok: false, error: 'Project not found' }
    const screensDir = path.join(project.workdir, 'screens')
    if (!fs.existsSync(screensDir)) return { ok: false, error: 'No screens yet' }
    const cpRoot = checkpointsDir(project.workdir)
    const id = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const cpDir = path.join(cpRoot, id)
    try {
      copyDir(screensDir, path.join(cpDir, 'screens'))
      const canvasPath = path.join(project.workdir, 'canvas.json')
      if (fs.existsSync(canvasPath)) fs.copyFileSync(canvasPath, path.join(cpDir, 'canvas.json'))
      const meta: CheckpointMeta = {
        id,
        label: (label || '').trim() || (auto ? 'Auto snapshot' : 'Saved version'),
        createdAt: Date.now(),
        fileCount: countFiles(screensDir),
        auto: !!auto,
      }
      fs.writeFileSync(path.join(cpDir, 'checkpoint.json'), JSON.stringify(meta, null, 2))
      // Prune oldest beyond the cap so history doesn't grow without bound.
      const all = fs.readdirSync(cpRoot)
        .filter(f => fs.existsSync(path.join(cpRoot, f, 'checkpoint.json')))
        .map(f => JSON.parse(fs.readFileSync(path.join(cpRoot, f, 'checkpoint.json'), 'utf-8')) as CheckpointMeta)
        .sort((a, b) => a.createdAt - b.createdAt)
      while (all.length > MAX_CHECKPOINTS) {
        const old = all.shift()!
        try { fs.rmSync(path.join(cpRoot, old.id), { recursive: true, force: true }) } catch {}
      }
      return { ok: true, id }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('design:listCheckpoints', (_, projectId: string) => {
    const db = getProjectDB()
    const project = db.get(projectId)
    if (!project?.workdir) return []
    const cpRoot = checkpointsDir(project.workdir)
    if (!fs.existsSync(cpRoot)) return []
    try {
      return fs.readdirSync(cpRoot)
        .filter(f => fs.existsSync(path.join(cpRoot, f, 'checkpoint.json')))
        .map(f => JSON.parse(fs.readFileSync(path.join(cpRoot, f, 'checkpoint.json'), 'utf-8')) as CheckpointMeta)
        .sort((a, b) => b.createdAt - a.createdAt)
    } catch { return [] }
  })

  ipcMain.handle('design:restoreCheckpoint', (_, { projectId, checkpointId }: { projectId: string; checkpointId: string }) => {
    const db = getProjectDB()
    const project = db.get(projectId)
    if (!project?.workdir) return { ok: false, error: 'Project not found' }
    const cpDir = path.join(checkpointsDir(project.workdir), checkpointId)
    const cpScreens = path.join(cpDir, 'screens')
    if (!fs.existsSync(cpScreens)) return { ok: false, error: 'Checkpoint not found' }
    const screensDir = path.join(project.workdir, 'screens')
    try {
      // Safety net: snapshot the current state before overwriting, so a restore
      // is itself reversible.
      if (fs.existsSync(screensDir) && countFiles(screensDir) > 0) {
        const backupId = `cp_${Date.now()}_pre-restore`
        const backupDir = path.join(checkpointsDir(project.workdir), backupId)
        copyDir(screensDir, path.join(backupDir, 'screens'))
        fs.writeFileSync(path.join(backupDir, 'checkpoint.json'), JSON.stringify({
          id: backupId, label: 'Before restore', createdAt: Date.now(), fileCount: countFiles(screensDir), auto: true,
        }, null, 2))
      }
      fs.rmSync(screensDir, { recursive: true, force: true })
      copyDir(cpScreens, screensDir)
      const cpCanvas = path.join(cpDir, 'canvas.json')
      if (fs.existsSync(cpCanvas)) fs.copyFileSync(cpCanvas, path.join(project.workdir, 'canvas.json'))
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // ── Delete project ──────────────────────────────────────────────────────────
  ipcMain.handle('design:deleteProject', async (_, projectId: string) => {
    const db = getProjectDB()
    const project = db.get(projectId)
    if (project?.workdir && isDesignProject(project.description)) {
      try { fs.rmSync(project.workdir, { recursive: true, force: true }) } catch {}
    }
    db.delete(projectId)
    return { ok: true }
  })

  // ── Rename project ──────────────────────────────────────────────────────────
  ipcMain.handle('design:renameProject', (_, { projectId, name }: { projectId: string; name: string }) => {
    const db = getProjectDB()
    db.update(projectId, { name })
    return { ok: true }
  })
}
