"""Zero (player): idle + walk x2 (redrawn legs behind the coat, coat hem sways) + fire frame."""
import sys
from PIL import Image
from rig import load, strip_outline, add_outline, put, region, move, crop, walk_frames
src, out = sys.argv[1], sys.argv[2]
cfg = dict(clear=[(7, 26, 19, 31)], legs_behind=True, near_hip=(14, 25), far_hip=(11, 25), ground=30, lw=3, d=2,
           near=dict(fill="2", hi="3", boot="1", boot_rows=2, toe=1),
           far=dict(fill="1", hi=None, boot="1", boot_rows=2, toe=1),
           hem=[(6, 22, 19, 25)], hem_dx=1)
base = load(src)
w1, w2 = walk_frames(base, cfg)
a = strip_outline(base)
a = move(a, region(a, 19, 6, 26, 13), -1, 0)                      # recoil
for x, y, ch in [(24, 8, "w"), (25, 8, "w"), (26, 8, "Y"), (27, 8, "Y"), (28, 8, "O"),
                 (25, 7, "Y"), (25, 9, "Y"), (26, 6, "O"), (26, 10, "O"), (24, 7, "Y"), (24, 9, "Y")]:
    put(a, x, y, ch)                                                # muzzle flash
put(a, 17, 6, "Y")                                                  # ejected casing
Image.fromarray(crop(add_outline(strip_outline(base)), 32, 32), "RGBA").save(f"{out}/player.png")
Image.fromarray(crop(w1, 32, 32), "RGBA").save(f"{out}/player_w1.png")
Image.fromarray(crop(w2, 32, 32), "RGBA").save(f"{out}/player_w2.png")
Image.fromarray(crop(add_outline(a), 32, 32, extra=6), "RGBA").save(f"{out}/player_atk.png")
print("zero ok")
