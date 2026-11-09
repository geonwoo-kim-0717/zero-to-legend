"""보안 드론 도트 (위에서 본 쿼드콥터): 흰 몸체 + 붉은 렌즈 + 프로펠러 4개.
어두운 바닥(1챕터) 위에서도 보이도록 밝은 몸체, 1px 윤곽선. 걷기 2프레임은 프로펠러 날개 각도만 바뀐다.
사용: python3 tools/art/drone_sprite.py [출력 폴더=src/assets]"""
import math, os, sys
import numpy as np
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'assets')
H = lambda h: tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
OUTL, WHITE, LIGHT, MID, DARK = H('07060F'), H('E8F7FF'), H('C9C2D9'), H('8A7AA8'), H('3A4058')
RED, REDD, CYAN, CYAND = H('FF2A3A'), H('B8333A'), H('00F0FF'), H('2E9AA8')
SS = 8  # 슈퍼샘플


def draw(size, blade_ang, glow=False):
    n = size * SS
    img = np.zeros((n, n, 4), np.uint8)
    yy, xx = np.mgrid[0:n, 0:n] / SS
    c = size / 2
    def disc(cx, cy, r): return (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r
    def seg(x0, y0, x1, y1, w):
        dx, dy = x1 - x0, y1 - y0
        t = np.clip(((xx - x0) * dx + (yy - y0) * dy) / (dx * dx + dy * dy), 0, 1)
        return (xx - x0 - t * dx) ** 2 + (yy - y0 - t * dy) ** 2 <= (w / 2) ** 2
    def put(mask, col): img[mask] = (*col, 255)
    o = 5.0 * size / 18  # 로터 중심까지 거리
    rr = 3.2 * size / 18  # 로터 반지름
    rot = [(c - o, c - o), (c + o, c - o), (c - o, c + o), (c + o, c + o)]
    # 팔
    for (x, y) in rot:
        put(seg(c, c, x, y, 2.2 * size / 18), MID)
    # 로터: 어두운 원판 + 밝은 테두리 + 날개 두 장
    for i, (x, y) in enumerate(rot):
        put(disc(x, y, rr), DARK)
        put(disc(x, y, rr) & ~disc(x, y, rr - 0.9), CYAND)
        a = blade_ang + i * math.pi / 2
        bx, by = math.cos(a) * (rr - 0.4), math.sin(a) * (rr - 0.4)
        put(seg(x - bx, y - by, x + bx, y + by, 1.1), CYAN)
        put(disc(x, y, 0.8), LIGHT)
    # 몸체: 흰 원 + 아래쪽 그림자 + 붉은 렌즈
    br = 3.4 * size / 18
    put(disc(c, c, br), LIGHT)
    put(disc(c - 0.6, c - 0.6, br - 0.9), WHITE)
    put(disc(c, c + 0.3, 1.7 * size / 18 + (0.5 if glow else 0)), REDD)
    put(disc(c, c + 0.1, 1.0 * size / 18 + (0.5 if glow else 0)), RED)
    # 축소: 칸 안에서 가장 많은 색
    small = np.zeros((size, size, 4), np.uint8)
    for y in range(size):
        for x in range(size):
            blk = img[y * SS:(y + 1) * SS, x * SS:(x + 1) * SS].reshape(-1, 4)
            op = blk[blk[:, 3] > 0]
            if len(op) >= SS * SS * 0.4:
                cols, cnt = np.unique(op, axis=0, return_counts=True)
                small[y, x] = cols[cnt.argmax()]
    # 1px 윤곽선
    a = small[..., 3] > 0
    nb = np.zeros_like(a)
    nb[1:] |= a[:-1]; nb[:-1] |= a[1:]; nb[:, 1:] |= a[:, :-1]; nb[:, :-1] |= a[:, 1:]
    small[nb & ~a] = (*OUTL, 255)
    return small


def pad(im, size):
    out = np.zeros((size, size, 4), np.uint8)
    o = (size - im.shape[0]) // 2
    out[o:o + im.shape[0], o:o + im.shape[1]] = im
    return out


if __name__ == '__main__':
    S = 18
    Image.fromarray(draw(S, math.pi / 4)).save(os.path.join(OUT, 'drone.png'))
    Image.fromarray(draw(S, 0)).save(os.path.join(OUT, 'drone_w2.png'))
    # 공격(돌진) 프레임: 렌즈가 커지고 붉은 경고 고리
    aim = pad(draw(S, math.pi / 8, glow=True), 28)
    yy, xx = np.mgrid[0:28, 0:28]
    ring = (np.abs(np.hypot(xx - 13.5, yy - 13.5) - 12.5) < 0.6) & (aim[..., 3] == 0) & (((xx + yy) % 3) != 0)
    aim[ring] = (*RED, 255)
    Image.fromarray(aim).save(os.path.join(OUT, 'drone_aim.png'))
    print('drone sprites ->', OUT)
