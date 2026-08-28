/**
 * Which storage driver the app picks, and from what.
 *
 * The rule worth protecting mirrors `db-url.ts`: a deployment that sets only
 * `BLOB_READ_WRITE_TOKEN` gets Blob without also having to remember
 * `STORAGE_DRIVER`. Getting that wrong means a production deploy writing
 * uploads to a container's filesystem — files that look saved and are gone
 * with the instance.
 *
 * This module exists at all because `env-server.ts` carries `server-only` and
 * threw the moment `bun run seed` imported it to find out where to write
 * placeholder images.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getLocalStorageDir, getStorageDriver } from "@/lib/storage/config";

const KEYS = [
  "STORAGE_DRIVER",
  "STORAGE_DIR",
  "BLOB_READ_WRITE_TOKEN",
] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("getStorageDriver", () => {
  it("defaults to local on a bare checkout", () => {
    expect(getStorageDriver()).toBe("local");
  });

  it("infers blob from the token alone", () => {
    // A Vercel project with the Blob integration sets exactly this and
    // nothing else.
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_xxx";
    expect(getStorageDriver()).toBe("blob");
  });

  it("lets an explicit driver override the inference", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_xxx";
    process.env.STORAGE_DRIVER = "local";
    expect(getStorageDriver()).toBe("local");
  });

  it.each(["LOCAL", " blob ", "Blob"])(
    "tolerates casing and whitespace (%s)",
    (value) => {
      process.env.STORAGE_DRIVER = value;
      expect(["local", "blob"]).toContain(getStorageDriver());
    },
  );

  it("throws on a driver it does not recognise, rather than guessing", () => {
    process.env.STORAGE_DRIVER = "s3";
    expect(() => getStorageDriver()).toThrow(/STORAGE_DRIVER/);
  });
});

describe("getLocalStorageDir", () => {
  it("defaults so a fresh clone needs no .env at all", () => {
    expect(getLocalStorageDir()).toBe(".data/uploads");
  });

  it("honours an override", () => {
    process.env.STORAGE_DIR = ".data/e2e-uploads";
    expect(getLocalStorageDir()).toBe(".data/e2e-uploads");
  });

  it("ignores a blank override rather than writing to ''", () => {
    process.env.STORAGE_DIR = "   ";
    expect(getLocalStorageDir()).toBe(".data/uploads");
  });
});
