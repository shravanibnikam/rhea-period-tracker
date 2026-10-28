# Rhea design system

Rhea is for people tracking their own cycle, and sometimes for the partner they choose to share
it with. The interface should feel **warm, calm and kind**: something you are glad to open on a
bad day. It is soft without being sugary, and clear without being clinical. It is never loud,
blocky or "techy": no wall-to-wall capitals, no heavy black type, no saturated poster colours,
no neon highlights.

Tokens live in `src/app/styles/theme.css` (light by default, `.dark` on `<html>` from
`app/hooks/useTheme`). Components never hard-code hex.

## Type

- **Cormorant Garamond** (variable), class `font-display`, for headings and the few large
  figures: delicate and elegant. Weight 500–700, lining figures; theme.css matches its small
  x-height to the text face with `font-size-adjust`. Sentence case; an italic phrase is allowed
  sparingly.
- **Nunito** (variable), the default `font-sans`, for everything else: rounded and friendly.
  400 for text, 600 for labels and buttons.
- Body text 16px (17–18px on the landing page), line height 1.5–1.6. Secondary text 14px. Nothing
  under 13px.
- Not used: all-caps headlines, weights above 600 for display type, tracked tiny uppercase labels,
  italic accent words, monospace (except invite codes, which are code).

## Colour

| Role | Use |
| --- | --- |
| `bg-background` | the blush-white ground |
| `bg-card` | panels and sheets (white; a soft plum-grey in dark mode) |
| `bg-muted` / `bg-secondary` | quiet fills: unselected chips, tracks, segmented controls |
| `text-foreground` | all running text (deep plum, never pure black) |
| `text-muted-foreground` | secondary notes only |
| `bg-primary text-primary-foreground` | the primary action (deep rose; soft rose in dark mode) |
| `text-destructive`, `bg-destructive` | erase, delete, unlink |
| `text-brand` | the mark |
| `--{phase}` (`bg-luteal`, `stroke: var(--luteal)`) | data marks: ring arcs, bars, legend dots |
| `--{phase}-tint` + `--{phase}-ink` | tiles, chips, selected states |
| `--{phase}-field` + `--{phase}-field-ink` | pastel landing chapters (same in both themes) |
| `--partner`, `-tint`, `-ink` | the partner's own hue |

Phases are `menstrual` (rose), `follicular` (sage), `ovulation` (honey), `luteal` (lavender).
`data-phase="luteal"` on an element scopes `--phase`, `--phase-tint`, `--phase-ink`,
`--phase-field`, `--phase-field-ink` to its subtree, so `bg-phase-tint text-phase-ink` follow
whatever phase that subtree is in. `PHASES[p].color/bg/text/border` from `@/domain/phases` reference
the same variables, so inline styles follow the theme too.

Colour stays gentle: tints and pastels carry most of it, the marks carry data, and the deep rose
is kept for actions. Every pairing in the tables above meets WCAG AA in both themes.

## Shape, space and depth

- Cards: `rounded-2xl` (24px), `bg-card`, a subtle `border border-border` or the soft elevation
  `shadow-soft`, 20–28px padding. Inside a card the radii step down: `rounded-xl` 16,
  `rounded-lg` 12, `rounded-md` 10, `rounded-sm` 6.
- Buttons are fully round (`components/ui/Button`), 36/44/48px tall. Touch targets are at least
  44px on a phone.
- Generous space: let content breathe; group with space before reaching for lines.
- Phone: 16px margins, one column. Desktop: content 880–1100px wide, in two columns where the
  screen has two jobs.
- Motion is gentle: short fades and small rises (150–300ms), always with a reduced-motion fallback.

## Components

- `ui/Button`: `variant` primary | secondary | outline | ghost | destructive | destructive-outline;
  `size` sm | md | lg | icon.
- `ui/Sheet`: the one modal (Radix Dialog). A bottom sheet on phones, a centred dialog from `sm`.
  Its `title` is the dialog's accessible name. `onOpenChange(false)` arrives for Escape, the overlay
  and the close button: refuse there while something is saving.
- `ui/controls`: `Chip` (a toggle with `aria-pressed`), `Segmented` (one choice from a short row,
  buttons with `aria-pressed`, optional `allowDeselect`), `Switch` (Radix).
- `shared/CycleRing`: the signature element. The cycle as a ring of its four phases with rounded
  ends, sized by the phase oracle; days lived this cycle in the phase marks, the rest as a faint
  track, a marker on today, and a centre slot for figures.
- `shared/RheaMark`: the mark, inline in `text-brand` so it follows the theme. Give it a `label`
  where it stands for Rhea; without one it is decorative. `public/rhea-mark.svg` is the favicon.
- `lib/cn`: class merging. Icons: `lucide-react` outline at 16–20px.
- Toasts: `import { toast } from "sonner"` for confirmations, `toast.error` for a save that
  failed. Keep inline `role="status"` /
  `role="alert"` text wherever a spec reads it.

## Navigation

Views: Today, Calendar, Insights, Settings, plus the partner preview for owners. Hash routes:
`#today` `#calendar` `#insights` `#settings` `#partner`. `#welcome` reopens the landing page; any
other hash opens the app directly.

- Desktop (from 1024px): a slim icon rail, the mark at the top, Today / Calendar / Insights, then
  Settings and the account at the bottom. Every icon has a tooltip and an accessible name.
- Phone: a bottom bar with the same destinations and short labels, padded for the safe area.

## Copy

- Warm, plain and direct. Say what something is before being clever; no puns that need decoding.
- Say exactly what is true about privacy. Logs are stored on the device; signing in syncs them to
  the account over TLS; synced data is not end-to-end encrypted; a linked partner's account can
  read the synced rows, while the partner view shows only what the owner turns on.
  `tests/unit/copy.guard.spec.ts` is the authority: run it, and never write a phrase it forbids.
- Nothing appears that does not ship: no "coming soon", "planned", "on the way".
- Predictions are estimates and say so. The fertile window is a calendar estimate, not
  contraception.
- Sentence case everywhere. Buttons are named for what they do.
- Don't assume anyone's gender. Partner copy says "your partner" and "they", never "she" or "her".
