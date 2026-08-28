# Retro

Lessons only. **Ship facts live in [`done.md`](done.md)** and decisions in
[`decisions/`](decisions/README.md) — nothing here should restate either.

Newest session first.

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
