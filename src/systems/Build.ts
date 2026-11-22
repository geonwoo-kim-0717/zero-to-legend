import Phaser from 'phaser';
import build from '../data/build.json';
import weapons from '../data/weapons.json';
import abilities from '../data/abilities.json';
import gameData from '../data/game.json';
import { WEAPON_IDS, type WeaponId } from '../weapons';
import { weaponSlot } from '../weapons/WeaponBase';
import type { PassiveId, Rarity } from './Progression';
import { I18n } from '../i18n';

/**
 * 개편 2단계: 장비칸(소켓)과 아이템.
 * - 소켓: 주무기·보조무기(무기), 사이버웨어 3(신경·안구·골격), 장비 2(방어·전술), OS 1
 * - 레벨은 소켓에 붙음(레벨업 카드로 올림). 아이템을 바꿔 끼워도 소켓 레벨은 그대로
 * - 아이템은 등급(일반~신화)을 가짐: 무기는 피해 보너스 + 전설·신화 능력(얻을 때 고름), 사이버웨어·장비는 값 배율
 * 값·문구는 OS 설계실 편집 페이지에서 옮긴 build.json
 */

export type ItemKind = 'weapon' | 'cyber' | 'gear';
export type CyberPart = 'neural' | 'optic' | 'skeletal';
export type GearPart = 'defense' | 'tactical';

interface ItemDef {
  kind: string;
  part: string;
  name: string;
  nameEn?: string;
  tags?: string[];
  text: string;
  params?: Record<string, { base: number; perLv: number }>;
  rarityKeys?: string[];
  maxLevel?: number;
  enabled?: boolean;
  hook?: string;
}
export const ITEMS = build.items as unknown as Record<string, ItemDef>;
export const CYBER_PARTS: CyberPart[] = ['neural', 'optic', 'skeletal'];
export const PART_NAME: Record<string, string> = { neural: '신경', optic: '안구', skeletal: '골격', defense: '방어', tactical: '전술' };

/**
 * 2-1에서 효과가 이미 있는 사이버웨어 (기존 패시브와 같은 효과). 나머지는 2-2에서 효과를 붙이며 열림
 * 사이버웨어 아이템 id → 기존 패시브 id
 */
export const CYBER_TO_PASSIVE: Record<string, PassiveId> = { n_accel: 'neural', s_muscle: 'muscle', s_dermal: 'dermal', o_collector: 'magnet' };
export const PASSIVE_TO_CYBER: Record<string, string> = Object.fromEntries(Object.entries(CYBER_TO_PASSIVE).map(([a, b]) => [b, a]));

const rarities = gameData.rarity as Rarity[];
export const rarityById = (id: string): Rarity => rarities.find((r) => r.id === id) ?? rarities[0];

/** 아이템 값: 소켓 레벨 lv, 아이템 등급 → {이름: 값} */
export function itemValues(id: string, lv: number, rarity: string): Record<string, number> {
  const it = ITEMS[id];
  const out: Record<string, number> = {};
  if (!it) return out;
  const mul = rarityById(rarity).mul;
  for (const [k, p] of Object.entries(it.params ?? {})) {
    let v = p.base + p.perLv * (lv - 1);
    if ((it.rarityKeys ?? ['v']).includes(k)) v *= mul;
    out[k] = Math.round(v * 100) / 100;
  }
  return out;
}

/** 아이템 문구에 값을 채움 */
export function itemText(id: string, lv: number, rarity: string): string {
  const it = ITEMS[id];
  if (!it) return '';
  const v = itemValues(id, lv, rarity);
  return it.text.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_m, k: string) => (k in v ? String(v[k]) : '?'));
}

export interface ItemRoll {
  kind: ItemKind;
  id: string;
  rarity: Rarity;
}

/** 등급 굴리기 (min 이상만) */
export function rollItemRarity(min?: string): Rarity {
  const minIdx = min ? rarities.findIndex((r) => r.id === min) : 0;
  const pool = rarities.slice(Math.max(0, minIdx));
  const total = pool.reduce((s, r) => s + r.weight, 0);
  let n = Math.random() * total;
  for (const r of pool) {
    n -= r.weight;
    if (n < 0) return r;
  }
  return pool[0];
}

/** 지금 2-1에서 고를 수 있는 아이템 (효과가 있는 것): 무기 12 + 사이버웨어 4 */
function itemPool(): { kind: ItemKind; id: string }[] {
  const out: { kind: ItemKind; id: string }[] = WEAPON_IDS.map((id) => ({ kind: 'weapon' as const, id }));
  for (const id of Object.keys(CYBER_TO_PASSIVE)) if (ITEMS[id]?.enabled !== false) out.push({ kind: 'cyber', id });
  return out;
}

/** 보급 상자: 서로 다른 아이템 n개. equipped에 있는 아이템(같은 id)은 빼고, minRarity 이상 */
export function rollItems(n: number, equipped: Set<string>, minRarity?: string): ItemRoll[] {
  const pool = Phaser.Utils.Array.Shuffle(itemPool().filter((p) => !equipped.has(p.id)));
  return pool.slice(0, n).map((p) => ({ ...p, rarity: rollItemRarity(minRarity) }));
}

export function itemName(kind: ItemKind, id: string): string {
  if (kind === 'weapon') return weapons[id as WeaponId].name;
  const it = ITEMS[id];
  return (I18n.lang === 'en' && it?.nameEn) || it?.name || id;
}

/** 아이템 카드의 소켓 이름 (예: 주무기, 신경 사이버웨어) */
export function socketLabel(kind: ItemKind, id: string): string {
  if (kind === 'weapon') return weaponSlot(id as WeaponId) === 'primary' ? '주무기' : '보조무기';
  const part = ITEMS[id]?.part ?? '';
  return `${PART_NAME[part] ?? part} ${kind === 'cyber' ? '사이버웨어' : '장비'}`;
}

/** 무기의 전설·신화 능력 목록 */
export function weaponAbilities(id: WeaponId, tier: 'legendary' | 'mythic'): { id: string; name: string; desc: string }[] {
  return abilities.weapons[id][tier];
}

/** 능력이 더해 주는 태그 */
export function abilityTags(weapon: string, ability: string): string[] {
  return ((build.abilityTags as Record<string, Record<string, string[]>>)[weapon]?.[ability]) ?? [];
}
