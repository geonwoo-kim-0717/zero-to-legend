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
  private rodT = 3;
  /** 테슬라 감옥: 연쇄로 맞은 적들을 잇는 울타리 */
  private cages: { list: Enemy[]; t: number; acc: number }[] = [];

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
    // 전설: 피뢰침 (3초마다 주변 적 모두에게 방전)
    if (this.has('lightningRod') && (this.rodT -= dt) <= 0) {
      this.rodT = 3;
      this.hitCircle(p.x, p.y, 100 * this.area, this.damage, undefined, (e) => {
        if (this.bolts.length < 60) this.bolts.push({ pts: this.zigzag(p.x, p.y, e.x, e.y), life: 0.15 });
      });
      this.ctx.sfx('glitch');
    }
    // 신화: 번개 질주 (대시가 끝나면 지나간 길에 번개)
    const dp = this.ctx.dashPath;
    if (dp && this.has('boltDash')) {
      this.hitLine(dp.x1, dp.y1, dp.x2, dp.y2, 16, this.damage * 2);
      this.bolts.push({ pts: this.zigzag(dp.x1, dp.y1, dp.x2, dp.y2), life: 0.25 });
      this.ctx.sfx('glitch');
    }
    for (const c of this.cages) {
      c.t -= dt;
      c.acc += dt;
      const live = c.list.filter((e) => e.active);
      const zap = c.acc >= 0.3;
      if (zap) c.acc = 0;
      for (let i = 0; i + 1 < live.length; i++) {
        const a = live[i];
        const b = live[i + 1];
        fx.lineStyle(1, COLORS.cyan, 0.6).lineBetween(a.x, a.y, b.x, b.y);
        if (zap) this.hitLine(a.x, a.y, b.x, b.y, 4, this.damage * 0.4);
      }
    }
    this.cages = this.cages.filter((c) => c.t > 0);
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
    const over = this.has('overcurrent');
    const chain: Enemy[] = [];
    for (let i = 0; i <= this.s.count && cur; i++) {
      this.seen.add(cur);
      chain.push(cur);
      this.bolts.push({ pts: this.zigzag(from.x, from.y, cur.x, cur.y), life: 0.15 });
      // 전설: 과전류 (연쇄될수록 10%씩 강해짐)
      const killed = this.ctx.damage(cur, this.damage * (over ? 1 + 0.1 * i : 1), this.tag);
      if (!killed && i > 0 && this.has('staticShock') && Math.random() < 0.25) this.ctx.stun(cur, 0.5);
      // 절연 유닛: 연쇄 번개가 여기서 끊긴다
      if (cur.id === 'c_insulator') break;
      from = { x: cur.x, y: cur.y };
      cur = this.nearest(from.x, from.y, HOP * this.area, this.seen);
    }
    // 신화: 테슬라 감옥
    if (this.has('teslaCage') && chain.length > 1 && this.cages.length < 6) this.cages.push({ list: chain, t: 2, acc: 0 });
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
