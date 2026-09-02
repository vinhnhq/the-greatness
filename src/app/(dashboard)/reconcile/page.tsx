/**
 * `/reconcile` — where the two versions are compared.
 *
 * Two lists, and they mean opposite things. **Needs a decision** is the small
 * one: fields both sides moved, which the sync refuses to guess at and leaves
 * at our value. **Changed here** is the large one and is not a problem at all
 * — it is what the mirror protects, and it is the selection a push back to
 * Sapo would send.
 *
 * Its own route rather than a tab on `/categories`, because it is about
 * products as much as categories and belongs to neither.
 */

import { PageContainer } from "@/components/app-shell/page-container";
import { dbReconcileRepo } from "@/lib/domain/reconcile/repository";

import { ConflictsTable } from "./conflicts-table";

export const metadata = { title: "Reconcile" };

export default async function ReconcilePage() {
  const [conflicts, divergences] = await Promise.all([
    dbReconcileRepo.openConflicts(),
    dbReconcileRepo.divergences(),
  ]);

  return (
    <PageContainer>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Reconcile</h1>
        <p className="text-sm text-muted-foreground">
          Sapo is the system of record; this app keeps its own version. A sync
          takes Sapo&rsquo;s changes, keeps ours, and asks only where both
          moved.
        </p>
      </div>
      <ConflictsTable conflicts={conflicts} divergences={divergences} />
    </PageContainer>
  );
}
