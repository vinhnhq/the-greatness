# 0005 — Brand palette with roles, and the storefront's visual language

**Status:** Accepted 2026-09-17. Applied on the storefront theme copy
`vinhn-beta` only; not yet on the live theme, and not yet in this app.
Record and reasoning: [`research/storefront-redesign-2026-09.md`](../research/storefront-redesign-2026-09.md).

## Context

The shop's brand colour was an orange (`#F2972E`) that fails AA as text on
white (2.3 : 1), sat on a blue-grey ground, and was used for everything from
buy buttons to the back-to-top control, while vouchers were a separate
marketplace red. The owner asked for burgundy. During the change three other
directions were argued — maroon, a hot red proposed by another tool, and
"just white" for the ground — and each was rejected for a reason that will
come up again, which is what earns this a record rather than a colour swap
in the customizer.

This app is deliberately achromatic (ADR-0004's neighbour, v8 Block A: colour
marks state or ownership, never decoration). That stays. What this decision
adds is the **brand** layer that the storefront needs and the app will
eventually share for anything that is brand rather than state.

## Decision

1. **Burgundy `#7A1F2B` is the brand colour**, with a hover shade (`#63171F`)
   and a two-step tint scale (`#FBF1F2` surface, `#EAC7CB` border). It is used
   on actions and marks only; grounds, icons, labels and tiles stay ink and
   neutral.
2. **Reds have roles, and the roles do not share a hue.** Brand `#7A1F2B` for
   actions; **sale `#B3261E`** for discounts and nothing else; **error
   `#C62828`** for validation and nothing else. A brand colour that reads as
   the error colour makes every error look like a promotion and every
   promotion look like a fault; the proposal that used `error-600` as the
   brand had to add "put an icon on errors so they don't look like promos",
   which is the symptom.
3. **Not maroon.** Maroon is red pulled toward brown; on the warm cream ground
   it drifts to the same warm brown as everything else and reads dated.
   Burgundy's cool undertone is the one non-warm thing on the page, which is
   what makes an action pop off cream. "Deeper" means the same hue with less
   light (oxblood `#5E1420`), never a browner one.
4. **Dark surfaces get the same hue, lifted.** On charcoal the deep burgundy
   is 2.3 : 1; fills `#B5404D`, text and links `#E07A85`. Light = deep, dark =
   lifted, same family.
5. **Ground is warm cream `#FCFBF7` with hairline cards `#E6DDDA`.** Cream vs.
   white cards is ΔL ≈ 0.02, under the 0.035 step a phone in daylight still
   shows (k-studio's measured floor), so the hairline is load-bearing, not
   decoration. Pure white would have needed the same hairlines with none of
   the warmth.
6. **Type is Inter** (400/500/600/700), `tabular-nums` on figures. SF Pro's
   licence does not allow self-hosting for a general website; Inter is the
   open face built on the same principles with complete Vietnamese.
7. **One layout grid.** Page = the container's content width (1296 px at
   ≥1400); every section's first and last card sit on the container's content
   edge; gutter `12px` (`8px` on phones); card radius `8px`. Sections may have
   different column counts; edges and gutters are what align.
8. **Icons are one 24 × 24 line-drawing sprite** rendered through `<use>`,
   stroke 1.15, `currentColor`, with a draw-on loop that is off under
   `prefers-reduced-motion` and never on a tap target's movement.

## Consequences

- The storefront theme carries the tokens in one override block
  (`snippets/header_style.bwt`, marker `greatness-overrides`); publishing
  means copying seven files and typing eleven values into the customizer so
  the two agree.
- The app keeps its four semantic tokens (`--destructive`, `--warning`,
  `--info` = Sapo's side, `--success`) untouched; when brand colour enters the
  app it enters as `--brand` with the light/dark pair above, on brand
  surfaces only, never on state.
- The logo is still orange. It is an image, and it is the one thing this
  decision cannot change.
- k-studio's "no borders anywhere" and "weight 400 only" were considered and
  **not** adopted for the storefront (photograph-dense, third-party theme);
  its contrast floors, palette-on-elements-only, row grid and preference
  handling were. The full comparison is in the research note.
