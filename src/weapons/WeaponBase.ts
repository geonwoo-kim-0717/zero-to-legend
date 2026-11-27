import Phaser from 'phaser';
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
export type WeaponSlot = 'primary' | 'secondary';
const TS = gameData.twinStick;

/** 무기 소켓 종류 (주무기 / 보조무기) */
export function weaponSlot(id: WeaponId): WeaponSlot {
  return (weapons[id] as { slot?: WeaponSlot }).slot ?? 'primary';
}

export abstract class WeaponBase {
  level = 1;
  /** 희귀 이상 등급으로 얻은 추가 피해 비율 (누적) */
  bonus = 0;
  /** 개편 2단계: 이 무기 아이템의 등급 id */
  rarity = 'common';
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

  /** 주무기 / 보조무기 */
  get slot(): WeaponSlot {
    return weaponSlot(this.id);
  }

  // ── 트윈스틱 조준 ──
  /** 플레이어에서 조준점으로의 각도 */
  protected get aimAngle(): number {
    const p = this.ctx.player;
    return Math.atan2(this.ay - p.y, this.ax - p.x);
  }

  /** 이 무기의 조준점: 주무기는 조준점, 보조무기는 쓸 자리 */
  protected get ax(): number {
    return this.slot === 'secondary' ? this.ctx.aim.subX : this.ctx.aim.x;
  }
  protected get ay(): number {
    return this.slot === 'secondary' ? this.ctx.aim.subY : this.ctx.aim.y;
  }

  /** 조준점 (플레이어에서 max보다 멀면 그 방향으로 max까지) */
  protected aimPoint(max: number): { x: number; y: number } {
    const p = this.ctx.player;
    const dx = this.ax - p.x;
    const dy = this.ay - p.y;
    const d = Math.hypot(dx, dy);
    if (d <= max || d < 1) return { x: this.ax, y: this.ay };
    return { x: p.x + (dx / d) * max, y: p.y + (dy / d) * max };
  }

  // ── 켜짐 창 (드론·EMP처럼 상시 효과인 보조무기: 누르면 time초 켜지고 cooldown초 뒤 다시) ──
  private activeLeft = 0;
  private activeCd = 0;

  /** 켜짐 창 진행. 켜져 있으면 true */
  protected activeWindow(dt: number): boolean {
    const A = (weapons[this.id] as { active?: { time: number; cooldown: number; permanentAt?: number } }).active;
    if (!A) return true;
    // 무기 레벨 permanentAt 이상이면 재사용 대기 없이 늘 켜짐 (해킹 드론 8레벨)
    if (A.permanentAt && this.level >= A.permanentAt) {
      this.activeLeft = 1;
      this.activeCd = 0;
      return true;
    }
    this.activeLeft = Math.max(0, this.activeLeft - dt);
    this.activeCd = Math.max(0, this.activeCd - dt);
    if (this.activeLeft <= 0 && this.activeCd <= 0 && this.trigger) {
      this.fired();
      this.activeLeft = A.time;
      this.activeCd = A.time + A.cooldown * this.ctx.stats.cooldownMul * this.ctx.weaponMul(this.id).sub;
      this.ctx.sfx('select');
    }
    return this.activeLeft > 0;
  }

  /** 보조무기 준비 정도 0~1 (HUD 표시용). 켜짐 창 무기는 켜져 있으면 1 */
  readiness(): number {
    const A = (weapons[this.id] as { active?: { time: number; cooldown: number } }).active;
    if (A) {
      if (this.activeLeft > 0) return 1;
      const full = A.time + A.cooldown * this.ctx.stats.cooldownMul * this.ctx.weaponMul(this.id).sub;
      return 1 - this.activeCd / full;
    }
    const iv = this.interval || 1;
    return 1 - Math.max(0, Math.min(iv, this.timer)) / iv;
  }

  /** 켜짐 창 무기가 켜져 있는지 */
  get activeOn(): boolean {
    return this.activeLeft > 0;
  }

  /** 방아쇠: 주무기는 사거리 안에 적이 있는 동안(자동), 보조무기는 누른 신호가 남아 있을 때 */
  protected get trigger(): boolean {
    return this.slot === 'primary' ? this.ctx.aim.primary : this.ctx.aim.secondary;
  }

  /** 개수(탄·산탄·빔·베기·채찍·연쇄·유탄·미사일·지뢰·포탑·드론): 레벨 값 */
  protected get cnt(): number {
    return this.s.count;
  }

  /** 이 무기 전용 칩셋 값 (없으면 def) */
  protected wc(key: string, def = 0): number {
    return this.ctx.mod(`wchip.${this.id}`)?.[key] ?? def;
  }

  /** 재사용 대기를 s초 줄임 (택티컬 OS: 표식된 적 처치) */
  reduceCooldown(s: number): void {
    this.timer = Math.max(0, this.timer - s);
    this.activeCd = Math.max(0, this.activeCd - s);
  }

  /** 재사용 대기를 바로 끝냄 (돌격 산탄 조합: 대시하면 샷건 재장전) */
  resetCooldown(): void {
    this.timer = 0;
  }

