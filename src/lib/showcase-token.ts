/**
 * The decisions behind showcase mode, with no I/O so they can be measured:
 * does a username/password pair match, and is a session token genuine.
 * `showcase.ts` is the cookie-and-env glue around these.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type ShowcaseCredentials = {
  readonly user: string;
  readonly password: string;
};

const safeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

/**
 * True when both halves match. Both are compared regardless of the first
 * result, so a wrong username costs the same time as a wrong password.
 */
export const credentialsMatch = (
  given: ShowcaseCredentials,
  expected: ShowcaseCredentials | null,
): boolean => {
  if (!expected) return false;
  const userOk = safeEqual(given.user, expected.user);
  const passOk = safeEqual(given.password, expected.password);
  return userOk && passOk;
};

const sign = (secret: string, value: string): string =>
  createHmac("sha256", secret).update(value).digest("base64url");

/** `user.mac` — the cookie value for a signed-in user. */
export const makeToken = (secret: string, user: string): string =>
  `${user}.${sign(secret, user)}`;

/**
 * The user a token names, or null when it was not signed with `secret` or
 * names someone other than `expectedUser`.
 */
export const verifyToken = (
  secret: string,
  token: string | undefined,
  expectedUser: string | undefined,
): string | null => {
  if (!token || !expectedUser) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const user = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!safeEqual(mac, sign(secret, user))) return null;
  if (!safeEqual(user, expectedUser)) return null;
  return user;
};
