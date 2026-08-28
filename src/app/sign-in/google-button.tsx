"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/**
 * Google sign-in. The label never changes while pending — only the state and
 * the announcement do, so the button does not resize under the cursor mid-click.
 */
export function GoogleButton() {
  const [pending, setPending] = useState(false);

  return (
    <>
      <Button
        className="w-full"
        aria-busy={pending}
        disabled={pending}
        onClick={() => {
          setPending(true);
          void authClient.signIn
            .social({ provider: "google", callbackURL: "/products" })
            .catch(() => setPending(false));
        }}
      >
        Continue with Google
      </Button>
      <span aria-live="polite" className="sr-only">
        {pending ? "Redirecting to Google" : ""}
      </span>
    </>
  );
}
