/**
 * better-auth wiring.
 *
 * Two sign-in paths, and only one of them is real:
 *
 *   - **Google**, registered only when both credentials exist. Registering it
 *     unconditionally and casting `process.env.X as string` makes better-auth
 *     log a "clientId or clientSecret missing" warning on every module load in
 *     local dev and in tests, which trains everyone to ignore its warnings.
 *   - **The dev bypass** (`setSession`), which writes a session row directly.
 *     It throws in production and is the local path when Google is not wired.
 *
 * This module `import`s `db` directly, which the rule in `context.ts` forbids
 * everywhere else. It is the single accepted exception: the Kysely adapter
 * needs a connection at construction time, before any request exists.
 */

import { kyselyAdapter } from "@better-auth/kysely-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { cookies, headers } from "next/headers";
import { cache } from "react";

import { db } from "./db";
import { devLoginEnabled, env } from "./env-server";
import { newId } from "./id";

const authEnv = env();

/**
 * Whether session cookies carry `Secure` (and the `__Secure-` name prefix).
 *
 * True only on real https. Browsers — Safari strictly — drop a `Secure`
 * cookie sent over http, so getting this wrong on `http://localhost` makes
 * sign-in appear to succeed and then silently not persist. One function owns
 * both the name and the attribute so they cannot disagree.
 */
const secureCookies = (): boolean =>
  authEnv.BETTER_AUTH_URL?.startsWith("https://") === true ||
  Boolean(authEnv.VERCEL_URL);

export const getSessionCookieName = (): string =>
  secureCookies()
    ? "__Secure-better-auth.session_token"
    : "better-auth.session_token";

export const auth = betterAuth({
  baseURL: authEnv.BETTER_AUTH_URL ?? {
    // A host missing from this list does not degrade gracefully: the base URL
    // falls back, the request's own origin then fails better-auth's origin
    // check, and social sign-in answers 403 "Invalid origin" before Google is
    // ever contacted. Every domain this app is served from belongs here.
    allowedHosts: ["*.vercel.app", "localhost:3000", "localhost:3210"],
    fallback: "http://localhost:3000",
    protocol: "auto",
  },
  secret: authEnv.BETTER_AUTH_SECRET ?? "dev-only-insecure-better-auth-secret",

  database: kyselyAdapter(db, { type: "postgres" }),
  plugins: [nextCookies()],

  user: { modelName: "users" },
  session: {
    modelName: "sessions",
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  account: {
    modelName: "accounts",
    accountLinking: { enabled: true, trustedProviders: ["google"] },
  },
  verification: { modelName: "verifications" },

  advanced: {
    database: {
      // Every model gets an app-minted uuid v7. Leaving this to the database
      // would insert NULL — no table here has an id default, deliberately
      // (see `lib/id.ts`).
      generateId: () => newId(),
    },
  },

  ...(authEnv.GOOGLE_CLIENT_ID && authEnv.GOOGLE_CLIENT_SECRET
    ? {
        socialProviders: {
          google: {
            clientId: authEnv.GOOGLE_CLIENT_ID,
            clientSecret: authEnv.GOOGLE_CLIENT_SECRET,
          },
        },
      }
    : {}),

  onAPIError: { errorURL: "/sign-in" },
});

/**
 * The session for the current request.
 *
 * `cache()`-wrapped so the layout gate, a server action and a page guard in
 * one render share a single round-trip instead of each hitting better-auth
 * and then the database.
 */
export const getSession = cache(
  async (): Promise<{ userId: string } | null> => {
    try {
      const session = await auth.api.getSession({ headers: await headers() });
      const userId = session?.user.id;
      if (typeof userId === "string" && userId.length > 0) return { userId };
    } catch {
      // better-auth throws for sessions minted by `setSession()` — they have
      // no linked account row. Fall through to the direct lookup.
    }

    const token = (await cookies()).get(getSessionCookieName())?.value;
    if (!token) return null;

    const row = await db
      .selectFrom("sessions")
      .select(["userId", "expiresAt"])
      .where("token", "=", token)
      .executeTakeFirst()
      .catch(() => null);

    if (!row) return null;
    // SQLite hands back an ISO string where Postgres hands back a Date.
    if (new Date(row.expiresAt) < new Date()) return null;
    return { userId: row.userId };
  },
);

export const getCurrentUser = async () => {
  const session = await getSession();
  if (!session) return null;
  return (
    (await db
      .selectFrom("users")
      .selectAll()
      .where("id", "=", session.userId)
      .executeTakeFirst()) ?? null
  );
};

/**
 * The dev-only bypass: insert a session row and set the cookie, with no OAuth
 * round-trip. Used by `/sign-in`'s operator picker and by the E2E suite.
 *
 * `devLoginEnabled()` is checked here **and** at the calling route. Either
 * alone would be sufficient; both is deliberate, because this function is the
 * one place in the codebase that hands out a session for free.
 */
export const setSession = async (userId: string): Promise<void> => {
  if (!devLoginEnabled()) {
    throw new Error(
      "setSession() is dev-only. Set ALLOW_DEV_LOGIN=1 on a non-production build to enable it.",
    );
  }

  const token = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  await db
    .insertInto("sessions")
    .values({
      id: newId(),
      userId,
      token,
      expiresAt,
      ipAddress: null,
      userAgent: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  (await cookies()).set(getSessionCookieName(), token, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
};

export const clearSession = async (): Promise<void> => {
  const jar = await cookies();
  const name = getSessionCookieName();
  const token = jar.get(name)?.value;

  if (token) {
    await db
      .deleteFrom("sessions")
      .where("token", "=", token)
      .execute()
      .catch(() => {
        // The cookie is deleted below regardless — a stale row expires on its
        // own, and failing the sign-out over it would strand the user.
      });
  }
  jar.delete(name);
};
