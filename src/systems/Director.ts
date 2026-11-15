import gameData from '../data/game.json';

/**
 * 일반 몬스터 스폰 디렉터 (유틸리티 방식).
 * 웨이브 표(waves.json)의 수·비율을 기준으로 두고, 지금 상황을 0~1 반응곡선으로 만들어 그 위에 곱한다.
 *  - 스폰 수: 플레이어 체력이 낮을수록, 플레이어 주변에 적이 많을수록 줄인다
 *  - 원거리 비율: 근처 원거리가 많을수록 줄이고, 처치 속도가 빠를수록 늘린다
 *  - 포위도: 플레이어 체력이 높을수록 사방에서 둘러싸고, 낮을수록 한 방향 무리로 몰려온다
 */

export interface DirSense {
  /** 플레이어 체력 비율 0~1 */
  playerHp: number;
  /** 플레이어 주변(nearR 안) 적 수 */
  near: number;
  /** 지금 살아 있는 원거리 적 수 */
  ranged: number;
  /** 최근 처치 수 / 최근 스폰 수 (1이면 나오는 만큼 잡는 중) */
  killRatio: number;
}

export interface DirPlan {
  /** 스폰 수 배율 */
  countMul: number;
  /** 원거리 적 뽑기 가중치 배율 */
  rangedMul: number;
  /** 0이면 한 방향 무리, 1이면 사방 포위 */
  surround: number;
  /** 디버그용 점수 */
  score: { hp: number; dense: number; room: number; kill: number };
}

const D = gameData.director;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const pow = (x: number, k: number) => clamp01(x) ** k;
const ramp = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export const RANGED = new Set<string>(D.ranged);

export function plan(s: DirSense): DirPlan {
  // 플레이어 체력 (곡선: 조금 깎여서는 거의 그대로, 바닥에 가까울수록 크게 줄임)
  const hp = pow(s.playerHp, 0.6);
  // 주변 밀도: nearLow까지는 1, nearHigh에서 0
  const dense = 1 - ramp(s.near, D.nearLow, D.nearHigh);
  const countMul = lerp(D.lowHpCount, 1, hp) * lerp(D.denseCount, 1, dense);
  // 원거리 여유: 상한에 가까울수록 급격히 0 (탄막이 화면을 덮지 않게)
  const room = 1 - pow(s.ranged / D.rangedCap, 2);
  // 처치 속도: 나오는 만큼 못 잡으면 0, 넉넉히 잡으면 1
  const kill = ramp(s.killRatio, D.killLow, D.killHigh);
  const rangedMul = lerp(D.rangedMin, D.rangedMax, room * (0.35 + 0.65 * kill));
  // 포위도: 체력이 높을수록 사방에서
  const surround = pow(s.playerHp, 1.5);
  return { countMul, rangedMul, surround, score: { hp, dense, room, kill } };
}
