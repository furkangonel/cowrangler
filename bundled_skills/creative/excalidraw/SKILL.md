---
name: excalidraw
description: Export Excalidraw-compatible JSON diagrams from natural language descriptions.
platforms: [linux, macos, windows]
tags: [excalidraw, diagram, flowchart, whiteboard, json, visualization]
---

# Excalidraw Diagram SOP


## When to Use

- User wants a whiteboard-style diagram, flowchart, or sketch
- User says "draw in Excalidraw", "give me an Excalidraw file", "whiteboard diagram"
- User wants a rough, hand-drawn-look visualization they can edit further

---

## Excalidraw JSON Schema

Every Excalidraw file is a JSON object with this top-level structure:

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [ /* array of elements */ ],
  "appState": {
    "gridSize": null,
    "viewBackgroundColor": "#ffffff"
  },
  "files": {}
}
```

---

## Element Types

### Rectangle

```json
{
  "id": "rect1",
  "type": "rectangle",
  "x": 100,
  "y": 100,
  "width": 160,
  "height": 60,
  "angle": 0,
  "strokeColor": "#1971c2",
  "backgroundColor": "#d0ebff",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 1,
  "opacity": 100,
  "groupIds": [],
  "roundness": { "type": 3 },
  "seed": 1001,
  "version": 1,
  "versionNonce": 1001,
  "isDeleted": false,
  "boundElements": [{ "type": "text", "id": "text1" }],
  "updated": 1,
  "link": null,
  "locked": false
}
```

### Ellipse (Circle)

```json
{
  "id": "ellipse1",
  "type": "ellipse",
  "x": 300,
  "y": 100,
  "width": 120,
  "height": 120,
  "angle": 0,
  "strokeColor": "#2f9e44",
  "backgroundColor": "#d3f9d8",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 1,
  "opacity": 100,
  "groupIds": [],
  "roundness": { "type": 2 },
  "seed": 1002,
  "version": 1,
  "versionNonce": 1002,
  "isDeleted": false,
  "boundElements": [{ "type": "text", "id": "text2" }],
  "updated": 1,
  "link": null,
  "locked": false
}
```

### Text (standalone or bound inside a shape)

```json
{
  "id": "text1",
  "type": "text",
  "x": 110,
  "y": 120,
  "width": 140,
  "height": 20,
  "angle": 0,
  "strokeColor": "#1971c2",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 1,
  "opacity": 100,
  "groupIds": [],
  "seed": 1003,
  "version": 1,
  "versionNonce": 1003,
  "isDeleted": false,
  "text": "API Gateway",
  "fontSize": 16,
  "fontFamily": 1,
  "textAlign": "center",
  "verticalAlign": "middle",
  "containerId": "rect1",
  "originalText": "API Gateway",
  "updated": 1,
  "link": null,
  "locked": false
}
```

### Arrow (connecting two elements)

```json
{
  "id": "arrow1",
  "type": "arrow",
  "x": 260,
  "y": 130,
  "width": 40,
  "height": 0,
  "angle": 0,
  "strokeColor": "#868e96",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 1,
  "opacity": 100,
  "groupIds": [],
  "roundness": { "type": 2 },
  "seed": 1004,
  "version": 1,
  "versionNonce": 1004,
  "isDeleted": false,
  "points": [[0, 0], [40, 0]],
  "lastCommittedPoint": null,
  "startBinding": {
    "elementId": "rect1",
    "focus": 0,
    "gap": 1
  },
  "endBinding": {
    "elementId": "ellipse1",
    "focus": 0,
    "gap": 1
  },
  "startArrowhead": null,
  "endArrowhead": "arrow",
  "updated": 1,
  "link": null,
  "locked": false
}
```

---

## Color Palette

| Purpose | strokeColor | backgroundColor |
|---------|-------------|-----------------|
| Blue / Service | `#1971c2` | `#d0ebff` |
| Green / Success | `#2f9e44` | `#d3f9d8` |
| Orange / Warning | `#e67700` | `#fff3bf` |
| Red / Error | `#c92a2a` | `#ffe3e3` |
| Purple / System | `#7048e8` | `#e5dbff` |
| Gray / Neutral | `#495057` | `#f1f3f5` |

---

## Complete Example — 3-Box Flow Diagram

