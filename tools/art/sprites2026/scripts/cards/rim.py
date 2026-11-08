"""Add the rim light the generated card renders have (cyan from the left, magenta from the right) and put the
drawing on the same flat light-grey background, so card.py processes code-drawn and generated renders alike."""
import sys, os, numpy as np
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]; os.makedirs(dst, exist_ok=True)
for f in os.listdir(src):
    a = np.asarray(Image.open(f"{src}/{f}").convert("RGBA")).astype(float); m = a[..., 3] > 0; rgb = a[..., :3]
    for dx, col in ((-1, (0, 240, 255)), (1, (255, 43, 214))):
        # pixels within 7px of the edge on that side
        sh = np.zeros_like(m)
        if dx < 0: sh[:, 7:] = m[:, :-7]
        else: sh[:, :-7] = m[:, 7:]
        edge = m & ~sh
        rgb[edge] = rgb[edge] * 0.35 + np.array(col) * 0.65
    out = np.full(a.shape[:2] + (3,), 214.0); out[m] = rgb[m]
    Image.fromarray(out.astype(np.uint8)).save(f"{dst}/{f}")
