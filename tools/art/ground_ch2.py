"""2챕터(인더스트리얼 구역) 바닥 + 먼 공장 실루엣.
1챕터와 같은 방식: 위치에 따라 두 바닥(철판 작업장 / 콘크리트 하역장)을 섞고, 오브젝트는 서로 겹치지 않게 놓는다.
컨베이어 띠(게임 규칙 game.json zoneRules.conveyor: period마다 band 높이)는 바닥 그림에 같이 그린다.
그래서 타일 높이를 period의 배수(176 x 6 = 1056)로 맞춰, 그림 속 컨베이어와 실제로 몸이 끌려가는 위치가 늘 같다.
사용: python3 tools/art/ground_ch2.py <출력 폴더>
"""
import json, os, random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
import ground_v2 as G
from ground_v2 import C, PAL

PAL.update(ORG='#ff7a1a', ORGM='#b8500f', ORGD='#6e2a0a', REDD='#5a0f1a', YELM='#b8a81f',
           STEEL='#262038', STEELL='#342c4c', STEELH='#4e4670', CARD='#5a3a22', CARDL='#7a5232')

_conv = json.load(open(os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'data', 'game.json')))['zoneRules']['conveyor']
PERIOD, BAND = _conv['period'], _conv['band']
ROWS = 6
W, H = 1024, PERIOD * ROWS
SPLITS = [380, 640, 470, 720, 330, 560]  # 줄마다 철판 | 콘크리트 경계 x (x=0 도 경계)
assert len(SPLITS) == ROWS and ROWS % 2 == 0  # 방향이 줄마다 바뀌므로 짝수 줄이어야 이어짐


# ───────── 기본 도구 (가로 W, 세로 H 직사각형 타일용) ─────────
def noise(seed, cx, cy, octaves=3):
    rng = np.random.default_rng(seed)
    out, amp, tot = np.zeros((H, W)), 1.0, 0.0
    for o in range(octaves):
        gx, gy = cx * 2 ** o, cy * 2 ** o
        g = rng.random((gy, gx))
        def axis(n, gn):
            f = np.arange(n) * gn / n
            i0 = np.floor(f).astype(int) % gn
            t = f - np.floor(f)
            return i0, (i0 + 1) % gn, t * t * (3 - 2 * t)
        x0, x1, tx = axis(W, gx)
        y0, y1, ty = axis(H, gy)
        a = g[y0][:, x0] * (1 - tx) + g[y0][:, x1] * tx
        b = g[y1][:, x0] * (1 - tx) + g[y1][:, x1] * tx
        out += amp * (a * (1 - ty)[:, None] + b * ty[:, None]); tot += amp; amp *= 0.5
    return out / tot


def toned(n, tones, seed, dither):
    rng = np.random.default_rng(seed + 99)
    n = n + (rng.random((H, W)) - 0.5) * dither
    lv = np.clip((n - n.min()) / (n.max() - n.min()) * len(tones), 0, len(tones) - 1).astype(int)
    rgb = np.array([C(t)[:3] for t in tones], dtype=np.uint8)
    arr = np.zeros((H, W, 4), dtype=np.uint8)
    arr[..., :3] = rgb[lv]; arr[..., 3] = 255
    return arr


def wrap(fn):
    for ox in (-W, 0, W):
        for oy in (-H, 0, H):
            fn(ox, oy)


def stamp(img, obj, x, y):
    for ox in (-W, 0, W):
        for oy in (-H, 0, H):
            if -obj.width < x + ox < W and -obj.height < y + oy < H:
                img.alpha_composite(obj, (x + ox, y + oy))


