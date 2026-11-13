"""After a size change: put source detail back into scaled frames of the older pixel-edit units.
The source is re-rendered at the new size with the extended palette (process_ext.py); it is aligned to each
scaled frame by silhouette, and a frame pixel takes the source colour there when the two colours are close
(same material). Hand-drawn parts that differ from the source (redrawn legs, flashes, slashes) keep their colour.
usage: redetail.py src.png size thr frames_dir out_dir name [name_w2 ...]"""
import sys, os, subprocess, numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from transfer import shifted, pad_to, solid
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def rm(a, b):
    r = (a[..., 0] + b[..., 0]) / 2; d = a - b
    return np.sqrt((2 + r / 256) * d[..., 0] ** 2 + 4 * d[..., 1] ** 2 + (2 + (255 - r) / 256) * d[..., 2] ** 2)
def align(frame, base, R=8):
    fm = frame[..., 3] > 0; best = (-1, 0, 0)
    for dy in range(-R, R + 1):
        for dx in range(-R, R + 1):
            s = (fm & (shifted(base, dx, dy)[..., 3] > 0)).sum() - 0.5 * ((~fm) & (shifted(base, dx, dy)[..., 3] > 0)).sum()
            if s > best[0]: best = (s, dx, dy)
    return shifted(base, best[1], best[2])
if __name__ == "__main__":
    src, size, thr, fdir, out = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4], sys.argv[5]
    os.makedirs(out, exist_ok=True); tmp = os.path.join(out, "_base.png")
    subprocess.run(["python3", os.path.join(HERE, "process_ext.py"), src, tmp, str(size), str(size), "none", thr], check=True, capture_output=True)
    base = np.asarray(Image.open(tmp).convert("RGBA")).astype(int); os.remove(tmp)
    for n in sys.argv[6:]:
        f = np.asarray(Image.open(os.path.join(fdir, n + ".png")).convert("RGBA")).astype(int); H, W = f.shape[:2]
        b = pad_to(base, H, W)[0][:H, :W]; b = align(f, b)
        ok = solid(f) & solid(b) & (rm(f[..., :3].astype(float), b[..., :3].astype(float)) < 95)
        o = f.copy(); o[ok, :3] = b[ok, :3]
        Image.fromarray(o.astype(np.uint8), "RGBA").save(os.path.join(out, n + ".png"))
        print(n, f"{ok.sum()}/{solid(f).sum()} px from source")
