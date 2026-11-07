import { WeaponBase } from './WeaponBase';
import type { Enemy } from '../entities/Enemy';
import { COLORS } from '../config';

/** 폭발 반경 (블랙마켓 상향: 26 → 30) */
const BASE_R = 30;

/** 마이크로 미사일: 화면 안 무작위 적에게 유도 미사일, 맞으면 작은 폭발 */
export class MicroMissile extends WeaponBase {
  protected readonly tag = 'explosive' as const;
  private blasts: { x: number; y: number; r: number; life: number }[] = [];
  private stormT = 6;
  /** 미사일 폭풍: 1초 동안 나눠 쏠 남은 수 */
  private stormLeft = 0;
  private stormGap = 0;
  private bigT = 10;
  /** 무한 장전: 1초에 너무 많이 쏘지 않도록 */
  private reloadBudget = 8;

  update(dt: number): void {
    const fx = this.ctx.fx;
    this.timer -= dt;
    this.reloadBudget = Math.min(8, this.reloadBudget + dt * 8);
    if (this.timer <= 0) {
      if (this.launch(this.s.count)) this.timer = this.interval;
    }
    // 신화: 미사일 폭풍 (6초마다 20발을 1초 동안)
    if (this.has('missileStorm') && (this.stormT -= dt) <= 0) {
      this.stormT = 6;
      this.stormLeft = 20;
      this.stormGap = 0;
    }
    if (this.stormLeft > 0 && (this.stormGap -= dt) <= 0) {
      this.stormGap = 0.05;
      this.stormLeft--;
      this.launch(1);
    }
    // 신화: 대형 탄두
    if (this.has('bigWarhead') && (this.bigT -= dt) <= 0) {
      const e = this.randomOnScreen();
      if (e) {
        this.bigT = 10;
        this.missile(e, BASE_R * this.area * 4, this.damage * 10, true);
        this.ctx.sfx('shoot');
      }
    }
    for (const b of this.blasts) {
      b.life -= dt;
      fx.fillStyle(COLORS.orange, (b.life / 0.25) * 0.35).fillCircle(b.x, b.y, b.r);
      fx.lineStyle(1, COLORS.yellow, b.life / 0.25).strokeCircle(b.x, b.y, b.r);
    }
    this.blasts = this.blasts.filter((b) => b.life > 0);
    this.tickEffects(dt, COLORS.orange);
  }

  private launch(n: number): boolean {
    let fired = 0;
    for (let i = 0; i < n; i++) {
      const e = this.randomOnScreen();
      if (!e) break;
      this.missile(e, BASE_R * this.area * (this.has('cluster') ? 1.6 : 1), this.damage, false, this.has('retarget'));
      fired++;
    }
    if (fired) this.ctx.sfx('shoot');
    return fired > 0;
  }

  private missile(e: Enemy, r: number, dmg: number, big: boolean, retarget = false, from?: { x: number; y: number }): void {
    const p = from ?? this.ctx.player;
    const a = Math.atan2(e.y - p.y, e.x - p.x) + (from ? 0 : (Math.random() - 0.5) * 2.2);
    this.ctx.fireBullet(p.x, p.y, a, big ? this.s.speed * 0.7 : this.s.speed, 0, {
      target: e,
      texture: 'fx_microMissile_missile_1',
      life: 2.5,
      turnRate: 5,
      onHit: (hit) => {
        this.hitCircle(hit.x, hit.y, r, dmg, undefined, (_k, killed) => {
          // 신화: 무한 장전 (처치하면 1발 더)
          if (killed && this.has('infiniteReload') && this.reloadBudget >= 1) {
            this.reloadBudget--;
            this.launch(1);
          }
        });
        if (this.blasts.length < 40) this.blasts.push({ x: hit.x, y: hit.y, r, life: big ? 0.45 : 0.25 });
        this.ctx.playFx('microMissile_boom', hit.x, hit.y, { scale: (r * 1.5) / 40, frameTime: big ? 0.08 : 0.05, alpha: 0.9 });
        if (big) {
          this.ctx.screenFlash(0xff8a1f, 0.18, 220);
          this.ctx.burst(hit.x, hit.y, COLORS.orange, 24);
          this.ctx.sfx('explode');
        }
        // 전설: 소이 탄두 (2초 동안 불길)
        if (this.has('incendiary')) this.addZone(hit.x, hit.y, hit.x, hit.y, r * 0.8, 2, dmg * 0.3, COLORS.orange);
        // 전설: 재유도 (근처 다른 적에게 한 번 더)
        if (retarget) {
          const next = this.nearest(hit.x, hit.y, 120, new Set([hit]));
          if (next) this.missile(next, r, dmg, false, false, { x: hit.x, y: hit.y });
        }
      },
    });
  }
}
