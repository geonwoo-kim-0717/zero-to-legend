import Phaser from 'phaser';
import passives from '../data/passives.json';
import weapons from '../data/weapons.json';
import abilities from '../data/abilities.json';
import gameData from '../data/game.json';
import { WEAPON_IDS, WeaponBase, type WeaponId } from '../weapons';
import { WEAPON_MAX_LEVEL, type AbilityTier } from '../weapons/WeaponBase';
import type { Stats } from '../weapons/types';
import { t } from '../i18n';

export type PassiveId = keyof typeof passives;
export type Rarity = (typeof gameData.rarity)[number];
export const PASSIVE_IDS = Object.keys(passives) as PassiveId[];

export interface PassiveState {
  level: number;
  /** 등급 배율이 반영된 누적 수치 */
  total: number;
  /** 전설·신화로 특수 능력을 받았는지 */
  special: boolean;
  /** 받은 특수 능력 id (전설 1개·신화 1개까지) */
  abilities?: string[];
  /** 공격 속도 사이버웨어: 고를 때마다 곱해진 배율 (곱연산) */
  speedMul?: number;
}

export interface Ability {
  id: string;
  name: string;
  desc: string;
}

export interface Choice {
  kind: 'weapon' | 'passive' | 'overflow';
  id: string;
  rarity: Rarity;
  title: string;
  levelLabel: string;
  /** 아직 없는 무기·사이버웨어 (신규) */
  isNew?: boolean;
  /** 최대 레벨인데 특수 능력만 받는 카드 (레벨은 오르지 않음) */
  maxed?: boolean;
  desc: string;
  ability?: Ability;
}

/** 공격 간격이 원래의 25%보다 짧아지지는 않게 (공격 속도 4배까지) */
const MIN_COOLDOWN_MUL = 0.25;

const rarityById = (id: string) => gameData.rarity.find((r) => r.id === id)!;

/** 자기 수집기 신화 '행운 회로': 영웅 이상 카드 확률 2배 */
let luck = false;

function rollRarity(forced?: string): Rarity {
  if (forced) return rarityById(forced);
  const wt = (r: Rarity) => r.weight * (luck && (r.id === 'epic' || r.ability) ? 1.5 : 1);
  const total = gameData.rarity.reduce((s, r) => s + wt(r), 0);
  let n = Math.random() * total;
  for (const r of gameData.rarity) {
    n -= wt(r);
    if (n < 0) return r;
  }
  return gameData.rarity[0];
}

export function passiveAmount(id: PassiveId, rarity: Rarity): number {
  return Math.round(passives[id].amount * rarity.mul);
}

/** 이 항목이 해당 등급의 특수 능력을 아직 받을 수 있는지 */
function abilityFor(c: { kind: string; id: string }, tier: string, owned: WeaponBase[], ownedPassives: Map<PassiveId, PassiveState>): Ability | undefined {
  if (c.kind === 'weapon') {
    const id = c.id as WeaponId;
    const list = WeaponBase.availableAbilities(id, tier as AbilityTier, owned.find((o) => o.id === id));
    return list.length ? Phaser.Utils.Array.GetRandom(list) : undefined;
  }
  const id = c.id as PassiveId;
  const list = passiveAbilities(id, tier as AbilityTier, ownedPassives.get(id));
  return list.length ? Phaser.Utils.Array.GetRandom(list) : undefined;
}

/** 사이버웨어가 이 등급에서 아직 받을 수 있는 특수 능력 (등급당 1개까지) */
export function passiveAbilities(id: PassiveId, tier: AbilityTier, st?: PassiveState): Ability[] {
  const list = abilities.passives[id][tier] as Ability[];
  if (st?.abilities?.some((a) => list.some((x) => x.id === a))) return [];
  return list;
}

/** 사이버웨어 특수 능력 정의 찾기 */
export function passiveAbility(id: PassiveId, abilityId: string): Ability | undefined {
  const l = abilities.passives[id];
  return ([...l.legendary, ...l.mythic] as Ability[]).find((a) => a.id === abilityId);
}

/**
 * 레벨업 때 보여줄 선택지 3개를 뽑는다.
 * mode: 'boss'면 보스 보상 — 모든 카드가 전설 또는 신화. 그 외 문자열은 디버그용 등급 고정.
 */
