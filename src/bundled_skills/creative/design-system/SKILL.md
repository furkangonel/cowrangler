---
name: design-system
description: Document and define UI design system tokens, components, and guidelines.
platforms: [linux, macos, windows]
tags: [design-system, ui, ux, tokens, typography, components, style-guide, accessibility]
---

# Design System SOP


## When to Use

- User wants to create or document a design system, component library, or style guide
- User asks about design tokens, typography scales, color palettes, or spacing
- User is building a UI kit or documenting component APIs
- User wants to ensure visual consistency across a product

---

## Part 1 — Design Tokens

Tokens are the single source of truth for all visual decisions. Document them in three tiers:

### Tier 1: Primitive Tokens (raw values)

```json
{
  "color": {
    "blue-50":  "#eff6ff",
    "blue-100": "#dbeafe",
    "blue-500": "#3b82f6",
    "blue-700": "#1d4ed8",
    "blue-900": "#1e3a8a",
    "gray-50":  "#f9fafb",
    "gray-100": "#f3f4f6",
    "gray-500": "#6b7280",
    "gray-900": "#111827",
    "white":    "#ffffff",
    "black":    "#000000"
  },
  "spacing": {
    "0":  "0px",
    "1":  "4px",
    "2":  "8px",
    "3":  "12px",
    "4":  "16px",
    "6":  "24px",
    "8":  "32px",
    "12": "48px",
    "16": "64px"
  },
  "radius": {
    "none": "0px",
    "sm":   "4px",
    "md":   "8px",
    "lg":   "12px",
    "xl":   "16px",
    "full": "9999px"
  },
  "shadow": {
    "sm":  "0 1px 2px rgba(0,0,0,0.05)",
    "md":  "0 4px 6px rgba(0,0,0,0.07)",
    "lg":  "0 10px 15px rgba(0,0,0,0.1)",
    "xl":  "0 20px 25px rgba(0,0,0,0.1)"
  }
}
```

### Tier 2: Semantic Tokens (intent-named aliases)

```json
{
  "color": {
    "brand-primary":     "{color.blue-500}",
    "brand-primary-hover": "{color.blue-700}",
    "text-primary":      "{color.gray-900}",
    "text-secondary":    "{color.gray-500}",
    "text-inverse":      "{color.white}",
    "bg-surface":        "{color.white}",
    "bg-subtle":         "{color.gray-50}",
    "bg-overlay":        "rgba(0,0,0,0.5)",
    "border-default":    "{color.gray-100}",
    "border-strong":     "{color.gray-500}",
    "status-success":    "#16a34a",
    "status-warning":    "#d97706",
    "status-error":      "#dc2626",
    "status-info":       "{color.blue-500}"
  },
  "spacing": {
    "component-padding-sm": "{spacing.2}",
    "component-padding-md": "{spacing.4}",
    "component-padding-lg": "{spacing.6}",
    "layout-section-gap":   "{spacing.12}"
  }
}
```

### Tier 3: Component Tokens (component-scoped overrides)

```json
{
  "button": {
    "bg-primary":       "{color.brand-primary}",
    "bg-primary-hover": "{color.brand-primary-hover}",
    "text-primary":     "{color.text-inverse}",
    "radius":           "{radius.md}",
    "padding-x":        "{spacing.4}",
    "padding-y":        "{spacing.2}"
  }
}
```

---

## Part 2 — Typography Scale

```markdown
| Token       | Size  | Weight | Line Height | Use Case              |
|-------------|-------|--------|-------------|---------------------- |
| display-2xl | 72px  | 700    | 1.1         | Hero headlines        |
| display-xl  | 60px  | 700    | 1.1         | Page titles           |
| display-lg  | 48px  | 700    | 1.2         | Section titles        |
| heading-xl  | 36px  | 600    | 1.25        | Card / modal titles   |
| heading-lg  | 30px  | 600    | 1.3         | H2 equivalent         |
| heading-md  | 24px  | 600    | 1.3         | H3 equivalent         |
| heading-sm  | 20px  | 600    | 1.4         | H4 equivalent         |
| body-lg     | 18px  | 400    | 1.6         | Large body copy       |
| body-md     | 16px  | 400    | 1.6         | Default body copy     |
| body-sm     | 14px  | 400    | 1.5         | Secondary copy        |
| label-lg    | 16px  | 500    | 1.4         | Form labels           |
| label-md    | 14px  | 500    | 1.4         | Secondary labels      |
| label-sm    | 12px  | 500    | 1.4         | Captions, badges      |
| code        | 14px  | 400    | 1.6         | Monospace code        |
```

**Font stack recommendation:**
```css
--font-sans: 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
```

---

## Part 3 — Component Documentation Template

