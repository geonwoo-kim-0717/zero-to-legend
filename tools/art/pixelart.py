import random, math, sys, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 and __name__ == '__main__' else None
P = dict(BG='#07060f', UI='#1a1030', GRID='#2a1747', VIO='#3d1f66', DIM='#8a7aa8', WHITE='#e8f7ff',
         CYAN='#00f0ff', CYAND='#0a7a8a', MAG='#ff2bd6', MAGD='#8a1a70', YEL='#fff23a', ORG='#ff8a1f',
         RUST='#8a3a10', RED='#ff2a3a', GRN='#39ff88', LIME='#b6ff3a')
def C(k, a=255):
    h = P.get(k, k); return tuple(int(h[i:i+2], 16) for i in (1, 3, 5)) + (a,)
F = lambda s: ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", s)
FB = lambda s: ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", s)

class Spr:
    def __init__(s, w, h):
        s.w, s.h = w, h
        s.im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); s.d = ImageDraw.Draw(s.im)
    def r(s, x0, y0, x1, y1, k): s.d.rectangle([x0, y0, x1, y1], fill=C(k))
    def p(s, x, y, k):
        if 0 <= x < s.w and 0 <= y < s.h: s.im.putpixel((x, y), C(k))
    def poly(s, pts, k): s.d.polygon(pts, fill=C(k))
    def l(s, x0, y0, x1, y1, k): s.d.line([x0, y0, x1, y1], fill=C(k))
    def e(s, x0, y0, x1, y1, k): s.d.ellipse([x0, y0, x1, y1], fill=C(k))
    def outline(s, k='BG'):
        src = s.im.copy(); px = src.load(); out = s.im.load()
        for y in range(s.h):
            for x in range(s.w):
                if px[x, y][3] == 0:
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < s.w and 0 <= ny < s.h and px[nx, ny][3] > 0:
                            out[x, y] = C(k); break
        return s

# ───────────────────────── 러너 4종 (32x32) ─────────────────────────
def zero():
    s = Spr(32, 32)
    s.r(11, 21, 14, 27, 'UI'); s.r(17, 21, 20, 27, 'UI'); s.r(11, 21, 11, 27, 'VIO'); s.r(17, 21, 17, 27, 'VIO')
    s.r(10, 28, 14, 29, 'BG'); s.r(17, 28, 21, 29, 'BG'); s.r(10, 29, 14, 29, 'CYAND'); s.r(17, 29, 21, 29, 'CYAND')
    s.r(10, 11, 21, 23, 'VIO'); s.r(14, 12, 17, 20, 'UI'); s.r(15, 12, 16, 20, 'CYAND')
    s.r(13, 11, 13, 22, 'CYAN'); s.r(18, 11, 18, 22, 'CYAN'); s.r(10, 18, 21, 18, 'UI'); s.r(15, 18, 16, 18, 'YEL')
    s.r(10, 23, 21, 23, 'GRID')
    s.r(7, 12, 9, 19, 'VIO'); s.r(22, 12, 24, 19, 'VIO'); s.r(7, 18, 9, 18, 'CYAN'); s.r(22, 18, 24, 18, 'CYAN')
    s.r(7, 20, 9, 21, 'DIM'); s.r(22, 20, 24, 21, 'DIM')
    s.r(25, 19, 29, 20, 'DIM'); s.r(25, 21, 26, 22, 'UI'); s.p(29, 19, 'WHITE')
    s.r(12, 4, 19, 10, 'DIM'); s.r(14, 11, 17, 11, 'DIM')
    s.r(11, 2, 20, 5, 'UI'); s.r(11, 2, 20, 2, 'VIO'); s.r(11, 5, 11, 8, 'UI'); s.r(20, 5, 20, 8, 'UI')
    s.p(14, 1, 'UI'); s.p(17, 1, 'UI'); s.p(18, 1, 'VIO')
    s.r(12, 6, 19, 7, 'CYAN'); s.p(13, 6, 'WHITE'); s.p(14, 6, 'WHITE'); s.r(12, 8, 19, 8, 'CYAND'); s.r(15, 9, 16, 9, 'MAGD')
    s.p(10, 11, 'CYAN'); s.p(21, 11, 'CYAN'); s.p(13, 4, 'WHITE')
    return s.outline()

