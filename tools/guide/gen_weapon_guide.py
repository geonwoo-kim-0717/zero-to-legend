"""무기 가이드 아티팩트(weapon_guide_tpl.html → 출력 HTML)를 지금 게임 데이터로 다시 만든다.
- 이름·설명·기본 수치·레벨별 수치: src/data/weapons.json (레벨 값은 누적)
- 전설·신화: src/data/abilities.json · 가격: meta.json market · 시작 무기: runners.startWeapon
- 사거리 표: 무기 코드(src/weapons/*.ts)의 상수를 직접 읽는다
- 카드 그림: src/assets/card_<id>.png
사용: python3 tools/guide/gen_weapon_guide.py <출력 html>"""
import base64, json, os, re, sys

R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
J = lambda p: json.load(open(os.path.join(R, p)))
weapons, abil, meta, game = J('src/data/weapons.json'), J('src/data/abilities.json'), J('src/data/meta.json'), J('src/data/game.json')
prices = meta['market']['prices']
starters = {r.get('startWeapon') for r in meta['runners']} | {k for k in weapons if k not in prices}


def const(file, name):
    src = open(os.path.join(R, 'src/weapons', file)).read()
    m = re.search(r'^const %s = ([0-9.]+)' % name, src, re.M)
    v = float(m.group(1))
    return int(v) if v.is_integer() else v


RANGE = {
    'smartPistol': [('조준 거리', const('SmartPistol.ts', 'RANGE'), False, f"가까운 적을 노림 · 한 번에 최대 {const('SmartPistol.ts', 'MAX_SHOTS')}발, 탄이 1발 늘 때마다 한 발 피해 -{int(const('SmartPistol.ts', 'SPLIT_PENALTY') * 100)}%")],
    'mantisBlade': [('베기 반경', const('MantisBlade.ts', 'BASE_R'), True, '바라보는 방향 126° 부채꼴 · 실제 판정은 10% 더 넓음')],
    'hackDrone': [('궤도 반경', const('HackDrone.ts', 'BASE_ORBIT'), True, f"드론이 몸 주위를 돎 (드론 몸 {const('HackDrone.ts', 'HIT_R')})")],
    'plasmaGrenade': [('투척 거리', const('PlasmaGrenade.ts', 'THROW_RANGE'), False, ''), ('폭발 반경', const('PlasmaGrenade.ts', 'BASE_R'), True, '')],
    'monowire': [('채찍 길이', const('Monowire.ts', 'BASE_LEN'), True, '적이 이 안에 있을 때 휘두름 · 실제 판정은 10% 더 넓음'), ('조준 거리', const('Monowire.ts', 'AIM_RANGE'), False, '가장 가까운 적 방향')],
    'empField': [('장판 반경', const('EmpField.ts', 'BASE_R'), True, '몸 주위')],
    'railgun': [('사거리', '화면 전체', False, '화면 안 체력이 가장 높은 적'), ('빔 굵기', const('Railgun.ts', 'BASE_W'), True, '')],
    'shotgun': [('조준 거리', const('Shotgun.ts', 'RANGE'), False, '약 70° 부채꼴로 산탄, 한 번 쏠 때마다 맞은 적을 밀어냄')],
    'turret': [('포탑 사거리', const('Turret.ts', 'RANGE'), True, f"포탑 위치 기준 · 포탑 {const('Turret.ts', 'LIFE')}초 유지")],
    'microMissile': [('사거리', '화면 전체', False, '화면 안 무작위 적'), ('폭발 반경', const('MicroMissile.ts', 'BASE_R'), True, '')],
    'arcCoil': [('첫 대상 거리', const('ArcCoil.ts', 'RANGE'), True, ''), ('연쇄 거리', const('ArcCoil.ts', 'HOP'), True, '번개가 튀는 거리')],
    'proxMine': [('감지 거리', 18, False, '적이 닿으면 폭발'), ('폭발 반경', const('ProxMine.ts', 'BASE_R'), True, f"최대 {const('ProxMine.ts', 'MAX')}개 · {const('ProxMine.ts', 'LIFE')}초 유지")],
}

out = []
order = ['smartPistol', 'mantisBlade', 'hackDrone', 'plasmaGrenade', 'monowire', 'empField', 'railgun', 'shotgun', 'turret', 'microMissile', 'arcCoil', 'proxMine']
for wid in order:
    w = weapons[wid]
    s = dict(w['base'])
    rows = []
    for i, lv in enumerate(w['levels']):
        if i:
            for k, v in lv.items():
                if k != 'desc' and k in s:
                    s[k] = round(s[k] + v, 4)
        rows.append({'lv': i + 1, 'desc': lv['desc'], 's': dict(s)})
    ab = abil['weapons'].get(wid, {})
    img = os.path.join(R, 'src/assets', f'card_{wid}.png')
    out.append({
        'id': wid, 'name': w['name'], 'desc': w['desc'], 'base': w['base'], 'rows': rows,
        'leg': [{'id': a['id'], 'name': a['name'], 'desc': a['desc']} for a in ab.get('legendary', [])],
        'myth': [{'id': a['id'], 'name': a['name'], 'desc': a['desc']} for a in ab.get('mythic', [])],
        'price': prices.get(wid), 'starter': wid in starters,
        'img': base64.b64encode(open(img, 'rb').read()).decode() if os.path.exists(img) else '',
        'range': [{'k': k, 'v': v, 'scale': sc, 'note': n} for k, v, sc, n in RANGE[wid]],
    })
rar = [{'label': r['label'], 'bonus': r.get('weaponBonus', 0), 'color': r['color'], 'weight': r['weight']} for r in game['rarity']]
tpl = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'weapon_guide_tpl.html')).read()
html = tpl.replace('__DATA__', json.dumps({'w': out, 'rar': rar}, ensure_ascii=False))
open(sys.argv[1], 'w').write(html)
print('wrote', sys.argv[1], len(html))
