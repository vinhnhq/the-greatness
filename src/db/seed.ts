/**
 * `bun run seed` — an operator and the real catalogue.
 *
 * Not decoration. An empty dashboard hides everything that only shows up with
 * data: whether paging works, whether the filters have anything to filter,
 * whether a Vietnamese product name renders and searches correctly, and
 * whether a row with no image looks deliberate rather than broken.
 *
 * **It loads the Sapo snapshot** (`seed-sapo.ts`, reading `data/sapo/`) rather
 * than the thirty invented products it used to. Those were too tidy to be
 * useful: each had a price, a description, a category and an image, so every
 * empty state was invisible. The real catalogue is 832 products of which 697
 * are in no category, 160 cost nothing and 298 have no description — it finds
 * those states by existing.
 *
 * Idempotent: re-running replaces the seeded rows rather than doubling them,
 * so it is safe to run against a database you have been clicking around in.
 * `bun run db:reset` is the sledgehammer.
 *
 * Images come from `bun run fetch:sapo --images && bun run prepare:sapo-media`
 * and are **not in the repository** — 250 MB of catalogue photographs. Without
 * them the rows still seed; the summary line says how many images it found.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { runWithContext } from "@/lib/context";
import { createDb } from "@/lib/db";
import { getDatabaseDriver, getSqliteFile } from "@/lib/db-url";
import { newId } from "@/lib/id";
import { getLocalStorageDir, getStorageDriver } from "@/lib/storage/config";

import { seedFromSapo } from "./seed-sapo";

export const SEED_OPERATOR_EMAIL = "operator@the-greatness.local";

const main = async (): Promise<void> => {
  if (getDatabaseDriver() === "sqlite") {
    await fs.mkdir(path.dirname(path.resolve(getSqliteFile())), {
      recursive: true,
    });
  }

  const db = createDb();

  await runWithContext({ db, user: null, requestId: "seed" }, async () => {
    // Wipe only what the seed owns. Doing this by table rather than by a
    // marker column is fine because seeding is a development action against a
    // development database — the migrate runner is what guards a real one.
    await db.deleteFrom("product_media").execute();
    await db.deleteFrom("media_assets").execute();
    await db.deleteFrom("product_categories").execute();
    await db.deleteFrom("products").execute();
    await db.deleteFrom("categories").execute();

    const now = new Date();
    const operator = await db
      .selectFrom("users")
      .select("id")
      .where("email", "=", SEED_OPERATOR_EMAIL)
      .executeTakeFirst();

    if (!operator) {
      await db
        .insertInto("users")
        .values({
          id: newId(),
          email: SEED_OPERATOR_EMAIL,
          emailVerified: 1,
          name: "Seeded Operator",
          image: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    // Placeholder images used to be generated here; the catalogue's own
    // photographs replace them, and they only make sense for the local driver
    // — seeding 250 MB into a real Blob store is not something to do by
    // accident.
    const local = getStorageDriver() === "local";
    const storageRoot = local ? path.resolve(getLocalStorageDir()) : null;
    if (storageRoot) {
      // Both pre-Sapo layouts, cleared so a reseed does not leave the old
      // shape behind on a machine that ran an earlier seed.
      for (const stale of ["media", "products"]) {
        await fs.rm(path.join(storageRoot, stale), {
          recursive: true,
          force: true,
        });
      }
    }

    const result = await seedFromSapo(db, { storageRoot });

    console.log(
      `seeded: 1 operator (${SEED_OPERATOR_EMAIL}) · ${result.categories} categories · ` +
        `${result.products} products · ${result.links} category links · ${result.media} images`,
    );
    if (result.mediaMissing) {
      console.log(
        "no data/sapo/media — run `bun run fetch:sapo --images && bun run prepare:sapo-media` for the photographs.",
      );
    } else if (!local) {
      console.log("STORAGE_DRIVER is not `local`, so no images were written.");
    }
  });

  await db.destroy();
};

await main();
