import { WeaponBase } from './WeaponBase';
import { COLORS } from '../config';
import type { Enemy } from '../entities/Enemy';

const BASE_LEN = 110;
/** 가까운 적을 찾는 거리 (없으면 이동 방향으로 휘두름) */
const AIM_RANGE = 260;

/** 모노와이어: 가장 가까운 적 방향(과 반대·옆)으로 긴 채찍. 줄 위의 적을 모두 베고 잠깐 느리게 */
export class Monowire extends WeaponBase {
  protected readonly tag = 'melee' as const;
  private lashes: { x1: number; y1: number; x2: number; y2: number; life: number; wide: boolean }[] = [];
  private netT = 4;
  /** 되감기: 잠시 뒤 같은 방향으로 한 번 더 */
  private rewinds: { angle: number; t: number }[] = [];
  /** 절단 폭풍 */
  private stormT = 6;
  private spin = -1;
  private spinA = 0;
  private spinStep = 0;
  /** 실 인형: 다음 휘두르기에 맞은 적을 조종 */
  private puppetT = 8;
  private puppetLeft = 0;

  update(dt: number): void {
    const { player: p, fx } = this.ctx;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.interval;
      const t = this.nearest(p.x, p.y, AIM_RANGE);
      const base = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.dirY, p.dirX);
      // count 1: 앞, 2: 앞뒤, 4: 네 방향
      const n = this.s.count >= 4 ? 4 : this.s.count;
      const step = n === 4 ? Math.PI / 2 : Math.PI;
      if (this.has('puppet') && (this.puppetT -= this.interval) <= 0) {
        this.puppetT = 8;
        this.puppetLeft = 5;
      }
      for (let i = 0; i < n; i++) {
        this.lash(base + i * step, 1);
        if (this.has('rewind')) this.rewinds.push({ angle: base + i * step, t: 0.16 });
      }
      this.puppetLeft = 0;
      this.ctx.sfx('slash');
    }
    for (const r of this.rewinds) if ((r.t -= dt) <= 0) this.lash(r.angle, 0.8);
    this.rewinds = this.rewinds.filter((r) => r.t > 0);
    // 신화: 레이저 그물
    if (this.has('laserNet') && (this.netT -= dt) <= 0) {
      this.netT = 4;
      for (let i = 0; i < 8; i++) this.lash((i / 8) * Math.PI * 2, 1.5, true);
      this.ctx.sfx('slash');
    }
    // 신화: 절단 폭풍 (0.9초 동안 세 바퀴)
    if (this.has('cutStorm') && this.spin < 0 && (this.stormT -= dt) <= 0) {
      this.stormT = 6;
      this.spin = 0.9;
      this.spinStep = 0;
      this.ctx.sfx('slash');
    }
    if (this.spin >= 0) {
      this.spin -= dt;
      this.spinA += ((Math.PI * 6) / 0.9) * dt;
      if ((this.spinStep -= dt) <= 0) {
        this.spinStep = 0.05;
        this.lash(this.spinA, 0.7, true);
      }
      if (this.spin < 0) this.spin = -1;
    }
    for (const l of this.lashes) {
      l.life -= dt;
      const a = Math.max(0, l.life / 0.18);
      fx.lineStyle(l.wide ? 3 : 2, COLORS.magenta, a * 0.6).lineBetween(l.x1, l.y1, l.x2, l.y2);
      fx.lineStyle(1, 0xffffff, a).lineBetween(l.x1, l.y1, l.x2, l.y2);
    }
    this.lashes = this.lashes.filter((l) => l.life > 0);
    this.tickEffects(dt, COLORS.magenta);
  }

  private readonly near: Enemy[] = [];

  private lash(angle: number, mul: number, wide = false): void {
    const p = this.ctx.player;
    const len = BASE_LEN * this.area;
    const x2 = p.x + Math.cos(angle) * len;
    const y2 = p.y + Math.sin(angle) * len;
    const dmg = this.damage * mul;
    this.hitLine(p.x, p.y, x2, y2, 6, dmg, (e: Enemy, killed) => {
      // Lv.4부터: 맞은 자리 주변 적 2명에게 확산 피해 (맞힌 피해의 50%)
      if (this.level >= 4) {
        let n = 0;
        for (const o of this.ctx.grid.query(e.x, e.y, 50, this.near)) {
          if (o === e || !o.active || (o.x - e.x) ** 2 + (o.y - e.y) ** 2 > 50 * 50) continue;
          this.ctx.damage(o, dmg * 0.5, this.tag);
          if (++n >= 2) break;
        }
      }
      if (killed) return;
      this.ctx.slow(e, 0.5);
      // 맞은 일반 적은 1초 동안 아군이 되어 다른 적과 싸움
      if (!e.isBoss) this.ctx.charm(e, 1);
      if (this.has('entangle')) {
        this.ctx.stun(e, 0.5);
        for (const o of this.ctx.grid.query(e.x, e.y, 40, this.near)) if (o.active && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 40 * 40) this.ctx.stun(o, 0.5);
      }
      if (this.has('bleed')) this.addDot(e, 3, this.damage * 0.3);
      if (this.puppetLeft > 0 && !e.isBoss) {
        this.puppetLeft--;
        this.ctx.charm(e, 3);
      }
    });
    if (this.lashes.length < 60) this.lashes.push({ x1: p.x, y1: p.y, x2, y2, life: 0.18, wide });
  }
}
