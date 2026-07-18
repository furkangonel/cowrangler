import React from 'react'
import {
  AppWindow, Box, FileText, LayoutTemplate, Mail, MonitorPlay, Network,
  Palette, Presentation, Search, Smartphone, Sparkles, UserRound,
} from 'lucide-react'
import { DesignTemplateType } from '../../stores/design.store'

export type TemplateRenderMode = 'device' | 'stage' | 'pages' | 'email' | 'artifact'

export interface TemplateMeta {
  type: Exclude<DesignTemplateType, 'blank'>
  label: string
  shortLabel: string
  blurb: string
  renderMode: TemplateRenderMode
  renderLabel: string
  format: string
  accent: string
  starterPrompt: string
  thumb: React.ReactNode
}

function glyph(icon: React.ReactNode, accent: string) {
  return (
    <span className="design-template-glyph" style={{ color: accent }}>
      {icon}
    </span>
  )
}

/**
 * Canonical Design template registry. Order matches home carousel and stays
 * stable so recent projects, prompt routing, and visual rendering agree.
 */
export const ALL_TEMPLATES: TemplateMeta[] = [
  {
    type: 'mobile-app', label: 'Mobile app design', shortLabel: 'Mobile app',
    blurb: 'Complete, tappable product flows', renderMode: 'device', renderLabel: 'Interactive device canvas',
    format: 'React · 390 × 844', accent: '#577a70', starterPrompt: 'Design a complete mobile app flow with realistic states and interactions.',
    thumb: glyph(<Smartphone size={34} strokeWidth={1.45} />, '#577a70'),
  },
  {
    type: 'slides', label: 'Slides', shortLabel: 'Slides',
    blurb: 'Narrative presentation decks', renderMode: 'stage', renderLabel: '16:9 stage + filmstrip',
    format: 'HTML · 1280 × 720', accent: '#7a6c9d', starterPrompt: 'Create a clear presentation deck with one strong idea per slide.',
    thumb: glyph(<Presentation size={36} strokeWidth={1.4} />, '#7a6c9d'),
  },
  {
    type: 'document', label: 'Document', shortLabel: 'Document',
    blurb: 'Polished, printable long-form work', renderMode: 'pages', renderLabel: 'Paginated A4 sheets',
    format: 'HTML · A4', accent: '#607c98', starterPrompt: 'Create a structured document with editorial typography and true pagination.',
    thumb: glyph(<FileText size={35} strokeWidth={1.4} />, '#607c98'),
  },
  {
    type: 'wireframe', label: 'Wireframe', shortLabel: 'Wireframe',
    blurb: 'Low-fidelity layouts and flows', renderMode: 'device', renderLabel: 'Greyscale flow canvas',
    format: 'HTML · responsive', accent: '#77736c', starterPrompt: 'Map the core user flow as clear low-fidelity wireframes.',
    thumb: glyph(<LayoutTemplate size={36} strokeWidth={1.35} />, '#77736c'),
  },
  {
    type: 'animation', label: 'Animation', shortLabel: 'Animation',
    blurb: 'Motion studies and logo reveals', renderMode: 'stage', renderLabel: 'Replayable motion stage',
    format: 'HTML · timeline', accent: '#aa654d', starterPrompt: 'Create a refined motion study with purposeful timing and a clean loop.',
    thumb: glyph(<MonitorPlay size={36} strokeWidth={1.35} />, '#aa654d'),
  },
  {
    type: 'ui-mockups', label: 'UI mockups', shortLabel: 'UI mockups',
    blurb: 'High-fidelity responsive screens', renderMode: 'device', renderLabel: 'Responsive screen canvas',
    format: 'React · responsive', accent: '#50758b', starterPrompt: 'Design high-fidelity product screens with production-ready interaction states.',
    thumb: glyph(<AppWindow size={37} strokeWidth={1.35} />, '#50758b'),
  },
  {
    type: 'resume', label: 'Résumé', shortLabel: 'Résumé',
    blurb: 'Focused, ATS-aware career stories', renderMode: 'pages', renderLabel: 'Print-safe single page',
    format: 'HTML · A4', accent: '#8a654d', starterPrompt: 'Create a distinctive, ATS-aware résumé with concise, measurable content.',
    thumb: glyph(<UserRound size={35} strokeWidth={1.35} />, '#8a654d'),
  },
  {
    type: '3d-object', label: '3D object', shortLabel: '3D object',
    blurb: 'Interactive product and object studies', renderMode: 'stage', renderLabel: 'Interactive 3D stage',
    format: 'Three.js · 1280 × 720', accent: '#6f7290', starterPrompt: 'Create an interactive 3D object study with crafted materials and lighting.',
    thumb: glyph(<Box size={38} strokeWidth={1.25} />, '#6f7290'),
  },
  {
    type: 'research', label: 'Research', shortLabel: 'Research',
    blurb: 'Evidence-led reports and syntheses', renderMode: 'pages', renderLabel: 'Cited report pages',
    format: 'HTML · A4', accent: '#537469', starterPrompt: 'Create a research brief that separates evidence, findings, and recommendations.',
    thumb: glyph(<Search size={35} strokeWidth={1.4} />, '#537469'),
  },
  {
    type: 'html-email', label: 'HTML email', shortLabel: 'HTML email',
    blurb: 'Inbox-safe campaigns and receipts', renderMode: 'email', renderLabel: 'Inbox width preview',
    format: 'HTML · 600 px', accent: '#a2614e', starterPrompt: 'Create a responsive HTML email with robust table layout and clear fallback styles.',
    thumb: glyph(<Mail size={36} strokeWidth={1.35} />, '#a2614e'),
  },
  {
    type: 'color-type', label: 'Color + type pairing', shortLabel: 'Color + type',
    blurb: 'Brand-ready palette and typography', renderMode: 'artifact', renderLabel: 'Specimen board',
    format: 'HTML · adaptive board', accent: '#ad715e', starterPrompt: 'Create a usable color and typography system with accessibility guidance.',
    thumb: glyph(<Palette size={37} strokeWidth={1.35} />, '#ad715e'),
  },
  {
    type: 'diagram', label: 'Diagram', shortLabel: 'Diagram',
    blurb: 'Clear systems, flows, and maps', renderMode: 'artifact', renderLabel: 'Auto-fit diagram canvas',
    format: 'Mermaid / SVG', accent: '#626b91', starterPrompt: 'Turn the idea into a legible diagram with meaningful hierarchy and labels.',
    thumb: glyph(<Network size={38} strokeWidth={1.35} />, '#626b91'),
  },
  {
    type: 'flier', label: 'Flier', shortLabel: 'Flier',
    blurb: 'Print-ready promotional artwork', renderMode: 'pages', renderLabel: 'Portrait print preview',
    format: 'HTML · A4 portrait', accent: '#bd6448', starterPrompt: 'Create a bold print-ready flier with one clear message and strong hierarchy.',
    thumb: glyph(<Sparkles size={36} strokeWidth={1.35} />, '#bd6448'),
  },
]

export const FAN_TEMPLATES = ALL_TEMPLATES

export function templateFor(type?: string | null): TemplateMeta | undefined {
  return ALL_TEMPLATES.find(template => template.type === type)
}
