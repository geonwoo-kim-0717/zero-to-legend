import { WeaponBase } from './WeaponBase';
import type { Enemy } from '../entities/Enemy';
import { COLORS } from '../config';

const RANGE = 240;
/** 기본 넉백 거리 */
const KNOCK = 12;
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
    const fire = this.has('dragonBreath');
    const close = this.has('closeHunt');
    const shrapnel = this.has('shrapnel');
    const dmg = this.damage;
    this.ctx.sfx('shotgun');
    this.ctx.playFx('shotgun_blast', p.x + Math.cos(angle) * 6, p.y + Math.sin(angle) * 6, { angle, originX: 0 });
    const onHit = (a: number, knock: number) => (e: Enemy, killed: boolean) => {
      // 전설: 근거리 사냥 (가까운 적에게 ×1.6)
      if (close && !killed && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < CLOSE * CLOSE) killed = this.ctx.damage(e, dmg * 0.6);
      // 신화: 파편 분열
      if (shrapnel) for (let k = 0; k < 3; k++) this.ctx.fireBullet(e.x, e.y, Math.random() * Math.PI * 2, 260, dmg * 0.4, { life: 0.25, turnRate: 0 });
      if (killed) return;
      // 전설: 드래곤 브레스
      if (fire) this.addDot(e, 2, dmg * 0.6);
      // 기본 넉백 (보스 제외)
      if (!e.isBoss) {
        e.x += Math.cos(a) * knock;
        e.y += Math.sin(a) * knock;
      }
    };
    // 전설: 슬러그 탄 — 산탄 대신 관통하는 큰 탄 1발 (피해 = 1발 피해 × 산탄 수)
    if (this.has('slug')) {
      const k = this.has('flechette') ? 4 : 1;
      for (let i = 0; i < k; i++) {
        const a = angle + (i * Math.PI * 2) / k;
        this.ctx.fireBullet(p.x, p.y, a, this.s.speed * 1.2, dmg * this.s.count, {
          pierce: 999,
          texture: 'fx_shotgun_pellet_1',
          life: 0.7,
          turnRate: 0,
          radius: 7,
          scale: 2.4,
          onHit: onHit(a, KNOCK * 2),
        });
      }
      return;
    }
    // 신화 플레셰트 폭풍: 사방 360도로 두 배
    const ring = this.has('flechette');
    const n = ring ? this.s.count * 2 : this.s.count;
    for (let i = 0; i < n; i++) {
      const a = ring ? angle + (i / n) * Math.PI * 2 : angle + (n > 1 ? (i / (n - 1) - 0.5) * SPREAD : 0) + (Math.random() - 0.5) * 0.06;
      this.ctx.fireBullet(p.x, p.y, a, this.s.speed * (0.9 + Math.random() * 0.2), dmg, {
        pierce: this.s.pierce,
        texture: 'fx_shotgun_pellet_1',
        life: 0.6,
        turnRate: 0,
        onHit: onHit(a, KNOCK),
      });
    }
  }
}
