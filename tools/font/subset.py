"""게임에서 쓰는 글자만 남긴 Noto Sans KR 웹폰트를 만든다 (public/fonts/*.woff2).
외부(Google Fonts)에서 글꼴을 받지 않아도 되게 하고, 파일을 작게 유지한다.
화면 문구나 데이터(src/**/*.ts, src/data/*.json, index.html)를 바꾸면 다시 실행할 것.

사용:
  npm pack @expo-google-fonts/noto-sans-kr && tar xzf expo-google-fonts-noto-sans-kr-*.tgz
  pip install fonttools brotli
  python3 tools/font/subset.py package   # 압축을 푼 폴더 (안에 700Bold/NotoSansKR_700Bold.ttf 등)
"""
import glob, os, sys
from fontTools import subset

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
src = sys.argv[1] if len(sys.argv) > 1 else 'package'

chars = set(chr(c) for c in range(0x20, 0x7f))  # 영문·숫자·기호
chars |= set('₵★☆▶◀▲▼→←↑↓·…—–×÷°%‰⛶♪ⅡⅠ“”‘’「」『』')
files = glob.glob(os.path.join(ROOT, 'src', '**', '*.ts'), recursive=True) + glob.glob(os.path.join(ROOT, 'src', 'data', '*.json')) + [os.path.join(ROOT, 'index.html')]
for f in files:
    chars |= set(open(f, encoding='utf-8').read())
chars = {c for c in chars if c.isprintable() and ord(c) >= 0x20}
text = ''.join(sorted(chars))
print(f'{len(chars)} chars')

for weight, name in (('700', '700Bold'), ('900', '900Black')):
    path = os.path.join(src, name, f'NotoSansKR_{name}.ttf')
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    font = subset.load_font(path, opts)
    s = subset.Subsetter(opts)
    s.populate(text=text)
    s.subset(font)
    out = os.path.join(ROOT, 'public', 'fonts', f'NotoSansKR-{weight}.woff2')
    subset.save_font(font, out, opts)
    print(out, os.path.getsize(out) // 1024, 'KB')
