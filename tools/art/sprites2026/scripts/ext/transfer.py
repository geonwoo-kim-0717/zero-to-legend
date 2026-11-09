"""Add extended-palette detail to sprites made by the older pixel-edit pipelines (process.py + rig*.py).

For each unit: find the source + process.py settings that reproduce its 16-colour base sprite, render the same
base with the extended palette (process_ext.py, identical silhouette), then rebuild every frame pixel by pixel:
a frame pixel that came from the base (unchanged, or moved by the rig's layer shifts / mirroring) is found in the
16-colour base by local patch matching and takes the extended-palette colour from the same spot; pixels the rig
drew by hand (redrawn legs, muzzle flashes, slash arcs) keep their colour. Size, frame keys and facing never change.
usage: transfer.py search|apply  (paths below)"""
import sys, os, json, subprocess, itertools, glob
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); SCR = os.path.dirname(HERE)
ROOT = os.path.abspath(os.path.join(SCR, "..", "..", "..", ".."))
SRC = os.path.join(SCR, "..", "sources"); ASSETS = os.path.join(ROOT, "src", "assets")
OUTL = np.array([7, 6, 15])

UNITS = {  # unit: (base frame, frames, candidate sources)
    "drone": ("drone", ["drone", "drone_w2", "drone_aim"], ["drone"]),
    "thug": ("thug", ["thug", "thug_w2", "thug_aim"], ["thug"]),
    "gunner": ("gunner", ["gunner", "gunner_w2", "gunner_aim"], ["gunner"]),
    "psycho": ("psycho", ["psycho", "psycho_w2", "psycho_aim"], ["psycho"]),
    "kamikaze": ("kamikaze", ["kamikaze", "kamikaze_w2", "kamikaze_aim"], ["kamikaze"]),
    "rat_bot": ("rat_bot", ["rat_bot", "rat_bot_w2", "rat_bot_aim"], ["rat_bot"]),
    "corrupt_cop": ("corrupt_cop", ["corrupt_cop", "corrupt_cop_w2", "corrupt_cop_aim"], ["corrupt_cop"]),
    "sec_bot": ("sec_bot", ["sec_bot", "sec_bot_w2", "sec_bot_aim"], ["sec_bot"]),
    "sniper_turret": ("sniper_turret", ["sniper_turret", "sniper_turret_w2", "sniper_turret_aim"], ["sniper_turret"]),
    "glitch_ghost": ("glitch_ghost", ["glitch_ghost", "glitch_ghost_w2", "glitch_ghost_aim"], ["glitch_ghost"]),
    "player": ("player", ["player", "player_w1", "player_w2", "player_atk"], ["zero1", "zero2", "zero3"]),
    "runner_viper": ("runner_viper", ["runner_viper", "runner_viper_w1", "runner_viper_w2", "runner_viper_atk"], ["viper1", "viper2", "viper3"]),
    "runner_ghost": ("runner_ghost", ["runner_ghost", "runner_ghost_w1", "runner_ghost_w2", "runner_ghost_atk"], ["ghost1", "ghost2", "ghost3"]),
    "runner_nova": ("runner_nova", ["runner_nova", "runner_nova_w1", "runner_nova_w2", "runner_nova_atk"], ["nova1", "nova2", "nova3"]),
    "trooper_tank": ("trooper_tank", ["trooper_tank", "trooper_tank_w2", "trooper_tank_aim", "trooper_tank_charge"], ["tank"]),
    "trooper_melee": ("trooper_melee", ["trooper_melee", "trooper_melee_w2", "trooper_melee_aim", "trooper_melee_charge"], ["melee"]),
    "trooper_hacker": ("trooper_hacker", ["trooper_hacker", "trooper_hacker_w2", "trooper_hacker_aim", "trooper_hacker_charge"], ["hacker"]),
    "trooper_sniper": ("trooper_sniper", ["trooper_sniper", "trooper_sniper_w2", "trooper_sniper_aim", "trooper_sniper_charge"], ["sniper"]),
    "midboss2": ("midboss2_w1", ["midboss2_w1", "midboss2_w2", "midboss2_aim", "midboss2_charge"], ["rivet1", "rivet2", "rivet3", "brute"]),
    "boss2": ("boss2_w1", ["boss2_w1", "boss2_w2", "boss2_aim", "boss2_charge"], ["hexa1", "hexa2", "hexa3", "hexaward_side"]),
    "midboss3": ("midboss3_w1", ["midboss3_w1", "midboss3_w2", "midboss3_aim", "midboss3_charge"], ["prism1", "prism2", "prism3"]),
    "boss3": ("boss3_w1", ["boss3_w1", "boss3_w2", "boss3_aim", "boss3_charge"], ["core1", "core2", "core3"]),
}

