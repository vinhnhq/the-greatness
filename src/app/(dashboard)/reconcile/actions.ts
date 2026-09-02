"use server";

/**
 * Resolving a conflict. Re-gates with `requireUser()` — a server action is its
 * own endpoint and the layout's check never runs for it.
 *
 * **Resolving writes the mirror too, and the value it writes is THEIRS —
 * never the one that was chosen.** The base means "the last thing we know
 * Sapo said", so resolving records that Sapo's value has now been seen and
 * ruled on. That is what makes each decision stick:
 *
 *   keep ours  → base = theirs, row = ours. Next sync: we moved, they did
 *                not → keep ours. The decision holds.
 *   take theirs→ base = theirs, row = theirs. Next sync: nobody moved.
 *
 * Writing the *chosen* value instead looks right and is not: after "keep
 * ours" the base would equal our value, so the next sync would read Sapo's
 * unchanged value as an upstream change and overwrite the decision on the
 * spot. That happened, in the browser, before this comment existed.
 */

import { revalidatePath } from "next/cache";

import { baseContext, readContext, runWithContext } from "@/lib/context";
import { requireUser } from "@/lib/require-user";
import { productSearchText } from "@/lib/search-text";

export type ResolveState =
  | { readonly status: "ok" }
  | { readonly status: "error"; readonly message: string };

export const resolveConflict = async (
  id: string,
  choice: "ours" | "theirs",
): Promise<ResolveState> => {
  const user = await requireUser();

  return runWithContext(baseContext(user), async (): Promise<ResolveState> => {
    const { db } = await readContext();

    const conflict = await db
      .selectFrom("sync_conflicts")
      .selectAll()
      .where("id", "=", id)
      .where("resolvedAt", "is", null)
      .executeTakeFirst();
    if (conflict === undefined) {
      // Already decided, or healed by a sync because Sapo came back to our
      // value. Neither is an error worth alarming anyone about.
      return { status: "error", message: "That conflict is no longer open." };
    }

    const value: unknown = JSON.parse(
      (choice === "ours" ? conflict.ours : conflict.theirs) ?? "null",
    );
    /** Always Sapo's value: the base records what THEY said, not what we picked. */
    const seen: unknown = JSON.parse(conflict.theirs ?? "null");
    const now = new Date();

    await db.transaction().execute(async (trx) => {
      if (choice === "theirs") {
        const table =
          conflict.entity === "category" ? "categories" : "products";
        await trx
          .updateTable(table)
          .set({ [conflict.field]: value, updatedAt: now })
          .where("sapoId", "=", conflict.sapoId)
          .execute();

        // `searchText` is derived, never stored by Sapo — it has to follow
        // any field it is built from or search silently stops finding the row.
        if (table === "products") {
          const row = await trx
            .selectFrom("products")
            .select(["id", "name", "sku", "description"])
            .where("sapoId", "=", conflict.sapoId)
            .executeTakeFirst();
          if (row !== undefined) {
            await trx
              .updateTable("products")
              .set({ searchText: productSearchText(row) })
              .where("id", "=", row.id)
              .execute();
          }
        }
      }

      // The base moves to what SAPO said — for either choice. See the note
      // at the top: writing the chosen value here silently undoes a
      // "keep ours" on the next run.
      const existing = await trx
        .selectFrom("sapo_mirror")
        .select("payload")
        .where("entity", "=", conflict.entity)
        .where("sapoId", "=", conflict.sapoId)
        .executeTakeFirst();
      const payload = {
        ...((existing === undefined
          ? {}
          : JSON.parse(existing.payload)) as Record<string, unknown>),
        [conflict.field]: seen,
      };
      await trx
        .deleteFrom("sapo_mirror")
        .where("entity", "=", conflict.entity)
        .where("sapoId", "=", conflict.sapoId)
        .execute();
      await trx
        .insertInto("sapo_mirror")
        .values({
          entity: conflict.entity,
          sapoId: conflict.sapoId,
          payload: JSON.stringify(payload),
          syncedAt: now,
        })
        .execute();

      // Kept, not deleted: a decision is the one piece of reconciliation
      // history worth having.
      await trx
        .updateTable("sync_conflicts")
        .set({ resolvedAt: now, resolution: choice })
        .where("id", "=", id)
        .execute();
    });

    revalidatePath("/reconcile");
    revalidatePath("/products");
    revalidatePath("/categories");
    return { status: "ok" };
  });
};