def viper():
    s = Spr(32, 32)
    s.r(10, 21, 14, 27, 'BG'); s.r(17, 21, 21, 27, 'BG'); s.r(10, 22, 10, 26, 'MAGD'); s.r(21, 22, 21, 26, 'MAGD')
    s.r(9, 28, 14, 29, 'UI'); s.r(17, 28, 22, 29, 'UI'); s.r(9, 29, 14, 29, 'MAGD'); s.r(17, 29, 22, 29, 'MAGD')
    s.r(8, 11, 23, 21, 'UI'); s.r(14, 13, 17, 16, 'MAGD'); s.r(11, 12, 20, 17, 'DIM'); s.r(11, 12, 20, 12, 'WHITE')
    s.r(14, 13, 17, 16, 'MAGD'); s.r(15, 14, 16, 15, 'MAG'); s.r(11, 17, 20, 17, 'VIO'); s.r(12, 19, 19, 19, 'VIO'); s.r(12, 21, 19, 21, 'VIO')
    s.r(4, 11, 7, 20, 'DIM'); s.r(7, 12, 7, 20, 'VIO'); s.r(4, 11, 7, 11, 'WHITE'); s.r(5, 14, 6, 14, 'MAG'); s.r(5, 17, 6, 17, 'MAG')
    s.r(24, 11, 27, 20, 'DIM'); s.r(24, 12, 24, 20, 'VIO'); s.r(24, 11, 27, 11, 'WHITE'); s.r(25, 14, 26, 14, 'MAG'); s.r(25, 17, 26, 17, 'MAG')
    s.r(4, 21, 7, 22, 'UI'); s.r(24, 21, 27, 22, 'UI')
    s.l(28, 13, 31, 2, 'WHITE'); s.l(29, 13, 31, 3, 'MAG'); s.l(3, 13, 0, 2, 'WHITE'); s.l(2, 13, 0, 3, 'MAG')
    s.r(12, 4, 19, 10, 'DIM'); s.r(12, 4, 19, 5, 'VIO'); s.r(14, 1, 17, 4, 'MAG'); s.r(15, 0, 16, 1, 'MAG'); s.r(14, 3, 17, 4, 'MAGD')
    s.r(13, 6, 14, 7, 'BG'); s.p(13, 6, 'WHITE'); s.r(16, 6, 18, 8, 'BG'); s.p(17, 7, 'RED'); s.r(13, 9, 18, 10, 'BG')
    s.p(14, 9, 'DIM'); s.p(16, 9, 'DIM'); s.p(18, 9, 'DIM')
    s.p(8, 10, 'WHITE'); s.p(23, 10, 'WHITE'); s.p(9, 11, 'WHITE'); s.p(22, 11, 'WHITE')
    return s.outline()

def ghost():
    s = Spr(32, 32)
    s.poly([(8, 12), (23, 12), (26, 29), (5, 29)], 'UI'); s.r(14, 12, 17, 27, 'BG')
    s.l(9, 12, 6, 28, 'VIO'); s.l(22, 12, 25, 28, 'VIO'); s.r(8, 29, 23, 29, 'GRID')
    s.poly([(16, 0), (23, 6), (22, 12), (10, 12), (9, 6)], 'UI')
    s.l(16, 0, 23, 6, 'VIO'); s.l(16, 0, 9, 6, 'VIO'); s.r(11, 11, 20, 12, 'VIO')
    s.r(12, 5, 19, 10, 'BG'); s.r(16, 7, 17, 8, 'GRN'); s.p(16, 7, 'WHITE'); s.p(13, 8, 'CYAND'); s.p(14, 8, 'CYAND')
    for y, x0, x1, k in ((14, 24, 27, 'CYAN'), (18, 4, 7, 'MAG'), (22, 25, 28, 'CYAN'), (25, 3, 6, 'MAG'), (16, 3, 6, 'CYAND')):
        s.r(x0, y, x1, y, k)
    s.r(13, 20, 14, 21, 'DIM'); s.r(19, 19, 22, 20, 'DIM'); s.l(23, 19, 29, 13, 'CYAN'); s.l(23, 20, 29, 14, 'CYAND')
    s.p(29, 13, 'WHITE')
    s.r(11, 28, 14, 29, 'BG'); s.r(17, 28, 20, 29, 'BG')
    return s.outline()

