import type Phaser from 'phaser';
import { WeaponBase } from './WeaponBase';
import { COLORS, MAX_ENEMY_RADIUS } from '../config';
import type { Enemy } from '../entities/Enemy';

const BASE_R = 50;

/** EMP 필드: 플레이어 주위 원 안의 적에게 주기적으로 피해 + 둔화 */
export class EmpField extends WeaponBase {
  protected readonly tag = 'beam' as const;
  private ticks = 0;
  private pulse = 0;
  private blackoutT = 8;
  private boom = 0;
  /** 이동 폭풍: 적 무리를 따라다니는 두 번째 장 */
  private roam: { x: number; y: number } | null = null;
  private roamPick = 0;
  private roamTarget = { x: 0, y: 0 };
  /** 시스템 셧다운: 적마다 장 안에 머문 시간 */
  private readonly inside = new Map<Enemy, number>();
  private readonly buf: Enemy[] = [];
  /** 전기장 테두리 그림 (플레이어 장, 이동 폭풍 장) */
  private rings: Phaser.GameObjects.Image[] = [];
  private ringIdx = 0;

  update(dt: number): void {
    const { player: p, fx } = this.ctx;
    const r = BASE_R * this.area;
    this.pulse += dt;
    this.timer -= dt;
    if (this.has('roamStorm') && !this.roam) this.roam = { x: p.x, y: p.y };
    if (this.roam) this.moveRoam(dt, r);
    if (this.timer <= 0) {
      this.timer = this.interval;
      this.ticks++;
      this.tick(p.x, p.y, r);
      if (this.roam) this.tick(this.roam.x, this.roam.y, r);
    }
    // 신화: 시스템 셧다운
    if (this.has('shutdown')) {
      for (const e of this.ctx.grid.query(p.x, p.y, r + MAX_ENEMY_RADIUS, this.buf)) {
        if (!e.active || (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > (r + e.radius) ** 2) continue;
        const t = (this.inside.get(e) ?? 0) + dt;
        if (t >= 5) {
          this.inside.set(e, 0);
          this.ctx.damage(e, e.isBoss ? this.damage * 20 : e.hp + 1, this.tag);
          this.ctx.burst(e.x, e.y, COLORS.cyan, 10);
        } else this.inside.set(e, t);
      }
      if (this.ticks % 20 === 0) for (const [e] of this.inside) if (!e.active || (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > (r + e.radius) ** 2) this.inside.delete(e);
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
    this.ringIdx = 0;
    this.draw(p.x, p.y, r);
    if (this.roam) this.draw(this.roam.x, this.roam.y, r);
    for (let i = this.ringIdx; i < this.rings.length; i++) this.rings[i].setVisible(false);
    if (this.boom > 0) {
      this.boom -= dt;
      fx.lineStyle(3, COLORS.cyan, this.boom / 0.35).strokeCircle(p.x, p.y, r * 3 * (1 - (this.boom / 0.35) * 0.5));
    }
  }

  private tick(x: number, y: number, r: number): void {
    const over = this.has('overcharge') && this.ticks % 6 === 0;
    let dmg = this.damage;
    // 전설: 전류 증폭 (장 안의 적 1마리마다 +5%, 최대 +50%)
    if (this.has('ampCurrent')) {
      let n = 0;
      for (const e of this.ctx.grid.query(x, y, r + MAX_ENEMY_RADIUS, this.buf)) if (e.active && (e.x - x) ** 2 + (e.y - y) ** 2 < (r + e.radius) ** 2) n++;
      dmg *= 1 + Math.min(0.5, n * 0.05);
    }
    this.hitCircle(x, y, r, dmg, undefined, (e, killed) => {
      if (Math.random() < 0.35) this.ctx.playFx('empField_arc', e.x, e.y, { angle: Math.random() * 6.28 });
      if (killed) return;
      this.ctx.slow(e, 0.6);
      if (over) this.ctx.stun(e, 0.8);
    });
    // 전설: 자기 차단막
    if (this.has('magShield')) this.ctx.blockEnemyBullets(x, y, r);
    if (over) this.ctx.burst(x, y, COLORS.cyan, 10);
  }

  /** 1초마다 화면 안에서 적이 가장 많이 모인 곳을 골라 그쪽으로 움직인다 */
  private moveRoam(dt: number, r: number): void {
    const m = this.roam!;
    if ((this.roamPick -= dt) <= 0) {
      this.roamPick = 1;
      let best = -1;
      for (let i = 0; i < 8; i++) {
        const e = this.randomOnScreen();
        if (!e) break;
        const n = this.ctx.grid.query(e.x, e.y, r * 1.5, this.buf).length;
        if (n > best) {
          best = n;
          this.roamTarget = { x: e.x, y: e.y };
        }
      }
      if (best < 0) this.roamTarget = { x: this.ctx.player.x, y: this.ctx.player.y };
    }
    const dx = this.roamTarget.x - m.x;
    const dy = this.roamTarget.y - m.y;
    const d = Math.hypot(dx, dy);
    if (d > 2) {
      const v = Math.min(d, 140 * dt);
      m.x += (dx / d) * v;
      m.y += (dy / d) * v;
    }
  }

  private draw(x: number, y: number, r: number): void {
    const fx = this.ctx.fx;
    const wob = Math.sin(this.pulse * 6) * 2;
    fx.fillStyle(COLORS.cyan, 0.05).fillCircle(x, y, r);
    const sc = this.ctx.phaser;
    if (sc.textures.exists('fx_empField_ring_1')) {
      let img = this.rings[this.ringIdx];
      if (!img) {
        img = sc.add.image(x, y, 'fx_empField_ring_1').setDepth(17).setBlendMode(1);
        this.rings.push(img);
      }
      this.ringIdx++;
      img.setTexture(Math.floor(this.pulse * 10) % 2 ? 'fx_empField_ring_2' : 'fx_empField_ring_1');
      img.setPosition(x, y).setScale(((r + wob) * 2) / 116).setAlpha(0.85).setVisible(true);
    } else fx.lineStyle(1, COLORS.cyan, 0.45).strokeCircle(x, y, r + wob);
    const k = (this.pulse * 1.5) % 1;
    fx.lineStyle(1, COLORS.cyan, 0.3 * (1 - k)).strokeCircle(x, y, r * k);
  }

  destroy(): void {
    for (const r of this.rings) r.destroy();
  }
}
