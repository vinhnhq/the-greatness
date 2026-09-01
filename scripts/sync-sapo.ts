/**
 * `bun run sync:sapo` — refresh the catalogue from `data/sapo/` in place.
 *
 * The safe counterpart to `bun run seed`, which wipes and reinserts. This
 * updates what Sapo owns and leaves alone what this app owns: the category
 * tree, the media library, and anything created here. Nothing is deleted —
 * a row that has gone from Sapo is reported for a person to act on.
 *
 * Run `bun run fetch:sapo` first; this reads the snapshot, not the network.
 *
 * The report is the point. A run that changed nothing and a run that rewrote
 * the catalogue must not look alike from the terminal.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import type { SapoCategory, SapoLink, SapoProduct } from "@/db/sync-sapo";
import { syncFromSapo } from "@/db/sync-sapo";
import { createDb } from "@/lib/db";
import { getDatabaseDriver } from "@/lib/db-url";

const DATA = path.join(import.meta.dirname, "..", "data", "sapo");

const readJson = async <T>(name: string): Promise<T> =>
  JSON.parse(await fs.readFile(path.join(DATA, name), "utf8")) as T;

const list = (label: string, names: readonly string[], limit = 5): void => {
  if (names.length === 0) return;
  const shown = names.slice(0, limit).join(", ");
  const more = names.length > limit ? `, +${names.length - limit} more` : "";
  console.log(`  ${label}: ${names.length} — ${shown}${more}`);
};

const main = async (): Promise<void> => {
  const db = createDb();
  try {
    console.log(`Syncing from data/sapo/ into ${getDatabaseDriver()}`);
    const [categories, products, links] = await Promise.all([
      readJson<SapoCategory[]>("categories.json"),
      readJson<SapoProduct[]>("products.json"),
      readJson<SapoLink[]>("product-categories.json"),
    ]);
    const report = await syncFromSapo(db, { categories, products, links });

    const { categories: c, products: p, links: l } = report;
    console.log(
      `\ncategories  +${c.added} added · ${c.updated} updated · ${c.unchanged} unchanged`,
    );
    list("unfiled (place these in the tree)", c.unfiled);
    list("gone from Sapo (not deleted)", c.vanished);

    console.log(
      `products    +${p.added} added · ${p.updated} updated · ${p.unchanged} unchanged`,
    );
    list("gone from Sapo (not deleted)", p.vanished);

    console.log(
      `links       +${l.added} added · ${l.removed} removed · ${l.keptLocal} kept (local categories)`,
    );

    const touched =
      c.added + c.updated + p.added + p.updated + l.added + l.removed;
    console.log(
      touched === 0
        ? "\nNothing changed."
        : `\nDone. ${touched} row(s) changed. The category tree and the media library were not touched.`,
    );
  } finally {
    await db.destroy();
  }
};

await main();
