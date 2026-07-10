import { useLayoutEffect, useRef, useState } from 'react'

interface Props {
  text: string
  /** Katlanmış haldeki azami yükseklik (px). Aşılırsa "Show more" çıkar. */
  collapsedMaxPx?: number
  /** Metin <p> class'ı. */
  className?: string
  /** Show more/less butonu class'ı. */
  toggleClassName?: string
}

/**
 * Uzun metni belirli bir yükseklikte kırpar ve "Show more / Show less" ile
 * açıp kapatır. Kullanıcı sohbet balonlarında her yüzeyde ortak kullanılır.
 */
export function ClampText({ text, collapsedMaxPx = 180, className = '', toggleClassName = '' }: Props) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // Kırpma kapalıyken gerçek içerik yüksekliğini ölç.
    const prev = el.style.maxHeight
    el.style.maxHeight = 'none'
    const over = el.scrollHeight > collapsedMaxPx + 4
    el.style.maxHeight = prev
    setOverflowing(over)
  }, [text, collapsedMaxPx])

  const clamped = overflowing && !expanded

  return (
    <>
      <p
        ref={ref}
        className={className}
        style={clamped
          ? {
              maxHeight: collapsedMaxPx,
              overflow: 'hidden',
              WebkitMaskImage: 'linear-gradient(to bottom, #000 62%, transparent)',
              maskImage: 'linear-gradient(to bottom, #000 62%, transparent)',
            }
          : undefined}
      >
        {text}
      </p>
      {overflowing && (
        <button type="button" onClick={() => setExpanded(e => !e)} className={toggleClassName}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </>
  )
}
