import React from 'react'
import { DesignTemplateType } from '../../stores/design.store'

export interface TemplateMeta {
  type: Exclude<DesignTemplateType, 'blank'>
  label: string
  blurb: string
  thumb: React.ReactNode
}

const stroke = 'rgba(33,29,24,0.42)'
const fill = 'rgba(33,29,24,0.10)'

export const FAN_TEMPLATES: TemplateMeta[] = [
  {
    type: 'prototype',
    label: 'Prototype',
    blurb: 'Interactive product flows',
    thumb: (
      <svg viewBox="0 0 60 44" width="100%" height="100%" fill="none">
        <rect x="6" y="6" width="48" height="32" rx="3" stroke={stroke} strokeWidth="1.5" />
        <rect x="10" y="10" width="18" height="4" rx="2" fill={fill} />
        <rect x="10" y="18" width="28" height="3" rx="1.5" fill={fill} />
        <rect x="10" y="24" width="22" height="3" rx="1.5" fill={fill} />
        <rect x="40" y="10" width="10" height="24" rx="2" stroke={stroke} strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    type: 'slides',
    label: 'Slides',
    blurb: 'Presentation decks',
    thumb: (
      <svg viewBox="0 0 60 44" width="100%" height="100%" fill="none">
        <rect x="4" y="9" width="40" height="26" rx="3" fill={fill} />
        <rect x="9" y="6" width="44" height="29" rx="3" stroke={stroke} strokeWidth="1.5" fill="#fff" />
        <rect x="14" y="12" width="16" height="4" rx="2" fill={fill} />
        <rect x="14" y="20" width="34" height="3" rx="1.5" fill={fill} />
        <rect x="14" y="26" width="26" height="3" rx="1.5" fill={fill} />
      </svg>
    ),
  },
  {
    type: 'document',
    label: 'Document',
    blurb: 'Long-form rich content',
    thumb: (
      <svg viewBox="0 0 60 44" width="100%" height="100%" fill="none">
        <path d="M16 5h20l8 8v26H16z" stroke={stroke} strokeWidth="1.5" fill="#fff" />
        <path d="M36 5v8h8" stroke={stroke} strokeWidth="1.5" />
        <rect x="21" y="20" width="18" height="2.5" rx="1.25" fill={fill} />
        <rect x="21" y="26" width="18" height="2.5" rx="1.25" fill={fill} />
        <rect x="21" y="32" width="12" height="2.5" rx="1.25" fill={fill} />
      </svg>
    ),
  },
  {
    type: 'wireframe',
    label: 'Wireframe',
    blurb: 'Low-fidelity layouts',
    thumb: (
      <svg viewBox="0 0 60 44" width="100%" height="100%" fill="none">
        <rect x="6" y="6" width="48" height="32" rx="3" stroke={stroke} strokeWidth="1.5" strokeDasharray="3 2.5" />
        <path d="M6 14h48" stroke={stroke} strokeWidth="1.5" strokeDasharray="3 2.5" />
        <path d="M30 14v24" stroke={stroke} strokeWidth="1.5" strokeDasharray="3 2.5" />
        <path d="M10 24l8-6 6 5" stroke={stroke} strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    type: 'animation',
    label: 'Animation',
    blurb: 'Motion & micro-interactions',
    thumb: (
      <svg viewBox="0 0 60 44" width="100%" height="100%" fill="none">
        <rect x="6" y="6" width="48" height="32" rx="3" stroke={stroke} strokeWidth="1.5" />
        <circle cx="30" cy="20" r="7" stroke={stroke} strokeWidth="1.5" />
        <path d="M28 17l5 3-5 3z" fill={stroke} />
        <rect x="12" y="32" width="36" height="2.5" rx="1.25" fill={fill} />
        <circle cx="20" cy="33.25" r="2.5" fill={stroke} />
      </svg>
    ),
  },
  {
    type: 'live-artifact',
    label: 'Live Artifact',
    blurb: 'Real-time rendering components',
    thumb: (
      <svg viewBox="0 0 60 44" width="100%" height="100%" fill="none">
        <rect x="6" y="6" width="48" height="32" rx="3" stroke={stroke} strokeWidth="1.5" />
        <circle cx="16" cy="16" r="4" fill={fill} />
        <rect x="24" y="14" width="20" height="4" rx="2" fill={fill} />
        <path d="M16 26h24" stroke={stroke} strokeWidth="1.5" strokeDasharray="2 2" />
        <circle cx="44" cy="26" r="2" fill={stroke} />
      </svg>
    ),
  },
  {
    type: 'hyperframes',
    label: 'Hyperframes',
    blurb: 'Advanced structured frames',
    thumb: (
      <svg viewBox="0 0 60 44" width="100%" height="100%" fill="none">
        <rect x="6" y="6" width="48" height="32" rx="3" stroke={stroke} strokeWidth="1.5" />
        <path d="M20 6v32" stroke={stroke} strokeWidth="1.5" />
        <path d="M20 22h34" stroke={stroke} strokeWidth="1.5" />
        <rect x="26" y="10" width="8" height="8" rx="1" fill={fill} />
        <rect x="40" y="28" width="8" height="8" rx="1" fill={fill} />
      </svg>
    ),
  },
]

export const ALL_TEMPLATES: TemplateMeta[] = [
  ...FAN_TEMPLATES,
]
