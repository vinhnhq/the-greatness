/**
 * The three-way merge — the whole reason v6 exists.
 *
 * Two-way sync has one rule: Sapo wins. That silently discards every local
 * edit, which is why a re-parented category survived only until the next run.
 * With a base there are four outcomes, and exactly one of them asks a person
 * anything:
 *
 *     ours == base, theirs != base  → take theirs   (upstream moved)
 *     ours != base, theirs == base  → KEEP OURS     (we moved)
 *     ours == theirs                → nothing
 *     all three differ              → conflict
 *
 * "Keep ours" is the branch that did not exist. Most of this file is about it,
 * about the absent-base case (nothing may report 832 conflicts on first run),
 * and about sets, where both sides can be partly right at once.
 */

import { describe, expect, it } from "vitest";

import { mergeField, mergeSet, mergeRow } from "@/lib/domain/merge";

describe("mergeField", () => {
  it("takes theirs when only Sapo moved", () => {
    expect(mergeField("old", "old", "new")).toEqual({
      outcome: "theirs",
      value: "new",
    });
  });

  it("KEEPS OURS when only we moved — the branch two-way sync never had", () => {
    expect(mergeField("old", "mine", "old")).toEqual({
      outcome: "ours",
      value: "mine",
    });
  });

  it("does nothing when nobody moved", () => {
    expect(mergeField("same", "same", "same")).toEqual({
      outcome: "unchanged",
      value: "same",
    });
  });

  it("does nothing when both moved to the SAME value", () => {
    // Not a conflict: there is nothing to decide. Reporting one would train
    // people to click through the list without reading it.
    expect(mergeField("old", "agreed", "agreed")).toEqual({
      outcome: "unchanged",
      value: "agreed",
    });
  });

  it("conflicts when both moved differently", () => {
    expect(mergeField("old", "mine", "theirs")).toEqual({
      outcome: "conflict",
      value: "mine",
      base: "old",
      ours: "mine",
      theirs: "theirs",
    });
  });

  it("adopts theirs when there is no base at all", () => {
    // First run under v6. 832 rows have no mirror; none of them is a
    // conflict, or the feature is unusable on the day it ships.
    expect(mergeField(undefined, "ours", "theirs")).toEqual({
      outcome: "theirs",
      value: "theirs",
    });
  });

  it("treats null as a value, not as absent", () => {
    // A description Sapo cleared is a real change; conflating it with "no
    // mirror row" would silently restore deleted text.
    expect(mergeField(null, null, "written")).toEqual({
      outcome: "theirs",
      value: "written",
    });
    expect(mergeField("written", null, "written")).toEqual({
      outcome: "ours",
      value: null,
    });
  });
});

describe("mergeSet", () => {
  const set = (...ids: string[]) => new Set(ids);
  const sorted = (s: ReadonlySet<string>) => [...s].sort();

  it("applies an upstream addition", () => {
    const r = mergeSet(set("a"), set("a"), set("a", "b"));
    expect(sorted(r.value)).toEqual(["a", "b"]);
    expect(r.conflicts).toEqual([]);
  });

  it("keeps a local addition", () => {
    // Dragging a product into a category. This is the case the whole feature
    // was built for.
    const r = mergeSet(set("a"), set("a", "mine"), set("a"));
    expect(sorted(r.value)).toEqual(["a", "mine"]);
  });

  it("keeps a local removal", () => {
    const r = mergeSet(set("a", "b"), set("a"), set("a", "b"));
    expect(sorted(r.value)).toEqual(["a"]);
  });

  it("merges both sides when they touched DIFFERENT members", () => {
    // The reason a set is not a scalar: "we added X, they removed Y" is two
    // independent facts, and a whole-field comparison would call it a
    // conflict and make someone choose one true thing over another.
    const r = mergeSet(set("a", "b"), set("a", "b", "mine"), set("a"));
    expect(sorted(r.value)).toEqual(["a", "mine"]);
    expect(r.conflicts).toEqual([]);
  });

  it("is not confused by both sides adding the same member", () => {
    const r = mergeSet(set("a"), set("a", "x"), set("a", "x"));
    expect(sorted(r.value)).toEqual(["a", "x"]);
    expect(r.conflicts).toEqual([]);
  });

  it("cannot conflict, because a member is only present or absent", () => {
    // We added x; they removed a. Each member has exactly one side that moved
    // it, so there is never anything to decide — which is why `conflicts` is
    // part of the shape rather than something that fills up.
    const r = mergeSet(set("a"), set("a", "x"), set());
    expect(sorted(r.value)).toEqual(["x"]);
    expect(r.conflicts).toEqual([]);
  });

  it("adopts theirs with no base", () => {
    const r = mergeSet(undefined, set("ours"), set("theirs"));
    expect(sorted(r.value)).toEqual(["theirs"]);
  });
});

describe("mergeRow", () => {
  const base = { name: "Old", price: 100 };
  const fields = ["name", "price"] as const;

  it("applies each field independently", () => {
    // A price that moved upstream while we renamed the product is two
    // separate outcomes, not one all-or-nothing choice.
    const r = mergeRow(
      fields,
      base,
      { name: "Mine", price: 100 },
      {
        name: "Old",
        price: 200,
      },
    );
    expect(r.merged).toEqual({ name: "Mine", price: 200 });
    expect(r.conflicts).toEqual([]);
  });

  it("reports one conflict per field, not per row", () => {
    const r = mergeRow(
      fields,
      base,
      { name: "Mine", price: 150 },
      {
        name: "Theirs",
        price: 200,
      },
    );
    expect(r.conflicts.map((c) => c.field)).toEqual(["name", "price"]);
  });

  it("leaves a conflicted field at OUR value until someone decides", () => {
    // Taking theirs would be deciding by default, in the direction that
    // discards work. Nothing is applied to a conflicted field.
    const r = mergeRow(
      fields,
      base,
      { name: "Mine", price: 100 },
      {
        name: "Theirs",
        price: 100,
      },
    );
    expect(r.merged.name).toBe("Mine");
  });

  it("says whether anything needs writing at all", () => {
    const r = mergeRow(fields, base, base, base);
    expect(r.changed).toBe(false);
  });

  it("counts a kept-ours row as needing no write", () => {
    // It already holds our value; rewriting it would bump updatedAt on every
    // sync and make the report meaningless.
    const r = mergeRow(fields, base, { name: "Mine", price: 100 }, base);
    expect(r.changed).toBe(false);
  });
});
