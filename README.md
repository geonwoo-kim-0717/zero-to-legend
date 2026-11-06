# Zero to Legend — M2 MVP

이름 없는 용병이 전설을 꿈꾸며 기업 타워 꼭대기까지 올라가는 사이버펑크 자동 전투 로그라이트. Phaser 3 + TypeScript + Vite.

## 실행
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ 에 정적 파일 생성
```

## 조작
- 이동: WASD / 방향키 (모바일: 화면 아무 곳이나 드래그)
- 대시: Space (모바일: 오른쪽 아래 버튼) — 쿨다운 3초, 0.2초 무적
- 일시정지: Esc
- 레벨업: 1·2·3 또는 카드 클릭/탭, R = 리롤 (한 판에 2회)
- 디버그: F1 또는 ` 로 켜기. 켠 상태에서 P 적 +100, T 시간 +60초, L 레벨업, G 무적, O 특수 능력 게이지 채우기

## 구조
- `src/data/*.json` — 무기(레벨별 강화)·사이버웨어·적·웨이브·등급·특수 능력 수치 (코드 수정 없이 밸런스 조정)
- `src/weapons/` — 스마트 피스톨, 맨티스 블레이드, 해킹 드론, 플라즈마 유탄
- `src/ui/` — 레벨업 3택 1 화면
- `src/systems/` — 오브젝트 풀, 공간 분할 격자, 스포너, 입력
- `src/entities/` — 플레이어, 적, 투사체, 경험치 조각
- `src/scenes/` — Boot(플레이스홀더 텍스처 생성), Title, Game, Result

## 한 판의 흐름
타이틀 → 전투(10분 생존, 레벨업마다 3택 1) → 10:00 보스 레드바이트 등장 → 처치 시 CONTRACT COMPLETE / 사망 시 FLATLINED → 결과 화면

## 아트
- 게임에 쓰는 도트: `src/assets/*.png` (러너 제로 32×32, 적 4종, 하층가 바닥 타일, 빗줄기). 빌드 때 JS 안에 포함됩니다.
- 도트를 코드로 다시 만들기: `python3 tools/art/export.py` (Pillow 필요). 디자인은 `tools/art/pixelart.py` 에 있습니다.
- 직접 그린 그림으로 바꾸려면 같은 이름·같은 크기의 PNG를 `src/assets/` 에 덮어쓰면 됩니다.
- 시안 이미지: `art/concepts/` (러너 4, 적 4, 배경 4), 스타일 시트: `art/style-sheet.png`

## 사운드
- 배경음악 5곡(타이틀, 챕터 1·2·3 전투곡, 보스)과 효과음 29종: `public/audio/` (모두 CC0, 출처는 `public/audio/CREDITS.txt`). 챕터 2·3 곡은 첫 로딩을 늘리지 않게 전투가 시작된 뒤 내려받음
- 블랙 실드 사이렌·픽서 문자 알림음 다시 만들기: `python3 tools/audio/synth_alerts.py`
- 볼륨·최소 간격·음높이 흔들림: `src/data/audio.json` 에서 조절
- 원본에서 다시 만들기: `python3 tools/audio/process.py <다운로드 폴더>` (ffmpeg 필요)
- M 키 또는 화면 구석 ♪ 버튼으로 소리 켜기/끄기 (브라우저에 기억됨)

## 전체화면
- PC: 화면 구석 ⛶ 버튼 또는 F 키로 켜고 끔 (Esc로도 나감)
- 모바일: 타이틀에서 탭해서 시작하면 바로 전체화면 + 가로 고정. 세로로 들면 안내가 뜨고 게임이 멈춤
- 터치 기기: 오른쪽 위 Ⅱ 버튼으로 일시정지, 화면을 탭하면 계속
- iPhone: 브라우저가 게임 전체화면을 막으므로 Safari 공유 → 홈 화면에 추가 (manifest.webmanifest, 아이콘은 public/icons)
