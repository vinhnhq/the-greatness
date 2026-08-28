# dev-workflow

> Personal conventions for Vinh's projects. Read this when starting or working on one of his projects with Claude Code.

_Seeded from @vinhnnn/dev-workflow v3.0.1 on 2026-08-28; owned by this repo since._

The `@vinhnnn/dev-workflow` package installs two things: **this file** (the conventions) and **`dev-workflow-pipeline/`** (a staging folder of battle-tested agent-pipeline files to adapt and move into place, then delete). Everything else — folder structure, package manifest, configs — is scaffolded by Claude after a short conversation, not by a templated drop.

## Seeded, then owned (the shadcn model)

This file is a **seed, not a synced dependency**. It is dropped once at project init; from that moment **the project's copy is the truth** — edit it freely, let it diverge, never re-drop it over local changes. On init, stamp a provenance line under the title: `_Seeded from @vinhnnn/dev-workflow vX.Y.Z on YYYY-MM-DD; owned by this repo since._`

**Backflow:** at each version-close retro, ask "which of this version's process lessons generalize?" and PR them to the `dev-workflow` repo. The foundation evolves downstream of practice, not upstream of it. Prescriptions here favor **principles over named tools** — named tools fossilize (a "current pick" line dates each one).

---

## Claude init protocol

When the user says **"set up the project"**, **"init"**, or similar (or asks Claude to start work in a new repo where this file is present):

1. **Confirm the stack defaults below apply** with one yes/no question, not item-by-item.
2. **Ask only the project-specific questions** in the next section.
3. **Scaffold the chosen layout** in thin steps — don't pre-build folders or files the project doesn't need yet.
4. **Materialize the pipeline from `dev-workflow-pipeline/`** — the staging folder the CLI dropped next to this file (battle-tested, seeded then owned: adapt the `[bracketed]` placeholders to this project, then commit):
   - `ship-review-SKILL.md` → `.claude/skills/ship-review/SKILL.md`
   - `session-log-upsert.ts` → `.claude/scripts/session-log-upsert.ts`
   - `work-summary.ts` → `.claude/scripts/work-summary.ts` (+ a `summary` script in the package manifest)
   - `claude-settings.json` → merge into `.claude/settings.json` (project-scoped SessionEnd hook)
   - `ci.yml` → `.github/workflows/ci.yml` (adjust gates/secrets to the project)

   Then **delete `dev-workflow-pipeline/`** — it's a delivery mechanism, not a permanent folder. If it isn't present (`--no-pipeline`, or a seed copied by hand), skip this step and build the pipeline as the project needs it.

5. **Don't re-discuss the defaulted items.** They're listed so we skip them.

### Project-specific questions to ask

- **Domain.** What does the project do? Top 1–3 user-facing features?
- **Modes.** Solo only? Multiplayer? Both? If multiplayer, hot-seat / online same-board / online turn-based?
- **Auth.** Anonymous fine, or does any feature need identity?
- **DB.** Can `localStorage` carry v1, or is persistence required?
- **Realtime infra.** Only if online is in scope: Partykit / Liveblocks / Supabase Realtime / custom socket server — decide at the start of the version that needs it, not in v1.
- **Anything that should override the defaults below?**

### What NOT to ask (defaulted, never re-discuss)

Tooling, conventions, architecture rules, process, quality bar, default scope. All listed below.

---

## Engineering principles

How Claude should work on Vinh's projects, regardless of stack. These bias toward caution over raw speed; for trivial tasks, use judgment. **Apply on every task.**

### 1. Think before coding

Don't assume. Don't hide confusion. Surface tradeoffs.

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity first

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you wrote 200 lines and it could be 50, rewrite it.

The check: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical changes

Touch only what you must. Clean up only your own mess.

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that **your** changes made unused. Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the request.

### 4. Goal-driven execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass."
- "Fix the bug" → "Write a test that reproduces it, then make it pass."
- "Refactor X" → "Ensure tests pass before and after."

For multi-step tasks, state a brief plan with verification steps. Strong success criteria let Claude loop independently; weak criteria ("make it work") force constant clarification.

### 5. Spec before code

If the request is outcome-only, ask for the how before writing anything.

