-- Zero to Legend 리더보드 (Supabase → SQL Editor에 통째로 붙여 넣고 Run)
-- 한 기기(player_id)당 최고 점수 한 줄. 브라우저는 표를 읽기만 하고, 쓰기는 submit_score 함수로만 한다.

create table if not exists public.scores (
  player_id  uuid primary key,
  nickname   text not null check (char_length(nickname) between 2 and 10),
  score      integer not null check (score between 0 and 1000000),
  zone       smallint not null check (zone between 1 and 3),
  time_sec   integer not null check (time_sec between 0 and 7200),
  kills      integer not null check (kills between 0 and 200000),
  runner     text not null default '' check (char_length(runner) <= 20),
  heat       smallint not null default 0 check (heat between 0 and 10),
  cleared    boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists scores_rank_idx on public.scores (score desc, updated_at asc);

alter table public.scores enable row level security;
drop policy if exists "anyone can read scores" on public.scores;
create policy "anyone can read scores" on public.scores for select using (true);
-- insert/update/delete 정책은 만들지 않는다 → 브라우저에서 직접 쓰기 불가

-- 점수 올리기: 같은 기기는 더 높은 점수일 때만 기록을 바꾸고, 닉네임은 늘 최신으로
create or replace function public.submit_score(
  p_player_id uuid, p_nickname text, p_score integer, p_zone integer, p_time_sec integer,
  p_kills integer, p_runner text, p_heat integer, p_cleared boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_nickname, ''), '[[:cntrl:]<>]', '', 'g'));
begin
  if char_length(v_name) < 2 or char_length(v_name) > 10 then raise exception 'bad nickname'; end if;
  -- 게임 점수 공식으로 나올 수 없는 값은 거른다 (최대: 클리어 30만 + 시간 보너스 9만 + 처치 3만 / 미클리어 3챕터 20만 + 6만 + 3만, 히트 1단계당 +10%)
  if p_score < 0 or p_score > round(420000 * (1 + 0.1 * greatest(p_heat, 0))) then raise exception 'bad score'; end if;
  if p_cleared is not true and p_score > round(290000 * (1 + 0.1 * greatest(p_heat, 0))) then raise exception 'bad score'; end if;

  insert into public.scores as s (player_id, nickname, score, zone, time_sec, kills, runner, heat, cleared, updated_at)
  values (p_player_id, v_name, p_score, p_zone, p_time_sec, p_kills, left(coalesce(p_runner, ''), 20), p_heat, p_cleared, now())
  on conflict (player_id) do update set
    nickname   = excluded.nickname,
    score      = case when excluded.score > s.score then excluded.score      else s.score      end,
    zone       = case when excluded.score > s.score then excluded.zone       else s.zone       end,
    time_sec   = case when excluded.score > s.score then excluded.time_sec   else s.time_sec   end,
    kills      = case when excluded.score > s.score then excluded.kills      else s.kills      end,
    runner     = case when excluded.score > s.score then excluded.runner     else s.runner     end,
    heat       = case when excluded.score > s.score then excluded.heat       else s.heat       end,
    cleared    = case when excluded.score > s.score then excluded.cleared    else s.cleared    end,
    updated_at = case when excluded.score > s.score then excluded.updated_at else s.updated_at end;
end $$;

-- 내 순위 (기록이 없으면 null)
create or replace function public.score_rank(p_player_id uuid) returns integer
language plpgsql stable security definer set search_path = public as $$
declare me public.scores;
begin
  select * into me from public.scores where player_id = p_player_id;
  if not found then return null; end if;
  return 1 + (select count(*)::int from public.scores o
              where o.score > me.score or (o.score = me.score and o.updated_at < me.updated_at));
end $$;

revoke all on function public.submit_score(uuid, text, integer, integer, integer, integer, text, integer, boolean) from public;
grant execute on function public.submit_score(uuid, text, integer, integer, integer, integer, text, integer, boolean) to anon, authenticated;
grant execute on function public.score_rank(uuid) to anon, authenticated;
