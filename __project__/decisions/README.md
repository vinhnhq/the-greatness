# Decisions

Structural decisions, newest last. Each ADR's own `Status:` line is the truth;
this index is a table of contents, not a second source.

ADRs are **append-only**. A change of course is an `## Amendments` section on
the original, never an edit to its Decision — the point of the record is what
was decided and why, including where that later turned out to be wrong.

| #                                                     | Decision                                                       | Status                                      |
| ----------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| [0001](0001-media-ownership.md)                       | Media is a library; products link to it                        | Accepted 2026-08-28                         |
| [0002](0002-archive-cap.md)                           | The stored original is capped at 4096px                        | Accepted 2026-08-28                         |
| [0003](0003-mirror-and-reconciliation.md)             | Two versions, reconciled three-way through a mirror            | Accepted 2026-09-02                         |
| [0004](0004-writing-back.md)                          | Writing back: two lanes, and the mirror moves last             | Accepted 2026-09-02, amended same day       |
| [0005](0005-brand-palette-and-storefront-language.md) | Brand palette with roles, and the storefront's visual language | Accepted 2026-09-17, on the theme copy only |

## When something needs an ADR

Per [`dev-workflow.md`](../../dev-workflow.md): a structural decision — a new
layer, a new auth model, a change to what owns what. Both entries above are
the second kind: they change what a row _means_, and a future reader hitting
the consequences deserves the reasoning rather than a `git blame`.

Choosing a library, naming a file, or picking a page size does not need one.

`0004` is the worked example of the amendment rule: accepted in the morning
and amended the same afternoon, because the risk section turned out to rest on
a claim nobody had ever verified. The original text stands and the correction
sits below it — which is more useful than a clean record, because the fact
that it was believed for four versions is itself the lesson.

`0003` is the third kind and the first to change ownership rather than
meaning: it says which system decides which field, and it is where the
"why not event sourcing" reasoning lives so it does not have to be argued
twice.
