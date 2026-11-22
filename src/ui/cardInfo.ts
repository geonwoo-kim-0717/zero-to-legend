import short from '../data/short.json';
import gameData from '../data/game.json';
import weaponsData from '../data/weapons.json';
import { ITEMS, PART_NAME, itemDisplayValues, itemText, type ItemKind } from '../systems/Build';
import { itemTags, weaponTags } from '../systems/Loadout';
import type { Rarity } from '../systems/Progression';
import { I18n, t } from '../i18n';

/** 카드 아래 칩에 보이는 태그. up: 이 카드를 고르면 그 태그 수가 이만큼이 됨 (시너지 단계가 오를 때만) */
export interface CardTag {
  tag: string;
  up?: number;
}

/** 선택 카드에 그릴 정리된 정보 (없으면 LevelUpUI가 desc를 그대로 씀) */
export interface CardInfo {
  /** 소켓 칩: 주무기·보조무기·신경·안구… */
  slot: string;
  /** 한두 줄 설명 */
  short: string;
  tags: CardTag[];
  /** 맨 아래 줄: 왼쪽(⇄ 교체 대상 / + 빈 소켓), 오른쪽(Lv) */
  foot?: { left: string; right?: string };
  /** 별 줄 (전설·신화 능력 안내) */
  star?: string;
}

const SHORT = short as unknown as Record<string, { ko?: string; en?: string }>;

const fill = (text: string, v: Record<string, number>) => text.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_m, k: string) => (k in v ? String(v[k]) : '?'));

/** 카드용 짧은 설명. 없으면 null */
export function shortText(id: string, lv: number, rarity: string): string | null {
  const s = SHORT[id];
  const text = I18n.lang === 'en' ? s?.en : s?.ko;
  if (!text) return null;
  return ITEMS[id] ? fill(text, itemDisplayValues(id, lv, rarity)) : text;
}

/** 소켓 칩 글자 */
const SLOT_EN: Record<string, string> = { primary: 'Primary', secondary: 'Secondary', neural: 'Neural', optic: 'Optic', skeletal: 'Skeletal', defense: 'Defense', tactical: 'Tactical' };
export function slotName(kind: ItemKind, id: string): string {
  const en = I18n.lang === 'en';
  if (kind === 'weapon') {
    const slot = (weaponsData as Record<string, { slot: string }>)[id]?.slot === 'primary' ? 'primary' : 'secondary';
    return en ? SLOT_EN[slot] : slot === 'primary' ? '주무기' : '보조무기';
  }
  const part = ITEMS[id]?.part ?? '';
  return en ? (SLOT_EN[part] ?? part) : (PART_NAME[part] ?? part);
}

/** 시너지 단계가 오르는 개수 (2·3·4, 신화 각성 5) */
const STEPS = [2, 3, 4, gameData.mythicAwaken];

/**
 * 보급 상자 아이템 카드 정보.
 * tagCount: 지금 장착 전체의 태그 수, cur: 같은 소켓에 끼워져 있어 빠질 아이템(이름·태그)
 */
export function itemCard(o: {
  kind: ItemKind;
  id: string;
  rarity: Rarity;
  lv: number;
  cur: { name: string; tags: string[] } | null;
  tagCount: ReadonlyMap<string, number>;
}): CardInfo {
  const tags = o.kind === 'weapon' ? weaponTags(o.id) : itemTags(o.id);
  const curTags = new Set(o.cur?.tags ?? []);
  const out: CardTag[] = tags.map((tag) => {
    const now = o.tagCount.get(tag) ?? 0;
    const next = now - (curTags.has(tag) ? 1 : 0) + 1;
    const up = next > now && STEPS.includes(next);
    return up ? { tag, up: next } : { tag };
  });
  const r = o.rarity;
  let star: string | undefined;
  if (o.kind === 'weapon' && r.ability) {
    star = t('card.pick', { tier: r.label });
    if (r.id === 'mythic') star += `\n${t('card.awaken', { n: gameData.mythicAwaken })}`;
  }
  return {
    slot: slotName(o.kind, o.id),
    short: shortText(o.id, o.lv, r.id) ?? (o.kind === 'weapon' ? ((weaponsData as Record<string, { desc: string }>)[o.id]?.desc ?? '') : itemText(o.id, o.lv, r.id)),
    tags: out,
    foot: { left: o.cur ? `⇄ ${o.cur.name}` : t('card.empty'), right: `Lv ${o.lv}` },
    star,
  };
}