def nova():
    s = Spr(32, 32)
    s.r(8, 10, 23, 19, 'UI'); s.r(8, 10, 8, 19, 'VIO')
    s.r(11, 22, 14, 27, 'UI'); s.r(17, 22, 20, 27, 'UI'); s.r(11, 24, 14, 25, 'ORG'); s.r(17, 24, 20, 25, 'ORG')
    s.r(10, 28, 14, 29, 'RUST'); s.r(17, 28, 21, 29, 'RUST')
    s.r(10, 11, 21, 21, 'RUST'); s.r(10, 11, 21, 12, 'UI')
    s.r(10, 19, 21, 19, 'YEL')
    for x in range(10, 22, 4): s.r(x, 19, x + 1, 19, 'BG')
    for x in (11, 14, 17): s.r(x, 20, x + 1, 21, 'MAG'); s.p(x, 19, 'WHITE')
    s.r(7, 12, 9, 18, 'ORG'); s.r(22, 12, 24, 18, 'ORG'); s.r(7, 19, 9, 20, 'UI'); s.r(22, 19, 24, 20, 'UI')
    s.e(25, 16, 30, 21, 'MAG'); s.p(27, 18, 'YEL'); s.p(28, 18, 'YEL'); s.p(27, 15, 'WHITE'); s.p(28, 15, 'WHITE')
    s.r(12, 8, 19, 10, 'DIM'); s.r(14, 9, 17, 10, 'UI'); s.p(15, 10, 'DIM'); s.p(16, 10, 'DIM')
    s.r(11, 2, 20, 7, 'ORG'); s.r(11, 2, 20, 2, 'YEL'); s.r(15, 2, 16, 7, 'YEL')
    s.r(12, 6, 19, 8, 'BG'); s.r(13, 7, 14, 7, 'YEL'); s.r(17, 7, 18, 7, 'YEL'); s.p(13, 7, 'WHITE'); s.p(17, 7, 'WHITE')
    s.r(10, 3, 10, 8, 'ORG'); s.r(21, 3, 21, 8, 'ORG')
    return s.outline()

# ───────────────────────── 적 4종 ─────────────────────────
def drone():
    s = Spr(16, 16)
    s.poly([(8, 0), (15, 7), (8, 15), (1, 7)], 'MAG'); s.poly([(8, 3), (12, 7), (8, 11), (4, 7)], 'MAGD')
    s.r(7, 6, 8, 8, 'WHITE'); s.p(8, 7, 'RED'); s.r(0, 7, 1, 8, 'CYAN'); s.r(14, 7, 15, 8, 'CYAN'); s.p(8, 14, 'YEL'); s.p(8, 1, 'WHITE')
    return s.outline()

def thug():
    s = Spr(20, 20)
    s.r(6, 15, 9, 18, 'UI'); s.r(11, 15, 14, 18, 'UI'); s.r(5, 19, 9, 19, 'BG'); s.r(11, 19, 15, 19, 'BG')
    s.r(5, 8, 14, 15, 'ORG'); s.r(5, 13, 14, 15, 'RUST'); s.r(9, 9, 10, 15, 'UI')
    s.r(3, 9, 4, 14, 'ORG'); s.r(15, 9, 16, 14, 'ORG'); s.r(3, 15, 4, 16, 'DIM'); s.r(15, 15, 16, 16, 'DIM')
    s.p(3, 8, 'WHITE'); s.p(16, 8, 'WHITE'); s.p(5, 8, 'WHITE'); s.p(14, 8, 'WHITE')
    s.r(7, 2, 12, 7, 'DIM'); s.r(7, 2, 12, 3, 'RED'); s.r(13, 3, 14, 4, 'RED'); s.p(14, 5, 'RED')
    s.p(8, 5, 'BG'); s.p(11, 5, 'BG'); s.r(8, 4, 9, 4, 'BG'); s.r(10, 4, 11, 4, 'BG'); s.r(9, 7, 10, 7, 'BG')
    s.r(17, 4, 18, 14, 'RUST'); s.r(17, 3, 18, 7, 'DIM'); s.p(19, 5, 'WHITE'); s.p(16, 6, 'WHITE')
    return s.outline()

def gunner():
    s = Spr(20, 20)
    s.r(6, 15, 9, 18, 'UI'); s.r(11, 15, 14, 18, 'UI'); s.r(5, 19, 9, 19, 'BG'); s.r(11, 19, 15, 19, 'BG')
    s.r(5, 8, 14, 15, 'LIME'); s.r(6, 9, 13, 12, 'UI'); s.r(6, 9, 13, 9, 'DIM'); s.r(5, 14, 14, 14, 'YEL')
    for x in range(5, 15, 3): s.p(x, 14, 'BG')
    s.r(3, 9, 4, 14, 'LIME'); s.r(3, 15, 4, 15, 'DIM'); s.r(14, 9, 17, 10, 'LIME')
    s.r(16, 10, 19, 11, 'DIM'); s.r(17, 12, 18, 13, 'UI'); s.p(19, 10, 'YEL'); s.p(19, 9, 'YEL'); s.p(19, 12, 'YEL')
    s.r(6, 2, 13, 7, 'UI'); s.r(6, 2, 13, 2, 'VIO'); s.r(7, 4, 13, 5, 'RED'); s.p(8, 4, 'WHITE'); s.r(8, 6, 12, 7, 'DIM')
    return s.outline()