User: "Draw a simple flow: User → API → Database"

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [
    {
      "id": "r_user", "type": "rectangle",
      "x": 60, "y": 180, "width": 140, "height": 60,
      "angle": 0, "strokeColor": "#495057", "backgroundColor": "#f1f3f5",
      "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid",
      "roughness": 1, "opacity": 100, "groupIds": [],
      "roundness": { "type": 3 }, "seed": 101, "version": 1, "versionNonce": 101,
      "isDeleted": false, "boundElements": [{ "type": "text", "id": "t_user" }],
      "updated": 1, "link": null, "locked": false
    },
    {
      "id": "t_user", "type": "text",
      "x": 70, "y": 200, "width": 120, "height": 20,
      "angle": 0, "strokeColor": "#495057", "backgroundColor": "transparent",
      "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid",
      "roughness": 1, "opacity": 100, "groupIds": [], "seed": 102, "version": 1,
      "versionNonce": 102, "isDeleted": false, "text": "User",
      "fontSize": 16, "fontFamily": 1, "textAlign": "center",
      "verticalAlign": "middle", "containerId": "r_user", "originalText": "User",
      "updated": 1, "link": null, "locked": false
    },
    {
      "id": "r_api", "type": "rectangle",
      "x": 280, "y": 180, "width": 140, "height": 60,
      "angle": 0, "strokeColor": "#1971c2", "backgroundColor": "#d0ebff",
      "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid",
      "roughness": 1, "opacity": 100, "groupIds": [],
      "roundness": { "type": 3 }, "seed": 103, "version": 1, "versionNonce": 103,
      "isDeleted": false, "boundElements": [{ "type": "text", "id": "t_api" }],
      "updated": 1, "link": null, "locked": false
    },
    {
      "id": "t_api", "type": "text",
      "x": 290, "y": 200, "width": 120, "height": 20,
      "angle": 0, "strokeColor": "#1971c2", "backgroundColor": "transparent",
      "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid",
      "roughness": 1, "opacity": 100, "groupIds": [], "seed": 104, "version": 1,
      "versionNonce": 104, "isDeleted": false, "text": "API Gateway",
      "fontSize": 16, "fontFamily": 1, "textAlign": "center",
      "verticalAlign": "middle", "containerId": "r_api", "originalText": "API Gateway",
      "updated": 1, "link": null, "locked": false
    },
    {
      "id": "r_db", "type": "rectangle",
      "x": 500, "y": 180, "width": 140, "height": 60,
      "angle": 0, "strokeColor": "#2f9e44", "backgroundColor": "#d3f9d8",
      "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid",
      "roughness": 1, "opacity": 100, "groupIds": [],
      "roundness": { "type": 3 }, "seed": 105, "version": 1, "versionNonce": 105,
      "isDeleted": false, "boundElements": [{ "type": "text", "id": "t_db" }],
      "updated": 1, "link": null, "locked": false
    },
    {
      "id": "t_db", "type": "text",
      "x": 510, "y": 200, "width": 120, "height": 20,
      "angle": 0, "strokeColor": "#2f9e44", "backgroundColor": "transparent",
      "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid",
      "roughness": 1, "opacity": 100, "groupIds": [], "seed": 106, "version": 1,
      "versionNonce": 106, "isDeleted": false, "text": "Database",
      "fontSize": 16, "fontFamily": 1, "textAlign": "center",
      "verticalAlign": "middle", "containerId": "r_db", "originalText": "Database",
      "updated": 1, "link": null, "locked": false
    },
    {
      "id": "a1", "type": "arrow",
      "x": 200, "y": 210, "width": 80, "height": 0,
      "angle": 0, "strokeColor": "#868e96", "backgroundColor": "transparent",
      "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid",
      "roughness": 1, "opacity": 100, "groupIds": [],
      "roundness": { "type": 2 }, "seed": 107, "version": 1, "versionNonce": 107,
      "isDeleted": false, "points": [[0, 0], [80, 0]], "lastCommittedPoint": null,
      "startBinding": { "elementId": "r_user", "focus": 0, "gap": 1 },
      "endBinding": { "elementId": "r_api", "focus": 0, "gap": 1 },
      "startArrowhead": null, "endArrowhead": "arrow",
      "updated": 1, "link": null, "locked": false
    },
    {
      "id": "a2", "type": "arrow",
      "x": 420, "y": 210, "width": 80, "height": 0,
      "angle": 0, "strokeColor": "#868e96", "backgroundColor": "transparent",
      "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid",
      "roughness": 1, "opacity": 100, "groupIds": [],
      "roundness": { "type": 2 }, "seed": 108, "version": 1, "versionNonce": 108,
      "isDeleted": false, "points": [[0, 0], [80, 0]], "lastCommittedPoint": null,
      "startBinding": { "elementId": "r_api", "focus": 0, "gap": 1 },
      "endBinding": { "elementId": "r_db", "focus": 0, "gap": 1 },
      "startArrowhead": null, "endArrowhead": "arrow",
      "updated": 1, "link": null, "locked": false
    }
  ],
  "appState": { "gridSize": null, "viewBackgroundColor": "#ffffff" },
  "files": {}
}
```

---

## Layout Guidelines

- Start nodes at `x=60`, `y=180` for horizontal left-to-right flows
- Node spacing: 220px horizontally, 120px vertically
- Standard node size: `width=140, height=60` for rectangles
- Arrows start at `x + width` of source, end at `x` of target, same `y + height/2`
- Use `roughness: 1` for the hand-drawn Excalidraw feel (0 = smooth, 2 = very rough)

---

## Agent Instructions

1. Always output the complete JSON — not a fragment
2. Use unique string IDs (e.g., `"r_api"`, `"t_user"`, `"a1"`) — never duplicate IDs
3. Every shape with text needs two elements: the shape element + a text element with `containerId` pointing to the shape
4. Arrows need `startBinding.elementId` and `endBinding.elementId` for proper snapping
5. After the JSON, tell the user: "Paste this into excalidraw.com → Menu → Open → Paste from clipboard"
6. Offer to adjust colors, add more nodes, or change layout direction if asked
