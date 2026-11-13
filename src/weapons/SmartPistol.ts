import { WeaponBase } from './WeaponBase';
import type { Enemy } from '../entities/Enemy';

const RANGE = 190;
/** 한 번에 쏘는 탄은 최대 4발. 탄이 1발 늘 때마다 한 발 피해 -10% (2발 90%, 3발 80%, 4발 70%) */
const MAX_SHOTS = 4;
const SPLIT_PENALTY = 0.1;

export class SmartPistol extends WeaponBase {
  private readonly targets: Enemy[] = [];
  private readonly dists: number[] = [];
  private lockTarget: Enemy | null = null;
  private lockStack = 0;
  private stormT = 5;
  private eyeT = 3;

  private get shots(): number {
    return Math.min(MAX_SHOTS, Math.max(1, this.s.count));
  }

  /** 탄 수에 따라 깎인 한 발 피해 (신화 사격에도 같이 적용) */
  private get shotDamage(): number {
    return this.damage * (1 - SPLIT_PENALTY * (this.shots - 1));
  }

  update(dt: number): void {
    const p = this.ctx.player;
    const chain = this.has('chainShot') ? 1 : 0;

    // 신화: 탄막 오버로드
    if (this.has('bulletStorm') && (this.stormT -= dt) <= 0) {
      this.stormT = 5;
      this.ctx.sfx('shoot');
      for (let i = 0; i < 24; i++) {
        this.ctx.fireBullet(p.x, p.y, (i / 24) * Math.PI * 2, this.s.speed, this.shotDamage, { pierce: this.s.pierce + 1, chain, texture: 'fx_smartPistol_tracer_1', hitFx: 'smartPistol_hit' });
      }
    }
    // 신화: 데드아이
    if (this.has('deadeye') && (this.eyeT -= dt) <= 0) {
      this.eyeT = 3;
      this.ctx.sfx('shoot');
      let n = 0;
      for (const e of this.ctx.enemies) {
        if (!e.active || !this.ctx.onScreen(e.x, e.y)) continue;
        this.ctx.fireBullet(p.x, p.y, Math.atan2(e.y - p.y, e.x - p.x), this.s.speed * 1.4, this.shotDamage, { target: e, turnRate: 14, texture: 'fx_smartPistol_tracer_1', hitFx: 'smartPistol_hit' });
        if (++n >= 60) break;
      }
    }

    this.timer -= dt;
    if (this.timer > 0) return;
    const count = this.shots;

    // 가장 가까운 적 count마리 (삽입 정렬)
    this.targets.length = 0;
    this.dists.length = 0;
    for (const e of this.ctx.enemies) {
      if (!e.active) continue;
      const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d > RANGE * RANGE) continue;
      if (this.targets.length === count && d >= this.dists[count - 1]) continue;
      let i = Math.min(this.targets.length, count - 1);
      while (i > 0 && this.dists[i - 1] > d) {
        this.dists[i] = this.dists[i - 1];
        this.targets[i] = this.targets[i - 1];
        i--;
      }
      this.dists[i] = d;
      this.targets[i] = e;
    }
    if (this.targets.length === 0) return;
    this.timer = this.interval;
    p.attackPose(this.targets[0].x, 0.15);
    this.ctx.sfx('shoot');

    // 전설: 표적 고정 — 같은 적을 계속 노리면 피해 누적 증가
    let mul = 1;
    if (this.has('targetLock')) {
      const first = this.targets[0];
      this.lockStack = first === this.lockTarget && first.active ? Math.min(5, this.lockStack + 1) : 0;
      this.lockTarget = first;
      mul = 1 + 0.1 * this.lockStack;
    }

    const ma = Math.atan2(this.targets[0].y - p.y, this.targets[0].x - p.x);
    this.ctx.playFx('smartPistol_muzzle', p.x + Math.cos(ma) * 6, p.y + Math.sin(ma) * 6, { angle: ma, originX: 0 });
    for (let i = 0; i < count; i++) {
      const t = this.targets[i % this.targets.length];
      const spread = i >= this.targets.length ? (i - this.targets.length + 1) * 0.25 : 0;
      const a = Math.atan2(t.y - p.y, t.x - p.x) + spread;
      this.ctx.fireBullet(p.x, p.y, a, this.s.speed, this.shotDamage * mul, { pierce: this.s.pierce, target: t, chain, texture: 'fx_smartPistol_tracer_1', hitFx: 'smartPistol_hit' });
    }
  }
}
