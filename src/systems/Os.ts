import osData from '../data/os.json';
import { I18n } from '../i18n';

/**
 * 개편 2-3: OS (Q 능력). OS 설계실 편집 페이지에서 옮긴 os.json
 * - OS 레벨 1~5: 레벨마다 능력 1줄씩 켜짐. 줄의 값(params)은 앞 줄 값을 덮어씀 (예: 4줄 '완전 오버클럭'이 공격속도·지속을 올림)
 * - active: Q 충전(chargeKills명 처치로 가득), 최소 재사용 대기(minCooldown초). 없으면(표준 OS) 상시 효과만
 * - 판 밖 해금·뽑기(4단계) 전까지 레벨은 개발자 도구(?debug)로 정함
 */

export interface OsLine {
  hook: string;
  params?: Record<string, number>;
  text: string;
}
export interface OsDef {
  name: string;
  nameEn?: string;
  label: string;
  color: string;
  tags: string[];
  active: { chargeKills: number; minCooldown: number } | null;
  levels: OsLine[];
  basic?: boolean;
  enabled?: boolean;
}

export const OS_DEFS = osData.os as unknown as Record<string, OsDef>;
export const OS_IDS = Object.keys(OS_DEFS).filter((id) => OS_DEFS[id].enabled !== false);
export const OS_GACHA = osData.gacha;

const fill = (text: string, v: Record<string, number>) => text.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_m, k: string) => (k in v ? String(v[k]) : '?'));

export class OsState {
  readonly def: OsDef;
  readonly level: number;
  /** 켜진 줄들의 값을 순서대로 합친 것 (뒤 줄이 앞 줄 값을 덮어씀) */
  readonly p: Record<string, number> = {};
  private readonly hooks = new Set<string>();

  constructor(
    readonly id: string,
    level: number,
  ) {
    this.def = OS_DEFS[id] ?? OS_DEFS[OS_GACHA.basicOs];
    this.level = Math.max(1, Math.min(this.def.levels.length, Math.round(level)));
    for (const line of this.def.levels.slice(0, this.level)) {
      this.hooks.add(line.hook);
      Object.assign(this.p, line.params ?? {});
    }
  }

  /** 이 줄(hook)이 켜졌는지 */
  has(hook: string): boolean {
    return this.hooks.has(hook);
  }

  v(key: string, def = 0): number {
    return this.p[key] ?? def;
  }

  get name(): string {
    return I18n.lang === 'en' && this.def.nameEn ? this.def.nameEn : this.def.name;
  }

  /** Q로 쓰는 능력이 있는지 (표준 OS는 없음) */
  get hasActive(): boolean {
    return !!this.def.active;
  }

  /** 레벨별 줄 문구 (켜짐 여부와 함께) */
  lines(): { text: string; on: boolean }[] {
    return this.def.levels.map((l, i) => ({ text: fill(l.text, l.params ?? {}), on: i < this.level }));
  }
}

/** 개발자 도구용 OS 선택 저장 (판 밖 뽑기가 생기기 전 임시) */
const DEV_KEY = 'ztl-os-dev';
export function devOsPick(): { id: string; level: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(DEV_KEY) ?? 'null') as { id: string; level: number } | null;
    return v && OS_DEFS[v.id] ? v : null;
  } catch {
    return null;
  }
}
export function saveDevOsPick(id: string, level: number): void {
  try {
    localStorage.setItem(DEV_KEY, JSON.stringify({ id, level }));
  } catch {
    // 저장이 막혀 있으면 이번 판에서만
  }
}
