#!/usr/bin/env python3
"""Compose a product photo into the Greatness Vietnam thumbnail frame.

    python3 frame.py IN.png [IN2.png ...] -o OUT_DIR [--brand kdk] [--variant a]

Layout (from the 2026-09 mockup): black border, brand logo top-left, our
wordmark + tagline top-right, product centred in the remaining space.

The photos we receive are 800×800 exports that already carry the brand's
logo baked into the top-left corner and, for some brands, a flat grey
backdrop. Both fight the frame, so before composing we:

  1. flatten a flat non-white backdrop to white (flood fill from the
     corners; a photo with a real shadow gradient is left alone), and
  2. clear any connected blob that lives entirely inside the top-left
     "logo window" — the product always extends below that window, a
     baked-in logo never does.

Brand comes from, in order: --brand, the Sapo catalogue (data/sapo/
products.json, matched on SKU = filename), then brands.json prefix rules.
A photo whose brand cannot be resolved is skipped and named in the summary.

Nothing here is a dependency of the app; it is a Pillow script kept in the
repo so the frame is reproducible when the next batch of photos arrives.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, "fonts", "Montserrat[wght].ttf")
LOGOS = os.path.join(HERE, "logos")
BRANDS = json.load(open(os.path.join(HERE, "brands.json")))

# ---------------------------------------------------------------- variants
# Each variant is one composition; `samples/` shows them side by side.
VARIANTS = {
    "a": dict(border=14, header_h=150, pad=36, logo_box=(210, 84), name_size=36, tag_size=26),
    "b": dict(border=6, header_h=130, pad=30, logo_box=(190, 72), name_size=32, tag_size=23),
    "c": dict(border=0, header_h=130, pad=30, logo_box=(190, 72), name_size=32, tag_size=23,
              rule=True),
}
NAME = "GREATNESS VIETNAM"
TAGLINE = "Phân phối chính hãng"


def font(size: int, weight: str) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(FONT, size)
    f.set_variation_by_name(weight)
    return f


# ---------------------------------------------------------------- brand
def sapo_vendors(repo_root: str) -> dict[str, str]:
    path = os.path.join(repo_root, "data", "sapo", "products.json")
    if not os.path.exists(path):
        return {}
    out = {}
    for p in json.load(open(path)):
        for v in p.get("variants", []):
            if v.get("sku") and p.get("vendor"):
                out[v["sku"].upper()] = p["vendor"].lower()
    return out


def sku_of(path: str) -> str:
    base = os.path.splitext(os.path.basename(path))[0]
    return re.sub(r" \(\d+\)$", "", base).strip()


def resolve_brand(path: str, vendors: dict[str, str]) -> str | None:
    sku = sku_of(path)
    v = vendors.get(sku.upper())
    if v in BRANDS["brands"]:
        return v
    for rule in BRANDS["rules"]:
        if re.match(rule["match"], sku, re.I):
            return rule["brand"]
    return None


# ---------------------------------------------------------------- cleanup
def flatten_backdrop(im: Image.Image) -> Image.Image:
    """Replace a flat backdrop (white or grey) with transparency.

    The exports are a mix of transparent, opaque-white and opaque-grey
    backgrounds. A backdrop is 'flat' when the four corners agree; only the
    region connected to the corners is cleared, so a white product body or
    a studio gradient is kept.
    """
    rgba = np.asarray(im.convert("RGBA")).astype(np.int16)
    h, w, _ = rgba.shape
    corners = [rgba[0, 0], rgba[0, w - 1], rgba[h - 1, 0], rgba[h - 1, w - 1]]
    ref = corners[0]
    if ref[3] < 250 or any(np.abs(c[:3] - ref[:3]).max() > 6 for c in corners):
        return im.convert("RGBA")
    close = (np.abs(rgba[:, :, :3] - ref[:3]).max(axis=2) <= 10) & (rgba[:, :, 3] > 250)
    labels, _ = ndimage.label(close)
    keep = {labels[0, 0], labels[0, w - 1], labels[h - 1, 0], labels[h - 1, w - 1]} - {0}
    mask = np.isin(labels, list(keep))
    out = rgba.copy()
    out[mask, 3] = 0
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def strip_baked_logo(im: Image.Image, window=(0.8, 0.22)) -> tuple[Image.Image, bool]:
    """Clear blobs that sit entirely inside the top-left window.

    The window is wide (80%) because some exports put a caption beside the
    logo. It is short (22%; the KDK badge ends at 20%) so a product, which always crosses the
    window's bottom edge, is never touched.
    """
    a = np.asarray(im)
    h, w, _ = a.shape
    wx, wy = int(w * window[0]), int(h * window[1])
    content = a[:, :, 3] > 8
    labels, n = ndimage.label(content)
    if n == 0:
        return im, False
    objs = ndimage.find_objects(labels)
    out = a.copy()
    hit = False
    for i, sl in enumerate(objs, start=1):
        if sl is None:
            continue
        ys, xs = sl
        if ys.stop <= wy and xs.stop <= wx:
            out[labels == i, 3] = 0
            hit = True
    return Image.fromarray(out, "RGBA"), hit


def content_bbox(im: Image.Image):
    return im.getchannel("A").point(lambda p: 255 if p > 8 else 0).getbbox()


# ---------------------------------------------------------------- compose
def fit(im: Image.Image, box: tuple[int, int]) -> Image.Image:
    s = min(box[0] / im.width, box[1] / im.height)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


def compose(photo: Image.Image, brand: str, size: int, v: dict) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    d = ImageDraw.Draw(canvas)
    b = v["border"]
    if b:
        d.rectangle((0, 0, size - 1, size - 1), outline=(0, 0, 0, 255), width=b)

    inner = b + v["pad"]
    # header: brand logo left
    logo = Image.open(os.path.join(LOGOS, brand + ".png")).convert("RGBA")
    logo = fit(logo, v["logo_box"])
    ly = inner + (v["header_h"] - v["pad"] - logo.height) // 2
    canvas.alpha_composite(logo, (inner, ly))

    # header: our name + tagline, right-aligned
    fn, ft = font(v["name_size"], "Bold"), font(v["tag_size"], "Regular")
    nw = d.textlength(NAME, font=fn)
    tw = d.textlength(TAGLINE, font=ft)
    right = size - inner
    block_h = v["name_size"] + 8 + v["tag_size"]
    ty = inner + (v["header_h"] - v["pad"] - block_h) // 2
    d.text((right - nw, ty), NAME, font=fn, fill=(0, 0, 0, 255))
    d.text((right - tw, ty + v["name_size"] + 8), TAGLINE, font=ft, fill=(60, 60, 60, 255))

    if v.get("rule"):
        y = b + v["header_h"] - 6
        d.line((inner, y, size - inner, y), fill=(0, 0, 0, 255), width=2)

    # product: cropped to content, fitted into the remaining box
    bb = content_bbox(photo)
    if bb:
        photo = photo.crop(bb)
    box_w = size - 2 * inner
    box_h = size - b - v["header_h"] - inner
    p = fit(photo, (box_w, box_h))
    x = (size - p.width) // 2
    y = b + v["header_h"] + (box_h - p.height) // 2
    canvas.alpha_composite(p, (x, y))
    return canvas


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("inputs", nargs="+")
    ap.add_argument("-o", "--out", required=True)
    ap.add_argument("--brand", help="override brand for every input")
    ap.add_argument("--variant", default="a", choices=sorted(VARIANTS))
    ap.add_argument("--size", type=int, default=800)
    ap.add_argument("--keep-logo", action="store_true", help="do not strip the baked-in logo")
    ap.add_argument("--jpg", action="store_true", help="write JPEG (white background) instead of PNG")
    ap.add_argument("--repo", default=os.path.join(HERE, "..", ".."))
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    vendors = sapo_vendors(args.repo)
    v = VARIANTS[args.variant]
    skipped: list[str] = []
    for src in args.inputs:
        brand = args.brand or resolve_brand(src, vendors)
        if brand not in BRANDS["brands"]:
            skipped.append(f"{os.path.basename(src)} (brand {brand!r})")
            continue
        im = flatten_backdrop(Image.open(src))
        stripped = False
        if not args.keep_logo:
            im, stripped = strip_baked_logo(im)
        out = compose(im, brand, args.size, v)
        name = os.path.splitext(os.path.basename(src))[0]
        if args.jpg:
            dst = os.path.join(args.out, name + ".jpg")
            out.convert("RGB").save(dst, quality=92)
        else:
            dst = os.path.join(args.out, name + ".png")
            out.save(dst)
        print(f"{name:32s} {brand:9s} {'logo stripped' if stripped else ''}")
    if skipped:
        print(f"\nskipped {len(skipped)} (no brand resolved):", *skipped, sep="\n  ", file=sys.stderr)
    return 1 if skipped else 0


if __name__ == "__main__":
    sys.exit(main())