def load(p): return np.asarray(Image.open(p).convert("RGBA")).astype(int)

def render(script, src, w, h, black, thr, tmp):
    args = ["python3", os.path.join(SCR, script), src, tmp, str(w), str(h)] + (["black"] if black else ["none"]) + [str(thr)]
    subprocess.run(args, check=True, capture_output=True)
    return load(tmp)

def solid(a): return (a[..., 3] > 0) & ~np.all(a[..., :3] == OUTL, -1)

def shifted(a, dx, dy):
    """b[y,x] = a[y+dy, x+dx] (out of range -> transparent)"""
    H, W = a.shape[:2]; b = np.zeros_like(a)
    ys, xs = slice(max(0, -dy), min(H, H - dy)), slice(max(0, -dx), min(W, W - dx))
    yd, xd = slice(max(0, dy), min(H, H + dy)), slice(max(0, dx), min(W, W + dx))
    b[ys, xs] = a[yd, xd]; return b

def pad_to(a, H, W):
    """centre a on an H x W canvas (frames like _aim are bigger than the base)"""
    out = np.zeros((max(H, a.shape[0]), max(W, a.shape[1]), 4), int)
    oy, ox = (out.shape[0] - a.shape[0]) // 2, (out.shape[1] - a.shape[1]) // 2
    out[oy:oy + a.shape[0], ox:ox + a.shape[1]] = a; return out, oy, ox

def best_offset(frame, base, R=8):
    fs = solid(frame); best = (-1, 0, 0)
    for dy in range(-R, R + 1):
        for dx in range(-R, R + 1):
            b = shifted(base, dx, dy)
            s = (fs & solid(b) & np.all(frame[..., :3] == b[..., :3], -1)).sum()
            if s > best[0]: best = (s, dx, dy)
    return best

def transfer(frame, b16, bx, R=4):
    H, W = frame.shape[:2]
    out = frame.copy(); fs = solid(frame); changed = 0; done = np.zeros(fs.shape, bool)
    bases = []
    for flip in (False, True):
        p16, oy, ox = pad_to(b16[:, ::-1] if flip else b16, H, W)
        px = pad_to(bx[:, ::-1] if flip else bx, H, W)[0]
        p16 = p16[:H, :W] if p16.shape[0] >= H else p16; px = px[:H, :W] if px.shape[0] >= H else px
        s, gdx, gdy = best_offset(frame, p16[:H, :W] if p16.shape[:2] != (H, W) else p16)
        bases.append((s, gdx, gdy, p16, px))
    bases.sort(key=lambda t: -t[0])
    for y, x in zip(*np.where(fs)):
        c = frame[y, x, :3]; pick = None
        for s, gdx, gdy, p16, px in bases[:2]:
            if s <= 0: continue
            for dy in range(gdy - R, gdy + R + 1):
                for dx in range(gdx - R, gdx + R + 1):
                    sy, sx = y + dy, x + dx
                    if not (0 <= sy < p16.shape[0] and 0 <= sx < p16.shape[1]): continue
                    if not (solid(p16[sy:sy+1, sx:sx+1])[0, 0] and (p16[sy, sx, :3] == c).all()): continue
                    sc = 0
                    for ny in (-1, 0, 1):
                        for nx in (-1, 0, 1):
                            fy, fx, qy, qx = y + ny, x + nx, sy + ny, sx + nx
                            if 0 <= fy < H and 0 <= fx < W and 0 <= qy < p16.shape[0] and 0 <= qx < p16.shape[1] \
                               and (frame[fy, fx] == p16[qy, qx]).all(): sc += 1
                    key = (sc, -abs(dx - gdx) - abs(dy - gdy))
                    if sc >= 6 and (pick is None or key > pick[0]): pick = (key, px[sy, sx, :3])
            if pick: break
        if pick is not None:
            out[y, x, :3] = pick[1]; changed += 1; done[y, x] = True
    return out.astype(np.uint8), changed, int(fs.sum()), done

