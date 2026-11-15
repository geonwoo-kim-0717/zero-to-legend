import gameData from '../data/game.json';

/**
 * 블랙 실드 요원 행동 선택 (유틸리티 AI).
 * 행동마다 여러 고려 사항을 0~1 반응곡선으로 만들어 곱하고, 가중치를 곱해 0~1 점수를 낸다.
 * 가장 높은 행동을 고른다. 하던 행동에는 작은 가산점(관성)을 줘서 매 순간 바뀌며 떨리지 않게 한다.
 */

export type Role = 'tank' | 'melee' | 'hacker' | 'sniper';
export type Act = 'approach' | 'keep' | 'retreat' | 'dodge' | 'bash' | 'guard' | 'lunge' | 'swing' | 'hack' | 'cover' | 'shoot';

/** 판단에 쓰는 지금 상황 */
export interface Sense {
  role: Role;
  /** 내 체력 비율 0~1 */
  hp: number;
  /** 플레이어 체력 비율 0~1 */
  playerHp: number;
  /** 플레이어까지 거리 (px) */
  d: number;
  /** 방금 맞은 뒤 지난 시간 (초, 안 맞았으면 큰 값) */
  sinceHit: number;
  /** 회피 대시를 쓸 수 있는지 (최소 간격이 지났는지) */
  dodgeReady: boolean;
  /** 역할 공격을 쓸 수 있는지 (쿨다운이 끝났고 화면 안이며 플레이어를 보고 있음) */
  attackReady: boolean;
  /** 근접 요원 휘두르기를 쓸 수 있는지 (돌진과 쿨다운이 따로) */
  swingReady: boolean;
  /** 살아 있는 탱커가 있는지 (해커의 엄폐용) */
  hasTank: boolean;
  /** 체력이 가장 낮은 다른 요원의 체력 비율 (없으면 1) */
  weakestAlly: number;
  /** 지금 하고 있는 행동 (관성 가산점용) */
  current: Act;
}

const B = gameData.squadBrain;

// ─── 반응곡선 (입력 0~1 → 출력 0~1) ───
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** 지수 곡선: k>1이면 끝으로 갈수록 급해짐, k<1이면 처음에 급함 */
const pow = (x: number, k: number) => clamp01(x) ** k;
/** a에서 0, b에서 1로 오르는 직선 (a>b면 내리는 직선) */
const ramp = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
/** [lo, hi] 안이면 1, 밖으로 soft 만큼 벗어나면서 0으로 */
const band = (x: number, lo: number, hi: number, soft: number) => (x < lo ? ramp(x, lo - soft, lo) : x > hi ? ramp(x, hi + soft, hi) : 1);

/** 역할별 선호 거리 (거리 유지 행동의 기준) */
const PREF: Record<Role, number> = { tank: B.pref.tank, melee: B.pref.melee, hacker: B.pref.hacker, sniper: B.pref.sniper };

/** 역할마다 고를 수 있는 행동 */
const ACTS: Record<Role, Act[]> = {
  tank: ['approach', 'keep', 'retreat', 'bash', 'guard'],
  melee: ['approach', 'keep', 'retreat', 'dodge', 'lunge', 'swing'],
  hacker: ['approach', 'keep', 'retreat', 'dodge', 'hack', 'cover'],
  sniper: ['approach', 'keep', 'retreat', 'dodge', 'shoot'],
};

