/**
 * `Category` — a plain row, not an aggregate. Products link to it many-to-many.
 *
 * `parentId` is carried through unused: v1 renders one flat level (see the
 * spec's out-of-scope list), but the column ships so a tree needs no migration
 * over rows people have already created.
 */

import type { Tagged } from "type-fest";
import { z } from "zod";

import { err, ok, type Result } from "@/lib/result";

export type CategoryId = Tagged<string, "CategoryId">;

export interface Category {
  readonly id: CategoryId;
  readonly name: string;
  readonly slug: string;
  readonly parentId: CategoryId | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export const CATEGORY_NAME_MAX = 60;

/**
 * `z.coerce.date()` rather than `z.date()` is load-bearing, not lax: SQLite
 * returns a timestamp as an ISO string and Postgres returns a `Date`. Coercion
 * is the one place that difference is absorbed, so nothing above the parser
 * has to know which driver ran.
 */
const rowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  parentId: z.string().min(1).nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type ParseCategoryError = {
  readonly tag: "ParseCategoryError";
  readonly issues: readonly string[];
};

export const parseCategory = (
  raw: unknown,
): Result<ParseCategoryError, Category> => {
  const parsed = rowSchema.safeParse(raw);
  if (!parsed.success) {
    return err({
      tag: "ParseCategoryError",
      issues: parsed.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      ),
    });
  }
  const d = parsed.data;
  return ok({
    id: d.id as CategoryId,
    name: d.name,
    slug: d.slug,
    parentId: d.parentId as CategoryId | null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  });
};

/** Strict parser — throws on schema drift. Used by the db repository, where a
 * row that does not parse means the migration and `db-types.ts` disagree, and
 * that is a defect rather than a case to handle. */
export const parseCategoryStrict = (raw: unknown): Category => {
  const r = parseCategory(raw);
  if (r.ok) return r.value;
  throw new Error(
    `parseCategoryStrict: schema drift — ${r.error.issues.join(", ")}`,
  );
};
