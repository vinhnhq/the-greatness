"use client";

/**
 * The signed-in chrome: a collapsible sidebar, a header carrying the
 * breadcrumb, the theme toggle and the user menu.
 *
 * A client component that takes only serializable display data, so the layout
 * above it stays a server component and the session read happens once, on the
 * server, rather than in a `useEffect` after paint.
 *
 * The breadcrumb is derived from the pathname rather than passed down. Passing
 * it would mean every page remembering to, and a page that forgot would render
 * a header that silently described the previous one.
 */

import {
  Images,
  LayoutGrid,
  LogOut,
  Package,
  Palette,
  GitCompare,
  Tags,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

import {
  BreadcrumbTitleProvider,
  useBreadcrumbTitle,
} from "@/components/app-shell/breadcrumb-title";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { isId } from "@/lib/id";

const NAV = [
  { href: "/products", label: "Products", icon: Package },
  { href: "/gallery", label: "Gallery", icon: Images },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/reconcile", label: "Reconcile", icon: GitCompare },
  { href: "/brand", label: "Brand", icon: Palette },
] as const;

export type ShellUser = {
  readonly name: string | null;
  readonly email: string;
  readonly image: string | null;
};

/**
 * `/products/<uuid>` → the crumbs to show.
 *
 * The last crumb prefers the title the page announced (`BreadcrumbTitle`).
 * Failing that, an id-shaped segment falls back to a readable word rather
 * than printing 36 characters of hex at someone — which is exactly what this
 * rendered before it was looked at in a browser.
 */
const crumbsFor = (
  pathname: string,
  currentTitle: string | undefined,
): readonly { readonly href: string; readonly label: string }[] => {
  const segments = pathname.split("/").filter(Boolean);
  return segments.map((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join("/")}`;
    const isLast = index === segments.length - 1;
    const fallback = isId(segment)
      ? "Details"
      : segment.charAt(0).toUpperCase() + segment.slice(1);
    return { href, label: isLast && currentTitle ? currentTitle : fallback };
  });
};

export function DashboardShell(props: {
  readonly user: ShellUser;
  readonly signOut: () => Promise<void>;
  readonly children: React.ReactNode;
}) {
  // The provider has to sit ABOVE the header that reads the title, and above
  // `children`, which is what sets it.
  return (
    <BreadcrumbTitleProvider>
      <Shell {...props} />
    </BreadcrumbTitleProvider>
  );
}

function Shell({
  user,
  signOut,
  children,
}: {
  readonly user: ShellUser;
  readonly signOut: () => Promise<void>;
  readonly children: React.ReactNode;
}) {
  const pathname = usePathname();
  const crumbs = crumbsFor(pathname, useBreadcrumbTitle());
  const initials = (user.name ?? user.email).slice(0, 2).toUpperCase();

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          {/* A menu button, not a bare flex row: it is the one primitive
              that knows how to collapse to the icon rail — the row kept its
              padding and squeezed the mark to 31×44 beside 32×32 items. */}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link href="/products" aria-label="The Greatness">
                  {/* The one brand surface in the chrome (ADR-0005). */}
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand text-brand-foreground">
                    <LayoutGrid className="size-4" />
                  </div>
                  <span className="truncate font-semibold">The Greatness</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              {/* Named so it is distinguishable from the breadcrumb, which
                  links to the same places. */}
              <SidebarMenu aria-label="Sections">
                {NAV.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith(item.href)}
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        <item.icon className="size-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <SidebarInset>
        {/* Solid, not blurred: a translucent header over a scrolling photo
            grid shows the photos through it as a smear that reads as a
            rendering fault, and `prefers-reduced-transparency` wants solid
            anyway. */}
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center border-b bg-background px-3 sm:px-4">
          {/* `min-w-0` lets the breadcrumb truncate instead of pushing the
              theme and account controls off a narrow screen. */}
          <div className="mx-auto flex w-full min-w-0 max-w-[120rem] items-center gap-2">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mr-1 h-4" />
            <Breadcrumb className="min-w-0">
              <BreadcrumbList className="flex-nowrap">
                {crumbs.map((crumb, index) => (
                  <Fragment key={crumb.href}>
                    {index > 0 && (
                      <BreadcrumbSeparator
                        className={
                          index < crumbs.length - 1 ? "" : "hidden sm:block"
                        }
                      />
                    )}
                    <BreadcrumbItem
                      className={
                        index === crumbs.length - 1
                          ? "min-w-0"
                          : "hidden sm:flex"
                      }
                    >
                      {index === crumbs.length - 1 ? (
                        <BreadcrumbPage className="truncate">
                          {crumb.label}
                        </BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <Link href={crumb.href}>{crumb.label}</Link>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>

            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Account"
                    className="rounded-full"
                  >
                    <Avatar className="size-7">
                      {user.image && <AvatarImage src={user.image} alt="" />}
                      <AvatarFallback className="text-xs">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="truncate text-sm font-medium">
                      {user.name ?? "Operator"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <form action={signOut}>
                    <DropdownMenuItem asChild>
                      <button type="submit" className="w-full cursor-pointer">
                        <LogOut className="size-4" /> Sign out
                      </button>
                    </DropdownMenuItem>
                  </form>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* A `div`, not a `main`: `SidebarInset` already renders the main
            landmark, and nesting a second one is invalid HTML — a screen
            reader offers two "main" landmarks and neither is the page.
            Padding only; the width belongs to each page's `PageContainer`,
            because a table and a photo grid want different answers. */}
        <div className="flex flex-1 flex-col px-4 py-4 sm:px-6 sm:py-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
