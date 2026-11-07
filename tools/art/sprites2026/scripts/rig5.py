"""Normal enemies: walk x2 + attack x1. usage: rig5.py base_dir out_dir"""
import sys
import numpy as np
from PIL import Image
from rig import (load, strip_outline, add_outline, put, region, move, rotate, line, arc, crop, walk_frames, clear, PAD)
from rig2 import recolor, layer_shift

src, out = sys.argv[1], sys.argv[2]
SIZE = {"drone": 16, "thug": 20, "gunner": 20, "psycho": 24, "kamikaze": 16, "rat_bot": 12,
        "corrupt_cop": 20, "sec_bot": 26, "sniper_turret": 20, "glitch_ghost": 20}
NEAR = dict(fill="2", hi="3", boot="1", boot_rows=1, toe=1)
FAR = dict(fill="1", hi=None, boot="1", boot_rows=1, toe=1)
LEGS = {
    "thug": dict(clear=[(5, 14, 13, 19)], near_hip=(10, 13), far_hip=(8, 13), ground=18, lw=2, d=2,
                 near=dict(fill="c", hi="W", boot="w", boot_rows=1, toe=1), far=dict(fill="1", hi=None, boot="R", boot_rows=1, toe=1)),
    "gunner": dict(clear=[(1, 11, 11, 19)], near_hip=(7, 10), far_hip=(4, 10), ground=18, lw=2, d=2, near=NEAR, far=FAR),
    "psycho": dict(clear=[(2, 17, 19, 23), (2, 16, 16, 16)], near_hip=(14, 15), far_hip=(7, 15), ground=22, lw=3, d=2,
                   near=dict(fill="2", hi="W", boot="1", boot_rows=1, toe=1), far=FAR),
    "corrupt_cop": dict(clear=[(2, 15, 10, 19)], near_hip=(7, 14), far_hip=(5, 14), ground=18, lw=2, d=2, near=NEAR, far=FAR),
}


def frames(name, base):
    b = strip_outline(base)
    if name in LEGS:
        w1, w2 = walk_frames(base, LEGS[name])
        a = strip_outline(w1)
        if name == "thug":       # bat swung overhead-forward with a smear
            a[region(a, 12, 9, 18, 11)] = 0; a[region(a, 0, 12, 4, 14)] = 0
            line(a, (12, 9), (18, 2), "B"); line(a, (13, 9), (19, 3), "O"); put(a, 19, 1, "B")
            arc(a, (12, 10), 10, -75, 15, "w", step=6)
        elif name == "gunner":   # pistol shot
            for x, y, ch in [(17, 4, "w"), (18, 4, "Y"), (19, 4, "O"), (17, 3, "Y"), (17, 5, "Y"), (20, 4, "O")]:
                put(a, x, y, ch)
        elif name == "psycho":   # blade lunge: lean forward + red slash
            a = layer_shift(a, region(a, 0, 0, 23, 14), 1, 0)
            arc(a, (17, 10), 9, -70, 60, "R", step=5); arc(a, (17, 10), 8, -60, 50, "w", step=7)
        elif name == "corrupt_cop":  # shotgun blast, spread flash, recoil
            a = layer_shift(a, region(a, 0, 0, 19, 13), -1, 0)
            for k in range(4):
                put(a, 16 + k, 5, "Y" if k < 2 else "O"); put(a, 16 + k, 4 - k // 2, "O"); put(a, 16 + k, 6 + k // 2, "O")
            put(a, 16, 5, "w"); put(a, 17, 5, "w")
        return w1, w2, add_outline(a)
    if name == "drone":          # thrusters flicker + bob; attack = eye flare
        w1 = b
        w2 = layer_shift(recolor(b, region(b, 0, 10, 15, 13), {"C": "c"}), region(b, 0, 0, 15, 15), 0, -1)
        a = recolor(b, region(b, 5, 5, 10, 10), {"M": "w", "m": "M"})
        for x, y in [(8, -2), (8, 17), (-2, 8), (17, 8), (2, 2), (14, 2)]:
            put(a, x, y, "M")
    elif name == "kamikaze":     # warning light blinks + bob; attack = core swells (fuse)
        w1 = b
        w2 = layer_shift(recolor(b, region(b, 6, 4, 9, 6), {"R": "O"}), region(b, 0, 0, 15, 15), 0, -1)
        a = recolor(b, region(b, 4, 4, 11, 9), {"R": "w", "B": "R", "1": "R"})
        for x, y in [(7, 2), (8, 2), (2, 7), (13, 7), (7, 12), (3, 4), (12, 4)]:
            put(a, x, y, "O")
    elif name == "rat_bot":      # legs scurry; attack = bite lunge
        w1 = b
        legs = region(b, 3, 10, 9, 11)
        w2 = move(b, legs, 1, 0)
        a = layer_shift(b, region(b, 3, 5, 11, 11), 1, 0)
        put(a, 13, 8, "w"); put(a, 13, 9, "R")
    elif name == "sec_bot":      # heavy stomp: legs lift in turn; attack = right-arm punch
        left, right = region(b, 5, 17, 13, 25), region(b, 14, 17, 21, 25)
        w1 = layer_shift(b, left, 0, -2, under=True)
        w2 = layer_shift(b, right, 0, -2, under=True)
        a = layer_shift(b, region(b, 18, 9, 24, 16), 3, 0)
        a = recolor(a, region(a, 14, 6, 18, 9), {"Y": "w"})
        for x, y, ch in [(28, 11, "w"), (29, 13, "Y"), (28, 15, "w"), (30, 12, "O"), (30, 14, "O")]:
            put(a, x, y, ch)
    elif name == "sniper_turret":  # idle: lens blink; attack = shot with recoil and muzzle flash
        w1 = b
        w2 = recolor(b, region(b, 17, 8, 19, 9), {"R": "O"})
        a = layer_shift(b, region(b, 9, 8, 19, 10), -1, 0)
        for x, y, ch in [(19, 9, "w"), (20, 9, "Y"), (21, 9, "Y"), (22, 9, "O"), (20, 8, "O"), (20, 10, "O"), (19, 8, "Y"), (19, 10, "Y")]:
            put(a, x, y, ch)
    elif name == "glitch_ghost":   # tail waves + bob; attack = glitch slices
        w1 = b
        tail = region(b, 3, 13, 12, 18)
        w2 = layer_shift(layer_shift(b, tail, 1, 0), region(b, 0, 0, 19, 12), 0, -1)
        a = b.copy()
        for y0, dx in [(2, 2), (6, -2), (10, 3), (14, -2)]:
            a = layer_shift(a, region(a, 0, y0, 19, y0 + 1), dx, 0)
        a = recolor(a, region(a, 0, 0, 19, 19), {"M": "C", "C": "M", "1": "w"})
    return add_outline(w1), add_outline(w2), add_outline(a)


for name, z in SIZE.items():
    base = load(f"{src}/{name}.png")
    w1, w2, at = frames(name, base)
    if name in LEGS:  # walk_frames already outlined
        pass
    Image.fromarray(crop(w1, z, z), "RGBA").save(f"{out}/{name}.png")
    Image.fromarray(crop(w2, z, z), "RGBA").save(f"{out}/{name}_w2.png")
    Image.fromarray(crop(at, z, z, extra=6), "RGBA").save(f"{out}/{name}_aim.png")
    print(name, "ok")
