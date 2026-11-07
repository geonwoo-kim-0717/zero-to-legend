"""Walk cycle (2 frames) + attack (1 frame) from one finished sprite.
Legs: the bottom band of the body is split at the hip centre into back leg / front leg and the two
are swung in opposite directions (stride), the upper body bobs; attack = forward lunge.
usage: frames2.py base.png out_prefix stride_px"""
import sys
import numpy as np
from PIL import Image
from frames import strip_outline, add_outline
PAD = 8

def bbox(a):
    ys, xs = np.where(a[..., 3] > 0)
    return ys.min(), ys.max(), xs.min(), xs.max()


def paste(dst, src, dy, dx):
    """Paste opaque pixels of src onto dst shifted by (dy, dx)."""
    h, w = src.shape[:2]
    ys, xs = np.where(src[..., 3] > 0)
    ty, tx = ys + dy, xs + dx
    ok = (ty >= 0) & (ty < dst.shape[0]) & (tx >= 0) & (tx < dst.shape[1])
    dst[ty[ok], tx[ok]] = src[ys[ok], xs[ok]]


def pose(body, front_dx, back_dx, front_lift, body_dy, lean=0):
    pad = PAD
    b = np.pad(body, ((pad, pad), (pad, pad), (0, 0)))
    top, bot, x0, x1 = bbox(b)
    H = bot - top + 1
    leg_top = bot - max(3, int(round(H * 0.3))) + 1
    # hip centre = centre of opaque columns in the leg band
    band = b[leg_top:bot + 1, :, 3] > 0
    cols = np.where(band.any(0))[0]
    cx = (cols.min() + cols.max()) / 2
    upper = b.copy(); upper[leg_top:] = 0
    back = np.zeros_like(b); front = np.zeros_like(b)
    back[leg_top:, :int(cx)] = b[leg_top:, :int(cx)]
    front[leg_top:, int(cx):] = b[leg_top:, int(cx):]
    out = np.zeros_like(b)
    paste(out, back, 0, back_dx)            # back leg first (behind)
    if lean:                                 # upper body: shear forward by height
        sheared = np.zeros_like(upper)
        for y in range(top, leg_top):
            sh = int(round(lean * (leg_top - y) / max(leg_top - top, 1)))
            sheared[y] = np.roll(upper[y], sh, axis=0)
        upper = sheared
    paste(out, upper, body_dy, 0)
    paste(out, front, -front_lift, front_dx)  # front leg on top
    # fill a possible 1px gap between hips and lowered body
    return out


def place(b, w, h):
    """Back to the original canvas position (no re-centering, so frames don't jitter);
    nudge inward only if something would touch the edge."""
    top, bot, x0, x1 = bbox(b)
    dx = 0
    if x0 - PAD < 1: dx = 1 - (x0 - PAD)
    if x1 - PAD > w - 2: dx = (w - 2) - (x1 - PAD)
    dy = (h - 2) - (bot - PAD)            # feet stay on the same ground row
    out = np.zeros((h, w, 4), np.uint8)
    paste(out, b, dy - PAD, dx - PAD)
    return out


def main(src, prefix, s):
    base = np.asarray(Image.open(src).convert("RGBA"))
    h, w = base.shape[:2]
    body = strip_outline(base)
    frames = {
        "walkA": pose(body, front_dx=+s, back_dx=-s, front_lift=0, body_dy=1),            # long stride, body low
        "walkB": pose(body, front_dx=-s, back_dx=+s, front_lift=1, body_dy=0),            # legs passing, front foot up
        "attack": pose(body, front_dx=+s + 1, back_dx=-s - 1, front_lift=0, body_dy=1, lean=s + 2),
    }
    for k, v in frames.items():
        out = add_outline(place(v, w, h))
        Image.fromarray(out, "RGBA").save(f"{prefix}_{k}.png")
    print(prefix, "done")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]))
