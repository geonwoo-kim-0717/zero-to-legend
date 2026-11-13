# 리더보드 서버 켜기 (Supabase, 무료)

1. https://supabase.com 에 가입하고 **New project**를 만든다 (지역: Northeast Asia (Seoul) 추천, DB 비밀번호는 아무거나 저장해 둔다).
2. 왼쪽 **SQL Editor** → **New query**에 `tools/leaderboard/supabase.sql` 내용을 통째로 붙여 넣고 **Run**.
3. **Project Settings → API**에서 두 값을 복사한다.
   - Project URL (예: `https://abcdefgh.supabase.co`)
   - Project API keys의 **anon public** 키 (`eyJ...`로 시작하는 긴 문자열). service_role 키는 절대 쓰지 않는다.
4. 저장소 루트의 `.env`에 넣고 빌드한다.
   ```
   VITE_SUPABASE_URL=https://abcdefgh.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

## 구조
- 표 `scores`: 기기(player_id)마다 최고 기록 한 줄. 누구나 읽기만 가능.
- 함수 `submit_score`: 더 높은 점수일 때만 기록을 바꾸고, 닉네임은 늘 최신으로. 게임 공식으로 나올 수 없는 점수는 거른다.
- 함수 `score_rank`: 내 순위.
- 점수 공식은 `src/systems/Leaderboard.ts`의 `calcScore`.

## 한계
- 기기 단위 기록이라 브라우저 데이터를 지우면 새 사람으로 잡힌다 (닉네임은 같아도 다른 줄).
- 점수는 브라우저가 계산해 보내므로, 마음먹고 조작하면 상한 안의 가짜 점수는 막을 수 없다. 이상한 기록은 Supabase Table Editor에서 지우면 된다.
- claude.ai 아티팩트 판은 외부 서버 접속이 막혀 있어 이 기기 기록만 보인다.
