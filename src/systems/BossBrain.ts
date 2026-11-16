import gameData from '../data/game.json';

/**
 * 보스(코박) 행동 선택 (유틸리티 AI). 블랙 실드 SquadBrain과 같은 방식:
 * 행동마다 상황을 0~1 반응곡선으로 만들어 곱하고 가중치를 곱한 점수 중 가장 높은 행동을 고른다.
 * 걷는 동안 think초마다 다시 판단한다. 공격은 지난 공격 뒤 시간(준비도)이 차야 점수가 오른다.
 */

export type BossAct = 'walk' | 'charge' | 'hook' | 'slam' | 'summon';

export interface BossSense {
  /** 플레이어까지 거리 (px) */
  d: number;
  /** 플레이어 체력 비율 0~1 */
  playerHp: number;
  /** 플레이어 이동 속도 비율 0~1 (최고 이동 속도 대비) */
  moving: number;
  /** 플레이어가 보스에게서 멀어지는 속도 비율 0~1 */
  fleeing: number;
  /** 플레이어 대시가 재사용 대기 중인지 (방금 대시를 써서 피할 수단이 없음) */
  dashSpent: boolean;
  /** 지난 공격 뒤 지난 시간 (초) */
  sinceAttack: number;
  /** 지난 소환 뒤 지난 시간 (초) */
  sinceSummon: number;
  /** 살아 있는 부하 비율 0~1 (목표 수 대비) */
  minions: number;
  /** 분노 배율 (속도·예고용) */
  rage: number;
  /** 분노 중인지 (공격 준비가 maxGap2초에 다 참) */
  p2: boolean;
  /** 지금 하던 행동 (관성 가산점용) */
  current: BossAct;
}

const B = gameData.bossBrain;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ramp = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
const band = (x: number, lo: number, hi: number, soft: number) => (x < lo ? ramp(x, lo - soft, lo) : x > hi ? ramp(x, hi + soft, hi) : 1);

export function scoreBoss(s: BossSense): Record<BossAct, number> {
  // 공격 준비도: 지난 공격이 끝난 뒤 minGap까지 0, maxGap에서 1 (분노면 maxGap2에서 1)
  const ready = ramp(s.sinceAttack, B.minGap, s.p2 ? B.maxGap2 : B.maxGap);
  // 마무리 욕심: 플레이어 체력이 낮을수록
  const finish = clamp01(1 - s.playerHp) ** 1.5;
  // 노리기 좋은 때: 멈춰 있거나 방금 대시를 써서 피할 수단이 없을 때
  const opening = Math.max(1 - s.moving, s.dashSpent ? 1 : 0);
  const R = B.range;
  const charge = band(s.d, 0, R.chargeMax, R.soft) * ready * (1 - 0.6 * s.fleeing) * (0.8 + 0.2 * finish) * B.w.charge;
  // 갈고리: 체력 낮은 플레이어를 끌어와 마무리
  const hook = band(s.d, R.hookMin, R.hookMax, R.soft) * ready * (0.6 + 0.4 * opening) * (0.7 + 0.3 * finish) * B.w.hook;
  // 점프: 멀리 도망가는 플레이어를 따라잡는다
  const slam = ramp(s.d, R.slamMin, R.slamMin + R.soft * 2) * ready * (0.6 + 0.4 * Math.max(opening, s.fleeing)) * (0.8 + 0.2 * finish) * B.w.slam;
  // 소환: 부하가 적을수록, 지난 소환 뒤 시간이 지날수록
  const summon = ramp(s.sinceSummon, B.summonMin, B.summonMax) * (1 - s.minions) ** 1.5 * B.w.summon;
  // 걷기: 기본값 (공격 준비가 덜 됐을수록 높음)
  const walk = (B.walkBase + B.walkIdle * (1 - ready)) * B.w.walk;
  return { walk: clamp01(walk), charge: clamp01(charge), hook: clamp01(hook), slam: clamp01(slam), summon: clamp01(summon) };
}

export function pickBoss(s: BossSense): { act: BossAct; scores: Record<BossAct, number> } {
  const scores = scoreBoss(s);
  let act: BossAct = 'walk';
  let best = -1;
  for (const [a, v] of Object.entries(scores) as [BossAct, number][]) {
    const w = v + (a === s.current ? B.stick : 0);
    if (w > best) {
      best = w;
      act = a;
    }
  }
  return { act, scores };
}

// ─── 바실리(최종 보스) ───
export type BasiliAct = 'walk' | 'gatling' | 'charge' | 'call' | 'stomp';

export interface BasiliSense {
  d: number;
  playerHp: number;
  moving: number;
  fleeing: number;
  dashSpent: boolean;
  sinceAttack: number;
  /** 지난 호출 뒤 지난 시간 (초) */
  sinceCall: number;
  /** 살아 있는 호위 수 */
  guards: number;
  /** 2페이즈인지 (공격 준비가 maxGap2초에 다 참) */
  p2: boolean;
  /** 지난번에 쓴 공격 (같은 공격 연속 억제) */
  last: BasiliAct;
  current: BasiliAct;
}

export function pickBasili(s: BasiliSense): { act: BasiliAct; scores: Record<BasiliAct, number> } {
  const Z = B.basili;
  const ready = ramp(s.sinceAttack, B.minGap, s.p2 ? B.maxGap2 : B.maxGap);
  const finish = clamp01(1 - s.playerHp) ** 1.5;
  const opening = Math.max(1 - s.moving, s.dashSpent ? 1 : 0);
  const R = Z.range;
  // 개틀링: 중간~먼 거리, 멈춰 있거나 대시를 막 썼을 때
  const gatling = band(s.d, R.gatlingMin, R.gatlingMax, R.soft) * ready * (0.6 + 0.4 * opening) * Z.w.gatling;
  // 박치기: 가까울 때, 도망치는 중이면 내려감
  const charge = band(s.d, 0, R.chargeMax, R.soft) * ready * (1 - 0.6 * s.fleeing) * (0.8 + 0.2 * finish) * Z.w.charge;
  // 발구르기: 아주 가까이 붙었을 때 (밀어내기)
  const stomp = band(s.d, 0, R.stompMax, R.soft) * ready * (0.8 + 0.2 * finish) * Z.w.stomp;
  // 호출: 호위가 모두 죽었고 지난 호출 뒤 충분히 지났을 때
  const call = s.guards > 0 ? 0 : ramp(s.sinceCall, Z.callMin, Z.callMax) * Z.w.call;
  const walk = (B.walkBase + B.walkIdle * (1 - ready)) * B.w.walk;
  const scores: Record<BasiliAct, number> = { walk: clamp01(walk), gatling: clamp01(gatling), charge: clamp01(charge), call: clamp01(call), stomp: clamp01(stomp) };
  if (s.last !== 'walk' && s.last !== 'call') scores[s.last] *= Z.repeat;
  let act: BasiliAct = 'walk';
  let best = -1;
  for (const [a, v] of Object.entries(scores) as [BasiliAct, number][]) {
    const w = v + (a === s.current ? B.stick : 0);
    if (w > best) {
      best = w;
      act = a;
    }
  }
  return { act, scores };
}
