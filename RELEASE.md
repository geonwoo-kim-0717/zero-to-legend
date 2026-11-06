# 출시 가이드 (웹 + 안드로이드)

## 준비된 것

- **광고 연결부** `src/systems/Ads.ts`: 빌드 모드로 고른다
  - `npm run build` → 광고 없음 (claude.ai 미리보기)
  - `npm run build:web` → 내 웹사이트 + Google AdSense H5 게임 광고 (`.env.web`)
  - `npm run build:crazygames` → CrazyGames 포털 (`.env.crazygames`)
  - `npm run build:android` → 안드로이드 앱 + AdMob (`.env.android`)
- **광고 위치** 두 곳
  - 판이 끝나고 아지트로 갈 때 전면 광고: 첫 판은 건너뜀, 3분에 최대 1번
  - 결과 화면 "광고 보고 크레딧 2배": 판마다 1번, 누를 때만
  - 광고 중에는 게임 소리를 멈춤
- **개인정보 처리방침** `public/privacy.html` (스토어·광고 심사에 필요). `[연락처 이메일]`을 채워야 함
- **안드로이드 프로젝트** `android/` (Capacitor 7): 가로 고정, 전체화면, 게임 아이콘, AdMob 동의 창(UMP)
- **자동 배포 설정** `.github/workflows/`
  - `pages.yml`: main에 올리면 웹 버전을 GitHub Pages에 배포
  - `android.yml`: 수동 실행하면 서명된 .aab 생성 (Play Console 업로드용)

## 지금 들어 있는 광고 ID

전부 **Google 공식 테스트 ID**라 수익이 나지 않는다. 승인받은 뒤 아래를 바꾼다.

| 위치 | 바꿀 것 |
| --- | --- |
| `android/app/src/main/AndroidManifest.xml` | `APPLICATION_ID` → 내 AdMob 앱 ID (`ca-app-pub-…~…`) |
| GitHub 저장소 Variables | `ADMOB_INTERSTITIAL`, `ADMOB_REWARDED` → 내 광고 단위 ID, `AD_TEST` → `0` |
| GitHub 저장소 Variables | `ADSENSE_CLIENT` → `ca-pub-…`, `AD_TEST` → `0` |

## 단계와 필요한 권한

1. **코드 저장소 (GitHub)**: 빈 저장소를 만들고 이 세션에 연결해 주면 코드를 올리고 Pages를 켠다
2. **웹 공개 + 광고** (둘 중 하나 또는 둘 다)
   - A. 내 사이트 + AdSense: 주소(GitHub Pages 또는 내 도메인) 공개 → AdSense 가입·사이트 심사 → H5 게임 광고 신청 → `ca-pub` ID 받기 → `ads.txt` 게시
   - B. CrazyGames: 개발자 계정 가입 → `npm run build:crazygames` 결과 zip 업로드 → 심사 (광고·수익 배분은 포털이 처리)
3. **안드로이드 앱 (Google Play)**
   - Play Console 개발자 계정 (1회 25달러, 본인 인증)
   - AdMob 가입 → 앱 등록 → 앱 ID와 광고 단위 2개(전면·보상형) 받기
   - 업로드 키 만들기: 키 파일은 본인이 보관 (잃어버리면 Play 지원으로 재설정 필요)
   - 스토어 정보: 설명, 스크린샷, 512px 아이콘, 1024×500 대표 이미지, 개인정보처리방침 주소, 콘텐츠 등급 설문, 광고 포함 여부, 데이터 보안 양식
   - 비공개 테스트: 개인 계정은 출시 전 테스터 12명이 14일 동안 테스트해야 함
4. **iOS (선택)**: Apple 개발자 계정(연 99달러)과 Mac 빌드 환경(또는 macOS CI)이 필요

## 버전 올리기

`android/app/build.gradle`의 `versionCode`(정수, 올릴 때마다 +1)와 `versionName`을 바꾼다.
