# 도트 교체와 모션 (게임 Version 22~28 작업분)

Scenario(FLUX.2 Klein 9b)로 만든 512px 그림을 게임용 도트로 정리하고, 걷기 2프레임 + 공격 1프레임을 만든 작업의 원본과 스크립트입니다. 결과 PNG는 `src/assets/`에 텍스처 키 이름 그대로 들어 있습니다.

- `sources/` — Scenario 생성 원본(512px)
- `gifs/` — 적·보스 20종 모션 미리보기 (PRD "적·보스 스펙" 탭에도 첨부)
- `scripts/`
  - `process.py`, `process_v1.py` — 배경 제거 → 축소 → 16색 팔레트 → 1px 윤곽선 (`process.py 원본 출력 너비 높이 [black] [배경 임계값]`)
  - `rig.py` — 1구역 보스·진압대: 다리를 새로 그린 걷기 2프레임 + 공격 프레임 (공용 함수 포함)
  - `rig2.py` — 2·3구역 보스 4종, `rig3.py` — 제로, `rig4.py` — 바이퍼·고스트·노바, `rig5.py` — 일반 적 10종
  - `patch_game.py` — 빌드된 game.js를 직접 패치하던 스크립트(기록용, 지금은 소스에 반영됨)
  - `preview.py`, `charmap.py`, `frames*.py` — 미리보기·픽셀 확인용

프레임 이름 규칙: 일반 적·진압대 `<id>`(걷기1)·`<id>_w2`·`<id>_aim`(공격), 보스 `<id>_w1/_w2/_aim/_charge`, 러너 `<tex>`(서기)·`<tex>_w1/_w2`·`<tex>_atk`.
스크립트는 작업 세션의 임시 경로를 인자로 받았으므로, 다시 쓸 때는 경로를 바꿔서 실행하세요.

## 무기 공격 이펙트 (`weapon_fx.py`)

`python3 tools/art/sprites2026/scripts/weapon_fx.py src/assets` 로 다시 만들 수 있습니다. 파일명 `fx_<무기>_<이름>_<프레임>.png`, 프레임은 1부터, 투명 배경, 오른쪽(0도) 향함, 윤곽선 없음(빛으로 읽히게). 폭발·스파크는 가운데 기준, 총구 섬광·화염은 왼쪽 끝이 총구.

| 무기 | 이름 | 프레임 | 크기 |
|---|---|---|---|
| smartPistol | tracer | 1 | 8x3 |
| smartPistol | muzzle | 3 | 8x8 |
| smartPistol | hit | 3 | 8x8 |
| mantisBlade | slash | 4 | 48x32 |
| hackDrone | zap | 3 | 12x12 |
| plasmaGrenade | boom | 5 | 64x64 |
| monowire | hit | 3 | 10x10 |
| empField | ring | 2 | 128x128 |
| empField | arc | 3 | 16x16 |
| railgun | beam | 2 | 16x10 |
| railgun | impact | 3 | 32x32 |
| shotgun | pellet | 1 | 4x3 |
| shotgun | blast | 3 | 24x16 |
| turret | muzzle | 2 | 6x6 |
| microMissile | missile | 2 | 10x5 |
| microMissile | boom | 4 | 40x40 |
| arcCoil | hit | 3 | 16x16 |
| proxMine | boom | 4 | 48x48 |

참고: `railgun_beam`은 가로로 이어 붙여 쓰는 조각, `empField_ring`은 가운데가 빈 테두리(두 장 번갈아), `mantisBlade_slash`는 왼쪽(8,16)이 몸 쪽이고 오른쪽으로 열린 부채꼴입니다.
