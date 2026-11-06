import Phaser from 'phaser';
import passives from '../data/passives.json';
import weapons from '../data/weapons.json';
import abilities from '../data/abilities.json';
import gameData from '../data/game.json';
import { WEAPON_IDS, WeaponBase, type WeaponId } from '../weapons';
import { WEAPON_MAX_LEVEL, type AbilityTier } from '../weapons/WeaponBase';
import type { Stats } from '../weapons/types';

export type PassiveId = keyof typeof passives;
export type Rarity = (typeof gameData.rarity)[number];
export const PASSIVE_IDS = Object.keys(passives) as PassiveId[];

export interface PassiveState {
  level: number;
  /** 등급 배율이 반영된 누적 수치 */
  total: number;
  /** 전설·신화로 특수 능력을 받았는지 */
  special: boolean;
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
  desc: string;
  ability?: Ability;
}

const rarityById = (id: string) => gameData.rarity.find((r) => r.id === id)!;

function rollRarity(forced?: string): Rarity {
  if (forced) return rarityById(forced);
  const total = gameData.rarity.reduce((s, r) => s + r.weight, 0);
  let n = Math.random() * total;
  for (const r of gameData.rarity) {
    n -= r.weight;
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
  return ownedPassives.get(id)?.special ? undefined : abilities.passives[id];
}

/**
 * 레벨업 때 보여줄 선택지 3개를 뽑는다.
 * mode: 'boss'면 보스 보상 — 모든 카드가 전설 또는 신화. 그 외 문자열은 디버그용 등급 고정.
 */
export function rollChoices(
  owned: WeaponBase[],
  ownedPassives: Map<PassiveId, PassiveState>,
  mode?: string,
  opts: { guaranteeWeapon?: boolean; pool?: readonly WeaponId[] } = {},
): Choice[] {
  const forcedRarity = mode === 'boss' ? undefined : mode;
  const pool: Omit<Choice, 'rarity' | 'desc'>[] = [];
  for (const id of WEAPON_IDS) {
    if (opts.pool && !opts.pool.includes(id)) continue;
    const w = owned.find((o) => o.id === id);
    if (w && w.level < WEAPON_MAX_LEVEL) pool.push({ kind: 'weapon', id, title: w.name, levelLabel: `Lv.${w.level + 1}` });
    else if (!w && owned.length < gameData.maxWeapons) pool.push({ kind: 'weapon', id, title: weapons[id].name, levelLabel: '신규' });
  }
  for (const id of PASSIVE_IDS) {
    const st = ownedPassives.get(id);
    if (st && st.level < passives[id].maxLevel) pool.push({ kind: 'passive', id, title: passives[id].name, levelLabel: `Lv.${st.level + 1}` });
    else if (!st && ownedPassives.size < gameData.maxPassives) pool.push({ kind: 'passive', id, title: passives[id].name, levelLabel: '신규' });
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
    if (out.length > 0) return out;
    // 받을 수 있는 특수 능력이 하나도 없으면 일반 레벨업으로 대체
  }

  const picks = Phaser.Utils.Array.Shuffle(pool).slice(0, 3);
  // 초반 무기 확정: 무기가 적을 때는 새 무기 카드가 최소 한 장 나오게
  const isNewWeapon = (c: (typeof pool)[number]) => c.kind === 'weapon' && c.levelLabel === '신규';
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
  // 올릴 것이 3개보다 적으면 반복해서 고를 수 있는 작은 강화로 채운다
  const left = Phaser.Utils.Array.Shuffle(gameData.overflow.slice());
  while (out.length < 3 && left.length) {
    const o = left.pop()!;
    out.push({ kind: 'overflow', id: o.id, rarity: gameData.rarity[0], title: o.name, levelLabel: '강화', desc: o.desc.replace('{v}', String(o.amount)) });
  }
  return out;
}

function describe(c: { kind: string; id: string }, rarity: Rarity, owned: WeaponBase[]): string {
  if (c.kind === 'weapon') {
    const id = c.id as WeaponId;
    const w = owned.find((o) => o.id === id);
    let desc = w ? WeaponBase.levelDesc(id, w.level + 1) : weapons[id].desc;
    if (rarity.weaponBonus > 0) desc += `\n+ 피해 보너스 ${Math.round(rarity.weaponBonus * 100)}%`;
    return desc;
  }
  const id = c.id as PassiveId;
  return passives[id].desc.replace('{v}', String(passiveAmount(id, rarity)));
}

/** overflow: 작은 강화 카드로 쌓인 수치 (id → 합계) */
export function computeStats(ps: Map<PassiveId, PassiveState>, overflow: Record<string, number> = {}): Stats {
  const t = (id: PassiveId) => ps.get(id)?.total ?? 0;
  const o = (id: string) => overflow[id] ?? 0;
  return {
    damageMul: 1 + (t('muscle') + o('dmg')) / 100,
    cooldownMul: Math.max(0.4, 1 - (t('neural') + o('cd')) / 100),
    areaMul: 1,
    pickupMul: 1 + (t('magnet') + o('pick')) / 100,
    maxHpBonus: t('dermal') + o('hp'),
    moveMul: 1 + o('spd') / 100,
    meleeMul: 1,
    explosiveMul: 1,
  };
}
