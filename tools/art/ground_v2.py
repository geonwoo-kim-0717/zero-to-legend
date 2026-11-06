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
