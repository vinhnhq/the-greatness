# The storefront redesign, and reconciling Sapo to the customer's sheet

_Written 2026-09-17, covering the sessions of 2026-09-16 and 17. Findings about
things outside this repo — the Sapo Admin API, the Wolf Cookware theme, the live
storefront — so dated because they go stale. Nothing here is app code; the app
side of all of this is still open (see backlog `S.*`)._

## Why this document exists

Two days of work that touched **Sapo, the system of record**, and **the
storefront theme**, and none of it lives in this repository. The catalogue's
categories changed for 766 products, a collection was created and another
deleted, the storefront menu was edited, 9 collection images were uploaded,
and a copy of the live theme (`vinhn-beta`, id `1158033`) now carries a
redesign of the homepage category grid, the voucher row, the services row, the
sub-category strips, a 47-icon SVG sprite with a draw-on animation, a burgundy
palette, Inter, a cream ground and a layout grid. The live theme (`Wolf
Cookware`, id `1151628`) is **untouched** except for the collection images and
the menu, which are data, not theme.

This is the record of what was done, what was decided and why, what Sapo's
platform turned out to allow, and what is still open — so that the next
session (publishing to live, or bringing the app into line) starts from facts.

## 1 · What changed in Sapo (data, live)

### 1.1 Categories reconciled to the customer's spreadsheet

Source of truth, by the customer's instruction: the Google Sheet
`FILE_SP_AHOANGMINH da phan danh muc` (`Mẫu file nhập` tab), a Sapo import
template with `Mã SKU` in column Q and `DM cấp 1/2/3` in AJ/AK/AL.

- 999 rows; **766 with both a SKU and a 3-level path**; 86 with a SKU and no
  path (Wilit lamps and similar — untouched); 0 duplicate SKUs; 94 distinct
  paths over 130 distinct names.
- **129 of the 130 names already existed as collections**; the one missing,
  `Máy ép ly tâm`, was created (`id 4356667`). It turned out to be the
  customer's name for the existing, empty `Máy ép nhanh` (`4347552`), which
  was then deleted after the menu link was re-pointed.
- Every SKU was resolved with `GET /admin/variants.json?sku=` and an exact
  match on `sku` → exactly one `product_id` each. **0 unresolved**, even the
  15 that the Sep-1 local snapshot did not have.
- Rule: **all three levels**, additive. `POST /admin/collects.json` per
  missing level, read back after every write. First pass: 725 products,
  2,050 collects, all `201`.
- **41 conflicts** (a product already in a category collection outside its
  sheet path) were held, reported to the customer in a new tab of the sheet
  (`Xung đột danh mục - cần duyệt`), then reconciled on his instruction
  "the sheet is the source of truth": 105 off-path collects deleted
  (`DELETE /admin/collects/{id}.json`), 74 levels added, every product read
  back as exactly {`Thuế 8%`, `Sản phẩm nổi bật`} ∪ path. Three patterns:
  irons also filed in the sibling leaf `Bàn ủi hơi nước` (28), fans filed in
  **all ten** fan leaves (8), rice cookers in both `cơ` and `tử` (5).
- **The menu tree did not need to move.** Compared the sheet's parent/child
  pairs against the reconstructed menu tree (`data/sapo/category-tree.json`):
  0 differences across 129 shared names. The one menu edit was relabelling
  the `Máy ép nhanh` link to `Máy ép ly tâm` and pointing it at the new
  collection (Website → Menu → Main menu → Sản phẩm → ĐIỆN GIA DỤNG NHÀ BẾP →
  Máy ép & Đồ uống dinh dưỡng). The menu has a sixth root, `NHÀ THÔNG MINH`,
  that no sheet product uses.

**Consequence for this app:** the mirror (`sapo_mirror`) is now stale by
2,229 collects, one created and one deleted collection. `bun run sync:sapo
--plan` is the next step on the app side; the new collection will arrive
**unfiled**, as documented, and wants filing under `Máy ép & Đồ uống dinh
dưỡng`. Logs: the session scratchpad kept per-SKU before/writes/after
(`results.json`, `fix-results`); they are not in the repo.

