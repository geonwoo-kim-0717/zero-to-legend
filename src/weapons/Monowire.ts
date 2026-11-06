import { WeaponBase } from './WeaponBase';
import { COLORS } from '../config';

const BASE_LEN = 110;

/** 모노와이어: 이동 방향(과 반대·옆)으로 긴 채찍. 줄 위의 적을 모두 벤다 */
export class Monowire extends WeaponBase {
  protected readonly tag = 'melee' as const;
  private lashes: { x1: number; y1: number; x2: number; y2: number; life: number; wide: boolean }[] = [];
  private netT = 4;

  update(dt: number): void {
    const { player: p, fx } = this.ctx;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.interval;
      const base = Math.atan2(p.dirY, p.dirX);
      // count 1: 앞, 2: 앞뒤, 4: 네 방향
      const n = this.s.count >= 4 ? 4 : this.s.count;
      const step = n === 4 ? Math.PI / 2 : Math.PI;
      for (let i = 0; i < n; i++) this.lash(base + i * step, 1);
      this.ctx.sfx('slash');
    }
    // 신화: 레이저 그물
    if (this.has('laserNet') && (this.netT -= dt) <= 0) {
      this.netT = 4;
      for (let i = 0; i < 8; i++) this.lash((i / 8) * Math.PI * 2, 1.5, true);
      this.ctx.sfx('slash');
    }
    for (const l of this.lashes) {
      l.life -= dt;
      const a = Math.max(0, l.life / 0.18);
      fx.lineStyle(l.wide ? 3 : 2, COLORS.magenta, a * 0.6).lineBetween(l.x1, l.y1, l.x2, l.y2);
      fx.lineStyle(1, 0xffffff, a).lineBetween(l.x1, l.y1, l.x2, l.y2);
    }
    this.lashes = this.lashes.filter((l) => l.life > 0);
  }

  private lash(angle: number, mul: number, wide = false): void {
    const p = this.ctx.player;
    const len = BASE_LEN * this.area;
    // 살짝 휘어지는 느낌: 끝을 조금 비튼다
    const x2 = p.x + Math.cos(angle) * len;
    const y2 = p.y + Math.sin(angle) * len;
    this.hitLine(p.x, p.y, x2, y2, 6, this.damage * mul, (e, killed) => {
      if (!killed && this.has('entangle')) this.ctx.stun(e, 0.5);
    });
    this.lashes.push({ x1: p.x, y1: p.y, x2, y2, life: 0.18, wide });
  }
}
