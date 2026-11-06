"""1챕터(하층가 슬럼) 바닥 타일 시안 3종. 512x512, 상하좌우 이음새 없이 반복된다.
사용: python3 tools/art/ground_v2.py <출력 폴더>
  A: 젖은 아스팔트 골목   B: 콘크리트 판석 + 배수로   C: 네온 웅덩이 뒷골목
"""
import os, random, sys
import numpy as np
from PIL import Image, ImageDraw

N = 512
PAL = dict(
    BG='#07060f', D0='#0d0b18', D1='#130f22', D2='#1a142c', D3='#221a38', D4='#2c2246', D5='#3a2d58',
    MAG='#ff2bd6', MAGD='#7a1466', MAGM='#b81f9c', CYAN='#00f0ff', CYAND='#06606e', CYANM='#0aa6b8',
    YEL='#fff23a', YELD='#6b6420', RUST='#6e2f12', RUSTD='#3d1a0c', GRAY='#4a4462', GRAYD='#2e2a40', MOSS='#1e3326')


def C(k, a=255):
    h = PAL.get(k, k)
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (a,)


def value_noise(seed, cells, octaves=3):
    """이음새 없는 값 노이즈 (격자를 감싸서 보간) → 0..1"""
    rng = np.random.default_rng(seed)
    out = np.zeros((N, N))
    amp, total = 1.0, 0.0
    for o in range(octaves):
        c = cells * (2 ** o)
        g = rng.random((c, c))
        xs = np.arange(N) * c / N
        i0 = np.floor(xs).astype(int) % c
        i1 = (i0 + 1) % c
        f = xs - np.floor(xs)
        f = f * f * (3 - 2 * f)
        a = g[i0][:, i0] * (1 - f)[None, :] + g[i0][:, i1] * f[None, :]
        b = g[i1][:, i0] * (1 - f)[None, :] + g[i1][:, i1] * f[None, :]
        out += amp * (a * (1 - f)[:, None] + b * f[:, None])
        total += amp
        amp *= 0.5
    return out / total


def base_from_noise(noise, tones, seed, dither=0.12):
    """노이즈를 몇 단계 색으로 나누고 픽셀 디더링으로 거친 질감"""
    rng = np.random.default_rng(seed + 99)
    n = noise + (rng.random((N, N)) - 0.5) * dither
    lv = np.clip((n - n.min()) / (n.max() - n.min()) * len(tones), 0, len(tones) - 1).astype(int)
    rgb = np.array([C(t)[:3] for t in tones], dtype=np.uint8)
    img = np.zeros((N, N, 4), dtype=np.uint8)
    img[..., :3] = rgb[lv]
    img[..., 3] = 255
    return Image.fromarray(img, 'RGBA')


def wrapped(fn):
    """가장자리를 넘는 도형이 반대쪽으로 이어지도록 9번 그린다"""
    for ox in (-N, 0, N):
        for oy in (-N, 0, N):
            fn(ox, oy)


