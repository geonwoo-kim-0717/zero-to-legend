import { WeaponBase } from './WeaponBase';
import type { Enemy } from '../entities/Enemy';
import { COLORS } from '../config';

const RANGE = 200;
const HOP = 90;

/** 아크 코일: 가까운 적에게 번개, 근처 적으로 연쇄 */
export class ArcCoil extends WeaponBase {
  protected readonly tag = 'electric' as const;
  private bolts: { pts: number[]; life: number }[] = [];
  private stormT = 5;
  private readonly seen = new Set<Enemy>();

  update(dt: number): void {
    const { player: p, fx } = this.ctx;
    this.timer -= dt;
    if (this.timer <= 0) {
      const first = this.nearest(p.x, p.y, RANGE * this.area);
      if (first) {
        this.timer = this.interval;
        this.chain(p.x, p.y, first);
        this.ctx.sfx('glitch');
      }
    }
    // 신화: 뇌우
    if (this.has('thunderstorm') && (this.stormT -= dt) <= 0) {
      this.stormT = 5;
      for (let i = 0; i < 12; i++) {
        const e = this.randomOnScreen();
        if (!e) break;
        this.bolts.push({ pts: this.zigzag(e.x, e.y - 160, e.x, e.y), life: 0.2 });
        this.ctx.damage(e, this.damage * 4, this.tag);
      }
      this.ctx.screenFlash(0xe8f7ff, 0.12, 150);
    }
    for (const b of this.bolts) {
      b.life -= dt;
      fx.lineStyle(2, COLORS.cyan, Math.max(0, b.life / 0.15));
      fx.beginPath();
      fx.moveTo(b.pts[0], b.pts[1]);
      for (let i = 2; i < b.pts.length; i += 2) fx.lineTo(b.pts[i], b.pts[i + 1]);
      fx.strokePath();
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);
  }

  private chain(sx: number, sy: number, first: Enemy): void {
    this.seen.clear();
    let from = { x: sx, y: sy };
    let cur: Enemy | null = first;
    for (let i = 0; i <= this.s.count && cur; i++) {
      this.seen.add(cur);
      this.bolts.push({ pts: this.zigzag(from.x, from.y, cur.x, cur.y), life: 0.15 });
      const killed = this.ctx.damage(cur, this.damage, this.tag);
      if (!killed && i > 0 && this.has('staticShock') && Math.random() < 0.25) this.ctx.stun(cur, 0.5);
      // 절연 유닛: 연쇄 번개가 여기서 끊긴다
      if (cur.id === 'c_insulator') break;
      from = { x: cur.x, y: cur.y };
      cur = this.nearest(from.x, from.y, HOP * this.area, this.seen);
    }
  }

  private zigzag(x1: number, y1: number, x2: number, y2: number): number[] {
    const pts = [x1, y1];
    for (let i = 1; i < 5; i++) {
      const k = i / 5;
      pts.push(x1 + (x2 - x1) * k + (Math.random() - 0.5) * 10, y1 + (y2 - y1) * k + (Math.random() - 0.5) * 10);
    }
    pts.push(x2, y2);
    return pts;
  }
}
