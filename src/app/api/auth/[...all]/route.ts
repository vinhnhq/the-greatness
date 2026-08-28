/**
 * better-auth's own endpoints (`/api/auth/**`) — the OAuth callback lands here.
 * Present regardless of whether Google is configured; with no provider
 * registered, the social routes simply have nothing to hand off to.
 */

import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
