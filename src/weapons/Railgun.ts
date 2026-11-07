import { WeaponBase } from './WeaponBase';
import type { Enemy } from '../entities/Enemy';
import { COLORS } from '../config';

const RANGE = 420;
/** 기본 빔 굵기 (블랙마켓 상향: 5 → 6.5) */
const BASE_W = 6.5;

/** 레일건: 가장 체력이 많은 적을 향해 화면을 꿰뚫는 빔 */
export class Railgun extends WeaponBase {
  protected readonly tag = 'beam' as const;
  private beams: { x1: number; y1: number; x2: number; y2: number; w: number; life: number }[] = [];
  /** 신화 차지 샷: 충전 중이면 남은 시간과 조준 각도 */
  private charge = -1;
  private chargeAngles: number[] = [];
  private orbitT = 5;

  update(dt: number): void {
    const { player: p, fx } = this.ctx;
    const chargeShot = this.has('chargeShot');
    this.timer -= dt;
    if (this.charge >= 0) {
      this.charge -= dt;
      // 충전 중: 조준선이 점점 굵어진다
      const k = 1 - Math.max(0, this.charge);
      for (const a of this.chargeAngles) fx.lineStyle(1 + k * 3, COLORS.cyan, 0.2 + k * 0.5).lineBetween(p.x, p.y, p.x + Math.cos(a) * 700, p.y + Math.sin(a) * 700);
      if (this.charge < 0) {
        for (const a of this.chargeAngles) this.fire(a, 3);
        this.ctx.sfx('bosscharge');
        this.ctx.screenFlash(0xe8f7ff, 0.1, 120);
      }
    } else if (this.timer <= 0) {
      const targets = this.toughest(this.s.count);
      if (targets.length) {
        this.timer = this.interval;
        const angles = targets.map((t) => Math.atan2(t.y - p.y, t.x - p.x));
        if (chargeShot) {
          this.charge = 1;
          this.chargeAngles = angles;
        } else {
          this.ctx.sfx('bosscharge');
          for (const a of angles) this.fire(a, 1);
        }
      }
    }
    // 신화: 궤도 레일 (화면을 가로지르는 거대 빔 3줄)
    if (this.has('orbitalRail') && (this.orbitT -= dt) <= 0) {
      this.orbitT = 5;
      const v = this.ctx.view();
      for (let i = 0; i < 3; i++) {
        const e = this.randomOnScreen();
        const cx = e ? e.x : v.x + Math.random() * v.width;
        const cy = e ? e.y : v.y + Math.random() * v.height;
        const a = Math.random() * Math.PI;
        const L = Math.hypot(v.width, v.height);
        const x1 = cx - Math.cos(a) * L;
        const y1 = cy - Math.sin(a) * L;
        const x2 = cx + Math.cos(a) * L;
        const y2 = cy + Math.sin(a) * L;
        const w = BASE_W * this.area * 2.5;
        this.hitLine(x1, y1, x2, y2, w, this.damage * 3);
        this.beams.push({ x1, y1, x2, y2, w, life: 0.35 });
      }
      this.ctx.screenFlash(0x00f0ff, 0.15, 200);
      this.ctx.sfx('netcrash');
    }
    for (const b of this.beams) {
      b.life -= dt;
      const a = Math.max(0, b.life / 0.25);
      fx.lineStyle(b.w * 2 + 4, COLORS.cyan, a * 0.35).lineBetween(b.x1, b.y1, b.x2, b.y2);
      fx.lineStyle(Math.max(1, b.w * 0.6), 0xffffff, a).lineBetween(b.x1, b.y1, b.x2, b.y2);
    }
    this.beams = this.beams.filter((b) => b.life > 0);
    this.tickEffects(dt, COLORS.orange);
  }

  /** 빔 한 줄과 신화 십자 포화 */
  private fire(a: number, mul: number): void {
    this.beam(a, mul);
    if (this.has('crossfire')) for (let k = 1; k < 4; k++) this.beam(a + (k * Math.PI) / 2, mul);
  }

  private beam(angle: number, mul: number): void {
    const p = this.ctx.player;
    const w = BASE_W * this.area * mul;
    const x2 = p.x + Math.cos(angle) * 700;
    const y2 = p.y + Math.sin(angle) * 700;
    const amp = this.has('piercingAmp');
    const weak = this.has('weakSpot');
    this.hitLine(p.x, p.y, x2, y2, w, (e: Enemy, n) => {
      let d = this.damage * mul * (amp ? Math.min(2, 1 + 0.15 * n) : 1);
      // 전설: 약점 저격
      if (weak && e.hp >= e.maxHp * 0.5) d *= 1.5;
      return d;
    });
    this.beams.push({ x1: p.x, y1: p.y, x2, y2, w, life: 0.25 });
    // 전설: 과열 잔상 (2초 동안 타는 선)
    if (this.has('heatTrail')) this.addZone(p.x, p.y, x2, y2, Math.max(3, w * 0.6), 2, this.damage * 0.2, COLORS.orange);
  }

  /** 사거리 안에서 체력이 가장 많은 적 n명 */
  private toughest(n: number): Enemy[] {
    const p = this.ctx.player;
    const out: Enemy[] = [];
    for (const e of this.ctx.enemies) {
      if (!e.active || (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > RANGE * RANGE) continue;
      out.push(e);
    }
    out.sort((a, b) => b.hp - a.hp);
    return out.slice(0, n);
  }
}
