import meta from '../data/meta.json';

export type RunnerId = 'zero' | 'viper' | 'ghost' | 'nova';
export type SpecialId = keyof typeof meta.specials;
export type ClinicId = (typeof meta.clinic)[number]['id'];
export type Runner = (typeof meta.runners)[number];

/** 여러 판에 걸쳐 쌓이는 기록 (의뢰 보드·해금 조건에 쓰임) */
export interface LifetimeStats {
  runs: number;
  totalKills: number;
  droneKills: number;
  meleeKills: number;
  trooperKills: number;
  midbossKills: number;
  bossKills: number;
  hexKills: number;
  coreKills: number;
  marketBuys: number;
  totalTime: number;
  bestTime: number;
  bestLevel: number;
}
export type StatKey = keyof LifetimeStats;

export interface SaveData {
  version: 1;
  credits: number;
  clinic: Partial<Record<ClinicId, number>>;
  specials: SpecialId[];
  runner: RunnerId;
  /** 러너별로 장착한 특수 능력 */
  equipped: Partial<Record<RunnerId, SpecialId>>;
  claimed: string[];
  stats: LifetimeStats;
  /** 고른 히트 레벨과 해금된 최고 단계 (최종 클리어할 때마다 1씩) */
  heat: number;
  heatMax: number;
  /** 블랙마켓에서 산 무기 */
  market: string[];
  /** 산 무기 중 꺼 둔 것 (레벨업 카드에 나오지 않음) */
  marketOff: string[];
  /** 2챕터 첫 도달 때 픽서에게 받은 시공간 가속 모듈 (2배속) */
  speedUnlocked: boolean;
  /** 마지막으로 고른 배속 (켜 두면 다음 판도 2배속으로 시작) */
  speed2: boolean;
  /** 진이 문자로 소개해 준 적 (그림 키). 처음 만날 때 한 번만 안내 */
  seenUnits: string[];
  /** 첫 판 세 번째 레벨업의 확정 신화 카드를 이미 받았는지 */
  firstMythicDone: boolean;
}

/** 한 판에서 얻은 기록. 결과 화면에서 저장에 더한다 */
export interface RunStats {
  kills: number;
  droneKills: number;
  meleeKills: number;
  trooperKills: number;
  midbossKills: number;
  bossKills: number;
  hexKills: number;
  coreKills: number;
  time: number;
  level: number;
  /** 도달한 구역 (1~3) */
  zone: number;
}

const KEY = 'ztl-save-v1';

function fresh(): SaveData {
  return {
    version: 1,
    credits: 0,
    clinic: {},
    specials: ['neural'],
    runner: 'zero',
    equipped: {},
    claimed: [],
    heat: 0,
    heatMax: 0,
    market: [],
    marketOff: [],
    speedUnlocked: false,
    speed2: false,
    seenUnits: [],
    firstMythicDone: false,
    stats: { runs: 0, totalKills: 0, droneKills: 0, meleeKills: 0, trooperKills: 0, midbossKills: 0, bossKills: 0, hexKills: 0, coreKills: 0, marketBuys: 0, totalTime: 0, bestTime: 0, bestLevel: 0 },
  };
}

/** 저장 데이터를 기본값 위에 덮어써서, 항목이 늘어난 뒤에도 옛 저장을 읽을 수 있게 한다 */
function normalize(raw: unknown): SaveData {
  const d = fresh();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<SaveData>;
  return {
    ...d,
    ...r,
    version: 1,
    credits: Math.max(0, Math.floor(Number(r.credits) || 0)),
    clinic: { ...(r.clinic ?? {}) },
    specials: Array.from(new Set([...(r.specials ?? []), ...d.specials])).filter((s) => s in meta.specials) as SpecialId[],
    equipped: { ...(r.equipped ?? {}) },
    claimed: [...(r.claimed ?? [])],
    market: [...(r.market ?? [])],
    marketOff: [...(r.marketOff ?? [])],
    seenUnits: [...(r.seenUnits ?? [])],
    stats: { ...d.stats, ...(r.stats ?? {}) },
  };
}

