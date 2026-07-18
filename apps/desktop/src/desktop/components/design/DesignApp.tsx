import React, { useEffect, useState } from 'react'
import { useDesignStore, DesignProjectRecord } from '../../stores/design.store'
import { DesignHome } from './DesignHome'
import { DesignEditor } from './DesignEditor'
import '../../styles/design.css'

/**
 * Root of the standalone Design window (`#/design`). Owns the scoped light
 * theme (`.design-root`) and switches between the home gallery and the
 * per-project editor. This window shares the cowrangler core (agent loop,
 * project + session store) but carries its own design-specific surface.
 */
export function DesignApp() {
  const { activeProject, setActiveProject } = useDesignStore()
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('cowrangler-design-theme')
    if (saved === 'light' || saved === 'dark') return saved
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  })
  useEffect(() => {
    const update = (event: Event) => setTheme((event as CustomEvent<'light' | 'dark'>).detail)
    window.addEventListener('cowrangler-design-theme', update)
    return () => window.removeEventListener('cowrangler-design-theme', update)
  }, [])

  function handleOpenProject(project: DesignProjectRecord) {
    setActiveProject(project)
  }

  function handleBack() {
    setActiveProject(null)
  }

  return (
    <div className="design-root flex flex-col" data-design-theme={theme}>
      {activeProject ? (
        <DesignEditor onBack={handleBack} />
      ) : (
        <DesignHome onOpen={handleOpenProject} />
      )}
    </div>
  )
}
