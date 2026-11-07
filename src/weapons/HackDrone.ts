import Phaser from 'phaser';
import { WeaponBase } from './WeaponBase';
import { COLORS } from '../config';
import type { Enemy } from '../entities/Enemy';

const BASE_ORBIT = 40;
/** 드론 판정 반경 (그림 8px보다 조금 넉넉하게) */
const HIT_R = 8;

interface Zap {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
}

export class HackDrone extends WeaponBase {
  protected readonly tag = 'electric' as const;
  private angle = 0;
  private sprites: Phaser.GameObjects.Image[] = [];
  /** 적마다 다음에 맞을 수 있는 시각. 드론이 닿는 순간 바로 맞고, 같은 적은 공격 간격마다 한 번 */
  private readonly nextHit = new Map<Enemy, number>();
  private clock = 0;
  private pruneT = 2;
  /** 지난 프레임의 드론 위치 (빠르게 돌 때 사이를 건너뛰지 않도록 이어서 검사) */
  private prev: { x: number; y: number }[] = [];
  private readonly spreadBuf: Enemy[] = [];
  private zaps: Zap[] = [];
  private seekT = 1.5;
  private crashT = 10;

  private get droneCount(): number {
    return this.s.count * (this.has('swarm') ? 2 : 1);
  }

  protected onLevel(): void {
    this.syncSprites();
  }

  private syncSprites(): void {
    while (this.sprites.length < this.droneCount) {
      this.sprites.push(this.ctx.phaser.add.image(0, 0, 'hackdrone').setDepth(18).setBlendMode(Phaser.BlendModes.ADD));
    }
  }

  private poseCd = 0;

