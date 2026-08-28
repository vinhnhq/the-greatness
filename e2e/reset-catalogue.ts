/**
 * Empty the catalogue between tests that assert absolute counts.
 *
 * The suite shares one database across every spec file, in file order, which
 * is right for the tests that only need *a* product and wrong for the media
 * round-trip: "uploaded three files → All 3, Unused 3" is the clearest
 * assertion available and it only holds from empty.
 *
 * The alternative was making those assertions relative, which would have kept
 * the shared database and lost the thing worth asserting. This resets instead.
 *
 * Writes go through the same Kysely instance the app uses, against the same
 * file — `playwright.config.ts` pins `DATABASE_FILE` for the test process as
 * well as the server's, so both halves agree about which database this is.
 */

import { createDb } from "@/lib/db";

export const resetCatalogue = async (): Promise<void> => {
  const db = createDb();
  try {
    // Children first: a link surviving its parent is exactly the state the
    // app's own delete paths are careful to avoid.
    await db.deleteFrom("product_media").execute();
    await db.deleteFrom("media_assets").execute();
    await db.deleteFrom("product_categories").execute();
    await db.deleteFrom("products").execute();
  } finally {
    await db.destroy();
  }
};
