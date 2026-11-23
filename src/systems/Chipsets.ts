import build from '../data/build.json';
import { I18n } from '../i18n';
import { displayNum } from './Build';

/**
 * 칩셋: 레벨업 카드·판 안 블랙마켓에서 나옴. 칸 제한 없이 쌓이고, 같은 칩셋을 또 고르면 중첩 +1.
 * 값 = base + per × (중첩 - 1). 능력치(stat)·특수 효과(special) 두 종류.
 * 값·문구는 OS 설계실 편집 페이지 '칩셋' 탭에서 옮긴 build.json chipsets
 */
export interface ChipsetDef {
  name: string;
  nameEn?: string;
  kind: 'stat' | 'special';
  text: string;
  params?: Record<string, { base: number; per: number }>;
  hook: string;
  weight?: number;
  price?: number;
  enabled?: boolean;
}

export const CHIPSETS = ((build as unknown as { chipsets?: Record<string, ChipsetDef> }).chipsets ?? {}) as Record<string, ChipsetDef>;
export const CHIPSET_IDS = Object.keys(CHIPSETS).filter((id) => CHIPSETS[id].enabled !== false);

/** 중첩 n일 때 값 */
export function chipValues(id: string, n: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, p] of Object.entries(CHIPSETS[id]?.params ?? {})) out[k] = Math.round((p.base + p.per * (n - 1)) * 100) / 100;
  return out;
}

/** 중첩 n일 때 문구 (표시용 반올림) */
export function chipText(id: string, n: number): string {
  const v = chipValues(id, n);
  return (CHIPSETS[id]?.text ?? '').replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_m, k: string) => (k in v ? String(displayNum(v[k])) : '?'));
}

export function chipName(id: string): string {
  const c = CHIPSETS[id];
  return (I18n.lang === 'en' && c?.nameEn) || c?.name || id;
}

/** 가중치대로 서로 다른 칩셋 n개 */
export function rollChipsets(n: number): string[] {
  const pool = [...CHIPSET_IDS];
  const out: string[] = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((s, id) => s + (CHIPSETS[id].weight ?? 1), 0);
    let r = Math.random() * total;
    let i = pool.length - 1;
    for (let k = 0; k < pool.length; k++) {
      r -= CHIPSETS[pool[k]].weight ?? 1;
      if (r < 0) {
        i = k;
        break;
      }
    }
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}
