import type Phaser from 'phaser';
import { WeaponBase } from './WeaponBase';
import { COLORS } from '../config';
import type { Enemy } from '../entities/Enemy';

/** 포탑 유지 시간 (블랙마켓 상향: 6 → 8초) */
const LIFE = 10;
const FIRE = 0.4;
const RANGE = 160;
/** 수리 포탑: 이 거리 안이면 회복 */
const REPAIR_R = 70;
/** 가열 연사 칩셋: 최대 속도까지 걸리는 발사 수 */
const RAMP_SHOTS = 12;

interface Post {
  x: number;
  y: number;
  life: number;
  fire: number;
  shots: number;
  /** 휴대 포탑: 플레이어 기준 위치 */
  ox: number;
  oy: number;
  img: Phaser.GameObjects.Image;
}

/** 포탑 배치: 잠깐 서 있는 자동 포탑. 한 번에 탄 2발 */
export class Turret extends WeaponBase {
  private posts: Post[] = [];
  private blasts: { x: number; y: number; r: number; life: number }[] = [];
  private linkT = 0;
  private placed = 0;

  update(dt: number): void {
    const { player: p, fx } = this.ctx;
    const sentry = this.has('sentryNet');
    const fortress = this.has('fortress');
    const mobile = this.has('mobilePost');
    // 개편 2-2: 기계 2단계·포탑 거점 조합이 동시 포탑 수를 늘림
    const max = this.cnt + (fortress ? 2 : 0) + (this.ctx.mod('syn.mech2')?.n ?? 0) + (this.ctx.mod('combo.turretDock')?.n ?? 0);
    this.timer -= dt;
    if (this.timer <= 0 && this.trigger) {
      // 트윈스틱: 오른쪽 클릭으로 커서 자리에 설치 (휴대 포탑은 플레이어 곁)
      this.fired();
      this.timer = this.interval;
      const at = this.aimPoint(140);
      // 신화 센트리 네트워크: 동시 포탑 수 제한 없음 (각 포탑은 유지 시간이 끝나야 사라짐)
      if (!sentry && this.posts.length >= max) this.expire(this.posts.shift()!);
      const a = this.placed++ * 2.4;
      const ox = mobile ? Math.cos(a) * 34 : 0;
      const oy = mobile ? Math.sin(a) * 34 : 6;
      const bx = mobile ? p.x : at.x;
      const by = mobile ? p.y : at.y;
      const img = this.ctx.phaser.add.image(bx + ox, by + oy, 'turretw').setDepth(9);
      this.posts.push({ x: bx + ox, y: by + oy, life: LIFE * (sentry ? 2 : 1), fire: 0.2, shots: 0, ox, oy, img });
      this.ctx.sfx('select');
    }
    const range = RANGE * this.area;
    let nearPost = false;
    for (const t of this.posts) {
      t.life -= dt;
      t.fire -= dt;
      // 신화: 휴대 포탑 (플레이어를 따라다님)
      if (mobile) {
        t.x = p.x + t.ox;
        t.y = p.y + t.oy;
        t.img.setPosition(t.x, t.y);
      }
      fx.lineStyle(1, COLORS.yellow, 0.15).strokeCircle(t.x, t.y, range);
      if ((t.x - p.x) ** 2 + (t.y - p.y) ** 2 < REPAIR_R * REPAIR_R) nearPost = true;
      const jam = this.ctx.jammed(t.x, t.y);
      t.img.setTint(jam ? 0x39ff88 : 0xffffff);
      if (t.fire <= 0 && !jam) {
        // 택티컬 OS 2줄: 표식된 적을 먼저
        const e = this.markedNear(t.x, t.y, range) ?? this.nearest(t.x, t.y, range);
        if (e) {
          // 발사 간격에도 공격속도(신경 가속기·냉각 코어)와 오버클럭이 적용된다
          // 무기 전용 칩셋 가열 연사: 쏠수록(RAMP_SHOTS발에 걸쳐) 공격 속도가 최대 m%까지 오름
          const heat = 1 + (this.wc('m') / 100) * Math.min(1, t.shots / RAMP_SHOTS);
          t.fire = (FIRE * this.ctx.stats.cooldownMul * this.ctx.weaponMul(this.id).cd) / this.ctx.odFireMul / heat;
          t.shots++;
          const a = Math.atan2(e.y - t.y, e.x - t.x);
          t.img.setRotation(a);
          // 기본 2발 (블랙마켓 상향), 센트리 네트워크는 3갈래 × 2발
          const dirs = sentry ? [-0.2, 0, 0.2] : [0];
          for (const s of dirs) {
            this.ctx.playFx('turret_muzzle', t.x + Math.cos(a + s) * 7, t.y + Math.sin(a + s) * 7, { angle: a + s, originX: 0 });
            for (const k of [-0.06, 0.06]) this.ctx.fireBullet(t.x, t.y, a + s + k, 340, this.damage, { life: 0.6, turnRate: 0 });
          }
          // 전설: 로켓 포탑 (3발마다 폭발 로켓)
          if (this.has('rocketPost') && t.shots % 3 === 0) {
            const r = 30 * this.area;
            const dmg = this.damage * 2;
            this.ctx.fireBullet(t.x, t.y, a, 220, 0, {
              target: e,
              texture: 'missile',
              life: 1.5,
              turnRate: 4,
              onHit: (hit) => {
                this.hitCircle(hit.x, hit.y, r, dmg);
                if (this.blasts.length < 30) this.blasts.push({ x: hit.x, y: hit.y, r, life: 0.3 });
              },
            });
          }
        }
      }
      if (t.life < 1) t.img.setAlpha(Math.floor(t.life * 10) % 2 ? 0.4 : 1);
    }
    // 전설: 수리 포탑
    if (nearPost && this.has('repairPost')) this.ctx.heal(dt, true);
    // 신화: 포탑 요새 (포탑끼리 레이저로 연결)
    if (fortress && this.posts.length > 1) {
      const live = this.posts.filter((o) => o.life > 0);
      const hit = (this.linkT -= dt) <= 0;
      if (hit) this.linkT = 0.3;
      for (let i = 0; i < live.length; i++) {
        const a = live[i];
        const b = live[(i + 1) % live.length];
        if (a === b || (live.length === 2 && i === 1)) continue;
        fx.lineStyle(2, COLORS.yellow, 0.5).lineBetween(a.x, a.y, b.x, b.y);
        if (hit) this.hitLine(a.x, a.y, b.x, b.y, 4, this.damage * 0.5);
      }
    }
    for (const t of this.posts.filter((o) => o.life <= 0)) this.expire(t);
    this.posts = this.posts.filter((o) => o.life > 0);
    for (const b of this.blasts) {
      b.life -= dt;
      fx.lineStyle(2, COLORS.orange, b.life / 0.3).strokeCircle(b.x, b.y, b.r * (1.2 - b.life));
    }
    this.blasts = this.blasts.filter((b) => b.life > 0);
  }

  private markedNear(x: number, y: number, r: number): Enemy | null {
    if (!this.ctx.mod('tactical.focus')) return null;
    let best: Enemy | null = null;
    let bd = r * r;
    for (const e of this.ctx.grid.query(x, y, r, this.focusBuf)) {
      if (!e.active || !this.ctx.isMarked(e)) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }
  private readonly focusBuf: Enemy[] = [];

  private expire(t: Post): void {
    // 개편 2-2 기계 4단계: 포탑이 사라질 때 폭발
    const boom = this.ctx.mod('syn.mech4');
    if (boom && t.img.active) {
      this.hitCircle(t.x, t.y, boom.r ?? 60, (boom.dmg ?? 60) * this.ctx.stats.damageMul);
      if (this.blasts.length < 30) this.blasts.push({ x: t.x, y: t.y, r: boom.r ?? 60, life: 0.3 });
    }
    t.life = 0;
    t.img.destroy();
  }

  destroy(): void {
    for (const t of this.posts) t.img.destroy();
  }
}
