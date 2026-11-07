"""Weapon attack effect sprites, drawn procedurally in the 16-color palette (no outline: they read as light).
usage: python3 weapon_fx.py <out_dir>   ->  fx_<weapon>_<name>_<frame>.png, frames from 1, facing right (0 deg)."""
import math
import random
import sys

from PIL import Image

PAL = {"o": "07060F", "1": "1A1030", "2": "2A1747", "3": "3D1F66", "W": "8A7AA8", "w": "E8F7FF",
       "C": "00F0FF", "c": "0A7A8A", "M": "FF2BD6", "m": "8A1A70", "Y": "FFF23A", "O": "FF8A1F",
       "B": "8A3A10", "R": "FF2A3A", "G": "39FF88", "L": "B6FF3A"}
RGB = {k: tuple(int(v[i:i + 2], 16) for i in (0, 2, 4)) for k, v in PAL.items()}
OUT = sys.argv[1] if len(sys.argv) > 1 else "."
MANIFEST = []


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.im = Image.new("RGBA", (w, h), (0, 0, 0, 0))

    def put(self, x, y, ch):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            self.im.putpixel((x, y), RGB[ch] + (255,))

    def disk(self, cx, cy, r, ch):
        for y in range(int(cy - r - 1), int(cy + r + 2)):
            for x in range(int(cx - r - 1), int(cx + r + 2)):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                    self.put(x, y, ch)

    def ring(self, cx, cy, r, ch, thick=1.0, jitter=0.0, rnd=None):
        n = max(24, int(2 * math.pi * r * 2))
        for i in range(n):
            a = 2 * math.pi * i / n
            rr = r + (rnd.uniform(-jitter, jitter) if rnd and jitter else 0)
            for t in range(int(math.ceil(thick))):
                self.put(cx + math.cos(a) * (rr - t), cy + math.sin(a) * (rr - t), ch)

    def line(self, x0, y0, x1, y1, ch):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n):
            t = i / max(n - 1, 1)
            self.put(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, ch)

    def bolt(self, x0, y0, x1, y1, ch, rnd, segs=4, amp=2.0, core=None):
        pts = [(x0, y0)]
        for i in range(1, segs):
            t = i / segs
            px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            nx, ny = -(y1 - y0), x1 - x0
            ln = math.hypot(nx, ny) or 1
            o = rnd.uniform(-amp, amp)
            pts.append((px + nx / ln * o, py + ny / ln * o))
        pts.append((x1, y1))
        for a, b in zip(pts, pts[1:]):
            self.line(*a, *b, ch)
            if core:
                self.line(a[0], a[1] - 0, b[0], b[1], core) if False else None
        return pts


def save(cv, weapon, name, frame):
    fn = f"fx_{weapon}_{name}_{frame}.png"
    cv.im.save(f"{OUT}/{fn}")
    MANIFEST.append((weapon, name, frame, cv.w, cv.h))


def explosion(weapon, size, frames, core, mid, edge, dark, seed):
    """Expanding burst: bright core -> ring -> fading sparks."""
    rnd = random.Random(seed)
    c = (size - 1) / 2
    R = size / 2 - 2
    sparks = [(rnd.uniform(0, 2 * math.pi), rnd.uniform(0.5, 1.0)) for _ in range(18)]
    for f in range(frames):
        t = (f + 1) / frames
        cv = Canvas(size, size)
        if f == 0:
            cv.disk(c, c, R * 0.35, mid); cv.disk(c, c, R * 0.22, core)
        elif t < 0.7:
            r = R * (0.35 + t * 0.75)
            cv.disk(c, c, r, edge); cv.disk(c, c, r * 0.8, mid); cv.disk(c, c, r * 0.45, core)
            cv.ring(c, c, r, dark, thick=1, jitter=1.2, rnd=rnd)
        else:
            r = R * (0.75 + 0.25 * t)
            cv.ring(c, c, r, edge, thick=2 if f < frames - 1 else 1, jitter=1.5, rnd=rnd)
            cv.ring(c, c, r * 0.7, dark, thick=1, jitter=1.5, rnd=rnd)
            if f < frames - 1:
                cv.disk(c, c, r * 0.3, mid)
        for a, k in sparks:
            d = R * (0.4 + t * 0.6) * k
            if f > 0:
                cv.put(c + math.cos(a) * d, c + math.sin(a) * d, core if f < frames - 1 else edge)
        save(cv, weapon, "boom", f + 1)


