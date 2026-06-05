import { IpcMain } from 'electron'
import { SkillManager } from '../../core/skills.js'

export function registerSkillsIPC(ipcMain: IpcMain): void {
  const skillManager = new SkillManager()

  ipcMain.handle('skills:list', async () => {
    return skillManager.getAvailableSkills()
  })

  ipcMain.handle('skills:content', async (_, skillId: string) => {
      const skills = skillManager.getAvailableSkills()
    const found = skills.find(s => s.id === skillId)
    return found?.content ?? null
  })

  ipcMain.handle('skills:toggle', async (_, skillId: string, active: boolean) => {
    // Skill toggle durumu config'e kaydedilir
    // Şimdilik sadece OK döndür — ileride SkillManager'a toggle API eklenir
    return { ok: true, skillId, active }
  })
}
