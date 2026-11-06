import type Phaser from 'phaser';
import { WeaponBase } from './WeaponBase';
import { COLORS } from '../config';

const LIFE = 6;
const FIRE = 0.4;
const RANGE = 160;

interface Post {
  x: number;
  y: number;
  life: number;
  fire: number;
  img: Phaser.GameObjects.Image;
}

/** 포탑 배치: 제자리에 잠깐 서 있는 자동 포탑 */
export class Turret extends WeaponBase {
  private posts: Post[] = [];
  private blasts: { x: number; y: number; r: number; life: number }[] = [];

  update(dt: number): void {
    const { player: p, fx } = this.ctx;
    const sentry = this.has('sentryNet');
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.interval;
      if (this.posts.length >= this.s.count) this.expire(this.posts.shift()!);
      const img = this.ctx.phaser.add.image(p.x, p.y + 6, 'turretw').setDepth(9);
      this.posts.push({ x: p.x, y: p.y + 6, life: LIFE * (sentry ? 2 : 1), fire: 0.2, img });
      this.ctx.sfx('select');
    }
    const range = RANGE * this.area;
    for (const t of this.posts) {
      t.life -= dt;
      t.fire -= dt;
      fx.lineStyle(1, COLORS.yellow, 0.15).strokeCircle(t.x, t.y, range);
      const jam = this.ctx.jammed(t.x, t.y);
      t.img.setTint(jam ? 0x39ff88 : 0xffffff);
      if (t.fire <= 0 && !jam) {
        const e = this.nearest(t.x, t.y, range);
        if (e) {
          t.fire = FIRE;
          const a = Math.atan2(e.y - t.y, e.x - t.x);
          t.img.setRotation(a);
          const shots = sentry ? [-0.2, 0, 0.2] : [0];
          for (const s of shots) this.ctx.fireBullet(t.x, t.y, a + s, 340, this.damage, { life: 0.6, turnRate: 0 });
        }
      }
      if (t.life < 1) t.img.setAlpha(Math.floor(t.life * 10) % 2 ? 0.4 : 1);
    }
    for (const t of this.posts.filter((o) => o.life <= 0)) this.expire(t);
    this.posts = this.posts.filter((o) => o.life > 0);
    for (const b of this.blasts) {
      b.life -= dt;
      fx.lineStyle(2, COLORS.orange, b.life / 0.3).strokeCircle(b.x, b.y, b.r * (1.2 - b.life));
    }
    this.blasts = this.blasts.filter((b) => b.life > 0);
  }

  private expire(t: Post): void {
    t.life = 0;
    t.img.destroy();
    // 전설: 자폭 프로토콜
    if (this.has('selfDestruct')) {
      const r = 60 * this.area;
      this.hitCircle(t.x, t.y, r, this.damage * 6);
      this.blasts.push({ x: t.x, y: t.y, r, life: 0.3 });
      this.ctx.burst(t.x, t.y, COLORS.orange, 14);
      this.ctx.sfx('explode');
    }
  }

  destroy(): void {
    for (const t of this.posts) t.img.destroy();
  }
}
