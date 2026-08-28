/**
 * Which driver the app picks, and from what.
 *
 * The rule worth protecting: a deployment that sets only `DATABASE_URL` gets
 * Postgres without also having to remember `DATABASE_DRIVER`. Getting that
 * wrong means a production deploy silently writing to a SQLite file inside an
 * ephemeral container — data that looks saved and is gone on the next request.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getDatabaseDriver, getPostgresUrl, getSqliteFile } from "@/lib/db-url";

const KEYS = ["DATABASE_DRIVER", "DATABASE_URL", "DATABASE_FILE"] as const;
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

describe("getDatabaseDriver", () => {
  it("defaults to sqlite on a bare checkout", () => {
    expect(getDatabaseDriver()).toBe("sqlite");
  });

  it("infers postgres from DATABASE_URL alone", () => {
    // A Vercel project with a Neon integration sets exactly this and nothing
    // else. Defaulting to sqlite there writes to a container that is about to
    // disappear.
    process.env.DATABASE_URL = "postgresql://user:pw@ep-x.neon.tech/main";
    expect(getDatabaseDriver()).toBe("postgres");
  });

  it("lets an explicit driver override the inference", () => {
    process.env.DATABASE_URL = "postgresql://user:pw@ep-x.neon.tech/main";
    process.env.DATABASE_DRIVER = "sqlite";
    expect(getDatabaseDriver()).toBe("sqlite");
  });

  it.each(["SQLITE", " postgres ", "Postgres"])(
    "tolerates casing and whitespace (%s)",
    (value) => {
      process.env.DATABASE_DRIVER = value;
      expect(["sqlite", "postgres"]).toContain(getDatabaseDriver());
    },
  );

  it("throws on a driver it does not recognise, rather than guessing", () => {
    process.env.DATABASE_DRIVER = "mysql";
    expect(() => getDatabaseDriver()).toThrow(/DATABASE_DRIVER/);
  });
});

describe("getSqliteFile", () => {
  it("defaults so a fresh clone needs no .env at all", () => {
    expect(getSqliteFile()).toBe(".data/the-greatness.db");
  });

  it("honours an override", () => {
    process.env.DATABASE_FILE = ".data/e2e.db";
    expect(getSqliteFile()).toBe(".data/e2e.db");
  });

  it("ignores a blank override rather than opening a file called ''", () => {
    process.env.DATABASE_FILE = "   ";
    expect(getSqliteFile()).toBe(".data/the-greatness.db");
  });
});

describe("getPostgresUrl", () => {
  it("returns the url when set", () => {
    process.env.DATABASE_URL = "postgresql://user:pw@ep-x.neon.tech/main";
    expect(getPostgresUrl()).toContain("neon.tech");
  });

  it("names the fix in its error rather than failing bare", () => {
    expect(() => getPostgresUrl()).toThrow(/DATABASE_URL is not set/);
  });
});
