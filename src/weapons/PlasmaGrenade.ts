import Phaser from 'phaser';
import { WeaponBase } from './WeaponBase';
import { COLORS } from '../config';
import gameData from '../data/game.json';
import type { Enemy } from '../entities/Enemy';

const THROW_RANGE = 220;
const FUSE = 0.5;
const BASE_R = 40;

interface Grenade {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t: number;
  fuse: number;
  r: number;
  dmg: number;
  mini: boolean;
  orbital: boolean;
  sprite: Phaser.GameObjects.Image | null;
}
interface Blast {
  x: number;
  y: number;
  r: number;
  life: number;
}
interface Pool {
  x: number;
  y: number;
  r: number;
  dmg: number;
  life: number;
  tick: number;
}
interface Chain {
  x: number;
  y: number;
  r: number;
  dmg: number;
  delay: number;
}

export class PlasmaGrenade extends WeaponBase {
  protected readonly tag = 'explosive' as const;
  private grenades: Grenade[] = [];
  private blasts: Blast[] = [];
  private pools: Pool[] = [];
  private chains: Chain[] = [];
  private chainBudget = 25;
  private spritePool: Phaser.GameObjects.Image[] = [];
  private readonly pullBuf: Enemy[] = [];

  update(dt: number): void {
    const { player: p, fx } = this.ctx;
    this.chainBudget = Math.min(25, this.chainBudget + 25 * dt);
    this.timer -= dt;
    if (this.timer <= 0 && this.trigger) {
      // 트윈스틱: 오른쪽 클릭으로 커서 자리에 던짐 (여러 개면 그 둘레에). 궤도 폭격은 3초마다 폭격
      this.fired();
      this.timer = this.has('orbitalStrike') ? 3 : this.interval;
      const at = this.aimPoint(this.has('orbitalStrike') ? 300 : THROW_RANGE);
      for (let i = 0; i < this.cnt; i++) {
        const a = (i / Math.max(1, this.cnt)) * Math.PI * 2;
        const r = i === 0 ? 0 : 28;
        this.throwOne(p.x, p.y, at.x + Math.cos(a) * r, at.y + Math.sin(a) * r);
      }
    }

    for (const g of this.grenades) {
      g.t += dt;
      const k = Math.min(1, g.t / g.fuse);
      if (g.orbital) {
        // 궤도 폭격 예고 원
        fx.lineStyle(1.5, 0xff2a3a, 0.4 + Math.sin(g.t * 30) * 0.3).strokeCircle(g.tx, g.ty, g.r * (1 - k * 0.2));
      } else if (g.sprite) {
        const arc = Math.sin(k * Math.PI) * (g.mini ? 12 : 30);
        g.sprite.setPosition(g.sx + (g.tx - g.sx) * k, g.sy + (g.ty - g.sy) * k - arc);
      }
      if (k >= 1) {
        this.explode(g.tx, g.ty, g.r, g.dmg, !g.mini);
        if (g.sprite) {
          g.sprite.setVisible(false);
          this.spritePool.push(g.sprite);
        }
      }
    }
    this.grenades = this.grenades.filter((g) => g.t < g.fuse);

    // 신화: 연쇄 폭발 대기열
    for (const r of this.recentChains) r.t -= dt;
    this.recentChains = this.recentChains.filter((r) => r.t > 0);
    const due = this.chains.filter((c) => (c.delay -= dt) <= 0);
    this.chains = this.chains.filter((c) => c.delay > 0);
    for (const c of due) {
      this.recentChains.push({ x: c.x, y: c.y, t: 0.3 });
      this.explode(c.x, c.y, c.r, c.dmg, false);
    }

    // 전설: 플라즈마 장판
    for (const pl of this.pools) {
      pl.life -= dt;
      pl.tick -= dt;
      if (pl.tick <= 0) {
        pl.tick = 0.5;
        this.hitCircle(pl.x, pl.y, pl.r, pl.dmg);
      }
      fx.fillStyle(COLORS.magenta, 0.12 * Math.min(1, pl.life)).fillCircle(pl.x, pl.y, pl.r);
      fx.lineStyle(1, COLORS.magenta, 0.5 * Math.min(1, pl.life)).strokeCircle(pl.x, pl.y, pl.r);
    }
    this.pools = this.pools.filter((pl) => pl.life > 0);

    for (const b of this.blasts) {
      b.life -= dt;
      const t = Math.max(0, b.life / 0.25);
      // 큰 폭발일수록 채우기를 옅게 해서 화면이 가려지지 않게
      fx.fillStyle(COLORS.magenta, 0.08 * t * Math.min(1, 60 / b.r)).fillCircle(b.x, b.y, b.r * (1.1 - t * 0.3));
      fx.lineStyle(2, COLORS.yellow, t).strokeCircle(b.x, b.y, b.r * (1.1 - t * 0.3));
    }
    this.blasts = this.blasts.filter((b) => b.life > 0);
  }

