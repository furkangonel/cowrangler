import React from 'react'

interface Props {
  size?: number
  className?: string
}

export function Spinner({ size = 16, className = '' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`animate-spin ${className}`}
    >
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  )
}
