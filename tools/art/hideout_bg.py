"""아지트 배경: 도크 9, 버려진 부두 창고를 개조한 은신처 (480x270 픽셀)
- 골함석 벽, 철골 천장, 매달린 작업등과 갈고리 체인
- 오른쪽: 반쯤 열린 셔터 너머 비 오는 밤바다와 먼 도시 네온
- 왼쪽: 쌓인 컨테이너(DOCK 9 스텐실)
- 가운데 뒤: 리퍼닥 시술 구석 (시술 의자, 초록 램프, 모니터, 케이블)
- 바닥: 콘크리트, 기름 얼룩, 네온이 비친 물웅덩이
사용: python3 tools/art/hideout_bg.py → src/assets/hideout.png"""
import os, random, math
from PIL import Image, ImageDraw

W, H = 480, 270
OUT = os.path.join(os.path.dirname(__file__), '../../src/assets/hideout.png')
rnd = random.Random(9)
img = Image.new('RGB', (W, H), (10, 8, 20))
px = img.load()
d = ImageDraw.Draw(img)

def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def glow(cx, cy, r, col, k=0.5):
    for y in range(max(0, cy - r), min(H, cy + r)):
        for x in range(max(0, cx - r), min(W, cx + r)):
            dd = math.hypot(x - cx, (y - cy) * 1.2) / r
            if dd < 1:
                px[x, y] = mix(px[x, y], col, (1 - dd) ** 2 * k)

