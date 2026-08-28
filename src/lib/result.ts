/**
 * `Result<E, A>` — a tagged union for *expected* failures.
 *
 * Use it when a function has several outcomes the caller must handle. Errors
 * are values with a `tag`, not thrown classes; `throw` is reserved for
 * programmer defects. The upload path is the reason this exists here: one
 * file failing to optimize must not throw its way out of a loop and lose the
 * nine files that were fine.
 *
 * Graduate to `purify-ts` `EitherAsync` once a flow has three or more
 * sequential dependent steps that need chaining.
 */

export type Result<E, A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly error: E };

export const ok = <A>(value: A): Result<never, A> => ({ ok: true, value });

export const err = <E>(error: E): Result<E, never> => ({ ok: false, error });

export const map = <E, A, B>(r: Result<E, A>, f: (a: A) => B): Result<E, B> =>
  r.ok ? ok(f(r.value)) : r;

export const chain = <E, A, B>(
  r: Result<E, A>,
  f: (a: A) => Result<E, B>,
): Result<E, B> => (r.ok ? f(r.value) : r);

export const match = <E, A, T>(
  r: Result<E, A>,
  handlers: { readonly ok: (a: A) => T; readonly err: (e: E) => T },
): T => (r.ok ? handlers.ok(r.value) : handlers.err(r.error));
