import short from '../data/short.json';
import gameData from '../data/game.json';
import weaponsData from '../data/weapons.json';
import { ITEMS, PART_NAME, itemDisplayValues, itemText, type ItemKind } from '../systems/Build';
import { itemTags, weaponTags, combosWith } from '../systems/Loadout';
import build from '../data/build.json';
import { tagName, comboName, comboShort, tierShort } from './synergyText';
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
  /** 표시용 등급 (레벨업 강화 카드: 장착한 아이템의 등급을 보여 줌, 효과에는 쓰지 않음) */
  rarity?: Rarity;
  /** 추천: 고르면 이름 붙은 조합이 완성되거나 태그 시너지 단계가 오름 */
  rec?: { title: string; text: string; combo: boolean };
  /** 경고: 바꿔 끼우면 켜진 조합이 풀림 */
  warn?: string;
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
export const SLOT_EN: Record<string, string> = { primary: 'Primary', secondary: 'Secondary', neural: 'Neural', optic: 'Optic', skeletal: 'Skeletal', defense: 'Defense', tactical: 'Tactical' };
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
  /** 지금 장착한 아이템 id (무기 포함), 켜진 조합 이름 */
  equipped?: ReadonlySet<string>;
  activeCombos?: readonly string[];
  /** 빠질 아이템 id */
  curId?: string;
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
    ...recommend({ id: o.id, tags: out, equipped: o.equipped, activeCombos: o.activeCombos, curId: o.curId }),
  };
}

type TierDef = { count: number; text: string; params?: Record<string, number> };
const TIERS = build.tagTiers as unknown as Record<string, TierDef[]>;

/** 이 아이디가 들어오면 완성되는 조합 (짝을 이미 꼈고 아직 안 켜진 것), 빠지는 아이템 때문에 풀리는 조합 */
export function recommend(o: { id: string; tags: CardTag[]; equipped?: ReadonlySet<string>; activeCombos?: readonly string[]; curId?: string }): Pick<CardInfo, 'rec' | 'warn'> {
  const out: Pick<CardInfo, 'rec' | 'warn'> = {};
  const eq = o.equipped;
  const active = new Set(o.activeCombos ?? []);
  if (eq) {
    const after = new Set(eq);
    if (o.curId) after.delete(o.curId);
    after.add(o.id);
    const made = combosWith(o.id).find((c) => after.has(c.other) && !active.has(c.name));
    if (made) out.rec = { title: t('rec.combo', { name: comboName(made.name) }), text: comboShort(made.name, made.text), combo: true };
    // 빠지는 아이템이 켜진 조합의 한쪽이면 경고 (같은 조합을 이 아이템이 다시 채우면 제외)
    if (o.curId) {
      const lost = combosWith(o.curId).find((c) => active.has(c.name) && eq.has(c.other) && !combosWith(o.id).some((m) => m.name === c.name));
      if (lost) out.warn = t('rec.lost', { name: comboName(lost.name) });
    }
  }
  if (!out.rec) {
    // 가장 높이 오르는 태그 단계
    const up = o.tags.filter((g) => g.up).sort((a, b) => (b.up ?? 0) - (a.up ?? 0))[0];
    const def = up && TIERS[up.tag]?.find((d) => d.count === up.up);
    if (up && def) out.rec = { title: t('rec.tier', { tag: tagName(up.tag), n: up.up! }), text: tierShort(up.tag, up.up!, fill(def.text, def.params ?? {})), combo: false };
  }
  return out;
}

/** 레벨업 강화 카드 정보: 장착한 아이템의 등급·소켓·태그를 보여 줌 (레벨만 오르니 추천 없음) */
export function upgradeCard(o: { kind: ItemKind; id: string; rarity: Rarity; tags: string[]; lv: number; desc: string }): CardInfo {
  return {
    slot: slotName(o.kind, o.id),
    short: o.desc,
    tags: o.tags.map((tag) => ({ tag })),
    foot: { left: t('card.upgrade'), right: `Lv ${o.lv} → ${o.lv + 1}` },
    rarity: o.rarity,
  };
}