# --- pass 2: pixels the patch match could not place (later hand edits, recoloured armour) ----------------------
# keep the pixel's own colour family (its 16-colour parent and the extended tones nearest to it) and pick the
# member whose brightness follows the source's light and shade at that spot (silhouette-aligned).
import sys as _sys; _sys.path.insert(0, HERE)
from palx import PALX
LUM = PALX @ np.array([0.299, 0.587, 0.114])
def _parent(c):
    rm = (PALX[1:16, 0] + c[0]) / 2; d = PALX[1:16] - c
    return 1 + int(np.argmin((2 + rm / 256) * d[:, 0] ** 2 + 4 * d[:, 1] ** 2 + (2 + (255 - rm) / 256) * d[:, 2] ** 2))
from palx import SKIN, BRIGHT
FAM = {}
for i in range(1, len(PALX)):
    if i in SKIN: continue                              # never turn armour or cloth into skin
    FAM.setdefault(_parent(PALX[i]) if i >= 16 else i, set()).add(i)

def mask_offset(frame, base, R=8):
    fm = frame[..., 3] > 0; best = (-1, 0, 0)
    for dy in range(-R, R + 1):
        for dx in range(-R, R + 1):
            s = (fm & (shifted(base, dx, dy)[..., 3] > 0)).sum()
            if s > best[0]: best = (s, dx, dy)
    return best[1], best[2]

def shade_pass(frame, done, srcx, strength=0.7):
    H, W = frame.shape[:2]
    sp = pad_to(srcx, H, W)[0][:H, :W]
    dx, dy = mask_offset(frame, sp); sp = shifted(sp, dx, dy)
    sl = sp[..., :3] @ np.array([0.299, 0.587, 0.114]); have = sp[..., 3] > 0
    out = frame.copy(); fs = solid(frame) & ~done & have
    idx = {}
    for y, x in zip(*np.where(fs)):
        k = int(np.argmin(((PALX - frame[y, x, :3]) ** 2).sum(1))); idx[(y, x)] = k
    for k in set(idx.values()):
        pts = [p for p, v in idx.items() if v == k]
        if k not in FAM or len(FAM[k]) < 2 or k in BRIGHT: continue
        mean = np.mean([sl[p] for p in pts])
        for p in pts:
            want = LUM[k] + (sl[p] - mean) * strength
            m = min(FAM[k], key=lambda i: abs(LUM[i] - want))
            out[p[0], p[1], :3] = PALX[m]
    return out

def search(tmpdir):
    found = {}
    for u, (bf, frames, srcs) in UNITS.items():
        cur = load(f"{ASSETS}/{bf}.png"); h, w = cur.shape[:2]; best = None
        for s, thr, black in itertools.product(srcs, (15, 20, 22, 25, 30), (False, True)):
            p = f"{SRC}/{s}.png"
            if not os.path.exists(p): continue
            b = render("process.py", p, w, h, black, thr, f"{tmpdir}/c.png")
            sc = best_offset(cur, b)[0] / max(1, solid(cur).sum())
            if best is None or sc > best[0]: best = (sc, s, thr, black)
        found[u] = best; print(u, best, flush=True)
    return found

if __name__ == "__main__":
    mode, tmp = sys.argv[1], sys.argv[2]
    os.makedirs(tmp, exist_ok=True)
    if mode == "search":
        json.dump(search(tmp), open(f"{tmp}/found.json", "w"), indent=1)
    else:
        found = json.load(open(f"{tmp}/found.json")); os.makedirs(f"{tmp}/out", exist_ok=True); rep = {}
        for u, (sc, s, thr, black) in found.items():
            bf, frames, _ = UNITS[u]; cur = load(f"{ASSETS}/{bf}.png"); h, w = cur.shape[:2]
            b16 = render("process.py", f"{SRC}/{s}.png", w, h, black, thr, f"{tmp}/b16.png")
            bx = render("process_ext.py", f"{SRC}/{s}.png", w, h, black, thr, f"{tmp}/bx.png")
            for f in frames:
                o, ch, n, done = transfer(load(f"{ASSETS}/{f}.png"), b16, bx)
                if ch < n: o = shade_pass(o.astype(int), done, bx).astype(np.uint8)
                Image.fromarray(o, "RGBA").save(f"{tmp}/out/{f}.png"); rep[f] = (ch, n)
                print(f, f"{ch}/{n} px from source", flush=True)
        json.dump(rep, open(f"{tmp}/report.json", "w"), indent=1)
