import type { NextConfig } from "next";

// React's dev runtime uses eval() for callstack reconstruction; production
// React never does. This widens only the local CSP, never production.
const isDev = process.env.NODE_ENV !== "production";
const scriptSrcEval = isDev ? "'unsafe-eval' " : "";

// `blob:` in img-src/media-src is load-bearing here, not boilerplate: the
// attachments field renders object-URL previews of the optimized variant
// *before* it is uploaded anywhere (src/lib/media/).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' ${scriptSrcEval}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://lh3.googleusercontent.com",
      "media-src 'self' blob: https://*.public.blob.vercel-storage.com",
      // `https://vercel.com` is @vercel/blob/client's token-exchange API; the
      // storage host is where the PUT itself lands. Both are needed for any
      // client-direct upload.
      "connect-src 'self' https://vercel.com https://*.public.blob.vercel-storage.com",
      "frame-src https://accounts.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://accounts.google.com",
    ].join("; "),
  },
];

// The browser needs to know which storage driver is live and whether the dev
// sign-in bypass exists, but it cannot read `STORAGE_DRIVER` / `ALLOW_DEV_LOGIN`.
// Deriving the NEXT_PUBLIC_ twins here from the same values keeps one source of
// truth — a second variable in `.env` is a second thing to forget.
const publicEnv = {
  NEXT_PUBLIC_STORAGE_DRIVER:
    process.env.STORAGE_DRIVER ??
    (process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local"),
  NEXT_PUBLIC_APP_MODE: process.env.APP_MODE ?? "",
  NEXT_PUBLIC_ALLOW_DEV_LOGIN:
    process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_LOGIN === "1"
      ? "1"
      : "0",
};

const nextConfig: NextConfig = {
  // The E2E suite starts its own dev server on another port. Next allows only
  // one dev server per build directory, so without this, `bun run test:e2e`
  // fails outright whenever `bun run dev` happens to be running — an ambush
  // rather than a conflict, since the ports never collide.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  reactCompiler: true,
  env: publicEnv,
  // TypeScript 7's native compiler ships no JS API yet, so `next build` must
  // shell out to the project-local `tsc` CLI. Without this flag the build
  // refuses to run with typescript@7 installed.
  experimental: { useTypeScriptCli: true },
  // `/brand` reads the icon sprite and the framed thumbnails from disk at
  // request time. Next traces only what it can see statically, so on Vercel
  // the function bundle would ship without them and the page would render
  // an empty grid with no error. Named here, they travel with the function.
  outputFileTracingIncludes: {
    "/brand": [
      "./public/brand/category-icons.svg",
      "./data/sapo/categories.json",
    ],
    "/brand/thumbnails/[file]": ["./data/thumbnails/framed/**"],
  },
  images: {
    // Next 16 refuses a local image URL with a query string unless the path
    // is listed here. `/brand/**` carries `?v=<file version>` so a replaced
    // logo or a regenerated thumbnail is a new URL to the optimizer, which
    // otherwise serves the old bytes for its cache TTL. Listing anything
    // restricts every local image, so `/uploads/**` is named too.
    localPatterns: [
      { pathname: "/brand/**" },
      { pathname: "/uploads/**", search: "" },
    ],
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
