import { WeaponBase } from './WeaponBase';
import { COLORS } from '../config';
import type { Enemy } from '../entities/Enemy';

const BASE_LEN = 118;
/** 가까운 적을 찾는 거리 (없으면 이동 방향으로 휘두름) */
/** 실제 판정 길이 = 보이는 채찍 길이 × 1.1 */
const HIT_MUL = 1.1;
/** 연결 칩셋: 이어져 있는 시간 (초) */
const LINK_T = 3;

/** 모노와이어: 가장 가까운 적 방향(과 반대·옆)으로 긴 채찍. 줄 위의 적을 모두 베고 잠깐 느리게 */
export class Monowire extends WeaponBase {
  protected readonly tag = 'melee' as const;
  private lashes: { x1: number; y1: number; x2: number; y2: number; life: number; wide: boolean }[] = [];
  private netT = 4;
  /** 되감기: 잠시 뒤 같은 방향으로 한 번 더 */
  private rewinds: { angle: number; t: number }[] = [];
  /** 절단 폭풍 */
  private stormT = 6;
  private spin = -1;
  private spinA = 0;
  private spinStep = 0;
  /** 실 인형: 다음 휘두르기에 맞은 적을 조종 */
  private puppetT = 8;
  private puppetLeft = 0;

  update(dt: number): void {
    const { player: p, fx } = this.ctx;
    this.timer -= dt;
    // 채찍 길이 안에 적이 있을 때만 휘두름 (판정은 이보다 10% 더 길어서, 휘두르면 끝의 작은 적도 맞음)
    if (this.timer <= 0 && this.trigger) {
      this.timer = this.interval;
      // 트윈스틱: 커서 방향으로 휘두름
      const base = this.aimAngle;
      p.attackPose(p.x + Math.cos(base) * 10, 0.18);
      // count 1: 앞, 2: 앞뒤, 4: 네 방향
      const n = this.cnt >= 4 ? 4 : this.cnt;
      const step = n === 4 ? Math.PI / 2 : Math.PI;
      if (this.has('puppet') && (this.puppetT -= this.interval) <= 0) {
        this.puppetT = 8;
        this.puppetLeft = 5;
      }
      for (let i = 0; i < n; i++) {
        this.lash(base + i * step, 1);
        if (this.has('rewind')) this.rewinds.push({ angle: base + i * step, t: 0.16 });
      }
      this.puppetLeft = 0;
      this.ctx.sfx('slash');
    }
    for (const r of this.rewinds) if ((r.t -= dt) <= 0) this.lash(r.angle, 0.8);
    this.rewinds = this.rewinds.filter((r) => r.t > 0);
    // 신화: 레이저 그물
    if (this.has('laserNet') && (this.netT -= dt) <= 0) {
      this.netT = 4;
      for (let i = 0; i < 8; i++) this.lash((i / 8) * Math.PI * 2, 1.5, true);
      this.ctx.sfx('slash');
    }
    // 신화: 절단 폭풍 (0.9초 동안 세 바퀴)
    if (this.has('cutStorm') && this.spin < 0 && (this.stormT -= dt) <= 0) {
      this.stormT = 6;
      this.spin = 0.9;
      this.spinStep = 0;
      this.ctx.sfx('slash');
    }
    if (this.spin >= 0) {
      this.spin -= dt;
      this.spinA += ((Math.PI * 6) / 0.9) * dt;
      if ((this.spinStep -= dt) <= 0) {
        this.spinStep = 0.05;
        this.lash(this.spinA, 0.7, true);
      }
      if (this.spin < 0) this.spin = -1;
    }
    for (const l of this.lashes) {
      l.life -= dt;
      const a = Math.max(0, l.life / 0.18);
      fx.lineStyle(l.wide ? 3 : 2, COLORS.magenta, a * 0.6).lineBetween(l.x1, l.y1, l.x2, l.y2);
      fx.lineStyle(1, 0xffffff, a).lineBetween(l.x1, l.y1, l.x2, l.y2);
    }
    this.lashes = this.lashes.filter((l) => l.life > 0);
    this.tickEffects(dt, COLORS.magenta);
  }

  private readonly near: Enemy[] = [];

  private lash(angle: number, mul: number, wide = false): void {
    const p = this.ctx.player;
    // 개편 2-2: 채찍 강화 조합(모노와이어+강화 근섬유)이 길이를 늘림
    const len = BASE_LEN * this.area * (1 + (this.ctx.mod('combo.wireMuscle')?.v ?? 0) / 100);
    const x2 = p.x + Math.cos(angle) * len;
    const y2 = p.y + Math.sin(angle) * len;
    const dmg = this.damage * mul;
    const hx = p.x + Math.cos(angle) * len * HIT_MUL;
    const hy = p.y + Math.sin(angle) * len * HIT_MUL;
    const hit = this.hitLine(p.x, p.y, hx, hy, 7, dmg, (e: Enemy, killed) => {
      this.ctx.playFx('monowire_hit', e.x, e.y);
      // Lv.4부터: 맞은 자리 주변 적 2명에게 확산 피해 (맞힌 피해의 50%)
      if (this.level >= 4) {
        let n = 0;
        for (const o of this.ctx.grid.query(e.x, e.y, 50, this.near)) {
          if (o === e || !o.active || (o.x - e.x) ** 2 + (o.y - e.y) ** 2 > 50 * 50) continue;
          this.ctx.damage(o, dmg * 0.5, this.tag);
          if (++n >= 2) break;
        }
      }
      if (killed) return;
      this.ctx.slow(e, 0.5);
      // 맞은 일반 적은 1초(Lv.7부터 1.5초) 동안 아군이 되어 다른 적과 싸움
      if (!e.isBoss) this.ctx.charm(e, this.level >= 7 ? 1.5 : 1);
      if (this.has('entangle')) {
        this.ctx.stun(e, 0.5);
        for (const o of this.ctx.grid.query(e.x, e.y, 40, this.near)) if (o.active && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 40 * 40) this.ctx.stun(o, 0.5);
      }
      if (this.has('bleed')) this.addDot(e, 3, this.damage * 0.3);
      if (this.puppetLeft > 0 && !e.isBoss) {
        this.puppetLeft--;
        this.ctx.charm(e, 3);
      }
    });
    // 무기 전용 칩셋 연결: 함께 맞은 적끼리 LINK_T초 동안 이어져 피해의 s%를 나눔
    const share = this.wc('s');
    if (share > 0) {
      const live = hit.filter((e) => e.active);
      if (live.length >= 2) this.ctx.linkEnemies(live, LINK_T, share);
    }
    if (this.lashes.length < 60) this.lashes.push({ x1: p.x, y1: p.y, x2, y2, life: 0.18, wide });
  }
}
