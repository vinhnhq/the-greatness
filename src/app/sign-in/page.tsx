/**
 * Sign in.
 *
 * Two paths, and which ones appear is decided on the server:
 *
 *   - **Google**, shown when both OAuth credentials are configured.
 *   - **The local bypass**, shown only when `devLoginEnabled()` — a picker of
 *     the operators already in the database. It exists so a fresh clone can be
 *     used in the minute after `bun install` without registering an OAuth
 *     client, and so the E2E suite can sign in without driving Google's UI.
 *
 * When neither is available the page says so plainly rather than rendering a
 * form that cannot work.
 */

import { Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { db } from "@/lib/db";
import { devLoginEnabled, env } from "@/lib/env-server";
import { isShowcase } from "@/lib/showcase";

import { devSignIn, showcaseSignIn } from "./actions";
import { GoogleButton } from "./google-button";

export const metadata = { title: "Sign in" };

/**
 * Dynamic, not prerendered. The operator picker reads the database, and a
 * static build would bake whichever rows existed at build time into the page
 * — on a preview deploy with the bypass enabled, that is a sign-in list
 * frozen at deploy time. Production renders no picker at all, so nothing is
 * lost by never caching this.
 */
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  const e = env();
  const showcase = isShowcase();
  const failed = (await searchParams).error === "1";
  const googleEnabled =
    !showcase && Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
  const bypassEnabled = !showcase && devLoginEnabled(e);

  const operators = bypassEnabled
    ? await db
        .selectFrom("users")
        .select(["id", "email", "name"])
        .orderBy("createdAt", "asc")
        .orderBy("id", "asc")
        .limit(5)
        .execute()
        .catch(() => [])
    : [];

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-lg bg-brand text-brand-foreground">
            <Package className="size-5" />
          </div>
          <CardTitle>The Greatness</CardTitle>
          <CardDescription>Sign in to manage the catalogue.</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {showcase && (
            <form action={showcaseSignIn} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user">Username</Label>
                <Input id="user" name="user" autoComplete="username" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              {failed && (
                <p className="text-sm text-destructive" role="alert">
                  That username and password do not match.
                </p>
              )}
              <Button type="submit" className="w-full">
                Sign in
              </Button>
            </form>
          )}

          {googleEnabled && <GoogleButton />}

          {googleEnabled && bypassEnabled && (
            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or, locally</span>
              <Separator className="flex-1" />
            </div>
          )}

          {bypassEnabled && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                Development sign-in — no password, disabled in production.
              </p>
              {operators.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  No operators yet. Run{" "}
                  <code className="font-mono text-xs">bun run db:local</code> to
                  seed one.
                </p>
              ) : (
                operators.map((operator) => (
                  <form key={operator.id} action={devSignIn}>
                    <input type="hidden" name="userId" value={operator.id} />
                    <Button
                      type="submit"
                      variant="secondary"
                      className="w-full justify-start"
                    >
                      <span className="truncate">
                        {operator.name ?? operator.email}
                      </span>
                    </Button>
                  </form>
                ))
              )}
            </div>
          )}

          {!showcase && !googleEnabled && !bypassEnabled && (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              No sign-in method is configured. Set{" "}
              <code className="font-mono text-xs">GOOGLE_CLIENT_ID</code> and{" "}
              <code className="font-mono text-xs">GOOGLE_CLIENT_SECRET</code>,
              or <code className="font-mono text-xs">ALLOW_DEV_LOGIN=1</code> on
              a non-production build.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
