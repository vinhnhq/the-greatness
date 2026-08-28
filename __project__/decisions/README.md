# Decisions

Structural decisions, newest last. Each ADR's own `Status:` line is the truth;
this index is a table of contents, not a second source.

ADRs are **append-only**. A change of course is an `## Amendments` section on
the original, never an edit to its Decision — the point of the record is what
was decided and why, including where that later turned out to be wrong.

| #                               | Decision                                | Status              |
| ------------------------------- | --------------------------------------- | ------------------- |
| [0001](0001-media-ownership.md) | Media is a library; products link to it | Accepted 2026-08-28 |
| [0002](0002-archive-cap.md)     | The stored original is capped at 4096px | Accepted 2026-08-28 |

## When something needs an ADR

Per [`dev-workflow.md`](../../dev-workflow.md): a structural decision — a new
layer, a new auth model, a change to what owns what. Both entries above are
the second kind: they change what a row _means_, and a future reader hitting
the consequences deserves the reasoning rather than a `git blame`.

Choosing a library, naming a file, or picking a page size does not need one.
