# 밸런스 테스트 봇

- `bot.cjs`: 한 판을 자동 플레이하며 기록(체력·레벨·빌드 스냅샷·피격 출처·블랙 실드 섬멸 시간)을 JSON으로 남긴다.
  `node tools/balance/bot.cjs <이름> <new|vet> <스크린샷 0/1> [포트] [smart 0/1] [god 0/1] [출력 폴더]`
  - smart=1: 블랙 실드 요원 우선 공격(해커 > 저격 > 근접 > 탱커), 예고선 회피(돌진·저격·터렛·보스 돌진·해킹 빔)
  - god=1: 무적(성장 측정용). 난이도 판단은 god=0으로. 봇은 사람보다 약하니 결과는 상대 비교에만 쓴다.
- `bench.cjs`: bot.cjs가 남긴 30초마다의 빌드로 허수아비 DPS(단일·무리 20마리, 10초) 측정.
  `node tools/balance/bench.cjs <포트> <bot 결과.json> <출력.json> <new|vet>`
- 게임은 `npx vite build --outDir <폴더>` 후 `python3 -m http.server <포트>`로 띄운다(`?debug`로 접속).
