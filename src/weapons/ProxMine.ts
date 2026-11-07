import type Phaser from 'phaser';
import { WeaponBase } from './WeaponBase';
import { COLORS, MAX_ENEMY_RADIUS } from '../config';
import type { Enemy } from '../entities/Enemy';

/** 폭발 반경 (블랙마켓 상향: 40 → 46) */
const BASE_R = 46;
const ARM = 0.5;
const LIFE = 15;
const MAX = 24;

interface Mine {
  x: number;
  y: number;
  arm: number;
  life: number;
  /** 블랙홀 지뢰: 끌어당기는 중 남은 시간 (-1이면 아님) */
  pull: number;
  img: Phaser.GameObjects.Image;
}

/** 근접 지뢰: 지나간 자리에 지뢰, 적이 가까이 오면 폭발 */
export class ProxMine extends WeaponBase {
  protected readonly tag = 'explosive' as const;
  private mines: Mine[] = [];
  private blasts: { x: number; y: number; r: number; life: number }[] = [];
  private clayT = 7;
  private rainT = 8;
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
    // 신화: 지뢰 비 (화면 안 무작위 12곳)
    if (this.has('mineRain') && (this.rainT -= dt) <= 0) {
      this.rainT = 8;
      const v = this.ctx.view();
      for (let i = 0; i < 12; i++) this.drop(v.x + 20 + Math.random() * (v.width - 40), v.y + 20 + Math.random() * (v.height - 40), 0.3);
    }
    const sticky = this.has('sticky');
    for (const m of this.mines) {
      m.life -= dt;
      m.arm -= dt;
      if (m.pull >= 0) {
        // 블랙홀: 주변 적을 끌어모은 뒤 대폭발
        m.pull -= dt;
        fx.lineStyle(2, COLORS.magenta, 0.7).strokeCircle(m.x, m.y, 10 + m.pull * 160);
        for (const e of this.ctx.grid.query(m.x, m.y, 110, this.buf)) {
          if (!e.active || e.isBoss) continue;
          const d = Math.hypot(m.x - e.x, m.y - e.y) || 1;
          const v = Math.min(d, 320 * dt);
          e.x += ((m.x - e.x) / d) * v;
          e.y += ((m.y - e.y) / d) * v;
        }
        if (m.pull < 0) this.explode(m, 1.5);
        continue;
      }
      if (m.arm <= 0 && sticky) {
        // 전설: 점착 지뢰 (가까운 적에게 날아가 붙음)
        const t = this.nearest(m.x, m.y, 90);
        if (t) {
          const d = Math.hypot(t.x - m.x, t.y - m.y) || 1;
          const v = Math.min(d, 200 * dt);
          m.x += ((t.x - m.x) / d) * v;
          m.y += ((t.y - m.y) / d) * v;
          m.img.setPosition(m.x, m.y);
        }
      }
      if (m.arm <= 0) {
        m.img.setTint(Math.floor(m.life * 3) % 2 ? 0xffffff : 0xff6a6a);
        const near = this.ctx.grid.query(m.x, m.y, 18 + MAX_ENEMY_RADIUS, this.buf);
        if (near.some((e) => e.active && (e.x - m.x) ** 2 + (e.y - m.y) ** 2 < (18 + e.radius) ** 2)) {
          if (this.has('blackHole')) m.pull = 0.5;
          else this.explode(m);
        }
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
    this.mines.push({ x, y, arm, life: LIFE, pull: -1, img: this.ctx.phaser.add.image(x, y, 'mine').setDepth(8) });
  }

  private explode(m: Mine, mul = 1): void {
    if (m.life <= 0) return;
    m.life = 0;
    m.pull = -1;
    const r = BASE_R * this.area * mul;
    this.hitCircle(m.x, m.y, r, this.damage * mul);
    // 전설: 파편 지뢰 (사방으로 파편 6개)
    if (this.has('fragMine')) for (let k = 0; k < 6; k++) this.ctx.fireBullet(m.x, m.y, (k / 6) * Math.PI * 2, 280, this.damage * 0.5, { life: 0.35, turnRate: 0 });
    if (this.blasts.length < 30) this.blasts.push({ x: m.x, y: m.y, r, life: 0.3 });
    this.ctx.playFx('proxMine_boom', m.x, m.y, { scale: (r * 1.5) / 48, frameTime: 0.06, alpha: 0.9 });
    this.ctx.burst(m.x, m.y, COLORS.orange, 8);
    this.ctx.sfx('explode');
    // 전설: 연쇄 기폭
    if (this.has('chainDet')) for (const o of this.mines) if (o.life > 0 && (o.x - m.x) ** 2 + (o.y - m.y) ** 2 < 80 * 80) this.explode(o);
  }

  destroy(): void {
    for (const m of this.mines) m.img.destroy();
  }
}
