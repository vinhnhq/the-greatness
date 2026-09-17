import "server-only";
import { cookies } from "next/headers";

import type { ContextUser } from "./context";
import { env } from "./env-server";
import { credentialsMatch, makeToken, verifyToken } from "./showcase-token";

/**
 * Showcase mode — the app with no database and no Blob behind it.
 *
 * `APP_MODE=showcase` deploys `/brand` alone, gated by one username and
 * password from the environment, so the brand assets can be reviewed on a
 * real URL before Neon and Blob have ever been provisioned (backlog N.3).
 * Everything that reads a repository is unreachable: `proxy.ts` sends every
 * other path to `/brand`, and the sidebar lists nothing else.
 *
 * The session is a cookie carrying the username and an HMAC of it under
 * `BETTER_AUTH_SECRET`; no session table, because there is no table. This is
 * a gate for a review URL, not an identity system — when the real deploy
 * happens, better-auth takes over and this module stays unused. The
 * decisions live in `showcase-token.ts`, where they are unit-tested; this
 * file is the cookie-and-env glue and is carved out of coverage like
 * `auth.ts`.
 */

export const SHOWCASE_COOKIE = "showcase-session";
const SESSION_DAYS = 30;

export const isShowcase = (): boolean => env().APP_MODE === "showcase";

const secret = (): string => {
  const s = env().BETTER_AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error("Showcase mode needs BETTER_AUTH_SECRET (16+ bytes).");
  }
  return s;
};

const expected = () => {
  const e = env();
  return e.ADMIN_USER && e.ADMIN_PASSWORD
    ? { user: e.ADMIN_USER, password: e.ADMIN_PASSWORD }
    : null;
};

export const checkCredentials = (user: string, password: string): boolean =>
  credentialsMatch({ user, password }, expected());

export const setShowcaseSession = async (user: string): Promise<void> => {
  const jar = await cookies();
  jar.set(SHOWCASE_COOKIE, makeToken(secret(), user), {
    httpOnly: true,
    sameSite: "lax",
    secure: env().NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
};

export const clearShowcaseSession = async (): Promise<void> => {
  const jar = await cookies();
  jar.delete(SHOWCASE_COOKIE);
};

/** The signed-in showcase user, or null. */
export const getShowcaseUser = async (): Promise<ContextUser | null> => {
  const jar = await cookies();
  const user = verifyToken(
    secret(),
    jar.get(SHOWCASE_COOKIE)?.value,
    env().ADMIN_USER,
  );
  return user ? { id: "showcase", email: user, name: user, image: null } : null;
};
