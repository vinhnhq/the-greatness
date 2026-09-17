import "server-only";
import { redirect } from "next/navigation";

import { getCurrentUser } from "./auth";
import type { ContextUser } from "./context";
import { getShowcaseUser, isShowcase } from "./showcase";

/**
 * The gate for every signed-in surface.
 *
 * Called by the `(dashboard)` layout **and independently by every server
 * action**. That is not redundancy: a server action is its own HTTP endpoint,
 * invocable by anyone who can post to it, and the layout's gate never runs
 * for that request. An action that trusts the layout is an unauthenticated
 * write.
 *
 * Carved out of coverage — it is a thin wrapper over `next/navigation`'s
 * `redirect()` and `next/headers`; the E2E smoke exercises it for real.
 */
export const requireUser = async (): Promise<ContextUser> => {
  if (isShowcase()) {
    const showcaseUser = await getShowcaseUser();
    if (!showcaseUser) redirect("/sign-in");
    return showcaseUser;
  }
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
  };
};
