import weapons from '../data/weapons.json';
import abilities from '../data/abilities.json';
import gameData from '../data/game.json';
import type { GameContext, DamageTag } from './types';
import { MAX_ENEMY_RADIUS } from '../config';
import type { Enemy } from '../entities/Enemy';

export type WeaponId = keyof typeof weapons;
export type AbilityTier = 'legendary' | 'mythic';
type StatKey = 'damage' | 'interval' | 'count' | 'speed' | 'pierce' | 'area';
type LevelDef = Partial<Record<StatKey, number>> & { desc: string };

export const WEAPON_MAX_LEVEL = 8;

export abstract class WeaponBase {
  level = 1;
  /** 희귀 이상 등급으로 얻은 추가 피해 비율 (누적) */
  bonus = 0;
  /** 전설·신화 등급으로 얻은 특수 능력 id */
  readonly abilities = new Set<string>();
  protected timer = 0;
  protected s: Record<StatKey, number>;
  private readonly found: Enemy[] = [];

  constructor(
    readonly id: WeaponId,
    protected readonly ctx: GameContext,
  ) {
    this.s = this.compute();
  }

  get name(): string {
    return weapons[this.id].name;
  }

  static levelDesc(id: WeaponId, level: number): string {
    return (weapons[id].levels as LevelDef[])[level - 1]?.desc ?? '';
  }

  /** 이 등급에서 아직 받을 수 있는 특수 능력 목록 (등급당 1개까지) */
  static availableAbilities(id: WeaponId, tier: AbilityTier, owned?: WeaponBase) {
    const list = abilities.weapons[id][tier];
    if (owned && list.some((a) => owned.abilities.has(a.id))) return [];
    return list;
  }

  has(abilityId: string): boolean {
    return this.abilities.has(abilityId);
  }

  addAbility(abilityId: string): void {
    this.abilities.add(abilityId);
    this.onLevel();
  }

  private compute(): Record<StatKey, number> {
    const s = { ...weapons[this.id].base };
    const levels = weapons[this.id].levels as LevelDef[];
    for (let i = 1; i < this.level; i++) {
      for (const [k, v] of Object.entries(levels[i])) if (k !== 'desc') s[k as StatKey] += v as number;
    }
    return s;
  }

  levelUp(): void {
    this.level = Math.min(WEAPON_MAX_LEVEL, this.level + 1);
    this.s = this.compute();
    this.onLevel();
  }

  protected onLevel(): void {}

  /** 근접·폭발물 무기는 러너 특성과 특수 능력의 배율을 따로 받는다 */
  protected readonly tag: DamageTag | undefined = undefined;

  protected get damage(): number {
    const st = this.ctx.stats;
    const tagMul = this.tag === 'melee' ? st.meleeMul : this.tag === 'explosive' ? st.explosiveMul : 1;
    return this.s.damage * st.damageMul * tagMul * (1 + this.bonus);
  }

  protected get interval(): number {
    const od = this.ctx.overdrive ? 1 / gameData.overdrive.fireRateMul : 1;
    return this.s.interval * this.ctx.stats.cooldownMul * od;
  }

  protected get area(): number {
    return this.s.area * this.ctx.stats.areaMul;
  }

  /** (x,y) 반경 r 안의 적에게 피해. 맞힌 수 반환. onHit은 맞힌 적마다 (죽었는지와 함께) 호출 */
  protected hitCircle(
    x: number,
    y: number,
    r: number,
    dmg: number,
    filter?: (e: Enemy) => boolean,
    onHit?: (e: Enemy, killed: boolean) => void,
  ): number {
    // query 결과 배열을 재사용하므로, onHit 안에서 다시 query해도 안전하도록 복사
    const near = this.ctx.grid.query(x, y, r + MAX_ENEMY_RADIUS, this.found).slice();
    let n = 0;
    for (const e of near) {
      if (!e.active) continue;
      const rr = r + e.radius;
      if ((e.x - x) ** 2 + (e.y - y) ** 2 > rr * rr) continue;
      if (filter && !filter(e)) continue;
      const killed = this.ctx.damage(e, dmg, this.tag);
      onHit?.(e, killed);
      n++;
    }
    return n;
  }

  /** 선분(x1,y1)-(x2,y2)에서 폭 w 안의 적에게 피해. 맞힌 적 목록 반환 */
  protected hitLine(x1: number, y1: number, x2: number, y2: number, w: number, dmg: number | ((e: Enemy, n: number) => number), onHit?: (e: Enemy, killed: boolean) => void): Enemy[] {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    const near = this.ctx.grid.query(mx, my, len / 2 + w + MAX_ENEMY_RADIUS, this.found).slice();
    const hit: Enemy[] = [];
    for (const e of near) {
      if (!e.active) continue;
      const t = (e.x - x1) * ux + (e.y - y1) * uy;
      if (t < -e.radius || t > len + e.radius) continue;
      const perp = Math.abs((e.x - x1) * uy - (e.y - y1) * ux);
      if (perp > w + e.radius) continue;
      hit.push(e);
    }
    hit.sort((a, b) => (a.x - x1) * ux + (a.y - y1) * uy - ((b.x - x1) * ux + (b.y - y1) * uy));
    for (let i = 0; i < hit.length; i++) {
      const e = hit[i];
      const killed = this.ctx.damage(e, typeof dmg === 'number' ? dmg : dmg(e, i), this.tag);
      onHit?.(e, killed);
      // 굴절 프리즘: 빔·와이어가 여기서 멈춘다
      if (e.id === 'c_prism') return hit.slice(0, i + 1);
    }
    return hit;
  }

  /** 가장 가까운 적 (range 안, 없으면 null) */
  protected nearest(x: number, y: number, range: number, skip?: Set<Enemy>): Enemy | null {
    let best: Enemy | null = null;
    let bd = range * range;
    for (const e of this.ctx.grid.query(x, y, range, this.found)) {
      if (!e.active || skip?.has(e)) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** 화면 안의 무작위 적 (없으면 null) */
  protected randomOnScreen(): Enemy | null {
    const list = this.ctx.enemies;
    for (let t = 0; t < 16 && list.length; t++) {
      const e = list[(Math.random() * list.length) | 0];
      if (e.active && this.ctx.onScreen(e.x, e.y)) return e;
    }
    return null;
  }

  /** 매 프레임 호출. ctx.fx는 프레임마다 지워지므로 이펙트는 여기서 다시 그린다 */
  abstract update(dt: number): void;
  destroy(): void {}
}