Use this template for every documented component:

```markdown
## [ComponentName]

**Description:** One sentence on what this component does and when to use it.

---

### Props / API

| Prop       | Type                              | Default    | Required | Description                  |
|------------|-----------------------------------|------------|----------|------------------------------|
| `variant`  | `primary \| secondary \| ghost`   | `primary`  | No       | Visual style of the button   |
| `size`     | `sm \| md \| lg`                  | `md`       | No       | Controls padding and font size |
| `disabled` | `boolean`                         | `false`    | No       | Disables interaction          |
| `onClick`  | `() => void`                      | —          | No       | Click event handler           |
| `children` | `ReactNode`                       | —          | Yes      | Button label content          |

---

### Variants

#### Primary
- Use for the main call-to-action on a page or section
- Max 1 primary button per visual region

#### Secondary
- Use for secondary actions that complement the primary action
- Can appear alongside a primary button

#### Ghost
- Use for tertiary actions, navigation, or inside compact layouts
- Avoid using without visible surrounding context

---

### Sizes

| Size | Padding      | Font Size | Min Width |
|------|-------------|-----------|-----------|
| `sm` | 8px × 12px  | 14px      | 64px      |
| `md` | 10px × 16px | 16px      | 80px      |
| `lg` | 12px × 20px | 18px      | 96px      |

---

### States

| State      | Visual Behavior                          |
|------------|------------------------------------------|
| Default    | Base token colors                        |
| Hover      | Background shifts to `brand-primary-hover` |
| Focus      | 2px focus ring using `status-info` + 2px offset |
| Active     | Scale 0.98, slight darken               |
| Disabled   | 40% opacity, `cursor: not-allowed`      |
| Loading    | Spinner replaces label, width locked     |

---

### Accessibility

- [ ] `role="button"` if not using `<button>` element
- [ ] `aria-disabled="true"` (not just `disabled`) for disabled state
- [ ] `aria-label` required when icon-only
- [ ] Focus visible in all browsers (check Safari)
- [ ] Color contrast ≥ 4.5:1 for text on background (WCAG AA)
- [ ] Keyboard: Enter and Space both trigger action

---

### Usage Examples

```tsx
// Primary CTA
<Button variant="primary" size="lg" onClick={handleSubmit}>
  Get Started
</Button>

// Danger / destructive action
<Button variant="primary" intent="danger" onClick={handleDelete}>
  Delete Account
</Button>

// Loading state
<Button variant="primary" loading={isSubmitting}>
  Save Changes
</Button>
```

---

### Do / Don't

| Do | Don't |
|----|-------|
| Use `primary` for the single most important action | Use multiple primary buttons in the same section |
| Write labels as verbs: "Save", "Cancel", "Submit" | Use vague labels: "Click here", "OK" |
| Keep labels under 3 words when possible | Stack buttons vertically unless on mobile |
```

---

## Part 4 — Naming Conventions

### CSS Custom Properties
```css
--[category]-[subcategory]-[variant]-[state]

/* Examples */
--color-brand-primary
--color-text-secondary
--spacing-component-padding-md
--radius-button-md
--shadow-card-hover
```

### Component Names
- PascalCase for components: `Button`, `InputField`, `DropdownMenu`
- Suffix patterns: `*Modal`, `*Drawer`, `*Toast`, `*Tooltip`
- Compound components: `Card.Header`, `Card.Body`, `Card.Footer`

### Token Naming Rules
- Always semantic at tier-2 and tier-3 (describe intent, not appearance)
- Never: `--color-blue` (appearance) → Always: `--color-brand-primary` (intent)
- Include scale in primitives: `gray-100`, `gray-500`, `gray-900`

---

## Part 5 — Accessibility Checklist

- [ ] All colors meet WCAG AA contrast (4.5:1 text, 3:1 large text / UI components)
- [ ] Focus states visible without relying on color alone
- [ ] Interactive elements have keyboard access (Tab, Enter, Space, Arrow keys)
- [ ] All images have `alt` text; decorative images have `alt=""`
- [ ] Form inputs have associated `<label>` elements
- [ ] Error messages are announced via `aria-live` or linked via `aria-describedby`
- [ ] Animations respect `prefers-reduced-motion`
- [ ] Touch targets are at least 44×44px on mobile

---

## Agent Instructions

1. When documenting a design system, always start with tokens before components
2. Ask what framework/tech stack (React, Vue, CSS custom properties, Figma) to tailor the output
3. Generate semantic token names based on the brand colors the user provides
4. Validate color contrast ratios when asked about specific color pairs
5. If the user provides a Figma link or screenshot, analyze it and extract the apparent token values
6. Always include the accessibility checklist for any component documented
