import React from 'react'
import type { DesignDevice } from '../../stores/design.store'

/**
 * Device chrome for the canvas. Each mockup is drawn at its INTRINSIC outer
 * size with the screen area holding the live iframe at exact content size; the
 * caller scales the whole element with one transform so bezels, notch, and
 * browser bar all scale proportionally with the screen (no fixed-px bezels that
 * look chunky when zoomed out).
 */

export interface DeviceSpec {
  /** content (viewport) size the screen renders at */
  cw: number
  ch: number
  /** full outer size including chrome */
  outerW: number
  outerH: number
}

export const DEVICE_SPECS: Record<Exclude<DesignDevice, null> | 'desktop', DeviceSpec> = {
  mobile:  { cw: 390, ch: 844, outerW: 390 + 24, outerH: 844 + 24 },
  tablet:  { cw: 834, ch: 1112, outerW: 834 + 40, outerH: 1112 + 40 },
  desktop: { cw: 1280, ch: 800, outerW: 1280 + 16, outerH: 800 + 16 + 40 },
}

export function deviceSpec(device: DesignDevice): DeviceSpec | null {
  if (!device) return null
  return DEVICE_SPECS[device] ?? null
}

export type MockupVariant = 'realistic' | 'wireframe'

/** Wrap a screen element in the chrome for the given device. `screen` should be
 *  an iframe (or element) sized to the spec's cw×ch.
 *  - 'realistic' → glossy device / browser chrome (prototype, live-artifact).
 *  - 'wireframe' → low-fidelity dashed skeleton that keeps the device aspect
 *    without faking polish (wireframe template). Outer dims stay identical so
 *    canvas scaling math is unchanged. */
export function DeviceMockup({ device, screen, title, variant = 'realistic' }: { device: Exclude<DesignDevice, null>; screen: React.ReactNode; title?: string; variant?: MockupVariant }) {
  const spec = DEVICE_SPECS[device]
  if (variant === 'wireframe') return <WireframeChrome device={device} spec={spec}>{screen}</WireframeChrome>
  if (device === 'mobile') return <PhoneChrome spec={spec}>{screen}</PhoneChrome>
  if (device === 'tablet') return <TabletChrome spec={spec}>{screen}</TabletChrome>
  return <BrowserChrome spec={spec} title={title}>{screen}</BrowserChrome>
}

/** Low-fidelity skeleton frame: dashed neutral outline at the right device
 *  aspect — no glossy bezel, notch, or traffic lights. */
function WireframeChrome({ device, spec, children }: { device: Exclude<DesignDevice, null>; spec: DeviceSpec; children: React.ReactNode }) {
  const radius = device === 'desktop' ? 10 : device === 'tablet' ? 22 : 30
  const pad = device === 'desktop' ? 8 : device === 'tablet' ? 20 : 12
  return (
    <div style={{ width: spec.outerW, height: spec.outerH, boxSizing: 'border-box', borderRadius: radius, border: '2px dashed #bdb9b0', background: '#f4f3f0', padding: pad, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {device === 'desktop' && (
        <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: 5, border: '1.5px solid #c5c1b8' }} />
          <span style={{ width: 9, height: 9, borderRadius: 5, border: '1.5px solid #c5c1b8' }} />
          <span style={{ width: 9, height: 9, borderRadius: 5, border: '1.5px solid #c5c1b8' }} />
          <div style={{ flex: 1, height: 12, margin: '0 8px', borderRadius: 6, border: '1.5px dashed #cfcbc2' }} />
        </div>
      )}
      <div style={{ flex: 1, width: spec.cw, height: device === 'desktop' ? spec.ch : spec.ch, borderRadius: device === 'desktop' ? 4 : radius - 8, overflow: 'hidden', background: '#fff', border: '1px solid #e3e0d8' }}>
        {children}
      </div>
    </div>
  )
}

function PhoneChrome({ spec, children }: { spec: DeviceSpec; children: React.ReactNode }) {
  return (
    <div style={{ width: spec.outerW, height: spec.outerH, background: '#0b0b0d', borderRadius: 56, padding: 12, boxShadow: '0 30px 60px -20px rgba(0,0,0,0.45), inset 0 0 0 2px rgba(255,255,255,0.06)', position: 'relative' }}>
      <div style={{ width: spec.cw, height: spec.ch, borderRadius: 44, overflow: 'hidden', background: '#fff', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 38, left: 0, right: 0, bottom: 0 }}>
          {children}
        </div>
        {/* Dynamic island */}
        <div style={{ position: 'absolute', top: 9, left: '50%', transform: 'translateX(-50%)', width: 112, height: 30, background: '#0b0b0d', borderRadius: 18, zIndex: 5, pointerEvents: 'none' }} />
      </div>
    </div>
  )
}

function TabletChrome({ spec, children }: { spec: DeviceSpec; children: React.ReactNode }) {
  return (
    <div style={{ width: spec.outerW, height: spec.outerH, background: '#0b0b0d', borderRadius: 36, padding: 20, boxShadow: '0 30px 60px -20px rgba(0,0,0,0.4), inset 0 0 0 2px rgba(255,255,255,0.06)' }}>
      <div style={{ width: spec.cw, height: spec.ch, borderRadius: 18, overflow: 'hidden', background: '#fff' }}>{children}</div>
    </div>
  )
}

function BrowserChrome({ spec, children, title }: { spec: DeviceSpec; children: React.ReactNode; title?: string }) {
  return (
    <div style={{ width: spec.outerW, height: spec.outerH, background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 30px 60px -24px rgba(0,0,0,0.35)', border: '1px solid rgba(0,0,0,0.08)' }}>
      <div style={{ height: 40, background: '#f3f1ec', borderBottom: '1px solid rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px' }}>
        <div style={{ display: 'flex', gap: 7 }}>
          <span style={{ width: 11, height: 11, borderRadius: 6, background: '#ff5f57' }} />
          <span style={{ width: 11, height: 11, borderRadius: 6, background: '#febc2e' }} />
          <span style={{ width: 11, height: 11, borderRadius: 6, background: '#28c840' }} />
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <div style={{ maxWidth: 360, width: '70%', height: 22, borderRadius: 11, background: '#fff', border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#8a8378', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {title ?? 'preview'}
          </div>
        </div>
        <div style={{ width: 52 }} />
      </div>
      <div style={{ width: spec.cw, height: spec.ch, background: '#fff' }}>{children}</div>
    </div>
  )
}
