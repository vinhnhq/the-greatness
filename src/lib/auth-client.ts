"use client";

/**
 * The browser half of better-auth — used only by the Google button on
 * `/sign-in`. Everything else reads the session on the server.
 */

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
