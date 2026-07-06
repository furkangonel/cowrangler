import React from 'react'

/**
 * Draggable window chrome for the Design window.
 *
 * The Design BrowserWindow uses macOS `hiddenInset`, which hides the OS title
 * bar but leaves the traffic lights floating over the content. Without an
 * explicit `-webkit-app-region: drag` strip the window cannot be moved at all
 * — that was the reported bug. This bar provides the drag region and reserves
 * space on the left for the traffic lights. All interactive children opt out
 * via `.no-drag` (see design.css).
 */

interface Props {
  /** Left-aligned content (brand, file title, controls). */
  left?: React.ReactNode
  /** Right-aligned content (share, avatar). */
  right?: React.ReactNode
  /** Center content (rare). */
  center?: React.ReactNode
  /** Hairline border + surface under the bar. */
  border?: boolean
  surface?: 'paper' | 'white' | 'transparent'
}

export function DesignTopBar({ left, right, center, border = false, surface = 'transparent' }: Props) {
  const bg =
    surface === 'white' ? 'var(--d-surface)' : surface === 'paper' ? 'var(--d-paper)' : 'transparent'
  return (
    <div
      className="design-titlebar flex items-center"
      style={{
        paddingLeft: 82, // clear the macOS traffic lights
        paddingRight: 12,
        background: bg,
        borderBottom: border ? '1px solid var(--d-line)' : 'none',
      }}
    >
      <div className="flex items-center min-w-0 flex-shrink-0">{left}</div>
      <div className="flex-1 flex items-center justify-center min-w-0">{center}</div>
      <div className="flex items-center gap-2 flex-shrink-0">{right}</div>
    </div>
  )
}

/** Small round user avatar used at the top-right, matching the reference. */
export function DesignAvatar({ initial = 'F' }: { initial?: string }) {
  return (
    <button
      className="no-drag w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors"
      style={{ background: 'var(--d-cream-2)', color: 'var(--d-ink-soft)' }}
      title="Account"
    >
      {initial}
    </button>
  )
}
