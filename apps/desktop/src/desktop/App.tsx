import React, { Suspense, useEffect } from 'react'
import { AppShell } from './components/layout/AppShell'
import { FilePreviewModal } from './components/shared/FilePreviewModal'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import { useProjectsStore } from './stores/projects.store'
import { useSettingsStore } from './stores/settings.store'
import { useUIStore } from './stores/ui.store'

// Check if this window was opened as the Design window
const isDesignWindow = window.location.hash === '#/design'
const SettingsPage = React.lazy(() => import('./components/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const DirectoryPage = React.lazy(() => import('./components/extensions/DirectoryPage').then((module) => ({ default: module.DirectoryPage })))
const DesignApp = React.lazy(() => import('./components/design/DesignApp').then((module) => ({ default: module.DesignApp })))

export default function App() {
  const { loadProjects } = useProjectsStore()
  const { loadAll: loadSettings } = useSettingsStore()
  const settingsPage = useUIStore(s => s.settingsPage)
  const customizeOpen = useUIStore(s => s.customizeOpen)

  useEffect(() => {
    if (!isDesignWindow) {
      loadProjects().catch(console.error)
    }
    loadSettings().catch(console.error)
  }, [])

  if (isDesignWindow) {
    return (
      <ErrorBoundary label="Design">
        <Suspense fallback={<SurfaceLoader label="Opening Design" />}><DesignApp /></Suspense>
      </ErrorBoundary>
    )
  }

  return (
    <>
      <ErrorBoundary label="Workspace">
        <AppShell />
      </ErrorBoundary>
      {settingsPage !== null && (
        <ErrorBoundary label="Settings">
          <Suspense fallback={null}><SettingsPage /></Suspense>
        </ErrorBoundary>
      )}
      {customizeOpen && (
        <ErrorBoundary label="Directory">
          <Suspense fallback={null}><DirectoryPage /></Suspense>
        </ErrorBoundary>
      )}
      <ErrorBoundary label="File preview">
        <FilePreviewModal />
      </ErrorBoundary>
    </>
  )
}

function SurfaceLoader({ label }: { label: string }) {
  return <div className="grid h-screen place-items-center bg-bg-primary text-xs text-text-muted"><span className="animate-pulse">{label}…</span></div>
}