/** 행동별 점수 (0~1). 관성 가산점은 붙이기 전 값 */
export function scoreActs(s: Sense): Partial<Record<Act, number>> {
  const pref = PREF[s.role];
  // 공통 고려 사항
  const low = pow(1 - s.hp, 2); // 내 체력이 낮을수록 ↑ (곡선: 처음엔 완만, 바닥에서 급함)
  const healthy = pow(s.hp, 0.5); // 내 체력이 높을수록 ↑ (곡선: 조금만 깎여도 덜 줄어듦)
  const finish = pow(1 - s.playerHp, 1.5); // 플레이어 체력이 낮을수록 ↑ (마무리)
  const hit = s.sinceHit < B.hitMemory ? 1 - s.sinceHit / B.hitMemory : 0; // 방금 맞았을수록 ↑
  const tooFar = ramp(s.d, pref, pref * 2.2);
  const tooClose = ramp(s.d, pref, pref * 0.45);
  const atPref = band(s.d, pref * 0.75, pref * 1.25, pref * 0.5);
  const ranged = s.role === 'hacker' || s.role === 'sniper';
  const out: Partial<Record<Act, number>> = {};
  for (const a of ACTS[s.role]) {
    let v = 0;
    switch (a) {
      case 'approach':
        v = tooFar * (0.45 + 0.55 * healthy) * (0.7 + 0.3 * finish) * B.w.approach;
        break;
      case 'keep':
        v = atPref * (0.5 + 0.5 * healthy) * B.w.keep;
        break;
      case 'retreat':
        // 원거리는 가까이 붙으면 물러나고, 모두 체력이 낮으면 물러난다 (플레이어가 빈사면 덜 물러남).
        // 선호 거리 + retreatExtra 밖이면 0: 끝없이 도망쳐 화면 밖으로 사라지지 않게 (부대가 전멸해야 다음 습격)
        v = clamp01((ranged ? tooClose * 0.8 : 0) + low * 0.9) * (1 - 0.5 * finish) * ramp(s.d, pref + B.retreatExtra, pref) * B.w.retreat;
        break;
      case 'dodge':
        // 방금 맞았거나 체력이 낮고 가까울수록. 최소 간격 전이면 0
        v = s.dodgeReady ? clamp01(hit * 0.85 + low * 0.45 * ramp(s.d, pref * 2, pref * 0.5)) * B.w.dodge : 0;
        break;
      case 'bash':
        v = s.attackReady ? band(s.d, 0, B.reach.bash, 10) * (0.75 + 0.25 * finish) * B.w.bash : 0;
        break;
      case 'guard':
        // 다친 아군이 있을수록 그 앞을 막는다 (탱커 자신이 멀쩡할수록)
        v = pow(1 - s.weakestAlly, 1.5) * healthy * B.w.guard;
        break;
      case 'lunge':
        v = s.attackReady ? band(s.d, B.reach.lungeMin, B.reach.lungeMax, 30) * (0.6 + 0.4 * healthy) * (0.8 + 0.2 * finish) * B.w.lunge : 0;
        break;
      case 'swing':
        v = s.swingReady ? band(s.d, 0, B.reach.swing, 8) * (0.8 + 0.2 * finish) * B.w.swing : 0;
        break;
      case 'hack':
        v = s.attackReady ? band(s.d, 0, B.reach.hack, 40) * (0.8 + 0.2 * finish) * B.w.hack : 0;
        break;
      case 'cover':
        // 탱커 뒤로 숨기: 다쳤을수록 더 숨는다
        v = s.hasTank ? (0.4 + 0.6 * low) * B.w.cover : 0;
        break;
      case 'shoot':
        v = s.attackReady ? band(s.d, 0, B.reach.shoot, 60) * (0.8 + 0.2 * finish) * (0.7 + 0.3 * healthy) * B.w.shoot : 0;
        break;
    }
    out[a] = clamp01(v);
  }
  return out;
}

/** 가장 점수가 높은 행동 (하던 행동에는 관성 가산점) */
export function pickAct(s: Sense): { act: Act; scores: Partial<Record<Act, number>> } {
  const scores = scoreActs(s);
  let best: Act = s.current;
  let bestV = -1;
  for (const [a, v] of Object.entries(scores) as [Act, number][]) {
    const w = v + (a === s.current ? B.stick : 0);
    if (w > bestV) {
      bestV = w;
      best = a;
    }
  }
  return { act: best, scores };
}

/** 역할 이름 (요원 id → 역할) */
export function roleOf(id: string): Role | null {
  const r = id.replace('trooper_', '');
  return r === 'tank' || r === 'melee' || r === 'hacker' || r === 'sniper' ? r : null;
}
