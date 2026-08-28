/**
 * Per-request context — the db connection, the signed-in user, and a trace id.
 *
 * There are two mechanisms because React gives us no single one:
 *
 *   - **`AsyncLocalStorage`** at the route-handler and server-action boundary.
 *     `runWithContext(ctx, fn)` wraps the body; anything `fn` calls, however
 *     deep, can read it.
 *   - **`React.cache()`** for the RSC tree. The ALS frame has already popped
 *     by the time React renders JSX children, so server components cannot use
 *     it. `cache()` gives one context object per request instead.
 *
 * Repositories read through `readContext()`, which tries ALS first and falls
 * back to the RSC cache, so they never learn which side called them.
 *
 * **Never read either one inside a cached compute function** (`'use cache'`,
 * `unstable_cache`, a `fetch` with `next: { revalidate }`). The per-request
 * value would be baked into an entry that other requests then read — the user
 * in the context would be whoever happened to warm the cache. Pass
 * per-request inputs through the cache key instead.
 *
 * **Pure code must never read context.** Derivers, invariants and everything
 * in `lib/media/` take every dependency as an explicit parameter.
 */

import { AsyncLocalStorage } from "node:async_hooks";

import type { Kysely } from "kysely";
import { cache } from "react";

import { db } from "./db";
import type { DB } from "./db-types";

export type ContextUser = {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly image: string | null;
};

export interface RequestContext {
  /** The active connection — the shared one, or a transaction installed by
   * `withTransaction()`. */
  readonly db: Kysely<DB>;
  /** The signed-in operator, or `null` on an anonymous route. */
  readonly user: ContextUser | null;
  /** Correlation id, generated at the boundary and threaded into logs. */
  readonly requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Run `fn` with `ctx` visible to everything it calls. Use at the entry seam
 * — a route handler, a server action, a script — never inside business logic. */
export const runWithContext = <T>(
  ctx: RequestContext,
  fn: () => Promise<T> | T,
): Promise<T> | T => storage.run(ctx, fn);

/** Build the context a server action starts from. */
export const baseContext = (
  user: ContextUser | null = null,
): RequestContext => ({
  db,
  user,
  requestId: crypto.randomUUID(),
});

/**
 * The RSC path. `cache()` returns the same object for every server-rendered
 * scope in one request and a fresh one per request.
 */
export const getRequestContext = cache(async (): Promise<RequestContext> => ({
  db,
  user: null,
  requestId: crypto.randomUUID(),
}));

/** The one adapter repositories call. ALS first, RSC cache second. */
export const readContext = async (): Promise<RequestContext> =>
  storage.getStore() ?? (await getRequestContext());

/** Read the ALS context, or throw. For code that genuinely requires the
 * action/handler boundary — a transaction, an audited write. */
export const getContext = (): RequestContext => {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error(
      "getContext() called outside runWithContext. Wrap the entrypoint (route handler / server action) in runWithContext(...).",
    );
  }
  return ctx;
};

/**
 * Run `fn` inside one transaction. The transaction connection is installed as
 * `db` in a child context, so every repository called inside `fn` uses it
 * without being passed anything — commits when `fn` resolves, rolls back when
 * it throws.
 *
 *   await withTransaction(async () => {
 *     const product = await productRepo.create(input);
 *     await categoryLinkRepo.replace(product.id, categoryIds);
 *     await attachmentRepo.replace(product.id, attachments);
 *   });
 *
 * All three land together or none of them do — which is the whole reason
 * saving a product is one action rather than three.
 */
export const withTransaction = async <T>(fn: () => Promise<T>): Promise<T> => {
  const parent = getContext();
  return parent.db
    .transaction()
    .execute(async (trx) => runWithContext({ ...parent, db: trx }, fn));
};
