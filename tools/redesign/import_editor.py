"""OS 설계실(편집 페이지) 저장소에서 내려받은 JSON을 게임 데이터로 옮긴다.
사용: python3 tools/redesign/import_editor.py <내려받은 폴더>
  폴더 구조: items/*.json, weapons/*.json, abilities/*.json, tags/*.json, combos/*.json, chipsets/*.json, os/*.json, config/gacha.json
  (Claude가 ArtifactData list/get의 out_dir로 받음. 파일마다 {"id", "data", "version"} 형태)
출력: src/data/build.json (사이버웨어·장비·무기 태그·능력 추가 태그·태그 단계·조합), src/data/os.json (OS·상자)"""
import json, os, sys, glob

src = sys.argv[1]
root = os.path.join(os.path.dirname(__file__), '../../src/data')


def load(col):
    out = []
    for f in sorted(glob.glob(os.path.join(src, col, '*.json'))):
        d = json.load(open(f, encoding='utf-8'))
        out.append(d.get('data', d))
    return sorted(out, key=lambda x: x.get('order', 99))


items = load('items')
weapons = load('weapons')
abil = load('abilities')
tags = load('tags')
combos = load('combos')
oss = load('os')
chips = load('chipsets')
gacha = json.load(open(os.path.join(src, 'config', 'gacha.json'), encoding='utf-8'))
gacha = gacha.get('data', gacha)

build = {
    'note': 'OS 설계실 편집 페이지에서 옮김 (tools/redesign/import_editor.py). 직접 고치지 말고 편집 페이지에서 고친 뒤 다시 옮길 것',
    'items': {i['id']: {k: i[k] for k in ('kind', 'part', 'name', 'nameEn', 'tags', 'text', 'params', 'rarityKeys', 'maxLevel', 'enabled', 'hook') if k in i} for i in items},
    'weaponTags': {w['id']: w.get('tags', []) for w in weapons},
    'abilityTags': {a['id']: {x['id']: x.get('addTags', []) for t in ('legendary', 'mythic') for x in a.get(t, [])} for a in abil},
    'abilityMemos': {f"{a['id']}.{x['id']}": x['memo'] for a in abil for t in ('legendary', 'mythic') for x in a.get(t, []) if x.get('memo')},
    'tagTiers': {t['tag']: t['tiers'] for t in tags},
    'combos': {c['id']: {k: c[k] for k in ('name', 'needs', 'text', 'params', 'hook', 'enabled') if k in c} for c in combos},
    'chipsets': {c['id']: {k: c[k] for k in ('name', 'nameEn', 'kind', 'text', 'params', 'hook', 'weight', 'price', 'enabled') if k in c} for c in chips},
}
json.dump(build, open(os.path.join(root, 'build.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
osd = {'note': build['note'], 'gacha': {k: v for k, v in gacha.items() if k != 'note'}, 'os': {o['id']: {k: o[k] for k in o if k not in ('order', 'id')} for o in oss}}
json.dump(osd, open(os.path.join(root, 'os.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('chipsets', len(chips), end=' ')
print('items', len(items), 'weapons', len(weapons), 'abilities', len(abil), 'tags', len(tags), 'combos', len(combos), 'os', len(oss))
