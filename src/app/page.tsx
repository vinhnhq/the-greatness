import { redirect } from "next/navigation";

/**
 * There is no marketing surface — this is a back office. `/` goes to the
 * product list, and the `(dashboard)` layout redirects to `/sign-in` from
 * there when there is no session.
 */
export default function RootPage() {
  redirect("/products");
}
