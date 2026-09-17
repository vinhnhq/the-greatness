/**
 * `/brand` — every image and icon in use, on one page, to review.
 *
 * The storefront, the thumbnails and the admin each hold a piece of the
 * brand and none of them shows the whole: the category sprite lives in a
 * theme snippet, the partner logos in a tools folder, the storefront logo on
 * a CDN. This page is the one place they sit side by side, at the sizes they
 * are used at, so a wrong stroke weight or a low-resolution logo is seen
 * before it ships rather than after.
 *
 * Read-only by design. The files are static under `public/brand/`; the only
 * live read is the category names, so an icon whose slug no longer matches a
 * category is visibly orphaned (it shows its slug, marked) instead of quietly
 * carrying a stale label.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import Image from "next/image";

import { PageContainer } from "@/components/app-shell/page-container";
import { Badge } from "@/components/ui/badge";
import { dbCategoryRepo } from "@/lib/domain/categories/repository";
import { cn } from "@/lib/utils";

import {
  CHILD_ICON_SLUGS,
  ICON_SPRITE,
  type LogoQuality,
  OWN_MARKS,
  PARTNER_LOGOS,
  ROOT_ICON_SLUGS,
  SERVICE_ICONS,
} from "./assets";

import "./brand.css";
import { listFramed } from "./framed";

export const metadata = { title: "Brand" };

const QUALITY: Record<LogoQuality, { label: string; className: string }> = {
  vector: { label: "vector", className: "bg-success/10 text-success" },
  good: { label: "good", className: "bg-secondary text-secondary-foreground" },
  replace: { label: "replace", className: "bg-warning/10 text-warning" },
};

function Section({
  title,
  lead,
  children,
}: {
  readonly title: string;
  readonly lead: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{lead}</p>
      </div>
      {children}
    </section>
  );
}

function SpriteIcon({
  id,
  size,
  order = 0,
  className,
}: {
  readonly id: string;
  readonly size: number;
  /** Position in its row; the theme staggers tiles by 80 ms each. */
  readonly order?: number;
  readonly className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("wolf-ic wolf-draw", className)}
      style={{ "--t": `${order * 0.08}s` } as React.CSSProperties}
    >
      <use href={`#${id}`} />
    </svg>
  );
}

