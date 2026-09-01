# Design Research & System — JDpdf

## Reference points

Studied patterns (not copied verbatim) from established PDF/productivity
tools (iLovePDF, Smallpdf, Adobe Acrobat Web, Sejda) and general SaaS
design systems (Linear, Stripe Dashboard, Vercel) for what makes a
utility tool feel trustworthy and fast rather than "AI-template generic":

- **Restrained color** — one primary brand color used deliberately (CTAs,
  active states, links), a neutral gray scale for everything else. Not a
  rainbow of gradient accents.
- **Calm surfaces** — flat or near-flat cards with a single subtle border
  and shadow token, not glassmorphism/blur stacks.
- **Content-first hero** — a one-sentence value prop + the tool/upload
  entry point above the fold, not a giant illustration or abstract 3D
  render competing with the actual product.
- **Immediate upload affordance** — the most successful tools put the
  dropzone in the hero itself on tool pages, so there is zero ambiguity
  about what to do first (blueprint §85 — the product must not feel like
  an AI-generated template with a disconnected hero and CTA).
- **Progress honesty** — real step labels ("Uploading… / Processing… /
  Finalizing…") instead of a spinner with no context, and no fabricated
  percentage when the underlying operation can't report one (blueprint
  §18).
- **Density for productivity surfaces** (file lists, CMS tables) vs.
  **spaciousness for marketing surfaces** (homepage, pricing) — utility
  screens should not be as airy as marketing pages; that airiness reads as
  slower and less serious for a tool a user wants to finish quickly.

## Typography

- **Inter** — English and Turkish body/UI text (variable font via
  `next/font/google`, self-hosted at build time — no runtime Google Fonts
  request).
- **Cairo** — Arabic (`next/font/google`, includes Arabic subset).
  Chosen for strong Arabic legibility at UI sizes and a neutral,
  non-decorative letterform that pairs visually with Inter's weight/x-height
  so the two don't feel like mismatched typefaces when a user switches
  locale.
- Turkish uses Inter with the standard Latin-Extended subset, which fully
  covers Turkish diacritics (ı/İ, ş, ğ, ç, ö, ü) — no separate font needed.

Type scale (defined as CSS variables in `app/globals.css`, consumed via
Tailwind's `@theme`):

| Token | Size (rem) | Weight | Use |
|---|---|---|---|
| `--text-display` | 3rem / 1.1 | 700 | Homepage hero only |
| `--text-h1` | 2.25rem / 1.2 | 700 | Page title, one per page |
| `--text-h2` | 1.5rem / 1.3 | 600 | Section headings |
| `--text-h3` | 1.25rem / 1.4 | 600 | Subsection headings |
| `--text-body` | 1rem / 1.6 | 400 | Default body |
| `--text-small` | 0.875rem / 1.5 | 400 | Secondary text |
| `--text-caption` | 0.75rem / 1.4 | 500 | Labels, metadata |
| `--text-button` | 0.9375rem / 1 | 600 | Button labels |

## Color tokens (semantic, not raw hex in components)

Defined once in `app/globals.css` as CSS custom properties, mapped into
Tailwind v4 via `@theme inline`. Components reference `bg-primary`,
`text-muted-foreground`, etc. — never a raw hex value.

```
--color-primary / --color-primary-hover
--color-secondary
--color-background / --color-surface / --color-border
--color-foreground / --color-muted-foreground
--color-success / --color-warning / --color-error / --color-info
```

Light mode is the only mode in the MVP; the token layer is structured so a
`.dark` override block can be added later without touching component code.

## Spacing & radius

- Spacing scale: Tailwind's default 4px base scale (`1` = 0.25rem) is kept
  as-is — no custom scale invented, per "no premature abstraction."
- Radius: three approved values only — `--radius-sm` (6px, inputs/buttons),
  `--radius-md` (10px, cards), `--radius-lg` (16px, modals/large surfaces).
  No ad hoc `rounded-[Npx]` in component code.

## Shadows

Two tokens only: `--shadow-sm` (resting card elevation) and `--shadow-md`
(popovers/menus/dropdowns). No large soft "floating" shadows.

## Core components (`components/ui/`)

Button (primary/secondary/ghost/destructive × default/disabled/loading),
Input (default/focus/error/disabled), Card, Modal (one system, built on
`<dialog>`/a headless primitive for correct focus trapping), Alert
(success/warning/error/info), Badge, Progress (determinate + honest
indeterminate variant), Skeleton (loading state), Toast.

## Accessibility baked into the system

Every interactive primitive gets a visible focus ring (`:focus-visible`,
not suppressed), sufficient contrast (validated against WCAG AA for text
tokens), and semantic markup (real `<button>`/`<label>` elements, not
styled `<div>`s) from the start — not retrofitted later.

## RTL implementation note

The design system uses Tailwind's logical spacing utilities throughout so
the same component tree works unmodified in `ar`; see `docs/I18N.md` for
the mechanism. No component should need an `if (locale === "ar")` branch
purely for layout mirroring.
