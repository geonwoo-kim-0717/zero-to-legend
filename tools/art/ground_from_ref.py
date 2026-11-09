"""생성 이미지(tools/art/sources/ground*_ref.png)를 게임 바닥 타일로 바꾼다.
- 1챕터: 가장자리 소품 줄을 빼고, 왼쪽-오른쪽 / 위-아래 가장자리가 가장 비슷한 사각형을 골라 잘라 이음새를 줄인 뒤
  이음새 근처만 살짝 섞어 끊김을 없앤다.
- 2챕터: 컨베이어 띠가 게임 판정(game.json zoneRules.conveyor: period마다 band)과 정확히 겹치도록
  원본의 띠 간격(308px)을 period(176)로 맞춰 줄 단위로 다시 쌓는다. 높이 = period x 6.
- BOX 축소 후 캐릭터와 같은 39색 팔레트(palx.PALX)로 칠한다. 아지트 배경도 같은 방식.
사용: python3 tools/art/ground_from_ref.py
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
SRC = os.path.join(ROOT, 'tools', 'art', 'sources')
OUT = os.path.join(ROOT, 'src', 'assets')


def load(name):
    return np.asarray(Image.open(os.path.join(SRC, name)).convert('RGB'), np.float32)


def shrink(a, w, h):
    return np.asarray(Image.fromarray(a.clip(0, 255).astype(np.uint8)).resize((w, h), Image.BOX), np.float32)


sys.path.insert(0, os.path.join(ROOT, 'tools', 'art', 'sprites2026', 'scripts', 'ext'))
from palx import PALX  # 캐릭터·적 스프라이트와 같은 39색 팔레트

PAL = np.array(PALX, np.float32)


def to_lab(x):
    x = np.clip(x, 0, 255) / 255.0
    x = np.where(x > 0.04045, ((x + 0.055) / 1.055) ** 2.4, x / 12.92)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = x @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


PAL_LAB = to_lab(PAL)


def quant(a, path, dim=1.0):
    """캐릭터 팔레트(39색)에서 가장 가까운 색으로 (Lab 거리). 바닥에는 어두운 색만 자연스럽게 골라진다."""
    a = (a * dim).astype(np.float32)
    flat = to_lab(a.reshape(-1, 3))
    idx = np.empty(len(flat), int)
    for i in range(0, len(flat), 65536):
        idx[i:i + 65536] = ((flat[i:i + 65536, None] - PAL_LAB[None]) ** 2).sum(-1).argmin(1)
    im = Image.fromarray(PAL[idx].reshape(a.shape).astype(np.uint8))
    im.save(path)
    print(path, im.size, 'colors', len(np.unique(idx)))


def feather_x(a, n):
    """가로 이음새: 양 끝 n픽셀을 반대편과 섞어 감싸도 이어지게."""
    a = a.copy()
    w = a.shape[1]
    for i in range(n):
        t = 0.5 * (1 - i / n)  # 끝에서 0.5 → 안쪽 0
        l, r = a[:, i].copy(), a[:, w - 1 - i].copy()
        a[:, i] = l * (1 - t) + r * t
        a[:, w - 1 - i] = r * (1 - t) + l * t
    return a


def feather_y(a, n):
    return feather_x(a.transpose(1, 0, 2), n).transpose(1, 0, 2)


def best_cut(a, lo, hi, length, axis):
    """axis 방향으로 [lo, hi] 안에서 길이 length 구간 중 양 끝 줄이 가장 비슷한 시작점."""
    best, arg = 1e9, lo
    for s in range(lo, hi - length + 1):
        e = s + length - 1
        if axis == 1:
            d = np.abs(a[:, s - 1:s + 2].mean(1) - a[:, e - 1:e + 2].mean(1)).mean()
        else:
            d = np.abs(a[s - 1:s + 2].mean(0) - a[e - 1:e + 2].mean(0)).mean()
        if d < best:
            best, arg = d, s
    return arg, best


def slum():
    a = load('ground1_ref.png').copy()
    a[890:960, 890:960] = a[810:880, 890:960]  # 오른쪽 아래 생성기 워터마크(✦)를 옆 무늬로 덮는다
    L = 980
    x0, dx = best_cut(a, 2, 1022, L, 1)
    y0, dy = best_cut(a, 2, 1022, L, 0)
    print('slum cut', x0, y0, round(dx, 1), round(dy, 1))
    c = a[y0:y0 + L, x0:x0 + L]
    T = round(L * 0.56)  # 육각 맨홀 ≈ 36px (캐릭터 24px의 1.5배)
    c = shrink(c, T, T)
    c = feather_y(feather_x(c, 8), 8)
    quant(c, os.path.join(OUT, 'ground.png'))


def industrial():
    conv = json.load(open(os.path.join(ROOT, 'src', 'data', 'game.json')))['zoneRules']['conveyor']
    P, B = conv['period'], conv['band']
    a = load('ground2_ref.png')
    SP = 308.0                       # 원본 띠 간격 (벨트 중심 238, 546, 854)
    s = P / SP
    centers = [238, 546, 854]
    top = [c - (B / 2) / s for c in centers]   # 게임에서 띠는 [k*P, k*P+B) → 띠 중심이 B/2
    rail = a[int(round(top[0] + SP - 28)):int(round(top[0] + SP))]  # 다음 띠 위 레일 부분
    chunks = []
    for i, t0 in enumerate(top):
        t0 = int(round(t0))
        if i < 2:
            ch = a[t0:t0 + int(SP)]
        else:  # 마지막 띠 아래엔 다음 띠가 없으니 레일을 붙여 준다
            ch = np.concatenate([a[t0:t0 + int(SP) - len(rail)], rail], 0)
        chunks.append(ch)
    # 가로 이음새: 줄마다 양 끝이 가장 비슷한 같은 길이 구간
    L = 1180
    W = round(L * s)
    rows = []
    for ch in chunks:
        x0, d = best_cut(ch, 1, 1253, L, 1)
        rows.append(shrink(ch[:, x0:x0 + L], W, P))
        print('row cut', x0, round(d, 1))
    # 6줄: 앞 세 줄 + 반 칸 민 세 줄 (같은 무늬가 바로 위아래로 반복되지 않게)
    rows = [feather_x(r, 6) for r in rows]
    rows = rows + [np.roll(r, W // 2, 1) for r in rows[1:] + rows[:1]]
    t = np.concatenate(rows, 0)
    quant(t, os.path.join(OUT, 'ground_industrial.png'), 0.95)


def hideout():
    """아지트·타이틀 배경 (480x270)."""
    a = load('hideout_ref.png')
    quant(shrink(a, 480, 270), os.path.join(OUT, 'hideout.png'))


if __name__ == '__main__':
    slum()
    industrial()
    hideout()
