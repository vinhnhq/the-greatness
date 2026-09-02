/**
 * What we have changed that Sapo has not seen. Pure — no I/O.
 *
 * This is the other half of the mirror's value. The merge uses the base to
 * decide what to write; this uses it to answer "what does this app hold that
 * Sapo does not", which is the question an operator has before pushing
 * anything back, and a useful one long before there is a push at all.
 *
 * Deliberately one row per **field**, matching `sync_conflicts`: "we renamed
 * it and re-priced it" is two facts someone may want to send separately.
 */

export type Divergence = {
  readonly entity: string;
  readonly sapoId: string;
  readonly field: string;
  /** What Sapo last told us. */
  readonly base: unknown;
  /** What this app holds now. */
  readonly ours: unknown;
};

const same = (a: unknown, b: unknown): boolean =>
  a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Fields where ours differs from the mirror.
 *
 * A row with no mirror entry is **not** divergence — it has never been
 * compared with Sapo, so claiming we changed it would be an invention. That
 * is the same reason migration 006 does not backfill.
 */
export const divergedFields = <R extends Record<string, unknown>>(
  entity: string,
  sapoId: string,
  fields: readonly (keyof R & string)[],
  base: Partial<R> | undefined,
  ours: R,
): readonly Divergence[] => {
  if (base === undefined) return [];
  const out: Divergence[] = [];
  for (const field of fields) {
    if (!(field in base)) continue;
    if (same(base[field], ours[field])) continue;
    out.push({ entity, sapoId, field, base: base[field], ours: ours[field] });
  }
  return out;
};
