import syn from '../data/synergyShort.json';
import build from '../data/build.json';
import { I18n } from '../i18n';
import { CHIPSETS, chipText, chipValues } from '../systems/Chipsets';
import { displayNum, itemName } from '../systems/Build';

/** 화면용 태그·시너지·조합 글자 (짧게, 한국어·영어). 원문 데이터는 build.json */
type ComboDef = { name: string; nameEn?: string; needs: string[]; params?: Record<string, number> };
type TierDef = { count: number; params?: Record<string, number> };
const COMBOS = build.combos as unknown as Record<string, ComboDef>;
const TIERS = build.tagTiers as unknown as Record<string, TierDef[]>;
const S = syn as unknown as {
  tags: Record<string, string>;
  combos: Record<string, { en?: string; ko_s?: string; en_s?: string }>;
  tiers: Record<string, { ko?: string; en?: string }>;
};
const en = () => I18n.lang === 'en';
const fill = (text: string, v: Record<string, number> = {}) => text.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_m, k: string) => (k in v ? String(v[k]) : '?'));

/** 태그 이름 (영어판이면 영어) */
export function tagName(tag: string): string {
  return en() ? (S.tags[tag] ?? tag) : tag;
}

/** 조합 id (이름으로 찾기) */
export function comboId(name: string): string | undefined {
  // 영어판에서는 조합 이름이 nameEn으로 들어올 수 있어 둘 다 봄
  return Object.keys(COMBOS).find((k) => COMBOS[k].name === name || COMBOS[k].nameEn === name);
}

/** 조합 이름 (id 또는 한국어 이름) */
export function comboName(idOrName: string): string {
  const id = COMBOS[idOrName] ? idOrName : comboId(idOrName);
  if (!id) return idOrName;
  return en() ? (S.combos[id]?.en ?? COMBOS[id].name) : COMBOS[id].name;
}

/** 조합 효과 짧은 문장 */
export function comboShort(idOrName: string, fallback = ''): string {
  const id = COMBOS[idOrName] ? idOrName : comboId(idOrName);
  const s = id ? S.combos[id] : undefined;
  const text = en() ? s?.en_s : s?.ko_s;
  return text && id ? fill(text, COMBOS[id].params) : fallback;
}

/** 태그 단계 효과 짧은 문장 */
export function tierShort(tag: string, count: number, fallback = ''): string {
  const s = S.tiers[`${tag}:${count}`];
  const text = en() ? s?.en : s?.ko;
  const def = TIERS[tag]?.find((d) => d.count === count);
  return text ? fill(text, def?.params) : fallback;
}

type ChipText = { ko?: string; en?: string; ko_l?: string; en_l?: string };
const chipEntry = (id: string) => (syn as unknown as { chipsets?: Record<string, ChipText> }).chipsets?.[id];
const fillChip = (id: string, n: number, text: string) => {
  const v = chipValues(id, n);
  const weapon = CHIPSETS[id]?.weapon;
  return text.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_m, k: string) =>
    k === 'w' ? (weapon ? itemName('weapon', weapon) : '') : k in v ? String(displayNum(v[k])) : '?',
  );
};

/** 칩셋 카드 문장 (중첩 n일 때, 서술체). 없으면 한 줄 요약, 그것도 없으면 원문 chipText */
export function chipShort(id: string, n: number): string {
  const s = chipEntry(id);
  const text = en() ? s?.en_l : s?.ko_l;
  return text ? fillChip(id, n, text) : chipStat(id, n);
}

/** 칩셋 한 줄 요약 (장비창 목록용, 예: 피해 +8%) */
export function chipStat(id: string, n: number): string {
  const s = chipEntry(id);
  const text = en() ? s?.en : s?.ko;
  return text ? fillChip(id, n, text) : chipText(id, n);
}
