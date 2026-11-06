import { WeaponBase } from './WeaponBase';
import type { Enemy } from '../entities/Enemy';
import { COLORS } from '../config';

const RANGE = 420;

/** 레일건: 가장 체력이 많은 적을 향해 화면을 꿰뚫는 빔 */
export class Railgun extends WeaponBase {
  protected readonly tag = 'beam' as const;
  private beams: { x1: number; y1: number; x2: number; y2: number; w: number; life: number }[] = [];

  update(dt: number): void {
    const { player: p, fx } = this.ctx;
    this.timer -= dt;
    if (this.timer <= 0) {
      const targets = this.toughest(this.s.count);
      if (targets.length) {
        this.timer = this.interval;
        this.ctx.sfx('bosscharge');
        for (const t of targets) {
          const a = Math.atan2(t.y - p.y, t.x - p.x);
          this.beam(a);
          // 신화: 십자 포화
          if (this.has('crossfire')) for (let k = 1; k < 4; k++) this.beam(a + (k * Math.PI) / 2);
        }
      }
    }
    for (const b of this.beams) {
      b.life -= dt;
      const a = Math.max(0, b.life / 0.25);
      fx.lineStyle(b.w * 2 + 4, COLORS.cyan, a * 0.35).lineBetween(b.x1, b.y1, b.x2, b.y2);
      fx.lineStyle(Math.max(1, b.w * 0.6), 0xffffff, a).lineBetween(b.x1, b.y1, b.x2, b.y2);
    }
    this.beams = this.beams.filter((b) => b.life > 0);
  }

  private beam(angle: number): void {
    const p = this.ctx.player;
    const w = 5 * this.area;
    const x2 = p.x + Math.cos(angle) * 700;
    const y2 = p.y + Math.sin(angle) * 700;
    const amp = this.has('piercingAmp');
    this.hitLine(p.x, p.y, x2, y2, w, (_e, n) => this.damage * (amp ? Math.min(2, 1 + 0.15 * n) : 1));
    this.beams.push({ x1: p.x, y1: p.y, x2, y2, w, life: 0.25 });
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
