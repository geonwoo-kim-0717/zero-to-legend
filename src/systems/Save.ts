import meta from '../data/meta.json';
import osData from '../data/os.json';
import weaponsData from '../data/weapons.json';
import { clearDevOsPick } from './Os';

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
  /** 첫 판 세 번째 레벨업의 확정 신화 카드를 이미 받았는지 (예전 튜토리얼, 지금은 쓰지 않음) */
  firstMythicDone: boolean;
  /** 첫 판 튜토리얼 카드: 4번째 레벨업 집속탄, 3분 뒤 연쇄 폭발 */
  tutCluster: boolean;
  tutChain: boolean;
  /** 아지트 튜토리얼 단계: 0 시작 전 · 1 모노와이어 구매 대기 · 2 시뮬레이션 칩 구매 대기 · 3 광전사 칩 제안까지 끝 */
  tut: number;
  /** 리퍼닥이 모노와이어 값을 채워 줬는지 */
  tutTopup: boolean;
  /** 첫 판 뒤 크레딧이 넉넉했는지(1,800 이상): 진·리퍼닥 대사가 달라진다 */
  tutRich: boolean;
  /** 첫 귀환 튜토리얼 끝에 진이 두 번째 출격을 재촉했는지 */
  tutGo: boolean;
  /** 광전사 칩을 산 뒤 도크 9에서 장착하기를 기다리는 중 */
  tutEquip: boolean;
  /** 마지막 판: 도달한 챕터(0부터)와 최종 클리어 여부 — 다음 판 시작 대사·첫 귀환 대사가 달라진다 */
  lastZone: number;
  lastWin: boolean;
  /** 리더보드: 닉네임, 이 기기의 익명 ID, 이 기기 최고 기록 */
  nickname?: string;
  playerId?: string;
  best?: { id: string; name: string; score: number; zone: number; time: number; kills: number; runner: string; heat: number; cleared: boolean } | null;
  /** 처음 아지트에 왔을 때 리퍼닥 소개를 봤는지 */
  introDone: boolean;
  /** 개편 4단계: OS 뽑기로 모은 개수 (개수로 레벨이 정해짐), 판에 들고 나갈 OS */
  osCopies: Record<string, number>;
  os: string;
  /** OS 뽑기 횟수 (기록) */
  osPulls: number;
  /** 도크9 무기고: 산 무기(영구), 판 시작 주무기·보조무기 */
  armory: string[];
  startPrimary: string;
  startSecondary: string;
}

const ARMORY = (meta as unknown as { armory: { price: number; free: string[] } }).armory;
const WEAPON_SLOT = Object.fromEntries(Object.entries(weaponsData as Record<string, { slot: string }>).map(([k, v]) => [k, v.slot])) as Record<string, 'primary' | 'secondary'>;

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

