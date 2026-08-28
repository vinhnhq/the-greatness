import "server-only";
import { z } from "zod";

/**
 * Server-side environment, validated once.
 *
 * `import "server-only"` means a client component that imports this fails the
 * build rather than leaking a secret into a bundle. Anything the browser
 * legitimately needs goes through `env-client.ts` and a `NEXT_PUBLIC_` name.
 *
 * Parsed **lazily**, inside `env()` rather than at module scope: a top-level
 * `.parse()` runs during `next build`, where the deployment's variables are
 * not necessarily present, and turns a missing optional key into a failed
 * build instead of a failed request.
 */

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  DATABASE_DRIVER: z.enum(["sqlite", "postgres"]).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_FILE: z.string().min(1).optional(),

  STORAGE_DRIVER: z.enum(["local", "blob"]).optional(),
  STORAGE_DIR: z.string().min(1).optional(),
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),

  BETTER_AUTH_SECRET: z.string().min(1).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

  ALLOW_DEV_LOGIN: z.string().optional(),
  VERCEL_URL: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export const env = (): ServerEnv => {
  if (!cached) cached = schema.parse(process.env);
  return cached;
};

/**
 * Whether the passwordless sign-in bypass is available.
 *
 * Two independent conditions, both required. `ALLOW_DEV_LOGIN=1` is the
 * opt-in; `NODE_ENV !== "production"` is the backstop, and it is the one that
 * matters — a production deployment that inherits the variable from a copied
 * env file still cannot mint a session. Any single check here would be one
 * misconfiguration away from an open door.
 */
export const devLoginEnabled = (e = env()): boolean =>
  e.NODE_ENV !== "production" && e.ALLOW_DEV_LOGIN === "1";

export const storageDriverName = (e = env()): "local" | "blob" =>
  e.STORAGE_DRIVER ?? (e.BLOB_READ_WRITE_TOKEN ? "blob" : "local");

/** Where the local driver writes. Relative paths resolve from the project
 * root, which is the working directory for both `next dev` and a build. */
export const localStorageDir = (e = env()): string =>
  e.STORAGE_DIR ?? ".data/uploads";
