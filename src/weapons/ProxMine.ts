import type Phaser from 'phaser';
import { WeaponBase } from './WeaponBase';
import { COLORS, MAX_ENEMY_RADIUS } from '../config';
import type { Enemy } from '../entities/Enemy';

const BASE_R = 40;
const ARM = 0.5;
const LIFE = 15;
const MAX = 24;

interface Mine {
  x: number;
  y: number;
  arm: number;
  life: number;
  img: Phaser.GameObjects.Image;
}

/** 근접 지뢰: 지나간 자리에 지뢰, 적이 가까이 오면 폭발 */
export class ProxMine extends WeaponBase {
  protected readonly tag = 'explosive' as const;
  private mines: Mine[] = [];
  private blasts: { x: number; y: number; r: number; life: number }[] = [];
  private clayT = 7;
  private readonly buf: Enemy[] = [];

  update(dt: number): void {
    const { player: p, fx } = this.ctx;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.interval;
      for (let i = 0; i < this.s.count; i++) this.drop(p.x + (Math.random() - 0.5) * 16 * i, p.y + (Math.random() - 0.5) * 16 * i, ARM);
    }
    // 신화: 클레이모어 벽
    if (this.has('claymore') && (this.clayT -= dt) <= 0) {
      this.clayT = 7;
      for (let i = 0; i < 8; i++) this.drop(p.x + Math.cos((i / 8) * Math.PI * 2) * 50, p.y + Math.sin((i / 8) * Math.PI * 2) * 50, 0);
    }
    for (const m of this.mines) {
      m.life -= dt;
      m.arm -= dt;
      if (m.arm <= 0) {
        m.img.setTint(Math.floor(m.life * 3) % 2 ? 0xffffff : 0xff6a6a);
        const near = this.ctx.grid.query(m.x, m.y, 18 + MAX_ENEMY_RADIUS, this.buf);
        if (near.some((e) => e.active && (e.x - m.x) ** 2 + (e.y - m.y) ** 2 < (18 + e.radius) ** 2)) this.explode(m);
      }
    }
    for (const m of this.mines.filter((o) => o.life <= 0)) m.img.destroy();
    this.mines = this.mines.filter((o) => o.life > 0);
    for (const b of this.blasts) {
      b.life -= dt;
      fx.fillStyle(COLORS.orange, (b.life / 0.3) * 0.4).fillCircle(b.x, b.y, b.r);
      fx.lineStyle(2, COLORS.yellow, b.life / 0.3).strokeCircle(b.x, b.y, b.r);
    }
    this.blasts = this.blasts.filter((b) => b.life > 0);
  }

  private drop(x: number, y: number, arm: number): void {
    if (this.mines.length >= MAX) {
      const old = this.mines.shift()!;
      old.img.destroy();
    }
    this.mines.push({ x, y, arm, life: LIFE, img: this.ctx.phaser.add.image(x, y, 'mine').setDepth(8) });
  }

  private explode(m: Mine): void {
    if (m.life <= 0) return;
    m.life = 0;
    const r = BASE_R * this.area;
    this.hitCircle(m.x, m.y, r, this.damage);
    if (this.blasts.length < 30) this.blasts.push({ x: m.x, y: m.y, r, life: 0.3 });
    this.ctx.burst(m.x, m.y, COLORS.orange, 8);
    this.ctx.sfx('explode');
    // 전설: 연쇄 기폭
    if (this.has('chainDet')) for (const o of this.mines) if (o.life > 0 && (o.x - m.x) ** 2 + (o.y - m.y) ** 2 < 80 * 80) this.explode(o);
  }

  destroy(): void {
    for (const m of this.mines) m.img.destroy();
  }
}