function load(): SaveData {
  try {
    const s = localStorage.getItem(KEY);
    return s ? normalize(JSON.parse(s)) : fresh();
  } catch {
    return fresh();
  }
}

export const Save = {
  data: load(),

  write(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // 사생활 보호 모드 등에서 저장이 막히면 이번 접속 동안만 유지
    }
  },

  runner(id?: RunnerId): Runner {
    const k = id ?? this.data.runner;
    return meta.runners.find((r) => r.id === k) ?? meta.runners[0];
  },

  /** 해금 조건 진행도 0~1 (조건 없는 러너는 1) */
  unlockProgress(r: Runner): number {
    if (!r.unlock) return 1;
    return Math.min(1, this.data.stats[r.unlock.stat as StatKey] / r.unlock.goal);
  },

  isUnlocked(r: Runner): boolean {
    return this.unlockProgress(r) >= 1;
  },

  /** 이 러너가 들고 나갈 특수 능력 (장착한 것이 없거나 잃었으면 고유 능력) */
  special(rid?: RunnerId): SpecialId {
    const id = rid ?? this.data.runner;
    const eq = this.data.equipped[id];
    return eq && this.data.specials.includes(eq) ? eq : (this.runner(id).special as SpecialId);
  },

  clinicLevel(id: ClinicId): number {
    return this.data.clinic[id] ?? 0;
  },

  /** 리퍼닥 강화 총합 (예: dmg 3단계 → 15) */
  clinicValue(id: ClinicId): number {
    const c = meta.clinic.find((x) => x.id === id)!;
    return this.clinicLevel(id) * c.per;
  },

  spend(cost: number): boolean {
    if (this.data.credits < cost) return false;
    this.data.credits -= cost;
    this.write();
    return true;
  },

  /** 판 결과를 누적 기록에 더하고, 새로 해금된 러너 이름을 돌려준다 */
  commitRun(run: RunStats, credits: number, victory = false): string[] {
    const before = meta.runners.filter((r) => !this.isUnlocked(r)).map((r) => r.id);
    const s = this.data.stats;
    s.runs++;
    s.totalKills += run.kills;
    s.droneKills += run.droneKills;
    s.meleeKills += run.meleeKills;
    s.trooperKills += run.trooperKills;
    s.midbossKills += run.midbossKills;
    s.bossKills += run.bossKills;
    s.hexKills += run.hexKills;
    s.coreKills += run.coreKills;
    // 지금 단계로 최종 클리어하면 다음 히트 레벨 해금
    if (victory && this.data.heat >= this.data.heatMax && this.data.heatMax < meta.heat.max) this.data.heatMax++;
    s.totalTime += Math.floor(run.time);
    s.bestTime = Math.max(s.bestTime, Math.floor(run.time));
    s.bestLevel = Math.max(s.bestLevel, run.level);
    this.data.credits += credits;
    this.write();
    return meta.runners.filter((r) => before.includes(r.id) && this.isUnlocked(r)).map((r) => r.name);
  },

  /** 의뢰 보드: 달성했지만 보상을 아직 받지 않은 의뢰 수 */
  claimable(): number {
    return meta.contracts.filter((c) => !this.data.claimed.includes(c.id) && this.data.stats[c.stat as StatKey] >= c.goal).length;
  },

  claim(id: string): boolean {
    const c = meta.contracts.find((x) => x.id === id);
    if (!c || this.data.claimed.includes(id) || this.data.stats[c.stat as StatKey] < c.goal) return false;
    this.data.claimed.push(id);
    this.data.credits += c.reward;
    this.write();
    return true;
  },

  /** 다른 브라우저로 옮길 때 쓰는 저장 코드 */
  exportCode(): string {
    return btoa(unescape(encodeURIComponent(JSON.stringify(this.data))));
  },

  importCode(code: string): boolean {
    try {
      this.data = normalize(JSON.parse(decodeURIComponent(escape(atob(code.trim())))));
      this.write();
      return true;
    } catch {
      return false;
    }
  },

  reset(): void {
    this.data = fresh();
    this.write();
  },
};
