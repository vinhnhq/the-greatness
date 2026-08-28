/**
 * The smoke test: one operator's whole path through the dashboard.
 *
 * Driven through the UI like a customer — no API calls, no direct database
 * writes, no seeded fixture standing in for a product the test claims to have
 * created. The point is to catch what unit tests structurally cannot: that
 * the form posts what the action expects, that the action's revalidation
 * actually refreshes the list, and that a filtered URL survives a reload.
 */

import path from "node:path";

import { expect, type Page, test } from "@playwright/test";

/** The sidebar link, not the breadcrumb link to the same place. */
const sidebar = (page: Page) => page.getByRole("list", { name: "Sections" });

/**
 * Sign in through the dev picker, and **wait for the redirect to land**.
 * Navigating away before it does races the server action: the next `goto`
 * fires without a session cookie and quietly bounces back to /sign-in, which
 * then fails on a missing form field rather than on the real cause.
 */
const signIn = async (page: Page) => {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "E2E Operator" }).click();
  await expect(page).toHaveURL(/\/products$/);
};

const UNIQUE = Date.now().toString().slice(-6);
const PRODUCT = `Áo Dài Lụa ${UNIQUE}`;
const RENAMED = `${PRODUCT} — revised`;

test.describe.configure({ mode: "serial" });

test("sign in, create a product with an image, find it, edit it", async ({
  page,
}) => {
  // --- sign in ---------------------------------------------------------
  // Signed out, every dashboard route redirects — the layout's gate.
  await page.goto("/products");
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.getByRole("button", { name: "E2E Operator" }).click();
  await expect(page).toHaveURL(/\/products$/);
  await expect(
    page.getByRole("heading", { name: "Products", level: 1 }),
  ).toBeVisible();

  // A fresh database — the distinct "nothing yet" state, not "no matches".
  await expect(page.getByText("No products yet")).toBeVisible();

  // --- create ----------------------------------------------------------
  // Two of these on an empty list — the header button and the empty state's.
  await page.getByRole("link", { name: "New product" }).first().click();
  await expect(page).toHaveURL(/\/products\/new$/);

  await page.getByLabel("Name").fill(PRODUCT);
  // The slug follows the name until it is touched.
  await expect(page.getByLabel("URL slug")).toHaveValue(
    new RegExp(`^ao-dai-lua-${UNIQUE}$`),
  );

  await page.getByLabel("SKU").fill(`ADL-${UNIQUE}`);
  await page.getByLabel("Description").fill("Lụa tơ tằm, may đo.");
  await page.getByLabel("Price").fill("4800000");
  await page.getByLabel("Bags").check();
  await page.getByLabel("Product status").click();
  await page.getByRole("option", { name: "active" }).click();

  // --- upload an image -------------------------------------------------
  // A real file through the real input: prepare() decodes it, re-encodes it
  // to WebP and uploads both copies before the product is ever saved.
  await page.setInputFiles(
    'input[type="file"]',
    path.resolve("e2e/fixtures/swatch.png"),
  );

  const card = page.getByRole("listitem").filter({ hasText: "swatch.png" });
  await expect(card).toBeVisible();
  // The optimized size appears only once the upload has landed.
  await expect(card.getByRole("link", { name: "View original" })).toBeVisible({
    timeout: 30_000,
  });
  await card.getByLabel(/^Alt text for/).fill("Silk swatch");

  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}$/, {
    timeout: 30_000,
  });
  await expect(page.getByRole("heading", { name: PRODUCT })).toBeVisible();

  // --- find it through search + filter ---------------------------------
  await sidebar(page).getByRole("link", { name: "Products" }).click();
  await expect(page).toHaveURL(/\/products$/);

  // Typed without diacritics — the fold in `lib/search-text.ts` is what makes
  // this match, and it is the assertion most likely to catch a regression there.
  await page.getByLabel("Search products").fill(`ao dai lua ${UNIQUE}`);
  await expect(page).toHaveURL(/[?&]q=/, { timeout: 10_000 });
  await expect(page.getByRole("link", { name: PRODUCT })).toBeVisible();

  await page.getByLabel("Filter by status").click();
  await page.getByRole("option", { name: "active" }).click();
  await expect(page).toHaveURL(/status=active/);
  await expect(page.getByRole("link", { name: PRODUCT })).toBeVisible();

  // The URL is the query: reloading a filtered view keeps the filter.
  const filtered = page.url();
  await page.reload();
  expect(page.url()).toBe(filtered);
  await expect(page.getByRole("link", { name: PRODUCT })).toBeVisible();

  // The filter is exclusive, not decorative.
  await page.getByLabel("Filter by status").click();
  await page.getByRole("option", { name: "draft" }).click();
  await expect(page.getByText("No products match these filters")).toBeVisible();

  // --- edit ------------------------------------------------------------
  await page.getByRole("link", { name: "Clear filters" }).click();
  await page.getByRole("link", { name: PRODUCT }).click();

  await page.getByLabel("Name").fill(RENAMED);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: RENAMED })).toBeVisible({
    timeout: 30_000,
  });

  // The attachment survived the round-trip with its alt text.
  await expect(page.getByLabel(/^Alt text for/)).toHaveValue("Silk swatch");

  // And the list reflects the rename without a manual refresh.
  await sidebar(page).getByRole("link", { name: "Products" }).click();
  await expect(page.getByRole("link", { name: RENAMED })).toBeVisible();
});

test("rejects a file that is not media, without losing the form", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/products/new");

  await page.getByLabel("Name").fill("Rejection check");
  await page.setInputFiles(
    'input[type="file"]',
    path.resolve("e2e/fixtures/notes.txt"),
  );

  await expect(page.getByText(/is not an image or a video/)).toBeVisible();
  // The typed name is untouched — a rejected file must not cost the form.
  await expect(page.getByLabel("Name")).toHaveValue("Rejection check");
});
