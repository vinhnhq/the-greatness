/**
 * The gate for every signed-in surface.
 *
 * A server component, so the session is read once during the render rather
 * than in an effect after paint — which would mean the dashboard briefly
 * rendering for someone who is not signed in.
 *
 * This gate is **not** what protects the data. Every server action calls
 * `requireUser()` itself, because an action is its own endpoint and this
 * layout never runs for it.
 */

import { DashboardShell } from "@/components/app-shell/dashboard-shell";
import { requireUser } from "@/lib/require-user";

import { signOut } from "./actions";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <DashboardShell
      user={{ name: user.name, email: user.email, image: user.image }}
      signOut={signOut}
    >
      {children}
    </DashboardShell>
  );
}
