/**
 * Three-way merge. Pure — no I/O, no context, no database.
 *
 * The two-way sync this replaces had one rule: Sapo wins. That is correct for
 * a mirror and wrong for anything an operator touched, and it is why a
 * re-parented category or a dragged-in product survived only until the next
 * `sync:sapo`.
 *
 * With a base — the payload Sapo gave us last time, stored in `sapo_mirror` —
 * there are four outcomes and only one of them asks a person anything:
 *
 * | ours vs base | theirs vs base | outcome                        |
 * | ------------ | -------------- | ------------------------------ |
 * | same         | changed        | take theirs                    |
 * | changed      | same           | **keep ours**                  |
 * | (equal values)               | unchanged                      |
 * | changed      | changed        | conflict — nobody wins by default |
 *
 * **An absent base adopts.** On the first run under v6 nothing has a mirror
 * row, and calling 832 rows conflicts would make the feature unusable on the
 * day it ships. `undefined` means "we have never seen Sapo's value"; `null`
 * means "Sapo's value was empty", and the two must not be conflated or a
 * description Sapo deliberately cleared would be silently restored.
 *
 * **A conflicted field is left at our value and written nowhere.** Taking
 * theirs would be deciding by default in the direction that discards work.
 */

export type MergeOutcome = "unchanged" | "ours" | "theirs" | "conflict";

export type FieldMerge<T> = {
  readonly outcome: MergeOutcome;
  /** What the row should hold. For a conflict this is ours, unapplied. */
  readonly value: T;
  readonly base?: T;
  readonly ours?: T;
  readonly theirs?: T;
};

/** Structural equality, enough for the scalars Sapo sends. */
const same = <T>(a: T, b: T): boolean =>
  a === b ||
  (a === null && b === null) ||
  JSON.stringify(a) === JSON.stringify(b);

export const mergeField = <T>(
  base: T | undefined,
  ours: T,
  theirs: T,
): FieldMerge<T> => {
  // Never seen Sapo's value: adopt it rather than manufacture a conflict.
  if (base === undefined) {
    return same(ours, theirs)
      ? { outcome: "unchanged", value: ours }
      : { outcome: "theirs", value: theirs };
  }

  // Both landed on the same value. There is nothing to decide, and reporting
  // it would train people to click through the conflict list unread.
  if (same(ours, theirs)) return { outcome: "unchanged", value: ours };

  const weMoved = !same(ours, base);
  const theyMoved = !same(theirs, base);

  if (!weMoved && theyMoved) return { outcome: "theirs", value: theirs };
  if (weMoved && !theyMoved) return { outcome: "ours", value: ours };

  return { outcome: "conflict", value: ours, base, ours, theirs };
};

export type SetMerge = {
  readonly value: ReadonlySet<string>;
  readonly conflicts: readonly string[];
};

/**
 * A set merged per member, not as one value.
 *
 * Memberships are the field drag-and-drop writes most, and "we added X, they
 * removed Y" is two independent facts. Comparing the whole set would call
 * that a conflict and make someone choose one true thing over another.
 *
 * Per member the rule is the same as `mergeField`: a side that changed wins
 * over a side that did not. Since a member is only ever present or absent,
 * the two sides can never disagree about it without one of them agreeing with
 * the base — so this genuinely cannot conflict, and `conflicts` is returned
 * for the caller's shape rather than because it fills up.
 */
export const mergeSet = (
  base: ReadonlySet<string> | undefined,
  ours: ReadonlySet<string>,
  theirs: ReadonlySet<string>,
): SetMerge => {
  if (base === undefined) return { value: new Set(theirs), conflicts: [] };

  const value = new Set<string>();
  for (const id of new Set([...base, ...ours, ...theirs])) {
    const inBase = base.has(id);
    const inOurs = ours.has(id);
    const inTheirs = theirs.has(id);
    if (inOurs === inTheirs) {
      // Both sides agree about this member.
      if (inOurs) value.add(id);
    } else if (inOurs !== inBase) {
      // We moved it, they did not.
      if (inOurs) value.add(id);
    } else {
      // They moved it, we did not.
      if (inTheirs) value.add(id);
    }
  }
  return { value, conflicts: [] };
};

export type RowConflict<T> = {
  readonly field: string;
  readonly base: T;
  readonly ours: T;
  readonly theirs: T;
};

export type RowMerge<R> = {
  readonly merged: R;
  readonly conflicts: readonly RowConflict<unknown>[];
  /** Whether `merged` differs from `ours` — i.e. whether to write at all. */
  readonly changed: boolean;
};

/**
 * A row merged field by field.
 *
 * Independence is the point: a product whose price moved upstream while we
 * renamed it has one automatic update and one kept edit, not a single
 * all-or-nothing decision.
 *
 * `changed` is false when the result already equals `ours` — including the
 * keep-ours case — so a sync that decided nothing writes nothing, and does
 * not bump `updatedAt` on 832 rows and drown its own report.
 */
export const mergeRow = <R extends Record<string, unknown>>(
  fields: readonly (keyof R & string)[],
  base: Partial<R> | undefined,
  ours: R,
  theirs: R,
): RowMerge<R> => {
  const merged = { ...ours };
  const conflicts: RowConflict<unknown>[] = [];
  let changed = false;

  for (const field of fields) {
    const result = mergeField(
      base === undefined ? undefined : base[field],
      ours[field],
      theirs[field],
    );
    if (result.outcome === "conflict") {
      conflicts.push({
        field,
        base: result.base,
        ours: result.ours,
        theirs: result.theirs,
      });
      continue; // Left at our value, written nowhere.
    }
    if (!same(result.value, ours[field])) {
      merged[field] = result.value as R[keyof R & string];
      changed = true;
    }
  }

  return { merged, conflicts, changed };
};
