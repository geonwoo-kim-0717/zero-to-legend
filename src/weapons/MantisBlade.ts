import Phaser from 'phaser';
import { WeaponBase } from './WeaponBase';
import { COLORS } from '../config';

const BASE_R = 48;
const HALF_ARC = 1.1;
/** 실제 판정 반지름 = 보이는 베기 반지름 × 1.1 */
const HIT_MUL = 1.1; // 약 63도 → 전체 126도

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
    // 베기 범위(검기가 있으면 검기 사거리) 안에 적이 있을 때만 벰
    // 판정은 베기 그림보다 10% 넓어서, 베기가 시작되면 범위 끝의 작은 적도 맞음
    const reach = this.has('swordWave') ? 260 : BASE_R * this.area * (whirl ? 1.15 : 1);
    if (this.timer <= 0 && this.nearest(p.x, p.y, reach)) {
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
      p.attackPose(p.x + Math.cos(base) * 10, 0.18);
      this.ctx.sfx('slash');
      for (let i = 0; i < sides; i++) {
        const a = base + i * Math.PI;
        this.hitCircle(
          p.x,
          p.y,
          r * HIT_MUL,
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
        // 칼날 궤적 그림 (회전 칼날은 네 방향)
        for (let q = 0; q < (whirl ? 4 : 1); q++) this.ctx.playFx('mantisBlade_slash', p.x, p.y, { angle: a + (q * Math.PI) / 2, originX: 8 / 48, scale: r / 40, frameTime: 0.035 });
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
      fx.fillStyle(COLORS.cyan, 0.12 * t);
      if (s.half >= Math.PI) fx.fillCircle(p.x, p.y, s.r);
      else fx.slice(p.x, p.y, s.r, s.angle - s.half, s.angle + s.half, false).fillPath();
      fx.lineStyle(1, 0xffffff, 0.35 * t);
      fx.beginPath();
      fx.arc(p.x, p.y, s.r, s.angle - s.half, s.angle + s.half, false);
      fx.strokePath();
    }
    this.slashes = this.slashes.filter((s) => s.life > 0);
  }
}
