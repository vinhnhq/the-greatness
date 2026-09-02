/**
 * The categories page: a tree in one tab, a flat list in the other, and
 * counts that are distinct in both.
 *
 * All of it needs a browser to be worth anything. The nesting is state the
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

import { expect, type Locator, type Page, test } from "@playwright/test";

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
  unfiled: newId(),
};

/**
 * A group → mid → two leaves, with **one** product linked to the mid and to
 * both leaves. That overlap is the real catalogue's shape — eight fans appear
 * in nine fan categories — and it is what makes a summed subtree count read
 * three where the answer is one.
 *
 * Plus **one product linked to nothing**, standing in for the 697 of 832 that
 * are filed nowhere. Without it the Unfiled node has nothing to render and
 * the case that dominates the real data goes untested.
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
      .values([
        {
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
        },
        // Linked to nothing. Five sixths of the real catalogue looks like
        // this, so a tree that cannot show it is showing a sixth of the shop.
        {
          id: ids.unfiled,
          name: "E2E Không phân loại",
          slug: "e2e-khong-phan-loai",
          sku: null,
          description: null,
          priceMinor: 0,
          currency: "VND",
          status: "active",
          searchText: "e2e khong phan loai",
          sapoId: null,
          createdAt: now,
          updatedAt: now,
        },
      ])
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

test("the taxonomy tree nests, and a closed branch is not rendered", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/categories");

  // Taxonomy is the default tab, so the tree is what loads.
  const tree = page.getByRole("tabpanel", { name: "Taxonomy" });
  const node = (name: string) =>
    tree.getByRole("button", { name, exact: true });

  // --- roots open, everything below closed -----------------------------
  await expect(node(GROUP)).toBeVisible();
  await expect(node(MID)).toBeVisible();
  // The leaves are not merely hidden — a closed branch is not rendered.
  await expect(node(LEAF_A)).toHaveCount(0);

  // --- opening a branch reveals its leaves -----------------------------
  await tree.getByRole("button", { name: `Expand ${MID}` }).click();
  await expect(node(LEAF_A)).toBeVisible();
  await expect(node(LEAF_B)).toBeVisible();

  // --- and closing the group takes the whole branch with it ------------
  await tree.getByRole("button", { name: `Collapse ${GROUP}` }).click();
  await expect(node(MID)).toHaveCount(0);
  await expect(node(LEAF_A)).toHaveCount(0);
  await expect(node(GROUP)).toBeVisible();
});

test("the flat list carries the path, and the subtree count is distinct", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/categories?tab=categories");

  // Anchored on the row's own link, not its text: now that every descendant
  // row carries its ancestors' names in the path column, `hasText: GROUP`
  // matches five rows. That ambiguity is the column doing its job.
  const row = (name: string) =>
    page
      .getByRole("row")
      .filter({ has: page.getByRole("link", { name, exact: true }) });

  // --- flat: every category is present at once, no expanding ----------
  await expect(row(GROUP)).toBeVisible();
  await expect(row(MID)).toBeVisible();
  await expect(row(LEAF_A)).toBeVisible();
  await expect(row(LEAF_B)).toBeVisible();

  // --- the path is what replaces the indentation ----------------------
  // Without it, "E2E Quạt đứng" is one of several near-identical fan names
  // with nothing to tell them apart.
  await expect(row(LEAF_A)).toContainText(`${GROUP} › ${MID}`);

  // --- the count that a naive sum gets wrong --------------------------
  // One product, linked to the mid and to both leaves. Summing says 3.
  await expect(row(MID)).toContainText("1");
  // The group holds nothing directly, which is true of every real top-level
  // group here, and must not read as an empty category.
  await expect(row(GROUP)).toContainText("0 direct");

  // --- filtering narrows the flat list --------------------------------
  // Unaccented, the way search folds everywhere else: `quat` finds `Quạt`.
  await page
    .getByRole("textbox", { name: "Filter categories" })
    .fill("quat dung");
  await expect(row(LEAF_A)).toBeVisible();
  await expect(row(GROUP)).toHaveCount(0);
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
  // The drill-down starts from the flat list: the tree selects into the right
  // pane, the list is what links out to `/categories/[slug]`.
  await page.goto("/categories?tab=categories");

  // --- into the group ---------------------------------------------------
  await page.getByRole("link", { name: GROUP, exact: true }).click();
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

/**
 * The split view and its drags.
 *
 * dnd-kit listens to pointer events with a distance constraint, so a
 * one-shot `dragTo` does not trip it — the drag has to be stepped, which is
 * why this is written out longhand rather than using Playwright's helper.
 */
