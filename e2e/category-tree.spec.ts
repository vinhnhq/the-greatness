/**
 * The categories page renders a tree, and the counts in it are distinct.
 *
 * Both halves need a browser to be worth anything. The nesting is state the
 * unit tests already cover as a pure function — what they cannot cover is
 * that the rows actually collapse, that a leaf is absent from the DOM until
 * its parent is opened, and that the payload survives the server/client
 * boundary at all. That last one is not hypothetical: `listLinks` shipped
 * once returning the driver's own row objects, which build fine and throw
 * "Only plain objects can be passed to Client Components" on the request.
 *
 * The tree cannot be built through the UI — v4 seeds it and does not yet let
 * an operator re-parent anything — so this spec writes it directly, the way
 * `reset-catalogue.ts` does, and clears it again afterwards.
 */

import { expect, type Page, test } from "@playwright/test";

import { createDb } from "@/lib/db";
import { newId } from "@/lib/id";

import { resetCatalogue } from "./reset-catalogue";

const GROUP = "E2E Thiết bị gia đình";
const MID = "E2E Quạt & Thiết bị làm mát";
const LEAF_A = "E2E Quạt đứng";
const LEAF_B = "E2E Quạt trần";
/** Deliberately holds nothing — only 20 of 211 real categories do. */
const LEAF_EMPTY = "E2E Quạt tháp";

const ids = {
  group: newId(),
  mid: newId(),
  leafA: newId(),
  leafB: newId(),
  leafEmpty: newId(),
  product: newId(),
};

/**
 * A group → mid → two leaves, with **one** product linked to the mid and to
 * both leaves. That overlap is the real catalogue's shape — eight fans appear
 * in nine fan categories — and it is what makes a summed subtree count read
 * three where the answer is one.
 */
const seedTree = async (): Promise<void> => {
  const db = createDb();
  const now = new Date();
  try {
    await db
      .insertInto("categories")
      .values([
        {
          id: ids.group,
          name: GROUP,
          slug: "e2e-tbgd",
          parentId: null,
          sapoId: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: ids.mid,
          name: MID,
          slug: "e2e-quat",
          parentId: ids.group,
          sapoId: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: ids.leafA,
          name: LEAF_A,
          slug: "e2e-quat-dung",
          parentId: ids.mid,
          sapoId: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: ids.leafB,
          name: LEAF_B,
          slug: "e2e-quat-tran",
          parentId: ids.mid,
          sapoId: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: ids.leafEmpty,
          name: LEAF_EMPTY,
          slug: "e2e-quat-thap",
          parentId: ids.mid,
          sapoId: null,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .execute();

    await db
      .insertInto("products")
      .values({
        id: ids.product,
        name: "E2E Quạt tích điện",
        slug: "e2e-quat-tich-dien",
        sku: null,
        description: null,
        priceMinor: 0,
        currency: "VND",
        status: "active",
        searchText: "e2e quat tich dien",
        sapoId: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    await db
      .insertInto("product_categories")
      .values([
        { productId: ids.product, categoryId: ids.mid },
        { productId: ids.product, categoryId: ids.leafA },
        { productId: ids.product, categoryId: ids.leafB },
      ])
      .execute();
  } finally {
    await db.destroy();
  }
};

const clearTree = async (): Promise<void> => {
  const db = createDb();
  try {
    await db.deleteFrom("product_categories").execute();
    await db.deleteFrom("products").execute();
    await db
      .deleteFrom("categories")
      .where("id", "in", [
        ids.leafA,
        ids.leafB,
        ids.leafEmpty,
        ids.mid,
        ids.group,
      ])
      .execute();
  } finally {
    await db.destroy();
  }
};

const signIn = async (page: Page) => {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "E2E Operator" }).click();
  await expect(page).toHaveURL(/\/products$/);
};

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await resetCatalogue();
  await seedTree();
});

test.afterAll(async () => {
  await clearTree();
});

test("groups nest, leaves stay closed, and the subtree count is distinct", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/categories");

  const row = (name: string) => page.getByRole("row").filter({ hasText: name });

  // --- roots open, everything below closed -----------------------------
  await expect(row(GROUP)).toBeVisible();
  await expect(row(MID)).toBeVisible();
  // The leaves are not merely hidden — a closed branch is not rendered.
  await expect(row(LEAF_A)).toHaveCount(0);

  // --- the count that a naive sum gets wrong ---------------------------
  // One product, linked to the mid and to both leaves. Summing says 3.
  await expect(row(MID)).toContainText("1");
  // The group holds nothing directly, which is true of every real top-level
  // group here, and must not read as an empty category.
  await expect(row(GROUP)).toContainText("0 direct");

  // --- opening a branch reveals its leaves -----------------------------
  await page.getByRole("button", { name: `Expand ${MID}` }).click();
  await expect(row(LEAF_A)).toBeVisible();
  await expect(row(LEAF_B)).toBeVisible();

  // --- and closing the group takes the whole branch with it ------------
  await page.getByRole("button", { name: `Collapse ${GROUP}` }).click();
  await expect(row(MID)).toHaveCount(0);
  await expect(row(LEAF_A)).toHaveCount(0);
  await expect(row(GROUP)).toBeVisible();

  // --- expand all reaches the leaves in one move -----------------------
  await page.getByRole("button", { name: "Expand all" }).click();
  await expect(row(LEAF_A)).toBeVisible();
  await expect(row(LEAF_B)).toBeVisible();
});

