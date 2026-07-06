---
name: architecture-diagram
description: Generate dark-themed SVG architecture diagrams as self-contained HTML.
platforms: [linux, macos, windows]
tags: [architecture, diagram, svg, system-design, infrastructure, cloud, erd, devops]
---

# Architecture Diagram SOP


## When to Use

- User wants to visualize system architecture, microservices, cloud infrastructure
- User asks for a data flow diagram, sequence diagram, or ERD
- User says "draw", "diagram", "visualize", "architecture chart", "system map"

---

## Color Palette (Dark Theme)

| Node Type      | Fill      | Stroke    | Label Color |
|----------------|-----------|-----------|-------------|
| Service / API  | `#1e3a5f` | `#4a9eff` | `#a8d4ff`   |
| Database       | `#1a3d2b` | `#4caf50` | `#a8e6b0`   |
| Queue / Broker | `#3d2a00` | `#ff9800` | `#ffd180`   |
| External / SaaS| `#2d1f3d` | `#9c27b0` | `#ce93d8`   |
| User / Client  | `#2a2a2a` | `#9e9e9e` | `#e0e0e0`   |
| Load Balancer  | `#1f2d3d` | `#00bcd4` | `#80deea`   |

Background: `#0d0d1a`  
Arrow color: `#555577`  
Font family: `'Inter', 'Segoe UI', sans-serif`

---

## SVG Structure Template