FLOOR_Y = 190
# ── 벽: 골함석 (세로 골)
for x in range(W):
    ridge = (x // 3) % 2
    for y in range(28, FLOOR_Y):
        base = (34, 34, 52) if ridge else (26, 26, 42)
        n = rnd.randint(-2, 2)
        px[x, y] = (base[0] + n, base[1] + n, base[2] + n)
# 패널 이음매 + 녹물 줄
for x in range(0, W, 48):
    d.line([(x, 28), (x, FLOOR_Y)], fill=(16, 14, 26))
    for y in range(40, FLOOR_Y, 18):
        px[x + 1, y] = (60, 60, 80)
for _ in range(26):
    x = rnd.randrange(W); y0 = rnd.randrange(40, 120); ln = rnd.randrange(20, 70)
    for y in range(y0, min(FLOOR_Y, y0 + ln)):
        if rnd.random() < 0.8:
            px[x, y] = mix(px[x, y], (110, 54, 30), 0.45 * (1 - (y - y0) / ln))
# ── 천장: 철골 보 + 트러스
d.rectangle([0, 0, W, 27], fill=(14, 12, 24))
d.rectangle([0, 22, W, 28], fill=(42, 38, 58))
d.line([(0, 22), (W, 22)], fill=(70, 64, 92))
for x in range(0, W, 40):
    d.line([(x, 22), (x + 20, 4)], fill=(36, 32, 52), width=2)
    d.line([(x + 20, 4), (x + 40, 22)], fill=(36, 32, 52), width=2)
d.rectangle([0, 2, W, 5], fill=(40, 36, 56))
# ── 오른쪽: 반쯤 열린 셔터와 바깥 비 오는 밤
DX0, DX1, DOPEN = 352, 470, 118
d.rectangle([DX0 - 4, 34, DX1 + 4, FLOOR_Y], fill=(20, 18, 30))
# 바깥 하늘·바다
for y in range(DOPEN, FLOOR_Y):
    t = (y - DOPEN) / (FLOOR_Y - DOPEN)
    for x in range(DX0, DX1):
        px[x, y] = mix((18, 14, 40), (8, 20, 36), t)
# 먼 도시 실루엣 + 창문 불빛
x = DX0
while x < DX1:
    bw = rnd.randint(6, 14); bh = rnd.randint(14, 44)
    top = 168 - bh
    d.rectangle([x, top, min(DX1 - 1, x + bw), 168], fill=(16, 12, 30))
    for _ in range(bw * bh // 70):
        wx = rnd.randint(x, min(DX1 - 1, x + bw)); wy = rnd.randint(top + 2, 166)
        px[wx, wy] = rnd.choice([(255, 43, 214), (0, 240, 255), (255, 242, 58), (120, 110, 160)])
    x += bw + rnd.randint(0, 3)
# 바다 + 반사
for y in range(168, FLOOR_Y):
    for x in range(DX0, DX1):
        px[x, y] = (10, 18, 34) if (x + y) % 5 else (24, 40, 70)
glow(410, 150, 40, (255, 43, 214), 0.25)
# 셔터 (위쪽 내려온 부분, 가로 골)
for y in range(34, DOPEN):
    for x in range(DX0, DX1):
        px[x, y] = (48, 50, 66) if (y // 3) % 2 else (36, 38, 54)
d.rectangle([DX0, DOPEN - 4, DX1, DOPEN], fill=(70, 70, 88))
d.rectangle([DX0 + 30, DOPEN - 3, DX0 + 88, DOPEN - 1], fill=(255, 196, 40))  # 손잡이 띠
for x in range(DX0 + 30, DX0 + 88, 6):
    d.line([(x, DOPEN - 3), (x + 3, DOPEN - 1)], fill=(20, 18, 26))
# 비
for _ in range(120):
    x = rnd.randint(DX0, DX1 - 2); y = rnd.randint(DOPEN + 2, FLOOR_Y - 4)
    px[x, y] = (110, 140, 190); px[x + 1, y + 2] = (70, 90, 130)
# 문틀
d.rectangle([DX0 - 4, 34, DX0 - 1, FLOOR_Y], fill=(60, 56, 78))
d.rectangle([DX1 + 1, 34, DX1 + 4, FLOOR_Y], fill=(60, 56, 78))
# ── 왼쪽: 쌓인 컨테이너
def container(x0, y0, w, h, col, label=None):
    d.rectangle([x0, y0, x0 + w, y0 + h], fill=col)
    dark = mix(col, (0, 0, 0), 0.45)
    for x in range(x0 + 3, x0 + w, 5):
        d.line([(x, y0 + 3), (x, y0 + h - 3)], fill=dark)
    d.rectangle([x0, y0, x0 + w, y0 + h], outline=mix(col, (255, 255, 255), 0.18))
    d.rectangle([x0, y0, x0 + 3, y0 + h], fill=dark)
    d.rectangle([x0 + w - 3, y0, x0 + w, y0 + h], fill=dark)
    if label:  # 스텐실 글자 (기본 비트맵 글꼴, 2배)
        from PIL import ImageFont
        tmp = Image.new('1', (60, 12), 0)
        ImageDraw.Draw(tmp).text((0, 0), label, fill=1, font=ImageFont.load_default())
        bb = tmp.getbbox()
        for ty in range(bb[3]):
            for tx in range(bb[2]):
                if tmp.getpixel((tx, ty)):
                    d.rectangle([x0 + 12 + tx * 2, y0 + h // 2 - 8 + ty * 2, x0 + 13 + tx * 2, y0 + h // 2 - 7 + ty * 2], fill=(226, 214, 190))
container(0, 120, 108, 70, (150, 66, 34), 'DOCK 9')
container(8, 62, 96, 58, (28, 96, 104))
container(108, 140, 60, 50, (78, 40, 96))
# ── 천장 작업등 + 갈고리 체인
for lx in (60, 200, 300):
    d.line([(lx, 5), (lx, 30)], fill=(30, 28, 40))
    d.polygon([(lx - 7, 30), (lx + 7, 30), (lx + 4, 25), (lx - 4, 25)], fill=(56, 52, 70))
    d.rectangle([lx - 3, 30, lx + 3, 31], fill=(255, 210, 120))
    for y in range(32, FLOOR_Y):
        hw = int((y - 31) * 0.55)
        for x in range(lx - hw, lx + hw):
            if 0 <= x < W:
                px[x, y] = mix(px[x, y], (255, 190, 110), 0.06 * (1 - (y - 32) / (FLOOR_Y - 32)))
for y in range(5, 96, 3):
    d.rectangle([250, y, 252, y + 2], outline=(80, 78, 96))
d.arc([242, 94, 258, 112], 200, 520, fill=(120, 118, 136), width=2)
# ── 가운데 뒤: 리퍼닥 시술 구석
glow(220, 150, 48, (57, 255, 136), 0.28)
d.rectangle([186, 104, 240, 134], fill=(14, 22, 26), outline=(57, 255, 136))  # 모니터
for i in range(0, 50, 2):
    yy = 120 + int(5 * math.sin(i * 0.5)) if 18 < i < 34 else 120
    px[188 + i, yy] = (57, 255, 136)
d.rectangle([246, 112, 270, 130], fill=(14, 22, 26), outline=(0, 240, 255))
for k in range(4):
    d.line([(249, 116 + k * 4), (249 + rnd.randint(6, 18), 116 + k * 4)], fill=(0, 200, 230))
d.line([(213, 134), (213, 150)], fill=(40, 40, 52), width=2)
# 시술 의자 (옆모습)
d.polygon([(196, 168), (250, 160), (254, 166), (200, 174)], fill=(70, 74, 96))
d.polygon([(196, 168), (186, 140), (192, 138), (202, 168)], fill=(70, 74, 96))
d.rectangle([220, 172, 226, 186], fill=(40, 40, 52))
d.rectangle([210, 186, 236, 189], fill=(40, 40, 52))
# 초록 램프 (팔걸이 달린)
d.line([(262, 186), (262, 140), (238, 128)], fill=(60, 60, 74), width=2)
d.polygon([(230, 126), (246, 126), (242, 132), (234, 132)], fill=(57, 255, 136))
# 케이블
for k in range(5):
    pts = [(186 + k * 6, 134)]
    for s in range(1, 7):
        pts.append((186 + k * 6 + s * 10 + rnd.randint(-3, 3), 134 + s * 9 + rnd.randint(-2, 2)))
    d.line(pts, fill=(22 + k * 6, 20, 30), width=1)
# 작업대 + 의수 부품
d.rectangle([280, 156, 340, 160], fill=(60, 56, 74))
d.rectangle([284, 160, 288, 188], fill=(40, 38, 52)); d.rectangle([332, 160, 336, 188], fill=(40, 38, 52))
d.rectangle([292, 150, 318, 155], fill=(150, 156, 176)); d.rectangle([318, 148, 326, 156], fill=(120, 126, 146))
for k in range(3):
    d.rectangle([296 + k * 7, 146, 300 + k * 7, 150], fill=(180, 186, 206))
glow(310, 150, 12, (255, 43, 214), 0.25)
# 간판: 십자 네온 (리퍼닥)
d.rectangle([150, 50, 186, 74], fill=(18, 10, 28), outline=(255, 43, 214))
d.rectangle([164, 54, 172, 70], fill=(57, 255, 136)); d.rectangle([156, 58, 180, 66], fill=(57, 255, 136))
glow(168, 62, 34, (57, 255, 136), 0.22)
# 고장 난 네온 줄 (위쪽 벽)
for i, col in enumerate([(255, 43, 214), (0, 240, 255), (255, 242, 58)]):
    d.line([(210 + i * 4, 40), (320 - i * 6, 40)], fill=col if i != 1 else mix(col, (0, 0, 0), 0.5))
glow(265, 40, 44, (255, 43, 214), 0.18)
# ── 바닥: 콘크리트
for y in range(FLOOR_Y, H):
    t = (y - FLOOR_Y) / (H - FLOOR_Y)
    for x in range(W):
        base = mix((40, 38, 50), (22, 20, 30), t)
        n = rnd.randint(-3, 3)
        px[x, y] = (base[0] + n, base[1] + n, base[2] + n)
d.line([(0, FLOOR_Y), (W, FLOOR_Y)], fill=(60, 58, 74))
for x in range(0, W, 64):  # 바닥 줄눈 (원근)
    d.line([(x, FLOOR_Y), (x + (x - W / 2) * 0.5, H)], fill=(30, 28, 38))
d.line([(0, 236), (W, 236)], fill=(30, 28, 38))
# 노란 안전선
for x in range(0, W, 14):
    d.polygon([(x, 214), (x + 8, 214), (x + 6, 218), (x - 2, 218)], fill=(170, 140, 30))
# 기름 얼룩 + 웅덩이 (네온 반사)
for _ in range(10):
    cx, cy = rnd.randint(0, W), rnd.randint(FLOOR_Y + 8, H - 4)
    d.ellipse([cx - rnd.randint(8, 20), cy - 3, cx + rnd.randint(8, 20), cy + 3], fill=(16, 14, 22))
for cx, cy, col in [(400, 210, (255, 43, 214)), (220, 248, (57, 255, 136)), (90, 226, (0, 240, 255))]:
    d.ellipse([cx - 34, cy - 6, cx + 34, cy + 6], fill=(14, 16, 30))
    for k in range(6):
        y = cy - 3 + k
        for x in range(cx - 28 + k * 2, cx + 28 - k * 2):
            if rnd.random() < 0.35:
                px[x, y] = mix(px[x, y], col, 0.55)
# 문 앞으로 들이친 빗물 빛
glow(410, 200, 46, (0, 240, 255), 0.16)
# 낡은 소파 (오른쪽 앞)
d.rectangle([120, 196, 176, 214], fill=(70, 30, 50)); d.rectangle([120, 186, 176, 198], fill=(86, 40, 62))
d.rectangle([116, 190, 124, 214], fill=(60, 26, 44)); d.rectangle([172, 190, 180, 214], fill=(60, 26, 44))
# 드럼통
for bx in (330, 342):
    d.rectangle([bx, 176, bx + 10, 190], fill=(40, 70, 90)); d.line([(bx, 181), (bx + 10, 181)], fill=(70, 100, 120))
# 전체 비네트
for y in range(H):
    for x in range(W):
        v = math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2))
        if v > 0.75:
            px[x, y] = mix(px[x, y], (6, 4, 12), min(0.6, (v - 0.75) * 1.4))
img.save(OUT)
print('wrote', os.path.abspath(OUT))
