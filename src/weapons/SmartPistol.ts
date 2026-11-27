import Phaser from 'phaser';
import { WeaponBase } from './WeaponBase';
import type { Enemy } from '../entities/Enemy';
import type { Projectile } from '../entities/Projectile';

const RANGE = 190;
/** 재조준 칩셋: 다시 쫓을 적을 찾는 반경 */
const RETARGET_R = 320;
/** 재조준 칩셋이 있으면 탄 수명을 줄여 사거리 근처에서 빗나간 탄을 다시 쏘게 함 (초) */
const RETARGET_LIFE = 0.8;
/** 한 번에 쏘는 탄은 최대 4발. 탄이 1발 늘 때마다 한 발 피해 -10% (2발 90%, 3발 80%, 4발 70%) */
const MAX_SHOTS = 4;
const SPLIT_PENALTY = 0.1;

export class SmartPistol extends WeaponBase {
  private lockTarget: Enemy | null = null;
  private lockStack = 0;
  private stormT = 5;
  private eyeT = 3;

  /** (x,y)에서 각도 a 쪽(좌우 cone) range 안의 가장 가까운 적 */
  private nearestInDir(x: number, y: number, a: number, range: number, cone: number): Enemy | null {
    let best: Enemy | null = null;
    let bd = range * range;
    for (const e of this.ctx.enemies) {
      if (!e.active) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d > bd) continue;
      if (Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(e.y - y, e.x - x) - a)) > cone) continue;
      bd = d;
      best = e;
    }
    return best;
  }

  private get shots(): number {
    return Math.min(MAX_SHOTS, Math.max(1, this.cnt));
  }

  /** 탄 수에 따라 깎인 한 발 피해 (일반 사격만. 신화 탄막 오버로드·데드아이는 깎지 않는다) */
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
      // 탄막 오버로드 탄도 근처 적을 쫓아감 (사용자 메모: 편집 페이지)
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const t = this.nearestInDir(p.x, p.y, a, RANGE * 1.6, 0.5);
        this.ctx.fireBullet(p.x, p.y, a, this.s.speed, this.damage, { pierce: this.s.pierce + 1, chain, target: t, turnRate: t ? 5 : 0, texture: 'fx_smartPistol_tracer_1', hitFx: 'smartPistol_hit' });
      }
    }
    // 신화: 데드아이
    if (this.has('deadeye') && (this.eyeT -= dt) <= 0) {
      this.eyeT = 3;
      this.ctx.sfx('shoot');
      let n = 0;
      for (const e of this.ctx.enemies) {
        if (!e.active || !this.ctx.onScreen(e.x, e.y)) continue;
        this.ctx.fireBullet(p.x, p.y, Math.atan2(e.y - p.y, e.x - p.x), this.s.speed * 1.4, this.damage, { target: e, turnRate: 14, texture: 'fx_smartPistol_tracer_1', hitFx: 'smartPistol_hit' });
        if (++n >= 60) break;
      }
    }

    this.timer -= dt;
    if (this.timer > 0 || !this.trigger) return;
    const count = this.shots;
    this.timer = this.interval;
    // 트윈스틱: 커서 방향으로 쏘고, 조준선 근처 적에게는 약하게 휘어 감 (스마트 탄)
    const ma = this.aimAngle;
    const lock = this.aimTarget(RANGE);
    p.attackPose(p.x + Math.cos(ma) * 10, 0.15);
    this.ctx.sfx('shoot');

    // 전설: 표적 고정 — 같은 적을 계속 노리면 피해 누적 증가
    let mul = 1;
    if (this.has('targetLock') && lock) {
      this.lockStack = lock === this.lockTarget && lock.active ? Math.min(5, this.lockStack + 1) : 0;
      this.lockTarget = lock;
      mul = 1 + 0.1 * this.lockStack;
    }

    // 무기 전용 칩셋 재조준: 수명이 다한 탄이 가까운 적을 r번 다시 쫓음
    const reAim = Math.floor(this.wc('r'));
    const onExpire = reAim > 0 ? this.retarget(reAim) : undefined;
    this.ctx.playFx('smartPistol_muzzle', p.x + Math.cos(ma) * 6, p.y + Math.sin(ma) * 6, { angle: ma, originX: 0 });
    for (let i = 0; i < count; i++) {
      const a = ma + (i - (count - 1) / 2) * 0.12;
      this.ctx.fireBullet(p.x, p.y, a, this.s.speed, this.shotDamage * mul, { pierce: this.s.pierce, target: lock, turnRate: lock ? 3.5 : 0, chain, texture: 'fx_smartPistol_tracer_1', hitFx: 'smartPistol_hit', onExpire: onExpire?.(), life: onExpire ? RETARGET_LIFE : undefined });
    }
  }

  /** 재조준 콜백 (탄마다 따로 횟수를 셈) */
  private retarget(n: number): () => (b: Projectile) => boolean {
    return () => {
      let left = n;
      return (b) => {
        if (left-- <= 0) return false;
        let best: Enemy | null = null;
        let bd = RETARGET_R * RETARGET_R;
        for (const e of this.ctx.grid.query(b.x, b.y, RETARGET_R, this.reBuf)) {
          if (!e.active || b.hits.includes(e)) continue;
          const d = (e.x - b.x) ** 2 + (e.y - b.y) ** 2;
          if (d < bd) ((bd = d), (best = e));
        }
        if (!best) return false;
        b.target = best;
        b.turnRate = 14;
        b.life = 0.8;
        return true;
      };
    };
  }
  private reBuf: Enemy[] = [];
}
