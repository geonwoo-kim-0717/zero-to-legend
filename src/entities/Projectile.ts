import Phaser from 'phaser';
import type { Enemy } from './Enemy';
import type { DamageTag } from '../weapons/types';

export interface BulletOpts {
  pierce?: number;
  target?: Enemy | null;
  /** 적을 맞힌 뒤 근처 적에게 튕기는 횟수 */
  chain?: number;
  texture?: string;
  life?: number;
  turnRate?: number;
  onKill?: (e: Enemy) => void;
  /** 적을 맞힐 때마다 (죽었는지와 함께) */
  onHit?: (e: Enemy, killed: boolean) => void;
  tag?: DamageTag;
  /** 적을 맞힌 자리에 재생할 이펙트 (fx_<이름>_N) */
  hitFx?: string;
  /** 판정 반지름 (기본 3) */
  radius?: number;
  /** 그림 크기 배율 (기본 1) */
  scale?: number;
}

export class Projectile {
  active = false;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  speed = 0;
  life = 0;
  damage = 0;
  pierce = 0;
  chain = 0;
  radius = 3;
  turnRate = 0;
  target: Enemy | null = null;
  onKill: ((e: Enemy) => void) | null = null;
  tag: DamageTag | undefined = undefined;
  onHit: ((e: Enemy, killed: boolean) => void) | null = null;
  hitFx: string | undefined = undefined;
  readonly hits: Enemy[] = [];
  /** 이 탄을 쏜 무기 id (무기별 DPS 집계용) */
  src: string | null = null;
  readonly sprite: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    this.sprite = scene.add.image(0, 0, 'bullet').setDepth(15).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
  }

  fire(x: number, y: number, angle: number, speed: number, damage: number, o: BulletOpts = {}): void {
    this.active = true;
    this.x = x;
    this.y = y;
    this.speed = speed;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.damage = damage;
    this.pierce = o.pierce ?? 0;
    this.chain = o.chain ?? 0;
    this.life = o.life ?? 1.6;
    this.turnRate = o.turnRate ?? 7;
    this.target = o.target ?? null;
    this.onKill = o.onKill ?? null;
    this.tag = o.tag;
    this.onHit = o.onHit ?? null;
    this.hitFx = o.hitFx;
    const tex = o.texture ?? 'bullet';
    this.radius = o.radius ?? (tex === 'wave' ? 9 : 3);
    this.hits.length = 0;
    this.sprite.setTexture(tex).setPosition(x, y).setVisible(true).setRotation(angle).setScale(o.scale ?? 1);
  }

  update(dt: number): void {
    // 유도탄: 목표가 살아 있고 아직 맞히지 않았으면 목표 방향으로 회전
    if (this.target && this.target.active && !this.hits.includes(this.target) && this.turnRate > 0) {
      const cur = Math.atan2(this.vy, this.vx);
      const want = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      const next = Phaser.Math.Angle.RotateTo(cur, want, this.turnRate * dt);
      this.vx = Math.cos(next) * this.speed;
      this.vy = Math.sin(next) * this.speed;
      this.sprite.setRotation(next);
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    this.sprite.setPosition(this.x, this.y);
    if (this.life <= 0) this.kill();
  }

  kill(): void {
    this.active = false;
    this.target = null;
    this.onKill = null;
    this.onHit = null;
    this.sprite.setVisible(false);
  }
}
