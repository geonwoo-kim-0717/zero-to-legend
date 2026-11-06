import { WeaponBase } from './WeaponBase';
import { COLORS } from '../config';

const BASE_R = 26;

/** 마이크로 미사일: 화면 안 무작위 적에게 유도 미사일, 맞으면 작은 폭발 */
export class MicroMissile extends WeaponBase {
  protected readonly tag = 'explosive' as const;
  private blasts: { x: number; y: number; r: number; life: number }[] = [];
  private stormT = 6;

  update(dt: number): void {
    const fx = this.ctx.fx;
    this.timer -= dt;
    if (this.timer <= 0) {
      if (this.launch(this.s.count)) this.timer = this.interval;
    }
    // 신화: 미사일 폭풍
    if (this.has('missileStorm') && (this.stormT -= dt) <= 0) {
      this.stormT = 6;
      this.launch(20);
    }
    for (const b of this.blasts) {
      b.life -= dt;
      fx.fillStyle(COLORS.orange, (b.life / 0.25) * 0.35).fillCircle(b.x, b.y, b.r);
      fx.lineStyle(1, COLORS.yellow, b.life / 0.25).strokeCircle(b.x, b.y, b.r);
    }
    this.blasts = this.blasts.filter((b) => b.life > 0);
  }

  private launch(n: number): boolean {
    const p = this.ctx.player;
    let fired = 0;
    for (let i = 0; i < n; i++) {
      const e = this.randomOnScreen();
      if (!e) break;
      const a = Math.atan2(e.y - p.y, e.x - p.x) + (Math.random() - 0.5) * 2.2;
      const r = BASE_R * this.area * (this.has('cluster') ? 1.6 : 1);
      const dmg = this.damage;
      this.ctx.fireBullet(p.x, p.y, a, this.s.speed, 0, {
        target: e,
        texture: 'missile',
        life: 2.5,
        turnRate: 5,
        onHit: (hit) => {
          this.hitCircle(hit.x, hit.y, r, dmg);
          if (this.blasts.length < 40) this.blasts.push({ x: hit.x, y: hit.y, r, life: 0.25 });
        },
      });
      fired++;
    }
    if (fired) this.ctx.sfx('shoot');
    return fired > 0;
  }
}
