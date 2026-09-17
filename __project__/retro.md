# Retro

Lessons only. **Ship facts live in [`done.md`](done.md)** and decisions in
[`decisions/`](decisions/README.md) — nothing here should restate either.

Newest session first.

---

## 2026-09-16 / 17 — two days on the system of record, with the app closed

Nothing in `src/` changed. The lessons are about working _outside_ the repo
against a platform, and most of them are the same lesson in different
clothes: **test the platform's behaviour, don't infer it from its status
code.**

### A 200 is not a write

`PUT custom_collections/{id}` with an image attachment returned `200` and
changed nothing — for SVG and for PNG. `PUT assets/wolf-main.scss.bwt`
returned `200`, stored the file, and the compiled CSS kept serving the old
build. Both would have gone unnoticed by a script that trusted the response.
Every write in these sessions was followed by a read-back, and the two
silent failures were caught only because of it. The habit ADR-0003 built for
the sync — verify by reading, never by status — turned out to be the habit
that mattered for everything else too.

### The screenshot lies at the exact moment it is taken

A "missing outline" bug in the icon sprite was a frame captured mid-animation;
a pause rule with `!important` did not reach the `<use>` clones, so the frames
stayed inconsistent and the bug looked real. Only removing the animation
class settled it. Three lessons in one: a looping animation makes every
screenshot a sample; `!important` does not cross into `<use>` shadow content
even though ordinary rules and custom properties do (verified by experiment
before relying on it); and the fix for "the strips look broken half the
time" was a design tune (4 s, drawn in 1.4 s), not code.

### Safari does what the rule says, which is not what Chrome does

`::first-letter` for sentence case worked in Chrome and produced
all-lowercase labels on the owner's iPhone: the theme's phone rule turns the
label into a `-webkit-box` line clamp, and Safari does not apply
`::first-letter` to one. The durable fix moved the transform out of CSS into
Liquid (`downcase | capitalize`), where there is no rendering engine to
disagree. k-studio's landmine list has the same species (iOS synthesising
`mousemove`). **If a rule depends on the layer below behaving, move the rule
up a layer.**

### The customer's file was better than the theory

The plan was to reconcile a spreadsheet against a "tree that must not be
trusted". The sheet's 94 paths agreed with the reconstructed menu tree on
every one of 129 shared names, and the one missing collection was an
existing one under another name. Twenty minutes of comparison before writing
anything replaced a day of careful merging. Compare first; the disagreement
you are bracing for may not exist.

### A border on the column is not a border on the card

Two rounds of "the fourth card is cut off" were the same mistake: the
services card _is_ the Bootstrap column, so removing the column's padding to
make four columns sum to 100 % removed the card's inner padding as well.
When a theme puts layout and surface on one element, every rule touches
both; say which one you mean in the selector, or wrap.

### Measure the layout, then look at it

The layout-grid work was done by numbers — edges 52 → 1348, gaps 12, hero =
2 × 96 + 12 — in an iframe, because the browser window had shrunk to 430 px
and stayed there. The numbers found the services row 12 px outside the grid
and the 16 px vertical gap; the owner's eye found the baseline problem and
the tight right padding that the numbers called "14 px, fine". Both were
needed. `S.2` exists because the second half never happened at desktop
width.

---

## 2026-09-02 (later) — researching the platform instead of assuming it

A session with almost no feature work in it. What it produced was four
corrections to things the project had believed for months, and every one was
one HTTP request away the whole time.

**A sentence repeated four times is not thereby verified.** _"A store that
also feeds Lazada, Shopee, Tiki, TikTok Shop and Google Shopping"_ entered in
the **v4** spec, was copied into v6, into the backlog twice, and finally into
a decision record, where it was the entire risk section. Nobody ever wrote
down where it came from. When someone finally asked a direct question about
it, the only evidence findable was theme footer social icons pointing at
`shopee.vn` and `lazada.vn` — generic homepages, unconfigured placeholders.

It may still be true. The lesson is not that it was wrong; it is that
**repetition had made it feel checked**. A claim load-bearing enough to
justify rejecting a design is load-bearing enough to need a source next to it.