  /** 발사했음: 보조무기는 누른 신호를 씀 */
  protected fired(): void {
    if (this.slot === 'secondary') this.ctx.consumeSecondary();
  }

  /** 조준선 근처(좌우 cone 라디안, range 안)에서 조준선에 가장 가까운 적 */
  protected aimTarget(range: number, cone = TS.aimCone, from?: { x: number; y: number }): Enemy | null {
    const o = from ?? this.ctx.player;
    const a0 = Math.atan2(this.ay - o.y, this.ax - o.x);
    let best: Enemy | null = null;
    let bs = Infinity;
    for (const e of this.ctx.grid.query(o.x, o.y, range, this.found)) {
      if (!e.active) continue;
      const d = Math.hypot(e.x - o.x, e.y - o.y);
      if (d > range) continue;
      const diff = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(e.y - o.y, e.x - o.x) - a0));
      if (diff > cone) continue;
      const score = diff * 200 + d * 0.3;
      if (score < bs) {
        bs = score;
        best = e;
      }
    }
    return best;
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
    return this.s.damage * st.damageMul * tagMul * (1 + this.bonus) * this.ctx.weaponMul(this.id).dmg;
  }

  protected get interval(): number {
    const od = 1 / this.ctx.odFireMul;
    // 트윈스틱: 주무기는 한 자루뿐이라 직접 쏘는 간격을 조금 짧게
    const tw = this.slot === 'primary' ? TS.primaryIntervalMul : 1;
    // 개편 2-2: 무기별 공격 속도(아드레날린·기계 3단계), 보조무기 재사용 대기(멀티태스킹 프로세서, 켜짐 창 무기는 activeWindow에서)
    const m = this.ctx.weaponMul(this.id);
    const active = !!(weapons[this.id] as { active?: unknown }).active;
    return this.s.interval * this.ctx.stats.cooldownMul * od * tw * m.cd * (this.slot === 'secondary' && !active ? m.sub : 1);
  }

  protected get area(): number {
    return this.s.area * this.ctx.stats.areaMul * this.ctx.weaponMul(this.id).area;
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

  /** 점 (x,y)에서 r 안의 가장 가까운 적 */
  protected nearestTo(pt: { x: number; y: number }, r: number): Enemy | null {
    return this.nearest(pt.x, pt.y, r);
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

  // ── 지속 피해(출혈·화상)와 남는 장판(불길·타는 선): 특수 능력이 함께 쓴다 ──
  private dots: { e: Enemy; t: number; dps: number; acc: number }[] = [];
  private zones: { x1: number; y1: number; x2: number; y2: number; r: number; t: number; dmg: number; acc: number; color: number }[] = [];

  /** 적에게 seconds 동안 초당 dps 피해 (이미 걸려 있으면 시간·세기 갱신) */
  protected addDot(e: Enemy, seconds: number, dps: number): void {
    const d = this.dots.find((o) => o.e === e);
    if (d) {
      d.t = Math.max(d.t, seconds);
      d.dps = Math.max(d.dps, dps);
    } else if (this.dots.length < 120) this.dots.push({ e, t: seconds, dps, acc: 0 });
  }

  /** 원(x2=x1) 또는 선 모양 장판: seconds 동안 0.4초마다 dmg */
  protected addZone(x1: number, y1: number, x2: number, y2: number, r: number, seconds: number, dmg: number, color: number): void {
    if (this.zones.length < 40) this.zones.push({ x1, y1, x2, y2, r, t: seconds, dmg, acc: 0.4, color });
  }

  /** 출혈·화상·장판을 진행 (쓰는 무기가 update에서 부름) */
  protected tickEffects(dt: number, dotColor: number): void {
    const fx = this.ctx.fx;
    for (const d of this.dots) {
      d.t -= dt;
      d.acc += dt;
      if (!d.e.active) d.t = 0;
      else if (d.acc >= 0.5) {
        d.acc -= 0.5;
        this.ctx.damage(d.e, d.dps * 0.5, this.tag);
        this.ctx.burst(d.e.x, d.e.y - 4, dotColor, 1);
      }
    }
    this.dots = this.dots.filter((d) => d.t > 0 && d.e.active);
    for (const z of this.zones) {
      z.t -= dt;
      z.acc += dt;
      const a = Math.min(1, z.t) * 0.35;
      if (z.x1 === z.x2 && z.y1 === z.y2) fx.fillStyle(z.color, a).fillCircle(z.x1, z.y1, z.r);
      else fx.lineStyle(z.r * 2, z.color, a).lineBetween(z.x1, z.y1, z.x2, z.y2);
      if (z.acc >= 0.4) {
        z.acc -= 0.4;
        if (z.x1 === z.x2 && z.y1 === z.y2) this.hitCircle(z.x1, z.y1, z.r, z.dmg);
        else this.hitLine(z.x1, z.y1, z.x2, z.y2, z.r, z.dmg);
      }
    }
    this.zones = this.zones.filter((z) => z.t > 0);
  }

  /** 매 프레임 호출. ctx.fx는 프레임마다 지워지므로 이펙트는 여기서 다시 그린다 */
  abstract update(dt: number): void;
  destroy(): void {}
}
