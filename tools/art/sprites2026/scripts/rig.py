"""Hand-rigged frames: legs are erased and redrawn as two real legs (near + far, far one darker),
coats sway as one piece, attack frames are per-character pixel edits (weapon swing / gun fire).
usage: rig.py src_dir out_dir"""
import sys
import numpy as np
from PIL import Image

PAL = {"o": "07060F", "1": "1A1030", "2": "2A1747", "3": "3D1F66", "W": "8A7AA8", "w": "E8F7FF",
       "C": "00F0FF", "c": "0A7A8A", "M": "FF2BD6", "m": "8A1A70", "Y": "FFF23A", "O": "FF8A1F",
       "B": "8A3A10", "R": "FF2A3A", "G": "39FF88", "L": "B6FF3A"}
COL = {k: np.array([int(v[i:i + 2], 16) for i in (0, 2, 4)] + [255], np.uint8) for k, v in PAL.items()}
OUT = COL["o"]
PAD = 8  # working margin; attack frames keep part of it (symmetrically, so the sprite centre never moves)


def load(path):
    a = np.asarray(Image.open(path).convert("RGBA")).copy()
    return np.pad(a, ((PAD, PAD), (PAD, PAD), (0, 0)))


def strip_outline(a):
    op = a[..., 3] > 0
    is_ol = op & np.all(a == OUT, -1)
    p = np.pad(op, 1)
    edge = ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])
    a = a.copy(); a[is_ol & edge] = 0
    return a


def add_outline(a):
    op = a[..., 3] > 0
    nb = np.zeros_like(op)
    nb[1:] |= op[:-1]; nb[:-1] |= op[1:]; nb[:, 1:] |= op[:, :-1]; nb[:, :-1] |= op[:, 1:]
    a = a.copy(); a[nb & ~op] = OUT
    return a


def put(a, x, y, ch):
    x, y = int(round(x)) + PAD, int(round(y)) + PAD
    if 0 <= y < a.shape[0] and 0 <= x < a.shape[1]:
        a[y, x] = OUT if ch == "o" else COL[ch]


def over(dst, src):
    m = src[..., 3] > 0
    dst = dst.copy(); dst[m] = src[m]
    return dst


def clear(a, rects):
    a = a.copy()
    for x0, y0, x1, y1 in rects:
        a[y0 + PAD:y1 + PAD + 1, x0 + PAD:x1 + PAD + 1] = 0
    return a


def leg(shape, hip, foot, lw, fill, hi=None, boot="1", boot_rows=2, toe=1, outline=False, lift=0):
    """Rasterise one leg on its own layer: thigh+shin as a thick line hip->foot, boot with a toe."""
    lay = np.zeros(shape, np.uint8)
    hx, hy = hip
    fx, fy = foot
    fy -= lift
    rows = range(int(hy), int(fy) + 1)
    for y in rows:
        t = (y - hy) / max(fy - hy, 1)
        cx = hx + (fx - hx) * t
        x0 = int(round(cx - (lw - 1) / 2))
        for x in range(x0, x0 + lw):
            is_boot = y > fy - boot_rows
            ch = boot if is_boot else (hi if (hi and x == x0 + lw - 1 and y > hy + (fy - hy) * 0.35) else fill)
            put(lay, x, y, ch)
        if y > fy - boot_rows:
            for k in range(1, toe + 1):
                put(lay, x0 + lw - 1 + k, y, boot)
    if outline:  # dark separator ring so the near leg reads in front of the far one
        op = lay[..., 3] > 0
        nb = np.zeros_like(op)
        nb[1:] |= op[:-1]; nb[:-1] |= op[1:]; nb[:, 1:] |= op[:, :-1]; nb[:, :-1] |= op[:, 1:]
        ring = nb & ~op
        ring[:int(hy) + PAD + 2] = False  # no ring across the hips/torso
        lay[ring] = OUT
    return lay


def sway(a, box, dx):
    x0, y0, x1, y1 = box
    out = a.copy()
    reg = a[y0 + PAD:y1 + PAD + 1, x0 + PAD:x1 + PAD + 1].copy()
    out[y0 + PAD:y1 + PAD + 1, x0 + PAD:x1 + PAD + 1] = 0
    sub = out[y0 + PAD:y1 + PAD + 1, x0 + PAD + dx:x1 + PAD + 1 + dx]
    m = reg[..., 3] > 0
    sub[m] = reg[m]
    return out


