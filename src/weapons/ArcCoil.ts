import { WeaponBase } from './WeaponBase';
import type { Enemy } from '../entities/Enemy';
import { COLORS } from '../config';

const RANGE = 200;
const HOP = 90;
/** 약점 방전 조합: 한 번 연쇄에 치명타로 늘어나는 최대 수 */
const CRIT_HOP_MAX = 5;

/** 아크 코일: 가까운 적에게 번개, 근처 적으로 연쇄 */
export class ArcCoil extends WeaponBase {
  protected readonly tag = 'electric' as const;
  private bolts: { pts: number[]; life: number }[] = [];
  private blasts: { x: number; y: number; r: number; life: number }[] = [];
  private stormT = 5;
  private readonly seen = new Set<Enemy>();
  private rodT = 3;
  /** 테슬라 감옥: 연쇄로 맞은 적들을 잇는 울타리 */
  private cages: { list: Enemy[]; t: number; acc: number }[] = [];

  update(dt: number): void {
    const { player: p, fx } = this.ctx;
    this.timer -= dt;
    if (this.timer <= 0 && this.trigger) {
      // 트윈스틱: 조준선 근처의 첫 적에게서 시작 (없으면 커서 쪽 가장 가까운 적, 그래도 없으면 헛방전)
      const first = this.aimTarget(RANGE * this.area, 0.6) ?? this.nearestTo(this.aimPoint(RANGE * this.area), 60);
      if (!first) {
        this.timer = this.interval * 0.5;
        const ap = this.aimPoint(RANGE * this.area);
        this.bolts.push({ pts: this.zigzag(p.x, p.y, ap.x, ap.y), life: 0.12 });
      } else {
        p.attackPose(first.x, 0.15);
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
    for (const b of this.blasts) {
      b.life -= dt;
      fx.fillStyle(COLORS.cyan, (b.life / 0.2) * 0.3).fillCircle(b.x, b.y, b.r);
      fx.lineStyle(1, 0xffffff, b.life / 0.2).strokeCircle(b.x, b.y, b.r);
    }
    this.blasts = this.blasts.filter((b) => b.life > 0);
  }

  private chain(sx: number, sy: number, first: Enemy): void {
    this.seen.clear();
    let from = { x: sx, y: sy };
    let cur: Enemy | null = first;
    const over = this.has('overcurrent');
    const chain: Enemy[] = [];
    // 개편 2-2: 전기 4단계·폭풍 코일 조합이 연쇄 수를 늘림
    let hops = this.cnt + (this.ctx.mod('syn.elec4')?.n ?? 0) + (this.ctx.mod('combo.coilAmp')?.n ?? 0);
    // 약점 방전 조합: 치명타가 나면 연쇄가 n명 더 튄다 (한 번 연쇄에 최대 CRIT_HOP_MAX명)
    const critHop = this.ctx.mod('combo.coilCrit')?.n ?? 0;
    let critAdded = 0;
    for (let i = 0; i <= hops && cur; i++) {
      this.seen.add(cur);
      chain.push(cur);
      this.bolts.push({ pts: this.zigzag(from.x, from.y, cur.x, cur.y), life: 0.15 });
      // 전설: 과전류 (연쇄될수록 10%씩 강해짐)
      this.ctx.playFx('arcCoil_hit', cur.x, cur.y);
      const killed = this.ctx.damage(cur, this.damage * (over ? 1 + 0.1 * i : 1), this.tag);
      if (critHop > 0 && this.ctx.lastCrit && critAdded < CRIT_HOP_MAX) {
        hops += critHop;
        critAdded += critHop;
      }
      if (!killed && i > 0 && this.has('staticShock') && Math.random() < 0.25) this.ctx.stun(cur, 0.5);
      // 절연 유닛: 연쇄 번개가 여기서 끊긴다
      if (cur.id === 'c_insulator') break;
      from = { x: cur.x, y: cur.y };
      cur = this.nearest(from.x, from.y, HOP * this.area, this.seen);
    }
    // 무기 전용 칩셋 끝 방전: 연쇄의 마지막 적 자리에서 반경 r px 폭발 (코일 피해)
    const endR = this.wc('r');
    if (endR > 0 && chain.length) {
      const r = endR * this.area;
      this.hitCircle(from.x, from.y, r, this.damage);
      this.blasts.push({ x: from.x, y: from.y, r, life: 0.2 });
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
