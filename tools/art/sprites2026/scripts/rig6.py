"""Hexaward redrawn facing right (walk x2, aim with pods firing, charge) + Rivet Crusher charge frame.
usage: rig6.py hexa_base.png rivet_base.png out_dir"""
import sys
from PIL import Image
from rig import load, strip_outline, add_outline, put, region, line, crop
from rig2 import recolor, layer_shift

hexa_src, rivet_src, out = sys.argv[1:4]


def speed_lines(a, rows, x0, x1, ch="W"):
    for i, y in enumerate(rows):
        s = x0 + (i % 3) * 2
        line(a, (s, y), (x1 - (i % 2) * 3, y), ch)


# --- Hexaward (48x44, aim/charge 64x60) ------------------------------------
b = strip_outline(load(hexa_src))
back_leg = region(b, 9, 28, 24, 43)
front_leg = region(b, 25, 25, 39, 43)
w1 = layer_shift(b, back_leg, 1, -2, under=True)              # back leg steps up
w2 = layer_shift(layer_shift(b, front_leg, 1, -2, under=True), region(b, 0, 0, 47, 24), 0, 1)  # front leg up, body dips

aim = recolor(b, region(b, 10, 1, 22, 11), {"m": "M", "1": "2"})   # pods open, tubes glow
aim = recolor(aim, region(aim, 26, 12, 33, 16), {"M": "w", "m": "M"})  # core flares
for x, y in [(12, -1), (14, -3), (19, -1), (21, -3)]:              # four missiles leaving the pods (up-right)
    line(aim, (x, y + 1), (x + 3, y - 3), "w"); put(aim, x + 4, y - 4, "R")
    put(aim, x, y + 2, "Y"); put(aim, x - 1, y + 3, "O"); put(aim, x - 2, y + 4, "W")

ch = b.copy()
upper = region(ch, 0, 0, 47, 26)
ch = layer_shift(ch, upper, 3, 2)                                  # lean forward and down
ch = layer_shift(ch, front_leg, 3, 0)                              # long stride
for x, y, c in [(6, 14, "Y"), (5, 15, "O"), (4, 16, "O"), (6, 16, "Y"), (3, 15, "R")]:  # rear thruster burst
    put(ch, x, y, c)
speed_lines(ch, [8, 12, 19, 24, 31, 37], -7, 4)
for x, y in [(4, 42), (1, 41), (6, 41), (-2, 42)]:                 # dust kicked up
    put(ch, x, y, "W"); put(ch, x + 1, y - 1, "3")

for name, img, (w, h, extra) in [("boss2_w1", w1, (48, 44, 0)), ("boss2_w2", w2, (48, 44, 0)),
                                  ("boss2_aim", aim, (48, 44, 8)), ("boss2_charge", ch, (48, 44, 8))]:
    Image.fromarray(crop(add_outline(img), w, h, extra), "RGBA").save(f"{out}/{name}.png")

# --- Rivet Crusher charge (36x36 -> 52x52) ---------------------------------
r = strip_outline(load(rivet_src))
r = layer_shift(r, region(r, 5, 4, 36, 24), 2, 1)                 # body pitched forward
r = layer_shift(r, region(r, 26, 14, 36, 21), 4, 0)               # pincers thrust out
line(r, (25, 17), (31, 16), "W"); line(r, (25, 19), (30, 18), "3")  # extended piston
r = recolor(r, region(r, 15, 4, 22, 9), {"Y": "R", "O": "R"})     # beacon red
speed_lines(r, [6, 10, 15, 20], -7, 2)
for x, y in [(-1, 31), (1, 33), (-3, 33), (2, 30), (-5, 31)]:     # tread dust behind
    put(r, x, y, "W"); put(r, x + 1, y, "3")
Image.fromarray(crop(add_outline(r), 36, 36, 8), "RGBA").save(f"{out}/midboss2_charge.png")
print("ok")
