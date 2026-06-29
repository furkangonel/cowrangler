import React, { useEffect } from 'react'
import { AppShell } from './components/layout/AppShell'
import { SettingsPage } from './components/settings/SettingsPage'
import { DirectoryPage } from './components/extensions/DirectoryPage'
import { NewTaskModal } from './components/project/NewTaskModal'
import { FilePreviewModal } from './components/shared/FilePreviewModal'
import { DesignApp } from './components/design/DesignApp'
import { useProjectsStore } from './stores/projects.store'
import { useSettingsStore } from './stores/settings.store'
import { useUIStore } from './stores/ui.store'

// Check if this window was opened as the Design window
const isDesignWindow = window.location.hash === '#/design'

export default function App() {
  const { loadProjects } = useProjectsStore()
  const { loadAll: loadSettings } = useSettingsStore()
  const settingsPage = useUIStore(s => s.settingsPage)

  useEffect(() => {
    if (!isDesignWindow) {
      loadProjects().catch(console.error)
    }
    loadSettings().catch(console.error)
  }, [])

  if (isDesignWindow) {
    return <DesignApp />
  }

  return (
    <>
      <AppShell />
      {settingsPage !== null && <SettingsPage />}
      <DirectoryPage />
      <NewTaskModal />
      <FilePreviewModal />
    </>
  )
}
