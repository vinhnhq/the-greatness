/**
 * `Result` — the combinators, and the property that matters: an error passes
 * through `map` and `chain` untouched rather than being swallowed.
 */

import { describe, expect, it, vi } from "vitest";

import { chain, err, map, match, ok } from "@/lib/result";

describe("map", () => {
  it("transforms the value", () => {
    expect(map(ok(2), (n) => n * 3)).toEqual({ ok: true, value: 6 });
  });

  it("leaves an error alone and does not call the function", () => {
    const f = vi.fn();
    expect(map(err("boom"), f)).toEqual({ ok: false, error: "boom" });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("chain", () => {
  it("sequences two fallible steps", () => {
    const half = (n: number) => (n % 2 === 0 ? ok(n / 2) : err("odd" as const));
    expect(chain(ok(8), half)).toEqual({ ok: true, value: 4 });
    expect(chain(ok(7), half)).toEqual({ ok: false, error: "odd" });
  });

  it("short-circuits on an earlier error", () => {
    const f = vi.fn();
    expect(chain(err("first"), f)).toEqual({ ok: false, error: "first" });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("match", () => {
  it("runs exactly one branch", () => {
    const onOk = vi.fn(() => "yes");
    const onErr = vi.fn(() => "no");

    expect(match(ok(1), { ok: onOk, err: onErr })).toBe("yes");
    expect(onErr).not.toHaveBeenCalled();

    expect(match(err("x"), { ok: onOk, err: onErr })).toBe("no");
    expect(onOk).toHaveBeenCalledTimes(1);
  });
});
