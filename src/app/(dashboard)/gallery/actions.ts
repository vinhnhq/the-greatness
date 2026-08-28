"use server";

/**
 * The library's write path.
 *
 * Each action calls `requireUser()` itself — a server action is its own HTTP
 * endpoint, reachable by anyone who can post to it, and the `(dashboard)`
 * layout's gate never runs for that request.
 *
 * `createMediaAssets` is called **after** the browser has uploaded the bytes.
 * That ordering is deliberate: a row whose file never arrived renders as a
 * broken image forever and nothing in the UI can explain it, whereas an
 * uploaded file with no row is invisible and swept later (backlog N.2).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { baseContext, runWithContext } from "@/lib/context";
import type { MediaId } from "@/lib/domain/media/entity";
import { MEDIA_ALT_MAX } from "@/lib/domain/media/entity";
import { dbMediaRepo } from "@/lib/domain/media/repository";
import { ALLOWED_MEDIA_TYPES } from "@/lib/media/constraints";
import { requireUser } from "@/lib/require-user";

/**
 * The client supplies these, so they are untrusted regardless of the fact
 * that this app produced them. The URL check is the important one: without
 * it, a crafted call could point a product's gallery at any address on the
 * internet and the page would dutifully render it.
 */
const newAssetSchema = z.object({
  kind: z.enum(["image", "video"]),
  originUrl: z.string().min(1),
  optimizedUrl: z.string().min(1).nullable(),
  posterUrl: z.string().min(1).nullable(),
  mime: z
    .string()
    .refine(
      (m) => (ALLOWED_MEDIA_TYPES as readonly string[]).includes(m),
      "unsupported type",
    ),
  bytes: z.number().int().nonnegative(),
  optimizedBytes: z.number().int().nonnegative().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  alt: z.string().max(MEDIA_ALT_MAX).nullable(),
});

/** Ours, and only ours: a relative `/uploads/…` path from the local driver,
 * or a Vercel Blob host. Anything else is an attempt to store someone else's
 * address in our catalogue. */
const isOwnUrl = (url: string): boolean => {
  if (url.startsWith("/uploads/")) return !url.includes("..");
  try {
    return new URL(url).hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
};

export type CreateMediaResult =
  | { readonly status: "ok"; readonly assets: unknown[] }
  | { readonly status: "invalid"; readonly message: string };

export async function createMediaAssets(input: unknown) {
  const user = await requireUser();

  const parsed = z.array(newAssetSchema).min(1).max(50).safeParse(input);
  if (!parsed.success) {
    throw new Error("createMediaAssets: malformed payload");
  }

  const urls = parsed.data.flatMap((a) =>
    [a.originUrl, a.optimizedUrl, a.posterUrl].filter(
      (u): u is string => u !== null,
    ),
  );
  if (!urls.every(isOwnUrl)) {
    throw new Error("createMediaAssets: url outside this app's storage");
  }

  return runWithContext(baseContext(user), async () => {
    const assets = await dbMediaRepo.createMany(parsed.data);
    revalidatePath("/gallery");
    return assets;
  });
}

export async function deleteMediaAssets(
  ids: readonly string[],
): Promise<{ readonly ok: boolean; readonly removed: number }> {
  const user = await requireUser();
  if (ids.length === 0) return { ok: true, removed: 0 };

  return runWithContext(baseContext(user), async () => {
    // Deleting from the library also unlinks it from every product using it —
    // see `remove`. The confirmation dialog is what tells the operator that
    // before they press it.
    await dbMediaRepo.remove(ids as MediaId[]);
    revalidatePath("/gallery");
    revalidatePath("/products");
    return { ok: true, removed: ids.length };
  });
}

export async function updateMediaAlt(
  id: string,
  alt: string,
): Promise<{ readonly ok: boolean }> {
  const user = await requireUser();
  const trimmed = alt.trim().slice(0, MEDIA_ALT_MAX);

  return runWithContext(baseContext(user), async () => {
    const updated = await dbMediaRepo.updateAlt(
      id as MediaId,
      trimmed === "" ? null : trimmed,
    );
    revalidatePath("/gallery");
    return { ok: updated !== null };
  });
}
