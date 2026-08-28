<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project conventions for all agents

Any AI agent working in this repo (Claude / Codex / Cursor / Gemini / Aider /
…) should orient against the same documents before writing code:

1. **[`CLAUDE.md`](CLAUDE.md)** — project conventions, the command cheat sheet,
   and the load-bearing gotchas. Written for Claude, applies to every agent.
2. **[`dev-workflow.md`](dev-workflow.md)** — the canonical six-phase process
   (SPEC → PLAN → BUILD → TEST → REVIEW → RELEASE), engineering principles and
   the quality bar. Seeded from `@vinhnnn/dev-workflow` v3.0.1 and owned by
   this repo since.
3. **[`__project__/decisions/`](__project__/decisions/README.md)** — the two
   structural decisions, both about what a row means.
4. **[`__project__/retro.md`](__project__/retro.md)** — the traps, recorded so
   they cost one session rather than every session.

## Filenames

- Inside `src/` and `__project__/`: **kebab-case lowercase**. Component
  identifiers stay PascalCase (`export function ProductForm()` lives in
  `product-form.tsx`).
- Root tooling files (`CLAUDE.md`, `README.md`, this file) keep conventional
  casing for external-tool compatibility.

## The three footguns that cost the most

- `bun test` ≠ `bun run test`. The first finds zero Vitest files and exits 0.
- `bun:sqlite` does not exist under Node, which is what `next dev` and Vitest
  run on. Use `lib/db/sqlite-open.ts`.
- A client component importing a repository module fails the route's build.
  Pure helpers live in their own file.
