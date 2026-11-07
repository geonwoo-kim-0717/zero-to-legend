import { WeaponBase } from './WeaponBase';
import type { Enemy } from '../entities/Enemy';
import { COLORS } from '../config';

const RANGE = 180;
const SPREAD = 0.6;
/** 근거리 사냥 거리 */
const CLOSE = 60;

/** 스캐터 샷건: 가까운 적 방향으로 관통 산탄을 부채꼴로 */
export class Shotgun extends WeaponBase {
  private again = -1;
  private lastAngle = 0;

  update(dt: number): void {
    this.timer -= dt;
    this.tickEffects(dt, COLORS.orange);
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
    // 신화 플레셰트 폭풍: 사방 360도로 두 배
    const ring = this.has('flechette');
    const n = ring ? this.s.count * 2 : this.s.count;
    const slug = this.has('slug');
    const fire = this.has('dragonBreath');
    const close = this.has('closeHunt');
    const shrapnel = this.has('shrapnel');
    const dmg = this.damage;
    this.ctx.sfx('shoot');
    for (let i = 0; i < n; i++) {
      const a = ring ? angle + (i / n) * Math.PI * 2 : angle + (n > 1 ? (i / (n - 1) - 0.5) * SPREAD : 0) + (Math.random() - 0.5) * 0.06;
      this.ctx.fireBullet(p.x, p.y, a, this.s.speed * (0.9 + Math.random() * 0.2), dmg, {
        pierce: this.s.pierce,
        life: 0.5,
        turnRate: 0,
        onHit:
          slug || fire || close || shrapnel
            ? (e: Enemy, killed: boolean) => {
                // 전설: 근거리 사냥 (가까운 적에게 ×1.6)
                if (close && !killed && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < CLOSE * CLOSE) killed = this.ctx.damage(e, dmg * 0.6);
                // 신화: 파편 분열
                if (shrapnel) for (let k = 0; k < 3; k++) this.ctx.fireBullet(e.x, e.y, Math.random() * Math.PI * 2, 260, dmg * 0.4, { life: 0.25, turnRate: 0 });
                if (killed) return;
                // 전설: 드래곤 브레스
                if (fire) this.addDot(e, 2, dmg * 0.6);
                if (slug && !e.isBoss) {
                  e.x += Math.cos(a) * 18;
                  e.y += Math.sin(a) * 18;
                }
              }
            : undefined,
      });
    }
  }
}
