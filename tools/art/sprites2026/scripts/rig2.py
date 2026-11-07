"""Zone 2/3 bosses: walk x2 + attack x1, hand-rigged on the processed base sprites.
usage: rig2.py base_dir out_dir"""
import sys
import numpy as np
from PIL import Image
from rig import (PAD, COL, OUT, load, strip_outline, add_outline, put, region, move, line, arc, crop)


def recolor(a, mask, mapping):
    a = a.copy()
    for src, dst in mapping.items():
        m = mask & np.all(a == COL[src], -1)
        a[m] = COL[dst]
    return a


def layer_shift(a, mask, dx, dy, under=False):
    """Move masked pixels; if under=True the rest of the sprite stays drawn on top."""
    piece = np.where(mask[..., None], a, 0)
    rest = a.copy(); rest[mask] = 0
    moved = np.zeros_like(a)
    ys, xs = np.where(mask)
    moved[ys + dy, xs + dx] = a[ys, xs]
    out = rest.copy()
    m = moved[..., 3] > 0
    if under:
        out[m & (rest[..., 3] == 0)] = moved[m & (rest[..., 3] == 0)]
    else:
        out[m] = moved[m]
    return out


def tread_roll(a, x0, y0, x1, y1, dx=1):
    """Roll the tread texture inside its own silhouette (pixels move, silhouette stays)."""
    a = a.copy()
    for y in range(y0 + PAD, y1 + PAD + 1):
        xs = [x for x in range(x0 + PAD, x1 + PAD + 1) if a[y, x, 3] > 0 and not np.all(a[y, x] == OUT)]
        if len(xs) > 2:
            vals = [a[y, x].copy() for x in xs]
            vals = vals[-dx:] + vals[:-dx]
            for x, v in zip(xs, vals):
                a[y, x] = v
    return a


def frames(name, base):
    b = strip_outline(base)
    if name == "midboss2":  # Rivet Crusher: treads roll, body bobs, beacon blinks; attack = pincer thrust
        w1 = b
        w2 = tread_roll(b, 1, 25, 30, 33)
        w2 = layer_shift(w2, region(w2, 5, 4, 36, 24), 0, 1, under=False)
        w2 = recolor(w2, region(w2, 15, 5, 20, 8), {"Y": "O", "O": "Y"})
        at = layer_shift(b, region(b, 26, 14, 36, 21), 4, -1)
        line(at, (24, 17), (30, 16), "W", 2); line(at, (24, 19), (29, 18), "3")     # extended piston
        at = recolor(at, region(at, 15, 5, 20, 8), {"Y": "R", "O": "R", "B": "m"})  # beacon to red
        for x, y, ch in [(40, 15, "w"), (41, 17, "Y"), (40, 19, "w"), (42, 16, "O"), (42, 18, "O"), (39, 13, "Y")]:
            put(at, x, y, ch)                                                       # clamp sparks
    elif name == "boss2":   # Hexaward: front-facing stomp, legs lift in turn; attack = shoulder missile salvo
        left, right = region(b, 8, 24, 22, 43), region(b, 25, 23, 38, 43)
        w1 = layer_shift(b, left, 0, -2, under=True)
        w2 = layer_shift(b, right, 0, -2, under=True)
        at = recolor(b, region(b, 17, 9, 25, 13), {"M": "w", "m": "M"})            # core flares
        for (x, y) in [(7, 1), (13, 0), (33, 0), (39, 1)]:                          # missiles leaving the pods
            line(at, (x, y - 5), (x, y - 2), "w"); put(at, x, y - 6, "R")
            put(at, x, y - 1, "O"); put(at, x, y, "Y")
            put(at, x - 1, y + 1, "W"); put(at, x + 1, y + 1, "3")                  # smoke puffs
        at = recolor(at, region(at, 3, 1, 44, 8), {"m": "M"})
    elif name == "midboss3":  # Enforcer Prism: legs lift in turn, crystals bob; attack = refracted beam
        left, right = region(b, 9, 22, 17, 35), region(b, 17, 21, 26, 35)
        cl, cr = region(b, 5, 3, 11, 9), region(b, 23, 3, 30, 9)
        w1 = layer_shift(layer_shift(layer_shift(b, left, 0, -2, under=True), cl, 0, -1), cr, 0, 1)
        w2 = layer_shift(layer_shift(layer_shift(b, right, 0, -2, under=True), cl, 0, 1), cr, 0, -1)
        at = b.copy()
        at[region(at, 22, 13, 26, 20)] = 0                                           # arm raised forward
        line(at, (22, 11), (27, 8), "W", 2); put(at, 28, 8, "w"); put(at, 28, 9, "w")
        at = layer_shift(at, cl, 22, 1)                                             # crystals gather in front
        at = layer_shift(at, cr, 5, 4)
        for k in range(30, 41):
            put(at, k, 8, "C"); put(at, k, 9, "w"); put(at, k, 10, "C")
        for x, y in [(41, 6), (42, 7), (41, 12), (42, 11), (42, 5), (42, 13)]:
            put(at, x, y, "C")                                                       # beam splits at the tip
    elif name == "boss3":   # Arconan Core: rings turn (mirror), eye stays; attack = iris slit + red flare
        eye = region(b, 17, 21, 31, 35)
        mirrored = b[:, ::-1].copy()
        # mirror around the sprite centre, then put the eye back unmirrored
        w2 = mirrored.copy(); w2[eye] = b[eye]
        w2[eye & (b[..., 3] == 0)] = mirrored[eye & (b[..., 3] == 0)]
        w1 = b
        at = recolor(b, region(b, 0, 12, 47, 47) & ~eye, {"w": "W", "m": "R", "M": "R"})
        at = recolor(at, eye, {"1": "R", "R": "R", "B": "m"})
        line(at, (24, 23), (24, 33), "1"); line(at, (23, 25), (23, 31), "1")         # slit pupil
        put(at, 22, 28, "w"); put(at, 25, 28, "w")
        for deg in range(0, 360, 45):                                                # red flare spikes
            for r in (21, 22, 23):
                put(at, 24 + r * np.cos(np.radians(deg)), 29 + r * np.sin(np.radians(deg)), "R" if r < 23 else "M")
    return [add_outline(w1), add_outline(w2), add_outline(at)]


SIZES = {"midboss2": (36, 36), "boss2": (48, 44), "midboss3": (36, 36), "boss3": (48, 48)}


def main(src, out):
    for name, (w, h) in SIZES.items():
        base = load(f"{src}/{name}_w1.png")
        w1, w2, at = frames(name, base)
        Image.fromarray(crop(w1, w, h), "RGBA").save(f"{out}/{name}_walk1.png")
        Image.fromarray(crop(w2, w, h), "RGBA").save(f"{out}/{name}_walk2.png")
        Image.fromarray(crop(at, w, h, extra=8), "RGBA").save(f"{out}/{name}_attack.png")
        print(name, "ok")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
