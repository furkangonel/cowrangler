/**
 * Tema yöneticisi — Cowork light "paper" + dark warm-charcoal.
 * <html data-theme> ve --font-scale CSS değişkenini ayarlar.
 */

export type ThemePref = 'light' | 'dark' | 'system'

const FONT_SCALES: Record<string, number> = {
  small: 0.92,
  normal: 1,
  large: 1.12,
}

let mediaQuery: MediaQueryList | null = null
let mediaListener: ((e: MediaQueryListEvent) => void) | null = null

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return pref
}

/** Temayı DOM'a uygula. system seçilirse OS değişimlerini canlı dinler. */
export function applyTheme(pref: ThemePref) {
  const resolved = resolveTheme(pref)
  document.documentElement.setAttribute('data-theme', resolved)

  // Önceki system listener'ı temizle
  if (mediaQuery && mediaListener) {
    mediaQuery.removeEventListener('change', mediaListener)
    mediaQuery = null
    mediaListener = null
  }

  if (pref === 'system' && window.matchMedia) {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaListener = (e) => {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light')
    }
    mediaQuery.addEventListener('change', mediaListener)
  }
}

export function applyFontSize(size: string) {
  const scale = FONT_SCALES[size] ?? 1
  document.documentElement.style.setProperty('--font-scale', String(scale))
}
