/**
 * The two things only a real viewport can answer: that the layout holds at a
 * phone width and at a very wide desktop, and that the gallery behaves like a
 * gallery.
 *
 * The horizontal-overflow assertion is the load-bearing one. Nothing in a
 * unit test catches a table that pushes the page 60px wider than the screen,
 * and on a phone that is the difference between a usable admin and one where
 * every tap lands slightly off.
 *
 * **Every test here creates the data it needs.** The suite shares one
 * database and runs in file order, so a test that assumed an empty gallery
 * passed alone and failed in the suite — which is the worst kind of test,
 * because it only fails when you have changed something else.
 */

import { expect, type Page, test } from "@playwright/test";

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 2560, height: 1440 };

const sidebar = (page: Page) => page.getByRole("list", { name: "Sections" });

/** The gallery's tiles. Scoped by name because the sidebar menu is also a
 * list of list-items, and a bare `getByRole("listitem")` finds that first. */
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

/** Create a product carrying one image, through the UI, as an operator would. */
const createProductWithImage = async (page: Page, name: string) => {
  await page.goto("/products/new");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Price").fill("120000");
  await page.setInputFiles('input[type="file"]', "e2e/fixtures/swatch.png");
  await expect(page.getByRole("link", { name: "View original" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByLabel(/^Alt text for/).fill(`${name} swatch`);
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}$/, {
    timeout: 30_000,
  });
};

/** Does the document scroll sideways? The most common responsive bug, and the
 * one invisible on the developer's own monitor. */
const overflowsHorizontally = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1,
  );

test.describe("layout", () => {
  test("no page scrolls sideways on a phone", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signIn(page);
    await createProductWithImage(page, "Phone Layout Subject");

    for (const path of [
      "/products",
      "/gallery",
      "/categories",
      "/products/new",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await overflowsHorizontally(page), `${path} overflows`).toBe(
        false,
      );
    }
  });

  test("content is centred rather than stretched on a very wide screen", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signIn(page);

    // The container, not the table: this has to hold on a page with no rows,
    // which is exactly when a missing max-width is least obvious.
    const container = page.locator("[data-page-container]");
    const box = await container.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    // Well short of 2560 — an unbounded row on a 27" monitor makes the eye
    // travel from a name on the far left to a price on the far right.
    expect(box.width).toBeLessThanOrEqual(1300);

    // Centred within `<main>`, not within the viewport. The sidebar owns the
    // first 256px; content centred against the whole window would sit
    // visibly left of its own column, and would jump when the sidebar
    // collapses. Asserting against the viewport is what made this test fail
    // by exactly the sidebar's width.
    const main = await page.getByRole("main").boundingBox();
    expect(main).not.toBeNull();
    if (!main) return;

    const leftGutter = box.x - main.x;
    const rightGutter = main.x + main.width - (box.x + box.width);
    expect(Math.abs(leftGutter - rightGutter)).toBeLessThan(8);
  });

  test("the gallery is wider than the rest of the app", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signIn(page);

    await page.goto("/products");
    const list = await page.locator("[data-page-container]").boundingBox();

    await page.goto("/gallery");
    const gallery = await page.locator("[data-page-container]").boundingBox();

    expect(list).not.toBeNull();
    expect(gallery).not.toBeNull();
    if (!list || !gallery) return;
    // More screen should mean more photos, not bigger ones — the reason this
    // page gets its own width.
    expect(gallery.width).toBeGreaterThan(list.width);
  });

  test("the gallery adds columns rather than enlarging tiles", async ({
    page,
  }) => {
    await signIn(page);
    await createProductWithImage(page, "Column Count Subject");

    await page.setViewportSize(PHONE);
    await page.goto("/gallery");
    const tile = tiles(page).first();
    await expect(tile).toBeVisible();
    const narrow = await tile.boundingBox();

    await page.setViewportSize(DESKTOP);
    const wide = await tile.boundingBox();

    expect(narrow).not.toBeNull();
    expect(wide).not.toBeNull();
    if (!narrow || !wide) return;
    // 6.5x the viewport width, but nothing like 6.5x the tile.
    expect(wide.width).toBeLessThan(narrow.width * 2);
    // And a tile stays square at both.
    expect(Math.abs(wide.width - wide.height)).toBeLessThan(2);
  });
});

test.describe("gallery", () => {
  test("shows uploaded media, grouped by month, and opens it full screen", async ({
    page,
  }) => {
    await signIn(page);
    await createProductWithImage(page, "Gallery Subject");

    await sidebar(page).getByRole("link", { name: "Gallery" }).click();
    await expect(page).toHaveURL(/\/gallery$/);

    // The tab counts are what tell someone a tab is worth pressing.
    await expect(page.getByRole("button", { name: /^All \d+/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Videos 0" })).toBeVisible();

    // A month heading, the way a photo library groups.
    const month = new Date().toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
    });
    await expect(
      page.getByRole("heading", { name: new RegExp(month) }),
    ).toBeVisible();

    // Open the viewer on the newest item, which is the one just uploaded.
    await tiles(page).first().getByRole("button").click();
    const viewer = page.getByRole("dialog");
    await expect(viewer).toBeVisible();
    // The caption carries the reason you are here.
    await expect(
      viewer.getByRole("link", { name: "Gallery Subject" }),
    ).toBeVisible();
    await expect(viewer.getByText(/^1 \//)).toBeVisible();
    // Newest first, so there is nothing before it.
    await expect(
      viewer.getByRole("button", { name: "Previous" }),
    ).toBeDisabled();

    // Escape closes it without navigating away.
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
    await expect(page).toHaveURL(/\/gallery$/);
  });

  test("arrow keys move between items", async ({ page }) => {
    await signIn(page);
    await createProductWithImage(page, "Arrow Subject A");
    await createProductWithImage(page, "Arrow Subject B");

    await page.goto("/gallery");
    await tiles(page).first().getByRole("button").click();

    const viewer = page.getByRole("dialog");
    await expect(viewer.getByText(/^1 \//)).toBeVisible();

    await page.keyboard.press("ArrowRight");
    await expect(viewer.getByText(/^2 \//)).toBeVisible();

    await page.keyboard.press("ArrowLeft");
    await expect(viewer.getByText(/^1 \//)).toBeVisible();

    // The first item has nothing before it, and pressing left does not wrap.
    await page.keyboard.press("ArrowLeft");
    await expect(viewer.getByText(/^1 \//)).toBeVisible();
  });

  test("the kind filter is exclusive and linkable", async ({ page }) => {
    await signIn(page);
    await createProductWithImage(page, "Filter Subject");

    await page.goto("/gallery");
    await page.getByRole("button", { name: /^Videos/ }).click();
    await expect(page).toHaveURL(/kind=video/);
    // No test ever uploads a video, so this holds however much else exists.
    await expect(
      page.getByText("No videos have been uploaded yet"),
    ).toBeVisible();

    // The URL is the query: a filtered gallery survives a reload.
    const filtered = page.url();
    await page.reload();
    expect(page.url()).toBe(filtered);
    await expect(
      page.getByText("No videos have been uploaded yet"),
    ).toBeVisible();

    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/gallery$/);
    await expect(tiles(page).first()).toBeVisible();
  });
});
