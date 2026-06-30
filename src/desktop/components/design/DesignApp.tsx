import React from 'react'
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

  function handleOpenProject(project: DesignProjectRecord) {
    setActiveProject(project)
  }

  function handleBack() {
    setActiveProject(null)
  }

  return (
    <div className="design-root flex flex-col">
      {activeProject ? (
        <DesignEditor onBack={handleBack} />
      ) : (
        <DesignHome onOpen={handleOpenProject} />
      )}
    </div>
  )
}