**Read the platform's docs before designing around its limits.** Two findings
in one afternoon that would each have changed earlier work:

- **Level 3 was in the menu markup all along**, as plain `nav-link` anchors
  inside each mid-level's own panel. `leavesByCreationOrder` guesses it from
  collection creation order — a heuristic `CLAUDE.md` already flagged as
  fragile. It agrees with the menu on all 163 leaves, so it has been _lucky_
  where a direct read was available.
- **There is no menu API at all.** That turns ADR-0003's "the sync never
  writes `parentId`" from a design choice into a property of the platform,
  and it splits the write-back into two lanes with completely different risk.

Neither required cleverness. Both required fetching a page.

**Check whether you caused the anomaly before reporting it.** Two categories
in the dev database disagreed with the live menu — a projector filed under
kitchen appliances, which looked exactly like a reconstruction bug and was
half-written up as one. `updatedAt` settled it in one query: 208 of 211 rows
share the seed timestamp and those two were edited yesterday, by me, during
v6/v7 browser testing. **A local database that the app is designed to let you
edit is not evidence about the importer.**

**The risk you mitigate should be the risk you have.** The project had spent
three versions guarding against "a bad write reaches five marketplaces". Sapo
propagates exactly two fields — stock and price — so memberships, categories
and the menu never leave the storefront, and the one genuinely dangerous
write, price, had never been named. The mitigation that followed was one line
of scope (hold price back) rather than another paragraph of warning.

**Count before you design, including for colour.** The app's only coloured
column was `status`, and **832 of 832 products are `active`** — colour with
zero variance, which the eye learns to skip. The inverse is just as bad: 697
of 832 unfiled is 84%, so marking those rows would have been the same mistake
turned over. _Do not colour a constant, and do not colour a majority._ Both
halves came from a `GROUP BY`, not from taste.

**Check whether the problem still exists elsewhere before assuming a market.**
Shopify has had a writable menu API since 2024-07 and native sub-collections
since 2026-07-16, and five apps already ship this. The gap this project fills
is real _because Sapo lacks what a competitor shipped two years ago_ — which
is worth knowing both as a moat and as a warning, since Sapo may follow.

---

## 2026-09-02 — the taxonomy workspace (v7)

Six blocks, six commits, and six bugs that all four gates waved through.

**Start from the number, not the feature.** The request was "put products in
the tree, add a menu, fix the spacing". Counting first changed all three:
**697 of 832 products are filed nowhere and 191 of 211 categories are empty.**
That one query decided that Unfiled had to be a node, that a picker had to
replace drag rather than supplement it, and that bulk filing was not a stretch
goal. A feature list read off a request describes what to build; the data
describes what it is _for_. The count took thirty seconds and was already
written down in `data/sapo/README.md`.

**Generated components are not verified components.** Two of the six bugs were
in `src/components/ui/`: `CommandDialog` omitted its own `<Command>` wrapper,
which makes it throw on first render, and put its `DialogTitle` outside
`DialogContent`, where Radix cannot find it. Both had been sitting in the repo
since the day they were added, because nothing had used that component yet.
Adding a shadcn component is not the same as trying it.

**A query by role and name is an accessibility test you get for free.** Three
bugs surfaced as Playwright locators that found nothing: a `<Label>` with no
`htmlFor`, a dialog with no accessible title, a checkbox with no name. Each
one was invisible to the eye and to `tsc`, and each is a real screen-reader
defect. Writing the e2e in terms of roles and names, rather than CSS selectors
or test ids, is what turns the suite into that check.

**A ring is drawn outside the box.** Tailwind's `ring` is an outer box-shadow,
so on rows with no vertical gap the highlight lands on the neighbours. This
was reported as "the border is overlapped" and was invisible until someone
said so. Its quieter twin: `h-7` and `self-stretch` on the same element fight,
because align-self only stretches an _auto_ height — the indent rails had been
stopping short of every row since v5.