- Outcome prompt: "add login", "fix the bug", "make it faster" → ask which files, function signatures, data shapes.
- Spec prompt: "add `validateEmail(input: string): boolean` to `lib/validation.ts`" → proceed.
- AI-generated code passes the same review bar as hand-written: factoring, tests, conventions, PR size. No vibe-coding shortcuts.
- Work in thin slices: one task → test → commit → next. Never batch a sprint and review a wall of changes at the end.

**These principles are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions arrive before implementation rather than after mistakes.

---

## Stack defaults

- **Next.js 16** App Router, `src/` layout (middleware is `src/proxy.ts` exporting `proxy`)
- **React 19** — `<Activity>` and `<ViewTransition>` first-class; React Compiler on (handwritten `useMemo`/`useCallback` usually redundant)
- **TypeScript** strict, no `any`, no `as` outside one isolated adapter. Type-check with the **native compiler** (TS 7 `tsc --noEmit` — seconds, not minutes; editors use the native LSP; frameworks may need a CLI-checker flag — current pick 2026-07: Next's `experimental.useTypeScriptCli`)
- **Tailwind v4** + **shadcn/ui** (commit primitives to `src/components/ui/`, edit in place, never wrap)
- **Bun** as package manager + script runner (test runner is per-project — see Test layering)
- **Lint + format**: one native, type-aware toolchain; promise-leak rules (`no-floating-promises` class) are **blocking errors**, and the formatter covers markdown too (current pick 2026-07: `oxlint --type-aware` + `oxfmt`)
- **Toolchain pinning**: `mise.toml` pins bun/node — laptops and CI read the same file (CI via `mise-action`)
- **Git defaults**: `rebase.updateRefs` + `rerere.enabled` global; stacked PRs via git-spice (auto-retargets dependents after squash-merges)
- **ts-pattern** — exhaustive `match()` for state transitions
- **purify-ts** — `Maybe` / `Either` for partial functions; no `throw` in `lib/`

If a project genuinely needs a different stack (Python API, Go service, React Native), discuss it — these defaults are for the web frontend case that's most common.

---

## Recommended Claude Code plugins and skills

When Claude is helping set the project up, propose enabling these. Skip any the user declines — they're starters, not requirements. All come from public Anthropic / Vercel / community sources.

**Current picks as of 2026-07 — this whole section is the most fossilization-prone part of the file.** Names, ownership, and bundling of third-party skills change faster than anything else here. The durable part is the _buckets_ (web quality · framework build-time · design · deploy) and the rule that you audit against the [Quality bar](#quality-bar) before shipping a milestone; the specific rows are a snapshot. Before quoting one, check it still exists — don't fabricate a skill or a CLI command that Claude Code doesn't currently provide.

### Plugins (enable both)

| Plugin                                    | Why                                                                                                                                                                                                         |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent-skills@addy-agent-skills`          | Provides the workflow skills — `spec` / `plan` / `build` / `test` / `review` / `ship` / `code-simplify` — plus debugging, security, code review, TDD, and more. Mirrors the six-phase process in this file. |
| `frontend-design@claude-plugins-official` | Provides the `frontend-design` skill — distinctive, production-grade UI generation that avoids the generic AI aesthetic. Valuable when scaffolding initial components and pages.                            |

### Skill bucket — Web quality (audit time)

Run before shipping a milestone. Lighthouse + skill output should both clear the [Quality bar](#quality-bar).

| Skill               | When to use                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `web-quality-audit` | Comprehensive sweep covering performance, accessibility, SEO, and best practices. Run before each release. |
| `accessibility`     | WCAG 2.2, keyboard nav, screen-reader support. Run on every shipped mode.                                  |
| `core-web-vitals`   | LCP / INP / CLS optimization. Run when Lighthouse Performance < 90.                                        |
| `performance`       | Load time, bundle size, image optimization. Companion to `core-web-vitals` for non-CWV bottlenecks.        |
| `seo`               | Meta tags, structured data, sitemap. Run when the project is publicly indexable.                           |
| `best-practices`    | Modern security, compatibility, code quality patterns. Worth a pass before each release.                   |

### Skill bucket — React / Next.js (build time)

| Skill                           | When to use                                                                                                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vercel-react-best-practices`   | React 19 / Next.js performance patterns from Vercel Engineering. Apply when writing or refactoring components.                                                                                                  |
| `vercel-composition-patterns`   | Compound components, render props, context — when designing reusable component APIs.                                                                                                                            |
| `vercel-react-view-transitions` | Implementation guide for `<ViewTransition>`, `addTransitionType`, route transitions. Required reading when wiring screen / state animations described in [React 19 features in use](#react-19-features-in-use). |

### Skill bucket — Design and UX

| Skill                   | When to use                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `web-design-guidelines` | UI / a11y review against the Web Interface Guidelines. Run alongside `accessibility`.    |
| `frontend-design`       | (From the `frontend-design` plugin above.) Use when generating polished initial screens. |

### Skill bucket — Deploy

| Skill                    | When to use                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `deploy-to-vercel`       | When the user says "deploy" or "push it live." Default deployment target.             |
| `vercel-cli-with-tokens` | Token-based Vercel deploys (CI, automation). Use when interactive login isn't viable. |

### Skill bucket — Mobile (optional)

Only relevant if the project is React Native / Expo. Skip for web-only projects.

| Skill                        | When to use                                                 |
| ---------------------------- | ----------------------------------------------------------- |
| `vercel-react-native-skills` | RN / Expo best practices, list performance, native modules. |

### Installation

Plugins are toggled in `.claude/settings.json` (`enabledPlugins`). Skills are pinned in `skills-lock.json` at the project root. Use whatever skill manager Claude Code currently provides — don't fabricate CLI commands. If Claude offers to install all of these in one pass, ask the user which buckets are relevant before bulk-enabling: every loaded skill costs context tokens.

---

## Architectural rules

These are non-negotiable; they keep logic testable and portable.

1. **Pure boundary at `src/lib/`** — no `react`, `next/*`, DOM globals, `fetch`, or `Date.now()`. Time and randomness flow as parameters (`now: number`, `rng: () => number`). Enforce with a restricted-imports lint rule against `src/lib/**`.
2. **Functional error types, not exceptions.** Anything that can fail returns `Either<Err, Ok>`. Anything that can be absent returns `Maybe<T>`. No `throw` in `lib/`. UI unwraps with `.caseOf({ Just, Nothing })` / `.caseOf({ Left, Right })` — never `.unsafeCoerce()`.
3. **State transitions through `ts-pattern`.** Reducers use `match([state, event]).with(...).exhaustive()`. Adding a new state or event without handling it fails the type check.
4. **No `any`, no `as`** outside one isolated adapter helper for purify-ts ↔ external libraries.
5. **TDD.** Every change in `lib/` starts with a failing test.

---

## Default project layout

```
src/
  app/           # Next App Router routes + UI
  components/
    ui/          # shadcn primitives
  lib/           # pure logic — no React, no DOM
  hooks/         # React glue
__project__/     # docs, specs, tasks (never imported)
e2e/             # Playwright smoke tests
```

### `__project__/` — start with three files

```
__project__/
  spec.md        # what we're building + acceptance criteria
  backlog.md     # TDD-ordered task list
  done.md        # archive, newest first: 2026-MM-DD · sha · description
```

**Promote to a richer layout** (`docs/`, `decisions/`, per-version `specs/v1.md`, `specs/v2.md`) only when one of these is true:

- More than one major version is in flight at once.
- A structural decision needs an ADR (new realtime transport, new auth model, new layer).
- Domain rules or game rules need their own reference doc (longer than ~30 lines).

If none of those apply, three files is enough. Resist the urge to pre-build structure for problems you don't have yet.

---

## Conventions

- **Filenames** — `kebab-case` everywhere. Component identifiers stay PascalCase (`export function Board()` lives in `board.tsx`). Unix-style; never PascalCase or spaces.
- **Imports** — absolute via `@/`, no deep relative paths.
- **Tests** — co-located in `__tests__/` next to source.
- **Commits** — Conventional Commits, atomic, one semantic type per commit (`feat:`, `fix:`, `docs:`, `test:`, `chore:`). Small, never amend.
- **Branch model** — `main` is trunk. Feature branches → PR → squash-merge to `main`. Large features ship as a **stack** of small PRs (git-spice restacks + retargets after each squash-merge; never delete a mid-stack branch — GitHub auto-closes its dependent PR unrecoverably).
- **Long autonomous runs** — commit at every green checkpoint (gates pass → commit). Agent context compaction is lossy; artifacts are not. A fresh session restores from `git log` + backlog + memory, never from conversational recall.

---

## React 19 features in use

- **`<Activity mode="hidden">`** preserves screen state across navigation without re-mount cost (e.g. a config screen's form when entering the next screen).
- **`<ViewTransition>`** + `addTransitionType('a' | 'b' | 'c')` animates screen and state changes via the View Transitions API.
- **`prefers-reduced-motion: reduce`** shortens transitions to ~50 ms but doesn't remove animations that convey correctness (e.g. a flash on a successful match).

---

## Test layering

| Layer           | Tool                                                           | Where                    | Command                    |
| --------------- | -------------------------------------------------------------- | ------------------------ | -------------------------- |
| Unit / property | Vitest (current pick; `bun test` fine for tiny libs)           | `src/tests/unit/`        | `bun run test`             |
| Integration     | Vitest project against a test DB branch                        | `src/tests/integration/` | `bun run test:integration` |
| E2E smoke       | Playwright — **UI-driven like a real customer**, no API cheats | `e2e/`                   | `bun run test:e2e`         |

**Footgun:** when Vitest is the runner, bare `bun test` invokes Bun's _built-in_ runner and finds zero files — always `bun run test`. The coverage-thresholded script (`test:coverage`) is the **real** gate; a bare `test` script that skips thresholds can go green locally and fail CI.

---

## Default scope choices

These are **defaults**, not laws — override per-project if a feature requires it.

- **Auth** — anonymous first; add identity only when a feature requires it.
- **DB** — none in v1; `localStorage` where possible. Defer Postgres / SQLite.
- **Multiplayer** — solo or single-player ships first; online ships in a later version.
- **Deployment** — Vercel by default. If realtime sockets are needed, decide transport at the start of the online version, not in v1.

---

## Quality bar

- `lib/` line coverage ≥ 90%.
- One Playwright smoke test per shipped mode.
- Lighthouse on the main screen: Performance ≥ 90, Accessibility ≥ 95.
- **The four gates** — this line is their sole owner; everything else points here. Green before any task moves to `done`: `bun run lint` · `bunx tsc --noEmit` · `bun run test:coverage` · `bun run build`. (Note `bun run test`, never bare `bun test` — see the [Test layering](#test-layering) footgun.) **Never weaken a gate to pass it**: no threshold lowering, no rule disabling, no test deletion without saying so in the PR body.
- **CI runs the same gates on every PR** (GitHub Actions): pin the toolchain from `mise.toml` (`mise-action`), degrade gracefully when secrets are absent (unit-only + a warning, with a syntactically-valid placeholder for env vars validated at import), keep actions on current majors (node24 runtimes), cache the package store + framework build cache. Local gates run against the **working tree**; CI runs against the **commit** — a deliberately-unstaged file passes locally and fails CI.

---

## Process — six phases

```
SPEC → PLAN → BUILD → TEST → REVIEW → RELEASE
```

### 1. Spec

Write `__project__/spec.md` before any code. Five sections: Goal · Out of scope · User stories with acceptance criteria · Non-functional · Open questions. If the spec can't be written, the request isn't ready to build.

### 2. Plan

Translate the spec into TDD-ordered tasks in `__project__/backlog.md`. Each task is **red → green → refactor → commit**. Tasks should be small enough to land in one commit.

### 3. Build

Implement one task at a time, vertical slices. Failing test first, then implementation, then refactor if needed. Don't batch multiple tasks into one commit.

### 4. Test

Before a task moves to `done.md`, **the four gates** ([Quality bar](#quality-bar), the sole owner of that list) must pass. Every task, not just the last one before a PR.

### 5. Review — the ship ritual

Before opening ANY PR, run the ritual **unprompted**. It lives in one place — `.claude/skills/ship-review/SKILL.md`, materialized from `dev-workflow-pipeline/` at init — and that skill is the sole owner of its steps. In outline: gates → risk-tier the diff → adversarial self-review → PR body contract → CI watched to green → fresh-context QA subagent → console summary.

Two properties matter more than the steps, and are why the ritual is a skill rather than a habit: **only high-tier diffs (money, auth, schemas + migrations, security) interrupt the human pre-merge**, and **the reviewer of a diff must be a context that never wrote it** — hence the subagent in an isolated worktree, which re-runs the gates itself instead of trusting the PR body.

### 6. Release

PR-based, never auto-merge. **The merge is a deliberate human click** — an agent can't be paged and can't be held responsible. Mechanics (squash, stacks, restacking) are owned by [Conventions → Branch model](#conventions); tagging on `main` triggers any publish workflow you have wired up.

---

## Docs write-once — one owner per fact

Every kind of knowledge has exactly ONE owning file; everything else points. Duplicated status is the #1 docs disease in long-running agent projects: the same ship-story ends up in 4–5 files and the copies start disagreeing.

| Knowledge                          | Sole owner                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| Ship facts (PR/SHA/gates/features) | `done.md` — one dated entry per PR, ≤ ~10 lines                                  |
| Open work                          | `backlog.md` — open items ONLY; shipping = **move** to done, never keep-and-tick |
| Lessons                            | `retro.md` — lessons only; no ship-narrative recap                               |
| Current state                      | ONE dated block in the orientation doc — never a growing status trail            |
| Decision status                    | each ADR's own `Status:` line + one index file                                   |
| Stack                              | the package manifest                                                             |
| Specs                              | frozen at intent — **never** add "as-built" sections post-ship                   |

Moving a task: cut the line from `backlog.md`, paste at the **top** of `done.md` with date + SHA (`- 2026-05-08 · \`abc1234\` · 1.2 findPath: …`). Newest at top; partition once `done.md` exceeds ~300 lines.

### Session-cost telemetry (agent-assisted projects, optional)

A `SessionEnd` hook that parses the session transcript (per-model tokens, duration, est. API-rate cost, `git user.name` as author) and **upserts** one row per session into the branch's PR comment + a section in `done.md`. Answers "what has this ticket cost so far" per author, survives machine switches, and ships with the repo (checked-in hook + script) so every teammate gets it on clone. Two lessons, both baked into `session-log-upsert.ts`:

- **Count the subagents.** Agent transcripts live outside the main one (`tasks/<id>.output` under the session's tmp dir). Skip them and every session that ran a QA subagent under-reports — which, with the ship ritual, is most of them.
- **A hook that runs unattended must repair its own output.** Rebuild the whole section from the surviving data rows on each write, and keep a blank line between the table and any trailing total, or the repo's markdown formatter will fold that total back in as a phantom row and it will compound silently.

The console companion (`work-summary.ts` → `bun run summary`) is the same data for a human in a terminal: branch state, commits ahead, open PRs with check badges, newest `done.md` entry, latest session cost. It closes the ship ritual.

---

## Brownfield adoption — installing this into a legacy project

The seed works on existing codebases, but the order inverts: **audit before gates, ratchet instead of block.**

1. **Seed + materialize the pipeline** as in the init protocol — but do NOT enable blocking gates yet.
2. **Baseline audit first** (agent fan-out): map the system (routes, data flows, deps), find the perf/security hotspots with `file:line` evidence, and record the landmines. Output = a handoff pack under `__project__/reference/` + a CLAUDE.md whose gotchas section is written from findings, not aspirations.
3. **Gates at the achievable baseline, then ratchet.** Day one CI = build + format-check only (format the whole repo once, own the churn). Then tighten one notch at a time — lint rules promoted from warn→error as counts hit zero, coverage threshold set at _current_ coverage and raised with each version, type-aware rules last. A gate the repo can't pass teaches everyone to ignore CI; a ratchet that only moves forward teaches the repo to heal. **Never lower a ratchet.**
4. **Then the normal loop applies**: spec the first version, TDD-ordered backlog, ship ritual, QA subagent, write-once docs — new work meets the full bar immediately; legacy code meets it as it gets touched.
5. **Refactor legacy toward the target per-subsystem** (strangler fig, vertical slices): pick the subsystem with the most concrete pain, refactor it end-to-end behind its existing interface, ship it through the ritual, repeat. Calibrate to actual pain, not aesthetics — if you can't name the pain a refactor removes, skip it. Big-bang rewrites are a separate product decision, not a refactor.

---

## When NOT to follow this protocol

- **Trivial changes** (typo fix, config tweak, dependency bump) — just lint, typecheck, push. Don't write a spec for a one-line fix.
- **Throwaway prototypes / spikes** — explicitly mark them as such; skip the spec and write a single `notes.md`. Promote to the full process only when the prototype graduates.
- **Project actively requires a different stack.** Discuss the override; don't fight the defaults.
