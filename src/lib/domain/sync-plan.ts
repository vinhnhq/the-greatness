/**
 * What a refresh from Sapo would change — decided as data, before anything is
 * written. Pure: no I/O, no context.
 *
 * **Why this is not the seed.** `bun run seed` empties five tables and
 * reinserts them, which is correct for seeding a fresh database and
 * catastrophic as a recurring job: it would drop the curated category tree,
 * every media link and every operator edit on each run. A sync has to
 * reconcile instead, and reconciliation is the kind of logic that is worth
 * being able to test without a database.
 *
 * **Two rules are encoded in the shape rather than the behaviour**, because a
 * rule you cannot express is a rule you cannot break by accident:
 *
 * 1. **There is no delete list.** A local row whose Sapo counterpart has gone
 *    is `vanished` — reported for a person to decide about. A product pulled
 *    from the storefront for an afternoon must not take its media links and
 *    its categorisation with it.
 * 2. **The caller supplies the diff**, and the only fields that can appear in
 *    an update are the ones it returns. `parentId` is never among them: the
 *    tree is reconstructed once and owned locally from then on, so a sync
 *    that wrote it would silently reshape the catalogue on a schedule.
 *
 * A local row with no `sapoId` was created here and is not part of this
 * conversation at all — it is neither updated nor reported as missing.
 */

export type SyncPlan<Remote> = {
  /** In Sapo, not here yet. */
  readonly insert: readonly Remote[];
  /** Here and changed upstream. `changes` holds only what the diff returned. */
  readonly update: readonly {
    readonly id: string;
    readonly changes: Record<string, unknown>;
  }[];
  /** Here, imported, and identical — counted rather than listed. */
  readonly unchanged: number;
  /** Imported here, no longer in Sapo. Reported, never deleted. */
  readonly vanished: readonly { readonly id: string; readonly name: string }[];
};

export const planSync = <
  Remote extends { readonly sapoId: string },
  Local extends {
    readonly id: string;
    readonly sapoId: string | null;
    readonly name: string;
  },
>(
  local: readonly Local[],
  remote: readonly Remote[],
  /** `null` means "identical, leave it alone". */
  diff: (local: Local, remote: Remote) => Partial<Local> | null,
): SyncPlan<Remote> => {
  // Last one wins. Two collections cannot share an id, but a paged fetch that
  // overlapped would produce a duplicate, and inserting it twice would break
  // the unique index rather than being ignored.
  const remoteBySapo = new Map(remote.map((r) => [r.sapoId, r]));
  const localBySapo = new Map(
    local.filter((l) => l.sapoId !== null).map((l) => [l.sapoId!, l]),
  );

  const insert: Remote[] = [];
  const update: { id: string; changes: Record<string, unknown> }[] = [];
  let unchanged = 0;

  for (const [sapoId, r] of remoteBySapo) {
    const existing = localBySapo.get(sapoId);
    if (existing === undefined) {
      insert.push(r);
      continue;
    }
    const changes = diff(existing, r);
    if (changes === null) unchanged++;
    else
      update.push({
        id: existing.id,
        changes: changes as Record<string, unknown>,
      });
  }

  const vanished = [...localBySapo.values()]
    .filter((l) => !remoteBySapo.has(l.sapoId!))
    .map((l) => ({ id: l.id, name: l.name }));

  return { insert, update, unchanged, vanished };
};