def walk_frames(base, cfg):
    body = clear(strip_outline(base), cfg["clear"])
    frames = []
    for phase in (1, -1):
        b = body
        for box in cfg.get("hem", []):
            b = sway(b, box, phase * cfg.get("hem_dx", 1))
        (nhx, nhy), (fhx, fhy) = cfg["near_hip"], cfg["far_hip"]
        d, g = cfg["d"], cfg["ground"]
        far = leg(base.shape, (fhx, fhy), (fhx - phase * d, g), cfg["lw"], **cfg["far"], lift=1 if phase == 1 else 0)
        near = leg(base.shape, (nhx, nhy), (nhx + phase * d, g), cfg["lw"], **cfg["near"], outline=True,
                   lift=0 if phase == 1 else 1)
        if cfg.get("legs_behind"):
            img = over(over(far, near), b)
        else:
            img = over(over(far, b), near)
        frames.append(add_outline(img))
    return frames


def crop(a, w, h, extra=0):
    """Back to the game canvas (+extra px on every side for attack frames)."""
    p = PAD - extra
    return a[p:p + h + 2 * extra, p:p + w + 2 * extra]


def region(a, x0, y0, x1, y1):
    m = np.zeros(a.shape[:2], bool)
    m[y0 + PAD:y1 + PAD + 1, x0 + PAD:x1 + PAD + 1] = True
    return m & (a[..., 3] > 0)


def move(a, mask, dx, dy):
    out = a.copy(); out[mask] = 0
    ys, xs = np.where(mask)
    out[ys + dy, xs + dx] = a[ys, xs]
    return out


def rotate(a, mask, pivot, deg):
    """Rotate the masked pixels about pivot (sprite coords) with nearest-neighbour inverse mapping."""
    px, py = pivot[0] + PAD, pivot[1] + PAD
    th = np.radians(deg)
    out = a.copy(); out[mask] = 0
    src = np.where(mask[..., None], a, 0)
    H, W = a.shape[:2]
    for y in range(H):
        for x in range(W):
            sx = np.cos(th) * (x - px) + np.sin(th) * (y - py) + px
            sy = -np.sin(th) * (x - px) + np.cos(th) * (y - py) + py
            ix, iy = int(round(sx)), int(round(sy))
            if 0 <= iy < H and 0 <= ix < W and src[iy, ix, 3] > 0:
                out[y, x] = src[iy, ix]
    return out


def line(a, p0, p1, ch, w=1):
    n = int(max(abs(p1[0] - p0[0]), abs(p1[1] - p0[1]))) + 1
    for i in range(n):
        t = i / max(n - 1, 1)
        x = p0[0] + (p1[0] - p0[0]) * t; y = p0[1] + (p1[1] - p0[1]) * t
        for k in range(w):
            put(a, x, y + k, ch)


def arc(a, c, r, a0, a1, ch, step=4):
    for deg in np.arange(a0, a1 + 0.1, step):
        put(a, c[0] + r * np.cos(np.radians(deg)), c[1] + r * np.sin(np.radians(deg)), ch)


# ---------------------------------------------------------------- per-character data
TROOP_NEAR = dict(fill="3", hi="W", boot="2", boot_rows=2, toe=1)
TROOP_FAR = dict(fill="1", hi="2", boot="1", boot_rows=2, toe=1)
CFG = {
    "boss": dict(size=(44, 44), clear=[(22, 33, 28, 43), (22, 36, 31, 43)], legs_behind=True,
                 near_hip=(25, 33), far_hip=(24, 33), ground=42, lw=4, d=3,
                 near=dict(fill="2", hi="3", boot="B", boot_rows=2, toe=1),
                 far=dict(fill="1", hi=None, boot="1", boot_rows=2, toe=1),
                 hem=[(11, 33, 21, 39), (28, 31, 33, 37)], hem_dx=1),
    "midboss": dict(size=(36, 36), clear=[(5, 24, 25, 35)], near_hip=(19, 23), far_hip=(11, 23),
                    ground=34, lw=6, d=3,
                    near=dict(fill="2", hi="B", boot="B", boot_rows=3, toe=1),
                    far=dict(fill="1", hi="m", boot="B", boot_rows=3, toe=1)),
    "trooper_tank": dict(size=(24, 24), clear=[(3, 16, 13, 23)], legs_behind=True, near_hip=(9, 16), far_hip=(7, 16),
                         ground=22, lw=3, d=3, near=TROOP_NEAR, far=TROOP_FAR),
    "trooper_melee": dict(size=(24, 24), clear=[(4, 16, 15, 23)], near_hip=(10, 16), far_hip=(8, 16),
                          ground=22, lw=3, d=3, near=TROOP_NEAR, far=TROOP_FAR),
    "trooper_hacker": dict(size=(24, 24), clear=[(6, 17, 17, 23)], near_hip=(12, 17), far_hip=(10, 17),
                           ground=22, lw=3, d=3, near=TROOP_NEAR, far=TROOP_FAR),
    "trooper_sniper": dict(size=(28, 24), clear=[(3, 15, 14, 23)], near_hip=(9, 15), far_hip=(7, 15),
                           ground=22, lw=3, d=3, near=TROOP_NEAR, far=TROOP_FAR),
}