const dragOnto = async (page: Page, source: Locator, target: Locator) => {
  const a = await source.boundingBox();
  const b = await target.boundingBox();
  if (a === null || b === null) throw new Error("nothing to drag");

  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  // Past the 6px activation distance, then onto the target in steps so the
  // collision detection sees the moves.
  await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2, {
    steps: 5,
  });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
  await page.mouse.up();
};

test("the split view selects into the URL without navigating", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/categories");

  await page.getByRole("button", { name: MID, exact: true }).first().click();

  await expect(page).toHaveURL(/category=e2e-quat/);
  // The right pane filled; we did not leave /categories.
  await expect(page).toHaveURL(/\/categories\?/);
  await expect(page.getByText(/E2E Quạt tích điện/).first()).toBeVisible();
});

test("dragging a product from the right pane onto a category files it", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/categories?category=e2e-quat");

  // Scoped to the pane: the same product is now also a leaf in the tree, and
  // there the whole row is not the drag source — only its handle is.
  const pane = page.getByRole("list", { name: "Products in this category" });
  await expect(pane.getByText(/E2E Quạt tích điện/)).toBeVisible();

  const tree = page.getByRole("list", { name: "Taxonomy" });
  // The workspace tree opens on roots only, so the target leaf is not
  // rendered yet — a closed branch is not a drop target.
  await tree.getByRole("button", { name: `Expand ${MID}` }).click();
  const target = tree.getByRole("button", { name: LEAF_EMPTY, exact: true });
  await expect(target).toBeVisible();

  await dragOnto(page, pane.getByText(/E2E Quạt tích điện/), target);

  // The empty leaf now holds it — and this is only safe because the mirror
  // makes the next sync keep it.
  await page.goto("/categories?category=e2e-quat-thap");
  await expect(
    page
      .getByRole("list", { name: "Products in this category" })
      .getByText(/E2E Quạt tích điện/),
  ).toBeVisible();
});

test("products hang off the tree, and the unfiled ones have a home", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/categories");

  const tree = page.getByRole("list", { name: "Taxonomy" });

  // --- a product is a leaf, reached by opening its category --------------
  await tree.getByRole("button", { name: `Expand ${MID}` }).click();
  await expect(tree.getByText(/E2E Quạt tích điện/).first()).toBeVisible();

  // --- Unfiled is a node, not an omission -------------------------------
  // 697 of the real catalogue's 832 products are in no category; the seeded
  // one here stands for them.
  await tree.getByRole("button", { name: "Expand Unfiled" }).click();
  await expect(tree.getByText(/E2E Không phân loại/)).toBeVisible();

  // --- the filter reaches products, not just categories -----------------
  await page
    .getByRole("textbox", { name: "Filter the taxonomy" })
    .fill("khong phan loai");
  await expect(tree.getByText(/E2E Không phân loại/)).toBeVisible();
  // Unaccented and case-folded, and the categories that do not match are gone.
  await expect(tree.getByText(GROUP)).toHaveCount(0);
});

test("on a phone the detail is a drawer, off-canvas until something is picked", async ({
  page,
}) => {
  await signIn(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/categories");

  const pane = page.getByRole("complementary", { name: "Detail" });

  // --- closed: parked off the right edge, and not tabbable ---------------
  // `toBeInViewport` rather than a bounding box, because the drawer
  // transitions and a box read the instant after a click measures the
  // animation, not the result.
  await expect(pane).not.toBeInViewport();
  // `inert`, not `hidden` — the content is still in the DOM, and without it a
  // closed drawer's inputs stay in the tab order.
  await expect(pane).toHaveAttribute("inert", "");

  // --- picking a product slides it in ------------------------------------
  const tree = page.getByRole("list", { name: "Taxonomy" });
  await tree.getByRole("button", { name: `Expand ${MID}` }).click();
  // Exact: the row's drag handle is also a button, named "Move <product>".
  await tree
    .getByRole("button", { name: "E2E Quạt tích điện", exact: true })
    .first()
    .click();

  await expect(page).toHaveURL(/product=/);
  await expect(pane).toBeInViewport();
  // Named, which it only is because the label carries `htmlFor`.
  await expect(pane.getByRole("textbox", { name: "Name" })).toBeVisible();

  // --- and closing parks it again ----------------------------------------
  await page.getByRole("button", { name: "Close detail" }).first().click();
  await expect(page).not.toHaveURL(/product=/);
  await expect(pane).not.toBeInViewport();
});
