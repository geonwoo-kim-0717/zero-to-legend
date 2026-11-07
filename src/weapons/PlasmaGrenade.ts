import Phaser from 'phaser';
import { WeaponBase } from './WeaponBase';
import { COLORS } from '../config';
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
    if (this.timer <= 0) {
      // 궤도 폭격: 유탄 대신 3초마다 하늘에서 폭격
      this.timer = this.has('orbitalStrike') ? 3 : this.interval;
      for (let i = 0; i < this.s.count; i++) this.throwOne(p.x, p.y);
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
    for (const c of this.chains) {
      c.delay -= dt;
      if (c.delay <= 0) this.explode(c.x, c.y, c.r, c.dmg, false);
    }
    this.chains = this.chains.filter((c) => c.delay > 0);

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

  private explode(x: number, y: number, r: number, dmg: number, primary: boolean): void {
    // 전설: 중력탄 — 주변 적을 중심으로 끌어당김
    if (primary && this.has('gravity')) {
      for (const e of this.ctx.grid.query(x, y, r * 2, this.pullBuf)) {
        if (!e.active || e.isBoss) continue;
        e.x += (x - e.x) * 0.6;
        e.y += (y - e.y) * 0.6;
      }
    }
    const chainOn = this.has('chainReaction');
    this.hitCircle(x, y, r, dmg, undefined, (e, killed) => {
      if (killed && chainOn && this.chainBudget >= 1) {
        this.chainBudget--;
        this.chains.push({ x: e.x, y: e.y, r, dmg, delay: 0.12 });
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

  private throwOne(px: number, py: number): void {
    const orbital = this.has('orbitalStrike');
    const range = orbital ? 300 : THROW_RANGE;
    let tx = px + Phaser.Math.Between(-120, 120);
    let ty = py + Phaser.Math.Between(-120, 120);
    const list = this.ctx.enemies;
    for (let tries = 0; tries < 12 && list.length > 0; tries++) {
      const e = list[(Math.random() * list.length) | 0];
      if (e.active && (e.x - px) ** 2 + (e.y - py) ** 2 < range * range) {
        tx = e.x;
        ty = e.y;
        break;
      }
    }
    this.ctx.player.attackPose(tx, 0.2);
    const r = BASE_R * this.area;
    if (orbital) {
      this.grenades.push({ sx: tx, sy: ty, tx, ty, t: 0, fuse: 0.6, r: r * 2, dmg: this.damage, mini: false, orbital: true, sprite: null });
    } else {
      this.launch(px, py, tx, ty, r, this.damage, false);
    }
  }

  destroy(): void {
    for (const g of this.grenades) g.sprite?.destroy();
    for (const s of this.spritePool) s.destroy();
  }
}