def attack(name, walk1):
    """One attack frame per character, built on walk frame 1 (wide stance)."""
    a = strip_outline(walk1)
    if name == "midboss":   # engine-block hammer slammed down in front, swing smear from overhead
        m = region(a, 27, 10, 35, 26)
        a = move(a, m, 2, 8)
        line(a, (21, 13), (29, 20), "1", 3); line(a, (21, 12), (28, 18), "B")   # arm down to the grip
        arc(a, (22, 18), 15, -115, -25, "W", step=3); arc(a, (22, 18), 14, -110, -30, "w", step=4)
        for x, y, ch in [(37, 33, "Y"), (38, 31, "O"), (39, 34, "O"), (28, 33, "O"), (27, 31, "Y"), (40, 32, "Y")]:
            put(a, x, y, ch)                                # impact sparks where the hammer lands
    elif name == "boss":    # claw swipe: front arm thrown forward + three slash trails
        m = region(a, 29, 16, 34, 24)
        a = move(a, m, 0, 0); a[m] = 0
        line(a, (28, 14), (35, 12), "R", 3); line(a, (28, 16), (34, 14), "B", 1)
        put(a, 36, 12, "O"); put(a, 36, 13, "O"); put(a, 37, 12, "O"); put(a, 37, 13, "w")
        for k, ch in enumerate(["w", "R", "w"]):
            arc(a, (30, 18), 9 + k * 2, -60, 40, ch, step=6)
    elif name == "trooper_tank":  # shield bash forward with speed lines
        m = region(a, 14, 7, 21, 22)
        a = move(a, m, 3, 0)
        for y in (10, 14, 18):
            line(a, (10, y), (14, y), "c")
        for x, y, ch in [(25, 9, "w"), (26, 13, "w"), (25, 17, "w"), (26, 11, "C"), (26, 16, "C")]:
            put(a, x, y, ch)
    elif name == "trooper_melee":  # stun baton swung overhead-forward with an electric arc
        a[region(a, 15, 11, 21, 18)] = 0
        line(a, (13, 10), (17, 6), "3", 2)                 # arm raised forward
        put(a, 17, 5, "2"); put(a, 18, 5, "2")
        line(a, (18, 5), (22, 0), "C"); line(a, (19, 5), (23, 1), "c")
        put(a, 23, 0, "w")
        arc(a, (16, 8), 9, -55, 50, "C", step=7); arc(a, (16, 8), 10, -45, 40, "Y", step=12)
    elif name == "trooper_hacker":  # wrist hacking device fired forward: green burst + beam
        a[region(a, 15, 11, 17, 16)] = 0
        line(a, (14, 11), (18, 11), "3", 2)
        put(a, 19, 11, "c"); put(a, 19, 12, "c"); put(a, 20, 11, "G"); put(a, 20, 12, "G")
        line(a, (21, 11), (27, 11), "G"); line(a, (21, 12), (27, 12), "L")
        for x, y in [(23, 9), (24, 10), (23, 14), (24, 13), (26, 8), (26, 15)]:
            put(a, x, y, "G")
        put(a, 22, 11, "w"); put(a, 22, 12, "w")
    elif name == "trooper_sniper":  # shot: recoil back 1px, muzzle flash at the barrel tip, shell casing
        a = move(a, a[..., 3] > 0, -1, 0)
        for x, y, ch in [(24, 7, "w"), (25, 7, "w"), (26, 7, "Y"), (27, 7, "Y"), (28, 7, "O"), (29, 7, "O"),
                         (25, 6, "Y"), (25, 8, "Y"), (26, 5, "O"), (26, 9, "O"), (24, 6, "Y"), (24, 8, "Y")]:
            put(a, x, y, ch)
        put(a, 13, 2, "Y"); put(a, 14, 1, "O")
    return add_outline(a)


def main(src, out):
    for name, cfg in CFG.items():
        w, h = cfg["size"]
        base = load(f"{src}/{name}_w1.png" if name in ("boss", "midboss") else f"{src}/{name}.png")
        w1, w2 = walk_frames(base, cfg)
        atk = attack(name, w1)
        Image.fromarray(crop(w1, w, h), "RGBA").save(f"{out}/{name}_walk1.png")
        Image.fromarray(crop(w2, w, h), "RGBA").save(f"{out}/{name}_walk2.png")
        Image.fromarray(crop(atk, w, h, extra=6), "RGBA").save(f"{out}/{name}_attack.png")
        print(name, "ok")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