export function rollChoices(
  owned: WeaponBase[],
  ownedPassives: Map<PassiveId, PassiveState>,
  mode?: string,
  opts: { guaranteeWeapon?: boolean; pool?: readonly WeaponId[]; luck?: boolean } = {},
): Choice[] {
  luck = !!opts.luck;
  const forcedRarity = mode === 'boss' ? undefined : mode;
  const pool: Omit<Choice, 'rarity' | 'desc'>[] = [];
  for (const id of WEAPON_IDS) {
    if (opts.pool && !opts.pool.includes(id)) continue;
    const w = owned.find((o) => o.id === id);
    if (w && w.level < WEAPON_MAX_LEVEL) pool.push({ kind: 'weapon', id, title: w.name, levelLabel: `Lv.${w.level + 1}` });
    else if (!w && owned.length < gameData.maxWeapons) pool.push({ kind: 'weapon', id, title: weapons[id].name, levelLabel: t('lvl.new'), isNew: true });
  }
  for (const id of PASSIVE_IDS) {
    const st = ownedPassives.get(id);
    if (st && st.level < passives[id].maxLevel) pool.push({ kind: 'passive', id, title: passives[id].name, levelLabel: `Lv.${st.level + 1}` });
    else if (!st && ownedPassives.size < gameData.maxPassives) pool.push({ kind: 'passive', id, title: passives[id].name, levelLabel: t('lvl.new'), isNew: true });
  }

  if (mode === 'boss') {
    // 보스 보상: 전설·신화 중 하나를 등장 확률 비율대로 정하고, 그 능력을 받을 수 있는 항목만 고른다
    const leg = rarityById('legendary');
    const myth = rarityById('mythic');
    const out: Choice[] = [];
    for (const c of Phaser.Utils.Array.Shuffle(pool)) {
      if (out.length >= 3) break;
      const first = Math.random() * (leg.weight + myth.weight) < myth.weight ? myth : leg;
      const second = first === myth ? leg : myth;
      let rarity = first;
      let ability = abilityFor(c, first.id, owned, ownedPassives);
      if (!ability) {
        rarity = second;
        ability = abilityFor(c, second.id, owned, ownedPassives);
      }
      if (!ability) continue;
      out.push({ ...c, rarity, ability, desc: describe(c, rarity, owned) });
    }
    // 보스 보상: 최대 레벨이라 카드 풀에 없는 무기·사이버웨어도 특수 능력 후보에 넣는다
    while (out.length < 3) {
      const m = maxedAbilityCard(owned, ownedPassives, opts.pool, true, out.map((o) => o.id));
      if (!m) break;
      out.push(m);
    }
    if (out.length > 0) return out;
    // 받을 수 있는 특수 능력이 하나도 없으면 일반 레벨업으로 대체
  }

  const picks = Phaser.Utils.Array.Shuffle(pool).slice(0, 3);
  // 초반 무기 확정: 무기가 적을 때는 새 무기 카드가 최소 한 장 나오게
  const isNewWeapon = (c: (typeof pool)[number]) => c.kind === 'weapon' && !!c.isNew;
  if (opts.guaranteeWeapon && !picks.some(isNewWeapon)) {
    const nw = pool.filter((c) => isNewWeapon(c) && !picks.includes(c));
    if (nw.length) {
      if (picks.length < 3) picks.push(nw[0]);
      else picks[Math.floor(Math.random() * picks.length)] = Phaser.Utils.Array.GetRandom(nw);
    }
  }
  const out: Choice[] = picks.map((c) => {
    let rarity = rollRarity(forcedRarity);
    let ability: Ability | undefined;

    // 전설·신화: 받을 수 있는 특수 능력이 없으면 영웅으로 내림
    if (rarity.ability) {
      ability = abilityFor(c, rarity.id, owned, ownedPassives);
      if (!ability) rarity = rarityById('epic');
    }
    return { ...c, rarity, desc: describe(c, rarity, owned), ability };
  });
  // 최대 레벨이어도 전설·신화 능력이 비어 있으면 가끔 특수 능력 카드로 나온다
  const maxed = maxedAbilityCard(owned, ownedPassives, opts.pool);
  if (maxed) {
    if (out.length < 3) out.push(maxed);
    else out[Math.floor(Math.random() * out.length)] = maxed;
  }
  // 올릴 것이 3개보다 적으면 반복해서 고를 수 있는 작은 강화로 채운다
  const left = Phaser.Utils.Array.Shuffle(gameData.overflow.slice());
  while (out.length < 3 && left.length) {
    const o = left.pop()!;
    out.push({ kind: 'overflow', id: o.id, rarity: gameData.rarity[0], title: o.name, levelLabel: t('lvl.overflow'), desc: o.desc.replace('{v}', String(o.amount)) });
  }
  return out;
}