def psycho():
    s = Spr(24, 24)
    s.r(7, 17, 11, 22, 'UI'); s.r(13, 17, 17, 22, 'UI'); s.p(9, 19, 'CYAN'); s.p(15, 19, 'CYAN'); s.r(6, 23, 11, 23, 'BG'); s.r(13, 23, 18, 23, 'BG')
    s.r(5, 8, 18, 17, 'CYAND'); s.r(8, 10, 15, 14, 'BG')
    for x, k in ((9, 'MAG'), (11, 'MAG'), (13, 'MAG'), (10, 'GRN'), (12, 'GRN')): s.p(x, 11 if k == 'MAG' else 12, k)
    s.r(8, 14, 15, 14, 'DIM'); s.r(5, 8, 18, 8, 'CYAN')
    s.r(2, 9, 4, 18, 'DIM'); s.r(2, 9, 4, 9, 'WHITE'); s.r(19, 9, 21, 15, 'DIM'); s.r(19, 9, 21, 9, 'WHITE')
    s.r(2, 19, 4, 20, 'CYAND')
    s.l(22, 15, 22, 2, 'WHITE'); s.l(23, 15, 23, 4, 'CYAN')
    s.r(9, 2, 14, 7, 'DIM'); s.r(10, 4, 11, 5, 'RED'); s.r(12, 4, 13, 5, 'RED'); s.r(10, 6, 13, 6, 'BG')
    s.p(11, 6, 'WHITE'); s.p(13, 6, 'WHITE'); s.l(14, 3, 17, 1, 'CYAN'); s.l(9, 3, 6, 1, 'MAG'); s.r(9, 2, 14, 2, 'VIO')
    return s.outline()

