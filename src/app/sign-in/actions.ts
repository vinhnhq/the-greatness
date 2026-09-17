"use server";

import { redirect } from "next/navigation";

import { setSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { devLoginEnabled } from "@/lib/env-server";
import {
  checkCredentials,
  isShowcase,
  setShowcaseSession,
} from "@/lib/showcase";

/**
 * The development sign-in.
 *
 * Gated **twice**: here, and again inside `setSession()`. A server action is
 * its own endpoint — anyone who can POST to it reaches this code without ever
 * seeing the page that decided whether to render the button. Either check
 * alone would suffice; both is deliberate for the one action in the codebase
 * that hands out a session for free.
 *
 * The user id is checked against the database rather than trusted, so a
 * crafted POST cannot mint a session for an id that does not exist.
 */
export async function devSignIn(formData: FormData): Promise<void> {
  if (!devLoginEnabled()) redirect("/sign-in");

  const userId = formData.get("userId");
  if (typeof userId !== "string" || userId === "") redirect("/sign-in");

  const user = await db
    .selectFrom("users")
    .select("id")
    .where("id", "=", userId)
    .executeTakeFirst();
  if (!user) redirect("/sign-in");

  await setSession(user.id);
  redirect("/products");
}

/**
 * The showcase sign-in: one username and password from the environment.
 * A wrong pair lands back on the page with `?error=1`; the page says so.
 */
export async function showcaseSignIn(formData: FormData): Promise<void> {
  if (!isShowcase()) redirect("/sign-in");
  const user = formData.get("user");
  const password = formData.get("password");
  if (
    typeof user !== "string" ||
    typeof password !== "string" ||
    !checkCredentials(user, password)
  ) {
    redirect("/sign-in?error=1");
  }
  await setShowcaseSession(user);
  redirect("/brand");
}