/** 개편판은 지금 게임과 저장을 따로 씀 (같은 주소라 저장소가 같아서 이름으로 나눔) */
const KEY = 'ztl-save-redesign-v1';

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
    tutCluster: false,
    tutChain: false,
    tut: 0,
    tutTopup: false,
    tutRich: false,
    tutGo: false,
    tutEquip: false,
    lastZone: 0,
    lastWin: false,
    // 개편판: 예전 아지트 튜토리얼(블랙마켓·특수 능력 구매)은 건너뜀
    introDone: true,
    osCopies: { [osData.gacha.basicOs]: 1 },
    os: osData.gacha.basicOs,
    osPulls: 0,
    armory: [...ARMORY.free],
    startPrimary: ARMORY.free.find((id) => WEAPON_SLOT[id] === 'primary') ?? 'smartPistol',
    startSecondary: ARMORY.free.find((id) => WEAPON_SLOT[id] === 'secondary') ?? 'plasmaGrenade',
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
    osCopies: { ...d.osCopies, ...(r.osCopies ?? {}) },
    os: typeof r.os === 'string' && r.os in osData.os ? r.os : d.os,
    armory: Array.from(new Set([...d.armory, ...(r.armory ?? [])])).filter((id) => id in WEAPON_SLOT),
    startPrimary: WEAPON_SLOT[r.startPrimary ?? ''] === 'primary' && (r.armory ?? []).concat(d.armory).includes(r.startPrimary!) ? r.startPrimary! : d.startPrimary,
    startSecondary: WEAPON_SLOT[r.startSecondary ?? ''] === 'secondary' && (r.armory ?? []).concat(d.armory).includes(r.startSecondary!) ? r.startSecondary! : d.startSecondary,
    tut: 3,
    tutGo: true,
    tutEquip: false,
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

  // ───── 개편 4단계: OS 뽑기 ─────
  /** OS 레벨: 모은 개수로 정해짐 (레벨마다 새로 필요한 개수 gacha.copies = 1,2,4,8,12 → 누적 1,3,7,15,27). 기본 OS는 1 */
  osLevel(id: string): number {
    const def = (osData.os as Record<string, { basic?: boolean; levels: unknown[] }>)[id];
    if (!def) return 0;
    if (def.basic) return 1;
    const n = this.data.osCopies[id] ?? 0;
    let need = 0;
    let lv = 0;
    for (const c of osData.gacha.copies) {
      need += c;
      if (n >= need) lv++;
      else break;
    }
    return Math.min(lv, def.levels.length);
  },

  /** 다음 레벨까지: 지금 개수, 다음 레벨에 필요한 누적 개수 (최대면 null) */
  osNext(id: string): { have: number; need: number } | null {
    const lv = this.osLevel(id);
    const cps = osData.gacha.copies;
    if (lv >= cps.length) return null;
    return { have: this.data.osCopies[id] ?? 0, need: cps.slice(0, lv + 1).reduce((a, b) => a + b, 0) };
  },

  /** 뽑기 n회 (1 또는 10). 크레딧이 모자라면 null. 최대 레벨 OS가 또 나오면 refund 크레딧 */
  pullOs(n: 1 | 10): { id: string; before: number; after: number; refund: number }[] | null {
    const G = osData.gacha;
    const cost = n === 10 ? G.tenPrice : G.price;
    if (!this.spend(cost)) return null;
    const w = G.weights as Record<string, number>;
    const pool = Object.keys(w).filter((id) => (osData.os as Record<string, { enabled?: boolean }>)[id]?.enabled !== false);
    const total = pool.reduce((a, id) => a + w[id], 0);
    const out: { id: string; before: number; after: number; refund: number }[] = [];
    for (let i = 0; i < n; i++) {
      let r = Math.random() * total;
      let id = pool[pool.length - 1];
      for (const p of pool) {
        r -= w[p];
        if (r < 0) {
          id = p;
          break;
        }
      }
      const before = this.osLevel(id);
      let refund = 0;
      if (this.osNext(id) === null) {
        refund = G.refund;
        this.data.credits += refund;
      } else this.data.osCopies[id] = (this.data.osCopies[id] ?? 0) + 1;
      out.push({ id, before, after: this.osLevel(id), refund });
    }
    this.data.osPulls += n;
    this.write();
    return out;
  },

  /** 무기고: 이 무기를 샀는지 (기본 무기는 처음부터) */
  weaponOwned(id: string): boolean {
    return this.data.armory.includes(id);
  },

  /** 무기고 값 (크레딧) */
  weaponPrice(): number {
    return ARMORY.price;
  },

  /** 무기고에서 무기 사기 (영구). 크레딧이 모자라거나 이미 있으면 false */
  buyWeapon(id: string): boolean {
    if (!(id in WEAPON_SLOT) || this.weaponOwned(id) || this.data.credits < ARMORY.price) return false;
    this.data.credits -= ARMORY.price;
    this.data.armory.push(id);
    this.write();
    return true;
  },

  /** 판 시작 무기 고르기 (산 무기만, 슬롯은 무기에 따라 주무기·보조무기 자리로) */
  setStartWeapon(id: string): boolean {
    if (!this.weaponOwned(id)) return false;
    if (WEAPON_SLOT[id] === 'primary') this.data.startPrimary = id;
    else this.data.startSecondary = id;
    this.write();
    return true;
  },

  /** 판에 들고 나갈 OS (해금한 것만) */
  equipOs(id: string): boolean {
    if (this.osLevel(id) <= 0) return false;
    this.data.os = id;
    clearDevOsPick();
    this.write();
    return true;
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
    this.data.lastZone = Math.max(0, (run.zone ?? 1) - 1);
    this.data.lastWin = victory;
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
    // 리더보드 신원(닉네임·기기 ID)은 남긴다: 서버의 내 기록과 이어지게
    const { nickname, playerId } = this.data;
    this.data = { ...fresh(), nickname, playerId };
    this.write();
  },
};
