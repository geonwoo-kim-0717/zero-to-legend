"""Viper / Ghost / Nova: idle + walk x2 (redrawn legs) + attack (blade slash / hack burst / launcher shot)."""
import sys
from PIL import Image
from rig import load, strip_outline, add_outline, put, region, move, rotate, line, arc, crop, walk_frames
src, out = sys.argv[1], sys.argv[2]
DARK_NEAR = dict(fill="2", hi="3", boot="1", boot_rows=2, toe=1)
DARK_FAR = dict(fill="1", hi=None, boot="1", boot_rows=2, toe=1)
CFG = {
    "runner_viper": dict(clear=[(6, 21, 24, 31)], near_hip=(17, 20), far_hip=(12, 20), ground=30, lw=3, d=3,
                         near=DARK_NEAR, far=DARK_FAR),
    "runner_ghost": dict(clear=[(6, 20, 23, 31)], near_hip=(17, 19), far_hip=(13, 19), ground=29, lw=3, d=3,
                         near=dict(fill="1", hi="C", boot="2", boot_rows=2, toe=1), far=DARK_FAR),
    "runner_nova": dict(clear=[(6, 18, 17, 31)], near_hip=(13, 18), far_hip=(9, 18), ground=29, lw=4, d=3,
                        near=DARK_NEAR, far=DARK_FAR),
}


def attack(name, base):
    a = strip_outline(base)
    if name == "runner_viper":     # right mantis blade swung up-forward with a magenta slash crescent
        m = region(a, 22, 15, 31, 23)
        a = rotate(a, m, (22, 16), -50)
        arc(a, (20, 15), 13, -70, 70, "M", step=4); arc(a, (20, 15), 12, -60, 60, "w", step=5)
        arc(a, (20, 15), 14, -50, 50, "m", step=6)
    elif name == "runner_ghost":   # wrist deck fires a hack burst
        line(a, (24, 13), (31, 13), "C"); line(a, (24, 14), (30, 14), "w")
        for x, y in [(32, 11), (33, 13), (32, 16), (30, 10), (30, 17), (34, 14)]:
            put(a, x, y, "C")
        put(a, 31, 13, "w"); put(a, 32, 14, "w")
    elif name == "runner_nova":    # grenade launcher recoil, muzzle blast, plasma grenade leaving
        a = move(a, region(a, 16, 7, 25, 11), -1, 0)
        for x, y, ch in [(25, 9, "w"), (26, 9, "Y"), (26, 8, "O"), (26, 10, "O"), (27, 9, "Y"), (27, 7, "W"), (28, 8, "W")]:
            put(a, x, y, ch)
        for x, y, ch in [(31, 7, "G"), (32, 7, "G"), (31, 8, "G"), (32, 8, "L"), (30, 8, "w")]:
            put(a, x, y, ch)
    return add_outline(a)


for name, cfg in CFG.items():
    base = load(f"{src}/{name}.png")
    w1, w2 = walk_frames(base, cfg)
    Image.fromarray(crop(add_outline(strip_outline(base)), 32, 32), "RGBA").save(f"{out}/{name}.png")
    Image.fromarray(crop(w1, 32, 32), "RGBA").save(f"{out}/{name}_w1.png")
    Image.fromarray(crop(w2, 32, 32), "RGBA").save(f"{out}/{name}_w2.png")
    Image.fromarray(crop(attack(name, base), 32, 32, extra=6), "RGBA").save(f"{out}/{name}_atk.png")
    print(name, "ok")
