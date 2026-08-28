# ADR-0002 — The stored original is capped at 4096px

**Status:** Accepted · 2026-08-28 · shipped in `fc9a030`
**Spec:** [v2-media-library §AC-8](../specs/v2-media-library.md)

## Context

The image ceiling was 8 MB, and the check ran **in front of** the optimizer.
A modern phone photograph clears that routinely — an iPhone 48MP JPEG is
10–15 MB, a 200MP Android frame can pass 20 — so the gate turned away exactly
the files the optimizer existed to shrink.

Raising the ceiling alone does not fix the cost. The **origin is uploaded and
kept at full size**, so optimization only ever shrank what the catalogue
_serves_, never what the operator _waits for_. On a phone connection a 12 MB
upload is the whole experience, and 12 MB × 8 photos × 500 products is a real
bill.

## Decision

- Ceiling **25 MB** for images (100 MB for video, unchanged).
- The **stored original is capped at 4096px** on its longest edge. Above the
  cap it is a q0.92 WebP re-encode; at or below it, the picked file is stored
  **byte-identical**.
- The archive copy is kept only if it is actually smaller — the same test the
  display copy already passed. Shrinking an already-efficient file buys
  nothing, and taking its pixels for nothing is strictly worse.
- Reported as `origin-resized`, and the UI says so.

**This loses pixels, deliberately.** Above 4096 they are gone and cannot be
recovered. Nothing a catalogue does with a product photograph needs more, and
the alternative is roughly ten times the upload and ten times the storage,
forever.

## Alternatives considered

- **Raise the ceiling, keep true originals.** Nothing is lost, and a 12 MB
  photograph is a 12 MB upload and 12 MB of storage. Simplest, most expensive,
  and the cost is permanent.
- **Store only the optimized copy.** Cheapest by far and irreversible: no
  re-crop, no larger derivative, ever.
- **Upload the true original in the background, after the row is written.**
  Keeps everything and hides the wait. It also means a row that is _sometimes_
  complete, which is the class of bug this codebase has been careful to avoid
  (see the origin-first rule in `storage/upload.ts`).

## Consequences

- **One decode, two encodes.** Decoding a 48MP frame is seconds on a phone;
  calling a single-variant helper twice paid that twice. `encodeImageVariants`
  therefore takes a **plan** — the plan cannot be computed until the source
  dimensions are known, and they are not known until after the decode.
- **`width`/`height` describe the stored file**, not the picked one. Recording
  8064×6048 against a 4096px file would be a caption contradicting its own
  bytes. The pre-resize size is reported at upload time only (backlog V2.10).
- **Animated GIFs are never re-encoded** (`NEVER_RE_ENCODE`). A canvas pass
  keeps one frame, so an animated GIF would arrive in the catalogue as a still
  with nothing in the UI able to say why.
- Server-side derivation becomes tractable later: the archive is now a known,
  bounded 4096px file rather than an arbitrary original (backlog V2.11).
