# Rhea design system

One palette and one pair of typefaces, used by two kinds of screen (art direction from the
`design-taste-frontend` skill):

- **The landing page** follows the direction *Colour chapters* (`.taste-skill/direction.json`;
  reprint with `node ~/.claude/skills/design-taste-frontend/scripts/draw.mjs --show`). The idea:
  one cycle is the page. Its four phases are the chapters, each a full-bleed field in its own
  phase colour, in cycle order.
- **The app** follows the style *Pastel consumer* (`.taste-skill/app/direction.json`; reprint with
  `draw.mjs --show --out .taste-skill/app`). The phases are the categories: a pale tint with the
  dark of the same hue as ink, one large radius, white panels for anything that holds a list.

Tokens live in `src/app/styles/theme.css` (light by default, `.dark` on `<html>` from
`app/hooks/useTheme`). Components never hard-code hex.

## Type

- **Red Hat Display** (500/700/900): headings and large figures, class `font-display`.
- **Red Hat Text** (400/500/600): everything else, the default `font-sans`.
- App: sentence case everywhere. Screen title 28–32px/700, card title 18–20px/700, body 16px,
  secondary 14px, nothing under 13px. Large figures (cycle day, days to go) 900 with `tabular-nums`.
- Landing: display 900 uppercase, tracking −0.03em, leading 0.92; body 18–20px.
- Not used: italic emphasis, a headline word styled apart from the rest, small tracked uppercase
  labels (`text-xs uppercase tracking-wider`), monospace (except invite codes, which are code).

## Colour

| Role | Use |
| --- | --- |
| `bg-background` | the ground |
| `bg-card` | panels and sheets |
| `bg-muted` / `bg-secondary` | quiet fills: unselected chips, tracks, segmented controls |
| `text-foreground` | all running text |
| `text-muted-foreground` | secondary notes only |
| `bg-primary text-primary-foreground` | the primary action (ink on light, near-white on dark) |
| `text-destructive`, `bg-destructive` | erase, delete, unlink |
| `text-brand` | the mark and rare brand moments |
| `--{phase}` (`bg-luteal`, `stroke: var(--luteal)`) | data marks: ring arcs, bars, legend dots |
| `--{phase}-tint` + `--{phase}-ink` | tiles, chips, selected states |
| `--{phase}-field` + `--{phase}-field-ink` | landing chapters (identical in both themes) |

Phases are `menstrual`, `follicular`, `ovulation`, `luteal`. `data-phase="luteal"` on an element
scopes `--phase`, `--phase-tint`, `--phase-ink`, `--phase-field`, `--phase-field-ink` to its
subtree, so `bg-phase-tint text-phase-ink ring-phase/40` follow whatever phase that subtree is
in. The app shell carries the current phase; a calendar day sets its own. `PHASES[p].color/bg/
text/border` from `@/domain/phases` are references to the same variables, so inline styles follow
the theme too.

Colour budget in the app: 5–8% of a screen, as tints and data marks. The fertile window uses the
ovulation colours; a late period uses menstrual.

Not used: gradients, glows, glass or `backdrop-blur`, shadows on resting elements (only sheets,
menus, toasts and the floating action carry one), emoji, icons inside tinted squares.

## Shape and space

- Cards: `rounded-2xl` (20px), `bg-card`, a quiet `border border-border`, 20–24px padding. Inside
  a card the radii step down: `rounded-xl` 12, `rounded-lg` 10, `rounded-md` 8, `rounded-sm` 5.
- Buttons are fully round (`components/ui/Button`), 36/44/48px tall. Touch targets are at least
  44px on a phone.
- Phone: 16px margins, one column. Desktop: content 880–1100px wide in two columns where the
  screen has two jobs; never a phone column stretched across a monitor.
- The gap between sections is larger than any gap inside one.

## Components

- `ui/Button`: `variant` primary | secondary | outline | ghost | destructive | destructive-outline;
  `size` sm | md | lg | icon.
- `ui/Sheet`: the one modal (Radix Dialog). A bottom sheet on phones, a centred dialog from `sm`.
  Its `title` is the dialog's accessible name. `onOpenChange(false)` arrives for Escape, the overlay
  and the close button: refuse there while something is saving.
- `ui/controls`: `Chip` (a toggle with `aria-pressed`), `Segmented` (one choice from a short row,
  buttons with `aria-pressed`, optional `allowDeselect`), `Switch` (Radix).
- `shared/CycleRing`: the signature element. The cycle as a ring of its four phases, sized by the
  phase oracle; days lived this cycle in the phase marks, the rest as a faint track, a marker on
  today, and a centre slot for figures.
- `lib/cn`: class merging. Icons: `lucide-react` outline at 16–20px.
- Toasts: `import { toast } from "sonner"` for confirmations. Keep inline `role="status"` /
  `role="alert"` text wherever a spec reads it.

## Navigation

Views: Today, Calendar, Insights, Settings, plus the partner preview for owners. Hash routes:
`#today` `#calendar` `#insights` `#settings` `#partner`. `#welcome` reopens the landing page; any
other hash opens the app directly.

- Desktop (from 1024px): an unlabelled 56px icon rail, the mark at the top, Today / Calendar /
  Insights, then Settings and the account at the bottom. Every icon has a tooltip and an
  accessible name.
- Phone: a bottom bar with the same destinations and short labels, padded for the safe area.

## Copy

- Say exactly what is true. Logs are stored on the device; signing in syncs them to the account
  over TLS; synced data is not end-to-end encrypted; a linked partner's account can read the
  synced rows, while the partner view shows only what the owner turns on.
  `tests/unit/copy.guard.spec.ts` is the authority: run it, and never write a phrase it forbids.
- Nothing appears that does not ship: no "coming soon", "planned", "on the way", "being
  upgraded", and no "yet" that promises a feature.
- Predictions are estimates and say so. The fertile window is a calendar estimate, not
  contraception.
- Sentence case. Buttons are named for what they do.