### 1.2 Collection images (live, all 9 homepage tiles)

The theme renders `collections[alias].image` in three places (see §2.1), so
each of the nine homepage categories got a **640 px transparent PNG** of its
icon through the admin's own `Ảnh danh mục` field (`admin/collections/{id}`,
file input). First orange, then re-exported black at stroke 1.15. These are
now **fallbacks** — the theme copy renders the SVG sprite first — but they
are live and harmless.

## 2 · What changed in the theme (vinhn-beta only)

Preview: `https://the-greatness.mysapo.net/?previewThemeId=1158033` (Sapo
then keeps you on the preview until "Hủy xem thử"). Every write below went
through `PUT /admin/themes/1158033/assets.json` from the logged-in admin
session; the originals were read first and kept in the page for the session.

| File                                    | Change                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `snippets/wolf-cat-icons.bwt` **(new)** | The sprite: 47 `<symbol id="cat-{alias}">` (6 roots + 41 level-2) + `cat-default` + `svc-1..4`. 24×24, stroke-only, `currentColor`. Every shape carries `pathLength="1"` and a per-stroke `--d`; a host class `wolf-draw` turns on the 4 s draw-on loop (drawn in the first ~1.4 s), `--t` staggers tiles, reduced motion disables it. Also declares `wolf_cat_icons`, the alias list. |
| `layouts/theme.bwt`                     | `{% include 'wolf-cat-icons' %}` right after `<body>`.                                                                                                                                                                                                                                                                                                                                 |
| `snippets/wolf_section_category.bwt`    | Homepage grid, layout **B**: label bottom-left in sentence case (`{{ link.title \| downcase \| capitalize }}` — Liquid, not CSS, see §4), product count (`products_count`, hidden when 0), 40 px sprite icon top-right (28 px on phones). Hero keeps the same content size. Sprite → collection image → nothing. Phone: hidden scrollbar, no line-clamp.                               |
| `snippets/wolf-subcategories.bwt`       | Collection-page strip: 64 px icons, no box, sentence case, `space-between` so the row fits both edges, `slidesPerView: 'auto'`; phones: 96 px slides, 12 px two-line labels, arrows and progress bar hidden, edge fade. Fallback `cat-default` at 35 %. No hover colour.                                                                                                               |
| `snippets/wolf_section_product_2.bwt`   | The homepage product-block tabs: 40 px sprite icons, sentence case.                                                                                                                                                                                                                                                                                                                    |
| `snippets/section_services.bwt`         | The four promises: sprite icons `svc-1..4` (truck, return arrows, shield-check, card), 40 px, top-aligned to the title so titles share a baseline; hairline cards; phones: one column, icon left.                                                                                                                                                                                      |
| `snippets/section_coupons.bwt`          | Marquee: cards rendered twice, Swiper `loop` + `autoplay {delay: 0}` + `speed: 7000`, linear easing, pauses under the pointer, arrows hidden, track clipped; runs on phones too (the theme's scroll-snap fallback is overridden). `spaceBetween` on the grid gutter.                                                                                                                   |
| `snippets/header_style.bwt`             | A `<!-- greatness-overrides -->` block after the theme's `:root`: the palette tokens (§3.1), the layout tokens (§3.3), Inter, the cream ground, hairline cards, button hover shade, coupon gradient, `tabular-nums` on prices, and a two-line script that sets the `theme-color` meta.                                                                                                 |
| `assets/wolf-main.scss.bwt`             | `body { font-family }` → Inter. **Not compiled** — see §4; the inline rule in `header_style.bwt` is what actually applies.                                                                                                                                                                                                                                                             |

**To publish:** copy the seven files above onto theme `1151628` in the same
order (sprite first, then layout, then snippets, then `header_style`), then
type the eleven palette values into Tùy chỉnh giao diện → Màu sắc so the
customizer and the CSS agree, and change the four `ser_*` texts if wanted.
The alternative — "Sử dụng giao diện này" on vinhn-beta — is riskier: that
copy was taken on 2026-08-27 and may differ from live in files nobody
compared.

## 3 · What was decided (the storefront's visual language)

Recorded as [ADR-0005](../decisions/0005-brand-palette-and-storefront-language.md);
summarised here because the reasoning is the useful part.

### 3.1 Colour — burgundy, with roles

Audit first: the theme is **variable-driven** — `--main-color` is emitted once
from `settings.main-color` and read by ~112 rules; there was no hard-coded
orange anywhere in the CSS. The orange (`#F2972E`) failed AA on white
(2.3 : 1). Three directions were mocked at the real UI
(https://claude.ai/artifact/QDWUqwUQ7fckdzvVGUYVZn); **A "Bordeaux"** chosen.

| Token                      | Value                 | Role                                                         |
| -------------------------- | --------------------- | ------------------------------------------------------------ |
| `--main-color`             | `#7A1F2B`             | brand and actions — buttons, links, CTAs (10.2 : 1 on white) |
| `--main-color-hover`       | `#63171F`             | hover / pressed / badge text                                 |
| `--main-color-50` / `-200` | `#FBF1F2` / `#EAC7CB` | pale surface / border on tinted surfaces                     |
| `--second-color`           | `#2A1F22`             | warm near-black secondary                                    |
| `--sale-color`             | `#B3261E`             | **discounts only**                                           |
| `--error-color`            | `#C62828`             | **form errors only**                                         |
| `--ground`                 | `#FCFBF7`             | page ground (warm cream)                                     |
| `--border-color`           | `#E6DDDA`             | hairlines                                                    |
| footer                     | `#F3EDE8` / `#2A1F22` |                                                              |
| header                     | black, unchanged      | burgundy on black is the one pairing to avoid                |
| logo                       | still orange          | an image; out of scope until a new export exists             |

Three alternatives were considered and rejected, each for a reason worth
keeping:

- **Maroon** ("darker is better"): it is red pulled toward _brown_; on a warm
  cream ground everything drifts to the same warm brown and reads dated.
  Burgundy's cool undertone is the one non-warm thing on the page, which is
  what makes buttons pop off cream. For "deeper", the answer is the same hue
  with less light (oxblood `#5E1420`), not maroon.
- **A hot red main (`#D92D20`)**, proposed elsewhere: it is literally the
  `error-600` token of the design system it came from. Using the error colour
  as the brand colour is why that proposal had to add "give errors an icon so
  they don't look like promos" — the symptom of the problem. It is also the
  marketplace red (Shopee, Lazada, the old coupons), and with one hot red
  every element shouts at the same volume. Hence the **roles**: two reds,
  brand vs. discount, and a third for errors. The customer recognised the
  brand/error collision himself once it was named.
- **On a dark ground** the rule flips: `#7A1F2B` on `#202124` is 2.3 : 1.
  Dark theme = same hue, lifted: fills `#B5404D`, text/links `#E07A85`. The
  two artifact pages already do this (`--brand` light `#7A1F2B`, dark
  `#C9525F`).

### 3.2 Type — Inter

SF Pro was wanted; its licence permits use only in software for Apple
platforms, so it cannot be self-hosted for a general site. **Inter** (OFL,
proper Vietnamese diacritics) everywhere, 400/500/600/700. Prices, counts and
table cells get `font-variant-numeric: tabular-nums`. The theme's Work Sans
was set in exactly two places.

### 3.3 Ground and cards — cream with hairlines

The old ground was a blue-grey (`#F2F4F7`, homepage-only, from
`wolf-index.scss`) and cards had no border: the grey _was_ the edge. Pure
white was considered; `#FCFBF7` chosen with **hairline cards** (`#E6DDDA` on
the category tiles, service rows and product cards). Coupons keep their
serrated edge and no frame. Cream vs. white cards is ΔL ≈ 0.02 — below the
0.035 step k-studio measured as the floor a phone in daylight still shows
(§5) — which is exactly why the hairlines are load-bearing here.

### 3.4 The layout grid

Page = Bootstrap `.container` (max 1320 px, 12 px padding → **1296 px
content**). Every section aligns its first and last card to the container's
_content_ edge and uses `--grid-gap: 12px` (`--grid-gap-sm: 8px` on phones),
`--card-radius: 8px`. Measured at 1400 px after the change: tiles, coupon
track and service cards all span 52 → 1348, every horizontal and vertical gap
12 px, hero exactly two tiles plus one gap. Columns differ per section (5 / 4 / 5) and therefore their inner seams do not align — normal, and accepted; the
cheap way to make the services row share the tiles' five columns is a fifth
promise.

### 3.5 Icons — one sprite, one grammar

All 47 category icons (6 roots + 41 level-2; level-3 never gets an image) and
4 service icons are 24 × 24 line drawings, stroke 1.15, round caps and joins,
rendered from one inline sprite via `<use>`. Reviewed at 64 px on every root
page; the multicooker was redrawn once (it read as a handbag). Catalogue with
usage per icon: https://claude.ai/artifact/1dPGSnsZurUMhbqJ4JzmZx.

The **draw-on animation** works through `<use>` because — tested, not
assumed — document CSS rules and inherited custom properties both reach the
cloned symbol content. A 3 s loop with ~1.6 s of drawing left the strips
half-drawn half the time and hurt recognition; retuned to **4 s, drawn in the
first ~1.4 s**, at rest ~65 % of the time. Marquee for the coupons, **not** for
the category strips: those are tap targets, and moving targets on a phone are
the one thing to avoid.

### 3.6 The homepage tile (layout B)

Four layouts were mocked at the storefront's exact geometry
(https://claude.ai/artifact/FivMx99TeghKHG9bE2enH6). Chosen: **text-led** —
label bottom-left with the product count under it, a small icon top-right;
the hero tile is bigger but its _content_ is the same size as the small
tiles, so the empty space reads as emphasis rather than a bigger icon.

## 4 · What Sapo's platform allows (findings, all verified)

- **The admin session serves the Admin API with cookies.** From a page on
  `the-greatness.mysapo.net/admin`, `fetch('/admin/…json', {credentials:
'include'})` reads and writes: `custom_collections`, `collects`, `variants
?sku=`, `products/{id}`, `themes/{id}/assets.json` (GET with `?key=`, PUT
  with `{asset:{key,value}}`). This is the "Admin API lane" of ADR-0004 without
  a Private App key, for as long as an operator is logged in.
- `variants.json?sku=` is an exact-enough lookup; still filter on `sku ===`
  because the theme's product names carry model numbers too.
- `POST collects` returns `201`; `DELETE collects/{id}` returns `200`;
  `DELETE custom_collections/{id}` returns `200`, then `GET` is `404`.
- **Collection image via API is ignored** — `PUT custom_collections/{id}`
  with `image.attachment` (base64) returns `200` and leaves `image: null`,
  for SVG _and_ PNG. The admin's file input (`accept: jpeg, png, gif, webp`)
  is the working path; **SVG is not accepted anywhere**, so a collection
  image cannot animate.
- **Theme SCSS saved through the API is not recompiled.** A PUT to
  `assets/wolf-main.scss.bwt` is accepted and the compiled
  `wolf-main.scss.css` keeps serving the old build. Put overrides in an inline
  `<style>` in a snippet (`header_style.bwt`) — applies on the next request.
- Theme config (`config/settings_data.json`) is **not** in the assets list;
  customizer values can be overridden from CSS but not read or written by
  API.
- **Menus have no API** (already known); the editor is Website → Menu; nested
  levels are child links in the same menu, and a link's target can be changed
  to another collection without touching its position.
- Theme preview is `?previewThemeId={id}` on any storefront URL (not
  `preview_theme`); Sapo then pins the preview to the session.
- Menu titles are stored uppercase; the storefront shows them as stored.
  Sentence case belongs in Liquid (`downcase | capitalize` handles `Đ`
  correctly), not in CSS — the theme's phone rule turns the label into a
  `-webkit-box` line clamp, and Safari does not apply `::first-letter` to a
  `-webkit-box`.
- Product-card columns carry their own hairline (`.wolf-product-item-card`);
  the `.promo-item` in the services row is the Bootstrap column itself, so
  removing column padding removes card padding. Borders and gutters on the
  same element need explicit padding.

## 5 · What k-studio taught, and what transfers

`~/github.com/k-studio` — ADR-0007 "Visual language" and spec
`v1-design-system.md`, a week of daily review on the owner's phone distilled
into rules. Read on 2026-09-17. Which of them apply to a retail storefront on
a third-party theme, and which do not:

**Transfers, and is already in place here**

- **Contrast floors measured, not eyeballed** — muted text ≥ 6 : 1, any colour
  used as text ≥ 4.5 : 1. The palette page computes every ratio; the orange
  failed, burgundy passes with headroom.
- **Palette on elements only; grounds stay neutral.** Burgundy is on actions
  and marks; icons, labels and tiles stay ink. Same rule, same reason.
- **One row grid** for list rows — `[lead · content · actions]` with leads on
  one left edge. The services row is exactly that, and the baseline fix in
  §3.5 is the "owner saw it before we did" lesson replayed.
- **Depth is lightness, in measured steps** — ≥ 0.035 L between ground and
  surface, or the surfaces vanish on a phone in daylight. The cream / white
  pair here is _below_ that floor, which is why hairlines were the price of
  cream; the rule tells you when a border is needed.
- **Respect the user's preferences** — every animation here is off under
  `prefers-reduced-motion`; `color-scheme` follows the app theme in the two
  artifact pages.
- **Landmines are the same species**: iOS synthesising `mousemove` (k-studio)
  and Safari refusing `::first-letter` on a `-webkit-box` (here) are both
  "the rule looked fine in Chrome"; the fix both times was to move the
  behaviour out of the fragile layer.

**Deliberately not adopted — and why**

- **No borders anywhere.** Right for an app of grouped surfaces; the
  storefront is photographs on a third-party theme whose cards are white by
  design. We chose cream + hairline, knowing it contradicts k-studio, because
  the ΔL floor could not be met without making the ground visibly grey.
- **Weight 400 only.** The storefront keeps 500/600 for titles: Work Sans →
  Inter on a page dense with product photography needs weight to hold the
  hierarchy at 13–15 px.
- **No punctuation as layout (no middle dots).** The coupon terms already use
  " · " and the shorter payment copy suggested in this session does too.
  Flagged: if the storefront adopts the k-studio rule, those become two lines
  or a wider gap (`Meta`), and the suggested `ser_4_sum` copy should be
  reconsidered.
- **Motion is subtle (≤ 8 px, 150 ms).** The storefront runs a marquee and a
  4 s draw loop on request — retail wants the page "alive". Kept, but with the
  k-studio discipline applied: nothing on a tap target moves, everything off
  under reduced motion, and the loop tuned so icons are readable most of the
  time.

**The app should inherit** the palette (§3.1 — the app's `--info` for Sapo's
side and `--warning` / `--success` / `--destructive` semantics are unaffected;
brand burgundy would replace nothing yet, since the app is deliberately
achromatic), the type, and the k-studio row grid when the storefront work
comes home. That is backlog `S.5`.

## 6 · Open items

Carried as backlog `S.1`–`S.8` and `N.9`. In one line each: publish the seven
theme files to live and set the customizer values; the logo is orange;
`sync:sapo --plan` then file `Máy ép ly tâm`; a fifth service promise or
accept 5-vs-4 columns; the `ser_4_sum` copy; a desktop screenshot pass of the
sale block, a product page, the cart and the footer under the new palette;
bring the palette and type into this app; and the dark-theme wine ramp if the
storefront ever follows the OS theme.

## Sources

Sapo Admin API behaviour: observed on `the-greatness.mysapo.net`, 2026-09-16
and 17, as an operator session. Theme: Wolf Cookware (`1151628`), copy
`vinhn-beta` (`1158033`). k-studio: `__project__/docs/decisions/0007-visual-
language.md`, `__project__/specs/v1-design-system.md`, `CLAUDE.md`
§Landmines, read 2026-09-17. Artifacts: icons
https://claude.ai/artifact/1dPGSnsZurUMhbqJ4JzmZx · tile layouts
https://claude.ai/artifact/FivMx99TeghKHG9bE2enH6 · palette
https://claude.ai/artifact/QDWUqwUQ7fckdzvVGUYVZn (private to the owner).
