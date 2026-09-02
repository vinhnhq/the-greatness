/**
 * "What do we hold that Sapo has not seen?"
 *
 * The mirror answers it, and the answer is what an operator would review
 * before any push. The trap is claiming divergence for a row that was simply
 * never compared.
 */

import { describe, expect, it } from "vitest";

import { divergedFields } from "@/lib/domain/divergence";

const fields = ["name", "price"] as const;

describe("divergedFields", () => {
  it("reports a field we changed", () => {
    expect(
      divergedFields(
        "category",
        "1",
        fields,
        { name: "Old", price: 1 },
        {
          name: "New",
          price: 1,
        },
      ),
    ).toEqual([
      {
        entity: "category",
        sapoId: "1",
        field: "name",
        base: "Old",
        ours: "New",
      },
    ]);
  });

  it("reports nothing when we match the mirror", () => {
    const row = { name: "Same", price: 1 };
    expect(divergedFields("category", "1", fields, row, row)).toEqual([]);
  });

  it("reports one row per field, not per entity", () => {
    const d = divergedFields(
      "product",
      "9",
      fields,
      { name: "A", price: 1 },
      {
        name: "B",
        price: 2,
      },
    );
    expect(d.map((x) => x.field)).toEqual(["name", "price"]);
  });

  it("claims nothing for a row that was never mirrored", () => {
    // Never compared with Sapo is not the same as changed here. Inventing
    // divergence would put 832 rows in a review nobody asked for — the same
    // reason migration 006 does not backfill.
    expect(
      divergedFields("product", "9", fields, undefined, {
        name: "Whatever",
        price: 1,
      }),
    ).toEqual([]);
  });

  it("ignores a field the mirror does not carry", () => {
    // `status` is ours — the seed invents it — and Sapo has no opinion, so it
    // can never be divergence from Sapo.
    expect(
      divergedFields(
        "product",
        "9",
        ["name", "status"],
        { name: "A" },
        {
          name: "A",
          status: "archived",
        },
      ),
    ).toEqual([]);
  });

  it("treats an empty value the same on both sides", () => {
    // SQLite and Postgres disagree about null vs undefined for an empty
    // column; neither is a change someone made.
    expect(
      divergedFields<{ sku: string | null }>(
        "product",
        "9",
        ["sku"],
        { sku: null },
        { sku: null },
      ),
    ).toEqual([]);
  });
});
