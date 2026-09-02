"use client";

/**
 * The two ways to look at the same 211 rows.
 *
 * **Taxonomy** is the working surface — the tree, with products in it. Its
 * default position is first because that is where the time goes: 697 of 832
 * products are filed nowhere, and filing them is the job this page exists for.
 *
 * **Categories** is the flat list, as Sapo itself shows it, and it is the CRUD
 * surface. The hierarchy deliberately does not appear there twice; what
 * replaces it is a path column, which is the one thing a flat list can carry
 * that Sapo's own cannot.
 *
 * The tab lives in `?tab=` so a view is linkable — but unlike `?category=` it
 * has **no server data behind it**, so it moves with
 * `window.history.replaceState` rather than `router.replace`. Next integrates
 * that with `useSearchParams` (see `docs/01-app/02-guides/single-page-applications.md`),
 * so the URL stays honest without paying a round-trip for a toggle.
 */

import { useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = ["taxonomy", "categories"] as const;
type TabValue = (typeof TABS)[number];

const isTab = (value: string | null): value is TabValue =>
  value !== null && (TABS as readonly string[]).includes(value);

export function CategoriesTabs({
  taxonomy,
  list,
  listCount,
}: {
  readonly taxonomy: React.ReactNode;
  readonly list: React.ReactNode;
  readonly listCount: number;
}) {
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: TabValue = isTab(raw) ? raw : "taxonomy";

  const select = (value: string) => {
    const next = new URLSearchParams(params);
    if (value === "taxonomy") next.delete("tab");
    else next.set("tab", value);
    const query = next.toString();
    window.history.replaceState(null, "", query === "" ? "?" : `?${query}`);
  };

  return (
    <Tabs value={tab} onValueChange={select} className="gap-6">
      <TabsList>
        <TabsTrigger value="taxonomy">Taxonomy</TabsTrigger>
        <TabsTrigger value="categories">
          Categories
          <span className="text-muted-foreground tabular-nums">
            {listCount}
          </span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="taxonomy">{taxonomy}</TabsContent>
      <TabsContent value="categories">{list}</TabsContent>
    </Tabs>
  );
}
