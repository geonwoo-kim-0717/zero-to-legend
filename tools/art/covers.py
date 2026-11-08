"""CrazyGames 표지 3종 (제목만, 테두리·로고 없음): 가로 1920x1080, 세로 800x1200, 정사각 800x800
사용: python3 tools/art/covers.py <NotoSansKR_900Black.ttf 경로>"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import pixelart as A

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'release', 'crazygames')
FONT = sys.argv[1]

def scene(zoom):
    return A.scene_slum().resize((A.SW * zoom, A.SH * zoom), Image.NEAREST)

def title(img, cx, cy, size, text='ZERO TO LEGEND'):
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONT, size)
    w = d.textlength(text, font=f)
    glow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(glow).text((cx - w / 2, cy), text, font=f, fill=(255, 43, 214, 255))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(size // 6)))
    d.text((cx - w / 2 + size // 18, cy + size // 18), text, font=f, fill=(7, 6, 15, 255))
    d.text((cx - w / 2, cy), text, font=f, fill=(255, 43, 214, 255), stroke_width=max(2, size // 30), stroke_fill=(255, 220, 250, 255))

def hero(img, cx, cy, scale):
    z = A.zero().im.resize((32 * scale, 32 * scale), Image.NEAREST)
    g = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(g).ellipse([cx - 22 * scale, cy - 22 * scale, cx + 22 * scale, cy + 22 * scale], fill=(0, 240, 255, 90))
    img.alpha_composite(g.filter(ImageFilter.GaussianBlur(10 * scale)))
    img.alpha_composite(z, (cx - 16 * scale, cy - 16 * scale))

def darken(img, a):
    img.alpha_composite(Image.new('RGBA', img.size, (7, 6, 15, a)))

# 가로 1920x1080: 슬럼 장면 4배 + 제목
land = scene(4).convert('RGBA')
darken(land, 90)
title(land, 960, 170, 150)
land.convert('RGB').save(os.path.join(OUT, 'cover-landscape-1920x1080.png'))

# 세로 800x1200: 장면 가운데를 잘라 쓰고 러너를 크게
base = scene(5).convert('RGBA')
x0 = (base.width - 800) // 2
port = base.crop((x0, 0, x0 + 800, 1200)) if base.height >= 1200 else base.crop((x0, 0, x0 + 800, base.height)).resize((800, 1200), Image.NEAREST)
darken(port, 110)
hero(port, 400, 760, 9)
# 세로는 폭이 좁아 두 줄로 (가장자리에 붙지 않게)
title(port, 400, 150, 120, 'ZERO TO')
title(port, 400, 290, 120, 'LEGEND')
port.convert('RGB').save(os.path.join(OUT, 'cover-portrait-800x1200.png'))

# 정사각 800x800
sq = scene(3).convert('RGBA')
x0 = (sq.width - 800) // 2
sq = sq.crop((x0, 0, x0 + 800, 800)) if sq.height >= 800 else sq.crop((x0, 0, x0 + 800, sq.height)).resize((800, 800), Image.NEAREST)
darken(sq, 100)
# 장면 속 작은 러너를 큰 러너가 덮도록 가운데에
hero(sq, 400, 430, 7)
title(sq, 400, 120, 82)
sq.convert('RGB').save(os.path.join(OUT, 'cover-square-800x800.png'))
print('ok')
