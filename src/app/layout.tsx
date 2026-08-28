import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { Providers } from "@/components/providers/providers";

import "./globals.css";

// Inter carries the `vietnamese` subset because product names in this
// catalogue are routinely Vietnamese; without it the browser falls back
// mid-string and the diacritics render a notch off the rest of the word.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "The Greatness",
    template: "%s · The Greatness",
  },
  description: "Product catalogue admin",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