  /** 연쇄 폭발은 대기 중이거나 방금(0.3초 안) 터진 연쇄 폭발에서 40px 안에는 새로 만들지 않는다 (겹쳐 터지지 않게) */
  private recentChains: { x: number; y: number; t: number }[] = [];
  private chainFree(x: number, y: number): boolean {
    const g = gameData.falloff.chainGap ** 2;
    const near = (o: { x: number; y: number }) => (o.x - x) ** 2 + (o.y - y) ** 2 < g;
    return !this.chains.some(near) && !this.recentChains.some(near);
  }

  private explode(x: number, y: number, r: number, dmg: number, primary: boolean): void {
    // 폭발 5단계 대폭발: n번째 폭발은 범위·피해 배율
    if (primary) {
      const big = this.ctx.boomScale();
      r *= big;
      dmg *= big;
    }
    // 전설: 중력탄 — 주변 적을 중심으로 끌어당김
    if (primary && this.has('gravity')) {
      for (const e of this.ctx.grid.query(x, y, r * 2, this.pullBuf)) {
        if (!e.active || e.isBoss) continue;
        const k = 0.6 * this.ctx.ccMul(e);
        e.x += (x - e.x) * k;
        e.y += (y - e.y) * k;
      }
    }
    const chainOn = this.has('chainReaction');
    // 무기 전용 칩셋 띄우기: 맞은 적이 t초 동안 떠올랐다가 떨어질 때 유탄 피해의 p%
    const air = this.wc('t');
    const airDmg = (dmg * this.wc('p', 50)) / 100;
    this.hitCircle(x, y, r, dmg, undefined, (e, killed) => {
      if (!killed && air > 0) this.ctx.launchEnemy(e, air, airDmg);
      if (killed && chainOn && this.chainBudget >= 1 && this.chainFree(e.x, e.y)) {
        this.chainBudget--;
        // 연쇄될 때마다 피해 ×0.6 누적
        this.chains.push({ x: e.x, y: e.y, r, dmg: dmg * gameData.falloff.chainBlast, delay: 0.12 });
      }
    });
    this.blasts.push({ x, y, r, life: 0.25 });
    this.ctx.playFx('plasmaGrenade_boom', x, y, { scale: (r * 1.8) / 64, frameTime: 0.05 });
    this.ctx.sfx('explode');
    this.ctx.burst(x, y, COLORS.yellow, primary ? 10 : 5);
    if (!primary) return;
    // 장판은 궤도 폭격과 겹쳐도 화면을 덮지 않도록 반경 상한을 둔다
    if (this.has('plasmaPool')) this.pools.push({ x, y, r: Math.min(r, 60), dmg: dmg * 0.3, life: 3, tick: 0.5 });
    if (this.has('cluster')) {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        this.launch(x, y, x + Math.cos(a) * 55, y + Math.sin(a) * 55, r * 0.5, dmg * 0.5, true);
      }
    }
  }

  private launch(sx: number, sy: number, tx: number, ty: number, r: number, dmg: number, mini: boolean): void {
    const sprite = this.spritePool.pop() ?? this.ctx.phaser.add.image(0, 0, 'grenade').setDepth(16);
    sprite.setVisible(true).setPosition(sx, sy).setScale(mini ? 0.7 : 1);
    this.grenades.push({ sx, sy, tx, ty, t: 0, fuse: mini ? 0.3 : FUSE, r, dmg, mini, orbital: false, sprite });
  }

  private throwOne(px: number, py: number, tx: number, ty: number): void {
    const orbital = this.has('orbitalStrike');
    this.ctx.player.attackPose(tx, 0.2);
    // 투척 강화 조합: 폭발 범위 증가
    const r = BASE_R * this.area * (1 + (this.ctx.mod('combo.grenadeThrow')?.v ?? 0) / 100);
    if (orbital) {
      // 신화 궤도 폭격은 개수 감소 없음 (스마트 피스톨 신화와 같은 방식)
      this.grenades.push({ sx: tx, sy: ty, tx, ty, t: 0, fuse: 0.6, r: r * 2, dmg: this.damage, mini: false, orbital: true, sprite: null });
    } else {
      // 유탄이 1개 늘 때마다 한 발 피해 -10% (장판·집속탄도 이 피해를 따름)
      const split = Math.max(0.5, 1 - gameData.falloff.grenadeSplit * (this.cnt - 1));
      this.launch(px, py, tx, ty, r, this.damage * split, false);
    }
  }

  /** 반격 유탄 조합: 플레이어 자리에서 (tx, ty)로 유탄 한 발 */
  autoThrow(tx: number, ty: number): void {
    this.throwOne(this.ctx.player.x, this.ctx.player.y, tx, ty);
  }

  destroy(): void {
    for (const g of this.grenades) g.sprite?.destroy();
    for (const s of this.spritePool) s.destroy();
  }
}
