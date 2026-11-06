import { WeaponBase } from './WeaponBase';

const RANGE = 180;
const SPREAD = 0.6;

/** 스캐터 샷건: 가까운 적 방향으로 산탄을 부채꼴로 */
export class Shotgun extends WeaponBase {
  private again = -1;
  private lastAngle = 0;

  update(dt: number): void {
    this.timer -= dt;
    if (this.again > 0 && (this.again -= dt) <= 0) this.volley(this.lastAngle);
    if (this.timer > 0) return;
    const p = this.ctx.player;
    const t = this.nearest(p.x, p.y, RANGE);
    if (!t) return;
    this.timer = this.interval;
    this.lastAngle = Math.atan2(t.y - p.y, t.x - p.x);
    this.volley(this.lastAngle);
    // 신화: 이중 장전
    if (this.has('doubleTap')) this.again = 0.2;
  }

  private volley(angle: number): void {
    const p = this.ctx.player;
    const n = this.s.count;
    const slug = this.has('slug');
    this.ctx.sfx('shoot');
    for (let i = 0; i < n; i++) {
      const a = angle + (n > 1 ? (i / (n - 1) - 0.5) * SPREAD : 0) + (Math.random() - 0.5) * 0.06;
      this.ctx.fireBullet(p.x, p.y, a, this.s.speed * (0.9 + Math.random() * 0.2), this.damage, {
        pierce: this.s.pierce,
        life: 0.5,
        turnRate: 0,
        onHit: slug
          ? (e, killed) => {
              if (killed || e.isBoss) return;
              e.x += Math.cos(a) * 18;
              e.y += Math.sin(a) * 18;
            }
          : undefined,
      });
    }
  }
}