**A library that mints ids from a module counter cannot be server-rendered.**
dnd-kit numbered its context from a global, so the server said
`DndDescribedBy-0` and the client `DndDescribedBy-14`. It had been a hydration
mismatch on every render of `/categories` since v5, silent unless the console
is open. The fix is one `id` prop; the lesson is to open the console after a
render change, not only when something looks wrong.

**Prefer one element that changes behaviour to two that render the same
content.** The detail pane is a column at `lg` and a drawer below it. Both
obvious approaches are worse: rendering a pane _and_ a `Sheet` puts the form in
the DOM twice — two copies of the state, duplicate ids on every label — and
switching on a media query in JS is a hydration mismatch by construction. One
node whose positioning changes at the breakpoint has neither problem, and
`inert` is what keeps the parked copy out of the tab order.

**Seven callbacks threaded four levels deep is a shape, not a nuisance.**
Collapsing them into one `RowActions` object made the next three menu items
free. The signal was that every new feature was adding a prop to four
components at once.

**Run the dry run after the gates.** `sync:sapo --plan` with a real local edit
is the only check that the thing v7 built still survives the thing v6 built.
The gates prove a change compiles and its tests pass; they say nothing about
whether a _second_ run of something else undoes it — and both of v6's real
bugs were exactly that.

---

## 2026-09-01 → 09-02 — the catalogue grows a shape (v3 → v6)

Real Sapo data arrived, then a tree, then two versions of the truth. Lessons
only; what shipped is in [`done.md`](done.md).

### Running the app found what the tests could not — four times

Every one of these passed `lint`, `tsc`, `test:coverage` **and** `build`:

1. **A Kysely row is not a plain object.** Passing one from a server component
   to a client component throws `Only plain objects can be passed to Client
Components` **on the request**. Builds clean.
2. **Dark theme hid a light-theme bug.** Almost every photograph here is shot
   on white; against a near-white `bg-muted` the gallery tiles had no edge and
   the grid dissolved into the page. Invisible in the default theme.
3. **Resolving a conflict wrote the wrong base**, so the very next sync
   overwrote the decision. Watched a category revert in the browser.
4. **The mirror advanced past conflicted fields**, so a parked decision
   silently resolved itself one run later.

The pattern: **the four gates prove a change is well-formed, not that it is
right.** Three and four in particular were only visible on the _second_ run of
something — a class of bug no single test invocation reaches.

### A pointer to "what we last saw" must not move past something undecided

The generalisable form of bugs 3 and 4. Any base, cursor, watermark or
high-water mark that means "reconciled up to here" has to stop at the first
undecided item, not at the last one fetched. Advancing it past an open
question answers that question by accident, in whichever direction the
comparison happens to fall.

### Check a library's transitive dependencies, not its download count

`react-arborist` is actively maintained (published five weeks before we looked)
and pins `react-dnd ^14.0.3` — **published 2022-01-02, one major behind
react-dnd's own latest**. It would also have been a second drag engine beside
the `@dnd-kit` already in the project. The headline version told us nothing;
the dependency list decided it.

### Measure before believing the trade-off

The image change looked like paying bandwidth for fidelity. Measured, it was
**73% lighter on the gallery and 98% on the product list** _while_ serving the
pristine archive — because the old variant was a single 1600px file shared
between a 40px thumbnail and a lightbox. A comment claiming the optimizer
"cannot reach a relative path during a build" had been true of nothing, and
removing one word (`unoptimized`) did all of it.

Corollary: when a spec says "this will cost us X", that is a hypothesis with a
number attached, and it is cheap to check before designing around it.

### Read the gate before committing — twice, in one session

Both times `coverage=1` was on the screen in the same output block as the
commit. Both were fixed one commit later, which is not the same as not
happening: the branch carries two commits that were red when made. Running the
gate and _reading_ it are different acts.

### The simplification worth looking for is "what does this data not need?"

Siblings in the tree sort by name at every level, so a drag has no position to
express — which deleted the entire offset-based projection that every
drag-and-drop tree example is built around. `planMove` is forty lines with a
cycle guard. The question that found it was not "how do I implement a sortable
tree" but "what does a drop actually mean here".

Same shape elsewhere: `react-window` was declined because 211 nodes at depth 3
gain nothing from virtualization, and an unmounted row is not a drop target.

