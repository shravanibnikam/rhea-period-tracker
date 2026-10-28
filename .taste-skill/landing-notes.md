# Rhea landing — working notes

Direction (2026-10-28, replaces "Colour chapters" on charcoal): warm, calm and kind, per
docs/DESIGN.md. The user rejected the red/charcoal poster page as "tech bro/chunky".
One cycle is still the page, softly: blush ground (#FBF7F5), plum ink, and the chapters are the
pastel phase fields as rounded panels in cycle order — rose (live, follows the visitor's phase),
sage (partner), honey (research), lavender (questions), rose again (day one). No saturated red, no
charcoal, no highlighter blocks (soft phase-colour underlines instead), no gradients, no glass.
Type: Cormorant Garamond (theme tokens, size-adjusted in theme.css) 500–600 for headings, one italic
word in the h1; Nunito for text, 17–18px / 1.6. Buttons: the app's own Button (deep rose pill,
ghost secondary). Families only through the tokens; `--font-sans` is not a runtime variable
(`@theme inline`), so fields use `font: inherit`.

## Argument
1. Hero — what it is → "Get to know your cycle, *gently*" + one sentence + Start tracking /
   Create your account + "Try it with your own dates" (scrolls to the live thing). Beside it (below
   on a phone): the Today card with the CycleRing, Maya's day 18, labelled "Example".
2. Where your logs live — local-first, exact about sync → three short paragraphs.
3. Live — "My last period started [date]", "My cycle is usually [28] days"; Rhea's engine in the
   browser; the chapter takes the visitor's phase field. Nothing stored or sent.
4. Inside Rhea — Segmented (Day log / Calendar / History / Backup) + true-size sheets on a quiet
   stage (clipped at 620px on desktop, full height on a phone).
5. Partner view — every switch starts off (as in the app); the card says "Nothing shared yet"
   until the visitor turns one on. Rows are labels around the app's Switch.
6. Research — static reference list (the marquee is gone).
7. Bring your history in / take it with you — source tabs + what each import does.
8. Honest answers — six questions.
9. Day one starts here — a CycleRing on day 1 in a white disc, then the action.
10. Footer — source, licence, and the one photograph explaining the name.

## Pictures
One: "Rhea Over Saturn from Cassini" (NASA/JPL, processed by Jcpag2012, public domain, via
Wikimedia Commons), cropped around the moon, 96px round in the footer: "Why the name? Rhea is also
a moon of Saturn". The three grey Cassini globes were removed with their credits.

## Sample content to confirm
"Maya" and her six cycles (28, 30, 27, 29, 28 days; periods 5,5,6,5,4,5), her logged symptoms,
moods and note, the sample day 27 Oct 2026.
