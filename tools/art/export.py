"""게임에 쓰는 도트 스프라이트와 바닥 타일을 src/assets/ 로 내보낸다.
사용: python3 tools/art/export.py   (Pillow 필요)
디자인을 바꾸려면 pixelart.py 의 함수(zero, drone, thug, gunner, psycho, ground_tile)를 고친 뒤 다시 실행한다."""
import os, random, sys, math
sys.path.insert(0, os.path.dirname(__file__))
from PIL import Image, ImageDraw
import pixelart as A
import ground_v2
import ground_ch2

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'assets')
os.makedirs(OUT, exist_ok=True)
C = A.C

def _wrapped(size, fn):
    """가장자리를 넘어가는 도형이 반대편으로 이어지도록 9번 그린다 (이음새 없는 타일)"""
    for ox in (-size, 0, size):
        for oy in (-size, 0, size):
            fn(ox, oy)



def S(w, h): return A.Spr(w, h)

# ───────────────────────── 블랙 실드 진압대 v2: 검은 전술 장비 특수부대 ─────────────────────────
for _k, _v in dict(K0='#0b0a12', K1='#17151f', K2='#262331', K3='#3c3849', K4='#5f5a74', KR='#ff2a3a', KRD='#8a0f1c').items():
    A.P[_k] = _v

def _bs_body(s, visor='KR', crouch=0):
    """공통 몸체 (24x24): 검은 헬멧·바이저, 플레이트 캐리어, 무릎 보호대, 가슴의 붉은 방패 표식"""
    y = crouch
    # 다리 + 무릎 보호대 + 부츠
    s.r(8, 16 + y, 11, 21, 'K1'); s.r(13, 16 + y, 16, 21, 'K1')
    s.r(8, 18, 11, 19, 'K3'); s.r(13, 18, 16, 19, 'K3')
    s.r(7, 21, 11, 22, 'K0'); s.r(13, 21, 17, 22, 'K0'); s.r(7, 22, 11, 22, 'K2'); s.r(13, 22, 17, 22, 'K2')
    # 몸통: 플레이트 캐리어 + 탄입대
    s.r(7, 9 + y, 17, 16 + y, 'K2'); s.r(8, 10 + y, 16, 15 + y, 'K1')
    s.r(8, 13 + y, 10, 15 + y, 'K3'); s.r(14, 13 + y, 16, 15 + y, 'K3')
    s.r(7, 9 + y, 17, 9 + y, 'K3')
    s.poly([(11, 10 + y), (13, 10 + y), (13, 12 + y), (12, 13 + y), (11, 12 + y)], 'KRD'); s.p(12, 11 + y, 'KR')  # 방패 표식
    # 어깨 보호대
    s.r(5, 9 + y, 7, 11 + y, 'K3'); s.r(17, 9 + y, 19, 11 + y, 'K3')
    # 헬멧 + 바이저
    s.r(8, 1 + y, 16, 8 + y, 'K1'); s.r(8, 1 + y, 16, 1 + y, 'K3'); s.r(9, 0 + y, 15, 0 + y, 'K2')
    s.r(9, 4 + y, 16, 5 + y, visor); s.p(15, 4 + y, 'WHITE'); s.r(8, 6 + y, 16, 7 + y, 'K2')
    s.r(10, 7 + y, 14, 8 + y, 'K0')  # 방독 마스크

def trooper():
    """탱커: 몸 앞을 가리는 검은 진압 방패 (붉은 줄 + 관측창)"""
    s = S(24, 24)
    _bs_body(s)
    s.r(4, 12, 6, 17, 'K2')
    s.r(1, 5, 6, 21, 'K1'); s.r(1, 5, 6, 5, 'K3'); s.r(1, 5, 1, 21, 'K3')
    s.r(2, 8, 5, 9, 'K4'); s.r(2, 15, 5, 15, 'KR'); s.r(2, 16, 5, 16, 'KRD')
    s.r(18, 12, 20, 16, 'K2'); s.r(19, 16, 20, 17, 'K0')
    return s.outline('K4')

def trooper_melee():
    """근접 공격수: 몸을 숙이고 전기 진압봉, 붉은 바이저"""
    s = S(24, 24)
    _bs_body(s, crouch=1)
    s.r(4, 12, 6, 16, 'K2'); s.r(4, 16, 6, 17, 'K0')
    s.r(18, 12, 20, 15, 'K2'); s.r(19, 15, 20, 16, 'K0')
    s.l(20, 15, 23, 4, 'K3'); s.l(21, 15, 23, 6, 'K4')
    s.p(23, 3, 'CYAN'); s.p(22, 2, 'CYAN'); s.p(23, 1, 'WHITE'); s.p(21, 4, 'CYAN')
    return s.outline('K4')

def trooper_hacker():
    """해커: 초록 바이저, 등의 안테나, 손목 홀로그램 단말기"""
    s = S(24, 24)
    _bs_body(s, visor='GRN')
    s.r(17, 1, 17, 8, 'K3'); s.p(17, 0, 'GRN'); s.r(6, 3, 6, 8, 'K3'); s.p(6, 2, 'GRN')
    s.r(4, 12, 6, 16, 'K2'); s.r(18, 12, 20, 15, 'K2')
    s.r(19, 15, 22, 17, 'K0'); s.r(20, 16, 21, 16, 'GRN')
    s.r(20, 11, 23, 13, 'GRN'); s.r(21, 12, 22, 12, 'WHITE')  # 홀로그램 창
    s.p(12, 11, 'GRN')
    return s.outline('K4')

def trooper_sniper():
    """저격수: 긴 검은 저격총 + 붉은 조준경, 한쪽 무릎을 꿇음"""
    s = S(28, 24)
    _bs_body(s, crouch=1)
    s.r(4, 12, 6, 16, 'K2')
    s.r(14, 12, 27, 13, 'K2'); s.r(14, 12, 27, 12, 'K3'); s.r(17, 10, 21, 11, 'K1'); s.r(18, 10, 20, 10, 'KR'); s.p(27, 12, 'K4')
    s.r(14, 14, 16, 16, 'K1'); s.r(22, 14, 22, 16, 'K3')
    return s.outline('K4')

