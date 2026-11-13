/**
 * 리더보드. 한 사람당 최고 점수 한 줄.
 * - 서버: Supabase (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 가 있을 때). 표·함수는 tools/leaderboard/supabase.sql
 * - 서버가 없거나 닿지 않으면 이 기기에 저장된 기록만 보여 준다 (게임은 그대로 돌아간다).
 */
import { Save } from './Save';

export interface Entry {
  id: string;
  name: string;
  score: number;
  zone: number;
  time: number;
  kills: number;
  runner: string;
  heat: number;
  cleared: boolean;
  me?: boolean;
}

export interface ScoreInput {
  zone: number; // 도달 챕터 1~3
  zoneTime: number; // 그 챕터에서 버틴 초
  time: number; // 전체 초
  kills: number;
  heat: number;
  cleared: boolean;
}

const env = import.meta.env;
const URL_ = ((env.VITE_SUPABASE_URL as string) || '').replace(/\/$/, '');
const KEY = (env.VITE_SUPABASE_ANON_KEY as string) || '';
export const NAME_MIN = 2;
export const NAME_MAX = 10;

/**
 * 종합 점수: 도달 챕터(10만 점씩) → 그 챕터 생존 시간(초당 100, 최대 6만) → 처치 수(1점씩, 최대 3만).
 * 클리어하면 30만 + 빨리 깰수록 보너스(30분 기준 초당 50). 히트 레벨마다 +10%.
 */
export function calcScore(r: ScoreInput): number {
  const kills = Math.min(30000, Math.max(0, Math.floor(r.kills)));
  const base = r.cleared
    ? 300000 + Math.max(0, 1800 - Math.floor(r.time)) * 50 + kills
    : (Math.min(3, Math.max(1, r.zone)) - 1) * 100000 + Math.min(600, Math.max(0, Math.floor(r.zoneTime))) * 100 + kills;
  return Math.round(base * (1 + 0.1 * Math.max(0, r.heat)));
}

/** 닉네임 다듬기: 앞뒤 공백 제거, 제어 문자·꺾쇠 제거, 길이 제한. 너무 짧으면 빈 문자열 */
export function cleanName(s: string): string {
  const v = [...s.replace(/[\u0000-\u001f<>]/g, '').trim().replace(/\s+/g, ' ')].slice(0, NAME_MAX).join('');
  return [...v].length >= NAME_MIN ? v : '';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function newUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  const b = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** 이 기기의 익명 ID (서버 표의 키, UUID 형식) */
function uid(): string {
  const d = Save.data;
  if (!d.playerId || !UUID.test(d.playerId)) {
    d.playerId = newUuid();
    if (d.best) d.best.id = d.playerId;
    Save.write();
  }
  return d.playerId;
}

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch(`${URL_}/rest/v1/${path}`, {
      ...init,
      signal: ctl.signal,
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`leaderboard ${res.status}`);
    const txt = await res.text();
    return txt ? JSON.parse(txt) : null;
  } finally {
    clearTimeout(timer);
  }
}

type Row = { player_id: string; nickname: string; score: number; zone: number; time_sec: number; kills: number; runner: string; heat: number; cleared: boolean };
const fromRow = (r: Row): Entry => ({ id: r.player_id, name: r.nickname, score: r.score, zone: r.zone, time: r.time_sec, kills: r.kills, runner: r.runner, heat: r.heat, cleared: r.cleared });

export const Leaderboard = {
  /** 서버 연결 정보가 빌드에 들어 있는지 */
  online: !!URL_ && !!KEY,

  get name(): string {
    return Save.data.nickname ?? '';
  },

  setName(s: string): boolean {
    const v = cleanName(s);
    if (!v) return false;
    Save.data.nickname = v;
    const b = Save.data.best;
    if (b) b.name = v;
    Save.write();
    return true;
  },

  /** 이 기기의 최고 기록 */
  get best(): Entry | null {
    return Save.data.best ?? null;
  },

  /** 판이 끝났을 때: 이 기기 최고 기록을 갱신하고, 닉네임이 있으면 서버에도 올린다. 새 최고 기록이면 true */
  record(r: ScoreInput & { runner: string }): { score: number; isBest: boolean } {
    const score = calcScore(r);
    const prev = Save.data.best;
    const isBest = !prev || score > prev.score;
    if (isBest) {
      Save.data.best = { id: uid(), name: this.name, score, zone: r.zone, time: Math.floor(r.time), kills: r.kills, runner: r.runner, heat: r.heat, cleared: r.cleared };
      Save.write();
    }
    if (this.name) void this.push();
    return { score, isBest };
  },

  /** 이 기기 최고 기록을 서버에 올린다 (서버는 더 높을 때만 바꾼다). 닉네임만 바꿨을 때도 부른다 */
  async push(): Promise<boolean> {
    const b = Save.data.best;
    if (!this.online || !b || !this.name) return false;
    try {
      await api('rpc/submit_score', {
        method: 'POST',
        body: JSON.stringify({ p_player_id: uid(), p_nickname: this.name, p_score: b.score, p_zone: b.zone, p_time_sec: b.time, p_kills: b.kills, p_runner: b.runner, p_heat: b.heat, p_cleared: b.cleared }),
      });
      return true;
    } catch {
      return false;
    }
  },

  /** 상위 n명 + 내 순위. 서버가 없거나 실패하면 이 기기 기록만 (offline: true) */
  async top(n = 10): Promise<{ list: Entry[]; myRank: number | null; offline: boolean }> {
    const mine = this.best;
    const local = { list: mine && mine.name ? [{ ...mine, me: true }] : [], myRank: null, offline: true };
    if (!this.online) return local;
    try {
      const rows = (await api(`scores?select=player_id,nickname,score,zone,time_sec,kills,runner,heat,cleared&order=score.desc,updated_at.asc&limit=${n}`)) as Row[];
      const id = uid();
      const list = rows.map(fromRow).map((e) => ({ ...e, me: e.id === id }));
      let myRank: number | null = null;
      const at = list.findIndex((e) => e.me);
      if (at >= 0) myRank = at + 1;
      else if (mine && this.name) {
        const r = (await api('rpc/score_rank', { method: 'POST', body: JSON.stringify({ p_player_id: id }) })) as number | null;
        myRank = typeof r === 'number' && r > 0 ? r : null;
      }
      return { list, myRank, offline: false };
    } catch {
      return local;
    }
  },
};
