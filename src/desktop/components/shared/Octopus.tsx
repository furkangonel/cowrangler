import React from 'react'
import octopus from '../../assets/octopus.png'

interface Props {
  /** Piksel cinsinden boyut */
  size?: number
  /** Geriye dönük uyumluluk için tutuldu — artık kendi kendine animasyon YOK. */
  thinking?: boolean
  className?: string
}

/**
 * Cowrangler ahtapotu — gerçek marka ikonunun birebir kendisi.
 * Kendi kendine OYNAMAZ; yalnızca imleç üzerine gelince nazikçe hareket eder
 * (CSS: `.octo-idle:hover`).
 */
export function Octopus({ size = 28, className = '' }: Props) {
  return (
    <img
      src={octopus}
      alt="Cowrangler"
      draggable={false}
      className={`octo octo-idle ${className}`}
      style={{ width: size, height: size, userSelect: 'none' }}
    />
  )
}