### Build artifacts in a second `distDir` can break `tsc`

`.next-e2e/dev/types/` is in `tsconfig.include` alongside `.next/types/`, so a
route added since the last `test:e2e` run fails to typecheck with `does not
satisfy the constraint 'AppRoutes'` while the main build has it right. Deleting
the stale directory is the fix.

---

## 2026-08-28 — the whole build (v1 → v2.1, one session)

Five commits, from an empty directory to a product catalogue with a media
library. What is worth carrying forward.

### The tests earned their keep, and not where I expected

Four bugs were found by a test rather than by review, and **none of them was
the kind of bug I was writing the test for**:

1. **Validation ordering.** A taken slug was rejected even when it was
   _derived_, which made the controller's suffixing unreachable. The test was
   "two products can share a name"; the bug was in a different file.
2. **`LOWER()` in SQLite is ASCII-only.** No ICU is compiled in, so every
   Vietnamese product name failed to match locally while Postgres found it —
   a bug visible on exactly one driver, and only because the integration suite
   runs against a real one.
3. **`createMany` sorted its return** while its caller matched results to
   files by position. Two correct-looking modules, one contradiction, found by
   a test that destructured the first element.
4. **A nested `<main>`.** `SidebarInset` already renders the landmark. Found
   by an E2E assertion that could not locate the landmark it needed — I would
   never have looked.

**The lesson is about test _shape_, not test count.** Every one of these came
from a test that asserted a property against a real thing (a real driver, a
real browser, a real second implementation), not from a test that asserted a
function returns what the function returns.

### The in-memory twin is worth the duplication — because it disagrees

Reimplementing every filter and sort a second time felt wasteful right up
until the two implementations disagreed about diacritics. The twin is not a
convenience; it is the second opinion. Where it and the SQL agree, the unit
tests are trustworthy and fast. Where they disagree, one is wrong and the
integration suite says which.

Keep this. Do not "simplify" by deleting it.

### A client component importing a repository module — twice

`gallery-grid` imported a pure fold that happened to live beside
`readContext`, which dragged `db.ts` → `node:async_hooks` → the Neon driver
into the browser bundle. The route failed to build outright, which is the good
outcome; the bad one is a silent 300 KB.

It happened **twice in one session**, the second time while doing the v2
rewrite with the first fix still visible in the diff. The habit that prevents
it is not vigilance, it is a file boundary: pure things used by client
components live in their own module, and the module says why at the top. If a
future session finds a pure helper sitting in a repository file, move it
before using it.

### Reading a docblock is cheaper than re-finding the trap

`db-url.ts` opens by explaining that `env-server.ts` carries `server-only` and
throws in a CLI script. Two versions later, `bun run seed` imported
`env-server.ts` to find out where to write files, and hit exactly that.

The fix was `storage/config.ts` — the twin of the file whose comment described
the problem. **The documentation was right and unread.** When adding a reader
for configuration, check whether its neighbour already solved the same thing.

### Gates that only fail in the suite are the expensive kind

Three separate E2E failures were tests that passed alone and failed in the
run, all for the same reason: the suite shares one database in file order, and
those tests assumed a state they did not create.

