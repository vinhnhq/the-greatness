"""Flag near-duplicate product photos by perceptual hash.

The folder has zero byte-identical files but many ` (2)` suffixes; some are
true re-exports, some are different colour variants, so this only *reports*
(and optionally moves to _review/) — it never deletes.
"""
import sys, os, itertools
from PIL import Image, ImageOps

def dhash(path, size=16):
    im = Image.open(path).convert("RGBA")
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255)); bg.alpha_composite(im)
    g = ImageOps.grayscale(bg).resize((size + 1, size), Image.LANCZOS)
    px = list(g.getdata())
    bits = []
    for r in range(size):
        row = px[r * (size + 1):(r + 1) * (size + 1)]
        bits += [row[c] > row[c + 1] for c in range(size)]
    return bits

def dist(a, b): return sum(x != y for x, y in zip(a, b))

def main():
    folder = sys.argv[1]; thr = int(sys.argv[2]) if len(sys.argv) > 2 else 12
    files = sorted(f for f in os.listdir(folder) if f.lower().endswith(".png"))
    h = {f: dhash(os.path.join(folder, f)) for f in files}
    pairs = sorted(((dist(h[a], h[b]), a, b) for a, b in itertools.combinations(files, 2)))
    for d, a, b in pairs:
        if d <= thr: print(f"{d:3d}  {a}  <->  {b}")

if __name__ == "__main__": main()
