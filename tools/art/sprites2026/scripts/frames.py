"""Derive motion frames from one finished sprite (same pixels, so the character stays identical).
usage: frames.py base.png out_prefix kind(boss|trooper) frames(comma list: w2,aim,charge)"""
import sys
import numpy as np
from PIL import Image

OUTLINE = np.array([0x07, 0x06, 0x0F], np.uint8)


def strip_outline(a):
    op = a[..., 3] > 0
    is_ol = op & np.all(a[..., :3] == OUTLINE, -1)
    pad = np.pad(op, 1)
    touches_empty = ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    out = a.copy()
    out[is_ol & touches_empty] = 0
    return out


def add_outline(a):
    op = a[..., 3] > 0
    nb = np.zeros_like(op)
    nb[1:] |= op[:-1]; nb[:-1] |= op[1:]; nb[:, 1:] |= op[:, :-1]; nb[:, :-1] |= op[:, 1:]
    ring = nb & ~op
    a[ring, :3] = OUTLINE
    a[ring, 3] = 255
    return a


def warp(body, sx=1.0, sy=1.0, shear=0.0, foot_lift=0):
    """Nearest-neighbour warp around the feet (bottom-centre of the body).
    shear: horizontal pixels the top row moves (+ = forward/right).
    foot_lift: raise the front half of the leg band by this many pixels (walk step)."""
    h, w, _ = body.shape
    ys, xs = np.where(body[..., 3] > 0)
    top, bot = ys.min(), ys.max()
    cx = (xs.min() + xs.max()) / 2
    H = bot - top + 1
    big = np.zeros((h * 3, w * 3, 4), np.uint8)
    oy, ox = h, w  # place result in a big canvas first, fit afterwards
    for y in range(big.shape[0]):
        for x in range(big.shape[1]):
            ty, tx = y - oy, x - ox  # target coords in original frame space
            # inverse of: scale around (cx, bot), then shear by height above the feet
            hgt = (bot - ty) / max(H - 1, 1)  # 0 at feet, 1 at head (in target space, approx)
            srcy = bot - (bot - ty) / sy
            srcx = cx + (tx - shear * np.clip(hgt, 0, 1) - cx) / sx
            iy, ix = int(round(srcy)), int(round(srcx))
            if 0 <= iy < h and 0 <= ix < w and body[iy, ix, 3] > 0:
                big[y, x] = body[iy, ix]
    if foot_lift:
        leg_top = oy + bot - int(H * 0.3)
        front = big[:, int(ox + cx):].copy()
        band = front[leg_top:oy + bot + 1].copy()
        front[leg_top:oy + bot + 1] = 0
        front[leg_top - foot_lift:oy + bot + 1 - foot_lift] = np.where(
            band[..., 3:4] > 0, band, front[leg_top - foot_lift:oy + bot + 1 - foot_lift])
        big[:, int(ox + cx):] = front
    return big


def fit(big, w, h):
    """Bottom-align on the ground line, centre horizontally, shrink by whole-pixel crop only if needed."""
    ys, xs = np.where(big[..., 3] > 0)
    crop = big[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    ch, cw = crop.shape[:2]
    if cw > w - 2 or ch > h - 2:
        s = min((w - 2) / cw, (h - 2) / ch)
        crop = np.asarray(Image.fromarray(crop, "RGBA").resize((max(1, int(cw * s)), max(1, int(ch * s))), Image.NEAREST))
        ch, cw = crop.shape[:2]
    out = np.zeros((h, w, 4), np.uint8)
    x0 = (w - cw) // 2
    y0 = h - 1 - ch
    out[y0:y0 + ch, x0:x0 + cw] = crop
    return out


PRESETS = {
    "boss": {"w2": dict(sy=0.97, foot_lift=2), "aim": dict(sx=1.06, sy=0.9, shear=-2), "charge": dict(sx=1.08, sy=0.94, shear=4)},
    "trooper": {"w2": dict(foot_lift=1), "aim": dict(sx=1.0, sy=0.92, shear=-1), "charge": dict(sx=1.05, sy=0.95, shear=2)},
}


def main(src, prefix, kind, frames):
    base = np.asarray(Image.open(src).convert("RGBA"))
    h, w = base.shape[:2]
    body = strip_outline(base)
    for f in frames:
        out = add_outline(fit(warp(body, **PRESETS[kind][f]), w, h))
        Image.fromarray(out, "RGBA").save(f"{prefix}_{f}.png")
        print(f"{prefix}_{f}.png", f"{w}x{h}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4].split(","))
