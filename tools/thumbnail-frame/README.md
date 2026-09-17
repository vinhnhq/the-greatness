# Thumbnail frame

Turns a bare product photo into the storefront thumbnail: black border,
brand logo top-left, "GREATNESS VIETNAM / Phân phối chính hãng" top-right,
product centred below. Pure Pillow + numpy + scipy; not part of the app.

```bash
python3 tools/thumbnail-frame/frame.py data/thumbnails/source/*.png -o data/thumbnails/framed --variant g   # the batch
python3 tools/thumbnail-frame/frame.py photo.png -o out/            # PNG, variant a
python3 tools/thumbnail-frame/frame.py *.png -o out/ --variant b --jpg
python3 tools/thumbnail-frame/frame.py new.png -o out/ --brand kdk  # when the SKU is unknown
python3 tools/thumbnail-frame/dedupe.py ~/photos 12                 # near-duplicate pairs
```

The brand is read from the Sapo catalogue by SKU (filename), then from the
prefix rules in `brands.json`. A photo with no brand is skipped and named.

Before composing, a flat backdrop (white or grey) is made transparent and
any blob that sits entirely inside the top-left 80% × 22% window is cleared —
that is the supplier's baked-in logo; a product always crosses the window's
bottom edge. `--keep-logo` turns that off.

## Variants

`samples/variant-{a..g}.jpg` — **a** thick border (the mockup), **b** thin
border, **c** no border with a hairline, **d** footer band, **e** corner
badge, **f** centred card, **g** the header row with no border — **g is the
one in use**, because the storefront card draws its own border and floats
buttons over the bottom fifth of the image.

## Logos

`logos/<brand>.png` are the cropped, transparent versions used by the
script; the `*-site.*` / `*.svg` files beside them are the originals, with
the source URL in `brands.json`. KDK and Sharp are vectors from Wikimedia
Commons; Bear and Lumias are the brands' own site PNGs (Lumias recoloured
from white to dark, because the site only serves the white-on-colour
mark); **Fujihome (5 KB JPEG) and Joyoung (320 px PNG) are the best found
online and should be replaced with a vector from the distributor.**

There is no Greatness Vietnam logo file anywhere in the repo, so the
right-hand block is set in Montserrat (`fonts/`, OFL) as in the mockup.