test("the product form's picker groups, searches unaccented, and keeps the selection visible", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/products/new");

  const picker = page
    .getByRole("region", { name: "Categories" })
    .or(page.locator("form"));

  // --- grouped, not a flat wall ----------------------------------------
  await expect(page.getByText(GROUP, { exact: true })).toBeVisible();
  // A closed branch is not rendered, so the leaves are absent entirely.
  await expect(page.getByText(LEAF_A, { exact: true })).toHaveCount(0);

  // --- unaccented search reaches an accented name ----------------------
  // `quat dung` must find `Quạt đứng`, the same fold product search uses.
  await picker
    .getByRole("textbox", { name: "Search categories" })
    .fill("quat dung");
  await expect(page.getByText(LEAF_A, { exact: true })).toBeVisible();
  // The ancestors survive the filter, or the match loses the context that
  // tells nine near-identical fan names apart. `.first()` because each name
  // now appears twice: as its own row, and inside a match's path caption —
  // which is itself the behaviour under test.
  await expect(page.getByText(MID, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(GROUP, { exact: true }).first()).toBeVisible();
  // The caption spells out the whole path for the leaf.
  await expect(page.getByText(`${GROUP} › ${MID}`)).toBeVisible();
  // ...and a branch with no match anywhere in it is gone.
  await expect(page.getByText(LEAF_B, { exact: true })).toHaveCount(0);

  // --- the selection stays visible while the list is filtered ----------
  await page.getByRole("checkbox").filter({ hasText: "" }).first().check();
  await picker
    .getByRole("textbox", { name: "Search categories" })
    .fill("zzz-no-such-category");
  await expect(page.getByText("No category matches")).toBeVisible();
  // The chip is the only thing left saying what is chosen.
  await expect(page.getByRole("button", { name: /^Remove / })).toBeVisible();
});

test("walks root to product, counting distinctly at every step", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/categories");

  // --- into the group from the tree ------------------------------------
  await page.getByRole("link", { name: GROUP }).click();
  await expect(page).toHaveURL(/\/categories\/e2e-tbgd$/);

  // A grouping holds nothing itself; the summary has to say that in words
  // rather than showing a bare 0, which reads as a page that failed.
  await expect(
    page.getByText(/0 filed here directly · 1 in this group altogether/),
  ).toBeVisible();
  await expect(
    page.getByText("This is a grouping — look in its subcategories above."),
  ).toBeVisible();

  // --- down a level ----------------------------------------------------
  await page.getByRole("link", { name: new RegExp(MID) }).click();
  await expect(page).toHaveURL(/\/categories\/e2e-quat$/);

  // THE count. One product, linked to this category AND to both of its
  // children. Summing the subtree would say three.
  await expect(
    page.getByText(/1 filed here directly · 1 in this group altogether/),
  ).toBeVisible();

  // --- the breadcrumb names the path, not the slug ---------------------
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs.getByRole("link", { name: GROUP })).toBeVisible();

  // --- and down to the product -----------------------------------------
  await page.getByRole("link", { name: /E2E Quạt tích điện/ }).click();
  await expect(page).toHaveURL(/\/products\//);
});

test("a product filed in a parent and a child is shown at both", async ({
  page,
}) => {
  // Deliberate: eight fans in this catalogue are filed in all eleven fan
  // categories, and hiding the repetition would hide the problem the page
  // exists to surface.
  await signIn(page);

  await page.goto("/categories/e2e-quat");
  await expect(
    page.getByRole("link", { name: /E2E Quạt tích điện/ }),
  ).toBeVisible();

  await page.goto("/categories/e2e-quat-dung");
  await expect(
    page.getByRole("link", { name: /E2E Quạt tích điện/ }),
  ).toBeVisible();
});

test("an empty branch reads as empty, not as broken", async ({ page }) => {
  // Only 20 of 211 real categories hold anything, so this is the common case.
  await signIn(page);
  await page.goto("/categories/e2e-quat-thap");
  await expect(
    page.getByText("No product carries this category yet."),
  ).toBeVisible();
});
