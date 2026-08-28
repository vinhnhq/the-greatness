"use client";

/**
 * The three app-level providers every surface depends on, mounted once in
 * the root layout:
 *
 *   - `ThemeProvider` — class-based dark mode. `disableTransitionOnChange`
 *     stops every themed element animating its colour at once on a toggle,
 *     which reads as a flash rather than a transition.
 *   - `TooltipProvider` — the radix-maia components assume one is present
 *     and render nothing useful without it.
 *   - `Toaster` — server actions report their outcome through it, so it has
 *     to outlive any page that triggers one.
 */

import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <TooltipProvider>{children}</TooltipProvider>
      <Toaster richColors closeButton />
    </ThemeProvider>
  );
}
