import React from 'react'
import octopus from '../../assets/octopus.png'

interface Props {
  /** Piksel cinsinden boyut */
  size?: number
  /** true → canlı zıplama (loader); false → nazik sallanma (boşta) */
  thinking?: boolean
  className?: string
}

/**
 * Cowrangler ahtapotu — gerçek marka ikonunun birebir kendisi, CSS ile animasyonlu.
 * Asistan avatarı ve "düşünüyor" loader'ında kullanılır.
 */
export function Octopus({ size = 28, thinking = false, className = '' }: Props) {
  return (
    <img
      src={octopus}
      alt="Cowrangler"
      draggable={false}
      className={`octo ${thinking ? 'octo-think' : 'octo-idle'} ${className}`}
      style={{ width: size, height: size, userSelect: 'none' }}
    />
  )
}
