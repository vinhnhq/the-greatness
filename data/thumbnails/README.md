# `data/thumbnails/` — the supplier's product photos, and ours

The 800×800 PNGs a supplier hands over, named by SKU, and the storefront
thumbnails made from them. First batch received 2026-09-17: 134 files.

| folder        | what                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `source/`     | The photos as received (minus the four re-exports below). The input; never edited.                                  |
| `framed/`     | `source/` through `tools/thumbnail-frame/frame.py --variant g`: brand logo top-left, our name top-right, no border. |
| `duplicates/` | Four files that were the same photo exported twice. Kept so the decision can be checked; see `DUPLICATES.md`.       |

Regenerate the output after a new batch lands in `source/`:

```bash
python3 tools/thumbnail-frame/frame.py data/thumbnails/source/*.png -o data/thumbnails/framed --variant g
```

A file the script cannot place (no brand from the Sapo SKU or the prefix
rules in `tools/thumbnail-frame/brands.json`) is named in the summary and
skipped; pass `--brand` for it. `JAF-565 (2)` is a Sharp blender under a
Joyoung SKU — framed with `--brand sharp` and renamed so it cannot be
uploaded under the wrong product.

`Nền gốc.png` is a blank backdrop, not a product; left in `source/` as
received, produces nothing.
