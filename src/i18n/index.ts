import { STRINGS, type StringKey } from './strings';
import weapons from '../data/weapons.json';
import passives from '../data/passives.json';
import abilities from '../data/abilities.json';
import enemies from '../data/enemies.json';
import meta from '../data/meta.json';
import zones from '../data/zones.json';
import game from '../data/game.json';
import en from '../data/en.json';

export type Lang = 'ko' | 'en';
const KEY = 'ztl-lang';

/** 영어판으로 덮어쓰는 데이터. 한국어로 돌아갈 때를 위해 원래 값을 따로 둔다 */
const DATA: Record<string, unknown> = { weapons, passives, abilities, enemies, meta, zones, game };
const original: Record<string, unknown> = {};

type Node = Record<string, unknown>;
function apply(target: Node, overlay: Node, backup: Node, toEn: boolean): void {
  for (const [k, v] of Object.entries(overlay)) {
    if (!(k in target)) continue;
    if (typeof v === 'string') {
      if (!(k in backup)) backup[k] = target[k];
      target[k] = toEn ? v : backup[k];
    } else if (v && typeof v === 'object') {
      backup[k] ??= {};
      apply(target[k] as Node, v as Node, backup[k] as Node, toEn);
    }
  }
}

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'ko' || saved === 'en') return saved;
  } catch {
    /* 저장소를 못 쓰는 환경 */
  }
  // 저장된 설정이 없으면 브라우저 언어: 한국어면 한국어, 그 외는 영어
  return (navigator.language || '').toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

let lang: Lang = 'ko';

export const I18n = {
  get lang(): Lang {
    return lang;
  },

  init(): void {
    this.set(detect(), false);
  },

  set(l: Lang, save = true): void {
    lang = l;
    for (const [name, data] of Object.entries(DATA)) {
      const ov = (en as Record<string, Node>)[name];
      if (!ov) continue;
      original[name] ??= {};
      apply(data as Node, ov, original[name] as Node, l === 'en');
    }
    document.documentElement.lang = l;
    // 세로 화면 안내 (index.html)
    const rot = document.getElementById('rotate');
    if (rot) rot.innerHTML = `<div class="icon"></div><div>${t('rotate.title')}</div><small>${t('rotate.sub')}</small>`;
    if (save) {
      try {
        localStorage.setItem(KEY, l);
      } catch {
        /* 무시 */
      }
    }
  },

  toggle(): Lang {
    this.set(lang === 'ko' ? 'en' : 'ko');
    return lang;
  },
};

/** 화면 문구. 예: t('result.ad', { n: 120 }) */
export function t(key: StringKey, vars: Record<string, string | number> = {}): string {
  let s: string = STRINGS[lang][key] ?? STRINGS.ko[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
