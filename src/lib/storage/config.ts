/**
 * Where files go, resolvable from **any** caller.
 *
 * The twin of `db-url.ts`, and it exists for the same reason: `env-server.ts`
 * carries `import "server-only"`, which throws the moment a standalone script
 * imports it. `bun run seed` writes placeholder images and so needs to know
 * the storage driver — it hit that throw, which is what moved these two
 * readers out here.
 *
 * `env-server.ts` delegates to this rather than duplicating it, so the Next
 * runtime and the CLI cannot disagree about which driver is live.
 */

export type StorageDriverName = "local" | "blob";

const DEFAULT_LOCAL_DIR = ".data/uploads";

/**
 * A `BLOB_READ_WRITE_TOKEN` with no explicit driver is unambiguous intent —
 * which is how a Vercel project with the Blob integration does the right
 * thing without a second variable, exactly as `DATABASE_URL` does.
 */
export const getStorageDriver = (): StorageDriverName => {
  const raw = process.env.STORAGE_DRIVER?.trim().toLowerCase();
  if (raw === "local" || raw === "blob") return raw;
  if (raw === undefined || raw === "") {
    return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local";
  }
  throw new Error(
    `STORAGE_DRIVER must be "local" or "blob"; got ${JSON.stringify(raw)}.`,
  );
};

/** Where the local driver writes. A relative path resolves from the project
 * root, which is the working directory for `next dev`, a build and the CLI
 * scripts alike. */
export const getLocalStorageDir = (): string =>
  process.env.STORAGE_DIR?.trim() || DEFAULT_LOCAL_DIR;
