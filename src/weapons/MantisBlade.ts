import Phaser from 'phaser';
import { WeaponBase } from './WeaponBase';
import { COLORS } from '../config';

const BASE_R = 48;
const HALF_ARC = 1.1; // 약 63도 → 전체 126도

interface Slash {
  angle: number;
  half: number;
  r: number;
  life: number;
}

export class MantisBlade extends WeaponBase {
  protected readonly tag = 'melee' as const;
  private slashes: Slash[] = [];

  update(dt: number): void {
    const { player: p, fx } = this.ctx;
    const whirl = this.has('whirlwind');
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.interval * (whirl ? 0.6 : 1);
      // 전설: 반격 자세 — 대시 직후 강화
      const counter = this.has('counterStance') && p.sinceDash < 0.5 ? 2 : 1;
      const r = BASE_R * this.area * counter * (whirl ? 1.15 : 1);
      const dmg = this.damage * counter;
      let base = Math.atan2(p.dirY, p.dirX);
      // 전설 검기: 바라보는 방향 대신 가장 가까운 적 쪽으로 벤다
      if (this.has('swordWave')) {
        let best = 260 * 260;
        for (const e of this.ctx.enemies) {
          if (!e.active) continue;
          const d2 = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
          if (d2 < best) {
            best = d2;
            base = Math.atan2(e.y - p.y, e.x - p.x);
          }
        }
      }
      const half = whirl ? Math.PI : HALF_ARC;
      const sides = whirl ? 1 : this.s.count;
      const reaper = this.has('reaperHarvest');
      this.ctx.sfx('slash');
      for (let i = 0; i < sides; i++) {
        const a = base + i * Math.PI;
        this.hitCircle(
          p.x,
          p.y,
          r,
          dmg,
          whirl ? undefined : (e) => Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(e.y - p.y, e.x - p.x) - a)) <= half,
          (_e, killed) => {
            // 신화: 사신의 수확
            if (killed && reaper) {
              this.ctx.heal(1, true);
              this.timer = Math.max(0.05, this.timer - 0.1);
            }
          },
        );
        this.slashes.push({ angle: a, half, r, life: 0.15 });
        // 전설: 검기
        if (this.has('swordWave')) {
          this.ctx.fireBullet(p.x, p.y, a, 320, dmg * 0.6, { pierce: 999, texture: 'wave', life: 0.8, turnRate: 0, tag: 'melee' });
        }
      }
    }
    // 베기 이펙트: 플레이어를 따라다니는 부채꼴
    for (const s of this.slashes) {
      s.life -= dt;
      const t = Math.max(0, s.life / 0.15);
      fx.fillStyle(COLORS.cyan, 0.35 * t);
      if (s.half >= Math.PI) fx.fillCircle(p.x, p.y, s.r);
      else fx.slice(p.x, p.y, s.r, s.angle - s.half, s.angle + s.half, false).fillPath();
      fx.lineStyle(2, 0xffffff, 0.9 * t);
      fx.beginPath();
      fx.arc(p.x, p.y, s.r, s.angle - s.half, s.angle + s.half, false);
      fx.strokePath();
    }
    this.slashes = this.slashes.filter((s) => s.life > 0);
  }
}
