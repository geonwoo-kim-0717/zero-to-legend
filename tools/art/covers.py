"""CrazyGames 표지 3종: 가로 1920x1080, 세로 800x1200, 정사각 800x800
지금 게임 화면(전투 스크린샷) 위에 제목, 러너 4명, 전설·신화 카드를 올린다.
사용: python3 tools/art/covers.py <NotoSansKR_900Black.ttf> <전투 스크린샷 1920x1080 png>
(스크린샷은 게임을 1920x1080 창에서 HUD를 숨기고 찍은 것)"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
ASSETS = os.path.join(ROOT, 'src', 'assets')
OUT = os.path.join(ROOT, 'release', 'crazygames')
FONT = sys.argv[1]
SHOT = Image.open(sys.argv[2]).convert('RGBA')
os.makedirs(OUT, exist_ok=True)

GOLD = (255, 242, 58)
RED = (255, 42, 58)
MAG = (255, 43, 214)


def sprite(name, scale):
    im = Image.open(os.path.join(ASSETS, name + '.png')).convert('RGBA')
    return im.resize((im.width * scale, im.height * scale), Image.NEAREST)


def glow(img, box_or_mask, color, blur, pos=(0, 0)):
    g = Image.new('RGBA', img.size, (0, 0, 0, 0))
    if isinstance(box_or_mask, Image.Image):
        layer = Image.new('RGBA', box_or_mask.size, color + (255,))
        layer.putalpha(box_or_mask.getchannel('A'))
        g.alpha_composite(layer, pos)
    else:
        ImageDraw.Draw(g).rounded_rectangle(box_or_mask, 18, fill=color + (255,))
    img.alpha_composite(g.filter(ImageFilter.GaussianBlur(blur)))


def shade(img, top=170, bottom=60):
    """위를 어둡게 해서 제목이 잘 보이게, 전체도 살짝 어둡게"""
    w, h = img.size
    g = Image.new('RGBA', (w, h))
    d = ImageDraw.Draw(g)
    for y in range(h):
        t = y / h
        a = int(top * max(0, 1 - t * 2.2) + bottom + 240 * max(0, t - 0.75))
        d.line([(0, y), (w, y)], fill=(7, 6, 15, min(230, a)))
    img.alpha_composite(g)


def title(img, cx, cy, size, text):
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONT, size)
    w = d.textlength(text, font=f)
    g = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(g).text((cx - w / 2, cy), text, font=f, fill=MAG + (255,))
    img.alpha_composite(g.filter(ImageFilter.GaussianBlur(size // 5)))
    d.text((cx - w / 2 + size // 16, cy + size // 16), text, font=f, fill=(7, 6, 15, 255))
    d.text((cx - w / 2, cy), text, font=f, fill=MAG + (255,), stroke_width=max(2, size // 28), stroke_fill=(255, 225, 250, 255))


def card(name, rarity, scale):
    """전설(금)·신화(빨강) 카드 한 장: 어두운 판 + 빛나는 테두리 + 그림 + 등급 글자"""
    color = GOLD if rarity == 'LEGENDARY' else RED
    pic = sprite('card_' + name, scale)
    pad = scale * 6
    w, h = pic.width + pad * 2, pic.height + pad * 2 + scale * 14
    c = Image.new('RGBA', (w + 60, h + 60), (0, 0, 0, 0))
    glow(c, (30, 30, 30 + w, 30 + h), color, 16)
    d = ImageDraw.Draw(c)
    d.rounded_rectangle((30, 30, 30 + w, 30 + h), scale * 2, fill=(18, 10, 36, 255), outline=color + (255,), width=max(3, scale))
    c.alpha_composite(pic, (30 + pad, 30 + pad))
    f = ImageFont.truetype(FONT, scale * 7)
    tw = d.textlength(rarity, font=f)
    d.text((30 + w / 2 - tw / 2, 30 + pad * 1.4 + pic.height), rarity, font=f, fill=color + (255,))
    return c


def place(img, im, cx, cy, angle=0):
    if angle:
        im = im.rotate(angle, resample=Image.BICUBIC, expand=True)
    img.alpha_composite(im, (int(cx - im.width / 2), int(cy - im.height / 2)))


def runners(img, cx, cy, scale, gap):
    names = ['runner_viper', 'player', 'runner_ghost', 'runner_nova']
    xs = [cx - gap * 1.5, cx - gap * 0.5, cx + gap * 0.5, cx + gap * 1.5]
    for n, x in zip(names, xs):
        big = n == 'player'
        s = sprite(n, scale + (scale // 3 if big else 0))
        glow(img, s, (0, 240, 255) if big else MAG, 14, (int(x - s.width / 2), int(cy - s.height / 2)))
        place(img, s, x, cy)


def crop(img, w, h):
    scale = max(w / img.width, h / img.height)
    big = img.resize((int(img.width * scale), int(img.height * scale)), Image.NEAREST)
    x0 = (big.width - w) // 2
    y0 = (big.height - h) // 2
    return big.crop((x0, y0, x0 + w, y0 + h))


# 가로 1920x1080: 전투 화면 + 제목 + 러너 4명 + 양옆 카드
land = SHOT.copy()
shade(land, 190, 70)
title(land, 960, 70, 150, 'ZERO TO LEGEND')
runners(land, 960, 640, 9, 250)
place(land, card('railgun', 'MYTHIC', 7), 255, 640, 8)
place(land, card('microMissile', 'LEGENDARY', 7), 1665, 640, -8)
land.convert('RGB').save(os.path.join(OUT, 'cover-landscape-1920x1080.png'))

# 세로 800x1200: 제목 두 줄 + 제로 크게 + 카드 두 장
port = crop(SHOT, 800, 1200)
shade(port, 200, 80)
title(port, 400, 120, 130, 'ZERO TO')
title(port, 400, 270, 130, 'LEGEND')
z = sprite('player', 14)
glow(port, z, (0, 240, 255), 22, (400 - z.width // 2, 700 - z.height // 2))
place(port, z, 400, 700)
place(port, card('railgun', 'MYTHIC', 5), 185, 1000, 8)
place(port, card('microMissile', 'LEGENDARY', 5), 615, 1000, -8)
port.convert('RGB').save(os.path.join(OUT, 'cover-portrait-800x1200.png'))

# 정사각 800x800: 제목 + 제로 + 카드 두 장
sq = crop(SHOT, 800, 800)
shade(sq, 190, 70)
title(sq, 400, 70, 84, 'ZERO TO LEGEND')
z = sprite('player', 11)
glow(sq, z, (0, 240, 255), 18, (400 - z.width // 2, 470 - z.height // 2))
place(sq, z, 400, 470)
place(sq, card('railgun', 'MYTHIC', 4), 140, 560, 8)
place(sq, card('microMissile', 'LEGENDARY', 4), 660, 560, -8)
sq.convert('RGB').save(os.path.join(OUT, 'cover-square-800x800.png'))
print('ok')
