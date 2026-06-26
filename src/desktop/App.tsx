import React, { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { SettingsPage } from './components/settings/SettingsPage'
import { DirectoryPage } from './components/extensions/DirectoryPage'
import { useProjectsStore } from './stores/projects.store'
import { useSettingsStore } from './stores/settings.store'
import { useUIStore } from './stores/ui.store'

export default function App() {
  const { loadProjects, projects } = useProjectsStore()
  const { loadAll: loadSettings } = useSettingsStore()
  const settingsPage = useUIStore(s => s.settingsPage)

  useEffect(() => {
    loadProjects().catch(console.error)
    loadSettings().catch(console.error)
  }, [])

  return (
    <>
      <AppShell />
      {settingsPage !== null && <SettingsPage />}
      <DirectoryPage />
    </>
  )
}
