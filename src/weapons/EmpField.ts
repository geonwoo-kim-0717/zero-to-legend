import { WeaponBase } from './WeaponBase';
import { COLORS } from '../config';

const BASE_R = 50;

/** EMP 필드: 플레이어 주위 원 안의 적에게 주기적으로 피해 + 둔화 */
export class EmpField extends WeaponBase {
  protected readonly tag = 'beam' as const;
  private ticks = 0;
  private pulse = 0;
  private blackoutT = 8;
  private boom = 0;

  update(dt: number): void {
    const { player: p, fx } = this.ctx;
    const r = BASE_R * this.area;
    this.pulse += dt;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.interval;
      this.ticks++;
      const over = this.has('overcharge') && this.ticks % 6 === 0;
      this.hitCircle(p.x, p.y, r, this.damage, undefined, (e, killed) => {
        if (killed) return;
        this.ctx.slow(e, 0.6);
        if (over) this.ctx.stun(e, 0.8);
      });
      if (over) this.ctx.burst(p.x, p.y, COLORS.cyan, 10);
    }
    // 신화: 블랙아웃
    if (this.has('blackout') && (this.blackoutT -= dt) <= 0) {
      this.blackoutT = 8;
      this.hitCircle(p.x, p.y, r * 3, this.damage * 10);
      this.ctx.blockEnemyBullets(p.x, p.y, r * 3);
      this.ctx.screenFlash(0x00f0ff, 0.2, 250);
      this.ctx.sfx('netcrash');
      this.boom = 0.35;
    }
    const wob = Math.sin(this.pulse * 6) * 2;
    fx.fillStyle(COLORS.cyan, 0.06).fillCircle(p.x, p.y, r);
    fx.lineStyle(1, COLORS.cyan, 0.45).strokeCircle(p.x, p.y, r + wob);
    const k = (this.pulse * 1.5) % 1;
    fx.lineStyle(1, COLORS.cyan, 0.3 * (1 - k)).strokeCircle(p.x, p.y, r * k);
    if (this.boom > 0) {
      this.boom -= dt;
      fx.lineStyle(3, COLORS.cyan, this.boom / 0.35).strokeCircle(p.x, p.y, r * 3 * (1 - this.boom / 0.35 * 0.5));
    }
  }
}
