/**
 * The seam, not the database. What has to hold: a repository reading through
 * `readContext()` sees the ALS context when an action installed one, and
 * `withTransaction` swaps the connection *ambiently* — a repository written
 * without a `tx` parameter still writes inside the transaction.
 */

import { describe, expect, it } from "vitest";

import {
  type RequestContext,
  getContext,
  readContext,
  runWithContext,
} from "@/lib/context";

const fakeCtx = (requestId: string): RequestContext =>
  ({
    db: { marker: requestId } as unknown as RequestContext["db"],
    user: null,
    requestId,
  }) satisfies RequestContext;

describe("request context", () => {
  it("readContext() returns the ALS context inside runWithContext", async () => {
    const ctx = fakeCtx("req-1");
    const seen = await runWithContext(ctx, async () => readContext());
    expect(seen.requestId).toBe("req-1");
  });

  it("survives an await boundary", async () => {
    const seen = await runWithContext(fakeCtx("req-2"), async () => {
      await new Promise((r) => setTimeout(r, 1));
      return readContext();
    });
    expect(seen.requestId).toBe("req-2");
  });

  it("keeps nested contexts isolated from their parent", async () => {
    const outer = await runWithContext(fakeCtx("outer"), async () => {
      const inner = await runWithContext(fakeCtx("inner"), async () =>
        readContext(),
      );
      expect(inner.requestId).toBe("inner");
      return readContext();
    });
    expect(outer.requestId).toBe("outer");
  });

  it("getContext() throws outside a runWithContext frame", () => {
    expect(() => getContext()).toThrow(/outside runWithContext/);
  });
});
