/**
 * The v2 round trip, which is the feature:
 *
 *   upload in the gallery → attach to a product → it is still in the library
 *   → upload from a product → it appears in the gallery
 *
 * Nothing below this level can catch a break in that loop. The unit tests
 * know the repositories agree; only this knows the two surfaces are looking
 * at the same library.
 */

import { expect, type Page, test } from "@playwright/test";

import { resetCatalogue } from "./reset-catalogue";

const sidebar = (page: Page) => page.getByRole("list", { name: "Sections" });

/** The gallery's tiles. Scoped by name because the sidebar menu is also a
 * list of list-items. */
const tiles = (page: Page) =>
  page
    .getByRole("list", { name: /^Media added in/ })
    .first()
    .getByRole("listitem");

const signIn = async (page: Page) => {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "E2E Operator" }).click();
  await expect(page).toHaveURL(/\/products$/);
};

/** Wait for an upload to finish: the tile count is the only honest signal,
 * since the progress row disappears the moment the row is written. */
const uploadInGallery = async (
  page: Page,
  count: number,
  fixture = "e2e/fixtures/swatch.png",
) => {
  const before = await tiles(page).count();
  await page.setInputFiles(
    'input[type="file"]',
    Array.from({ length: count }, () => fixture),
  );
  await expect(tiles(page)).toHaveCount(before + count, { timeout: 60_000 });
};

test.describe("the media library", () => {
  // Every test here asserts an absolute count, which is the clearest way to
  // state "three files went in, three are in the library" — and only holds
  // from empty. See `reset-catalogue.ts`.
  test.beforeEach(async () => {
    await resetCatalogue();
  });

  test("uploads several files at once, with no product involved", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/gallery");

    // A fresh database: the library is empty and says so.
    await expect(page.getByText("The library is empty")).toBeVisible();

    await uploadInGallery(page, 3);

    // All three are there and none belongs to anything yet — the state the
    // old schema could not represent at all.
    await expect(page.getByRole("button", { name: /^All 3/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Unused 3/ })).toBeVisible();
  });

  test("attaching to a product leaves the file in the library", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/gallery");
    await uploadInGallery(page, 1);

    // Attach it through the picker, the way an operator would.
    await page.goto("/products/new");
    await page.getByLabel("Name").fill("Library Subject");
    await page.getByLabel("Price").fill("150000");
    await page.getByRole("button", { name: "Add from library" }).click();

    const picker = page.getByRole("dialog");
    await expect(picker).toBeVisible();
    await picker
      .getByRole("list", { name: "Library" })
      .getByRole("button")
      .first()
      .click();
    await picker.getByRole("button", { name: /^Add 1/ }).click();
    await expect(picker).toBeHidden();

    await expect(
      page.getByRole("list", { name: "This product's media" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Create product" }).click();
    await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}$/, {
      timeout: 30_000,
    });

    // Still in the library, and now marked as used rather than unused.
    await sidebar(page).getByRole("link", { name: "Gallery" }).click();
    await expect(page.getByRole("button", { name: /^All 1/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Unused 0/ })).toBeVisible();

    // And the viewer names the product it is on.
    await tiles(page).first().getByRole("button").click();
    const viewer = page.getByRole("dialog");
    await expect(
      viewer.getByRole("link", { name: "Library Subject" }),
    ).toBeVisible();
  });

  test("uploading from a product puts the file in the library too", async ({
    page,
  }) => {
    await signIn(page);

    await page.goto("/products/new");
    await page.getByLabel("Name").fill("Upload From Product");
    await page.getByLabel("Price").fill("99000");
    await page.setInputFiles('input[type="file"]', "e2e/fixtures/swatch.png");
    // It lands in this product's grid…
    await expect(
      page
        .getByRole("list", { name: "This product's media" })
        .getByRole("listitem"),
    ).toHaveCount(1, { timeout: 60_000 });

    await page.getByRole("button", { name: "Create product" }).click();
    await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}$/, {
      timeout: 30_000,
    });

    // …and in the library, which is the half that used to be impossible.
    await sidebar(page).getByRole("link", { name: "Gallery" }).click();
    await expect(page.getByRole("button", { name: /^All 1/ })).toBeVisible();
    await expect(tiles(page)).toHaveCount(1);
  });

  test("removing from a product unlinks it, and does not delete it", async ({
    page,
  }) => {
    await signIn(page);

    await page.goto("/products/new");
    await page.getByLabel("Name").fill("Unlink Subject");
    await page.getByLabel("Price").fill("50000");
    await page.setInputFiles('input[type="file"]', "e2e/fixtures/swatch.png");
    const grid = page.getByRole("list", { name: "This product's media" });
    await expect(grid.getByRole("listitem")).toHaveCount(1, {
      timeout: 60_000,
    });
    await page.getByRole("button", { name: "Create product" }).click();
    await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}$/, {
      timeout: 30_000,
    });

    // Take it off the product.
    await page.getByRole("button", { name: /^Remove / }).click();
    await expect(grid).toBeHidden();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Product saved.")).toBeVisible({
      timeout: 30_000,
    });

    // The file survives — a product form is not where files get destroyed.
    await sidebar(page).getByRole("link", { name: "Gallery" }).click();
    await expect(page.getByRole("button", { name: /^All 1/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Unused 1/ })).toBeVisible();
  });

  test("deleting from the library warns which products it will affect", async ({
    page,
  }) => {
    await signIn(page);

    await page.goto("/products/new");
    await page.getByLabel("Name").fill("Delete Warning Subject");
    await page.getByLabel("Price").fill("50000");
    await page.setInputFiles('input[type="file"]', "e2e/fixtures/swatch.png");
    await expect(
      page
        .getByRole("list", { name: "This product's media" })
        .getByRole("listitem"),
    ).toHaveCount(1, { timeout: 60_000 });
    await page.getByRole("button", { name: "Create product" }).click();
    await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}$/, {
      timeout: 30_000,
    });

    await page.goto("/gallery");
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await tiles(page).first().getByRole("button").click();

    // The toolbar's Delete opens the confirmation…
    await page
      .getByRole("button", { name: "Delete", exact: true })
      .first()
      .click();

    // …which must say what it will break. Deleting from a library without
    // that is a trap.
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toBeVisible();
    await expect(
      confirm.getByText(/used by Delete Warning Subject/),
    ).toBeVisible();

    await confirm.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("The library is empty")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("a photograph over the archive cap is resized in the browser", async ({
    page,
  }) => {
    // The only place the real canvas path runs with an oversized image: every
    // unit test around it injects a fake encoder, so this is what proves the
    // browser actually does the work — and that a 12 MB phone photograph is
    // now welcome rather than rejected.
    await signIn(page);
    await page.goto("/gallery");
    await uploadInGallery(page, 1, "e2e/fixtures/large-photo.png");

    await tiles(page).first().getByRole("button").click();
    const viewer = page.getByRole("dialog");
    await expect(viewer).toBeVisible();

    // 5000×3000 stored as 4096×2458 — the dimensions describe the file that
    // exists, not the one that was picked.
    await expect(viewer.getByText(/4096×2458/)).toBeVisible();

    // And the display copy is a fraction of the stored original, which is
    // itself a fraction of what was uploaded.
    await expect(viewer.getByText(/→/)).toBeVisible();
  });
});