The fix that stuck was **not** making the assertions relative — that would have
kept the shared database and lost the thing worth asserting ("three files went
in, three are in the library"). It was giving those files a reset. A test that
only fails when you changed something else is worse than no test, because it
trains you to re-run rather than to read.

### Running the app found what nothing else could

Three defects reached a browser and nowhere else: a breadcrumb printing a raw
uuid, a table column collapsed to a 4px strip by Tailwind's preflight
`max-width: 100%`, and a dialog whose footer sat below the fold because the
content was not a flex column. Types were green, tests were green, coverage
was 93%.

`tsc` is an excellent worklist and blind at every boundary where a value stops
being typed — a CSS cascade, a landmark, a layout. **Open the page.**

### Coverage pressure improved the design once, and would have damaged it twice

Missing the threshold prompted the right change once: `uploadPrepared` reached
for its driver internally, which made its origin-first / derived-failures-are-
cosmetic rule reachable only through a real browser. Injecting the driver made
it a unit test _and_ a better function.

The wrong response was available and tempting — lower the threshold, or write
tests that assert a mock was called. What made the difference was asking
whether the uncovered code contained a **decision**. Where it did, it moved
somewhere testable. Where it did not (the canvas dance, the XHR), it moved into
a `*.browser.ts` file that is excluded — and the file boundary now enforces the
"no decisions here" rule that a comment previously only requested.

### Specs freeze; the model does not

v1's spec described attachments belonging to products. v2 inverted that. The
temptation was to edit the old spec into truth; the rule says freeze it, and
the rule is right — but a frozen spec that reads as current is a trap of its
own. The v1 file now carries a header naming exactly which acceptance criteria
later became false and where to read instead.

Freezing is not the same as leaving a landmine.

## 2026-09-17 — the brand page, the first deploy, and five traps

### A gate on an image route breaks `next/image`, and the CDN undoes it anyway

`/brand/thumbnails/<file>` got a session check and every tile on production
went blank: the image optimizer fetches the source **server-side, with no
cookie**. And the response carried `public, max-age=3600`, so the one request
that did get through was cached at the edge for everyone. Two lessons: an
`<img>` source is fetched by something that is not the user, and a cache
header on a gated response is a leak. The route is public, as `/uploads`
always was; the page that lists it is what is gated.

### A `<use>` into an external file is a wall

The theme's draw-on animation works because its CSS reaches the `<symbol>`
content through same-document `<use>`. Referenced as `href="sprite.svg#id"`,
the clones live in a shadow tree the page's stylesheet cannot style — nothing
animates and nothing errors. The sprite is inlined on `/brand` for that
reason, and the comment in `brand.css` says so.

### A stale `tsconfig.tsbuildinfo` makes `tsc` forget `PageProps`

Running `next dev` with another `NEXT_DIST_DIR` rewrote `tsconfig.json`'s
includes; reverting the file was not enough, because the incremental build
info still pointed at the deleted directory and `tsc` reported nine
`Cannot find name 'PageProps'` errors against code that had not changed.
Delete the `.tsbuildinfo`. Same species as the `.next-e2e/routes.d.ts` trap
already in `CLAUDE.md`.

### The primitive knows how to collapse; the bare div does not

The sidebar's brand mark was a flex row of its own, and in the icon rail it
was rendered at 31 × 44 beside 32 × 32 items — visible, but only measured
once someone asked. `SidebarMenuButton` carries the collapse rules; anything
in the sidebar that must survive the rail should be one.

### A "measured floor" is measured on a ground

k-studio's zebra stripe is `muted/40` and reads fine there, on a 0.965 ground.
On this app's white it is ΔL 0.012 and vanishes — below the same floor that
guideline documents. The rule transferred; the number did not. `--zebra` is
its own token here, one step under each theme's ground.

### Setting a password is configuration; typing one is not

The showcase deploy could be verified end to end — routing, gating, a forged
cookie, a genuine one — by computing the HMAC cookie from a known secret and
sending it with `curl`, without ever typing the password into the form. The
form itself is the one thing the owner had to click through. Worth remembering
as the shape of "verify without crossing the line".

### `next/image` caches by URL, so a replaced file is not a change

Three logos and 129 thumbnails were regenerated under their old names and
the page showed the old ones — one of them blank — for the optimizer's TTL.
The fix is a version in the URL (`?v=<size+mtime>`), which Next 16 then
refuses for a local image unless the path is in `images.localPatterns`; and
listing one pattern restricts every local image, so `/uploads/**` had to be
named too. Same lesson as the gated route: an `<img>` is served by a
machine with its own cache and no idea the file changed.

### Draw the icon, render it, look — the first draft reads as something else

Five knife drafts: three read as flags. A whisk read as a broom, three
stacked pots as a steamer, a rounded iron as a dish cover. None of these
were visible in the SVG source; all were obvious at 64 px. The teammate who
reviewed on a phone caught four in one message. Render every icon at the
size it ships at before calling it drawn.
