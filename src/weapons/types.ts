import type Phaser from 'phaser';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import type { BulletOpts } from '../entities/Projectile';
import type { SpatialGrid } from '../systems/SpatialGrid';
import type { SfxKey } from '../systems/Sound';

export interface Stats {
  damageMul: number;
  cooldownMul: number;
  areaMul: number;
  pickupMul: number;
  maxHpBonus: number;
  moveMul: number;
  /** 근접 무기(맨티스 블레이드) 피해 배율: 바이퍼 특성·광전사 모드 */
  meleeMul: number;
  /** 폭발물(플라즈마 유탄·궤도 폭격) 피해 배율: 노바 특성 */
  explosiveMul: number;
}

/** 피해 종류: 러너 특성 배율과 카운터 몬스터의 저항에 쓰인다 */
export interface FxOpts {
  angle?: number;
  scale?: number;
  /** 프레임 한 장 시간 (초) */
  frameTime?: number;
  originX?: number;
  originY?: number;
  alpha?: number;
  depth?: number;
}

export type DamageTag = 'melee' | 'explosive' | 'electric' | 'beam' | 'bullet';

/** 무기가 게임 세계와 상호작용할 때 쓰는 창구 (GameScene이 구현) */
export interface GameContext {
  phaser: Phaser.Scene;
  player: Player;
  enemies: readonly Enemy[];
  grid: SpatialGrid<Enemy>;
  stats: Stats;
  overdrive: boolean;
  fx: Phaser.GameObjects.Graphics;
  /** 피해를 주고, 그 공격으로 죽었으면 true */
  damage(e: Enemy, amount: number, tag?: DamageTag): boolean;
  fireBullet(x: number, y: number, angle: number, speed: number, damage: number, opts?: BulletOpts): void;
  burst(x: number, y: number, color: number, count: number): void;
  heal(v: number, silent?: boolean): void;
  stun(e: Enemy, seconds: number): void;
  onScreen(x: number, y: number): boolean;
  sfx(key: SfxKey): void;
  /** 화면 전체에 옅은 색을 잠깐 덮는다 (화면 효과 줄이기면 생략) */
  screenFlash(color: number, alpha: number, ms: number): void;
  /** (x,y) 반경 r 안의 적 탄을 지운다. 지운 수 반환 */
  blockEnemyBullets(x: number, y: number, r: number): number;
  /** 플레이어 중심 고리(안쪽 반지름~바깥 반지름)에 걸친 적 탄을 지운다 */
  blockEnemyBulletsRing(rIn: number, rOut: number): number;
  /** 적을 잠깐 느리게 (둔화 면역 카운터는 무시) */
  slow(e: Enemy, seconds: number): void;
  /** (x,y)가 해킹 방벽 드론의 방해 범위 안인지 (포탑·해킹 드론이 먹통) */
  jammed(x: number, y: number): boolean;
  /** 끌어당김·넉백 배율 (해커가 살아 있는 블랙 실드는 0.25) */
  ccMul(e: Enemy): number;
  /** 적을 잠깐 조종해 다른 적과 싸우게 (보스 제외) */
  charm(e: Enemy, seconds: number): void;
  /** 이번 프레임에 끝난 대시 경로 (없으면 null) */
  readonly dashPath: { x1: number; y1: number; x2: number; y2: number } | null;
  /** 이펙트 그림(fx_<name>_1..N)을 한 번 재생 */
  playFx(name: string, x: number, y: number, o?: FxOpts): void;
  /** 지금 화면에 보이는 월드 영역 */
  view(): { x: number; y: number; width: number; height: number };
  /** 트윈스틱 조준: 조준점(월드), 주무기 방아쇠(자동: 사거리 안에 적), 보조무기 신호(눌렀음, 아직 안 씀)와 쓸 자리 */
  readonly aim: AimState;
  /** 보조무기 신호를 썼음 (한 번 누르면 한 번만 발사) */
  consumeSecondary(): void;
  /** 개편 2-2: 켜진 효과 값 (사이버웨어·장비 cyber.·gear., 태그 단계 syn., 조합 combo.). 없으면 undefined */
  mod(hook: string): Record<string, number> | undefined;
  /** 개편 2-2: 이 무기의 배율 (dmg 피해, cd 공격 간격, sub 보조무기 재사용 대기, area 범위) */
  weaponMul(id: string): { dmg: number; cd: number; sub: number; area: number };
}

export interface AimState {
  x: number;
  y: number;
  primary: boolean;
  secondary: boolean;
  /** 보조무기를 쓸 자리 (월드) */
  subX: number;
  subY: number;
}
