import sys, os, glob
sys.path.insert(0, "/home/user/zero-to-legend/tools/art/sprites2026/scripts/counters")
from pix_ext import pix
from PIL import Image
os.makedirs("out", exist_ok=True)
for k in ("trooper_tank", "trooper_melee", "trooper_hacker", "trooper_sniper"):
    sc, S = open(f"scale_{k}.txt").read().split(); sc = float(sc); S = int(S)
    for f in sorted(glob.glob(f"full_{k}_*.png")):
        n = f[5:-4]; Image.fromarray(pix(f, sc, S + 12), "RGBA").save(f"out/{n}.png")
    print(k, len(glob.glob(f"out/{k}_*.png")))