def dropship():
    """기업 드롭쉽 (64x32, 위에서 본 모습, 오른쪽이 앞)"""
    s = S(64, 32)
    for cx, cy in ((12, 5), (12, 26), (46, 5), (46, 26)):
        s.e(cx - 6, cy - 5, cx + 6, cy + 5, 'VIO'); s.e(cx - 3, cy - 2, cx + 3, cy + 2, 'CYAND')
    s.r(10, 8, 48, 23, 'UI'); s.poly([(48, 8), (62, 14), (62, 17), (48, 23)], 'UI')
    s.r(10, 8, 48, 8, 'DIM'); s.r(14, 12, 44, 19, 'BG'); s.r(14, 15, 44, 16, 'GRID')
    s.r(50, 13, 56, 18, 'RED'); s.r(52, 14, 55, 15, 'WHITE')
    s.r(4, 13, 9, 18, 'DIM'); s.r(2, 14, 4, 17, 'ORG'); s.p(1, 15, 'YEL'); s.p(1, 16, 'YEL')
    s.p(10, 8, 'RED'); s.p(10, 23, 'GRN'); s.p(62, 15, 'WHITE'); s.r(20, 10, 23, 10, 'WHITE'); s.r(30, 10, 33, 10, 'WHITE')
    return s.outline()

def icon(kind):
    """HUD 아이콘 (14x14)"""
    s = S(14, 14)
    if kind == 'smartPistol':
        s.r(2, 4, 10, 6, 'DIM'); s.r(3, 7, 5, 11, 'UI'); s.r(10, 4, 11, 5, 'YEL'); s.p(4, 4, 'WHITE')
    elif kind == 'mantisBlade':
        s.l(2, 11, 11, 2, 'WHITE'); s.l(3, 11, 12, 2, 'CYAN'); s.r(1, 10, 3, 12, 'DIM')
    elif kind == 'hackDrone':
        s.r(4, 4, 9, 9, 'CYAN'); s.r(6, 6, 7, 7, 'WHITE'); s.r(1, 1, 3, 2, 'DIM'); s.r(10, 1, 12, 2, 'DIM'); s.r(1, 11, 3, 12, 'DIM'); s.r(10, 11, 12, 12, 'DIM')
    elif kind == 'plasmaGrenade':
        s.e(2, 3, 11, 12, 'MAG'); s.r(5, 6, 7, 8, 'YEL'); s.r(6, 1, 7, 3, 'WHITE')
    elif kind == 'monowire':
        s.l(1, 12, 6, 4, 'DIM'); s.l(6, 4, 12, 9, 'WHITE'); s.l(6, 5, 12, 10, 'MAG'); s.r(0, 11, 2, 13, 'UI')
    elif kind == 'empField':
        s.e(1, 1, 12, 12, 'CYAND'); s.e(3, 3, 10, 10, 'BG'); s.poly([(7, 2), (4, 7), (7, 7), (6, 11), (10, 5), (7, 5)], 'YEL')
    elif kind == 'railgun':
        s.r(1, 5, 12, 7, 'DIM'); s.r(1, 4, 9, 4, 'CYAN'); s.r(1, 8, 9, 8, 'CYAN'); s.r(3, 9, 5, 12, 'UI'); s.r(12, 5, 13, 7, 'WHITE')
    elif kind == 'shotgun':
        s.r(1, 5, 11, 7, 'RUST'); s.r(8, 4, 12, 5, 'DIM'); s.r(2, 8, 4, 12, 'UI'); s.p(13, 3, 'YEL'); s.p(13, 6, 'YEL'); s.p(13, 9, 'YEL')
    elif kind == 'turret':
        s.r(3, 8, 10, 12, 'DIM'); s.r(5, 5, 8, 8, 'UI'); s.r(8, 6, 13, 6, 'WHITE'); s.p(6, 6, 'RED'); s.r(2, 12, 11, 12, 'YEL')
    elif kind == 'microMissile':
        s.l(2, 11, 9, 4, 'WHITE'); s.r(9, 3, 11, 5, 'RED'); s.p(1, 12, 'ORG'); s.p(2, 12, 'YEL'); s.l(5, 12, 11, 6, 'DIM'); s.p(12, 5, 'RED')
    elif kind == 'arcCoil':
        s.r(2, 9, 5, 13, 'DIM'); s.r(3, 2, 4, 9, 'ORG'); s.l(4, 3, 8, 6, 'CYAN'); s.l(8, 6, 6, 8, 'CYAN'); s.l(6, 8, 12, 11, 'WHITE')
    elif kind == 'proxMine':
        s.e(2, 5, 11, 12, 'UI'); s.e(3, 6, 10, 11, 'DIM'); s.r(6, 7, 7, 9, 'RED'); s.r(6, 2, 7, 5, 'DIM'); s.p(6, 1, 'YEL')
    elif kind == 'muscle':
        s.r(2, 6, 8, 11, 'ORG'); s.r(6, 2, 10, 7, 'ORG'); s.r(9, 1, 11, 3, 'DIM'); s.r(3, 7, 7, 7, 'YEL')
    elif kind == 'neural':
        s.r(3, 3, 10, 10, 'GRN'); s.r(5, 5, 8, 8, 'BG'); s.p(6, 6, 'GRN')
        for i in (4, 6, 8): s.p(i, 1, 'DIM'); s.p(i, 12, 'DIM'); s.p(1, i, 'DIM'); s.p(12, i, 'DIM')
    elif kind == 'dermal':
        s.poly([(2, 2), (11, 2), (11, 7), (6, 12), (2, 7)], 'VIO'); s.r(3, 3, 10, 3, 'WHITE'); s.r(6, 4, 7, 9, 'WHITE')
    elif kind == 'magnet':
        s.r(2, 2, 4, 10, 'RED'); s.r(9, 2, 11, 10, 'RED'); s.r(2, 9, 11, 11, 'RED'); s.r(2, 2, 4, 3, 'WHITE'); s.r(9, 2, 11, 3, 'WHITE')
    return s.outline()