def spark(weapon, name, size, frames, cols, seed, rays=6):
    rnd = random.Random(seed)
    c = (size - 1) / 2
    angs = [rnd.uniform(0, 2 * math.pi) for _ in range(rays)]
    for f in range(frames):
        cv = Canvas(size, size)
        L = (size / 2 - 1) * (0.5 + 0.5 * f / max(frames - 1, 1))
        for i, a in enumerate(angs):
            s = L * (0.3 if f == frames - 1 else 0.0)
            col = cols[min(f, len(cols) - 1)]
            cv.line(c + math.cos(a) * s, c + math.sin(a) * s, c + math.cos(a) * L, c + math.sin(a) * L, col)
        if f == 0:
            cv.disk(c, c, max(1, size / 8), "w")
        save(cv, weapon, name, f + 1)


def muzzle(weapon, size, frames, hot, warm, seed):
    """Flash pointing right from the left edge (the barrel sits at x=0)."""
    rnd = random.Random(seed)
    cy = (size - 1) / 2
    for f in range(frames):
        cv = Canvas(size, size)
        reach = size - 1 - f * (size // 4)
        if f < frames - 1:
            for y in range(size):
                spread = abs(y - cy) / (size / 2)
                L = reach * (1 - spread * 1.1)
                for x in range(int(max(0, L))):
                    cv.put(x, y, "w" if x < L * 0.35 and spread < 0.3 else hot if x < L * 0.7 else warm)
        else:
            for _ in range(4):
                cv.put(rnd.randint(1, size - 2), rnd.randint(1, size - 2), warm)
        save(cv, weapon, "muzzle", f + 1)


def main():
    rnd = random.Random(7)
    # smartPistol ---------------------------------------------------------
    cv = Canvas(8, 3)
    for x in range(8):
        cv.put(x, 1, "c" if x < 3 else "C" if x < 6 else "w")
    cv.put(6, 0, "c"); cv.put(6, 2, "c"); cv.put(7, 0, "C"); cv.put(7, 2, "C")
    save(cv, "smartPistol", "tracer", 1)
    muzzle("smartPistol", 8, 3, "C", "c", 1)
    spark("smartPistol", "hit", 8, 3, ["w", "C", "c"], 2)

    # mantisBlade: crescent slash, opening right ------------------------------
    for f in range(4):
        cv = Canvas(48, 32)
        cx, cy = 8, 16
        a0, a1 = -70, 70
        sweep = [0.45, 1.0, 1.0, 1.0][f]
        thick = [3, 5, 3, 1][f]
        for k in range(thick):
            r = 36 - k
            col = "w" if k == 0 and f < 2 else "C" if k < 3 else "c"
            if f == 3:
                col = "c"
            n = 90
            for i in range(n):
                t = i / (n - 1)
                if t > sweep:
                    break
                a = math.radians(a0 + (a1 - a0) * t)
                taper = math.sin(math.pi * t)
                if k > 0 and taper < 0.35 * k / thick:
                    continue
                x, y = cx + math.cos(a) * r, cy + math.sin(a) * r * 0.42
                if f == 3 and i % 3:
                    continue
                cv.put(x, y, col)
        save(cv, "mantisBlade", "slash", f + 1)

    # hackDrone zap -----------------------------------------------------------
    for f in range(3):
        cv = Canvas(12, 12)
        r2 = random.Random(30 + f)
        for _ in range(2 if f < 2 else 1):
            a = r2.uniform(0, math.pi)
            cv.bolt(6 - math.cos(a) * 5, 6 - math.sin(a) * 5, 6 + math.cos(a) * 5, 6 + math.sin(a) * 5,
                    ["L", "G", "G"][f], r2, segs=4, amp=2)
        if f == 0:
            cv.put(6, 6, "w"); cv.put(5, 6, "w")
        save(cv, "hackDrone", "zap", f + 1)

    # plasmaGrenade boom --------------------------------------------------------
    explosion("plasmaGrenade", 64, 5, "w", "M", "M", "m", 40)

    # monowire hit --------------------------------------------------------------
    for f in range(3):
        cv = Canvas(10, 10)
        if f < 2:
            cv.line(1, 8, 8, 1, "w" if f == 0 else "M")
            cv.line(2, 8, 8, 2, "M" if f == 0 else "m")
        for x, y in [(2, 2), (7, 7), (1, 5), (5, 8)][: 2 + f]:
            cv.put(x, y, "M" if f < 2 else "m")
        save(cv, "monowire", "hit", f + 1)

    # empField ring (hollow) + small arcs ----------------------------------------
    for f in range(2):
        cv = Canvas(128, 128)
        r2 = random.Random(50 + f)
        cv.ring(63.5, 63.5, 61, "c", thick=1, jitter=1.5, rnd=r2)
        cv.ring(63.5, 63.5, 60, "C", thick=1, jitter=1.0, rnd=r2)
        for _ in range(10):
            a = r2.uniform(0, 2 * math.pi)
            b = a + r2.uniform(0.15, 0.3)
            cv.bolt(63.5 + math.cos(a) * 60, 63.5 + math.sin(a) * 60, 63.5 + math.cos(b) * 60, 63.5 + math.sin(b) * 60,
                    "w", r2, segs=3, amp=3)
        save(cv, "empField", "ring", f + 1)
    for f in range(3):
        cv = Canvas(16, 16)
        r2 = random.Random(60 + f)
        cv.bolt(2, r2.randint(3, 12), 13, r2.randint(3, 12), ["w", "C", "c"][f], r2, segs=4, amp=3)
        save(cv, "empField", "arc", f + 1)

    # railgun: tileable beam piece + impact ---------------------------------------
    for f in range(2):
        cv = Canvas(16, 10)
        for x in range(16):
            for y, col in [(1, "c"), (2, "C"), (3, "C"), (4, "w"), (5, "w"), (6, "C"), (7, "C"), (8, "c")]:
                cv.put(x, y, col)
            if (x + f * 4) % 8 == 0:
                cv.put(x, 0, "C"); cv.put(x, 9, "C"); cv.put(x, 3, "w"); cv.put(x, 6, "w")
        save(cv, "railgun", "beam", f + 1)
    spark("railgun", "impact", 32, 3, ["w", "C", "c"], 70, rays=10)

    # shotgun ---------------------------------------------------------------------
    cv = Canvas(4, 3)
    for x, y, col in [(0, 1, "O"), (1, 1, "Y"), (2, 1, "Y"), (3, 1, "w"), (1, 0, "O"), (2, 0, "Y"), (1, 2, "O"), (2, 2, "Y")]:
        cv.put(x, y, col)
    save(cv, "shotgun", "pellet", 1)
    for f in range(3):
        cv = Canvas(24, 16)
        reach = [14, 23, 23][f]
        for y in range(16):
            for x in range(reach):
                half = 1 + x * 0.32
                if abs(y - 7.5) <= half:
                    edge = abs(y - 7.5) / half
                    if f == 2 and (x + y) % 3:
                        continue
                    col = "w" if x < reach * 0.3 and edge < 0.4 and f < 2 else "Y" if edge < 0.55 and f < 2 else "O" if f < 2 else "B"
                    cv.put(x, y, col)
        save(cv, "shotgun", "blast", f + 1)

    # turret muzzle ---------------------------------------------------------------
    for f in range(2):
        cv = Canvas(6, 6)
        pts = [(0, 2), (1, 2), (2, 2), (3, 2), (4, 2), (5, 2), (0, 3), (1, 3), (2, 3), (3, 3), (4, 3), (2, 1), (2, 4), (3, 0), (3, 5)]
        for x, y in pts[: 15 if f == 0 else 8]:
            cv.put(x, y, "w" if x < 2 else "Y" if f == 0 else "O")
        save(cv, "turret", "muzzle", f + 1)

    # microMissile ----------------------------------------------------------------
    rows = [["..oooooo..", "OYWOOOOWRo", "YwW1OOOWRR", "OYWOOOOWRo", "..oooooo.."],
            ["..oooooo..", ".RWOOOOWRo", "OYW1OOOWRR", ".RWOOOOWRo", "..oooooo.."]]
    for f, rs in enumerate(rows):
        cv = Canvas(10, 5)
        for y, r in enumerate(rs):
            for x, ch in enumerate(r):
                if ch != ".":
                    cv.put(x, y, ch)
        save(cv, "microMissile", "missile", f + 1)
    explosion("microMissile", 40, 4, "w", "Y", "O", "B", 80)

    # arcCoil hit -------------------------------------------------------------------
    spark("arcCoil", "hit", 16, 3, ["w", "C", "c"], 90, rays=7)

    # proxMine boom -----------------------------------------------------------------
    explosion("proxMine", 48, 4, "Y", "O", "R", "B", 100)

    with open(f"{OUT}/fx_manifest.txt", "w") as fh:
        fh.write("weapon\tname\tframes\tsize\n")
        seen = {}
        for w, n, f, W, H in MANIFEST:
            seen[(w, n)] = (max(f, seen.get((w, n), (0,))[0]), W, H)
        for (w, n), (f, W, H) in seen.items():
            fh.write(f"{w}\t{n}\t{f}\t{W}x{H}\n")
    print(len(MANIFEST), "frames")


if __name__ == "__main__":
    main()
