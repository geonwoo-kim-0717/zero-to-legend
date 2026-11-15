"""블랙 실드 요원 그림의 보라 몸체를 드랍쉽 회청색 금속으로, 주황 바이저를 드랍쉽 붉은 조명으로 바꾼다.
명암(밝기)은 원본을 따라가고 외곽선·빨간 가슴·청록 진압봉은 그대로 둔다.
원본(보라) 그림에 한 번만 쓴다: 이미 바꾼 그림에 다시 쓰면 더 어두워진다.
사용: python3 tools/art/recolor_to_dropship.py src/assets/trooper_melee*.png
"""
import colorsys, sys
from PIL import Image

HUE = 0.635      # 드랍쉽 몸체 색상 (median)
SAT_MUL, SAT_MAX = 0.5, 0.34
VAL_MUL = 0.9    # 사용자 요청: 시안보다 어둡게

def recolor(path: str) -> None:
    im = Image.open(path).convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if 0.62 < h < 0.92 and v > 0.07:
                rr, gg, bb = colorsys.hsv_to_rgb(HUE, min(s * SAT_MUL, SAT_MAX), min(1, v * VAL_MUL))
                px[x, y] = (round(rr * 255), round(gg * 255), round(bb * 255), a)
            elif 0.04 < h < 0.14 and s > 0.5:
                px[x, y] = (235, 40, 40, a) if v > 0.8 else (170, 25, 30, a)
    im.save(path)

for p in sys.argv[1:]:
    recolor(p)
    print('recolored', p)
