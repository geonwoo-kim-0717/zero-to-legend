import { WeaponBase } from './WeaponBase';
import type { Enemy } from '../entities/Enemy';
import { COLORS } from '../config';

/** 폭발 반경 (블랙마켓 상향: 26 → 30) */
const BASE_R = 30;
/** 요격 칩셋: 플레이어에서 이 거리 안의 적 탄을 노림 */
const INTERCEPT_R = 260;

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
    if (this.timer <= 0 && this.trigger) {
      // 트윈스틱: 오른쪽 클릭으로 커서 근처 적들에게 일제 발사 (근처에 없으면 화면 안 적)
      this.fired();
      // 다중 락온 조합: 미사일 수 증가
      if (this.launch(this.cnt + (this.ctx.mod('combo.missileMulti')?.n ?? 0), true)) this.timer = this.interval;
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

  private launch(n: number, aimed = false): boolean {
    let fired = 0;
    const near = aimed ? this.nearAim(n) : [];
    const icpt = this.wc('c');
    for (let i = 0; i < n; i++) {
      // 무기 전용 칩셋 요격: c% 확률로 이 미사일은 가까운 적 탄·적 미사일을 터뜨림
      if (icpt > 0 && Math.random() * 100 < icpt && this.intercept()) {
        fired++;
        continue;
      }
      const e = near.length ? near[i % near.length] : this.randomOnScreen();
      if (!e) break;
      this.missile(e, BASE_R * this.area * (this.has('cluster') ? 1.6 : 1), this.damage, false, this.has('retarget'));
      fired++;
    }
    if (fired) this.ctx.sfx('shoot');
    return fired > 0;
  }

  /** 요격: 플레이어 근처 적 탄 하나를 터뜨림 (미사일 궤적과 작은 폭발 그림) */
  private intercept(): boolean {
    const p = this.ctx.player;
    const at = this.ctx.interceptEnemyBullet(p.x, p.y, INTERCEPT_R);
    if (!at) return false;
    this.ctx.fx.lineStyle(2, COLORS.yellow, 0.7).lineBetween(p.x, p.y, at.x, at.y);
    this.ctx.playFx('microMissile_boom', at.x, at.y, { scale: 0.5, frameTime: 0.04, alpha: 0.9 });
    return true;
  }

  /** 커서 근처(반경 120) 적을 가까운 순으로 n마리까지 */
  private nearAim(n: number): Enemy[] {
    const a = this.aimPoint(420);
    const list: Enemy[] = [];
    // 개편 2-2 열추적 탄두 조합: 엘리트·보스를 먼저 (더 멀리서도)
    const thermal = !!this.ctx.mod('combo.missileThermal');
    const big = (e: Enemy) => thermal && (e.isBoss || e.maxHp >= 1000);
    for (const e of this.ctx.enemies) if (e.active && (e.x - a.x) ** 2 + (e.y - a.y) ** 2 < (big(e) ? 220 : 120) ** 2) list.push(e);
    list.sort((p, q) => (big(q) ? 1 : 0) - (big(p) ? 1 : 0) || (p.x - a.x) ** 2 + (p.y - a.y) ** 2 - ((q.x - a.x) ** 2 + (q.y - a.y) ** 2));
    return list.slice(0, n);
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
        // 폭발 5단계 대폭발: n번째 폭발은 범위·피해 배율
        const bs = this.ctx.boomScale();
        r *= bs;
        dmg *= bs;
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
