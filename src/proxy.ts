import { NextResponse, type NextRequest } from "next/server";

/**
 * Next 16's middleware (`proxy`, not `middleware`). One job: in showcase
 * mode (`APP_MODE=showcase`, see `lib/showcase.ts`) nothing but `/brand`
 * and sign-in is reachable, because every other page reads a database this
 * deployment does not have. Redirecting here means those pages never even
 * render, rather than rendering and throwing. Outside showcase mode this
 * passes everything through untouched.
 */
export function proxy(request: NextRequest) {
  if (process.env.APP_MODE !== "showcase") return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (pathname === "/brand" || pathname.startsWith("/brand/")) {
    return NextResponse.next();
  }
  if (pathname === "/sign-in") return NextResponse.next();
  return NextResponse.redirect(new URL("/brand", request.url));
}

export const config = {
  // Everything but Next's own assets and the static files under `public/`.
  matcher: ["/((?!_next/|favicon\\.ico|.*\\..*).*)"],
};