  update(dt: number): void {
    if (this.sprites.length < this.droneCount) this.syncSprites();
    const { player: p, fx } = this.ctx;
    this.angle += this.s.speed * (this.ctx.overdrive ? 2 : 1) * dt;
    const orbit = BASE_ORBIT * this.area;
    const n = this.droneCount;
    const dmg = this.damage;
    // 러너 공격 자세: 드론 궤도 안에 적이 있으면 0.9초마다 잠깐 공격 그림
    if ((this.poseCd -= dt) <= 0) {
      const reach = (orbit + 8) ** 2;
      for (const e of this.ctx.enemies) {
        if (e.active && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < reach) {
          p.attackPose(p.x + Math.cos(this.angle) * orbit, 0.2);
          this.poseCd = 0.9;
          break;
        }
      }
    }

    this.clock += dt;
    const gap = this.interval;
    if ((this.pruneT -= dt) <= 0) {
      this.pruneT = 2;
      for (const [e, t] of this.nextHit) if (!e.active || t < this.clock) this.nextHit.delete(e);
    }
    const canHit = (e: Enemy) => {
      if ((this.nextHit.get(e) ?? -1) > this.clock) return false;
      this.nextHit.set(e, this.clock + gap);
      return true;
    };
    // 전설 방어 궤도: 드론 궤도를 따라 방어막을 펼친다 (탄 차단 + 닿은 적 밀어내기)
    if (this.has('defenseOrbit')) {
      const pulse = 0.25 + Math.sin(this.angle * 3) * 0.08;
      this.ctx.fx.fillStyle(COLORS.cyan, 0.06).fillCircle(p.x, p.y, orbit + 6);
      this.ctx.fx.lineStyle(2, COLORS.cyan, pulse).strokeCircle(p.x, p.y, orbit);
      this.ctx.blockEnemyBulletsRing(orbit - 8, orbit + 8);
      for (const e of this.ctx.grid.query(p.x, p.y, orbit + 16, this.spreadBuf)) {
        if (!e.active || e.isBoss) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
        if (d > orbit - 10 && d < orbit + e.radius + 4) {
          e.x += ((e.x - p.x) / d) * 60 * dt;
          e.y += ((e.y - p.y) / d) * 60 * dt;
        }
      }
    }
    if (this.prev.length !== n) this.prev = [];
    for (let i = 0; i < n; i++) {
      const a = this.angle + (i / n) * Math.PI * 2;
      const x = p.x + Math.cos(a) * orbit;
      const y = p.y + Math.sin(a) * orbit;
      this.sprites[i].setPosition(x, y).setRotation(a * 2);
      const pv = this.prev[i] ?? { x, y };
      this.prev[i] = { x, y };
      // 해킹 방벽 드론 근처에서는 드론이 먹통
      const jam = this.ctx.jammed(x, y);
      if (jam) this.sprites[i].setTint(0x39ff88);
      else this.sprites[i].clearTint();
      if (jam) continue;
      // 전설: 방어 궤도 — 드론이 적 탄을 막음
      if (this.has('defenseOrbit')) this.ctx.blockEnemyBullets(x, y, HIT_R + 3);
      // 지난 위치에서 지금 위치까지 몇 군데를 나눠 검사 (빠르게 돌아도 지나친 적을 놓치지 않음)
      const steps = Math.min(4, Math.max(1, Math.ceil(Math.hypot(x - pv.x, y - pv.y) / HIT_R)));
      for (let k = 1; k <= steps; k++) this.hitCircle(
        pv.x + ((x - pv.x) * k) / steps,
        pv.y + ((y - pv.y) * k) / steps,
        HIT_R,
        dmg,
        canHit,
        (e, killed) => {
          this.ctx.playFx('hackDrone_zap', e.x, e.y);
          // 전설: 방어 궤도 — 바깥으로 밀어냄
          if (this.has('defenseOrbit') && !killed && !e.isBoss) {
            const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
            e.x += ((e.x - p.x) / d) * 14;
            e.y += ((e.y - p.y) / d) * 14;
          }
          // 전설: 바이러스 전파
          if (killed && this.has('virusSpread')) this.spread(e.x, e.y, dmg * 2);
        },
      );
    }

    // 신화: 드론 군집 — 주기적으로 먼 적에게 돌격하는 드론 발사
    if (this.has('swarm') && (this.seekT -= dt) <= 0) {
      this.seekT = 1.5;
      const list = this.ctx.enemies;
      for (let t = 0; t < 12 && list.length; t++) {
        const e = list[(Math.random() * list.length) | 0];
        if (e.active && this.ctx.onScreen(e.x, e.y)) {
          this.ctx.fireBullet(p.x, p.y, Math.atan2(e.y - p.y, e.x - p.x), 300, dmg * 3, { target: e, texture: 'hackdrone', pierce: 1, turnRate: 10 });
          break;
        }
      }
    }
    // 신화: 넷 붕괴
    if (this.has('netCrash') && (this.crashT -= dt) <= 0) {
      this.crashT = 10;
      this.ctx.sfx('netcrash');
      this.ctx.screenFlash(0x00f0ff, 0.25, 250);
      for (const e of this.ctx.enemies) {
        if (!e.active || !this.ctx.onScreen(e.x, e.y)) continue;
        this.ctx.stun(e, 2);
        this.ctx.damage(e, dmg * 5, this.tag);
      }
    }

    for (const z of this.zaps) {
      z.life -= dt;
      fx.lineStyle(1.5, COLORS.green, Math.max(0, z.life / 0.2)).lineBetween(z.x1, z.y1, z.x2, z.y2);
    }
    this.zaps = this.zaps.filter((z) => z.life > 0);
  }

  private spread(x: number, y: number, dmg: number): void {
    const near = this.ctx.grid.query(x, y, 60, this.spreadBuf).slice();
    let n = 0;
    for (const o of near) {
      if (!o.active) continue;
      this.zaps.push({ x1: x, y1: y, x2: o.x, y2: o.y, life: 0.2 });
      this.ctx.damage(o, dmg, this.tag);
      if (++n >= 3) break;
    }
  }

  destroy(): void {
    for (const s of this.sprites) s.destroy();
  }
}