/** 튜토리얼: 정해진 무기의 정해진 특수 능력 카드 (이미 가졌거나 무기 칸이 꽉 찼으면 없음) */
export function abilityCard(owned: WeaponBase[], id: WeaponId, tier: AbilityTier, abilityId: string): Choice | undefined {
  const rarity = rarityById(tier);
  const w = owned.find((o) => o.id === id);
  if (!w && owned.length >= gameData.maxWeapons) return undefined;
  const ability = WeaponBase.availableAbilities(id, tier, w).find((a) => a.id === abilityId) as Ability | undefined;
  if (!ability) return undefined;
  const maxed = !!w && w.level >= WEAPON_MAX_LEVEL;
  const c = { kind: 'weapon' as const, id, title: w ? w.name : weapons[id].name, levelLabel: maxed ? 'MAX' : w ? `Lv.${w.level + 1}` : t('lvl.new'), isNew: !w, maxed: maxed || undefined };
  return { ...c, rarity, ability, desc: maxed ? t('lvl.maxed') : describe(c, rarity, owned) };
}

/** 최대 레벨 무기·사이버웨어 중 특수 능력이 비어 있는 것 하나를 확률로 전설·신화 카드로 만든다 */
function maxedAbilityCard(owned: WeaponBase[], ownedPassives: Map<PassiveId, PassiveState>, pool?: readonly WeaponId[], force = false, skip: string[] = []): Choice | undefined {
  if (!force && Math.random() >= gameData.maxedAbilityChance) return undefined;
  const leg = rarityById('legendary');
  const myth = rarityById('mythic');
  const cands: { kind: 'weapon' | 'passive'; id: string; title: string }[] = [];
  for (const w of owned) if (w.level >= WEAPON_MAX_LEVEL && (!pool || pool.includes(w.id))) cands.push({ kind: 'weapon', id: w.id, title: w.name });
  for (const [id, st] of ownedPassives) if (st.level >= passives[id].maxLevel && (st.abilities?.length ?? 0) < 2) cands.push({ kind: 'passive', id, title: passives[id].name });
  for (const c of Phaser.Utils.Array.Shuffle(cands)) {
    if (skip.includes(c.id)) continue;
    const first = Math.random() * (leg.weight + myth.weight) < myth.weight ? myth : leg;
    for (const rarity of [first, first === myth ? leg : myth]) {
      const ability = abilityFor(c, rarity.id, owned, ownedPassives);
      if (ability) return { ...c, rarity, ability, maxed: true, levelLabel: 'MAX', desc: t('lvl.maxed') };
    }
  }
  return undefined;
}

function describe(c: { kind: string; id: string }, rarity: Rarity, owned: WeaponBase[]): string {
  if (c.kind === 'weapon') {
    const id = c.id as WeaponId;
    const w = owned.find((o) => o.id === id);
    let desc = w ? WeaponBase.levelDesc(id, w.level + 1) : weapons[id].desc;
    if (rarity.weaponBonus > 0) desc += t('lvl.bonus', { v: Math.round(rarity.weaponBonus * 100) });
    return desc;
  }
  const id = c.id as PassiveId;
  return passives[id].desc.replace('{v}', String(passiveAmount(id, rarity)));
}

/** overflow: 작은 강화 카드로 쌓인 수치 (id → 합계) */
export function computeStats(ps: Map<PassiveId, PassiveState>, overflow: Record<string, number> = {}): Stats {
  const t = (id: PassiveId) => ps.get(id)?.total ?? 0;
  const o = (id: string) => overflow[id] ?? 0;
  // 공격 속도는 곱연산: 카드마다 (1 + x%)를 곱하고, 공격 간격은 그 역수
  const speed = (ps.get('neural')?.speedMul ?? 1) * (overflow.cdMul ?? 1);
  return {
    damageMul: 1 + (t('muscle') + o('dmg')) / 100,
    cooldownMul: Math.max(MIN_COOLDOWN_MUL, 1 / speed),
    areaMul: 1,
    pickupMul: 1 + (t('magnet') + o('pick')) / 100,
    maxHpBonus: t('dermal') + o('hp'),
    moveMul: 1 + o('spd') / 100,
    meleeMul: 1,
    explosiveMul: 1,
  };
}