def ground_tile(size=512, seed=21):
    """하층가 아스팔트 (512x512 이음새 없는 타일): 반복이 덜 보이도록 크게, 하수구 덮개는 불규칙 배치"""
    rnd = random.Random(seed)
    im = Image.new('RGBA', (size, size), C('BG')); d = ImageDraw.Draw(im)
    for gy in range(0, size, 8):
        for gx in range(0, size, 8):
            if rnd.random() < 0.2: d.rectangle([gx, gy, gx + 7, gy + 7], fill=C('UI'))
    for _ in range(900): d.point((rnd.randrange(size), rnd.randrange(size)), fill=C('GRID'))
    for _ in range(16):
        x, y = rnd.randrange(size), rnd.randrange(size); pts = [(x, y)]
        for _ in range(rnd.randint(3, 6)):
            x += rnd.randint(-18, 18); y += rnd.randint(-10, 10); pts.append((x, y))
        _wrapped(size, lambda ox, oy, pts=pts: d.line([(px + ox, py + oy) for px, py in pts], fill=C('VIO')))
    for _ in range(7):
        cx, cy, rx, ry = rnd.randrange(size), rnd.randrange(size), rnd.randint(14, 36), rnd.randint(5, 10)
        def pud(ox, oy, cx=cx, cy=cy, rx=rx, ry=ry):
            d.ellipse([cx - rx + ox, cy - ry + oy, cx + rx + ox, cy + ry + oy], fill=C('VIO'))
            d.line([cx - rx // 2 + ox, cy - 2 + oy, cx + ox, cy - 2 + oy], fill=C('MAG'))
            d.line([cx - 4 + ox, cy + 1 + oy, cx + int(rx * 0.6) + ox, cy + 1 + oy], fill=C('CYAN'))
        _wrapped(size, pud)
    for _ in range(3):
        gx, gy = rnd.randrange(size), rnd.randrange(size)
        def grate(ox, oy, gx=gx, gy=gy):
            d.rectangle([gx + ox, gy + oy, gx + 15 + ox, gy + 9 + oy], fill=C('UI'), outline=C('GRID'))
            for k in range(3, 15, 3): d.line([gx + k + ox, gy + 2 + oy, gx + k + ox, gy + 7 + oy], fill=C('BG'))
        _wrapped(size, grate)
    for _ in range(40):
        x, y = rnd.randrange(size), rnd.randrange(size); d.point((x, y), fill=C(rnd.choice(['RUST', 'DIM', 'MAGD'])))
    return im

def rain_tile(size=128, seed=5):
    rnd = random.Random(seed)
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for _ in range(20):
        x, y = rnd.randrange(size), rnd.randrange(size)
        _wrapped(size, lambda ox, oy, x=x, y=y: d.line([x + ox, y + oy, x - 2 + ox, y + 6 + oy], fill=C('CYAND', 150)))
    return im

# ───────────────────────── M3: 구역 2·3, 의뢰인, 자폭 드론, 새 보스 ─────────────────────────
def ground_industrial(size=512, seed=31):
    """인더스트리얼 구역 바닥: 리벳 박힌 철판 + 녹 + 노란 경고선 (이음새 없는 타일)"""
    rnd = random.Random(seed)
    im = Image.new('RGBA', (size, size), C('UI')); d = ImageDraw.Draw(im)
    for g in range(0, size, 32):
        d.line([g, 0, g, size], fill=C('BG')); d.line([0, g, size, g], fill=C('BG'))
    for gx in range(0, size, 32):
        for gy in range(0, size, 32):
            for ox, oy in ((3, 3), (28, 3), (3, 28), (28, 28)): d.point((gx + ox, gy + oy), fill=C('DIM'))
            if rnd.random() < 0.12: d.rectangle([gx + 1, gy + 1, gx + 31, gy + 31], fill=C('#22142e'))
    for _ in range(60):
        x, y = rnd.randrange(size), rnd.randrange(size)
        def rust(ox, oy, x=x, y=y, r=rnd.randint(2, 6)): d.ellipse([x + ox - r, y + oy - r // 2, x + ox + r, y + oy + r // 2], fill=C('RUST', 110))
        _wrapped(size, rust)
    for _ in range(4):
        x, y = rnd.randrange(0, size, 32), rnd.randrange(0, size, 32)
        for k in range(0, 64, 8): d.polygon([(x + k, y + 6), (x + k + 4, y + 6), (x + k + 8, y), (x + k + 4, y)], fill=C('YEL', 150))
    for _ in range(120): d.point((rnd.randrange(size), rnd.randrange(size)), fill=C('GRID'))
    return im

def ground_tower(size=512, seed=41):
    """기업 타워 바닥: 흰 네온 줄눈의 매끈한 타일 + 시안 회로 무늬"""
    rnd = random.Random(seed)
    im = Image.new('RGBA', (size, size), C('#141a2e')); d = ImageDraw.Draw(im)
    for g in range(0, size, 64):
        d.line([g, 0, g, size], fill=C('#2a3a5a')); d.line([0, g, size, g], fill=C('#2a3a5a'))
    for g in range(32, size, 64):
        d.line([g, 0, g, size], fill=C('#1c2440')); d.line([0, g, size, g], fill=C('#1c2440'))
    for _ in range(26):
        x, y = rnd.randrange(0, size, 16), rnd.randrange(0, size, 16)
        pts = [(x, y)]
        for _ in range(4):
            x2, y2 = pts[-1]
            if rnd.random() < 0.5: x2 = (x2 + rnd.choice((-1, 1)) * rnd.randint(1, 4) * 16)
            else: y2 = (y2 + rnd.choice((-1, 1)) * rnd.randint(1, 4) * 16)
            pts.append((x2, y2))
        def circ(ox, oy, pts=pts):
            q = [(a + ox, b + oy) for a, b in pts]
            d.line(q, fill=C('CYAND', 160)); d.rectangle([q[-1][0] - 1, q[-1][1] - 1, q[-1][0] + 1, q[-1][1] + 1], fill=C('CYAN', 200))
        _wrapped(size, circ)
    for gx in range(0, size, 64):
        for gy in range(0, size, 64): d.rectangle([gx - 1, gy - 1, gx + 1, gy + 1], fill=C('WHITE', 140))
    return im

def client():
    """의뢰인 픽서 '진' 초상 (32x32): 은발 단발, 마젠타 선글라스, 금 귀걸이, 하이칼라 코트"""
    s = S(32, 32)
    s.r(6, 24, 25, 31, 'VIO'); s.r(6, 24, 25, 25, 'MAGD'); s.r(13, 24, 18, 31, 'UI'); s.r(14, 26, 17, 26, 'YEL')
    s.r(9, 21, 12, 26, 'GRID'); s.r(19, 21, 22, 26, 'GRID')
    s.r(13, 19, 18, 23, '#d8a080')
    s.r(10, 6, 21, 20, '#e8b090'); s.r(10, 17, 21, 20, '#d8a080')
    s.r(8, 2, 23, 7, 'WHITE'); s.r(8, 6, 10, 18, 'WHITE'); s.r(21, 6, 23, 18, 'WHITE'); s.r(10, 7, 14, 8, 'WHITE'); s.r(8, 2, 23, 2, 'DIM')
    s.r(11, 10, 20, 12, 'MAG'); s.r(15, 10, 16, 11, 'MAGD'); s.p(12, 10, 'WHITE'); s.p(18, 10, 'WHITE')
    s.r(14, 16, 17, 16, '#a05060'); s.p(9, 14, 'YEL'); s.p(9, 15, 'YEL'); s.p(22, 13, 'CYAN')
    return s.outline()

def kamikaze():
    """자폭 드론 (16x16): 주황 몸통에 노란 경고등, 아래 매달린 폭탄"""
    s = S(16, 16)
    s.r(1, 4, 14, 5, 'DIM'); s.r(0, 3, 2, 3, 'CYAND'); s.r(13, 3, 15, 3, 'CYAND')
    s.e(3, 5, 12, 12, 'ORG'); s.e(5, 6, 10, 10, 'RUST'); s.r(7, 7, 8, 8, 'YEL'); s.p(7, 7, 'WHITE')
    s.r(6, 12, 9, 15, 'RED'); s.r(7, 13, 8, 13, 'YEL')
    return s.outline()

def midboss2():
    """리벳 크러셔 (32x32): 유압 집게팔 공장 로봇"""
    s = S(32, 32)
    s.r(8, 8, 23, 25, 'DIM'); s.r(10, 10, 21, 23, 'UI'); s.r(12, 12, 19, 14, 'YEL'); s.r(14, 12, 17, 13, 'WHITE')
    for x in (10, 21): s.r(x, 16, x, 22, 'RUST')
    s.r(9, 26, 13, 30, 'RUST'); s.r(18, 26, 22, 30, 'RUST'); s.r(8, 30, 14, 31, 'BG'); s.r(17, 30, 23, 31, 'BG')
    s.r(1, 10, 7, 16, 'ORG'); s.r(0, 16, 3, 22, 'YEL'); s.r(5, 16, 7, 22, 'YEL')
    s.r(24, 10, 30, 16, 'ORG'); s.r(24, 16, 26, 22, 'YEL'); s.r(28, 16, 31, 22, 'YEL')
    s.r(12, 4, 19, 8, 'UI'); s.r(13, 5, 18, 6, 'RED')
    for x in range(9, 23, 4): s.r(x, 24, x + 1, 25, 'BG')
    return s.outline()

def boss2():
    """헥사워드 (44x40): 육각 장갑 기업 전투 메크, 어깨 미사일 포드"""
    s = S(44, 40)
    s.r(12, 28, 17, 37, 'DIM'); s.r(26, 28, 31, 37, 'DIM'); s.r(10, 37, 18, 39, 'BG'); s.r(25, 37, 33, 39, 'BG')
    s.poly([(22, 6), (34, 12), (34, 26), (22, 32), (10, 26), (10, 12)], 'WHITE')
    s.poly([(22, 9), (31, 14), (31, 24), (22, 29), (13, 24), (13, 14)], 'DIM')
    s.poly([(22, 13), (27, 16), (27, 22), (22, 25), (17, 22), (17, 16)], 'CYAND'); s.r(20, 17, 23, 21, 'CYAN'); s.r(21, 18, 22, 19, 'WHITE')
    s.r(1, 8, 9, 18, 'UI'); s.r(2, 9, 8, 17, 'DIM')
    for y in (10, 13, 16): s.r(3, y, 7, y, 'RED')
    s.r(35, 8, 43, 18, 'UI'); s.r(36, 9, 42, 17, 'DIM')
    for y in (10, 13, 16): s.r(37, y, 41, y, 'RED')
    s.r(4, 19, 8, 30, 'GRID'); s.r(35, 19, 39, 30, 'GRID'); s.r(3, 30, 9, 33, 'YEL'); s.r(34, 30, 40, 33, 'YEL')
    s.r(17, 1, 26, 6, 'UI'); s.r(18, 3, 25, 4, 'CYAN'); s.p(22, 0, 'RED')
    return s.outline()

def midboss3():
    """보안 집행관 프리즘 (32x32): 흰 장갑 + 프리즘 방패 드론 2기"""
    s = S(32, 32)
    s.r(11, 22, 14, 29, 'UI'); s.r(17, 22, 20, 29, 'UI'); s.r(10, 30, 15, 31, 'BG'); s.r(16, 30, 21, 31, 'BG')
    s.r(9, 10, 22, 22, 'WHITE'); s.r(11, 12, 20, 20, 'DIM'); s.r(14, 13, 17, 18, 'CYAN'); s.r(15, 14, 16, 16, 'WHITE')
    s.r(11, 2, 20, 9, 'WHITE'); s.r(12, 5, 19, 6, 'CYAN'); s.r(11, 2, 20, 2, 'DIM')
    s.poly([(3, 10), (7, 14), (3, 18), (0, 14)], 'CYAN'); s.poly([(28, 10), (31, 14), (28, 18), (24, 14)], 'CYAN')
    s.p(3, 14, 'WHITE'); s.p(28, 14, 'WHITE'); s.r(7, 12, 8, 20, 'DIM'); s.r(23, 12, 24, 20, 'DIM')
    return s.outline()

def boss3():
    """아르코난 코어 (48x48): 공중에 뜬 AI 핵, 회전하는 링과 붉은 눈"""
    s = S(48, 48)
    s.e(2, 18, 45, 29, 'CYAND'); s.e(5, 20, 42, 27, 'BG')
    s.e(10, 10, 37, 37, 'WHITE'); s.e(13, 13, 34, 34, 'UI'); s.e(16, 16, 31, 31, 'MAGD'); s.e(19, 19, 28, 28, 'RED'); s.e(22, 22, 25, 25, 'WHITE')
    for a in range(0, 360, 45):
        x = 24 + int(round(math.cos(math.radians(a)) * 22)); y = 24 + int(round(math.sin(math.radians(a)) * 22))
        s.r(x - 1, y - 1, x + 1, y + 1, 'CYAN')
    s.e(2, 20, 6, 27, 'CYAN'); s.e(41, 20, 45, 27, 'CYAN'); s.r(23, 2, 24, 9, 'DIM'); s.r(23, 38, 24, 45, 'DIM')
    return s.outline()

# ───────────────────────── M3 3단계: 새 적 5종 ─────────────────────────
def sniper_turret():
    """저격 터렛 (20x20): 삼각대 위 긴 포신, 붉은 렌즈"""
    s = S(20, 20)
    s.l(4, 19, 9, 12, 'DIM'); s.l(15, 19, 10, 12, 'DIM'); s.r(9, 13, 10, 19, 'DIM')
    s.r(5, 7, 13, 13, 'UI'); s.r(6, 8, 12, 12, 'VIO'); s.r(8, 9, 10, 11, 'RED'); s.p(8, 9, 'WHITE')
    s.r(13, 9, 19, 10, 'DIM'); s.p(19, 9, 'RED'); s.r(7, 5, 9, 6, 'DIM')
    return s.outline()

def corrupt_cop():
    """부패 경찰 (20x20): 남색 제복, 노란 배지, 반사 바이저, 권총"""
    s = S(20, 20)
    s.r(6, 14, 8, 18, 'UI'); s.r(11, 14, 13, 18, 'UI'); s.r(5, 19, 8, 19, 'BG'); s.r(11, 19, 14, 19, 'BG')
    s.r(5, 7, 14, 14, 'CYAND'); s.r(5, 13, 14, 13, 'UI'); s.p(7, 9, 'YEL'); s.p(8, 9, 'YEL')
    s.r(14, 9, 18, 10, 'DIM'); s.p(18, 9, 'WHITE')
    s.r(6, 1, 13, 6, '#d8a080'); s.r(5, 0, 14, 2, 'UI'); s.r(5, 2, 15, 2, 'CYAND'); s.r(7, 3, 13, 4, 'CYAN'); s.p(8, 3, 'WHITE')
    return s.outline()

def sec_bot():
    """보안 로봇 (26x26): 무거운 몸통, 노란 코어, 두꺼운 팔"""
    s = S(26, 26)
    s.r(6, 20, 10, 25, 'DIM'); s.r(15, 20, 19, 25, 'DIM'); s.r(5, 24, 11, 25, 'BG'); s.r(14, 24, 20, 25, 'BG')
    s.r(4, 7, 21, 20, 'DIM'); s.r(6, 9, 19, 18, 'UI'); s.e(10, 10, 15, 15, 'YEL'); s.r(12, 12, 13, 13, 'WHITE')
    s.r(0, 8, 3, 18, 'DIM'); s.r(22, 8, 25, 18, 'DIM'); s.r(0, 18, 3, 20, 'ORG'); s.r(22, 18, 25, 20, 'ORG')
    s.r(8, 1, 17, 6, 'DIM'); s.r(9, 3, 16, 4, 'RED'); s.p(10, 3, 'WHITE')
    return s.outline()

def glitch_ghost():
    """글리치 유령 AI (20x20): 깨진 픽셀 얼굴, 마젠타·시안 노이즈"""
    s = S(20, 20); rnd = random.Random(7)
    s.e(3, 1, 16, 16, 'VIO'); s.poly([(3, 10), (16, 10), (16, 19), (13, 16), (10, 19), (7, 16), (3, 19)], 'VIO')
    s.r(6, 6, 8, 8, 'WHITE'); s.r(11, 6, 13, 8, 'WHITE'); s.p(7, 7, 'MAG'); s.p(12, 7, 'MAG'); s.r(7, 11, 12, 12, 'BG')
    for _ in range(10):
        x, y = rnd.randint(2, 17), rnd.randint(1, 18); s.r(x, y, min(19, x + rnd.randint(1, 3)), y, rnd.choice(['MAG', 'CYAN']))
    return s.outline()

def rat_bot():
    """쥐떼 봇 (12x12): 작은 네 발 로봇, 긴 꼬리 안테나"""
    s = S(12, 12)
    s.e(2, 4, 9, 9, 'DIM'); s.r(8, 5, 10, 7, 'UI'); s.p(10, 6, 'RED'); s.r(3, 10, 3, 11, 'UI'); s.r(7, 10, 7, 11, 'UI')
    s.l(2, 6, 0, 2, 'GRN'); s.p(0, 1, 'GRN'); s.r(4, 5, 6, 5, 'WHITE')
    return s.outline()

# ───────────────────────── 카운터 몬스터 6종 (22x22) ─────────────────────────
def _counter_body(s, core):
    s.r(7, 16, 9, 21, 'UI'); s.r(12, 16, 14, 21, 'UI'); s.r(6, 21, 9, 21, 'BG'); s.r(12, 21, 15, 21, 'BG')
    s.r(5, 8, 16, 16, 'DIM'); s.r(7, 10, 14, 14, 'UI'); s.r(9, 11, 12, 13, core)
    s.r(7, 1, 14, 7, 'DIM'); s.r(8, 3, 13, 4, core); s.p(9, 3, 'WHITE')

def c_mirror():
    """반사 장갑병: 거울 방패"""
    s = S(22, 22); _counter_body(s, 'CYAN')
    s.r(0, 5, 4, 19, 'WHITE'); s.r(1, 6, 3, 18, 'CYAN'); s.l(1, 7, 3, 10, 'WHITE'); s.r(17, 9, 19, 13, 'DIM')
    return s.outline()

def c_insulator():
    """절연 유닛: 고무 절연판 + 접지봉"""
    s = S(22, 22); _counter_body(s, 'YEL')
    s.r(3, 7, 18, 8, 'RUST'); s.r(18, 2, 19, 20, 'DIM'); s.r(17, 20, 20, 21, 'YEL'); s.r(2, 9, 4, 14, 'RUST')
    return s.outline()

def c_dampener():
    """폭압 흡수체: 둥근 완충 장갑"""
    s = S(22, 22)
    s.e(2, 4, 19, 20, 'ORG'); s.e(4, 6, 17, 18, 'RUST'); s.e(8, 9, 13, 14, 'BG'); s.r(10, 11, 11, 12, 'ORG')
    s.r(6, 19, 8, 21, 'UI'); s.r(13, 19, 15, 21, 'UI'); s.r(9, 1, 12, 4, 'DIM'); s.p(10, 2, 'RED')
    return s.outline()

def c_thorn():
    """가시 갑주병: 온몸의 붉은 가시"""
    s = S(22, 22); _counter_body(s, 'RED')
    for x, y in ((4, 8), (17, 8), (4, 13), (17, 13), (6, 0), (15, 0), (10, 0)):
        s.r(x - 1, y, x, y + 1, 'RED'); s.p(x - 2 if x < 11 else x + 1, y, 'RED')
    s.r(2, 10, 4, 11, 'WHITE'); s.r(17, 10, 19, 11, 'WHITE')
    return s.outline()

def c_prism():
    """굴절 프리즘: 떠 있는 결정체"""
    s = S(22, 22)
    s.poly([(11, 0), (20, 9), (11, 21), (2, 9)], 'MAGD'); s.poly([(11, 3), (17, 9), (11, 18), (5, 9)], 'MAG')
    s.poly([(11, 5), (14, 9), (11, 14), (8, 9)], 'WHITE'); s.l(2, 9, 20, 9, 'CYAN')
    return s.outline()

def c_firewall():
    """해킹 방벽 드론: 육각 방벽 + 초록 코드"""
    s = S(22, 22)
    s.poly([(11, 1), (20, 6), (20, 16), (11, 21), (2, 16), (2, 6)], 'GRN'); s.poly([(11, 4), (17, 7), (17, 15), (11, 18), (5, 15), (5, 7)], 'BG')
    for y in (8, 11, 14): s.r(7, y, 15, y, 'GRN')
    s.r(9, 9, 13, 13, 'UI'); s.r(10, 10, 12, 12, 'RED')
    return s.outline()

# ───────────────────────── 보스 6종 (프레임: w1·w2 걷기, aim 돌진 예고, charge 돌진) ─────────────────────────
def _lines(s, x, ys, k='WHITE'):
    for y in ys: s.r(x - 4, y, x, y, k)

def scrap_brute(f):
    """스크랩 브루트 (36x36): 고철판을 용접해 두른 갱단 행동대장. 오른팔은 엔진 블록 망치"""
    s = S(36, 36)
    lean = 2 if f == 'charge' else 0
    # 다리
    a, b = ((0, 2) if f == 'w1' else (2, 0)) if f in ('w1', 'w2') else (1, 1)
    s.r(11, 26 - a, 15, 33 - a, 'UI'); s.r(19, 26 - b, 23, 33 - b, 'UI'); s.r(10, 33 - a, 16, 34 - a, 'BG'); s.r(18, 33 - b, 24, 34 - b, 'BG')
    # 몸통: 고철판
    s.r(8 + lean, 12, 26 + lean, 27, 'RUST'); s.r(10 + lean, 14, 17 + lean, 20, 'DIM'); s.r(18 + lean, 16, 25 + lean, 25, 'ORG')
    for x, y in ((11, 15), (16, 15), (11, 19), (20, 17), (24, 24)): s.p(x + lean, y, 'WHITE')
    s.r(8 + lean, 26, 26 + lean, 27, 'BG')
    # 머리 + 주황 모히칸
    hx = 13 + lean * 2
    s.r(hx, 5, hx + 8, 12, '#c89070'); s.r(hx + 2, 1, hx + 5, 5, 'ORG'); s.r(hx + 3, 0, hx + 4, 1, 'YEL')
    eye = 'RED' if f in ('aim', 'charge') else 'BG'
    s.r(hx + 5, 7, hx + 7, 8, eye); s.r(hx + 4, 10, hx + 8, 10, 'BG')
    # 왼팔
    s.r(5 + lean, 14, 8 + lean, 24, '#c89070')
    # 오른팔: 엔진 블록 망치
    if f == 'aim':
        s.r(26, 4, 29, 14, 'DIM'); s.r(23, 0, 34, 6, 'UI'); s.r(24, 1, 33, 5, 'DIM'); s.r(25, 2, 26, 4, 'ORG'); s.r(31, 2, 32, 4, 'ORG')
    elif f == 'charge':
        s.r(28, 16, 31, 19, 'DIM'); s.r(30, 12, 35, 23, 'UI'); s.r(31, 13, 34, 22, 'DIM'); s.r(32, 15, 33, 20, 'ORG')
        _lines(s, 4, (14, 19, 24), 'ORG')
    else:
        s.r(26, 14, 29, 24, 'DIM'); s.r(25, 23, 33, 31, 'UI'); s.r(26, 24, 32, 30, 'DIM'); s.r(28, 26, 30, 28, 'ORG')
    return s.outline()

def redbite(f):
    """레드바이트 (44x44): 갱단 두목. 붉은 롱코트, 금목걸이, 크롬 턱에 붉은 이빨 — 물어뜯듯 돌진"""
    s = S(44, 44)
    lean = 3 if f == 'charge' else 0
    a, b = ((0, 2) if f == 'w1' else (2, 0)) if f in ('w1', 'w2') else (1, 1)
    s.r(15, 32 - a, 19, 41 - a, 'UI'); s.r(24, 32 - b, 28, 41 - b, 'UI'); s.r(14, 41 - a, 20, 42 - a, 'BG'); s.r(23, 41 - b, 29, 42 - b, 'BG')
    # 롱코트 (돌진 때는 뒤로 펄럭)
    tail = -4 if f == 'charge' else 0
    s.poly([(12 + lean, 14), (31 + lean, 14), (33 + lean, 36), (10 + tail, 38)], 'RED'); s.poly([(14 + lean, 16), (20 + lean, 16), (19 + lean, 34), (13 + tail, 35)], '#a01020')
    s.r(20 + lean, 15, 24 + lean, 32, 'BG'); s.r(21 + lean, 17, 23 + lean, 17, 'YEL'); s.r(20 + lean, 20, 24 + lean, 20, 'YEL'); s.r(21 + lean, 23, 23 + lean, 23, 'YEL')
    # 팔: 쌍권총
    gun_y = 18 if f == 'aim' else 24
    s.r(31 + lean, 16, 34 + lean, gun_y + 2, '#a01020'); s.r(33 + lean, gun_y, 39 + lean, gun_y + 2, 'DIM'); s.p(39 + lean, gun_y, 'WHITE')
    s.r(8 + lean, 16, 11 + lean, 26, '#a01020'); s.r(7 + lean, 25, 10 + lean, 27, 'DIM')
    # 머리: 흰 올백 머리, 붉은 사이버 눈, 크롬 턱
    hx = 15 + lean * 2
    s.r(hx, 2, hx + 11, 13, '#d8a080'); s.r(hx - 1, 0, hx + 11, 3, 'WHITE'); s.r(hx - 1, 3, hx, 8, 'WHITE')
    s.r(hx + 7, 5, hx + 9, 6, 'RED'); s.p(hx + 8, 5, 'WHITE'); s.r(hx + 3, 5, hx + 4, 6, 'BG')
    open_ = f in ('aim', 'charge')
    jy = 9
    s.r(hx + 2, jy, hx + 12, jy + (4 if open_ else 3), 'DIM'); s.r(hx + 3, jy + 1, hx + 12, jy + 1, 'WHITE')
    if open_:
        s.r(hx + 4, jy + 2, hx + 12, jy + 3, 'BG')
        for x in range(hx + 4, hx + 13, 2): s.p(x, jy + 2, 'RED'); s.p(x + 1, jy + 3, 'RED')
    else:
        for x in range(hx + 4, hx + 12, 2): s.p(x, jy + 2, 'RED')
    if f == 'charge': _lines(s, 7, (10, 20, 30), 'RED')
    return s.outline()

def rivet_crusher(f):
    """리벳 크러셔 (36x36): 노랑·검정 경고 도색의 공장 경비 로봇. 무한궤도 + 유압 집게, 등 해치에서 자폭 드론 사출"""
    s = S(36, 36)
    lean = 2 if f == 'charge' else 0
    # 무한궤도 (걷기 프레임마다 무늬가 흐름)
    s.r(6, 27, 29, 34, 'UI'); s.r(6, 27, 29, 27, 'DIM')
    off = 0 if f in ('w1', 'aim') else 2
    for x in range(7 + off, 29, 4): s.r(x, 32, x + 1, 33, 'DIM')
    s.e(5, 28, 10, 33, 'DIM'); s.e(25, 28, 30, 33, 'DIM')
    # 몸통: 경고 줄무늬
    s.r(8 + lean, 11, 27 + lean, 26, 'YEL')
    for k in range(-4, 24, 6): s.poly([(8 + lean + k, 26), (11 + lean + k, 26), (19 + lean + k, 11), (16 + lean + k, 11)], 'BG')
    s.r(8 + lean, 11, 27 + lean, 12, 'DIM'); s.r(8 + lean, 25, 27 + lean, 26, 'DIM')
    s.r(13 + lean, 15, 22 + lean, 21, 'UI'); s.r(15 + lean, 17, 20 + lean, 18, 'RED' if f in ('aim', 'charge') else 'ORG')
    # 경광등
    s.r(16 + lean, 6, 19 + lean, 10, 'DIM'); s.r(16 + lean, 6, 19 + lean, 7, 'RED' if f in ('aim', 'charge') else 'ORG')
    # 유압 집게 (aim: 활짝, charge: 앞으로 모음)
    if f == 'aim':
        s.r(27, 12, 31, 14, 'DIM'); s.l(31, 13, 35, 6, 'ORG'); s.l(31, 13, 35, 20, 'ORG'); s.r(34, 4, 35, 7, 'WHITE'); s.r(34, 19, 35, 22, 'WHITE')
        s.r(4, 12, 8, 14, 'DIM'); s.l(4, 13, 0, 6, 'ORG'); s.l(4, 13, 0, 20, 'ORG')
    elif f == 'charge':
        s.r(29, 15, 33, 18, 'DIM'); s.r(33, 13, 35, 20, 'ORG'); s.r(34, 15, 35, 18, 'WHITE')
        s.r(5, 15, 10, 18, 'DIM'); _lines(s, 4, (9, 16, 23), 'YEL')
    else:
        gap = 3 if f == 'w1' else 1
        s.r(27, 14, 31, 16, 'DIM'); s.r(31, 14 - gap, 34, 15 - gap, 'ORG'); s.r(31, 15 + gap, 34, 16 + gap, 'ORG')
        s.r(4, 14, 8, 16, 'DIM'); s.r(1, 14 - gap, 4, 15 - gap, 'ORG'); s.r(1, 15 + gap, 4, 16 + gap, 'ORG')
    return s.outline()

def hexaward(f):
    """헥사워드 (48x44): 기업 전투메크. 육각 장갑, 시안 코어, 어깨 미사일 포드 (예고 때 포드가 열림)"""
    s = S(48, 44)
    lean = 2 if f == 'charge' else 0
    a, b = ((0, 2) if f == 'w1' else (2, 0)) if f in ('w1', 'w2') else (1, 1)
    s.r(14, 30 - a, 19, 40 - a, 'DIM'); s.r(28, 30 - b, 33, 40 - b, 'DIM'); s.r(12, 40 - a, 21, 42 - a, 'BG'); s.r(27, 40 - b, 35, 42 - b, 'BG')
    s.r(15, 33 - a, 18, 34 - a, 'YEL'); s.r(29, 33 - b, 32, 34 - b, 'YEL')
    cx = 24 + lean
    s.poly([(cx, 7), (cx + 12, 13), (cx + 12, 27), (cx, 33), (cx - 12, 27), (cx - 12, 13)], 'WHITE')
    s.poly([(cx, 10), (cx + 9, 15), (cx + 9, 25), (cx, 30), (cx - 9, 25), (cx - 9, 15)], 'DIM')
    core = 'CYAN' if f in ('w1', 'w2') else 'WHITE'
    s.poly([(cx, 14), (cx + 5, 17), (cx + 5, 23), (cx, 26), (cx - 5, 23), (cx - 5, 17)], 'CYAND'); s.r(cx - 2, 18, cx + 1, 22, core)
    opened = f in ('aim', 'charge')
    for px in (1, 38):
        x = px + lean
        s.r(x, 9, x + 8, 19, 'UI'); s.r(x + 1, 10, x + 7, 18, 'DIM')
        for y in (11, 14, 17):
            s.r(x + 2, y, x + 6, y, 'RED' if opened else 'BG')
        if opened: s.r(x, 7, x + 8, 8, 'DIM')
    s.r(5 + lean, 20, 9 + lean, 31, 'GRID'); s.r(38 + lean, 20, 42 + lean, 31, 'GRID'); s.r(4 + lean, 31, 10 + lean, 34, 'YEL'); s.r(37 + lean, 31, 43 + lean, 34, 'YEL')
    s.r(cx - 5, 1, cx + 4, 6, 'UI'); s.r(cx - 4, 3, cx + 3, 4, 'RED' if opened else 'CYAN')
    if f == 'charge':
        s.r(0, 22, 4, 25, 'ORG'); s.r(0, 23, 2, 24, 'YEL')
    return s.outline()

def prism(f):
    """보안 집행관 프리즘 (36x36): 흰 장갑 집행관. 주위를 도는 프리즘 결정 2기로 빛 탄막을 쏨"""
    s = S(36, 36)
    lean = 2 if f == 'charge' else 0
    a, b = ((0, 2) if f == 'w1' else (2, 0)) if f in ('w1', 'w2') else (1, 1)
    s.r(13, 24 - a, 16, 32 - a, 'UI'); s.r(20, 24 - b, 23, 32 - b, 'UI'); s.r(12, 32 - a, 17, 33 - a, 'BG'); s.r(19, 32 - b, 24, 33 - b, 'BG')
    s.r(11 + lean, 11, 25 + lean, 24, 'WHITE'); s.r(13 + lean, 13, 23 + lean, 22, 'DIM'); s.r(16 + lean, 14, 20 + lean, 20, 'CYAN'); s.r(17 + lean, 15, 19 + lean, 17, 'WHITE')
    s.r(13 + lean, 3, 23 + lean, 10, 'WHITE'); s.r(14 + lean, 6, 22 + lean, 7, 'CYAN' if f != 'aim' else 'MAG'); s.r(13 + lean, 3, 23 + lean, 3, 'DIM')
    # 팔: aim이면 머리 위로 들어 빛을 모음
    if f == 'aim':
        s.r(9, 4, 11, 12, 'WHITE'); s.r(25, 4, 27, 12, 'WHITE'); s.e(14, 0, 22, 4, 'MAG')
    else:
        s.r(8 + lean, 12, 10 + lean, 21, 'WHITE'); s.r(26 + lean, 12, 28 + lean, 21, 'WHITE')
    # 프리즘 결정 2기 (프레임마다 위치가 돎)
    pos = {'w1': ((3, 8), (31, 22)), 'w2': ((3, 22), (31, 8)), 'aim': ((3, 4), (31, 4)), 'charge': ((32, 10), (32, 22))}[f]
    for x, y in pos:
        s.poly([(x, y - 4), (x + 3, y), (x, y + 4), (x - 3, y)], 'CYAN' if f != 'aim' else 'MAG'); s.p(x, y, 'WHITE')
    if f == 'charge': _lines(s, 7, (12, 18, 24), 'CYAN')
    return s.outline()

def arconan_core(f):
    """아르코난 코어 (48x48): 공중에 뜬 최종 AI. 회전하는 링과 붉은 홍채 — 예고 때 홍채가 좁아지고 돌진 때 번쩍임"""
    s = S(48, 48)
    rot = {'w1': 0, 'w2': 22.5, 'aim': 11, 'charge': 33}[f]
    tilt = 6 if f == 'charge' else 11
    s.e(2, 24 - tilt // 2 - 3, 45, 24 + tilt // 2 + 3, 'CYAND'); s.e(5, 24 - tilt // 2, 42, 24 + tilt // 2, 'BG')
    s.e(10, 10, 37, 37, 'WHITE'); s.e(13, 13, 34, 34, 'UI')
    iris = {'w1': 8, 'w2': 8, 'aim': 5, 'charge': 10}[f]
    s.e(24 - iris - 3, 24 - iris - 3, 23 + iris + 3, 23 + iris + 3, 'MAGD'); s.e(24 - iris, 24 - iris, 23 + iris, 23 + iris, 'RED')
    s.e(22, 22, 25, 25, 'WHITE' if f != 'aim' else 'YEL')
    for k in range(8):
        ang = math.radians(rot + k * 45)
        x = 24 + int(round(math.cos(ang) * 22)); y = 24 + int(round(math.sin(ang) * 22))
        s.r(x - 1, y - 1, x + 1, y + 1, 'CYAN' if f != 'aim' else 'RED')
    s.e(1, 21, 5, 26, 'CYAN'); s.e(42, 21, 46, 26, 'CYAN')
    if f == 'charge':
        for k in range(4):
            ang = math.radians(45 + k * 90); s.l(24 + int(math.cos(ang) * 14), 24 + int(math.sin(ang) * 14), 24 + int(math.cos(ang) * 20), 24 + int(math.sin(ang) * 20), 'YEL')
    return s.outline()

def save(name, im):
    im.save(os.path.join(OUT, name)); print('wrote', name, im.size)

if __name__ == '__main__':
    # 제로: 사용자 컨셉(보라 트렌치코트) 기반 v2, 서 있기 + 걷기 2프레임
    save('player.png', A.zero_v2('idle').im)
    save('player_w1.png', A.zero_v2('w1').im)
    save('player_w2.png', A.zero_v2('w2').im)
    save('runner_viper.png', A.viper().im)
    save('runner_ghost.png', A.ghost().im)
    save('runner_nova.png', A.nova().im)
    save('hideout.png', A.scene_hideout(with_actors=False))
    save('drone.png', A.drone().im)
    save('thug.png', A.thug().im)
    save('gunner.png', A.gunner().im)
    save('psycho.png', A.psycho().im)
    # 1챕터 바닥: 아스팔트 찻길 + 콘크리트 인도 (ground_v2.py), 화면 위쪽 먼 빌딩층
    save('ground.png', ground_v2.ground_ch1()[0])
    save('skyline_ch1.png', ground_v2.skyline())
    save('trooper_tank.png', trooper().im)
    save('trooper_sniper.png', trooper_sniper().im)
    save('trooper_melee.png', trooper_melee().im)
    save('trooper_hacker.png', trooper_hacker().im)
    save('dropship.png', dropship().im)
    for k in ('smartPistol', 'mantisBlade', 'hackDrone', 'plasmaGrenade', 'monowire', 'empField', 'railgun', 'shotgun', 'turret', 'microMissile', 'arcCoil', 'proxMine', 'muscle', 'neural', 'dermal', 'magnet'):
        save(f'icon_{k}.png', icon(k).im)
    save('rain.png', rain_tile())
    # 2챕터 바닥: 철판 작업장 + 콘크리트 하역장 + 컨베이어 (ground_ch2.py), 화면 위쪽 먼 공장
    save('ground_industrial.png', ground_ch2.ground_ch2()[0])
    save('skyline_ch2.png', ground_ch2.factory_skyline())
    save('ground_tower.png', ground_tower())
    save('client.png', client().im)
    save('kamikaze.png', kamikaze().im)
    for key, fn in (('midboss', scrap_brute), ('boss', redbite), ('midboss2', rivet_crusher), ('boss2', hexaward), ('midboss3', prism), ('boss3', arconan_core)):
        for f in ('w1', 'w2', 'aim', 'charge'):
            save(f'{key}_{f}.png', fn(f).im)
    save('sniper_turret.png', sniper_turret().im)
    save('corrupt_cop.png', corrupt_cop().im)
    save('sec_bot.png', sec_bot().im)
    save('glitch_ghost.png', glitch_ghost().im)
    save('rat_bot.png', rat_bot().im)
    for k in ('c_mirror', 'c_insulator', 'c_dampener', 'c_thorn', 'c_prism', 'c_firewall'):
        save(f'{k}.png', globals()[k]().im)