def glow(spots, blur=14):
    big = Image.new('RGBA', (W * 3, H * 3), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    for x, y, rx, ry, col, a in spots:
        for ox in (0, W, 2 * W):
            for oy in (0, H, 2 * H):
                d.ellipse([x - rx + ox, y - ry + oy, x + rx + ox, y + ry + oy], fill=C(col, a))
    return big.filter(ImageFilter.GaussianBlur(blur)).crop((W, H, 2 * W, 2 * H))


def region_map():
    """0 = 컨베이어 띠, 1 = 철판 작업장, 2 = 콘크리트 하역장"""
    yy, xx = np.mgrid[0:H, 0:W]
    split = np.array(SPLITS)[yy // PERIOD]
    reg = np.where(xx < split, 1, 2)
    reg[yy % PERIOD < BAND] = 0
    return reg


class Placer:
    """직사각형 타일 위에 서로 겹치지 않게 놓는다. where: 1(철판) 2(콘크리트) 'floor'(어느 쪽이든 한 곳 안)"""

    def __init__(self, reg, rnd):
        self.reg, self.rnd, self.rects = reg, rnd, []

    @staticmethod
    def _hit(a0, a1, b0, b1, n):
        return any(a0 < b1 + o and b0 + o < a1 for o in (-n, 0, n))

    def free(self, x, y, w, h, pad):
        return not any(self._hit(x - pad, x + w + pad, rx, rx + rw, W) and self._hit(y - pad, y + h + pad, ry, ry + rh, H)
                       for rx, ry, rw, rh in self.rects)

    def inside(self, x, y, w, h, where, margin=7):
        sub = self.reg[np.ix_(np.arange(y - margin, y + h + margin) % H, np.arange(x - margin, x + w + margin) % W)]
        if where == 'floor':
            return bool((sub == sub.flat[0]).all() and sub.flat[0] != 0)
        return bool((sub == where).all())

    def reserve(self, x, y, w, h):
        self.rects.append((x, y, w, h))

    def place(self, w, h, where, pad=6, tries=700):
        for _ in range(tries):
            x, y = self.rnd.randrange(W), self.rnd.randrange(H)
            if self.inside(x, y, w, h, where) and self.free(x, y, w, h, pad):
                self.reserve(x, y, w, h)
                return x, y
        return None

    def overlaps(self):
        r = self.rects
        return sum(1 for i, a in enumerate(r) for b in r[i + 1:]
                   if self._hit(a[0], a[0] + a[2], b[0], b[0] + b[2], W) and self._hit(a[1], a[1] + a[3], b[1], b[1] + b[3], H))


# ───────── 오브젝트 (위에서 본 모습, 작은 픽셀 그림) ─────────
def canvas(w, h):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def drum(rnd):
    im, d = canvas(12, 12)
    col = rnd.choice(['RUSTD', 'CYAND', 'GRAYD', 'ORGD'])
    d.ellipse([1, 1, 10, 10], fill=C(col)); d.ellipse([3, 3, 8, 8], outline=C('D0'))
    d.point((7, 4), fill=C('GRAY')); d.arc([1, 1, 10, 10], 200, 280, fill=C('STEELH'))
    if rnd.random() < 0.3:  # 새는 독성 액체
        d.point((5, 6), fill=C('LIME')); d.point((6, 6), fill=C('LIME'))
    return G.outline(im)


def gas_cylinders(rnd):
    im, d = canvas(24, 10)
    for i in range(rnd.randint(2, 3)):
        x = 1 + i * 7
        col = rnd.choice(['CYAND', 'RUSTD', 'GRAYD'])
        d.ellipse([x, 1, x + 6, 7], fill=C(col)); d.point((x + 3, 4), fill=C('D0')); d.point((x + 2, 2), fill=C('STEELH'))
    return G.outline(im)


def metal_crate(rnd):
    im, d = canvas(17, 14)
    d.rectangle([1, 1, 15, 12], fill=C('STEEL')); d.rectangle([1, 1, 15, 1], fill=C('STEELH'))
    d.rectangle([3, 3, 13, 10], outline=C('STEELL'))
    for k in range(0, 5, 2):  # 모서리 경고 줄무늬
        d.point((2 + k, 11), fill=C('YELM')); d.point((14 - k, 2), fill=C('YELM'))
    for p in ((2, 2), (14, 2), (2, 11), (14, 11)):
        d.point(p, fill=C('GRAY'))
    return G.outline(im)


def pallet(rnd, boxes):
    im, d = canvas(22, 17)
    for y in (1, 6, 11):
        d.rectangle([1, y, 20, y + 3], fill=C('WOOD')); d.line([1, y, 20, y], fill=C('WOODL'))
    if boxes:
        d.rectangle([3, 2, 11, 9], fill=C('CARD')); d.line([3, 2, 11, 2], fill=C('CARDL')); d.line([7, 2, 7, 9], fill=C('YELD'))
        if rnd.random() < 0.6:
            d.rectangle([12, 6, 19, 14], fill=C('CARD')); d.line([12, 6, 19, 6], fill=C('CARDL')); d.line([12, 10, 19, 10], fill=C('YELD'))
    return G.outline(im)


def forklift(rnd):
    """위에서 본 부서진 지게차: 노란 차체, 운전석 철골, 앞쪽 포크 두 개"""
    im, d = canvas(22, 36)
    d.rectangle([7, 0, 8, 10], fill=C('GRAY')); d.rectangle([13, 0, 14, 10], fill=C('GRAY'))  # 포크
    d.rectangle([4, 10, 17, 12], fill=C('STEELL'))  # 마스트
    for wx, wy in ((2, 13), (16, 13), (2, 28), (16, 28)):
        d.rectangle([wx, wy, wx + 3, wy + 5], fill=C('D0'))
    d.rectangle([4, 13, 17, 34], fill=C('YELD')); d.rectangle([4, 13, 17, 14], fill=C('YELM'))
    d.rectangle([6, 17, 15, 27], outline=C('D0')); d.line([6, 17, 15, 27], fill=C('D0'))  # 운전석 철골 (찌그러짐)
    d.rectangle([5, 29, 16, 33], fill=C('ORGD'))  # 평형추
    for _ in range(8):
        d.point((rnd.randint(4, 17), rnd.randint(14, 33)), fill=C(rnd.choice(['RUST', 'RUSTD'])))
    im = G.outline(im)
    return im.rotate(rnd.choice([0, 90, 180, 270]), expand=True)


def cone():
    im, d = canvas(8, 8)
    d.rectangle([0, 0, 7, 7], fill=C('ORGD')); d.ellipse([1, 1, 6, 6], fill=C('ORG')); d.ellipse([3, 3, 4, 4], fill=C('D0'))
    return im


def toolbox(rnd):
    im, d = canvas(13, 8)
    d.rectangle([1, 2, 11, 6], fill=C(rnd.choice(['RED', 'REDD', 'CYAND']))); d.rectangle([4, 1, 8, 2], outline=C('GRAY'))
    d.line([1, 4, 11, 4], fill=C('D0'))
    return G.outline(im)


def cable_coil():
    im, d = canvas(15, 15)
    d.ellipse([1, 1, 13, 13], fill=C('D0')); d.ellipse([1, 1, 13, 13], outline=C('GRAYD'))
    d.ellipse([3, 3, 11, 11], outline=C('ORGD')); d.ellipse([5, 5, 9, 9], outline=C('GRAYD'))
    d.line([13, 7, 15, 9], fill=C('GRAYD'))
    return im


def mech_arm(rnd):
    """생산 라인에서 버려진 전투 메크 팔: 관절, 피스톤, 집게, 끊긴 전선"""
    im, d = canvas(38, 14)
    d.rectangle([1, 4, 14, 9], fill=C('STEELL')); d.line([1, 4, 14, 4], fill=C('STEELH'))
    d.ellipse([12, 3, 19, 10], fill=C('GRAY')); d.point((15, 6), fill=C('D0'))
    d.rectangle([18, 5, 29, 8], fill=C('STEEL')); d.line([19, 7, 28, 7], fill=C('GRAY'))  # 피스톤
    d.line([29, 3, 35, 1], fill=C('GRAY')); d.line([29, 6, 36, 6], fill=C('GRAY')); d.line([29, 9, 35, 12], fill=C('GRAY'))  # 집게
    for x, col in ((2, 'MAG'), (3, 'CYAN'), (1, 'YEL')):
        d.point((x, 6 + rnd.randint(-1, 2)), fill=C(col))  # 끊긴 전선
    return G.outline(im)


def mech_head(rnd):
    im, d = canvas(15, 13)
    d.ellipse([1, 1, 13, 11], fill=C('STEELL')); d.arc([1, 1, 13, 11], 200, 300, fill=C('STEELH'))
    d.rectangle([3, 6, 11, 7], fill=C('REDD')); d.point((5, 6), fill=C('RED'))  # 꺼져 가는 눈
    d.line([9, 2, 12, 8], fill=C('D0'))  # 깨진 금
    return G.outline(im)


def scrap_pile(rnd):
    im, d = canvas(24, 14)
    for _ in range(8):
        x, y, s = rnd.randint(1, 18), rnd.randint(2, 9), rnd.randint(3, 6)
        d.polygon([(x, y + s // 2), (x + s, y), (x + s + 1, y + s // 2), (x + 2, y + s)], fill=C(rnd.choice(['STEEL', 'STEELL', 'GRAYD', 'RUSTD'])))
    d.line([2, 11, 21, 9], fill=C('GRAY'))
    return G.outline(im)


def vent(rnd):
    """바닥 배기구: 아래 용광로 불빛이 새어 나옴"""
    im, d = canvas(22, 22)
    d.rectangle([0, 0, 21, 21], fill=C('D0'), outline=C('GRAY'))
    for y in range(3, 19, 3):
        d.line([3, y, 18, y], fill=C('ORGM')); d.line([3, y + 1, 18, y + 1], fill=C('D0'))
    for _ in range(6):
        d.point((rnd.randint(3, 18), rnd.randint(3, 18)), fill=C('ORG'))
    for p in ((1, 1), (20, 1), (1, 20), (20, 20)):
        d.point(p, fill=C('STEELH'))
    return im


def oil_spill(rnd):
    rx, ry = rnd.randint(14, 24), rnd.randint(6, 10)
    im, d = canvas(2 * rx + 2, 2 * ry + 2)
    d.ellipse([0, 0, 2 * rx, 2 * ry], fill=C('D0'))
    for i, col in enumerate(['MAGD', 'ORGD', 'CYAND']):
        s = 3 + i * 3
        if rx - s > 3 and ry - s // 2 > 2:
            d.arc([s, s // 2, 2 * rx - s, 2 * ry - s // 2], 190, 340, fill=C(col))
    return im


def drain():
    im, d = canvas(18, 12)
    d.rectangle([0, 0, 17, 11], fill=C('BG'), outline=C('GRAY'))
    for x in range(3, 16, 3):
        d.line([x, 2, x, 9], fill=C('GRAYD'))
    return im


def holo_sign(rnd):
    return G.neon_sign(rnd, *rnd.choice([('ORG', 'YEL'), ('YEL', 'ORG'), ('ORG', 'CYAN')]))


# ───────── 바닥 그리기 ─────────
def _steel(arr, rnd):
    """철판 작업장: 리벳 박힌 큰 철판, 절반은 미끄럼 방지 무늬"""
    img = Image.fromarray(arr, 'RGBA'); d = ImageDraw.Draw(img)
    for k in range(ROWS):
        top = k * PERIOD + BAND
        for j in range(3):
            py = top + j * 44
            off = 32 if j % 2 else 0
            for px in range(-64 + off, W, 64):
                if rnd.random() < 0.5:  # 다이아몬드 무늬
                    for ty in range(py + 4, py + 41, 5):
                        for tx in range(px + 4 + (ty // 5 % 2) * 3, px + 61, 6):
                            d.line([tx, ty, tx + 1, ty - 1], fill=C('STEELL'))
                elif rnd.random() < 0.3:  # 얼룩진 판
                    d.rectangle([px + 2, py + 2, px + 62, py + 42], fill=C('D2'))
                d.line([px, py, px, py + 44], fill=C('D0')); d.line([px + 1, py, px + 1, py + 44], fill=C('STEELH'))
                for rx, ry in ((px + 4, py + 4), (px + 59, py + 4), (px + 4, py + 39), (px + 59, py + 39)):
                    d.point((rx, ry), fill=C('GRAY')); d.point((rx + 1, ry + 1), fill=C('D0'))
            d.line([0, py, W, py], fill=C('D0')); d.line([0, py + 1, W, py + 1], fill=C('STEELH'))
    stains = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ds = ImageDraw.Draw(stains)  # 반투명 얼룩은 따로 그려 겹쳐 올림
    for _ in range(90):  # 녹 얼룩
        x, y, r = rnd.randrange(W), rnd.randrange(H), rnd.randint(3, 9)
        wrap(lambda ox, oy, x=x, y=y, r=r: ds.ellipse([x - r + ox, y - r // 2 + oy, x + r + ox, y + r // 2 + oy], fill=C('RUSTD', 120)))
    for _ in range(30):  # 그을음
        x, y, r = rnd.randrange(W), rnd.randrange(H), rnd.randint(6, 14)
        wrap(lambda ox, oy, x=x, y=y, r=r: ds.ellipse([x - r + ox, y - r // 2 + oy, x + r + ox, y + r // 2 + oy], fill=C('BG', 90)))
    img.alpha_composite(stains)
    return np.array(img)


def _concrete(arr, rnd):
    """콘크리트 하역장: 줄눈, 금, 지게차 바퀴 자국"""
    img = Image.fromarray(arr, 'RGBA'); d = ImageDraw.Draw(img)
    for x in range(0, W, 88):
        d.line([x, 0, x, H], fill=C('D1'))
    for k in range(ROWS):
        top = k * PERIOD + BAND
        d.line([0, top + 66, W, top + 66], fill=C('D1'))
    G_cr = random.Random(rnd.random())
    for _ in range(60):
        x, y = G_cr.randrange(W), G_cr.randrange(H)
        pts = [(x, y)]
        for _ in range(G_cr.randint(3, 7)):
            x += G_cr.randint(-9, 9); y += G_cr.randint(-9, 9); pts.append((x, y))
        wrap(lambda ox, oy, pts=pts: d.line([(a + ox, b + oy) for a, b in pts], fill=C('D0')))
    for _ in range(12):  # 바퀴 자국 (곡선 점선 두 줄)
        x0, y0 = rnd.randrange(W), rnd.randrange(H)
        amp, ln = rnd.randint(8, 22), rnd.randint(80, 180)
        for t in range(0, ln, 2):
            yy = y0 + int(amp * np.sin(t / ln * 3.1))
            for dy in (0, 9):
                wrap(lambda ox, oy, t=t, yy=yy, dy=dy: d.point((x0 + t + ox, yy + dy + oy), fill=C('D1')))
    return np.array(img)


def _paint(img, reg, rnd, P):
    """콘크리트 위 페인트: 컨베이어 옆 안전선, 경계 안쪽 선, 방향 화살표, 하역 구역 사각형"""
    px = img.load()
    def put(x, y, col, wear=0.3):
        if rnd.random() > wear:
            px[x % W, y % H] = C(col)
    for k in range(ROWS):
        top, bot, split = k * PERIOD + BAND, (k + 1) * PERIOD, SPLITS[k]
        for x in range(split + 10, W - 10):
            put(x, top + 8, 'YELD'); put(x, bot - 9, 'YELD')
        for y in range(top + 8, bot - 8):
            put(split + 10, y, 'YELD'); put(W - 11, y, 'YELD')
    for _ in range(3):  # 하역 구역 (노랑·검정 사선 테두리) + 안에 팔레트 하나
        p = P.place(54, 40, 2, pad=8)
        if not p:
            continue
        x0, y0 = p
        for x in range(x0, x0 + 54):
            for y in range(y0, y0 + 40):
                if x - x0 < 3 or x0 + 54 - x <= 3 or y - y0 < 3 or y0 + 40 - y <= 3:
                    put(x, y, 'YELM' if ((x + y) // 3) % 2 else 'BG', 0.2)
        stamp(img, pallet(rnd, True), x0 + 16, y0 + 12)
    for _ in range(8):  # 방향 화살표
        p = P.place(14, 10, 2, pad=4)
        if not p:
            continue
        x0, y0 = p
        right = rnd.random() < 0.5
        for i in range(5):
            for dx in range(2):
                xx = x0 + (2 + i + dx if right else 11 - i - dx)
                put(xx, y0 + i, 'YELD', 0.15); put(xx, y0 + 9 - i, 'YELD', 0.15)


def _conveyors(img):
    """컨베이어 띠: 위아래 경고 줄무늬 레일 + 고무 벨트 (움직이는 칸살은 게임에서 그림)"""
    arr = np.array(img)
    rng = np.random.default_rng(7)
    yel, blk, gray, d0, d1, d2 = (np.array(C(k), dtype=np.uint8) for k in ('YELM', 'BG', 'GRAY', 'D0', 'D1', 'D2'))
    for k in range(ROWS):
        y0 = k * PERIOD
        for r in range(BAND):
            y = y0 + r
            if r < 4 or r >= BAND - 4:
                stripe = ((np.arange(W) + r) // 5) % 2 == 0
                arr[y] = np.where(stripe[:, None], yel, blk)
                if r in (0, BAND - 1):
                    arr[y] = d0
            elif r in (4, BAND - 5):
                arr[y] = gray
            elif r in (5, BAND - 6):
                arr[y] = d0
            else:
                row = np.where(rng.random(W)[:, None] < 0.12, d2, d1)
                arr[y] = row
        for x in range(0, W, 24):  # 레일 볼트
            for r in (2, BAND - 3):
                arr[y0 + r, x:x + 2] = gray
    return Image.fromarray(arr, 'RGBA')


def _trims(arr, reg):
    """철판과 콘크리트가 만나는 곳의 쇠 테두리"""
    edge = (reg == 1) & (np.roll(reg, -1, 1) == 2) | (reg == 2) & (np.roll(reg, -1, 1) == 1)
    ys, xs = np.nonzero(edge)
    for y, x in zip(ys, xs):
        for dx, col in ((-1, 'D0'), (0, 'STEELH'), (1, 'GRAY'), (2, 'D0')):
            arr[y, (x + dx) % W] = C(col)
    return arr


def ground_ch2(seed=700):
    rnd = random.Random(seed)
    reg = region_map()
    steel = _steel(toned(noise(seed, 16, 16, 3), ['STEEL', 'STEEL', 'D3', 'STEELL'], seed, 0.14), rnd)
    conc = _concrete(toned(noise(seed + 1, 12, 12, 3), ['D2', 'D3', 'D3', 'D4'], seed + 1, 0.10), rnd)
    arr = np.where((reg == 1)[..., None], steel, conc).astype(np.uint8)
    arr = _trims(arr, reg)
    img = _conveyors(Image.fromarray(arr, 'RGBA'))
    d = ImageDraw.Draw(img)
    for _ in range(1400):  # 쇳가루·먼지 반짝임
        x, y = rnd.randrange(W), rnd.randrange(H)
        if reg[y, x]:
            d.point((x, y), fill=C(rnd.choice(['STEELH', 'D5', 'ORGD'])))

    P = Placer(reg, rnd)
    _paint(img, reg, rnd, P)
    # 바닥 시설
    spots = []
    for _ in range(6):
        p = P.place(22, 22, 1, pad=10)
        if p:
            stamp(img, vent(rnd), *p); spots.append((p[0] + 11, p[1] + 11, 34, 22, 'ORG', 85))
    for _ in range(5):
        p = P.place(18, 12, 2)
        if p: stamp(img, drain(), *p)
    for _ in range(6):
        o = oil_spill(rnd); p = P.place(o.width, o.height, 2)
        if p: stamp(img, o, *p)
    # 떨어진 홀로 경고판 (빛 번짐 포함)
    signs = []
    for where in (1, 2, 2):
        p = P.place(40, 18, where, pad=10)
        if p:
            signs.append(p); spots.append((p[0] + 20, p[1] + 9, 44, 24, 'ORG', 80))
    for _ in range(10):  # 화면 밖 용광로·경광등이 비추는 빛
        spots.append((rnd.randrange(W), rnd.randrange(H), rnd.randint(40, 80), rnd.randint(20, 36), rnd.choice(['ORG', 'ORGM', 'RED', 'CYAN']), 40))
    img.alpha_composite(glow(spots))
    for p in signs:
        stamp(img, holo_sign(rnd), *p)
    # 잔해·장비
    for fn, n, where in ((forklift, 2, 2), (lambda r: pallet(r, r.random() < 0.5), 7, 2), (lambda r: cone(), 9, 2),
                         (mech_arm, 4, 1), (mech_head, 3, 1), (drum, 10, 1), (gas_cylinders, 4, 1), (metal_crate, 7, 1),
                         (lambda r: cable_coil(), 4, 1), (toolbox, 3, 1), (scrap_pile, 5, 1), (scrap_pile, 3, 2),
                         (G.scrap_sheet, 6, 'floor'), (drum, 3, 2)):
        for _ in range(n):
            o = fn(rnd); p = P.place(o.width, o.height, where)
            if p: stamp(img, o, *p)
    d = ImageDraw.Draw(img)
    for _ in range(140):  # 볼트·너트·캔
        p = P.place(5, 4, 'floor', pad=2, tries=60)
        if not p: continue
        x, y = p; k = rnd.random()
        if k < 0.45:
            d.point((x, y), fill=C('GRAY')); d.point((x + 1, y), fill=C('STEELH'))
        elif k < 0.75:
            d.rectangle([x, y, x + 2, y + 1], fill=C(rnd.choice(['ORGD', 'CYAND', 'YELD'])))
        else:
            d.ellipse([x, y, x + 3, y + 3], outline=C('GRAYD'))
    return img, P


# ───────── 먼 공장 실루엣 (화면 위쪽) ─────────
def factory_skyline(width=1024, height=150, seed=17):
    rnd = random.Random(seed)
    sky = np.zeros((height, width, 4), dtype=np.uint8)
    for y in range(height):  # 위는 짙은 남색, 지평선은 용광로 불빛에 물든 주황 안개
        k = y / height
        col = np.array(C('BG')[:3]) * (1 - k) + np.array(C('ORGD')[:3]) * k * 0.45 + np.array(C('REDD')[:3]) * k * 0.35 + np.array(C('D2')[:3]) * k * 0.2
        sky[y, :, :3] = col.astype(np.uint8); sky[y, :, 3] = 255
    im = Image.fromarray(sky, 'RGBA')
    d = ImageDraw.Draw(im)
    def X(fn):
        for ox in (0, width, -width):
            fn(ox)
    ground = height - 8
    # 먼 층: 톱니 지붕 공장, 냉각탑, 굴뚝 + 연기
    smoke = []
    x = rnd.randint(-10, 0)
    while x < width:
        kind = rnd.random()
        if kind < 0.45:
            w, h = rnd.randint(50, 90), rnd.randint(30, 55)
            top = ground - h - 14
            def hall(ox, x=x, w=w, top=top):
                d.rectangle([x + ox, top, x + w + ox, ground], fill=C('D2'))
                for t in range(x, x + w - 8, 10):
                    d.polygon([(t + ox, top), (t + 10 + ox, top - 7), (t + 10 + ox, top)], fill=C('D2'))
            X(hall)
            for wy in range(top + 5, ground - 4, 6):
                for wx in range(x + 3, x + w - 2, 5):
                    if rnd.random() < 0.15:
                        c = C(rnd.choice(['ORGM', 'ORGD', 'YELD']), 210)
                        X(lambda ox, wx=wx, wy=wy, c=c: d.rectangle([wx + ox, wy, wx + 1 + ox, wy], fill=c))
            x += w + rnd.randint(0, 8)
        elif kind < 0.65:
            w, h = rnd.randint(30, 44), rnd.randint(50, 75)
            top = ground - h
            pts = [(x, ground), (x + w * 0.18, top + h * 0.45), (x + w * 0.1, top), (x + w * 0.9, top), (x + w * 0.82, top + h * 0.45), (x + w, ground)]
            X(lambda ox, pts=pts: d.polygon([(a + ox, b) for a, b in pts], fill=C('D2')))
            smoke.append((x + w // 2, top, w // 2, 'GRAYD'))
            x += w + rnd.randint(4, 12)
        else:
            w, h = rnd.randint(6, 10), rnd.randint(80, 125)
            top = ground - h
            def stack(ox, x=x, w=w, top=top):
                d.rectangle([x + ox, top, x + w + ox, ground], fill=C('D1'))
                for b in range(top + 8, ground, 18):
                    d.line([x + ox, b, x + w + ox, b], fill=C('REDD'))
                d.point((x + w // 2 + ox, top - 1), fill=C('RED'))
            X(stack)
            smoke.append((x + w // 2, top, w, 'D4'))
            x += w + rnd.randint(10, 30)
    # 연기: 바람 따라 오른쪽으로 흩어지며 옅어짐
    sm = Image.new('RGBA', (width, height), (0, 0, 0, 0)); ds = ImageDraw.Draw(sm)
    for sx, sy, r0, col in smoke:
        for t in range(14):
            cx, cy, r = sx + t * 4 + rnd.randint(-2, 2), sy - 4 - t * 4, r0 * 0.6 + t * 1.6
            a = max(0, 150 - t * 10)
            for ox in (0, width, -width):
                ds.ellipse([cx - r + ox, cy - r * 0.7, cx + r + ox, cy + r * 0.7], fill=C(col, a))
    im.alpha_composite(sm.filter(ImageFilter.GaussianBlur(2)))
    d = ImageDraw.Draw(im)
    # 가까운 층: 배관, 탱크, 철골 크레인, 아르코난 간판
    x = rnd.randint(-10, 0)
    while x < width:
        kind = rnd.random()
        if kind < 0.4:  # 원통 탱크
            w, h = rnd.randint(22, 36), rnd.randint(28, 48)
            top = ground - h
            def tank(ox, x=x, w=w, top=top):
                d.rectangle([x + ox, top + 5, x + w + ox, ground], fill=C('D0'))
                d.ellipse([x + ox, top, x + w + ox, top + 10], fill=C('D0'))
                d.line([x + 2 + ox, top + 12, x + 2 + ox, ground], fill=C('D2'))
                d.point((x + w // 2 + ox, top + 16), fill=C('ORG'))
            X(tank)
            x += w + rnd.randint(4, 14)
        elif kind < 0.6:  # 철골 크레인
            h = rnd.randint(60, 95); top = ground - h; arm = rnd.randint(30, 50)
            def crane(ox, x=x, top=top, arm=arm):
                d.line([x + ox, top, x + ox, ground], fill=C('D0'), width=2); d.line([x + 5 + ox, top, x + 5 + ox, ground], fill=C('D0'), width=2)
                for b in range(top, ground, 8):
                    d.line([x + ox, b, x + 5 + ox, b + 8], fill=C('D0'))
                d.line([x - 8 + ox, top, x + arm + ox, top], fill=C('D0'), width=2)
                d.line([x + arm - 4 + ox, top, x + arm - 4 + ox, top + 18], fill=C('D1'))
                d.point((x + arm + ox, top - 1), fill=C('RED'))
            X(crane)
            x += arm + rnd.randint(6, 16)
        elif kind < 0.75:  # 간판 (읽히는 글자 없음)
            w = rnd.randint(26, 40); top = ground - rnd.randint(40, 70)
            col = rnd.choice(['MAG', 'CYAN'])
            def sign(ox, x=x, w=w, top=top, col=col):
                d.rectangle([x + ox, top, x + w + ox, ground], fill=C('D0'))
                d.rectangle([x + 2 + ox, top + 4, x + w - 2 + ox, top + 11], fill=C(col, 170))
                d.line([x + 5 + ox, top + 7, x + w - 5 + ox, top + 7], fill=C('#e8f7ff', 170))
            X(sign)
            x += w + rnd.randint(6, 18)
        else:
            x += rnd.randint(14, 30)
    # 배관: 화면을 가로지르는 굵은 파이프 두 줄 (이음새 없이)
    for py, th in ((ground - 22, 4), (ground - 12, 3)):
        d.rectangle([0, py, width, py + th], fill=C('D0')); d.line([0, py, width, py], fill=C('D2'))
        for fx in range(rnd.randint(0, 20), width, rnd.choice([48, 64])):
            d.rectangle([fx, py - 1, fx + 2, py + th + 1], fill=C('D2'))
    # 용광로 불빛 + 불티
    gl = Image.new('RGBA', (width, height), (0, 0, 0, 0)); dg = ImageDraw.Draw(gl)
    for _ in range(7):
        gx = rnd.randrange(width); gw = rnd.randint(40, 90)
        for ox in (0, width, -width):
            dg.ellipse([gx - gw + ox, ground - 18, gx + gw + ox, ground + 10], fill=C('ORG', 90))
    im.alpha_composite(gl.filter(ImageFilter.GaussianBlur(9)))
    d = ImageDraw.Draw(im)
    for _ in range(90):
        d.point((rnd.randrange(width), rnd.randint(ground - 50, ground)), fill=C(rnd.choice(['ORG', 'YEL', 'ORGM'])))
    arr = np.array(im).astype(float)
    arr[..., 3] = 255  # 하늘 위에 그린 것은 모두 불투명 (반투명 칠이 뒤 바닥을 비추지 않게)
    arr[..., 3] *= np.clip((height - np.arange(height)) / 40, 0, 1)[:, None]
    out = Image.fromarray(arr.astype(np.uint8), 'RGBA')
    haze = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    ImageDraw.Draw(haze).rectangle([0, height - 34, width, height - 12], fill=C('ORGD', 80))
    out.alpha_composite(haze.filter(ImageFilter.GaussianBlur(8)))
    return out


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    img, P = ground_ch2()
    img.save(os.path.join(out, 'ground_industrial.png'))
    factory_skyline().save(os.path.join(out, 'skyline_ch2.png'))
    print('objects', len(P.rects), 'overlaps', P.overlaps(), img.size)