def puddle(d, rnd, cx, cy, rx, ry, neon):
    """물웅덩이: 바닥보다 한 단계 어두운 수면 + 네온 간판이 비친 세로 빛줄기(디더링) + 가장자리 물빛"""
    streaks = []
    for _ in range(rnd.randint(2, 3)):
        sx = cx + rnd.randint(-rx // 2, rx // 2)
        streaks.append((sx, rnd.choice(neon), rnd.randint(1, 2)))
    def inside(x, y, shrink=2):
        return (x - cx) ** 2 / max(1, rx - shrink) ** 2 + (y - cy) ** 2 / max(1, ry - shrink) ** 2 < 1
    def f(ox, oy):
        d.ellipse([cx - rx + ox, cy - ry + oy, cx + rx + ox, cy + ry + oy], fill=C('D1'))
        d.ellipse([cx - rx + 2 + ox, cy - ry + 1 + oy, cx + rx - 2 + ox, cy + ry - 1 + oy], fill=C('D0'))
        for sx, col, w in streaks:  # 세로로 늘어진 반사, 아래로 갈수록 성기게
            for yy in range(cy - ry + 2, cy + ry - 1):
                k = (yy - (cy - ry)) / (2 * ry)
                for xx in range(sx, sx + w):
                    if inside(xx, yy) and (yy + xx) % 2 == 0 and rnd.random() > k * 0.7:
                        d.point((xx + ox, yy + oy), fill=C(col, 200))
        d.arc([cx - rx + ox, cy - ry + oy, cx + rx + ox, cy + ry + oy], 200, 320, fill=C('CYAND'))
        d.arc([cx - rx + 1 + ox, cy - ry + 1 + oy, cx + rx - 1 + ox, cy + ry - 1 + oy], 30, 120, fill=C('D3'))
    wrapped(f)


def grate(d, x, y, w, h):
    def f(ox, oy):
        d.rectangle([x + ox, y + oy, x + w + ox, y + h + oy], fill=C('BG'), outline=C('GRAY'))
        for k in range(x + 3, x + w - 1, 3):
            d.line([k + ox, y + 2 + oy, k + ox, y + h - 2 + oy], fill=C('GRAYD'))
        d.point((x + 1 + ox, y + 1 + oy), fill=C('RUST'))
    wrapped(f)


def manhole(d, cx, cy, r):
    def f(ox, oy):
        d.ellipse([cx - r + ox, cy - r + oy, cx + r + ox, cy + r + oy], fill=C('D2'), outline=C('GRAY'))
        d.ellipse([cx - r + 3 + ox, cy - r + 3 + oy, cx + r - 3 + ox, cy + r - 3 + oy], outline=C('GRAYD'))
        for k in range(-r + 5, r - 4, 4):
            d.line([cx - r + 5 + ox, cy + k + oy, cx + r - 5 + ox, cy + k + oy], fill=C('D4'))
    wrapped(f)


def trash(d, rnd, n):
    for _ in range(n):
        x, y = rnd.randrange(N), rnd.randrange(N)
        kind = rnd.random()
        def f(ox, oy, x=x, y=y, kind=kind):
            if kind < 0.4:  # 찌그러진 캔
                d.rectangle([x + ox, y + oy, x + 3 + ox, y + 2 + oy], fill=C(rnd.choice(['MAGD', 'CYAND', 'YELD'])))
            elif kind < 0.7:  # 종이 쪼가리
                d.polygon([(x + ox, y + oy), (x + 5 + ox, y + 1 + oy), (x + 4 + ox, y + 4 + oy), (x + 1 + ox, y + 3 + oy)], fill=C('D5'))
            else:  # 깨진 유리 반짝임
                d.point((x + ox, y + oy), fill=C('CYANM')); d.point((x + 2 + ox, y + 1 + oy), fill=C('GRAY'))
        wrapped(f)


def cable(d, rnd, color='GRAYD', hi='GRAY'):
    """바닥을 구불구불 지나가는 전선 (타일 가로를 한 바퀴 돌아 이어짐)"""
    y0 = rnd.randrange(N)
    pts = []
    amp, ph, freq = rnd.randint(10, 30), rnd.random() * 6.28, rnd.choice([1, 2])
    for x in range(0, N + 1, 4):
        pts.append((x, y0 + int(amp * np.sin(ph + x / N * 6.283 * freq))))
    def f(ox, oy):
        d.line([(x + ox, y + oy) for x, y in pts], fill=C(color), width=2)
        d.line([(x + ox, y - 1 + oy) for x, y in pts[::3]], fill=C(hi), width=1)
    wrapped(f)


def cracks(d, rnd, n, col='D0'):
    for _ in range(n):
        x, y = rnd.randrange(N), rnd.randrange(N)
        pts = [(x, y)]
        for _ in range(rnd.randint(3, 7)):
            x += rnd.randint(-9, 9); y += rnd.randint(-9, 9); pts.append((x, y))
        def f(ox, oy, pts=pts):
            d.line([(a + ox, b + oy) for a, b in pts], fill=C(col))
        wrapped(f)


def rain_spots(d, rnd, n):
    """빗방울이 튄 작은 반짝임"""
    for _ in range(n):
        x, y = rnd.randrange(N), rnd.randrange(N)
        d.point((x, y), fill=C(rnd.choice(['CYAND', 'D5', 'MAGD'])))


def ground_a(seed=11):
    """A. 젖은 아스팔트 골목: 거친 아스팔트 + 큰 웅덩이 + 바랜 차선 + 배수구"""
    rnd = random.Random(seed)
    img = base_from_noise(value_noise(seed, 8, 4), ['D1', 'D2', 'D2', 'D3', 'D3', 'D4'], seed, 0.18)
    d = ImageDraw.Draw(img)
    cracks(d, rnd, 26)
    # 바랜 노란 차선 (끊긴 점선, 가로로 타일 전체를 지나감)
    for x in range(0, N, 48):
        def f(ox, oy, x=x):
            for k in range(0, 26, 1):
                if rnd.random() < 0.75:
                    d.point((x + k + ox, 300 + oy), fill=C('YELD')); d.point((x + k + ox, 301 + oy), fill=C('YELD'))
        wrapped(f)
    for _ in range(5):
        puddle(d, rnd, rnd.randrange(N), rnd.randrange(N), rnd.randint(18, 44), rnd.randint(8, 18), ['MAG', 'MAGM', 'CYAN', 'CYANM'])
    grate(d, 60, 120, 26, 14); grate(d, 380, 440, 26, 14)
    manhole(d, 250, 170, 15)
    trash(d, rnd, 40)
    rain_spots(d, rnd, 500)
    return img


def ground_b(seed=22):
    """B. 콘크리트 판석 + 배수로: 크기가 다른 판, 틈새 이끼, 쇠창살 배수로, 맨홀"""
    rnd = random.Random(seed)
    img = base_from_noise(value_noise(seed, 6, 3), ['D2', 'D3', 'D3', 'D4'], seed, 0.10)
    d = ImageDraw.Draw(img)
    # 판석: 줄마다 높이가 다르고 가로 이음이 엇갈림
    y = 0
    rows = []
    while y < N:
        h = rnd.choice([48, 56, 64])
        if y + h > N - 24:
            h = N - y
        rows.append((y, h))
        y += h
    for y, h in rows:
        d.line([0, y, N, y], fill=C('D0'))
        d.line([0, y + 1, N, y + 1], fill=C('D1'))
        x = rnd.randint(0, 40)
        while x < N + 80:
            def f(ox, oy, x=x, y=y, h=h):
                d.line([x + ox, y + oy, x + ox, y + h + oy], fill=C('D0'))
                d.line([x + 1 + ox, y + oy, x + 1 + ox, y + h + oy], fill=C('D1'))
            wrapped(f)
            # 판 하나의 얼룩 (물기·기름)
            if rnd.random() < 0.35:
                sx, sy = x + rnd.randint(6, 40), y + rnd.randint(6, max(7, h - 10))
                def g(ox, oy, sx=sx, sy=sy):
                    d.ellipse([sx + ox, sy + oy, sx + rnd.randint(10, 26) + ox, sy + rnd.randint(4, 9) + oy], fill=C('D2'))
                wrapped(g)
            x += rnd.choice([56, 72, 88, 104])
    # 틈새 이끼
    for _ in range(140):
        y, hgt = rnd.choice(rows)
        x = rnd.randrange(N)
        d.point((x, y + 1), fill=C('MOSS')); d.point(((x + 1) % N, y + 1), fill=C('MOSS'))
    # 가로지르는 배수로 + 쇠창살
    gy = 232
    d.rectangle([0, gy, N, gy + 14], fill=C('BG'))
    d.line([0, gy, N, gy], fill=C('GRAY')); d.line([0, gy + 14, N, gy + 14], fill=C('GRAYD'))
    for x in range(0, N, 4):
        d.line([x, gy + 2, x, gy + 12], fill=C('GRAYD'))
    for x in range(0, N, 64):  # 물에 비친 네온
        d.line([x + 10, gy + 7, x + 18, gy + 7], fill=C(rnd.choice(['MAGM', 'CYANM']), 200))
    manhole(d, 120, 400, 16); manhole(d, 420, 90, 14)
    grate(d, 300, 360, 22, 12)
    cracks(d, rnd, 18)
    for _ in range(3):
        puddle(d, rnd, rnd.randrange(N), rnd.randrange(N), rnd.randint(14, 30), rnd.randint(6, 12), ['MAGM', 'CYANM', 'CYAN'])
    trash(d, rnd, 55)
    rain_spots(d, rnd, 380)
    return img


def ground_c(seed=33):
    """C. 네온 웅덩이 뒷골목: 작은 돌 포장 + 기름 낀 무지갯빛 웅덩이 + 전선 + 경고 페인트"""
    rnd = random.Random(seed)
    img = base_from_noise(value_noise(seed, 10, 3), ['D1', 'D2', 'D3'], seed, 0.08)
    d = ImageDraw.Draw(img)
    # 작은 돌 포장 (8x6 벽돌, 줄마다 엇갈림, 일부 깨짐)
    for y in range(0, N, 6):
        off = 4 if (y // 6) % 2 else 0
        for x in range(-8 + off, N, 8):
            if rnd.random() < 0.06:
                continue
            tone = rnd.choice(['D2', 'D3', 'D3', 'D4'])
            d.rectangle([x + 1, y + 1, x + 6, y + 4], fill=C(tone))
            if rnd.random() < 0.3:
                d.point((x + 2, y + 1), fill=C('D5'))
    # 경고 화살표 페인트 (바랜 노랑)
    for (ax, ay) in ((90, 60), (330, 300)):
        def f(ox, oy, ax=ax, ay=ay):
            for k in range(3):
                d.polygon([(ax + k * 16 + ox, ay + oy), (ax + 8 + k * 16 + ox, ay + 8 + oy), (ax + k * 16 + ox, ay + 16 + oy), (ax + 4 + k * 16 + ox, ay + 8 + oy)], fill=C('YELD'))
        wrapped(f)
    # 기름 낀 웅덩이: 마젠타→시안 무지개 띠
    for _ in range(6):
        cx, cy, rx, ry = rnd.randrange(N), rnd.randrange(N), rnd.randint(16, 40), rnd.randint(8, 16)
        def f(ox, oy, cx=cx, cy=cy, rx=rx, ry=ry):
            d.ellipse([cx - rx + ox, cy - ry + oy, cx + rx + ox, cy + ry + oy], fill=C('D1'))
            d.ellipse([cx - rx + 2 + ox, cy - ry + 1 + oy, cx + rx - 2 + ox, cy + ry - 1 + oy], fill=C('D0'))
            for i, col in enumerate(['MAGD', 'MAGM', 'CYANM', 'CYAND']):
                s = 3 + i * 3
                if rx - s > 3 and ry - s // 2 > 2:
                    d.arc([cx - rx + s + ox, cy - ry + s // 2 + oy, cx + rx - s + ox, cy + ry - s // 2 + oy], 190, 350, fill=C(col))
        wrapped(f)
    cable(d, rnd); cable(d, rnd, 'D0', 'MAGD')
    grate(d, 200, 150, 24, 14)
    manhole(d, 440, 210, 14)
    trash(d, rnd, 45)
    rain_spots(d, rnd, 450)
    return img


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    for name, fn in (('A', ground_a), ('B', ground_b), ('C', ground_c)):
        fn().save(os.path.join(out, f'ground_ch1_{name}.png'))
        print('wrote', name)


# ───────────────────────── v2 추가 요소: 네온사인 · 버려진 잔해 · 먼 고층 빌딩 ─────────────────────────
from PIL import ImageFilter

PAL.update(RUSTL='#a8521f', STONE='#3e3852', STONEL='#5a5272', WOOD='#4a2a1c', WOODL='#6e4228', GLASS='#2a6a7a', RED='#ff2a3a', LIME='#b6ff3a')


def stamp(img, obj, x, y):
    """작은 그림을 이음새 없이 붙인다 (타일 경계를 넘으면 반대편에도)"""
    for ox in (-N, 0, N):
        for oy in (-N, 0, N):
            img.alpha_composite(obj, (x + ox, y + oy)) if -obj.width < x + ox < N and -obj.height < y + oy < N else None


def glow_layer(spots):
    """빛 번짐 층: 3x3으로 이어 붙인 뒤 흐리게 해서 가운데만 잘라 이음새 없이"""
    big = Image.new('RGBA', (N * 3, N * 3), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    for x, y, rx, ry, col, a in spots:
        for ox in (0, N, 2 * N):
            for oy in (0, N, 2 * N):
                d.ellipse([x - rx + ox, y - ry + oy, x + rx + ox, y + ry + oy], fill=C(col, a))
    big = big.filter(ImageFilter.GaussianBlur(14))
    return big.crop((N, N, 2 * N, 2 * N))


def obj_canvas(w, h):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def outline(im, k='BG'):
    src = im.copy(); px = src.load(); out = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][3] == 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < im.width and 0 <= ny < im.height and px[nx, ny][3] > 0:
                        out[x, y] = C(k); break
    return im


def car_wreck(rnd):
    """위에서 본 녹슨 폐차 (바퀴 하나 빠지고 앞유리 깨짐)"""
    im, d = obj_canvas(48, 26)
    for wx, wy in ((8, 1), (34, 1), (8, 21)):
        d.rectangle([wx, wy, wx + 6, wy + 3], fill=C('D0'))
    d.rounded_rectangle([3, 4, 45, 21], 5, fill=C('RUSTD'))
    d.rounded_rectangle([5, 5, 43, 20], 4, fill=C(rnd.choice(['GRAYD', 'RUSTD'])))
    d.rectangle([14, 7, 32, 18], fill=C('D2'))          # 지붕 (찌그러짐)
    d.polygon([(32, 7), (38, 9), (38, 16), (32, 18)], fill=C('GLASS'))  # 앞유리
    d.line([33, 9, 37, 15], fill=C('D0')); d.line([35, 8, 34, 17], fill=C('D0'))
    d.polygon([(9, 8), (14, 7), (14, 18), (9, 17)], fill=C('D0'))      # 뒷유리 없음
    for _ in range(14):
        d.point((rnd.randint(5, 43), rnd.randint(5, 20)), fill=C(rnd.choice(['RUST', 'RUSTL'])))
    d.line([18, 12, 28, 12], fill=C('D1'))
    return outline(im)


def crate(rnd):
    im, d = obj_canvas(13, 12)
    d.rectangle([1, 1, 11, 10], fill=C('WOOD')); d.rectangle([1, 1, 11, 1], fill=C('WOODL'))
    d.line([1, 1, 11, 10], fill=C('WOODL')); d.line([1, 5, 11, 5], fill=C('D1'))
    d.rectangle([7, 6, 11, 10], fill=C('D1'))  # 부서진 모서리
    return outline(im)


def tire():
    im, d = obj_canvas(10, 10)
    d.ellipse([0, 0, 9, 9], fill=C('D0')); d.ellipse([3, 3, 6, 6], fill=C('D3')); d.arc([0, 0, 9, 9], 200, 290, fill=C('GRAYD'))
    return im


def barrel(rnd):
    im, d = obj_canvas(10, 12)
    col = rnd.choice(['RUSTD', 'CYAND', 'GRAYD'])
    d.rectangle([1, 1, 8, 10], fill=C(col)); d.line([1, 4, 8, 4], fill=C('D0')); d.line([1, 8, 8, 8], fill=C('D0'))
    d.ellipse([1, 0, 8, 3], fill=C('D2')); d.point((4, 1), fill=C('LIME'))  # 새는 액체가 살짝 빛남
    return outline(im)


def rubble(rnd):
    im, d = obj_canvas(26, 16)
    for _ in range(9):
        x, y = rnd.randint(1, 20), rnd.randint(3, 12)
        s = rnd.randint(2, 5)
        d.polygon([(x, y + s), (x + s // 2, y), (x + s + 1, y + 1), (x + s, y + s)], fill=C(rnd.choice(['STONE', 'STONEL', 'D4'])))
    d.line([2, 13, 23, 14], fill=C('RUST'))  # 철근
    return outline(im)


def scrap_sheet(rnd):
    im, d = obj_canvas(22, 10)
    d.polygon([(1, 3), (19, 0), (21, 6), (3, 9)], fill=C('GRAYD'))
    d.line([3, 4, 18, 2], fill=C('GRAY'))
    for _ in range(5):
        d.point((rnd.randint(3, 18), rnd.randint(2, 7)), fill=C('RUST'))
    return outline(im)


def neon_sign(rnd, col1, col2):
    """바닥에 떨어진 네온 간판: 검은 틀 + 끊긴 네온관(글자 대신 추상 무늬) + 튀는 불꽃"""
    im, d = obj_canvas(40, 18)
    d.rectangle([0, 0, 39, 17], fill=C('D0'), outline=C('GRAYD'))
    x = 4
    for k in range(5):  # 추상 기호 5개 (읽히는 글자 없음)
        col = col1 if k % 2 == 0 else col2
        shape = rnd.choice(['ring', 'bar', 'zig', 'tri'])
        if shape == 'ring':
            d.ellipse([x, 4, x + 5, 12], outline=C(col))
        elif shape == 'bar':
            d.line([x + 2, 3, x + 2, 13], fill=C(col)); d.line([x, 3, x + 5, 3], fill=C(col))
        elif shape == 'zig':
            d.line([(x, 4), (x + 5, 4), (x, 13), (x + 5, 13)], fill=C(col))
        else:
            d.polygon([(x, 13), (x + 3, 4), (x + 6, 13)], outline=C(col))
        if rnd.random() < 0.4:  # 깨진 관: 일부를 끊음
            d.line([x + 1, 8, x + 4, 8], fill=C('D0'))
        x += 7
    d.line([28, 0, 36, 17], fill=C('D1'))  # 틀이 깨진 금
    return im


def add_debris_and_neon(img, rnd, density=1.0):
    """바탕 타일 위에 빛 번짐 → 떨어진 네온사인 → 잔해를 올린다"""
    spots, signs = [], []
    for _ in range(3):
        x, y = rnd.randrange(N), rnd.randrange(N)
        c1, c2 = rnd.choice([('MAG', 'CYAN'), ('CYAN', 'MAG'), ('MAG', 'YEL')])
        signs.append((x, y, c1, c2))
        spots.append((x + 20, y + 9, 46, 26, c1, 90))
    for _ in range(4):  # 화면 밖 간판이 비추는 빛 웅덩이
        spots.append((rnd.randrange(N), rnd.randrange(N), rnd.randint(40, 70), rnd.randint(22, 36), rnd.choice(['MAG', 'CYAN', 'MAGM']), 45))
    img.alpha_composite(glow_layer(spots))
    for x, y, c1, c2 in signs:
        stamp(img, neon_sign(rnd, c1, c2), x, y)
        d = ImageDraw.Draw(img)
        for _ in range(4):  # 튀는 불꽃
            d.point(((x + rnd.randint(-4, 44)) % N, (y + rnd.randint(-4, 22)) % N), fill=C('YEL'))
    makers = [(car_wreck, 2), (crate, 6), (tire, 5), (barrel, 4), (rubble, 6), (scrap_sheet, 5)]
    for fn, n in makers:
        for _ in range(int(n * density)):
            obj = fn(rnd) if fn not in (tire,) else fn()
            stamp(img, obj, rnd.randrange(N), rnd.randrange(N))
    return img


def skyline(width=1024, height=150, seed=7):
    """화면 위쪽에 깔 먼 고층 빌딩 실루엣 (가로로 이음새 없이 반복, 아래로 갈수록 안개 속으로 사라짐)"""
    rnd = random.Random(seed)
    im = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    sky = np.zeros((height, width, 4), dtype=np.uint8)
    for y in range(height):  # 하늘: 위는 짙은 남색, 지평선은 마젠타 빛 안개
        k = y / height
        sky[y, :, :3] = (np.array(C('BG')[:3]) * (1 - k) + np.array(C('MAGD')[:3]) * k * 0.55 + np.array(C('D2')[:3]) * k * 0.45).astype(np.uint8)
        sky[y, :, 3] = int(255 * min(1, 1.6 - k * 1.2) if k > 0.5 else 255)
    im = Image.fromarray(sky, 'RGBA')
    d = ImageDraw.Draw(im)
    def towers(base_col, win_cols, hmin, hmax, wmin, wmax, gap, ground):
        x = rnd.randint(-20, 0)
        while x < width:
            w, h = rnd.randint(wmin, wmax), rnd.randint(hmin, hmax)
            top = ground - h
            shape = rnd.random()
            for ox in (0, width, -width):  # 가로 반복 이음새
                X = x + ox
                d.rectangle([X, top, X + w, ground], fill=C(base_col))
                if shape < 0.3:  # 계단식 꼭대기
                    d.rectangle([X + w // 4, top - h // 6, X + 3 * w // 4, top], fill=C(base_col))
                if shape > 0.75:  # 안테나 + 경고등
                    d.line([X + w // 2, top - 14, X + w // 2, top], fill=C(base_col)); d.point((X + w // 2, top - 15), fill=C('RED'))
            # 창문 불빛
            for wy in range(top + 3, ground - 2, 4):
                for wx in range(x + 2, x + w - 1, 3):
                    if rnd.random() < 0.18:
                        col = C(rnd.choice(win_cols), 200)
                        for ox in (0, width, -width):
                            d.point((wx + ox, wy), fill=col)
            # 홀로그램 광고판
            if rnd.random() < 0.25 and w > 16:
                bx, by = x + 2, top + rnd.randint(6, max(7, h // 2))
                col = rnd.choice(['MAG', 'CYAN'])
                for ox in (0, width, -width):
                    d.rectangle([bx + ox, by, bx + w - 4 + ox, by + 7], fill=C(col, 150))
                    d.line([bx + 1 + ox, by + 3, bx + w - 6 + ox, by + 3], fill=C('WHITE', 160) if 'WHITE' in PAL else C('#e8f7ff', 160))
            x += w + rnd.randint(0, gap)
    towers('D2', ['CYAND', 'MAGD', 'D5'], 40, 95, 14, 34, 6, height - 20)       # 먼 층 (흐림)
    towers('D0', ['CYAN', 'MAG', 'YEL', 'CYANM'], 55, 120, 18, 40, 10, height - 6)  # 가까운 층
    # 아래쪽 안개로 사라짐
    arr = np.array(im).astype(float)
    fade = np.clip((height - np.arange(height)) / 40, 0, 1)[:, None]
    arr[..., 3] *= fade
    # 안개 빛 띠
    glow = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    ImageDraw.Draw(glow).rectangle([0, height - 34, width, height - 12], fill=C('MAGD', 70))
    out = Image.fromarray(arr.astype(np.uint8), 'RGBA')
    out.alpha_composite(glow.filter(ImageFilter.GaussianBlur(8)))
    return out


def build_v2(out):
    for name, fn, seed in (('A', ground_a, 101), ('B', ground_b, 202), ('C', ground_c, 303)):
        img = fn()
        add_debris_and_neon(img, random.Random(seed), density=0.8 if name == 'C' else 1.0)
        img.save(os.path.join(out, f'ground_ch1_{name}2.png'))
    skyline().save(os.path.join(out, 'skyline_ch1.png'))


# ───────── 1챕터 확정판: 위치에 따라 아스팔트 찻길(A2) + 콘크리트 인도(B2), 오브젝트끼리 겹치지 않게 ─────────
T = 1024                 # 타일 한 장 크기 (화면 640x360보다 커서 반복이 덜 보임)
ROAD_H = (400, 620)      # 가로 찻길이 지나는 y 범위
ROAD_V = (620, 800)      # 세로 찻길이 지나는 x 범위
XWALK_H = (572, 608)     # 가로 찻길 횡단보도 (x 범위)
XWALK_V = (352, 388)     # 세로 찻길 횡단보도 (y 범위)


class Placer:
    """타일(상하좌우가 이어진 판) 위에 사각형을 서로 겹치지 않게 놓는다.
    where: 'road'(찻길 안), 'walk'(인도 안), 'any'. 경계(연석)에 걸치지 않도록 여유를 둔다."""

    def __init__(self, road, rnd):
        self.road, self.rnd, self.rects = road, rnd, []

    @staticmethod
    def _hit(a0, a1, b0, b1):
        return any(a0 < b1 + o and b0 + o < a1 for o in (-T, 0, T))

    def free(self, x, y, w, h, pad):
        return not any(self._hit(x - pad, x + w + pad, rx, rx + rw) and self._hit(y - pad, y + h + pad, ry, ry + rh) for rx, ry, rw, rh in self.rects)

    def inside(self, x, y, w, h, where, margin=7):
        if where == 'any':
            return True
        sub = self.road[np.ix_(np.arange(y - margin, y + h + margin) % T, np.arange(x - margin, x + w + margin) % T)]
        return bool(sub.all()) if where == 'road' else not sub.any()

    def reserve(self, x, y, w, h):
        self.rects.append((x, y, w, h))

    def place(self, w, h, where='any', pad=6, ok=None, tries=600):
        for _ in range(tries):
            x, y = self.rnd.randrange(T), self.rnd.randrange(T)
            if (ok is None or ok(x, y, w, h)) and self.inside(x, y, w, h, where) and self.free(x, y, w, h, pad):
                self.reserve(x, y, w, h)
                return x, y
        return None


def _road_mask():
    yy, xx = np.mgrid[0:T, 0:T]
    return ((yy >= ROAD_H[0]) & (yy < ROAD_H[1])) | ((xx >= ROAD_V[0]) & (xx < ROAD_V[1]))


def _grow(mask, k):
    """마스크를 k칸 넓힌다 (상하좌우로 이어진 판이므로 roll 사용)"""
    m = mask.copy()
    for _ in range(k):
        m = m | np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)
    return m


def _slabs(d, rnd):
    """B2의 콘크리트 판석 무늬 (줄마다 높이가 다르고 이음이 엇갈림) + 틈새 이끼"""
    y, rows = 0, []
    while y < N:
        h = rnd.choice([48, 56, 64])
        if y + h > N - 24:
            h = N - y
        rows.append((y, h)); y += h
    for y, h in rows:
        d.line([0, y, N, y], fill=C('D0')); d.line([0, y + 1, N, y + 1], fill=C('D1'))
        x = rnd.randint(0, 40)
        while x < N + 80:
            def f(ox, oy, x=x, y=y, h=h):
                d.line([x + ox, y + oy, x + ox, y + h + oy], fill=C('D0'))
                d.line([x + 1 + ox, y + oy, x + 1 + ox, y + h + oy], fill=C('D1'))
            wrapped(f)
            if rnd.random() < 0.35:  # 판 하나의 물기·기름 얼룩
                sx, sy = x + rnd.randint(6, 40), y + rnd.randint(6, max(7, h - 10))
                ex, ey = sx + rnd.randint(10, 26), sy + rnd.randint(4, 9)
                wrapped(lambda ox, oy, sx=sx, sy=sy, ex=ex, ey=ey: d.ellipse([sx + ox, sy + oy, ex + ox, ey + oy], fill=C('D2')))
            x += rnd.choice([56, 72, 88, 104])
    for _ in range(520):
        y, _h = rnd.choice(rows)
        x = rnd.randrange(N)
        d.point((x, y + 1), fill=C('MOSS')); d.point(((x + 1) % N, y + 1), fill=C('MOSS'))


def _markings(img, rnd):
    """찻길 페인트: 바랜 노란 중앙 점선 + 낡은 횡단보도 (일부가 벗겨짐)"""
    px = img.load()
    def paint(x, y, col, wear):
        if rnd.random() > wear:
            px[x % T, y % T] = C(col)
    cy = (ROAD_H[0] + ROAD_H[1]) // 2
    for x0 in range(0, T, 64):
        for x in range(x0, x0 + 34):
            if not (ROAD_V[0] - 50 <= x % T < ROAD_V[1] + 14):
                paint(x, cy - 1, 'YELD', 0.25); paint(x, cy, 'YELD', 0.25)
    cx = (ROAD_V[0] + ROAD_V[1]) // 2
    for y0 in range(0, T, 64):
        for y in range(y0, y0 + 34):
            if not (ROAD_H[0] - 50 <= y % T < ROAD_H[1] + 14):
                paint(cx - 1, y, 'YELD', 0.25); paint(cx, y, 'YELD', 0.25)
    for y0 in range(ROAD_H[0] + 8, ROAD_H[1] - 12, 16):  # 가로 찻길 횡단보도
        for y in range(y0, y0 + 8):
            for x in range(*XWALK_H):
                paint(x, y, 'GRAY', 0.35)
    for x0 in range(ROAD_V[0] + 8, ROAD_V[1] - 12, 16):  # 세로 찻길 횡단보도
        for x in range(x0, x0 + 8):
            for y in range(*XWALK_V):
                paint(x, y, 'GRAY', 0.35)


def _curbs(img, road, rnd):
    """찻길과 인도 경계의 연석: 인도 쪽은 밝은 턱, 찻길 쪽은 어두운 물길"""
    arr = np.array(img)
    walk = ~road
    near1, near2, near3 = _grow(road, 1) & walk, _grow(road, 2) & walk, _grow(road, 3) & walk
    arr[near3] = C('GRAYD'); arr[near2] = C('GRAY'); arr[near1] = C('STONEL')
    g1, g2 = _grow(walk, 1) & road, _grow(walk, 2) & road
    arr[g2] = C('D0'); arr[g1] = C('BG')
    out = Image.fromarray(arr, 'RGBA')
    d = ImageDraw.Draw(out)
    ys, xs = np.nonzero(near3)
    for i in rnd.sample(range(len(xs)), 90):  # 깨진 연석 조각
        d.rectangle([xs[i], ys[i], xs[i] + rnd.randint(1, 3), ys[i] + rnd.randint(0, 1)], fill=C('D2'))
    return out


def _ground_ch1(seed):
    rnd = random.Random(seed)
    road = _road_mask()
    asphalt = base_from_noise(value_noise(seed, 16, 4), ['D1', 'D2', 'D2', 'D3', 'D3', 'D4'], seed, 0.18)
    da = ImageDraw.Draw(asphalt)
    cracks(da, rnd, 70)
    concrete = base_from_noise(value_noise(seed + 1, 12, 3), ['D2', 'D3', 'D3', 'D4'], seed + 1, 0.10)
    dc = ImageDraw.Draw(concrete)
    _slabs(dc, rnd)
    cracks(dc, rnd, 50)
    img = Image.composite(asphalt, concrete, Image.fromarray((road * 255).astype(np.uint8), 'L'))
    _markings(img, rnd)
    img = _curbs(img, road, rnd)
    d = ImageDraw.Draw(img)
    rain_spots(d, rnd, 1700)

    P = Placer(road, rnd)
    P.reserve(XWALK_H[0], ROAD_H[0], XWALK_H[1] - XWALK_H[0], ROAD_H[1] - ROAD_H[0])  # 횡단보도는 비워 둔다
    P.reserve(ROAD_V[0], XWALK_V[0], ROAD_V[1] - ROAD_V[0], XWALK_V[1] - XWALK_V[0])
    # 바닥 시설: 연석 옆 빗물 배수구, 맨홀, 물웅덩이
    for side in (ROAD_H[0] + 3, ROAD_H[1] - 17, ROAD_H[0] + 3, ROAD_H[1] - 17):
        for _ in range(300):
            x = rnd.randrange(T)
            if not (ROAD_V[0] - 30 < x < ROAD_V[1]) and P.free(x, side, 26, 14, 6):
                P.reserve(x, side, 26, 14); grate(d, x, side, 26, 14); break
    for side in (ROAD_V[0] + 3, ROAD_V[1] - 17):
        for _ in range(300):
            y = rnd.randrange(T)
            if not (ROAD_H[0] - 30 < y < ROAD_H[1]) and P.free(side, y, 14, 26, 6):
                P.reserve(side, y, 14, 26); grate(d, side, y, 14, 26); break
    for where, r, n in (('road', 15, 3), ('walk', 13, 2)):
        for _ in range(n):
            p = P.place(2 * r + 1, 2 * r + 1, where)
            if p: manhole(d, p[0] + r, p[1] + r, r)
    for where, n, rxr, ryr, neon in (('road', 8, (18, 44), (8, 18), ['MAG', 'MAGM', 'CYAN', 'CYANM']), ('walk', 5, (14, 30), (6, 12), ['MAGM', 'CYANM', 'CYAN'])):
        for _ in range(n):
            rx, ry = rnd.randint(*rxr), rnd.randint(*ryr)
            p = P.place(2 * rx + 1, 2 * ry + 1, where)
            if p: puddle(d, rnd, p[0] + rx, p[1] + ry, rx, ry, neon)

    # 떨어진 네온 간판 (인도 위) + 빛 번짐, 화면 밖 간판이 비추는 빛 웅덩이
    spots, signs = [], []
    for _ in range(6):
        p = P.place(40, 18, 'walk', pad=10)
        if p:
            c1, c2 = rnd.choice([('MAG', 'CYAN'), ('CYAN', 'MAG'), ('MAG', 'YEL')])
            signs.append((p[0], p[1], c1, c2)); spots.append((p[0] + 20, p[1] + 9, 46, 26, c1, 90))
    for _ in range(9):
        spots.append((rnd.randrange(T), rnd.randrange(T), rnd.randint(40, 70), rnd.randint(22, 36), rnd.choice(['MAG', 'CYAN', 'MAGM']), 45))
    img.alpha_composite(glow_layer(spots))
    d = ImageDraw.Draw(img)
    for x, y, c1, c2 in signs:
        stamp(img, neon_sign(rnd, c1, c2), x, y)
        for _ in range(4):  # 튀는 불꽃 (간판 바로 곁에만)
            d.point(((x + rnd.randint(-3, 42)) % T, (y + rnd.randint(-3, 20)) % T), fill=C('YEL'))

    # 버려진 잔해: 폐차는 찻길 방향에 맞춰, 상자·드럼통은 인도에, 나머지는 어디든
    in_h = lambda x, y, w, h: ROAD_H[0] <= y and y + h <= ROAD_H[1] and not (ROAD_V[0] - 60 < x < ROAD_V[1] + 10)
    in_v = lambda x, y, w, h: ROAD_V[0] <= x and x + w <= ROAD_V[1] and not (ROAD_H[0] - 60 < y < ROAD_H[1] + 10)
    for k in range(4):
        car = car_wreck(rnd)
        if k % 2:
            car = car.rotate(90, expand=True)
        p = P.place(car.width, car.height, 'road', pad=10, ok=in_v if k % 2 else in_h)
        if p: stamp(img, car, *p)
    for fn, n, where in ((crate, 12, 'walk'), (barrel, 8, 'walk'), (rubble, 7, 'walk'), (rubble, 3, 'road'),
                         (scrap_sheet, 10, 'any'), (lambda r: tire(), 10, 'any')):
        for _ in range(n):
            obj = fn(rnd)
            p = P.place(obj.width, obj.height, where)
            if p: stamp(img, obj, *p)
    # 자잘한 쓰레기 (캔, 종이, 유리 조각) 도 서로·다른 물건과 겹치지 않게
    d = ImageDraw.Draw(img)
    for _ in range(150):
        p = P.place(6, 5, 'any', pad=2, tries=60)
        if not p: continue
        x, y = p
        kind = rnd.random()
        if kind < 0.4:
            d.rectangle([x, y, x + 3, y + 2], fill=C(rnd.choice(['MAGD', 'CYAND', 'YELD'])))
        elif kind < 0.7:
            d.polygon([(x, y), (x + 5, y + 1), (x + 4, y + 4), (x + 1, y + 3)], fill=C('D5'))
        else:
            d.point((x, y), fill=C('CYANM')); d.point((x + 2, y + 1), fill=C('GRAY'))
    return img, P


def ground_ch1(seed=500):
    """1챕터 바닥 (1024x1024, 이음새 없음). (이미지, 배치기록) 을 돌려준다"""
    global N
    old, N = N, T
    try:
        return _ground_ch1(seed)
    finally:
        N = old


def check_overlaps(P):
    """배치된 오브젝트 중 겹치는 쌍의 수 (0이어야 함)"""
    bad = 0
    for i, a in enumerate(P.rects):
        for b in P.rects[i + 1:]:
            if Placer._hit(a[0], a[0] + a[2], b[0], b[0] + b[2]) and Placer._hit(a[1], a[1] + a[3], b[1], b[1] + b[3]):
                bad += 1
    return bad
