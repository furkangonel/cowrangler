import { IpcMain, shell, dialog } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'
import yaml from 'js-yaml'
import JSZip from 'jszip'
import { SkillManager } from '../../core/skills.js'

const GLOBAL_DIR = path.join(os.homedir(), '.cowrangler')
const SKILLS_DIR = path.join(GLOBAL_DIR, 'skills')
const CONFIG_FILE = path.join(GLOBAL_DIR, 'config.yaml')

function readConfig(): any {
  if (!fs.existsSync(CONFIG_FILE)) return {}
  try { return yaml.load(fs.readFileSync(CONFIG_FILE, 'utf-8')) as any || {} } catch { return {} }
}
function writeConfig(cfg: any): void {
  fs.mkdirSync(GLOBAL_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, yaml.dump(cfg), 'utf-8')
}
function getDisabled(): string[] {
  const cfg = readConfig()
  return Array.isArray(cfg.disabled_skills) ? cfg.disabled_skills : []
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function parseFrontmatterName(content: string): { name?: string; description?: string } {
  if (!content.startsWith('---')) return {}
  const parts = content.split('---')
  if (parts.length < 3) return {}
  try {
    const meta = (yaml.load(parts[1]) as any) || {}
    return { name: meta.name, description: meta.description }
  } catch { return {} }
}

export function registerSkillsIPC(ipcMain: IpcMain): void {
  const skillManager = new SkillManager()

  ipcMain.handle('skills:list', async () => {
    const disabled = getDisabled()
    return skillManager.getAvailableSkills().map(s => ({
      ...s,
      active: !disabled.includes(s.id),
    }))
  })

  ipcMain.handle('skills:content', async (_, skillId: string) => {
    const found = skillManager.getAvailableSkills().find(s => s.id === skillId)
    return found?.content ?? null
  })

  // Toggle — updates the disabled_skills list in config.yaml.
  ipcMain.handle('skills:toggle', async (_, skillId: string, active: boolean) => {
    const cfg = readConfig()
    const disabled: string[] = Array.isArray(cfg.disabled_skills) ? cfg.disabled_skills : []
    const next = active
      ? disabled.filter(id => id !== skillId)
      : Array.from(new Set([...disabled, skillId]))
    cfg.disabled_skills = next
    writeConfig(cfg)
    return { ok: true, skillId, active }
  })

  // Create a new skill — ~/.cowrangler/skills/<id>/SKILL.md
  ipcMain.handle('skills:create', async (_, data: { name: string; description: string; content?: string }) => {
    const id = slugify(data.name || '')
    if (!id) return { ok: false, error: 'Invalid skill name' }
    const dir = path.join(SKILLS_DIR, id)
    if (fs.existsSync(path.join(dir, 'SKILL.md'))) {
      return { ok: false, error: `"${id}" already exists` }
    }
    const desc = (data.description || 'No description.').replace(/\n/g, ' ').trim()
    const body = (data.content || '').trim() ||
      `# ${data.name}\n\n## When to Use\nDescribe when this skill should be used.\n\n## How to Run\nList the steps here.`
    const frontmatter = [
      '---',
      `name: ${id}`,
      `description: ${desc}`,
      'version: 1.0.0',
      'source: global',
      '---',
      '',
    ].join('\n')
    try {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'SKILL.md'), frontmatter + body + '\n', 'utf-8')
      return { ok: true, id }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // Upload a skill from a .md file or a .zip/.skill archive (must contain SKILL.md).
  ipcMain.handle('skills:upload', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Upload a skill',
      properties: ['openFile'],
      filters: [{ name: 'Skill (SKILL.md, .zip, .skill)', extensions: ['md', 'zip', 'skill'] }],
    })
    if (res.canceled || !res.filePaths[0]) return { ok: false, error: 'canceled' }
    const file = res.filePaths[0]
    const ext = path.extname(file).toLowerCase()

    try {
      if (ext === '.md') {
        const content = fs.readFileSync(file, 'utf-8')
        const meta = parseFrontmatterName(content)
        if (!meta.name && !content.includes('name:')) {
          return { ok: false, error: 'The .md file must contain a YAML "name" in frontmatter.' }
        }
        const id = slugify(meta.name || path.basename(file, '.md'))
        if (!id) return { ok: false, error: 'Could not derive a skill id.' }
        const dir = path.join(SKILLS_DIR, id)
        if (fs.existsSync(path.join(dir, 'SKILL.md'))) return { ok: false, error: `"${id}" already exists` }
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'SKILL.md'), content, 'utf-8')
        return { ok: true, id }
      }

      // .zip / .skill — extract the folder containing SKILL.md
      const buf = fs.readFileSync(file)
      const zip = await JSZip.loadAsync(buf)
      const skillEntry = Object.keys(zip.files).find(n => n.replace(/\\/g, '/').endsWith('SKILL.md'))
      if (!skillEntry) return { ok: false, error: 'Archive does not contain a SKILL.md file.' }
      const prefix = skillEntry.slice(0, skillEntry.length - 'SKILL.md'.length) // e.g. "my-skill/"
      const skillMd = await zip.files[skillEntry].async('string')
      const meta = parseFrontmatterName(skillMd)
      const folderName = prefix.replace(/\/+$/, '').split('/').pop() || ''
      const id = slugify(meta.name || folderName || path.basename(file, ext))
      if (!id) return { ok: false, error: 'Could not derive a skill id.' }
      const dest = path.join(SKILLS_DIR, id)
      if (fs.existsSync(path.join(dest, 'SKILL.md'))) return { ok: false, error: `"${id}" already exists` }

      const entries = Object.keys(zip.files).filter(n => n.startsWith(prefix) && !zip.files[n].dir)
      for (const name of entries) {
        const rel = name.slice(prefix.length)
        if (!rel) continue
        const outPath = path.join(dest, rel)
        fs.mkdirSync(path.dirname(outPath), { recursive: true })
        const data = await zip.files[name].async('nodebuffer')
        fs.writeFileSync(outPath, data)
      }
      return { ok: true, id }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // Open the skills folder in the file manager
  ipcMain.handle('skills:openFolder', async () => {
    fs.mkdirSync(SKILLS_DIR, { recursive: true })
    await shell.openPath(SKILLS_DIR)
    return { ok: true }
  })

  // Delete a skill (global/local only — bundled cannot be deleted)
  ipcMain.handle('skills:delete', async (_, skillId: string) => {
    const found = skillManager.getAvailableSkills().find(s => s.id === skillId)
    if (!found || found.source === 'bundled') {
      return { ok: false, error: 'Bundled skills cannot be deleted' }
    }
    const dir = path.join(SKILLS_DIR, skillId)
    try {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // File tree for a skill — returns recursive directory structure
  ipcMain.handle('skills:fileTree', async (_, skillId: string) => {
    const found = skillManager.getAvailableSkills().find(s => s.id === skillId)
    if (!found) return []

    // SkillManager artık her skill için diskteki kök klasörü (dir) döndürür.
    // Bu, bundled / global / local tüm kaynaklar için doğru yolu verir.
    // Geriye dönük güvenlik: dir yoksa global skills dizinine düş.
    const rootDir = found.dir ?? path.join(SKILLS_DIR, skillId)

    if (!fs.existsSync(rootDir)) return []

    function buildTree(dir: string, depth = 0): any[] {
      if (depth > 5) return []
      let entries: any[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch { return [] }

      return entries
        .sort((a, b) => {
          // Directories first, then alphabetical
          if (a.isDirectory() && !b.isDirectory()) return -1
          if (!a.isDirectory() && b.isDirectory()) return 1
          return a.name.localeCompare(b.name)
        })
        .map(entry => {
          const fullPath = path.join(dir, entry.name)
          const isDir = entry.isDirectory()
          const node: any = {
            name: entry.name,
            path: fullPath,
            type: isDir ? 'directory' : 'file',
          }
          if (isDir) node.children = buildTree(fullPath, depth + 1)
          return node
        })
    }

    return buildTree(rootDir)
  })
}

