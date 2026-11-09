"""보안 드론 도트: 생성 원본(sources/drone_v2.png, 메탈 회색 쿼드콥터 + 붉은 렌즈·조명)을 22px로 변환.
금속 반사가 흰색으로 튀지 않도록 붉은 조명을 뺀 부분만 밝기를 78%로 낮춘 뒤 process_ext.py(39색)로 변환한다.
프레임: drone(기본) / drone_w2(위로 1px 떠오르고 프로펠러 조명 꺼짐 → 깜빡임) / drone_aim(렌즈가 밝아지고 붉은 경고 고리, 28px).
사용: python3 tools/art/drone_sprite.py [출력 폴더=src/assets]"""
import os, subprocess, sys, tempfile
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..', 'src', 'assets')
SRC = os.path.join(HERE, 'sprites2026', 'sources', 'drone_v2.png')
PROC = os.path.join(HERE, 'sprites2026', 'scripts', 'process_ext.py')
S = 22
RED, REDD, PINK, OUTL = (0xFF, 0x2A, 0x3A), (0xB8, 0x33, 0x3A), (0xFF, 0x8A, 0x9A), (7, 6, 15)

a = np.asarray(Image.open(SRC).convert('RGB'), np.float32)
red = (a[..., 0] > 120) & (a[..., 0] > a[..., 1] * 1.8)
b = a * 0.78
b[red] = a[red]
tmp = tempfile.mkdtemp()
Image.fromarray(b.clip(0, 255).astype(np.uint8)).save(f'{tmp}/src.png')
subprocess.run([sys.executable, PROC, f'{tmp}/src.png', f'{tmp}/base.png', str(S), str(S), '', '25'], check=True, capture_output=True)
base = np.asarray(Image.open(f'{tmp}/base.png').convert('RGBA')).copy()
Image.fromarray(base).save(os.path.join(OUT, 'drone.png'))

# 붉은 픽셀: 가운데 렌즈 / 바깥 프로펠러 조명
rgb = base[..., :3].astype(int)
isred = (base[..., 3] > 0) & (rgb[:, :, 0] > 150) & (rgb[:, :, 0] > rgb[:, :, 1] * 1.8)
yy, xx = np.mgrid[0:S, 0:S]
c = (S - 1) / 2
centre = np.hypot(xx - c, yy - c) < 4.5

w2 = base.copy()
w2[isred & ~centre, :3] = REDD                 # 프로펠러 조명 꺼짐
w2 = np.roll(w2, -1, 0)                         # 위로 1px (떠 있는 느낌)
Image.fromarray(w2).save(os.path.join(OUT, 'drone_w2.png'))

aim = np.zeros((28, 28, 4), np.uint8)
o = (28 - S) // 2
aim[o:o + S, o:o + S] = base
lens = np.zeros((28, 28), bool)
lens[o:o + S, o:o + S] = isred & centre
aim[lens, :3] = PINK                            # 렌즈가 하얗게 달아오름
Y, X = np.mgrid[0:28, 0:28]
ring = (np.abs(np.hypot(X - 13.5, Y - 13.5) - 12.8) < 0.6) & (aim[..., 3] == 0) & (((X + Y) % 3) != 0)
aim[ring] = (*RED, 255)
Image.fromarray(aim).save(os.path.join(OUT, 'drone_aim.png'))
print('drone sprites ->', OUT)