function IconGrid({
  slugs,
  names,
  size,
}: {
  readonly slugs: readonly string[];
  readonly names: ReadonlyMap<string, string>;
  readonly size: number;
}) {
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
      {slugs.map((slug, index) => {
        const name = names.get(slug);
        return (
          <li
            key={slug}
            className="flex flex-col items-center gap-2 rounded-md border p-3 text-center"
          >
            <SpriteIcon id={`cat-${slug}`} size={size} order={index} />
            {name ? (
              <span className="text-xs leading-tight">{name}</span>
            ) : (
              <span className="text-xs leading-tight text-warning">
                {slug}
                <br />
                no category
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default async function BrandPage() {
  const [categories, framed, sprite] = await Promise.all([
    dbCategoryRepo.list(),
    listFramed(),
    // Inlined rather than referenced, so the draw-on CSS can reach the
    // symbols (see brand.css). The file is ours and static; no user content.
    readFile(path.join(process.cwd(), "public", ICON_SPRITE), "utf8"),
  ]);
  const names = new Map(categories.map((c) => [c.slug, c.name]));
  const orphaned = [...ROOT_ICON_SLUGS, ...CHILD_ICON_SLUGS].filter(
    (slug) => !names.has(slug),
  ).length;

  return (
    <PageContainer>
      <div
        aria-hidden="true"
        className="absolute size-0 overflow-hidden"
        dangerouslySetInnerHTML={{ __html: sprite }}
      />
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Brand</h1>
        <p className="text-sm text-muted-foreground">
          Every image and icon in use, at the size it is used at. Read-only; the
          files live in <code>public/brand/</code>.
        </p>
      </div>

      <Section
        title="Our marks"
        lead="The storefront still carries the orange export; a new one is out of scope until it exists."
      >
        <ul className="grid gap-3 sm:grid-cols-3">
          {OWN_MARKS.map((mark) => (
            <li
              key={mark.src}
              className="flex flex-col gap-2 rounded-md border p-3"
            >
              <div className="flex h-24 items-center justify-center rounded bg-white p-3">
                <Image
                  src={mark.src}
                  alt={mark.name}
                  width={240}
                  height={72}
                  className="h-auto max-h-full w-auto max-w-full object-contain"
                />
              </div>
              <div className="text-sm font-medium">{mark.name}</div>
              <div className="text-xs text-muted-foreground">
                {mark.where} · {mark.size}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Partner logos"
        lead="Composed into the product thumbnails top-left. Two are placeholders until the distributor sends a vector."
      >
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PARTNER_LOGOS.map((logo) => (
            <li
              key={logo.key}
              className="flex flex-col gap-2 rounded-md border p-3"
            >
              <div className="flex h-20 items-center justify-center rounded bg-white p-3">
                <Image
                  src={logo.src}
                  alt={logo.name}
                  width={200}
                  height={60}
                  className="h-auto max-h-full w-auto max-w-full object-contain"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{logo.name}</span>
                <Badge className={QUALITY[logo.quality].className}>
                  {QUALITY[logo.quality].label}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {logo.source}
                {logo.note ? ` — ${logo.note}` : null}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Category icons"
        lead={`One 24 px stroke sprite, ${ROOT_ICON_SLUGS.length} roots at 40 px on the homepage and ${CHILD_ICON_SLUGS.length} level-2 at 64 px on collection strips. Level 3 never gets one.${orphaned ? ` ${orphaned} icon${orphaned === 1 ? "" : "s"} no longer match a category.` : ""}`}
      >
        <h3 className="text-sm font-medium">Roots · 40 px</h3>
        <IconGrid slugs={ROOT_ICON_SLUGS} names={names} size={40} />
        <h3 className="text-sm font-medium">Level 2 · 64 px</h3>
        <IconGrid slugs={CHILD_ICON_SLUGS} names={names} size={64} />
        <h3 className="text-sm font-medium">Fallback and services · 40 px</h3>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          <li className="flex flex-col items-center gap-2 rounded-md border p-3 text-center">
            <SpriteIcon id="cat-default" size={40} />
            <span className="text-xs">
              cat-default
              <br />
              <span className="text-muted-foreground">
                drawn at 35% where it stands in
              </span>
            </span>
          </li>
          {SERVICE_ICONS.map((icon, index) => (
            <li
              key={icon.id}
              className="flex flex-col items-center gap-2 rounded-md border p-3 text-center"
            >
              <SpriteIcon id={icon.id} size={40} order={index + 1} />
              <span className="text-xs">{icon.label}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Category images"
        lead={`The same ${ROOT_ICON_SLUGS.length + CHILD_ICON_SLUGS.length} icons exported as 640 px transparent PNGs, ink stroke 1.15, for Sapo's collection-image field, which takes no SVG. In public/brand/category-images/.`}
      >
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12">
          {[...ROOT_ICON_SLUGS, ...CHILD_ICON_SLUGS].map((slug) => (
            <li key={slug} className="rounded-md border bg-white p-2">
              <Image
                src={`/brand/category-images/${slug}.png`}
                alt={names.get(slug) ?? slug}
                title={names.get(slug) ?? slug}
                width={96}
                height={96}
                className="w-full"
              />
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Product thumbnails"
        lead={`Variant G of the frame: brand top-left, our name top-right, no border, because the storefront card draws its own and floats buttons over the bottom fifth. The whole batch, ${framed.length} photos, from data/thumbnails/framed/.`}
      >
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {framed.map((file) => {
            const sku = file.replace(/\.png$/i, "");
            return (
              <li key={file} className="flex flex-col gap-1">
                <div className="overflow-hidden rounded-md border bg-white">
                  <Image
                    src={`/brand/thumbnails/${encodeURIComponent(file)}`}
                    alt={sku}
                    width={400}
                    height={400}
                    sizes="(min-width: 1024px) 200px, (min-width: 640px) 33vw, 50vw"
                    className="aspect-square w-full object-contain"
                  />
                </div>
                <div
                  className="truncate text-xs text-muted-foreground"
                  title={sku}
                >
                  {sku}
                </div>
              </li>
            );
          })}
        </ul>
      </Section>
    </PageContainer>
  );
}
