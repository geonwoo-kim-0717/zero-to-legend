import build from '../data/build.json';
import { ITEMS, itemValues } from './Build';

/**
 * 개편 2단계 (2-2): 장착한 것 전체(무기 2 + 사이버웨어 3 + 장비 2)에서 효과를 모은다.
 * - 사이버웨어·장비: 아이템 hook(cyber.*, gear.*) → 값 (소켓 레벨·아이템 등급)
 * - 태그 단계: 장착한 것들의 태그 수(같은 아이템은 1번)가 2·3·4 이상이면 그 단계 hook(syn.*) 켜짐 (아래 단계도 같이)
 * - 조합 시너지: needs에 적힌 아이템을 모두 끼면 hook(combo.*) 켜짐
 * 값·문구는 OS 설계실 편집 페이지에서 옮긴 build.json
 */

export interface Sock {
  id: string;
  rarity: string;
  level: number;
}

export const SOCKET_PARTS = ['neural', 'optic', 'skeletal', 'defense', 'tactical'] as const;
export type SocketPart = (typeof SOCKET_PARTS)[number];

interface TierDef {
  count: number;
  hook: string;
  params?: Record<string, number>;
  text: string;
}
interface ComboDef {
  name: string;
  needs: string[];
  text: string;
  params?: Record<string, number>;
  hook: string;
  enabled?: boolean;
}
const TIERS = build.tagTiers as unknown as Record<string, TierDef[]>;
const COMBOS = build.combos as unknown as Record<string, ComboDef>;
const WEAPON_TAGS = build.weaponTags as Record<string, string[]>;
const ABILITY_TAGS = build.abilityTags as Record<string, Record<string, string[]>>;

const fill = (text: string, v: Record<string, number> = {}) => text.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_m, k: string) => (k in v ? String(v[k]) : '?'));

/** 무기 태그 (기본 태그 + 고른 능력이 더한 태그) */
export function weaponTags(id: string, abilities: Iterable<string> = []): string[] {
  const s = new Set(WEAPON_TAGS[id] ?? []);
  for (const a of abilities) for (const t of ABILITY_TAGS[id]?.[a] ?? []) s.add(t);
  return [...s];
}

export function itemTags(id: string): string[] {
  return ITEMS[id]?.tags ?? [];
}

export interface ActiveTier {
  tag: string;
  count: number;
  hook: string;
  text: string;
}
export interface ActiveCombo {
  id: string;
  name: string;
  hook: string;
  text: string;
}

export class Loadout {
  /** 켜진 효과: hook → 값 */
  readonly mods = new Map<string, Record<string, number>>();
  /** 태그 → 그 태그를 가진 장착 아이템 수 */
  readonly tagCount = new Map<string, number>();
  readonly tiers: ActiveTier[] = [];
  readonly combos: ActiveCombo[] = [];

  constructor(weapons: { id: string; abilities: Iterable<string> }[], sockets: Map<string, Sock>) {
    const ids = new Set<string>();
    const addTags = (tags: string[]) => {
      for (const t of new Set(tags)) this.tagCount.set(t, (this.tagCount.get(t) ?? 0) + 1);
    };
    for (const w of weapons) {
      ids.add(w.id);
      addTags(weaponTags(w.id, w.abilities));
    }
    for (const s of sockets.values()) {
      const it = ITEMS[s.id];
      if (!it) continue;
      ids.add(s.id);
      addTags(it.tags ?? []);
      if (it.hook) this.mods.set(it.hook, itemValues(s.id, s.level, s.rarity));
    }
    for (const [tag, tiers] of Object.entries(TIERS)) {
      const n = this.tagCount.get(tag) ?? 0;
      for (const t of tiers) {
        if (n < t.count) continue;
        this.mods.set(t.hook, { ...(t.params ?? {}) });
        this.tiers.push({ tag, count: t.count, hook: t.hook, text: fill(t.text, t.params) });
      }
    }
    for (const [id, c] of Object.entries(COMBOS)) {
      if (c.enabled === false || !c.needs.every((n) => ids.has(n))) continue;
      this.mods.set(c.hook, { ...(c.params ?? {}) });
      this.combos.push({ id, name: c.name, hook: c.hook, text: fill(c.text, c.params) });
    }
  }

  has(hook: string): boolean {
    return this.mods.has(hook);
  }

  get(hook: string): Record<string, number> | undefined {
    return this.mods.get(hook);
  }

  /** 값 하나 (없으면 def) */
  v(hook: string, key = 'v', def = 0): number {
    return this.mods.get(hook)?.[key] ?? def;
  }
}

/** 조합 시너지 정의 (카드에 '함께 끼면' 안내) */
export function combosWith(id: string): { name: string; other: string; text: string }[] {
  const out: { name: string; other: string; text: string }[] = [];
  for (const c of Object.values(COMBOS)) {
    if (c.enabled === false || !c.needs.includes(id)) continue;
    for (const o of c.needs) if (o !== id) out.push({ name: c.name, other: o, text: fill(c.text, c.params) });
  }
  return out;
}