# ───────────────────────── 카드 ─────────────────────────
def glow_of(spr, k, zoom, rad):
    big = spr.im.resize((spr.w * zoom, spr.h * zoom), Image.NEAREST)
    a = big.split()[3]
    col = Image.new('RGBA', big.size, C(k, 255)); col.putalpha(a)
    pad = rad * 3
    canvas = Image.new('RGBA', (big.width + pad * 2, big.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(col, (pad, pad), col)
    g = canvas.filter(ImageFilter.GaussianBlur(rad))
    g.putalpha(g.split()[3].point(lambda v: min(255, int(v * 0.9))))
    return g, pad

def grid_bg(w, h, cell=16):
    im = Image.new('RGBA', (w, h), C('BG')); d = ImageDraw.Draw(im)
    for x in range(0, w, cell): d.line([x, 0, x, h], fill=C('GRID'))
    for y in range(0, h, cell): d.line([0, y, w, y], fill=C('GRID'))
    return im

def silhouette(spr, k='WHITE'):
    im = Image.new('RGBA', spr.im.size, (0, 0, 0, 0)); col = Image.new('RGBA', spr.im.size, C(k)); col.putalpha(spr.im.split()[3]); return col

def card(spr, path, tag, title, role, notes, accent, crowd=True):
    W, H = 960, 700
    im = Image.new('RGBA', (W, H), C('BG')); d = ImageDraw.Draw(im)
    d.text((40, 24), tag, font=F(14), fill=C('DIM')); d.text((40, 44), title, font=FB(34), fill=C(accent)); d.text((40, 90), role, font=F(16), fill=C('WHITE'))
    zoom = max(4, 400 // max(spr.w, spr.h))
    pw, ph = 440, 440; px0, py0 = 40, 130
    panel = grid_bg(pw // zoom + 1, ph // zoom + 1, 8).resize(((pw // zoom + 1) * zoom, (ph // zoom + 1) * zoom), Image.NEAREST).crop((0, 0, pw, ph))
    g, pad = glow_of(spr, accent, zoom, zoom)
    big = spr.im.resize((spr.w * zoom, spr.h * zoom), Image.NEAREST)
    ox, oy = (pw - big.width) // 2, (ph - big.height) // 2
    panel.alpha_composite(g, (ox - pad, oy - pad)); panel.alpha_composite(big, (ox, oy))
    im.alpha_composite(panel, (px0, py0)); d.rectangle([px0 - 1, py0 - 1, px0 + pw, py0 + ph], outline=C('VIO'))
    d.text((px0, py0 + ph + 8), f"{spr.w}x{spr.h} px canvas   shown {zoom}x", font=F(13), fill=C('DIM'))
    # 인게임 크기
    rx = 520
    d.text((rx, 130), "IN-GAME SIZE  (real pixels, shown 3x)", font=FB(14), fill=C('CYAN'))
    cw, ch = 130, 72
    mock = grid_bg(cw, ch, 32)
    rnd = random.Random(7)
    if crowd:
        for _ in range(14):
            ex, ey = rnd.randint(0, cw - 16), rnd.randint(0, ch - 16)
            if abs(ex - cw // 2) < 22 and abs(ey - ch // 2) < 22: continue
            dd = ImageDraw.Draw(mock); dd.rectangle([ex, ey, ex + 13, ey + 13], outline=C('MAG'), fill=C('MAGD'))
    mock.alpha_composite(spr.im, (cw // 2 - spr.w // 2, ch // 2 - spr.h // 2))
    im.alpha_composite(mock.resize((cw * 3, ch * 3), Image.NEAREST), (rx, 156)); d.rectangle([rx - 1, 155, rx + cw * 3, 156 + ch * 3], outline=C('VIO'))
    # 실루엣 + 팔레트
    sy = 156 + ch * 3 + 24
    d.text((rx, sy), "SILHOUETTE", font=FB(14), fill=C('CYAN'))
    sil = silhouette(spr).resize((spr.w * 4, spr.h * 4), Image.NEAREST)
    sp = Image.new('RGBA', (spr.w * 4 + 16, spr.h * 4 + 16), C('UI')); sp.alpha_composite(sil, (8, 8)); im.alpha_composite(sp, (rx, sy + 24))
    cols = []
    for pxl in spr.im.get_flattened_data() if hasattr(spr.im, 'get_flattened_data') else spr.im.getdata():
        if pxl[3] and pxl not in cols: cols.append(pxl)
    d.text((rx + 200, sy), "COLORS USED", font=FB(14), fill=C('CYAN'))
    names = {tuple(C(k)): k for k in P}
    for i, c in enumerate(cols[:12]):
        cx = rx + 200 + (i % 6) * 36; cy = sy + 26 + (i // 6) * 36
        d.rectangle([cx, cy, cx + 28, cy + 28], fill=c, outline=C('VIO'))
    ny = sy + 24 + max(spr.h * 4 + 16, 80) + 18
    for i, n in enumerate(notes):
        d.text((rx, ny + i * 22), "- " + n, font=F(13), fill=C('WHITE'))
    im.convert('RGB').save(path)

# ───────────────────────── 배경 ─────────────────────────
SW, SH = 480, 270
def overlay_glow(base, spots):
    ov = Image.new('RGBA', base.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    for x, y, rx, ry, col, a in spots: d.ellipse([x - rx, y - ry, x + rx, y + ry], fill=C(col, a))
    ov = ov.filter(ImageFilter.GaussianBlur(14)); base.alpha_composite(ov)

def rain(base, n, seed, col='CYAND', a=150):
    rnd = random.Random(seed); d = ImageDraw.Draw(base)
    for _ in range(n):
        x, y = rnd.randint(0, SW), rnd.randint(0, SH); d.line([x, y, x - 2, y + 6], fill=C(col, a))

def actors(base, seed):
    rnd = random.Random(seed)
    base.alpha_composite(drone().im, (330, 70)); base.alpha_composite(drone().im, (120, 190)); base.alpha_composite(drone().im, (375, 190))
    base.alpha_composite(thug().im, (110, 95)); base.alpha_composite(thug().im, (350, 140)); base.alpha_composite(gunner().im, (160, 60))
    d = ImageDraw.Draw(base)
    for bx, by in ((276, 134), (292, 129), (308, 124)): d.rectangle([bx, by, bx + 2, by + 2], fill=C('YEL'))
    d.rectangle([140, 80, 142, 82], fill=C('RED')); d.rectangle([180, 100, 182, 102], fill=C('RED'))
    base.alpha_composite(zero().im, (224, 118))

def scene_slum():
    rnd = random.Random(1)
    im = Image.new('RGBA', (SW, SH), C('BG')); d = ImageDraw.Draw(im)
    for gy in range(40, SH, 8):
        for gx in range(0, SW, 8):
            if rnd.random() < 0.25: d.rectangle([gx, gy, gx + 7, gy + 7], fill=C('UI'))
    for _ in range(140): d.point((rnd.randint(0, SW), rnd.randint(42, SH)), fill=C('GRID'))
    for _ in range(9):
        x, y = rnd.randint(10, SW - 60), rnd.randint(60, SH - 20); d.line([x, y, x + rnd.randint(10, 40), y + rnd.randint(-6, 6)], fill=C('VIO'))
    d.rectangle([0, 0, SW, 38], fill=C('UI')); d.rectangle([0, 38, SW, 40], fill=C('VIO'))
    for x in range(0, SW, 40): d.rectangle([x + 6, 8, x + 24, 30], fill=C('BG'), outline=C('GRID'))
    d.rectangle([60, 10, 140, 28], outline=C('MAG'), width=2); d.rectangle([64, 14, 136, 24], fill=C('MAGD'))
    d.rectangle([300, 8, 330, 32], outline=C('CYAN'), width=2); d.rectangle([304, 12, 326, 28], fill=C('CYAND'))
    d.rectangle([410, 6, 416, 34], fill=C('YEL'))
    d.ellipse([60, 190, 90, 200], fill=C('GRID')); d.ellipse([390, 100, 450, 120], fill=C('VIO')); d.ellipse([200, 215, 270, 235], fill=C('VIO')); d.ellipse([20, 120, 60, 134], fill=C('VIO'))
    for (x0, y0, x1, y1) in ((390, 100, 450, 120), (200, 215, 270, 235), (20, 120, 60, 134)):
        d.line([x0 + 8, y0 + 3, x0 + 22, y0 + 3], fill=C('MAG')); d.line([x0 + 20, y0 + 6, x0 + 40, y0 + 6], fill=C('CYAN'))
    d.ellipse([430, 200, 462, 232], fill=C('UI'), outline=C('DIM')); d.line([432, 216, 460, 216], fill=C('DIM')); d.line([446, 202, 446, 230], fill=C('DIM'))
    for (x, y) in ((20, 60), (440, 56), (28, 230)):
        d.rectangle([x, y, x + 17, y + 17], fill=C('RUST'), outline=C('BG')); d.line([x, y, x + 17, y + 17], fill=C('BG')); d.line([x + 17, y, x, y + 17], fill=C('BG'))
    d.rectangle([300, 230, 312, 246], fill=C('DIM'), outline=C('BG')); d.rectangle([298, 228, 314, 231], fill=C('WHITE'))
    overlay_glow(im, [(100, 60, 90, 40, 'MAG', 70), (315, 60, 60, 40, 'CYAN', 60), (420, 110, 40, 15, 'MAG', 60)])
    rain(im, 140, 3); actors(im, 1); return im

def scene_industrial():
    rnd = random.Random(2)
    im = Image.new('RGBA', (SW, SH), C('UI')); d = ImageDraw.Draw(im)
    for gx in range(0, SW, 32): d.line([gx, 0, gx, SH], fill=C('BG'))
    for gy in range(0, SH, 32): d.line([0, gy, SW, gy], fill=C('BG'))
    for gx in range(0, SW, 32):
        for gy in range(0, SH, 32):
            for ox, oy in ((3, 3), (27, 3), (3, 27), (27, 27)): d.point((gx + ox, gy + oy), fill=C('DIM'))
    for _ in range(80): d.point((rnd.randint(0, SW), rnd.randint(0, SH)), fill=C('GRID'))
    d.rectangle([0, 0, SW, 30], fill=C('BG'))
    for y, k in ((6, 'RUST'), (18, 'RUST')):
        d.rectangle([0, y, SW, y + 6], fill=C(k)); d.line([0, y + 1, SW, y + 1], fill=C('ORG'))
    for x in range(30, SW, 90): d.rectangle([x, 0, x + 4, 30], fill=C('RUST'))
    d.rectangle([0, 96, SW, 130], fill=C('BG')); d.line([0, 96, SW, 96], fill=C('DIM')); d.line([0, 130, SW, 130], fill=C('DIM'))
    for x in range(-10, SW, 22):
        d.polygon([(x, 106), (x + 8, 113), (x, 120)], fill=C('ORG'))
    for y0 in (180, 188):
        for x in range(0, SW, 16): d.polygon([(x, y0 + 8), (x + 8, y0 + 8), (x + 16, y0), (x + 8, y0)], fill=C('YEL'))
    d.rectangle([400, 150, 470, 250], fill=C('BG'), outline=C('DIM')); d.rectangle([408, 160, 462, 182], fill=C('UI'))
    for i, k in enumerate(('RED', 'GRN', 'YEL', 'RED')): d.rectangle([410 + i * 12, 192, 416 + i * 12, 198], fill=C(k))
    for (x, y) in ((24, 220), (48, 224)): d.ellipse([x, y, x + 20, y + 20], fill=C('RUST'), outline=C('BG')); d.line([x + 2, y + 6, x + 18, y + 6], fill=C('ORG'))
    for _ in range(26): d.point((rnd.randint(60, 420), rnd.randint(96, 190)), fill=C('YEL'))
    overlay_glow(im, [(240, 113, 220, 20, 'ORG', 70), (430, 200, 40, 40, 'RED', 40), (240, 12, 200, 12, 'ORG', 50)])
    actors(im, 2); return im

def scene_tower():
    rnd = random.Random(3)
    im = Image.new('RGBA', (SW, SH), C('UI')); d = ImageDraw.Draw(im)
    for gx in range(0, SW, 32): d.line([gx, 0, gx, SH], fill=C('VIO'))
    for gy in range(0, SH, 32): d.line([0, gy, SW, gy], fill=C('VIO'))
    for k in range(-3, 14):
        d.line([k * 48, 0, k * 48 + 120, SH], fill=C('GRID'))
    d.rectangle([0, 0, SW, 44], fill=C('BG'))
    for x in range(8, SW, 56):
        d.rectangle([x, 6, x + 44, 38], fill=C('CYAND')); d.rectangle([x + 2, 8, x + 42, 36], fill=C('UI')); d.line([x + 4, 34, x + 40, 10], fill=C('CYAND'))
    for cx, cy, rx, ry, k in ((240, 150, 100, 60, 'CYAND'), (240, 150, 70, 42, 'CYAN'), (240, 150, 38, 23, 'CYAND')): d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], outline=C(k))
    d.line([240, 90, 240, 210], fill=C('CYAND')); d.line([140, 150, 340, 150], fill=C('CYAND'))
    for y in (78, 222):
        d.line([0, y, SW, y], fill=C('RED')); d.rectangle([0, y - 4, 6, y + 4], fill=C('DIM')); d.rectangle([SW - 7, y - 4, SW, y + 4], fill=C('DIM'))
    d.rectangle([0, 60, 34, SH], fill=C('BG'))
    for y in range(66, SH - 6, 22):
        d.rectangle([4, y, 30, y + 18], fill=C('UI'), outline=C('VIO'))
        for i in range(5): d.point((8 + i * 4, y + 5), fill=C(rnd.choice(['GRN', 'CYAN', 'CYAN', 'MAG']))); d.point((8 + i * 4, y + 11), fill=C(rnd.choice(['GRN', 'CYAN', 'YEL'])))
    d.rectangle([430, 60, 480, 100], fill=C('BG'), outline=C('CYAN'))
    d.line([436, 70, 474, 70], fill=C('CYAN')); d.line([436, 80, 464, 80], fill=C('CYAND')); d.line([436, 90, 470, 90], fill=C('CYAND'))
    overlay_glow(im, [(240, 150, 120, 70, 'CYAN', 50), (455, 80, 40, 30, 'CYAN', 70), (240, 20, 240, 18, 'CYAN', 45)])
    actors(im, 3); return im

def scene_hideout(with_actors=True):
    rnd = random.Random(4)
    im = Image.new('RGBA', (SW, SH), C('RUST')); d = ImageDraw.Draw(im)
    for y in range(0, SH, 10): d.line([0, y, SW, y], fill=C('BG'))
    for y in range(0, SH, 10):
        for x in range(rnd.randint(0, 40), SW, 60): d.line([x, y, x, y + 9], fill=C('BG'))
    for _ in range(120): d.point((rnd.randint(0, SW), rnd.randint(0, SH)), fill=C('ORG'))
    d.rectangle([0, 0, SW, 44], fill=C('UI')); d.rectangle([0, 44, SW, 46], fill=C('VIO'))
    d.rectangle([200, 8, 280, 36], outline=C('MAG'), width=2); d.rectangle([204, 12, 276, 32], fill=C('MAGD'))
    d.rectangle([232, 14, 248, 30], fill=C('CYAN')); d.rectangle([238, 12, 242, 32], fill=C('WHITE')); d.rectangle([228, 19, 252, 25], fill=C('WHITE'))
    d.rectangle([60, 12, 150, 40], fill=C('BG'), outline=C('DIM'))
    for i in range(7): d.rectangle([66 + i * 12, 16, 72 + i * 12, 34], fill=C(['GRN', 'MAG', 'CYAN', 'LIME', 'MAG', 'GRN', 'CYAN'][i]))
    d.rectangle([160, 150, 330, 250], fill=C('MAGD'), outline=C('MAG'), width=2)
    for k in range(166, 326, 12): d.line([k, 156, k, 244], fill=C('MAG'))
    d.rectangle([172, 160, 318, 240], outline=C('MAG'))
    d.rectangle([370, 90, 450, 150], fill=C('VIO'), outline=C('CYAN'), width=2); d.rectangle([380, 100, 440, 140], fill=C('UI')); d.rectangle([420, 70, 450, 92], fill=C('CYAN'))
    d.rectangle([378, 96, 384, 144], fill=C('CYAND')); d.rectangle([436, 96, 442, 144], fill=C('CYAND'))
    d.rectangle([20, 100, 90, 130], fill=C('UI'), outline=C('DIM'))
    d.rectangle([24, 104, 40, 114], fill=C('CYAN')); d.line([26, 108, 38, 108], fill=C('GRN')); d.rectangle([48, 104, 60, 126], fill=C('DIM')); d.rectangle([66, 106, 86, 122], fill=C('BG'))
    d.rectangle([380, 200, 460, 250], fill=C('UI'), outline=C('DIM')); d.line([384, 210, 456, 210], fill=C('DIM'))
    for x in range(388, 452, 14): d.rectangle([x, 216, x + 8, 240], fill=C('BG'), outline=C('VIO'))
    overlay_glow(im, [(240, 22, 110, 30, 'MAG', 90), (410, 120, 50, 40, 'CYAN', 60), (240, 200, 100, 50, 'ORG', 50)])
    if with_actors: actors(im, 4)
    return im

def scene_card(scene, path, tag, title, role, notes, accent):
    W, H = 960, 780
    im = Image.new('RGBA', (W, H), C('BG')); d = ImageDraw.Draw(im)
    d.text((40, 20), tag, font=F(14), fill=C('DIM')); d.text((40, 40), title, font=FB(30), fill=C(accent)); d.text((40, 82), role, font=F(15), fill=C('WHITE'))
    big = scene.resize((SW * 2, SH * 2), Image.NEAREST); im.alpha_composite(big, (0, 118)); d.rectangle([0, 117, W - 1, 118 + SH * 2], outline=C('VIO'))
    for i, n in enumerate(notes): d.text((40, 118 + SH * 2 + 14 + i * 22), "- " + n, font=F(13), fill=C('WHITE'))
    im.convert('RGB').save(path)

if __name__ == '__main__':
    R = [('A', 'ZERO', zero(), 'cyan', 'Balanced gunslinger (starter)', ['Visor + long coat: reads as a cool "merc" from far away', 'Cyan trim = the player color, nothing else uses it', 'Pistol on the right so left/right flip stays readable']),
         ('B', 'VIPER', viper(), 'mag', 'Cyberware melee brawler', ['Widest silhouette, mohawk and blade arms', 'Magenta glow on arms hints at upgrade level', 'Slow runner: the bulk sells the -10% speed']),
         ('C', 'GHOST', ghost(), 'grn', 'Stealth netrunner', ['Hood + single green eye = strongest silhouette difference', 'Glitch lines on the cloak (1px, easy to animate)', 'Holds a data blade, matches the cloak dash']),
         ('D', 'NOVA', nova(), 'org', 'Demolition specialist', ['Orange helmet + hazard vest: warm color among cool ones', 'Grenade belt and plasma grenade in hand', 'Backpack widens the silhouette on the left'])]
    ACC = dict(cyan='CYAN', mag='MAG', grn='GRN', org='ORG')
    for tag, name, spr, a, role, notes in R:
        card(spr, f"{OUT}/char_{tag}_{name.lower()}.png", f"RUNNER CONCEPT {tag}", name, role, notes, ACC[a], crowd=True)
    E = [('A', 'SECURITY DRONE', drone(), 'MAG', 'Swarm filler  |  0:00+  |  16x16', ['Diamond body = readable at 16px in a crowd', 'One white eye is the focal point', 'Cyan thrusters tie it to the corp tech']),
         ('B', 'STREET THUG', thug(), 'ORG', 'Slow bruiser  |  1:00+  |  20x20', ['Orange jacket, red bandana, bat on the right', 'Bigger and slower, so it reads as "tanky"', 'Spiked shoulders add detail without new colors']),
         ('C', 'GANG GUNNER', gunner(), 'LIME', 'Ranged  |  3:00+  |  20x20', ['Lime is used by no other enemy: instant "this one shoots"', 'Red visor matches enemy bullets (red)', 'Muzzle flash pixel can be animated']),
         ('D', 'CYBER PSYCHO', psycho(), 'CYAN', 'NEW elite candidate  |  24x24', ['Blade arm + exposed implants: the classic cyberpunk threat', 'Red eyes mark it as dangerous', 'Good fit for the elite / mid-wave spike'])]
    for tag, name, spr, a, role, notes in E:
        card(spr, f"{OUT}/enemy_{tag}_{name.lower().replace(' ', '_')}.png", f"ENEMY CONCEPT {tag}", name, role, notes, a)
    S = [('A', 'SLUM ALLEY', scene_slum(), 'MAG', 'Zone 1  |  rainy back street', ['Dark asphalt keeps sprites bright; neon only at the edges', 'Puddles reflect magenta / cyan (easy ambient motion)', 'Rain is 1px lines, cheap to draw']),
         ('B', 'INDUSTRIAL ZONE', scene_industrial(), 'ORG', 'Zone 2  |  factory floor', ['Conveyor band = a moving floor hazard idea', 'Warm orange and yellow separate it from zone 1', 'Hazard stripes mark the safe lane']),
         ('C', 'CORPORATE TOWER', scene_tower(), 'CYAN', 'Zone 3  |  glass lobby', ['Cool cyan palette, clean lines, red lasers = danger', 'Holo ring in the center marks the boss spot', 'Server racks frame the left edge']),
         ('D', 'RIPPER HIDEOUT', scene_hideout(), 'MAG', 'Hub  |  between runs', ['Warm wood and rug make it feel safe, unlike the zones', 'Surgery chair + ripper sign = the upgrade shop', 'Same 16 colors, only the mix changes'])]
    for tag, name, sc, a, role, notes in S:
        scene_card(sc, f"{OUT}/bg_{tag}_{name.lower().replace(' ', '_')}.png", f"BACKGROUND CONCEPT {tag}", name, role, notes, a)
    print(sorted(os.listdir(OUT)))
