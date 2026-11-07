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