Produce a **self-contained HTML file** (or inline SVG) with this skeleton:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { margin: 0; background: #0d0d1a; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    svg { font-family: 'Inter', 'Segoe UI', sans-serif; }
  </style>
</head>
<body>
<svg width="900" height="600" viewBox="0 0 900 600" xmlns="http://www.w3.org/2000/svg">
  <rect width="900" height="600" fill="#0d0d1a"/>

  <!-- TITLE -->
  <text x="450" y="36" text-anchor="middle" fill="#e0e0e0" font-size="18" font-weight="600">System Architecture</text>

  <!-- NODES — use <g> groups for each node -->
  <!-- SERVICE NODE TEMPLATE -->
  <g transform="translate(100, 100)">
    <rect width="140" height="54" rx="8" fill="#1e3a5f" stroke="#4a9eff" stroke-width="1.5"/>
    <text x="70" y="22" text-anchor="middle" fill="#a8d4ff" font-size="11" font-weight="600">API Gateway</text>
    <text x="70" y="40" text-anchor="middle" fill="#6699cc" font-size="10">Node.js · Port 8080</text>
  </g>

  <!-- ARROW TEMPLATE (straight) -->
  <line x1="240" y1="127" x2="320" y2="127" stroke="#555577" stroke-width="1.5" marker-end="url(#arrow)"/>

  <!-- ARROW TEMPLATE (curved) -->
  <path d="M 240 200 C 280 200 280 260 320 260" fill="none" stroke="#555577" stroke-width="1.5" marker-end="url(#arrow)"/>

  <!-- ARROW MARKER -->
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#555577"/>
    </marker>
  </defs>

  <!-- LEGEND (bottom-left) -->
  <g transform="translate(20, 520)">
    <rect width="10" height="10" rx="2" fill="#1e3a5f" stroke="#4a9eff" stroke-width="1"/>
    <text x="16" y="9" fill="#888" font-size="9">Service</text>
    <rect x="70" width="10" height="10" rx="2" fill="#1a3d2b" stroke="#4caf50" stroke-width="1"/>
    <text x="86" y="9" fill="#888" font-size="9">Database</text>
    <rect x="150" width="10" height="10" rx="2" fill="#3d2a00" stroke="#ff9800" stroke-width="1"/>
    <text x="166" y="9" fill="#888" font-size="9">Queue</text>
    <rect x="210" width="10" height="10" rx="2" fill="#2d1f3d" stroke="#9c27b0" stroke-width="1"/>
    <text x="226" y="9" fill="#888" font-size="9">External</text>
  </g>
</svg>
</body>
</html>
```

---

## Worked Example — 3-Tier Web App

```svg
<!-- Client -->
<g transform="translate(60, 240)">
  <rect width="120" height="54" rx="8" fill="#2a2a2a" stroke="#9e9e9e" stroke-width="1.5"/>
  <text x="60" y="22" text-anchor="middle" fill="#e0e0e0" font-size="11" font-weight="600">Browser</text>
  <text x="60" y="40" text-anchor="middle" fill="#888" font-size="10">React SPA</text>
</g>

<!-- Load Balancer -->
<g transform="translate(240, 240)">
  <rect width="120" height="54" rx="8" fill="#1f2d3d" stroke="#00bcd4" stroke-width="1.5"/>
  <text x="60" y="22" text-anchor="middle" fill="#80deea" font-size="11" font-weight="600">Load Balancer</text>
  <text x="60" y="40" text-anchor="middle" fill="#4db6c4" font-size="10">nginx · SSL termination</text>
</g>

<!-- API Service -->
<g transform="translate(430, 180)">
  <rect width="120" height="54" rx="8" fill="#1e3a5f" stroke="#4a9eff" stroke-width="1.5"/>
  <text x="60" y="22" text-anchor="middle" fill="#a8d4ff" font-size="11" font-weight="600">API Service</text>
  <text x="60" y="40" text-anchor="middle" fill="#6699cc" font-size="10">FastAPI · x3 replicas</text>
</g>

<!-- Database -->
<g transform="translate(620, 180)">
  <rect width="120" height="54" rx="8" fill="#1a3d2b" stroke="#4caf50" stroke-width="1.5"/>
  <text x="60" y="22" text-anchor="middle" fill="#a8e6b0" font-size="11" font-weight="600">PostgreSQL</text>
  <text x="60" y="40" text-anchor="middle" fill="#5cb85c" font-size="10">Primary · RDS</text>
</g>

<!-- Queue -->
<g transform="translate(430, 310)">
  <rect width="120" height="54" rx="8" fill="#3d2a00" stroke="#ff9800" stroke-width="1.5"/>
  <text x="60" y="22" text-anchor="middle" fill="#ffd180" font-size="11" font-weight="600">Redis Queue</text>
  <text x="60" y="40" text-anchor="middle" fill="#cc7a00" font-size="10">BullMQ · jobs</text>
</g>
```

---

## Best Practices

### Layout
- Left-to-right data flow is most readable
- Group related services with a subtle `<rect>` background (fill opacity 0.05)
- Maintain ~80px vertical gap and ~60px horizontal gap between nodes
- Add a subtitle under the main title: deployment env (prod/staging) and date

### Labels
- Line 1: Component name — bold, larger font (11–13px)
- Line 2: Tech stack / port / replica count — lighter, smaller font (9–10px)
- Arrow labels: use `<text>` midpoint with small font (8–9px), fill `#666688`

### Arrows
- Use straight `<line>` for simple left→right flows
- Use `<path>` with cubic bezier for non-orthogonal connections
- Bidirectional: add `marker-start` and `marker-end`
- Label arrows when the relationship isn't obvious (e.g., "async", "REST", "gRPC")

### Grouping with Zones
```svg
<!-- VPC / Cluster boundary -->
<rect x="220" y="60" width="500" height="320" rx="12"
      fill="#ffffff" fill-opacity="0.02"
      stroke="#333355" stroke-width="1" stroke-dasharray="6,4"/>
<text x="230" y="82" fill="#444466" font-size="10">AWS VPC · us-east-1</text>
```

---

## Agent Instructions

1. Ask clarifying questions if the architecture is ambiguous: "What services connect to what?"
2. Infer node types from names: "Postgres" → database, "Kafka" → queue, "Stripe" → external
3. Always output a complete, copy-pasteable HTML file — not a fragment
4. Default canvas: 900×600 for medium complexity; scale up to 1200×800 for large systems
5. After rendering, briefly describe the data flow in 2–3 sentences
6. Offer to add missing components (caching, CDN, monitoring) if the design seems incomplete
