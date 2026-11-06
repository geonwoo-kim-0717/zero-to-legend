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
}
