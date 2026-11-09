"""Rescale finished sprite frames by a non-integer factor without mixed pixel sizes:
outline stripped -> each pixel blown up 6x -> every target cell takes its most common colour (needs half coverage)
-> 1px outline added back. usage: rescale.py factor out_dir frame.png [frame.png ...]"""
import sys, os, numpy as np
from PIL import Image
OUT = np.array([7, 6, 15, 255], np.uint8)
def rescale(a, f, k=6):
    op = a[..., 3] > 0
    ol = op & np.all(a == OUT, -1)
    p = np.pad(op, 1); edge = ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])
    a = a.copy(); a[ol & edge] = 0
    H, W = a.shape[:2]; nh, nw = round(H * f), round(W * f)
    big = np.repeat(np.repeat(a, k, 0), k, 1)
    ys = np.linspace(0, H * k, nh + 1).astype(int); xs = np.linspace(0, W * k, nw + 1).astype(int)
    o = np.zeros((nh, nw, 4), np.uint8)
    for j in range(nh):
        for i in range(nw):
            c = big[ys[j]:ys[j + 1], xs[i]:xs[i + 1]].reshape(-1, 4); s = c[c[:, 3] > 0]
            if len(s) * 2 < len(c): continue
            v, n = np.unique(s, axis=0, return_counts=True); o[j, i] = v[n.argmax()]
    m = o[..., 3] > 0; nb = np.zeros_like(m)
    nb[1:] |= m[:-1]; nb[:-1] |= m[1:]; nb[:, 1:] |= m[:, :-1]; nb[:, :-1] |= m[:, 1:]
    o[nb & ~m] = OUT
    return o
if __name__ == "__main__":
    f, out = float(sys.argv[1]), sys.argv[2]; os.makedirs(out, exist_ok=True)
    for p in sys.argv[3:]:
        a = np.asarray(Image.open(p).convert("RGBA")); o = rescale(a, f)
        Image.fromarray(o, "RGBA").save(os.path.join(out, os.path.basename(p))); print(os.path.basename(p), a.shape[1::-1], "->", o.shape[1::-1])
