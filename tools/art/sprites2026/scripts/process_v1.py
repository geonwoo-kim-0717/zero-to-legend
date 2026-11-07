"""Turn a 512px FLUX sprite on a flat dark background into an in-game PNG:
background removal -> optional recolor -> crop -> downscale -> 16-color palette -> 1px outline."""
import sys
from collections import deque
import numpy as np
from PIL import Image

PALETTE = ["#07060F", "#1A1030", "#2A1747", "#3D1F66", "#8A7AA8", "#E8F7FF", "#00F0FF", "#0A7A8A",
           "#FF2BD6", "#8A1A70", "#FFF23A", "#FF8A1F", "#8A3A10", "#FF2A3A", "#39FF88", "#B6FF3A"]
PAL = np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)] for h in PALETTE], dtype=np.float32)
OUTLINE = PAL[0]


def remove_bg(rgb, thr):
    h, w, _ = rgb.shape
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    close = np.linalg.norm(rgb - bg, axis=2) < thr
    mask = np.zeros((h, w), bool)  # True = background
    q = deque()
    for y in range(h):
        for x in (0, w - 1):
            if close[y, x] and not mask[y, x]:
                mask[y, x] = True; q.append((y, x))
    for x in range(w):
        for y in (0, h - 1):
            if close[y, x] and not mask[y, x]:
                mask[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and close[ny, nx] and not mask[ny, nx]:
                mask[ny, nx] = True; q.append((ny, nx))
    return ~mask, bg


def recolor_black(rgb, fg):
    """White/grey armor -> black armor (palette darks), keep saturated colors (red emblem, cyan shield)."""
    out = rgb.copy()
    mx, mn = rgb.max(2), rgb.min(2)
    sat = (mx - mn) / np.maximum(mx, 1)
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    armor = fg & (sat < 0.22) & (lum > 120)
    lvl = np.clip((lum - 120) / (255 - 120), 0, 1)
    shades = np.array([[0x1A, 0x10, 0x30], [0x2A, 0x17, 0x47], [0x3D, 0x1F, 0x66], [0x8A, 0x7A, 0xA8]], np.float32)
    idx = np.digitize(lvl, [0.35, 0.7, 0.93])
    out[armor] = shades[idx[armor]]
    return out


def quantize(rgb):
    d = ((rgb[:, :, None, :] - PAL[None, None]) ** 2).sum(-1)
    return PAL[d.argmin(-1)]


def main(src, dst, w, h, recolor, thr):
    rgb = np.asarray(Image.open(src).convert("RGB"), np.float32)
    fg, _ = remove_bg(rgb, thr)
    if recolor:
        rgb = recolor_black(rgb, fg)
    ys, xs = np.where(fg)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.dstack([rgb, fg.astype(np.float32) * 255])[y0:y1, x0:x1]
    # premultiply so background color does not bleed into edges when averaging
    rgba[..., :3] *= rgba[..., 3:4] / 255
    im = Image.fromarray(rgba.clip(0, 255).astype(np.uint8), "RGBA")
    iw, ih = w - 2, h - 2  # leave room for the 1px outline
    s = min(iw / im.width, ih / im.height)
    nw, nh = max(1, round(im.width * s)), max(1, round(im.height * s))
    small = np.asarray(im.resize((nw, nh), Image.BOX), np.float32)
    a = small[..., 3]
    col = small[..., :3] / np.maximum(a[..., None] / 255, 1e-3)
    solid = a > 110
    q = quantize(col.clip(0, 255))
    canvas = np.zeros((h, w, 4), np.uint8)
    ox, oy = (w - nw) // 2, h - 1 - nh  # bottom-aligned (feet on the ground), centered horizontally
    region = canvas[oy:oy + nh, ox:ox + nw]
    region[solid, :3] = q[solid]
    region[solid, 3] = 255
    op = canvas[..., 3] > 0
    nb = np.zeros_like(op)
    nb[1:] |= op[:-1]; nb[:-1] |= op[1:]; nb[:, 1:] |= op[:, :-1]; nb[:, :-1] |= op[:, 1:]
    ring = nb & ~op
    canvas[ring, :3] = OUTLINE
    canvas[ring, 3] = 255
    Image.fromarray(canvas, "RGBA").save(dst)
    used = {tuple(c) for c in canvas[canvas[..., 3] > 0][:, :3]}
    print(dst, f"{w}x{h}", "colors:", len(used))


if __name__ == "__main__":
    src, dst, w, h = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    recolor = len(sys.argv) > 5 and sys.argv[5] == "black"
    thr = float(sys.argv[6]) if len(sys.argv) > 6 else 20
    main(src, dst, w, h, recolor, thr)
