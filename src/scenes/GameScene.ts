import Phaser from 'phaser';
import { BASE_TEXT, setupCamera } from '../ui/text';
import { VIEW_W, VIEW_H, PLAYER, GRID_CELL, COLORS, MAX_ENEMY_RADIUS, ZOOM } from '../config';
import gameData from '../data/game.json';
import passivesData from '../data/passives.json';
import abilitiesData from '../data/abilities.json';
import weaponsData from '../data/weapons.json';
import enemiesData from '../data/enemies.json';
import { Player } from '../entities/Player';
import { Enemy, BOSS_SCALE, type EnemyId } from '../entities/Enemy';
import { Projectile, type BulletOpts } from '../entities/Projectile';
import { Pickup, type PickupKind } from '../entities/Pickup';
import { EnemyBullet } from '../entities/EnemyBullet';
import { Pool } from '../systems/Pool';
import { SpatialGrid } from '../systems/SpatialGrid';
import { Spawner, hpScaleAt } from '../systems/Spawner';
import { pickBoss, pickBasili, pickGregor, pickXm4, type BossAct, type BasiliAct, type GregorAct, type Xm4Act } from '../systems/BossBrain';
import { InputController, type SubUse } from '../systems/InputController';
import { createWeapon, WEAPON_IDS, type WeaponBase, type WeaponId } from '../weapons';
import { weaponSlot } from '../weapons/WeaponBase';
import { rollItems, itemName, itemText, socketLabel, weaponAbilities, ITEMS, rarityById, itemArt, PART_NAME, abilityTags, type ItemKind, type ItemRoll } from '../systems/Build';
import { Loadout, weaponTags, itemTags, combosWith, type Sock } from '../systems/Loadout';
import { OsState, OS_IDS, OS_DEFS, devOsPick, saveDevOsPick } from '../systems/Os';
import { tagName, tierShort, comboName, comboShort } from '../ui/synergyText';
import { CHIPSETS, chipName, chipText, rollChipsets } from '../systems/Chipsets';
import type { GameContext, Stats, DamageTag, FxOpts } from '../weapons/types';
import meta from '../data/meta.json';
import zonesData from '../data/zones.json';
import midbossAnim from '../data/midboss_anim.json';
import bossAnim from '../data/boss_anim.json';
import boss2Anim from '../data/boss2_anim.json';
import wavesData from '../data/waves.json';
import type { Wave } from '../systems/Spawner';
import { Save, type Runner, type RunnerId, type RunStats } from '../systems/Save';
import { rollChoices, abilityCard, computeStats, passiveAmount, passiveAbility, type Choice, type PassiveId, type PassiveState, type SocketCard } from '../systems/Progression';
import { LevelUpUI } from '../ui/LevelUpUI';
import { itemCard, shortText, upgradeCard, recommend } from '../ui/cardInfo';
import { StationUI } from '../ui/StationUI';
import { makeChipArt, chipArt, CHIP_COLOR } from '../ui/ChipArt';
import { makeCrateArt } from '../ui/CrateArt';
import { chipShort } from '../ui/synergyText';
import { drawStall, drawMarker } from '../ui/StationMarks';
import { buildEquipPanel } from '../ui/EquipPanel';
import { Hud } from '../ui/Hud';
import { Sound, type SfxKey, type MusicKey } from '../systems/Sound';
import { addMuteToggle, addFxToggle, addDmgToggle, addIntroToggle, addFullscreenToggle } from '../ui/MuteToggle';
import { isTouch } from '../systems/Fullscreen';
import { Settings } from '../systems/Settings';
import { Ads } from '../systems/Ads';
import type { RunResult } from './ResultScene';
import { t as tr, I18n } from '../i18n';
import { pickAct, roleOf, type Role } from '../systems/SquadBrain';
import { RANGED, type DirSense } from '../systems/Director';
import visorAnchors from '../data/visor_anchors.json';

/** 아군이 된 적 빛깔 (사이코시스 광폭화는 빨간빛) */
const CHARM_TINT = 0xff2bd6;
const PSYCHO_TINT = 0xff4a5a;
/** 띄우기 칩셋: 가장 높이 떴을 때 높이 (px) */
const AIR_LIFT = 26;
/** 기계 5단계 작은 드론: 사격 간격(초), 사거리, 한 발 피해 */
const MINI_DRONE = { gap: 0.5, range: 180, damage: 12 };
/** 공격 상태가 없는 접촉형 적: 플레이어에게 붙으면 공격 그림 */
const CONTACT_POSE = new Set<string>(['trooper_tank', 'thug', 'sec_bot', 'drone', 'rat_bot']);

type State = 'play' | 'levelup' | 'paused' | 'over' | 'dialog' | 'carry';
/** 이번 판에 얻은 전설·신화 능력 (챕터 이월 후보) */
type Keep = { kind: 'weapon' | 'passive'; id: string; abilityId: string; rarity: string };
const CT = gameData.counters;
type Zone = (typeof zonesData.zones)[number];
type Line = { who: string; text: string };
/** 플레이어를 때린 것 (게임오버 화면의 사인 표시용) */
type HitSrc = { kind: 'contact' | 'boss' | 'bullet' | 'missile' | 'blast' | 'laser' | 'thorn'; id: string };
type Volley = { volleyEvery: number; volleyCount: number; bulletSpeed: number; bulletDamage: number };
const ZONES = zonesData.zones;
const ZR = gameData.zoneRules;
/** 왼쪽 위 체력바 폭 */
type BossPhase = 'walk' | 'aim' | 'charge' | 'leap' | 'air' | 'slam' | 'enter' | 'taunt' | 'hookAim' | 'hookFly' | 'hookPull' | 'hookGap' | 'hookBack' | 'walkIn' | 'phaseShift' | 'gatling' | 'call' | 'stomp' | 'stompRec' | 'drop' | 'sweepAim' | 'sweep' | 'mgAim' | 'mg' | 'plasma' | 'missileFire' | 'rise' | 'lower' | 'deploy';
/** 블랙 실드 요원 공격 그림·이펙트 (아트 tools/art/sprites2026/scripts/troopers6/keys/atk_meta.json) */
const TROOPER_ATK = {
  tank: { ms: [90, 110, 140, 70, 90, 120, 110, 100], size: [54, 48], fxStart: 4, anchor: [47, 27], fx: 'fx_shield_bash', fxN: 8, fxSize: [64, 40], pivot: [32, 18] },
  melee: { ms: [90, 110, 140, 60, 80, 120, 110, 100], size: [48, 42], fxStart: 3, anchor: [22, 41], fx: 'fx_baton_slash', fxN: 10, fxSize: [136, 104], pivot: [44, 92] },
  hacker: { ms: [100, 120, 160, 80, 110, 160, 120, 100], size: [48, 42], fxStart: 4, anchor: [37, 13], fx: 'fx_hack_pulse', fxN: 10, fxSize: [64, 48], pivot: [20, 24] },
  sniper: { ms: [100, 140, 200, 70, 90, 110, 140, 140], size: [48, 42], fxStart: 3, anchor: [39, 45], fx: 'fx_sniper_muzzle', fxN: 23, fxSize: [96, 72], pivot: [44, 66] },
} as const;
/** 진압대 강하: 떨어지는 시간, 대원 사이 간격, 착지 충격 컷 유지 시간 (그동안 무적) */
const DROP = { fall: 0.45, stagger: 0.12, land: 0.7 };
/** 블랙 실드 이송기가 착지 지점 위로 떠 있는 높이 (그림 112x55 기준) */
const SHIP_LIFT = 44;
type BossDef = (typeof gameData.bosses)[number];
/** 점프 내리찍기 (game.json bosses[].slam) */
type SlamDef = { minDist: number; leap: number; air: number; airSwing: number; recover: number; height: number; radius: number; damage: number; knock: number; leapFrames: number[]; airFrames: number[]; airRise: number; swingFrames: number[]; landFrames: number[] };
/** 등장 연출 (game.json bosses[].entrance): 화면 위에서 적이 몰린 곳으로 떨어져 졸개를 처치하고 한마디 */
/** 보스 착지 예고 원의 불투명도 배율 (game.json bossMarkAlpha) */
const MARK_A = (gameData as { bossMarkAlpha?: number }).bossMarkAlpha ?? 1;
/** 이송기 엔진 기울기 프레임 (dropship_tilt_00 정지 ~ _05 전진), 프레임당 시간(ms) */
const SHIP_TILT_N = 5;
const SHIP_TILT_MS = 80;
type EntranceDef = { minDist: number; fall: number; height: number; radius: number; taunt: number; holdLast: number; line: string };
/** 갈고리 (game.json bosses[].hook): 중간 거리에서 예고선 → 갈고리 발사 → 맞으면 끌어와 틈 뒤 내리찍기, 빗나가면 감아들임 */
type HookDef = { hitMul?: number; lockBefore?: number; minDist: number; maxDist: number; aim: number; range: number; speed: number; damage: number; pullTime: number; pullTo: number; gap: number; backSpeed: number; throwTime: number; throwFrames: number[]; pullFrames: number[] };
/** 바실리 패턴 (game.json bosses[].basili) */
type BasiliDef = {
  walkIn: { speed: number; step: number };
  phaseShift: number;
  gatling: { spin: number; time: number; rate: number; fan: number; turn: number; speed: number; damage: number; life: number };
  call: { gesture: number; id: string; count: number; radius: number; orbit: number };
  stomp: { lift: number; radius: number; time: number; band: number; damage: number };
  p2: { gatlingRate: number; gatlingSpeed: number; guards: number; stompRings: number; ringGap: number };
  glow: { from: string; color: string; core: string; x: number; y: number; size: number; alpha: number };
  /** 동작별 프레임 그림 재생 (boss_walk/gatling/slam_NN, 프레임 정보는 boss_anim.json) */
  anim: { walkFps: number; ready: number; windupFps: number; fireFps: number; flashTime: number; kickTime: number; stompRecover: number; footY: number; recoil: number; shadow: { w: number; h: number; alpha: number }; flash: { size: number; color: string }; reflect: { color: string; alpha: number }; squash: number };
};
/** 바실리 동작 중 조준 그림(_aim)을 쓰는 단계 (새 그림이 오기 전 임시) */
const BASILI_AIM = new Set(['gatling', 'call', 'stomp', 'stompRec', 'phaseShift', 'drop', 'sweepAim', 'sweep', 'mgAim', 'mg', 'plasma', 'missileFire']);
/** 그레고르 패턴 (game.json bosses[].gregor) */
/** XM-4 패턴 (game.json bosses[].xm4) */
type Xm4Def = {
  turn: number;
  mg: { aim: number; burst: number; interval: number; fan: number; speed: number; damage: number; life: number };
  plasma: { shots: number; warn: number; fly: number; gap: number; radius: number; radiusY: number; damage: number; spreadNext: number };
  missileTime: number;
  missileTurn: number;
  riseFps: number;
  quickFps: number;
  rotateTurn: number;
  footOff: number;
  hitShake: number;
  walkInSpeed: number;
  p2: { plasmaShots: number; plasmaWarn: number; missileCount: number };
};
type GregorDef = { drop: { count: number; countRage: number; spread: number; warn: number; radius: number; damage: number; height: number; stagger: number }; sweep: { angle: number; range: number; aim: number; swing: number; damage: number; knock: number } };
/** 보스 클로즈업 연출 (game.json bosses[].cine): 등장·2페이즈 대사(문구 키), 확대 배율, 대사 한 줄 시간, 말풍선 높이 */
type CineDef = { intro?: string[]; p2?: string[]; zoom: number; lineTime: number; lift: number; standFrame?: number };
/** 분노 (game.json bosses[].enrage) */
type EnrageDef = { at: number; mul: number; tint: string };
/** 보스 동작별 프레임 설정 (game.json bosses[].anim) */
type BossAnim = { walkFps: number; scale: number; motionScale: Record<string, number>; footY: number; chargeWind: number[]; chargeFlash: number; chargeRun: number[]; chargeFlashTime: number };
/** 아트가 주는 보스 동작별 프레임 정보 (프레임 수·캔버스 크기·허리 위치) */
const BOSS_ANIM: Record<string, Record<string, { frames: number; w: number; h: number; originX: number; originY: number }>> = { midboss: midbossAnim, boss: bossAnim as never };
/** 그림 한 장 안의 점 목록 (프레임별 [x,y], 없으면 null) */
type FramePts = (number[] | null)[];
type SwingDef = { range: number; reach: number; windup: number; recover: number; cd: number; damageMul: number };
type MeleeDef = { range: number; interval: number; windup: number; lungeTime: number; lungeSpeed: number; swing?: SwingDef };
type Phase2 = { at: number; chargeCount: number; aimTime: number; chargeTime: number; chargeSpeed: number; volleyEvery: number; volleyCount: number; bulletSpeed: number; bulletDamage: number };
const OD = gameData.overdrive;
const SP = meta.specials;
const TEXT = { ...BASE_TEXT, fontSize: '12px', color: '#e8f7ff' };
/** 이름 뒤 조사: 받침이 있으면 a(이), 없으면 b(가). 한글이 아니면 b */
function josa(name: string, a: string, b: string): string {
  const c = name.charCodeAt(name.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return b;
  return (c - 0xac00) % 28 ? a : b;
}

/** AI 점수 표시 모드: 요원 행동 점수·스폰 디렉터 값을 화면에 띄운다 (주소에 ?ai, 또는 VITE_AI_SHOW=1 빌드) */
const AI_SHOW = import.meta.env.VITE_AI_SHOW === '1' || new URLSearchParams(location.search).has('ai');
/** 개발자 도구 버튼(배속·무적·보스 소환 등): AI 표시 모드 또는 주소에 ?debug */
const DEV_TOOLS = new URLSearchParams(location.search).has('debug');

/** 개편 3단계: 판 안 상점·리퍼닥 노점 */
interface Station {
  kind: 'shop' | 'ripper';
  x: number;
  y: number;
  /** 남은 시간 (0이면 사라짐) */
  t: number;
  label: Phaser.GameObjects.Text;
  arrow: Phaser.GameObjects.Text;
  /** 상점 진열 (처음 열 때 굴림) */
  stock: ItemRoll[] | null;
  /** 상점 칩셋 한 칸 (산 뒤 null) */
  chip?: string | null;
  rerolls: number;
  healed: boolean;
  /** 리퍼닥 OS 목록 쪽수 (-1이면 첫 화면) */
  osPage: number;
  /** 상점 값 배율 (k번째 상점 × 1.15^(k-1)) */
  priceMul: number;
}
/** 진압대 걷기 루프 재생 속도 (아트: 한 걸음 주기 1초) */
const WALK_FPS = 12;

export class GameScene extends Phaser.Scene implements GameContext {
  // GameContext
  player!: Player;
  grid!: SpatialGrid<Enemy>;
  stats!: Stats;
  overdrive = false;
  fx!: Phaser.GameObjects.Graphics;
  get phaser(): Phaser.Scene {
    return this;
  }
  get enemies(): readonly Enemy[] {
    return this.enemyPool.items;
  }

  private enemyPool!: Pool<Enemy>;
  private enemyBullets!: Pool<EnemyBullet>;
  /** 뉴럴 오버클럭 발동 직후 슬로우 모션 남은 시간 (실시간 초) */
  private slowmo = 0;
  private glitch!: Phaser.GameObjects.Graphics;
  private rainFx!: Phaser.GameObjects.TileSprite;
  private shockwaves: { r: number; life: number }[] = [];
  private bullets!: Pool<Projectile>;
  private pickups!: Pool<Pickup>;
  private near: Enemy[] = [];
  private jamBuf: Enemy[] = [];
  private chainBuf: Enemy[] = [];
  private forcedRarity: string | undefined;
  private levelUps = 0;
  private giftScreen: 'cluster' | 'chain' | null = null;
  private siphonT = 30;
  /** 가속 연쇄가 덮어쓰기 전의 공격 간격 배율 */
  private baseCooldownMul = 1;
  /** 사이버웨어 특수 능력 상태 */
  private streak = 0;
  private streakT = 0;
  private rushT = 0;
  private sinceHurt = 0;
  private shardCount = 0;
  private singT = 15;
  private singPull: { x: number; y: number; t: number } | null = null;
  private undyingUsed = false;
  private creditMagnet = false;
  private wasDashing = false;
  private dashFrom = { x: 0, y: 0 };
  /** 이번 프레임에 끝난 대시 경로 (번개 질주 등이 읽음) */
  dashPath: { x1: number; y1: number; x2: number; y2: number } | null = null;
  private spawner!: Spawner;
  private controls!: InputController;
  private bg!: Phaser.GameObjects.TileSprite;
  /** 화면 위쪽에 깔리는 먼 고층 빌딩 (구역에 따라 켜짐, 바닥보다 느리게 움직임) */
  private skyline!: Phaser.GameObjects.TileSprite;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private levelUi!: LevelUpUI;
  private stationUi!: StationUI;

  private weapons: WeaponBase[] = [];
  /** 트윈스틱 조준 상태 (무기가 GameContext.aim으로 읽음). subX·subY: 보조무기를 쓸 자리 */
  readonly aim = { x: 0, y: 0, primary: false, secondary: false, subX: 0, subY: 0 };

  consumeSecondary(): void {
    this.aim.secondary = false;
  }

  /** 플레이어에게서 r 안의 가장 가까운 적 (거리 제곱도) */
  private nearestEnemy(r: number): { e: Enemy | null; d2: number } {
    const p = this.player;
    let best: Enemy | null = null;
    let bd = r * r;
    for (const e of this.grid.query(p.x, p.y, r, this.chainBuf)) {
      if (!e.active || e.charmT > 0) continue;
      const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return { e: best, d2: bd };
  }

  private dense: { x: number; y: number } | null = null;
  private denseT = 0;

  /** 플레이어에서 r 안, 적이 가장 몰린 자리 (반경 55px 안 적 수가 가장 많은 적 위치). 0.15초마다 다시 셈 */
  private densestSpot(r: number): { x: number; y: number } | null {
    if ((this.denseT -= this.game.loop.delta / 1000) > 0 && this.dense) return this.dense;
    this.denseT = 0.15;
    const p = this.player;
    const list = this.grid.query(p.x, p.y, r, this.chainBuf).filter((e) => e.active && e.charmT <= 0 && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < r * r).slice(0, 40);
    let best: Enemy | null = null;
    let bn = 0;
    for (const e of list) {
      let n = 0;
      for (const o of list) if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 55 * 55) n++;
      if (e.isBoss) n += 3;
      if (n > bn) {
        bn = n;
        best = e;
      }
    }
    this.dense = best ? { x: best.x, y: best.y } : null;
    return this.dense;
  }

  /**
   * 이번 프레임 조준
   * - 주무기: 자동 발사. 마우스를 쓰면 커서 방향, 아니면(터치) 가장 가까운 적. fireRange 안에 적이 있을 때만 쏨
   * - 보조무기: 신호를 받은 자리(우클릭·E = 커서, 끌어 놓은 자리). 자리 없이 누르면 가까운 적
   * - 자동 조준(봇·개발자 도구): 가까운 적, 보조무기도 적이 가까우면 알아서
   */
  private updateAim(): void {
    const p = this.player;
    const c = this.controls;
    const TS = gameData.twinStick;
    const near = this.nearestEnemy(Math.max(TS.autoAimRange, TS.fireRange));
    const mouse = c.aimMode === 'mouse' && !c.autoAim;
    if (mouse) {
      const w = this.cameras.main.getWorldPoint(c.pointerX * ZOOM, c.pointerY * ZOOM);
      this.aim.x = w.x;
      this.aim.y = w.y;
    } else if (near.e) {
      this.aim.x = near.e.x;
      this.aim.y = near.e.y;
    } else {
      this.aim.x = p.x + p.dirX * 100;
      this.aim.y = p.y + p.dirY * 100;
    }
    this.aim.primary = !!near.e && near.d2 < TS.fireRange * TS.fireRange;
    // 보조무기: 자동 발사 (재사용이 끝나면). 누르기형(드론·EMP·미사일)은 가까운 적이 사거리 안이면,
    // 끌어 놓기형(유탄·지뢰·포탑)은 적이 가장 몰린 곳에
    const sub = this.weapons.find((w) => w.slot === 'secondary');
    const use = sub ? ((weaponsData[sub.id as WeaponId] as { use?: string }).use ?? 'tap') : 'tap';
    if (use === 'drag') {
      const spot = this.densestSpot(TS.subRange);
      this.aim.secondary = !!spot;
      if (spot) {
        this.aim.subX = spot.x;
        this.aim.subY = spot.y;
      }
    } else {
      const r = sub?.id === 'microMissile' ? TS.fireRange : TS.subRange;
      this.aim.secondary = !!near.e && near.d2 < r * r;
      if (near.e) {
        this.aim.subX = near.e.x;
        this.aim.subY = near.e.y;
      }
    }
    p.aimX = this.aim.x;
  }
  private passives = new Map<PassiveId, PassiveState>();
  private state: State = 'play';
  private elapsed = 0;
  private kills = 0;
  private level = 1;
  private xp = 0;
  private pendingLevels = 0;
  /** 엘리트(중간) 보스 처치로 받을 전설·신화 확정 보상 수 */
  private bossRewards = 0;
  /** 개편 2단계: 열 보급 상자 (각 상자의 최소 등급 id) */
  private chestQueue: string[] = [];
  /** 개편 2단계: 전설·신화 무기를 얻은 뒤 고를 능력 */
  private abilityPending: { weapon: WeaponId; tier: 'legendary' | 'mythic' } | null = null;
  /** 개편 2단계: 판 안 재화 (칩). 3단계에서 상점·리퍼닥에 씀 */
  private chips = 0;
  /** 다음 보급 상자까지 (초), 다음 맵 칩 무더기까지 (초) */
  private nextChestT = 0;
  private mapChipT = 0;
  /** 이번 판에 나온 상점 수 (값 오름) */
  private shopsSeen = 0;
  // ───── 개편 2-2: 사이버웨어·장비 소켓과 시너지 ─────
  /** 사이버웨어·장비 소켓 (부위 → 낀 아이템) */
  private sockets = new Map<string, Sock>();
  /** 지금 켜진 효과 (아이템·태그 단계·조합) */
  private kit = new Loadout([], new Map());
  /** 무기별 배율: dmg 피해, cd 공격 간격, sub 재사용 대기, area 범위 */
  private wMul = new Map<string, { dmg: number; cd: number; sub: number; area: number }>();
  private wTags = new Map<string, string[]>();
  /** 에너지 실드 남은 흡수량, 다시 차기까지 */
  private gShield = 0;
  private gShieldCd = 0;
  private reactiveT = 0;
  /** 칩셋: id → 중첩 (칸 제한 없음) */
  private chipsets = new Map<string, number>();
  /** 칩셋 효과용 셈: 주무기 적중 수, 처치 수, 냉각 칩셋 주기 */
  private rhythmHits = 0;
  private chipKills = 0;
  private frostT = 0;
  private grenadeReactT = 0;
  private sinceDash = 99;
  /** 감전·화상 (남은 초) */
  private dots = new Map<Enemy, { shock: number; burn: number; hack: number; acc: number }>();
  /** 폭발 4단계: 잠시 뒤 한 번 더 */
  private echoes: { e: Enemy; t: number; dmg: number }[] = [];
  private zaps: { pts: number[]; life: number }[] = [];
  private synRings: { x: number; y: number; r: number; max: number; life: number; color: number }[] = [];
  /** 시너지 효과가 낸 피해 중 (다른 시너지를 또 터뜨리지 않게) */
  private procLock = false;
  private rewardOpen = false;
  private rerolls = 0;
  private choices: Choice[] = [];
  private debug = false;
  private god = false;

  /** 이번 판의 러너와 장착한 특수 능력 */
  private runner!: Runner;
  private specialId = 'stock';
  /** 특수 능력 발동 중 (뉴럴 오버클럭이면 overdrive도 true) */
  private specialOn = false;
  private berserk = false;
  /** 궤도 폭격: 발동 후 경과 시간과 이미 떨어진 폭격 수 */
  private orbitalT = 0;
  private orbitalDone = 0;
  /** 광학 위장·고스트 대시 중 적이 쫓아가는 위치 (마지막으로 본 자리) */
  private decoy = { x: 0, y: 0 };
  private wasUntracked = false;
  private revives = 0;
  /** 구역 진행: 지금 구역, 구역이 시작된 전체 시간 */
  private zoneIdx = 0;
  private zoneStart = 0;
  /** 구역 보스 처치 뒤 대화가 열리기까지 남은 시간 */
  private transitionT = 0;
  private raidsInZone = 0;
  /** 해커가 CC를 막으며 외친 마지막 출동 번호 */
  private hackShoutRaid = -1;
  /** 해커 CC 면역 안내(진)를 이번 판에 보냈는지 */
  /** 블랙 실드 회피 때 퍼지는 붉은 원 */
  private dodgeRings: { x: number; y: number; r: number; life: number }[] = [];
  private floorG!: Phaser.GameObjects.Graphics;
  private laser: { phase: 'idle' | 'warn' | 'fire'; t: number; lines: number[][]; hit: boolean } = { phase: 'idle', t: 5, lines: [], hit: false };
  private dialog: { lines: Line[]; i: number; box: Phaser.GameObjects.Container; text: Phaser.GameObjects.Text; full: string; shown: number; ev: Phaser.Time.TimerEvent | null; done: () => void } | null = null;
  /** 히트 레벨 (최종 클리어 뒤 고르는 난이도) */
  private heat = 0;
  /** 레벨업에 나올 수 있는 무기: 기본 4종 + 블랙마켓에서 산 무기 + 러너 시작 무기 */
  private weaponPool: WeaponId[] = [];
  private keepables: Keep[] = [];
  private counterT = 0;
  private counterSeen = new Set<string>();
  private thornT = 0;
  private carryUi: Phaser.GameObjects.GameObject[] = [];
  private carryKeys?: (e: KeyboardEvent) => void;
  private regen = 0;
  private run!: RunStats;
  private odGauge = 0;
  private odTime = 0;
  private odOverlay!: Phaser.GameObjects.Rectangle;
  private ghosts: { img: Phaser.GameObjects.Image; life: number }[] = [];
  private ghostTimer = 0;

  private boss: Enemy | null = null;
  private bossDef: BossDef | null = null;
  private bossesSpawned = 0;
  private bossPhase: BossPhase = 'walk';
  private bossTimer = 0;
  private bossSummon = 0;
  private bossDir = { x: 0, y: 0 };
  private bossPhase2 = false;
  private bossCharges = 0;
  private bossVolley = 0;
  private volleyRot = 0;
  private bossShieldT = 0;
  /** 보충형 소환: 첫 소환 때 체력 배율, 지금 살아 있는 부하 */
  private bossMinionHp = 0;
  private bossMinions: { e: Enemy; id: string }[] = [];
  private bossMissile = 2;
  /** 보스 공격 모션을 보여줄 남은 시간 */
  private bossAtkT = 0;
  /** 점프 내리찍기: 뛰어오른 자리, 떨어질 자리 / 분노 중인지 */
  private bossFrom = { x: 0, y: 0 };
  private bossTo = { x: 0, y: 0 };
  private bossEnraged = false;
  /** 보스 클로즈업 진행 상태 (null이면 없음) */
  private cine: { b: Enemy; t: number; dur: number; delay: number; lines: string[]; said: number; each: number; zoom: number; lift: number; hidden: Phaser.GameObjects.GameObject[]; bars: Phaser.GameObjects.Rectangle[]; sx: number; sy: number } | null = null;
  /** 콤보: 마지막 공격 종류, 열린 콤보(이어 쓸 수 있는 공격의 출발점)와 마감 시각, 지금 공격이 콤보로 나간 것인지 */
  private bossLastKind = '';
  private comboFrom = '';
  private comboUntil = 0;
  /** 지금 이어지는 콤보에서 몇 번째 공격인지 (콤보가 아닌 공격이면 1) */
  private comboCount = 0;
  /** 이번 돌진의 전체 시간 (거리 비례 돌진이면 매번 다름, 프레임 재생용) */
  private bossChargeTotal = 0;
  /** 보스 점수 AI(BossBrain): 지난 공격·소환 시각, 다음 판단까지, 지금 행동, 마지막 점수, 소환한 부하, 플레이어 속도 */
  private bossLastAttack = 0;
  private bossLastSummon = 0;
  private bossThinkT = 0;
  /** 지난 프레임의 보스 단계 (공격이 끝나고 다시 걷기 시작한 때를 알기 위해) */
  private bossPrevPhase: BossPhase = 'walk';
  private bossAct: BossAct = 'walk';
  private bossScores: Partial<Record<BossAct, number>> = {};
  private bossSummoned: Enemy[] = [];
  private bossPVel = { x: 0, y: 0 };
  private bossPPrev = { x: 0, y: 0 };
  private bossDbg: Phaser.GameObjects.Text | null = null;
  /** 바실리: 개틀링 조준각·발사 누적, 호위, 충격파 고리, 지난 호출 시각, 2페이즈 발전기 빛, 다음 발걸음 */
  private gatAim = 0;
  private gatAcc = 0;
  /** 마지막 발사의 사격 그림 번호 (그림은 다음 발까지 이 장을 유지) */
  private gatShotFrame = -1;
  /** 개틀링 반동 세기 (발사 순간 1, 짧게 0으로) */
  private basiliKick = 0;
  private basiliGuards: Enemy[] = [];
  private stompRings: { x: number; y: number; t: number; hit: boolean }[] = [];
  private basiliLastCall = 0;
  private basiliGlow: Phaser.GameObjects.Image | null = null;
  private basiliCore: Phaser.GameObjects.Image | null = null;
  /** 바실리 그림 효과: 발밑 그림자, 총구 화염, 화염 반사광(몸에 덧입힘), 발구르기 몸 눌림 남은 시간 */
  private basiliShadow: Phaser.GameObjects.Ellipse | null = null;
  private basiliFlash: Phaser.GameObjects.Image | null = null;
  private basiliReflect: Phaser.GameObjects.Image | null = null;
  private basiliSquash = 0;
  /** 이번 호출에서 호위를 이미 불렀는지 */
  private callSpawned = false;
  /** 총구 화염을 보여 줄 남은 시간·지금 화염 장 (발사마다 무작위 1장) */
  private basiliFlashT = 0;
  private basiliFlashF = 0;
  private basiliHalo: Phaser.GameObjects.Image | null = null;
  private walkInStep = 0;
  private walkInTo = 0;
  private basiliLast: BasiliAct = 'walk';
  /** 갈고리: 손에서 뻗은 길이, 방향, 맞은 자리(끌어오기 시작점), 경과 시간, 사슬·머리 그림 */
  private hook = { len: 0, ax: 1, ay: 0, px: 0, py: 0, t: 0 };
  private hookChain: Phaser.GameObjects.TileSprite | null = null;
  private hookHead: Phaser.GameObjects.Image | null = null;
  private hookTrail: Phaser.GameObjects.Image | null = null;
  /** 최종 보스전의 붉은 홀로그램 경계 (월드 좌표) */
  private arena: { x: number; y: number; w: number; h: number; t: number } | null = null;
  private arenaG!: Phaser.GameObjects.Graphics;
  private arenaLabel: Phaser.GameObjects.Text | null = null;
  /** 블랙 실드 진압대 습격 */
  private nextRaid = 0;
  /** 이번 습격 요원이 모두 사살되길 기다리는 중 (그 뒤부터 다음 습격 쿨타임) */
  private raidWaitClear = false;
  /** 직전 부대 투입 시각·체력 합계, 플레이어 스펙 결과, 다음 부대 체력 배율 */
  private raidDeployAt = 0;
  private raidSquadHp = 0;
  private raidSpec: { clear: number; ttk: number; score: number } | null = null;
  private raidHpMul = 1;
  /** 최근 DPS 계산용: 1초 단위 피해 합계 [초, 합계] */
  private dmgSec: [number, number][] = [];
  /** 이번 판에 온 습격 횟수 (습격마다 체력 증가) */
  private raidCount = 0;
  /** 습격 대원 중 아직 착지하지 않은 수 (0이 되면 줄였던 소리를 되돌림) */
  private raidDropping = 0;
  /** 적 그림별 걷기 루프 프레임 수 (<id>_walk_NN, 0이면 없음) */
  private walkFrames = new Map<string, number>();
  /** 최근 DPS: 1초 단위로 모은 피해를 window초만큼 평균 */
  private noteDps(a: number): void {
    const sec = Math.floor(this.elapsed);
    const last = this.dmgSec[this.dmgSec.length - 1];
    if (last && last[0] === sec) last[1] += a;
    else this.dmgSec.push([sec, a]);
    if (this.dmgSec.length > 120) this.dmgSec.shift();
  }
  private recentDps(window: number): number {
    const from = this.elapsed - window;
    let sum = 0;
    for (const [t, a] of this.dmgSec) if (t >= from) sum += a;
    return sum / window;
  }

  /** 스폰 디렉터 패널 (왼쪽): 지금 상황 입력값 → 점수 → 배율 */
  private dirPanel: Phaser.GameObjects.Text | null = null;
  private drawDirectorPanel(show: boolean): void {
    if (!show) {
      this.dirPanel?.setVisible(false);
      return;
    }
    if (!this.dirPanel) {
      this.dirPanel = this.add
        .text(8, VIEW_H - 26, '', { ...TEXT, fontSize: '8px', color: '#fff23a', lineSpacing: 2, backgroundColor: '#07060fcc', padding: { x: 4, y: 3 } })
        .setOrigin(0, 1)
        .setScrollFactor(0)
        .setDepth(150);
    }
    const s = this.directorSense();
    const L = this.spawner.last;
    const f = (v: number) => v.toFixed(2);
    const lines = [
      '스폰 디렉터',
      `체력 ${Math.round(s.playerHp * 100)}% · 주변 ${s.near} · 원거리 ${s.ranged} · 처치율 ${f(s.killRatio)} · 보스 ${s.boss ? '있음' : '없음'} · 요원 ${s.squad}`,
      L ? `점수 체력 ${f(L.score.hp)} 밀도 ${f(L.score.dense)} 여유 ${f(L.score.room)} 처치 ${f(L.score.kill)} 강적 x${f(L.score.strong)}` : '점수 (다음 스폰 때 계산)',
      L ? `→ 스폰 수 x${f(L.countMul)} · 원거리 x${f(L.rangedMul)} · 포위 ${f(L.surround)}` : '',
      '블랙 실드',
      this.raidSpec
        ? `섬멸 ${this.raidSpec.clear.toFixed(0)}초 · DPS 기준 ${this.raidSpec.ttk.toFixed(0)}초 → 스펙 ${f(this.raidSpec.score)}`
        : '스펙 (첫 부대 섬멸 뒤 계산)',
      `→ 다음 습격 ${this.raidWaitClear ? '섬멸 대기' : this.nextRaid === Infinity ? '-' : `${Math.max(0, this.nextRaid - this.elapsed).toFixed(0)}초 뒤`} · 다음 부대 체력 x${f(this.raidHpMul)}`,
    ];
    this.dirPanel.setText(lines.filter(Boolean).join('\n')).setVisible(true);
  }

  /** 스폰 디렉터가 볼 지금 상황: 플레이어 체력, 주변 적 수, 원거리 수, 처치 속도 */
  private killTimes: number[] = [];
  private directorSense(): DirSense {
    const D = gameData.director;
    const p = this.player;
    while (this.killTimes.length && this.killTimes[0] < this.elapsed - D.killWindow) this.killTimes.shift();
    let near = 0;
    let ranged = 0;
    for (const e of this.enemyPool.items) {
      if (!e.active || e.isBoss || e.id.startsWith('trooper_')) continue;
      if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < D.nearR * D.nearR) near++;
      if (RANGED.has(e.id)) ranged++;
    }
    const spawned = this.spawner.recentSpawns(this.elapsed, D.killWindow);
    const squad = this.enemyPool.items.filter((e) => e.active && e.id.startsWith('trooper_')).length;
    return { playerHp: Math.max(0, p.hp) / p.maxHp, near, ranged, killRatio: spawned ? this.killTimes.length / spawned : 1, boss: !!this.boss, squad };
  }

  /** 디버그(F1): 블랙 실드 머리 위에 지금 행동과 상위 점수 표시 */
  private squadDbg = new Map<Enemy, Phaser.GameObjects.Text>();
  private drawSquadDebug(): void {
    // 보스 클로즈업 중에는 점수 글씨를 숨긴다 (대사와 겹치지 않게)
    const show = (this.debug || AI_SHOW) && !this.cine;
    for (const [e, t] of this.squadDbg) if (!show || !e.active) t.setVisible(false);
    this.drawDirectorPanel(show);
    // 보스 점수 AI: 머리 위에 상위 3개
    const bb = this.boss;
    const bOn = show && !!bb && !!(this.bossDef as { brain?: boolean } | null)?.brain && Object.keys(this.bossScores).length > 0;
    if (bOn && bb) {
      this.bossDbg ??= this.add.text(0, 0, '', { ...TEXT, fontSize: '7px', color: '#fff23a', strokeThickness: 2, align: 'center' }).setOrigin(0.5, 1).setDepth(150);
      const top = (Object.entries(this.bossScores) as [string, number][]).sort((a, c) => c[1] - a[1]).slice(0, 3);
      const line = `${this.bossPhase}\n` + top.map(([a, v]) => `${a} ${v.toFixed(2)}`).join('\n');
      this.bossDbg.setText(line).setPosition(bb.x, bb.sprite.y - bb.sprite.displayHeight - 4).setVisible(true);
    } else this.bossDbg?.setVisible(false);
    if (!show) return;
    for (const e of this.enemyPool.items) {
      if (!e.active || !e.id.startsWith('trooper_')) continue;
      let t = this.squadDbg.get(e);
      if (!t) {
        t = this.add.text(0, 0, '', { ...TEXT, fontSize: '7px', color: '#fff23a', strokeThickness: 2, align: 'center' }).setOrigin(0.5, 1).setDepth(150);
        this.squadDbg.set(e, t);
      }
      const top = (Object.entries(e.scores) as [string, number][]).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const line = top.map(([a, v]) => `${a === e.act ? '▶' : ''}${a} ${v.toFixed(2)}`).join('\n');
      t.setText(line).setPosition(e.x, e.y + (e.sprite.originY === 1 ? e.footOff - this.bodyTop(e.tex) : -18) - 9).setVisible(true);
    }
  }

  /** 블랙 실드 바이저 빛: 지금 그림의 바이저 중심(visor_anchors.json)에 원점·뒤집기를 반영해 Add로 얹는다.
   *  강하·착지·피격·조종 중에도 몸을 따라가고, 바이저 정보가 없는 그림이거나 몸이 안 보이면 숨긴다 */
  private placeVisorGlows(): void {
    const V = gameData.visorGlow;
    const A = visorAnchors as Record<string, { x: number; y: number; color: string }>;
    for (const e of this.enemyPool.items) {
      if (!e.active) continue;
      const s = e.sprite;
      const a = A[s.texture.key];
      if (!a || !s.visible) {
        e.glow.setVisible(false);
        continue;
      }
      const w = s.frame.width;
      const h = s.frame.height;
      const ax = s.flipX ? w - a.x : a.x;
      const tex = `fx_visor_glow_${a.color}`;
      if (e.glow.texture.key !== tex) e.glow.setTexture(tex);
      e.glow
        .setPosition(s.x + (ax - s.originX * w) * s.scaleX, s.y + (a.y - s.originY * h) * s.scaleY)
        .setScale(V.scale)
        .setAlpha(V.alpha * s.alpha)
        .setDepth(s.depth + 0.01)
        .setVisible(true);
    }
  }

  /** 적 걷기 그림(없으면 기본 그림)에서 발부터 머리 꼭대기까지 높이 (체력바 위치용) */
  private bodyTops = new Map<string, number>();
  private bodyTop(tex: string): number {
    let h = this.bodyTops.get(tex);
    if (h !== undefined) return h;
    const key = this.textures.exists(`${tex}_walk_00`) ? `${tex}_walk_00` : tex;
    const img = this.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const cv = document.createElement('canvas');
    cv.width = img.width;
    cv.height = img.height;
    const cx = cv.getContext('2d')!;
    cx.drawImage(img, 0, 0);
    const a = cx.getImageData(0, 0, img.width, img.height).data;
    let top = 0;
    find: for (; top < img.height; top++) for (let x = 0; x < img.width; x++) if (a[(top * img.width + x) * 4 + 3] > 0) break find;
    // 걷기 그림은 발이 맨 아랫줄이라 (높이 - 맨 윗줄)이 곧 몸 높이
    h = img.height - top;
    this.bodyTops.set(tex, h);
    return h;
  }
  private raid: {
    phase: 'in' | 'hover' | 'out';
    t: number;
    sx: number;
    tx: number;
    ty: number;
    ship: Phaser.GameObjects.Image;
    /** 엔진 후류(이동 중 기운 것/정지 중 수직)와 바닥 먼지(정지 중에만) */
    wash: Phaser.GameObjects.Image | null;
    /** 정지 자세 후류: 엔진 기울기(tilt)에 맞춰 이동 후류와 겹쳐 바꾼다 */
    washH: Phaser.GameObjects.Image | null;
    /** 엔진 기울기 0(정지·수직)~5(전진), 프레임 dropship_tilt_NN */
    tilt: number;
    /** 바닥 빨간 조명의 빛번짐 (Add 합성 부드러운 원) */
    floorGlow: Phaser.GameObjects.Image | null;
    dust: Phaser.GameObjects.Image | null;
    shadow: Phaser.GameObjects.Ellipse;
    markers: { x: number; y: number }[];
  } | null = null;
  /** 픽서 진의 휴대폰 문자 (보스·진압대 등장 예고): 화면 오른쪽 아래, 한 번에 하나씩 */
  private phoneQueue: { msg: string; tex?: string }[] = [];
  private phoneBox: Phaser.GameObjects.Container | null = null;
  /** 이미 예고한 보스(구역-순번)와 진압대 습격 시각 */
  private warnedBoss = '';
  private warnedRaid = -1;
  private bountySent = false;
  private chatterT = 15;
  /** 작은 반복 강화로 쌓인 수치 */
  private overflow: Record<string, number> = {};
  private mergeT = 0;
  private dashGhostT = 0;
  private dashRings: { r: number; life: number }[] = [];
  private flashRect!: Phaser.GameObjects.Rectangle;

  private hudUi!: Hud;
  private hud!: {
    time: Phaser.GameObjects.Text;
    kills: Phaser.GameObjects.Text;
    level: Phaser.GameObjects.Text;
    hp: Phaser.GameObjects.Text;
    debug: Phaser.GameObjects.Text;
    center: Phaser.GameObjects.Text;
    od: Phaser.GameObjects.Text;
    bossName: Phaser.GameObjects.Text;
    credits: Phaser.GameObjects.Text;
    zone: Phaser.GameObjects.Text;
    bars: Phaser.GameObjects.Graphics;
  };

  constructor() {
    super('Game');
  }

  // ───────────────────────────── 초기화 ─────────────────────────────
  create(): void {
    // scene.start()로 다시 들어올 때 같은 인스턴스를 재사용하므로 상태를 전부 초기화
    this.state = 'play';
    this.elapsed = this.kills = this.xp = this.pendingLevels = this.bossRewards = this.chips = 0;
    // 판 시작: 칩셋·5단계 상태 초기화 (씬은 다시 쓰이므로)
    this.wireLinks.clear();
    this.miniDrones = [];
    this.focusUntil = [];
    this.elecHits = this.boomCount = this.meleeKills5 = this.mechKills = 0;
    this.lastHurtAt = -99;
    this.mineReactT = 0;
    this.chestQueue = [];
    this.abilityPending = null;
    this.nextChestT = Phaser.Math.FloatBetween(gameData.supply.chestEvery[0], gameData.supply.chestEvery[1]);
    this.mapChipT = gameData.supply.mapChips.every;
    this.shopsSeen = 0;
    this.rewardOpen = false;
    this.level = 1;
    this.rerolls = gameData.rerollsPerRun;
    this.weapons = [];
    this.passives = new Map();
    this.sockets = new Map();
    this.kit = new Loadout([], new Map());
    this.wMul = new Map();
    this.wTags = new Map();
    this.gShield = this.gShieldCd = this.reactiveT = this.grenadeReactT = 0;
    this.sinceDash = 99;
    this.chipsets = new Map();
    this.rhythmHits = this.chipKills = this.frostT = 0;
    this.dots = new Map();
    this.echoes = [];
    this.zaps = [];
    this.synRings = [];
    this.procLock = false;
    this.forcedRarity = undefined;
    this.levelUps = 0;
    this.giftScreen = null;
    this.siphonT = 30;
    this.streak = this.streakT = this.rushT = this.sinceHurt = this.shardCount = 0;
    this.singT = 15;
    this.singPull = null;
    this.undyingUsed = this.creditMagnet = this.wasDashing = false;
    this.dashPath = null;
    this.overflow = {};
    this.arena = null;
    this.arenaLabel = null;
    this.bossPhase2 = false;
    this.raid = null;
    this.raidCount = 0;
    this.nextRaid = ZONES[Phaser.Math.Clamp(Number((this.scene.settings.data as { startZone?: number } | undefined)?.startZone ?? 0), 0, ZONES.length - 1)].raidStart + Math.random() * gameData.raid.firstDelayMax;
    this.raidWaitClear = false;
    this.raidSpec = null;
    this.raidHpMul = 1;
    this.dmgSec = [];
    this.mergeT = this.dashGhostT = 0;
    this.dashRings = [];
    this.devUi = [];
    this.devRows = [];
    this.dpsBuckets = new Map();
    this.dpsStart = new Map();
    this.dmgNums = [];
    this.dpsSec = -1;
    this.dpsShowT = 0;
    this.dmgSrc = null;
    this.overdrive = this.specialOn = this.berserk = this.wasUntracked = false;
    this.runner = Save.runner();
    // OS: 아지트에서 낀 OS (레벨 = 뽑기로 모은 개수). ?debug 개발자 도구에서 고른 OS·레벨이 있으면 그것
    {
      const dev = DEV_TOOLS ? devOsPick() : null;
      this.os = dev ? new OsState(dev.id, dev.level) : new OsState(Save.data.os, Save.osLevel(Save.data.os));
      this.specialId = this.os.id;
    }
    this.osCdT = this.bossStunT = this.bossStunCd = this.osExt = 0;
    this.ambush = false;
    this.marks = new Map();
    this.fireZones = [];
    for (const t of this.freeTurrets) t.img.destroy();
    this.freeTurrets = [];
    this.orbitalTargets = [];
    this.orbitalPick = -1;
    this.revives = Save.clinicLevel('revive');
    this.regen = Save.clinicValue('regen');
    this.run = { kills: 0, droneKills: 0, meleeKills: 0, trooperKills: 0, midbossKills: 0, bossKills: 0, hexKills: 0, coreKills: 0, time: 0, level: 1, zone: 1 };
    // 임시: 아지트의 'N챕터부터' 버튼으로 시작하면 그 챕터에서 (scene data startZone)
    const startZone = Phaser.Math.Clamp(Number((this.scene.settings.data as { startZone?: number } | undefined)?.startZone ?? 0), 0, ZONES.length - 1);
    this.zoneIdx = startZone;
    this.zoneStart = 0;
    this.stations = [];
    this.stationOpen = null;
    this.stationsFired = 0;
    this.transitionT = 0;
    this.raidsInZone = 0;
    this.dodgeRings = [];
    this.hackShoutRaid = -1;
    this.laser = { phase: 'idle', t: 5, lines: [], hit: false };
    this.dialog = null;
    this.heat = Math.min(Save.data.heat, Save.data.heatMax);
    this.keepables = [];
    this.counterT = 0;
    this.counterSeen = new Set();
    this.carryUi = [];
    // 블랙마켓에서 산 무기 중 꺼 둔 것은 빼고 (러너 시작 무기는 항상 포함)
    // 개편 4단계: 블랙마켓 없음, 무기는 처음부터 모두 열림
    this.weaponPool = [...WEAPON_IDS];
    this.odGauge = this.odTime = this.ghostTimer = 0;
    this.ghosts = [];
    this.phoneQueue = [];
    // 이전 판의 이펙트·말풍선은 장면이 끝날 때 이미 지워졌으므로 목록도 비운다
    this.fxLive = [];
    this.fxFree = [];
    this.lastHit = null;
    this.shouts = [];
    this.phoneBox = null;
    this.warnedBoss = '';
    this.warnedRaid = -1;
    this.bountySent = false;
    this.chatterT = 15;
    this.boss = null;
    // 갈고리 사슬·머리는 장면과 함께 사라졌으므로 다시 만든다
    this.hookChain = null;
    this.hookHead = null;
    this.hookTrail = null;
    this.bossDbg = null;
    this.containers = [];
    this.clearPlasma();
    this.basiliGlow = null;
    this.xmLayers = null;
    this.basiliCore = null;
    this.basiliShadow = null;
    this.basiliFlash = null;
    this.basiliReflect = null;
    this.basiliHalo = null;
    this.bossDef = null;
    this.bossesSpawned = 0;
    this.god = false;

    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.bg = this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'ground').setOrigin(0).setScrollFactor(0).setDepth(0);
    this.skyline = this.add.tileSprite(0, 0, VIEW_W, 150, 'skyline_ch1').setOrigin(0).setScrollFactor(0).setDepth(1.5); // 바닥 무늬(컨베이어 등) 위, 아이템·적 아래
    this.floorG = this.add.graphics().setDepth(1);
    this.rainFx = this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'rain').setOrigin(0).setScrollFactor(0).setDepth(144).setAlpha(0.7);
    this.fx = this.add.graphics().setDepth(17);
    this.arenaG = this.add.graphics().setDepth(13);
    this.flashRect = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0xffffff, 1).setOrigin(0).setScrollFactor(0).setDepth(142).setVisible(false);

    this.player = new Player(this, this.runner.texture);
    this.recalcStats();
    this.player.hp = this.player.maxHp;
    this.enemyPool = new Pool(() => new Enemy(this));
    this.bullets = new Pool(() => new Projectile(this));
    makeCrateArt(this); // 상자 그림·빛 텍스처는 Pickup을 만들기 전에
    this.pickups = new Pool(() => new Pickup(this));
    this.enemyBullets = new Pool(() => new EnemyBullet(this));
    this.slowmo = 0;
    this.shockwaves = [];
    this.glitch = this.add.graphics().setScrollFactor(0).setDepth(146).setBlendMode(Phaser.BlendModes.ADD);
    this.cameras.main.postFX?.clear();
    this.odFxOn = false;
    this.grid = new SpatialGrid<Enemy>(GRID_CELL);
    this.spawner = new Spawner((id, x, y, s) => this.spawnEnemy(id, x, y, s));
    this.controls = new InputController(this);
    // 트윈스틱: 마우스 커서 대신 게임 십자선을 보여 줌 (장면이 끝나면 되돌림)
    this.input.setDefaultCursor('none');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.setDefaultCursor('default'));
    this.levelUi = new LevelUpUI(this);
    makeChipArt(this);
    this.invPanel = null;
    this.makeInvButton();
    this.stationUi = new StationUI(this, this.levelUi);

    this.sparks = this.add
      .particles(0, 0, 'spark', {
        speed: { min: 40, max: 160 },
        lifespan: 320,
        scale: { start: 1.2, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(25);

    setupCamera(this);
    this.cameras.main.setScroll(this.player.x - VIEW_W / 2, this.player.y - VIEW_H / 2);
    this.odOverlay = this.add
      .rectangle(0, 0, VIEW_W, VIEW_H, COLORS.magenta, 0.08)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(140)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'scan').setOrigin(0).setScrollFactor(0).setDepth(150);
    this.createHud();
    this.applyZone(false);

    this.addStartWeapons();
    this.bindKeys();
    // 리퍼닥 '전투 시뮬레이션 칩': 판 시작 때 레벨업 카드를 미리 고른다 (첫 대화가 끝난 뒤 열림)
    this.pendingLevels += Save.clinicValue('startPick');
    Sound.duck(1);
    Sound.slowWorld(false);
    Sound.music(this.zoneMusic);
    Sound.lazyLoad(this);
    // 아래쪽 설정 버튼: 글자 길이가 언어마다 달라서 앞 버튼 폭만큼 띄워 놓는다
    const muteBtn = addMuteToggle(this, 8, VIEW_H - 18, 0);
    const fxBtn = addFxToggle(this, muteBtn.x + muteBtn.width + 12, VIEW_H - 18, 0);
    const dmgBtn = addDmgToggle(this, fxBtn.x + fxBtn.width + 12, VIEW_H - 18, 0);
    const introBtn = addIntroToggle(this, dmgBtn.x + dmgBtn.width + 12, VIEW_H - 18, 0);
    const fsBtn = addFullscreenToggle(this, introBtn.x + introBtn.width + 12, VIEW_H - 18, 0);
    // 전투 중에는 숨기고 일시정지 화면에서만 보여준다 (M·V·H·U·F 키는 언제나 동작)
    this.settingUi = [muteBtn, fxBtn, dmgBtn, introBtn, ...(fsBtn.input?.enabled ? [fsBtn] : [])];
    for (const b of this.settingUi) b.setVisible(false);
    // 일시정지 버튼 (터치 기기에는 Esc가 없고, PC에서도 눌러서 멈출 수 있게)
    const pb = this.add
      .text(VIEW_W - 8, 42, 'Ⅱ', { ...TEXT, fontSize: '14px', color: '#e8f7ff', backgroundColor: '#1a1030', padding: { x: 8, y: 2 } })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(160)
      .setInteractive({ useHandCursor: true });
    pb.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      if (this.state === 'play') this.togglePause();
    });
    this.pauseBtn = pb;
    this.speedBtn = null;
    this.gameSpeed = Save.data.speedUnlocked && Save.data.speed2 ? 2 : 1;
    if (Save.data.speedUnlocked) this.makeSpeedBtn();
    if (AI_SHOW || DEV_TOOLS) this.makeAiTools();
    // 1챕터 의뢰 브리핑
    // 첫 판: 진과 처음 만나는 대사 (아직 빚이 없다). 두 번째 판부터: 리퍼닥 수리비를 갚으라는 대사
    // 첫 판: 진과 첫 만남 · 지난 판 클리어: 새 주인 밑의 하층가 · 지난 판 2챕터 이상에서 쓰러짐: 바실리 백업 의체 · 그 밖: 빚 갚기
    const z0 = ZONES[0] as Zone & { intro?: Line[]; introFirst?: Line[]; introRetry?: Line[]; introClear?: Line[] };
    const sd = Save.data;
    const lines = sd.stats.runs === 0 ? z0.introFirst : sd.lastWin ? z0.introClear : sd.lastZone >= 1 ? z0.introRetry : z0.intro;
    if (this.zoneIdx > 0) {
      // 챕터 바로 시작(임시): 그 챕터 브리핑 뒤 전설·신화 확정 카드를 startCards[챕터]번 고름
      const zs = ZONES[this.zoneIdx] as Zone & { intro?: Line[] };
      for (let i = 0; i < ((gameData as unknown as { startCards: number[] }).startCards[this.zoneIdx] ?? 0); i++) this.chestQueue.push('legendary');
      this.startDialog(zs.intro ?? [], () => undefined);
    } else this.startDialog(lines ?? z0.intro ?? [], () => undefined);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, this.onBlur, this);
      this.levelUi.hide();
      this.stationUi.hide();
      Sound.musicRate(1);
      Sound.slowWorld(false);
      Sound.raidFocus(false);
      Ads.setPlaying(false);
      if (this.carryKeys) this.input.keyboard?.off('keydown', this.carryKeys);
      for (const w of this.weapons) w.destroy();
    });
  }

  private bindKeys(): void {
    const kb = this.input.keyboard!;
    // 일시정지: P (CrazyGames에서는 Esc가 포털 전체화면 해제 키라 쓰지 않음)
    kb.on('keydown-P', () => this.togglePause());
    if (Ads.provider !== 'crazygames') kb.on('keydown-ESC', () => this.togglePause());
    kb.on('keydown-ENTER', () => this.state === 'dialog' && this.advanceDialog());
    // 대화: ENTER·탭 = 다음 줄, 스페이스 = 건너뛰기
    kb.on('keydown-SPACE', () => (this.state === 'dialog' ? this.skipDialog() : this.cine && this.skipCine()));
    kb.on('keydown-F1', () => (this.debug = !this.debug));
    kb.on('keydown-BACKTICK', () => (this.debug = !this.debug));
    // 디버그 전용 치트 (F1으로 디버그를 켰을 때만)
    kb.on('keydown-N', () => {
      if (!this.debug) return;
      for (let i = 0; i < 100; i++) this.spawner.spawnAround(i % 3 ? 'drone' : 'thug', this.player.x, this.player.y, 1);
    });
    kb.on('keydown-T', () => this.debug && (this.elapsed += 60));
    kb.on('keydown-L', () => {
      if (!this.debug || this.state !== 'play') return;
      this.level++;
      this.pendingLevels++;
    });
    kb.on('keydown-G', () => this.debug && (this.god = !this.god));
    kb.on('keydown-O', () => this.debug && (this.odGauge = 100));
    // 디버그: 다음 레벨업 카드를 전설(K) / 신화(M)로 고정
    kb.on('keydown-K', () => this.debug && (this.forcedRarity = 'legendary'));
    kb.on('keydown-M', () => this.debug && (this.forcedRarity = 'mythic'));
    this.game.events.on(Phaser.Core.Events.BLUR, this.onBlur, this);
    // 일시정지 중에는 화면을 탭해도 계속 (터치 기기용)
    this.input.on('pointerup', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.state === 'paused' && over.length === 0 && !this.portrait()) this.togglePause();
      else if (this.state === 'dialog' && over.length === 0) this.advanceDialog();
      else if (this.cine && this.state === 'play') this.skipCine();
    });
    // 휴대폰을 세로로 돌리면 일시정지 (화면이 작아져 조작이 어려움)
    const mq = window.matchMedia?.('(orientation: portrait)');
    const onOrient = () => {
      if (this.portrait() && this.state === 'play') this.togglePause();
    };
    mq?.addEventListener('change', onOrient);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => mq?.removeEventListener('change', onOrient));
  }

  private portrait(): boolean {
    return isTouch() && window.innerHeight > window.innerWidth;
  }

  private createHud(): void {
    // UI: HUD는 src/ui/Hud.ts (글자들은 예전 이름 그대로 this.hud로 씀)
    this.hudUi = new Hud(this);
    this.hud = this.hudUi.t;
    // 무기별 DPS: 왼쪽, 소켓 줄 아래
    this.dpsText = this.add.text(8, Hud.BELOW, '', { ...TEXT, fontSize: '8px', color: '#c8b8e8', lineSpacing: 3 }).setScrollFactor(0).setDepth(100);
  }

  // ───────────────────────────── GameContext ─────────────────────────────
  /** 마지막 damage()가 치명타였는지 */
  lastCrit = false;
  /** 마지막으로 맞은 시각 (근접 사격 조합) */
  private lastHurtAt = -99;
  /** 반응 지뢰 조합 재사용 대기 */
  private mineReactT = 0;

  damage(e: Enemy, amount: number, tag?: DamageTag): boolean {
    this.lastCrit = false;
    if (!e.active) return false;
    if (e === this.boss && (this.cine || this.bossGod || this.xmEntering || this.bossShieldT > 0 || this.bossPhase === 'enter' || this.bossPhase === 'walkIn' || this.bossPhase === 'phaseShift')) return false;
    // 회피 기동 중인 진압대는 피해를 받지 않음
    if (e.dodgeT > 0) return false;
    // 강하·착지 충격 중인 진압대는 무적
    if (e.dropT > 0 || e.landT > 0) return false;
    // 블랙 실드: 맞은 시각을 남겨 두면 다음 판단(SquadBrain)에서 회피·후퇴 점수가 오른다
    if (e.id.startsWith('trooper_')) {
      e.lastHitAt = this.elapsed;
      e.thinkT = Math.min(e.thinkT, 0.05);
    }
    // 카운터 몬스터: 특정 피해 종류에 강함
    const res = (CT.mul as Record<string, Record<string, number>>)[e.id];
    if (res && tag && res[tag] !== undefined) amount *= res[tag];
    if (e.id === 'c_thorn' && tag === 'melee') this.thornReflect();
    // 개편 2-2: 사이버웨어·장비·시너지 피해 배율
    const L = this.kit;
    const src = this.dmgSrc;
    const proc = !this.procLock;
    if (L.has('gear.mark') && (e.x - this.aim.x) ** 2 + (e.y - this.aim.y) ** 2 < 50 * 50) amount *= 1 + L.v('gear.mark') / 100;
    // OS: 택티컬 표식, 광학 위장 3줄 매복(풀린 뒤 첫 공격)
    if (this.isMarked(e)) amount *= 1 + this.os.v('mark', 25) / 100;
    if (this.ambush && proc && src) {
      this.ambush = false;
      amount *= this.os.v('amb', 2);
      this.burst(e.x, e.y, 0x39ff88, 8);
    }
    if (L.has('cyber.eliteDmg') && (e.isBoss || e.maxHp >= 1000)) amount *= 1 + L.v('cyber.eliteDmg') / 100;
    // 칩셋: 사냥꾼(엘리트·보스), 리듬 탄(주무기 n번째 적중), 처형(일반 적 낮은 체력 즉사)
    if (L.has('chip.bossDmg') && (e.isBoss || e.maxHp >= 1000)) amount *= 1 + L.v('chip.bossDmg') / 100;
    if (proc && L.has('chip.rhythm') && src && src === this.weapons.find((w) => w.slot === 'primary')?.id && ++this.rhythmHits >= Math.max(2, L.v('chip.rhythm', 'n', 8))) {
      this.rhythmHits = 0;
      amount *= L.v('chip.rhythm', 'mul', 2);
      this.burst(e.x, e.y, COLORS.cyan, 4);
    }
    if (L.has('chip.execute') && !e.isBoss && e.maxHp < 1000 && e.hp - amount <= (e.maxHp * Math.min(30, L.v('chip.execute'))) / 100) amount = Math.max(amount, e.hp);
    if (src === 'mantisBlade' && L.has('combo.bladeReflex') && this.sinceDash <= L.v('combo.bladeReflex', 't')) amount *= L.v('combo.bladeReflex', 'mul', 1);
    // 근접 사격 조합: 맞은 뒤 t초 동안 샷건 피해 증가
    if (src === 'shotgun' && L.has('combo.shotgunGuard') && this.elapsed - this.lastHurtAt <= L.v('combo.shotgunGuard', 't', 2)) amount *= 1 + L.v('combo.shotgunGuard') / 100;
    // 스마트 조준 조합: 스마트 피스톨 피해 증가
    if (src === 'smartPistol' && L.has('combo.pistolAim')) amount *= 1 + L.v('combo.pistolAim') / 100;
    // 강화 근섬유 특수 능력: 치명타 · 치명 폭주 · 분노 · 연속 처치
    const frenzy = this.pHas('critFrenzy');
    let critMul = 1;
    if ((frenzy || this.pHas('crit')) && Math.random() < (frenzy ? 0.25 : 0.1)) {
      critMul = frenzy ? 3 : 2;
      amount *= critMul;
      this.burst(e.x, e.y, critMul === 3 ? 0xff2a3a : COLORS.yellow, 4);
    }
    // 개편 2-2 치명타: 타겟팅 아이 + 정밀 2단계 확률, 정밀 3단계 배율, 레일건 + 타겟팅 아이 조합
    const critPct = L.v('cyber.crit') + L.v('syn.prec2') + L.v('chip.crit');
    let crit = false;
    if (critMul === 1 && proc && critPct > 0 && Math.random() * 100 < critPct) {
      crit = true;
      critMul = L.v('syn.prec3', 'mul', 2) * (src === 'railgun' ? 1 + L.v('combo.railEye') / 100 : 1);
      amount *= critMul;
      this.burst(e.x, e.y, COLORS.yellow, 4);
    }
    this.lastCrit = critMul > 1;
    if (this.pHas('rage')) amount *= 1 + 0.4 * (1 - this.player.hp / this.player.maxHp);
    if (this.streak > 0) amount *= 1 + 0.02 * this.streak;
    // 처형자: 맞고 체력 15% 이하로 남는 일반 적은 즉사
    if (!e.isBoss && this.pHas('executioner') && e.hp - amount <= e.maxHp * 0.15) amount = Math.max(amount, e.hp);
    // 최종 피해는 정수 (반올림, 0보다 크면 최소 1)
    amount = amount > 0 ? Math.max(1, Math.round(amount)) : 0;
    this.logDamage(Math.min(amount, Math.max(0, e.hp)));
    this.noteDps(Math.min(amount, Math.max(0, e.hp)));
    this.dmgNumber(e, amount, critMul);
    if (e === this.boss) this.xmHitT = Math.max(this.xmHitT, 0.12);
    if (proc) this.hitProcs(e, amount, tag, src, crit);
    if (proc && this.wireLinks.size) this.linkShare(e, amount, tag);
    if (e.hit(amount)) {
      if (tag === 'melee') this.run.meleeKills++;
      this.tier5Kill(tag, src, crit);
      this.killEnemy(e, tag);
      return true;
    }
    return false;
  }

  // ───────────── 적 말풍선 (블랙 실드 출동 대사) ─────────────
  private shouts: { e: Enemy; box: Phaser.GameObjects.Text; t: number; delay: number; below: boolean; life: number; lift: number }[] = [];

  /** life: 보이는 시간(초), lift: 몸 위로 더 올릴 거리(px, 키 큰 보스용) */
  private shout(e: Enemy, text: string, delay: number, below = false, life = 1.5, lift = 0): void {
    const box = this.add
      .text(e.x, e.y, text, { ...TEXT, fontSize: '9px', color: '#ffffff', backgroundColor: '#3a0a12', padding: { x: 5, y: 3 }, strokeThickness: 0 })
      .setOrigin(0.5, below ? 0 : 1)
      .setDepth(96)
      .setVisible(false);
    this.shouts.push({ e, box, t: 0, delay, below, life, lift });
  }

  private updateShouts(dt: number): void {
    for (const s of this.shouts) {
      s.t += dt;
      const live = s.t - s.delay;
      if (!s.e.active || live > s.life) {
        s.box.destroy();
        continue;
      }
      if (live < 0) continue;
      s.box.setVisible(true).setPosition(s.e.x, s.below ? s.e.y + s.e.radius + 8 : s.e.y - s.e.radius - 10 - s.lift).setAlpha(live > s.life - 0.3 ? (s.life - live) / 0.3 : 1);
    }
    this.shouts = this.shouts.filter((s) => s.box.active);
  }

  // ───────────── 무기 이펙트 그림 (fx_<이름>_1..N, 아트 세션 제작) ─────────────
  private fxLive: { img: Phaser.GameObjects.Image; name: string; n: number; t: number; ft: number }[] = [];
  private fxFree: Phaser.GameObjects.Image[] = [];
  private fxFrames = new Map<string, number>();

  playFx(name: string, x: number, y: number, o: FxOpts = {}): void {
    let n = this.fxFrames.get(name);
    if (n === undefined) {
      n = 0;
      while (this.textures.exists(`fx_${name}_${n + 1}`)) n++;
      this.fxFrames.set(name, n);
    }
    if (!n || this.fxLive.length >= 160) return;
    const img = this.fxFree.pop() ?? this.add.image(0, 0, `fx_${name}_1`).setBlendMode(Phaser.BlendModes.ADD);
    img
      .setTexture(`fx_${name}_1`)
      .setPosition(x, y)
      .setRotation(o.angle ?? 0)
      .setScale(o.scale ?? 1)
      .setOrigin(o.originX ?? 0.5, o.originY ?? 0.5)
      .setAlpha(o.alpha ?? 1)
      .setDepth(o.depth ?? 19)
      .setVisible(true);
    this.fxLive.push({ img, name, n, t: 0, ft: o.frameTime ?? 0.05 });
  }

  private updateFx(dt: number): void {
    for (const f of this.fxLive) {
      f.t += dt;
      const k = Math.floor(f.t / f.ft);
      if (k >= f.n) {
        f.img.setVisible(false);
        this.fxFree.push(f.img);
      } else f.img.setTexture(`fx_${f.name}_${k + 1}`);
    }
    this.fxLive = this.fxLive.filter((f) => f.img.visible);
  }

  fireBullet(x: number, y: number, angle: number, speed: number, damage: number, opts?: BulletOpts): void {
    const b = this.bullets.acquire();
    b.fire(x, y, angle, speed, damage, opts);
    b.src = this.dmgSrc;
  }

  // ───────────── 무기별 DPM (분당 피해: 최근 60초 기준, 왼쪽 HUD) ─────────────
  /** 지금 피해를 주고 있는 무기 id (무기 update 중이거나 그 무기가 쏜 탄을 처리하는 중) */
  private dmgSrc: string | null = null;
  private dpsBuckets = new Map<string, number[]>();
  private dpsSec = -1;
  /** 무기가 처음 피해를 준 초 (60초가 안 됐으면 지금까지 평균으로 1분치를 환산) */
  private dpsStart = new Map<string, number>();
  private dpsText!: Phaser.GameObjects.Text;
  private dpsShowT = 0;

  /**
   * 피해 숫자: 일반 흰색, 2배 치명타 노랑, 3배 치명타 빨강. 위로 떠오르며 사라짐 (최대 60개 재사용).
   * 일반 피해는 같은 적이 0.2초 안에 또 맞으면 숫자 하나로 합산 (드론·장판·연쇄로 화면이 덮이지 않게)
   */
  private dmgNums: { t: Phaser.GameObjects.Text; life: number; e: Enemy | null; sum: number; age: number }[] = [];
  private dmgNumber(e: Enemy, amount: number, critMul: number): void {
    if (!Settings.dmgNumbers || amount <= 0) return;
    const D = gameData.dmgNumbers;
    if (critMul === 1) {
      const m = this.dmgNums.find((o) => o.life > 0 && o.e === e && o.age < D.mergeWindow);
      if (m) {
        m.sum += amount;
        m.t.setText(`${Math.round(m.sum)}`);
        return;
      }
    }
    let n = this.dmgNums.find((o) => o.life <= 0);
    if (!n) {
      if (this.dmgNums.length < D.max) {
        n = { t: this.add.text(0, 0, '', { ...TEXT, fontSize: '9px', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(97), life: 0, e: null, sum: 0, age: 0 };
        this.dmgNums.push(n);
      } else if (critMul > 1) {
        // 꽉 찼으면 치명타는 가장 오래된 숫자를 빌려 쓴다 (일반 피해는 생략)
        n = this.dmgNums.reduce((a, b) => (a.life < b.life ? a : b));
      } else return;
    }
    const style = critMul === 3 ? D.crit3 : critMul === 2 ? D.crit2 : D.normal;
    n.life = D.life;
    n.age = 0;
    n.e = critMul === 1 ? e : null;
    n.sum = amount;
    n.t
      .setText(critMul > 1 ? `${Math.round(amount)}!` : `${Math.round(amount)}`)
      .setColor(style.color)
      .setFontSize(style.size)
      .setPosition(e.x + (Math.random() - 0.5) * 10, e.y - e.radius - 4)
      .setAlpha(1)
      .setScale(style.pop)
      .setVisible(true);
  }

  private updateDmgNums(dt: number): void {
    for (const n of this.dmgNums) {
      if (n.life <= 0) continue;
      n.life -= dt;
      n.age += dt;
      n.t.y -= 28 * dt;
      n.t.setScale(Math.max(1, n.t.scale - dt * 2));
      if (n.life < 0.25) n.t.setAlpha(Math.max(0, n.life / 0.25));
      if (n.life <= 0) n.t.setVisible(false);
    }
  }

  private logDamage(amount: number): void {
    if (!this.dmgSrc || amount <= 0) return;
    let b = this.dpsBuckets.get(this.dmgSrc);
    if (!b) {
      this.dpsBuckets.set(this.dmgSrc, (b = new Array(61).fill(0)));
      this.dpsStart.set(this.dmgSrc, Math.floor(this.elapsed));
    }
    b[Math.floor(this.elapsed) % 61] += amount;
  }

  private updateDps(dt: number): void {
    const sec = Math.floor(this.elapsed);
    if (sec !== this.dpsSec) {
      this.dpsSec = sec;
      for (const b of this.dpsBuckets.values()) b[sec % 61] = 0;
    }
    if ((this.dpsShowT -= dt) > 0) return;
    this.dpsShowT = 0.5;
    const cur = sec % 61;
    const lines = this.weapons.map((w) => {
      const b = this.dpsBuckets.get(w.id);
      const sum = b ? b.reduce((s, v, i) => (i === cur ? s : s + v), 0) : 0;
      const span = Math.max(1, Math.min(60, sec - (this.dpsStart.get(w.id) ?? sec)));
      return `${w.name}  ${Math.round((sum / span) * 60).toLocaleString()}`;
    });
    this.dpsText.setText(lines.length ? ['DPM', ...lines].join('\n') : '');
  }

  /** 선분 위의 적에게 한 번 피해 (칼날 대시 등) */
  private lineDamage(l: { x1: number; y1: number; x2: number; y2: number }, w: number, dmg: number, color: number): void {
    const len = Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
    if (len < 4) return;
    const mx = (l.x1 + l.x2) / 2;
    const my = (l.y1 + l.y2) / 2;
    for (const e of this.grid.query(mx, my, len / 2 + w + MAX_ENEMY_RADIUS, this.chainBuf).slice()) {
      if (!e.active) continue;
      const t = Phaser.Math.Clamp(((e.x - l.x1) * (l.x2 - l.x1) + (e.y - l.y1) * (l.y2 - l.y1)) / (len * len), 0, 1);
      const px = l.x1 + (l.x2 - l.x1) * t;
      const py = l.y1 + (l.y2 - l.y1) * t;
      if ((e.x - px) ** 2 + (e.y - py) ** 2 < (w + e.radius) ** 2) this.damage(e, dmg, 'melee');
    }
    this.fx.lineStyle(w, color, 0.4).lineBetween(l.x1, l.y1, l.x2, l.y2);
    this.burst(l.x2, l.y2, color, 8);
  }

  view(): { x: number; y: number; width: number; height: number } {
    return this.cameras.main.worldView;
  }

  /** 해커가 살아 있으면 블랙 실드 요원 전원(해커 포함)이 CC 완전 면역 (기절·둔화·끌어당김·넉백·조종) */
  private hackerShield(e: Enemy): boolean {
    if (!e.id.startsWith('trooper_')) return false;
    const on = this.enemyPool.items.some((o) => o.active && o.id === 'trooper_hacker');
    // 막을 때 해커가 말풍선으로 외친다 (출동당 한 번, 진의 문자 대신: 해커가 막고 있다는 걸 대사로 알림)
    if (on && this.hackShoutRaid !== this.raidCount) {
      const h = this.enemyPool.items.find((o) => o.active && o.id === 'trooper_hacker');
      if (h && h.dropT <= 0 && h.landT <= 0) {
        this.hackShoutRaid = this.raidCount;
        this.shout(h, tr('squad.hacker.block'), 0);
      }
    }
    return on;
  }

  ccMul(e: Enemy): number {
    return this.hackerShield(e) ? 0 : 1;
  }

  /** 실 인형: 적을 잠깐 조종해 다른 적과 싸우게 한다 (보스 제외) */
  charm(e: Enemy, seconds: number): void {
    if (!e.active || e.isBoss) return;
    if (this.hackerShield(e)) return;
    e.charmT = Math.max(e.charmT, seconds * (1 + this.kit.v('syn.hack2') / 100));
    e.sprite.setTint(e.psycho ? PSYCHO_TINT : CHARM_TINT);
  }

  stun(e: Enemy, seconds: number): void {
    if (!e.active || e.isBoss || e.id === 'c_insulator' || e.id === 'c_thorn') return;
    if (this.hackerShield(e)) return;
    e.stun = Math.max(e.stun, seconds);
    e.sprite.setTint(0x66ffff);
  }

  slow(e: Enemy, seconds: number): void {
    if (e.id === 'c_prism') return;
    if (this.hackerShield(e)) return;
    e.slowT = Math.max(e.slowT, seconds);
  }

  jammed(x: number, y: number): boolean {
    const r = CT.jamRadius;
    for (const e of this.grid.query(x, y, r, this.jamBuf)) if (e.active && e.id === 'c_firewall' && (e.x - x) ** 2 + (e.y - y) ** 2 < r * r) return true;
    return false;
  }

  /** 가시 갑주병을 근접으로 때리면 플레이어도 조금 다친다 */
  private thornReflect(): void {
    if (this.thornT > 0 || this.player.invuln > 0) return;
    this.thornT = CT.thornGap;
    this.hurtPlayer(CT.thornReflect, { kind: 'thorn', id: 'c_thorn' });
  }

  blockEnemyBullets(x: number, y: number, r: number): number {
    let n = 0;
    for (const b of this.enemyBullets.items) {
      if (!b.active) continue;
      if ((b.x - x) ** 2 + (b.y - y) ** 2 < (r + b.radius) ** 2) {
        b.kill();
        this.burst(b.x, b.y, COLORS.cyan, 3);
        Sound.play('block');
        n++;
      }
    }
    return n;
  }

  reflectEnemyBullets(x: number, y: number, r: number, inArc: (bx: number, by: number) => boolean, dmg: number): number {
    let n = 0;
    for (const b of this.enemyBullets.items) {
      if (!b.active || (b.x - x) ** 2 + (b.y - y) ** 2 > (r + b.radius) ** 2 || !inArc(b.x, b.y)) continue;
      const a = Math.atan2(-b.vy, -b.vx);
      const bx = b.x;
      const by = b.y;
      b.kill();
      this.burst(bx, by, COLORS.cyan, 3);
      this.fireBullet(bx, by, a, 360, dmg, { pierce: 1, life: 0.9, turnRate: 0, texture: 'wave', scale: 0.5, tag: 'melee' });
      n++;
    }
    if (n) Sound.play('block');
    return n;
  }

  interceptEnemyBullet(x: number, y: number, r: number): { x: number; y: number } | null {
    let best: EnemyBullet | null = null;
    let bd = r * r;
    for (const b of this.enemyBullets.items) {
      if (!b.active) continue;
      const d = (b.x - x) ** 2 + (b.y - y) ** 2;
      if (d < bd) ((bd = d), (best = b));
    }
    if (!best) return null;
    const at = { x: best.x, y: best.y };
    best.kill();
    return at;
  }

  /** 연결 칩셋: 이어진 적 무리 (같은 무리는 같은 객체) */
  private wireLinks = new Map<Enemy, { members: Enemy[]; t: number; pct: number }>();

  linkEnemies(list: Enemy[], seconds: number, pct: number): void {
    const g = { members: list.slice(), t: seconds, pct };
    for (const e of list) this.wireLinks.set(e, g);
  }

  /** 이어진 적이 맞으면 나머지도 pct% 피해 (시너지 피해라 다시 퍼지지 않음) */
  private linkShare(e: Enemy, amount: number, tag?: DamageTag): void {
    const g = this.wireLinks.get(e);
    if (!g || g.t <= 0) return;
    for (const o of g.members) if (o !== e && o.active) this.synDamage(o, (amount * g.pct) / 100, tag);
  }

  private updateLinks(dt: number): void {
    if (!this.wireLinks.size) return;
    const seen = new Set<object>();
    for (const [e, g] of this.wireLinks) {
      if (!seen.has(g)) {
        seen.add(g);
        g.t -= dt;
        const live = g.members.filter((m) => m.active);
        for (let i = 1; i < live.length; i++) this.fx.lineStyle(1, COLORS.magenta, 0.5).lineBetween(live[i - 1].x, live[i - 1].y, live[i].x, live[i].y);
      }
      if (g.t <= 0 || !e.active) this.wireLinks.delete(e);
    }
  }

  launchEnemy(e: Enemy, seconds: number, dmg: number): void {
    if (!e.active || e.isBoss || e.flying || e.airT > 0 || this.ccMul(e) <= 0) return;
    e.airT = e.airMax = seconds;
    e.airDmg = dmg;
  }

  /** 떠 있는 적: 공격·이동 없이 포물선으로 떴다가, 떨어지면 피해 */
  private updateAir(e: Enemy, dt: number): void {
    e.airT -= dt;
    if (e.airT <= 0) {
      e.airT = 0;
      this.placeEnemy(e);
      this.burst(e.x, e.y, COLORS.orange, 5);
      this.synDamage(e, e.airDmg, 'explosive');
      return;
    }
    const k = 1 - e.airT / e.airMax;
    this.placeEnemy(e);
    e.sprite.y -= Math.sin(k * Math.PI) * AIR_LIFT;
  }

  // ───────────── 태그 시너지 5단계 (해킹 사이코시스는 updatePsycho) ─────────────
  private elecHits = 0;
  private boomCount = 0;
  private meleeKills5 = 0;
  private mechKills = 0;
  /** 정밀 5단계 집중: 겹친 공격 속도 증가마다 끝나는 시각 */
  private focusUntil: number[] = [];
  /** 기계 5단계 부품 조립: 따라다니는 작은 드론 */
  private miniDrones: { t: number; fire: number; a: number; img: Phaser.GameObjects.Image }[] = [];

  boomScale(): number {
    const L = this.kit;
    if (!L.has('syn.boom5') || ++this.boomCount < L.v('syn.boom5', 'n', 10)) return 1;
    this.boomCount = 0;
    this.shake(120, 0.004);
    return L.v('syn.boom5', 'mul', 2);
  }

  /** 전기 5단계: 화면 안 모든 적에게 방전 (시너지 피해라 다시 퍼지지 않음) */
  private overcharge(dmg: number): void {
    let n = 0;
    for (const o of this.enemyPool.items) {
      if (!o.active || !this.onScreen(o.x, o.y)) continue;
      if (n++ < 40) this.fx.lineStyle(1, COLORS.cyan, 0.8).lineBetween(o.x, o.y - 120, o.x, o.y);
      this.synDamage(o, dmg * this.stats.damageMul, 'electric');
    }
    this.screenFlash(0xe8f7ff, 0.12, 150);
    Sound.play('glitch');
  }

  /** 처치 때 5단계 셈: 근접 연속 돌진, 정밀 집중, 기계 부품 조립 */
  private tier5Kill(tag: DamageTag | undefined, src: string | null, crit: boolean): void {
    const L = this.kit;
    const melee = tag === 'melee' || (!!src && (this.wTags.get(src) ?? []).includes('근접'));
    if (L.has('syn.melee5') && melee && ++this.meleeKills5 >= L.v('syn.melee5', 'n', 15)) {
      this.meleeKills5 = 0;
      if (this.player.dashCd > 0) {
        this.player.dashCd = 0;
        this.burst(this.player.x, this.player.y, COLORS.cyan, 8);
      }
    }
    if (L.has('syn.prec5') && crit) {
      const max = L.v('syn.prec5', 'max', 5);
      this.focusUntil.push(this.elapsed + L.v('syn.prec5', 't', 3));
      if (this.focusUntil.length > max) this.focusUntil.shift();
    }
    if (L.has('syn.mech5') && (src === 'hackDrone' || src === 'turret' || src === 'miniDrone') && ++this.mechKills >= L.v('syn.mech5', 'n', 30)) {
      this.mechKills = 0;
      if (this.miniDrones.length < L.v('syn.mech5', 'max', 3)) {
        const img = this.add.image(this.player.x, this.player.y, 'hackdrone').setScale(0.6).setDepth(18).setTint(0xfff23a);
        this.miniDrones.push({ t: L.v('syn.mech5', 't', 10), fire: 0.3, a: Math.random() * Math.PI * 2, img });
      }
    }
  }

  /** 정밀 5단계 집중: 지금 겹친 수 */
  private get focusStacks(): number {
    if (!this.focusUntil.length) return 0;
    this.focusUntil = this.focusUntil.filter((t) => t > this.elapsed);
    return this.focusUntil.length;
  }

  /** 기계 5단계: 작은 드론이 플레이어 둘레를 돌며 가장 가까운 적에게 사격 */
  private updateMiniDrones(dt: number): void {
    if (!this.miniDrones.length) return;
    const p = this.player;
    for (const d of this.miniDrones) {
      d.t -= dt;
      d.a += dt * 2;
      const x = p.x + Math.cos(d.a) * 28;
      const y = p.y + Math.sin(d.a) * 18 - 14;
      d.img.setPosition(x, y).setAlpha(d.t < 2 && Math.floor(d.t * 6) % 2 ? 0.4 : 1);
      if ((d.fire -= dt) > 0) continue;
      d.fire = MINI_DRONE.gap * this.stats.cooldownMul;
      let best: Enemy | null = null;
      let bd = MINI_DRONE.range ** 2;
      for (const e of this.grid.query(x, y, MINI_DRONE.range, this.chainBuf)) {
        if (!e.active || e.charmT > 0) continue;
        const dd = (e.x - x) ** 2 + (e.y - y) ** 2;
        if (dd < bd) ((bd = dd), (best = e));
      }
      if (!best) continue;
      const prev = this.dmgSrc;
      this.dmgSrc = 'miniDrone';
      this.fireBullet(x, y, Math.atan2(best.y - y, best.x - x), 340, MINI_DRONE.damage * this.stats.damageMul, { target: best, turnRate: 8, life: 0.8 });
      this.dmgSrc = prev;
    }
    for (const d of this.miniDrones) if (d.t <= 0) d.img.destroy();
    this.miniDrones = this.miniDrones.filter((d) => d.t > 0);
  }

  screenFlash(color: number, alpha: number, ms: number): void {
    if (Settings.reducedFx) return;
    this.tweens.killTweensOf(this.flashRect);
    this.flashRect.setFillStyle(color, 1).setAlpha(alpha).setVisible(true);
    this.tweens.add({ targets: this.flashRect, alpha: 0, duration: ms, onComplete: () => this.flashRect.setVisible(false) });
  }

  private shake(ms: number, intensity: number): void {
    if (!Settings.reducedFx) this.cameras.main.shake(ms, intensity);
  }

  sfx(key: SfxKey): void {
    Sound.play(key);
  }

  blockEnemyBulletsRing(rIn: number, rOut: number): number {
    const p = this.player;
    let n = 0;
    for (const b of this.enemyBullets.items) {
      if (!b.active) continue;
      const d2 = (b.x - p.x) ** 2 + (b.y - p.y) ** 2;
      if (d2 >= rIn * rIn && d2 <= rOut * rOut) {
        b.kill();
        this.burst(b.x, b.y, COLORS.cyan, 3);
        Sound.play('block');
        n++;
      }
    }
    return n;
  }

  onScreen(x: number, y: number): boolean {
    const c = this.cameras.main;
    return x > c.scrollX - 8 && x < c.scrollX + VIEW_W + 8 && y > c.scrollY - 8 && y < c.scrollY + VIEW_H + 8;
  }

  burst(x: number, y: number, color: number, count: number): void {
    this.sparks.setParticleTint(color);
    this.sparks.explode(count, x, y);
  }

  // ───────────────────────────── 상태 전환 ─────────────────────────────
  private onBlur(): void {
    if (this.state === 'play') this.togglePause();
  }

  private togglePause(): void {
    if (this.state !== 'play' && this.state !== 'paused') return;
    this.state = this.state === 'play' ? 'paused' : 'play';
    Sound.duck(this.state === 'paused' ? 0.3 : 1);
    this.hud.center.setText(this.state === 'paused' ? (isTouch() ? tr('pause.touch') : tr('pause.desktop')) : '').setVisible(this.state === 'paused');
    this.showPauseMenu(this.state === 'paused');
  }

  private pauseUi: Phaser.GameObjects.GameObject[] = [];
  private lastHit: HitSrc | null = null;
  private pickupStep = 0;
  private pickupAt = -1e9;
  /** 화면 아래 설정 버튼 (소리·화면 효과·전체화면): 일시정지 때만 보인다 */
  private settingUi: Phaser.GameObjects.Text[] = [];
  private pauseBtn!: Phaser.GameObjects.Text;
  /** 시공간 가속 모듈: 1배속 / 2배속 (2챕터 첫 도달 때 영구 해금) */
  private speedBtn: Phaser.GameObjects.Container | null = null;
  private gameSpeed = 1;

  /** 일시정지 버튼 왼쪽의 배속 버튼 (▶ 1X / ▶▶ 2X, 삼각형은 글꼴 대신 직접 그림) */
  private makeSpeedBtn(): void {
    const h = this.pauseBtn.height;
    const w = 48;
    const b = this.add
      .container(this.pauseBtn.x - this.pauseBtn.width - 4 - w, this.pauseBtn.y)
      .setScrollFactor(0)
      .setDepth(160)
      .setSize(w, h)
      // 컨테이너의 판정 영역은 가운데 기준이라 (w/2, h/2)만큼 옮겨 그림과 맞추고, 손가락용으로 위·아래·왼쪽을 넉넉히 넓힌다
      .setInteractive(new Phaser.Geom.Rectangle(w / 2 - 10, h / 2 - 8, w + 12, h + 16), Phaser.Geom.Rectangle.Contains);
    b.add(this.add.rectangle(0, 0, w, h, 0x1a1030).setOrigin(0));
    b.add(this.add.graphics());
    b.add(this.add.text(w - 6, h / 2, '', { ...TEXT, fontSize: '12px' }).setOrigin(1, 0.5));
    if (b.input) b.input.cursor = 'pointer';
    b.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      if (this.state !== 'play') return;
      this.setSpeed(this.gameSpeed === 2 ? 1 : 2);
      Sound.play('select');
    });
    this.speedBtn = b;
    this.setSpeed(this.gameSpeed);
  }

  private setSpeed(v: number): void {
    this.gameSpeed = v;
    if (Save.data.speed2 !== (v === 2)) {
      Save.data.speed2 = v === 2;
      Save.write();
    }
    const b = this.speedBtn;
    if (!b) return;
    const [bg, g, label] = b.list as [Phaser.GameObjects.Rectangle, Phaser.GameObjects.Graphics, Phaser.GameObjects.Text];
    const on = v === 2;
    bg.setFillStyle(on ? COLORS.cyan : 0x1a1030);
    const ink = on ? 0x07060f : 0xe8f7ff;
    label.setText(on ? '2X' : '1X').setColor(on ? '#07060f' : '#e8f7ff');
    const cy = b.height / 2;
    g.clear().fillStyle(ink);
    for (let i = 0; i < v; i++) g.fillTriangle(7 + i * 8, cy - 5, 7 + i * 8, cy + 5, 14 + i * 8, cy);
  }

  /** 개발자 도구(AI 표시 빌드·?ai·?debug): 3배속·무적·1분 건너뛰기·보스 무적·레벨업·보스 소환 (관찰·테스트용, 저장하지 않음) */
  /** 개발자 도구 버튼들 (일시정지 장비창을 가리지 않게 일시정지 중엔 숨김) */
  private devUi: Phaser.GameObjects.Text[] = [];
  /** 왼쪽 아래 개발자 버튼 줄 (접기·펴기 대상) */
  private devRows: Phaser.GameObjects.Text[] = [];
  /** 개발자 버튼 줄을 접었는지 (다음 판에도 기억) */
  private devFolded = false;

  /** 개발자 버튼 보이기: 일시정지 중엔 모두 숨김, 접었으면 접기 버튼만 */
  private syncDevUi(show: boolean): void {
    for (const b of this.devUi) b.setVisible(show && (!this.devFolded || !this.devRows.includes(b)));
  }

  private makeAiTools(): void {
    const mk = (y: number, label: () => string, toggle: () => void) => {
      const t = this.add
        .text(VIEW_W - 8, y, label(), { ...TEXT, fontSize: '10px', color: '#fff23a', backgroundColor: '#1a1030', padding: { x: 6, y: 2 } })
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(160)
        .setInteractive({ useHandCursor: true });
      this.devUi.push(t);
      t.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        toggle();
        t.setText(label());
        Sound.play('select');
      });
      return t;
    };
    let normal = this.gameSpeed;
    mk(66, () => `3배속: ${this.gameSpeed === 3 ? '켬' : '끔'}`, () => {
      if (this.gameSpeed === 3) this.gameSpeed = normal;
      else {
        normal = this.gameSpeed;
        this.gameSpeed = 3;
      }
    });
    mk(84, () => `무적: ${this.god ? '켬' : '끔'}`, () => (this.god = !this.god));
    // 1분 건너뛰기: 게임 시간만 60초 앞으로 (스폰·보스·습격 시각이 그만큼 당겨짐)
    mk(102, () => '+1분', () => (this.elapsed += 60));
    // 아래 왼쪽 줄: 보스 무적·레벨업·보스 소환 (오른쪽은 무전 창과 겹쳐서)
    const row = (y: number, items: [() => string, () => void][]) => {
      let x = 8;
      for (const [label, act] of items) {
        const t = this.add
          .text(x, y, label(), { ...TEXT, fontSize: '10px', color: '#fff23a', backgroundColor: '#1a1030', padding: { x: 5, y: 2 } })
          .setScrollFactor(0)
          .setDepth(160)
          .setInteractive({ useHandCursor: true });
        this.devUi.push(t);
        this.devRows.push(t);
        t.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
          e.stopPropagation();
          act();
          t.setText(label());
          Sound.play('select');
        });
        x += t.width + 4;
      }
    };
    // 접기·펴기 버튼 (버튼 줄 바로 위)
    try {
      this.devFolded = localStorage.getItem('ztl-dev-folded') === '1';
    } catch {
      this.devFolded = false;
    }
    const fold = this.add
      .text(8, VIEW_H - 99, '', { ...TEXT, fontSize: '10px', color: '#fff23a', backgroundColor: '#3a1a5a', padding: { x: 5, y: 2 } })
      .setScrollFactor(0)
      .setDepth(160)
      .setInteractive({ useHandCursor: true });
    const foldLabel = () => fold.setText(this.devFolded ? '개발 도구 ▶' : '개발 도구 ▼').setY(this.devFolded ? VIEW_H - 26 : VIEW_H - 99);
    foldLabel();
    this.devUi.push(fold);
    fold.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      this.devFolded = !this.devFolded;
      try {
        localStorage.setItem('ztl-dev-folded', this.devFolded ? '1' : '0');
      } catch {
        // 저장이 막혀 있으면 이번 판만
      }
      foldLabel();
      this.syncDevUi(this.state !== 'paused');
      Sound.play('select');
    });
    row(VIEW_H - 80, [
      // 자동 조준: 가까운 적을 노리고 알아서 쏨 (봇·관찰용)
      [() => `자동 조준: ${this.controls.autoAim ? '켬' : '끔'}`, () => (this.controls.autoAim = !this.controls.autoAim)],
      // 개편 2-3: OS 고르기·레벨 (판 밖 뽑기가 생기기 전 임시, 다음 판에도 기억)
      [
        () => `OS: ${this.os.name} ▶`,
        () => {
          const next = OS_IDS[(OS_IDS.indexOf(this.os.id) + 1) % OS_IDS.length];
          const lv = OS_DEFS[next].active ? this.os.level : 1;
          this.setOs(next, lv);
          saveDevOsPick(next, lv);
        },
      ],
      [
        () => `OS Lv${this.os.level} ▲`,
        () => {
          const max = this.os.def.levels.length;
          const lv = (this.os.level % max) + 1;
          this.setOs(this.os.id, lv);
          saveDevOsPick(this.os.id, lv);
        },
      ],
      [() => 'Q 충전', () => this.os.hasActive && !this.specialOn && ((this.osCdT = 0), (this.odGauge = 100))],
    ]);
    row(VIEW_H - 62, [
      // 보스만 무적 (보스 패턴 관찰용)
      [() => `보스 무적: ${this.bossGod ? '켬' : '끔'}`, () => (this.bossGod = !this.bossGod)],
      // 레벨업 한 번 (카드 고르기 화면이 바로 뜸)
      [
        () => '레벨업 +1',
        () => {
          this.level++;
          this.pendingLevels++;
        },
      ],
      // 일반 몹 제거: 보스와 보스 소환 부하를 뺀 적을 보상 없이 치움
      [
        () => '일반몹 제거',
        () => {
          for (const e of this.enemyPool.items) if (e.active && !e.isBoss && !this.bossSummoned.includes(e) && !this.basiliGuards.includes(e)) e.kill();
        },
      ],
    ]);
    // 보스 소환: 그 보스의 구역으로 바꾸고 (있던 보스는 보상 없이 치움) 바로 소환
    const SHORT: Record<string, string> = { midboss: '코박', boss: '바실리', midboss2: '그레고르', boss2: 'XM-4', midboss3: '노라', boss3: '센서스' };
    const items = gameData.bosses.map((d) => [() => SHORT[d.id] ?? d.id, () => this.devSpawnBoss(d as BossDef)] as [() => string, () => void]);
    row(VIEW_H - 44, [[() => '보스 소환 ▶', () => {}], ...items.slice(0, 3)]);
    row(VIEW_H - 26, items.slice(3));
    this.syncDevUi(true);
  }

  /** 개발자 도구: 보스 바로 소환 (구역 전환, 있던 보스는 보상 없이 치움) */
  private devSpawnBoss(def: BossDef): void {
    if (this.state !== 'play') return;
    const e = this.boss;
    if (e) {
      if (this.cine) this.endCine();
      this.boss = null;
      this.hookChain?.setVisible(false);
      this.hookHead?.setVisible(false);
      this.hookTrail?.setVisible(false);
      this.basiliGlow?.setVisible(false);
      this.basiliCore?.setVisible(false);
      this.basiliShadow?.setVisible(false);
      this.basiliFlash?.setVisible(false);
      this.basiliReflect?.setVisible(false);
      this.basiliHalo?.setVisible(false);
      this.stompRings = [];
      this.containers = [];
      this.clearPlasma();
      this.hideXm4Layers();
      this.bossDef = null;
      e.kill();
      this.hud.bossName.setText('');
      this.clearArena();
    }
    const zi = ZONES.findIndex((z) => z.id === def.zone);
    if (zi >= 0 && zi !== this.zoneIdx) {
      this.zoneIdx = zi;
      this.applyZone(false);
    }
    this.bossesSpawned = gameData.bosses.filter((b) => b.zone === def.zone).findIndex((b) => b.id === def.id);
    this.spawnBoss(def);
  }

  /** 2챕터 첫 도달: 픽서가 넘겨 준 가속 모듈 제어 코드로 배속 버튼이 열린다 */
  private unlockSpeed(): void {
    if (Save.data.speedUnlocked) return;
    Save.data.speedUnlocked = true;
    Save.write();
    this.makeSpeedBtn();
    const b = this.speedBtn!;
    this.tweens.add({ targets: b, alpha: 0.25, duration: 200, yoyo: true, repeat: 4, ease: 'Sine.inOut' });
  }

  /** 장비창에 넘길 정보. OS 칸: 이름 + 레벨, 자세히에는 레벨별 능력 줄 (● 켜짐, ○ 아직) */
  private equipInput(): Parameters<typeof buildEquipPanel>[1] {
    const os = this.os;
    const osDesc = os.lines().map((l, i) => `${l.on ? '●' : '○'} ${i + 1}. ${l.text}`).join('\n');
    return { weapons: this.weapons, sockets: this.sockets, os: { id: os.id, name: `${os.name} Lv${os.level}`, color: os.def.color, desc: osDesc }, tagCount: this.kit.tagCount, tiers: this.kit.tiers, combos: this.kit.combos, chipsets: this.chipsets };
  }

  // ───── 카드 고르기 중 인벤토리 보기 (레벨업·보급 상자·능력 고르기) ─────
  private invBtn: Phaser.GameObjects.Text | null = null;
  private invPanel: Phaser.GameObjects.Container | null = null;
  /** 카드가 비쳐 보이지 않게 까는 어두운 판 */
  private invBack: Phaser.GameObjects.Rectangle | null = null;

  private makeInvButton(): void {
    this.invBtn = this.add
      .text(8, VIEW_H - 30, tr('inv.button'), { ...TEXT, fontSize: '11px', color: '#00f0ff', backgroundColor: '#120a24', padding: { x: 8, y: 5 } })
      .setScrollFactor(0)
      .setDepth(305)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.invBtn.on('pointerup', () => this.toggleInv());
    this.input.keyboard!.on('keydown-I', () => (this.invPanel || this.invBtn?.visible) && this.toggleInv());
  }

  /** 카드 화면이 열려 있을 때만 버튼을 보임 */
  private syncInvButton(): void {
    const show = this.state === 'levelup' && this.levelUi.open && !this.invPanel;
    this.invBtn?.setVisible(show);
    if (this.invPanel && !(this.state === 'levelup' && this.levelUi.open)) this.closeInv();
  }

  private toggleInv(): void {
    if (this.invPanel) return this.closeInv();
    if (this.state !== 'levelup' || !this.levelUi.open) return;
    Sound.play('select');
    this.levelUi.suspendKeys(true);
    this.invBack = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x07060f, 0.88).setOrigin(0).setScrollFactor(0).setDepth(399).setInteractive();
    this.invPanel = buildEquipPanel(this, this.equipInput(), { onResume: () => this.closeInv() }).setDepth(400);
    this.invBtn?.setVisible(false);
  }

  private closeInv(): void {
    if (!this.invPanel) return;
    this.invPanel.destroy();
    this.invPanel = null;
    this.invBack?.destroy();
    this.invBack = null;
    this.levelUi.suspendKeys(false);
    Sound.play('hover');
  }

  /** 일시정지 화면의 '임무 포기' 버튼 (누르면 한 번 더 묻고, 포기하면 패배로 결과 화면) */
  private showPauseMenu(on: boolean): void {
    for (const o of this.pauseUi) o.destroy();
    this.pauseUi = [];
    for (const b of this.settingUi) b.setVisible(on);
    this.syncDevUi(!on);
    if (!on) return;
    // 뒤를 어둡게 해서 글자가 잘 보이게
    this.pauseUi.push(this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x000000, 0.5).setOrigin(0).setScrollFactor(0).setDepth(99));
    const btn = (x: number, y: number, label: string, color: string, onClick: () => void) => {
      const b = this.add
        .text(x, y, label, { ...TEXT, fontSize: '13px', color, backgroundColor: '#120a24', padding: { x: 12, y: 6 } })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(130)
        .setInteractive({ useHandCursor: true });
      b.on('pointerup', () => onClick());
      this.pauseUi.push(b);
      return b;
    };
    const abandon = () => {
      for (const o of this.pauseUi.slice(1)) o.destroy();
      this.pauseUi = this.pauseUi.slice(0, 1);
      this.hud.center.setVisible(false);
      const ask = this.add
        .text(VIEW_W / 2, VIEW_H / 2 + 20, tr('pause.abandonAsk'), { ...TEXT, fontSize: '12px', color: '#e8f7ff', align: 'center' })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(130);
      this.pauseUi.push(ask);
      btn(VIEW_W / 2 - 50, VIEW_H / 2 + 76, tr('pause.yes'), '#ff5a6a', () => {
        this.showPauseMenu(false);
        this.hud.center.setVisible(false);
        this.state = 'play';
        Sound.duck(1);
        this.endRun(false);
      });
      btn(VIEW_W / 2 + 50, VIEW_H / 2 + 76, tr('pause.no'), '#00f0ff', () => {
        this.hud.center.setVisible(this.state === 'paused');
        this.showPauseMenu(true);
      });
    };
    // UI: 장비창 (소켓 8칸 인체도 + 자세히·시너지·조합)
    this.pauseUi.push(buildEquipPanel(this, this.equipInput(), { onResume: () => this.togglePause(), onAbandon: abandon }));
    this.hud.center.setVisible(false);
  }

  /** 일시정지 화면 위쪽: 지금 가진 무기·사이버웨어·추가 강화 카드. 누르면 효과를 보여준다 */
  private buildPanel(): void {
    const rar = (id: string) => gameData.rarity.find((r) => r.id === id)!;
    const items: { tex: string; title: string; sub: string; detail: string; color: string }[] = [];
    for (const w of this.weapons) {
      const l = abilitiesData.weapons[w.id as WeaponId];
      const abil = [...w.abilities].map((id) => {
        const myth = l.mythic.find((a) => a.id === id);
        const a = myth ?? l.legendary.find((x) => x.id === id);
        return a ? `★ ${a.name} (${rar(myth ? 'mythic' : 'legendary').label})\n${a.desc}` : '';
      });
      const best = [...w.abilities].some((id) => l.mythic.some((a) => a.id === id)) ? 'mythic' : w.abilities.size ? 'legendary' : '';
      items.push({ tex: `card_${w.id}`, title: w.name, sub: `Lv.${w.level}`, detail: [weaponsData[w.id as WeaponId].desc, ...abil.filter(Boolean)].join('\n'), color: best ? rar(best).color : '#e8f7ff' });
    }
    for (const [id, st] of this.passives) {
      const abil = (st.abilities ?? []).map((a) => passiveAbility(id, a)).filter((a): a is NonNullable<typeof a> => !!a);
      items.push({
        tex: `card_${id}`,
        title: passivesData[id].name,
        sub: `Lv.${st.level}`,
        detail: [passivesData[id].desc.replace('{v}', String(Math.round(st.total))), ...abil.map((a) => `★ ${a.name}\n${a.desc}`)].join('\n'),
        color: abil.length ? rar('legendary').color : '#e8f7ff',
      });
    }
    {
      const os = this.os;
      const lines = os.lines().map((l, i) => `${l.on ? '●' : '○'} ${i + 1}. ${l.text}`);
      items.push({ tex: '', title: os.name, sub: `OS Lv.${os.level}`, detail: [`${os.def.tags.length ? `[${os.def.tags.join('·')}]` : ''}`, ...lines].filter(Boolean).join('\n'), color: os.def.color });
    }
    for (const k of this.sockets.values()) {
      const kind = ITEMS[k.id].kind as ItemKind;
      items.push({ tex: `card_${itemArt(k.id)}`, title: itemName(kind, k.id), sub: `Lv.${k.level}`, detail: `${socketLabel(kind, k.id)}\n${itemText(k.id, k.level, k.rarity)}${this.tagLine(kind, k.id)}`, color: rar(k.rarity).color });
    }
    // 켜진 시너지 (태그 단계·조합)
    const L = this.kit;
    if (L.tiers.length || L.combos.length) {
      const tagSum = [...L.tagCount].filter(([, n]) => n >= 2).map(([t, n]) => `${t} ${n}`).join(' · ');
      items.push({ tex: '', title: tr('syn.title'), sub: `${L.tiers.length + L.combos.length}`, detail: [tagSum, ...L.tiers.map((t) => `${t.tag} ${t.count}: ${t.text}`), ...L.combos.map((c) => `★ ${c.name}: ${c.text}`)].join('\n'), color: '#fff23a' });
    }
    for (const o of gameData.overflow) {
      const v = this.overflow[o.id];
      if (!v) continue;
      items.push({ tex: `card_${o.id}`, title: o.name, sub: `+${v}`, detail: o.desc.replace('{v}', String(v)), color: '#8a7aa8' });
    }
    if (!items.length) return;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(131);
      this.pauseUi.push(o);
      return o;
    };
    const gap = 5;
    const tw = Math.min(62, Math.floor((VIEW_W - 40 - gap * (items.length - 1)) / items.length));
    const th = 54;
    const x0 = VIEW_W / 2 - (items.length * tw + (items.length - 1) * gap) / 2;
    const y0 = 66;
    add(this.add.text(VIEW_W / 2, y0 - 4, tr('pause.build'), { ...TEXT, fontSize: '9px', color: '#8a7aa8' }).setOrigin(0.5, 1));
    let open = -1;
    let detail: Phaser.GameObjects.GameObject[] = [];
    const tiles: Phaser.GameObjects.Rectangle[] = [];
    const close = () => {
      for (const o of detail) o.destroy();
      detail = [];
      if (open >= 0) tiles[open]?.setFillStyle(0x120a24, 0.95);
      open = -1;
      this.hud.center.setVisible(this.state === 'paused');
    };
    items.forEach((it, i) => {
      const x = x0 + i * (tw + gap);
      const col = Phaser.Display.Color.HexStringToColor(it.color).color;
      const tile = add(this.add.rectangle(x, y0, tw, th, 0x120a24, 0.95).setOrigin(0).setStrokeStyle(1, col, 0.9));
      tiles.push(tile);
      if (this.textures.exists(it.tex)) {
        const img = add(this.add.image(x + tw / 2, y0 + 17, it.tex));
        img.setScale(Math.min(26 / img.width, 26 / img.height));
      }
      const name = add(this.add.text(x + tw / 2, y0 + 33, it.title, { ...TEXT, fontSize: '8px', color: it.color }).setOrigin(0.5, 0));
      if (name.width > tw - 4) name.setScale((tw - 4) / name.width);
      add(this.add.text(x + tw / 2, y0 + 43, it.sub, { ...TEXT, fontSize: '8px', color: '#39ff88' }).setOrigin(0.5, 0));
      // 누른 카드에서 떼야 열린다 (이동하다 손을 뗀 경우는 무시)
      let armed = false;
      tile.setInteractive({ useHandCursor: true });
      tile.on('pointerdown', () => (armed = true));
      tile.on('pointerout', () => (armed = false));
      tile.on('pointerup', () => {
        if (!armed) return;
        armed = false;
        const same = open === i;
        close();
        if (same) return;
        open = i;
        tile.setFillStyle(0x2a1650, 0.95);
        this.hud.center.setVisible(false);
        Sound.play('hover');
        const txt = this.add
          .text(VIEW_W / 2, y0 + th + 12, `${it.title}  ${it.sub}\n${it.detail}`, { ...TEXT, fontSize: '11px', color: '#e8f7ff', align: 'center', lineSpacing: 2, wordWrap: { width: 420, useAdvancedWrap: true } })
          .setOrigin(0.5, 0)
          .setScrollFactor(0)
          .setDepth(132);
        const bg = this.add
          .rectangle(VIEW_W / 2, txt.y - 6, txt.width + 20, txt.height + 12, 0x0d0820, 0.95)
          .setOrigin(0.5, 0)
          .setStrokeStyle(1, col, 0.8)
          .setScrollFactor(0)
          .setDepth(131.5);
        detail = [bg, txt];
        this.pauseUi.push(bg, txt);
      });
    });
  }

  /** 게임오버 화면에 띄울 사인과 픽서의 한마디 */
  private deathCause(): { cause: string; remark: string } {
    const h = this.lastHit;
    const p = this.player;
    const name = h ? this.enemyName(h.id) : '';
    let near = 0;
    for (const e of this.enemyPool.items) if (e.active && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < 80 * 80) near++;
    const key = (k: string) => k as Parameters<typeof tr>[0];
    let cause = tr('death.unknown');
    if (h && (name || h.kind === 'laser')) cause = tr(key(`death.${h.kind}`), { name });
    if (h?.kind === 'contact' && near >= 12) cause = tr('death.swarm', { n: near });
    let tip = 'default';
    if (this.zoneIdx > 0 && this.elapsed - this.zoneStart < 150) tip = 'zone';
    else if (this.boss) tip = 'boss';
    else if (h?.id.startsWith('trooper')) tip = 'raid';
    else if (near >= 12) tip = 'swarm';
    else if (h?.kind === 'bullet' || h?.kind === 'missile') tip = 'bullet';
    const bossName = this.boss ? enemiesData[this.boss.id as EnemyId].name : '';
    // 챕터마다 다른 첫마디 + 상황별 조언
    const open = tr(key(`death.open.${Math.min(this.zoneIdx, 2)}`));
    return { cause, remark: `${zonesData.client.name}: "${open} ${tr(key(`death.tip.${tip}`), { name: bossName })}"` };
  }

  private openLevelUp(reroll = false): void {
    if (this.state === 'play') Sound.play('levelup');
    this.state = 'levelup';
    // 보스 보상이 남아 있으면 먼저 연다 (모든 카드가 전설·신화)
    this.rewardOpen = this.bossRewards > 0;
    if (!reroll && !this.rewardOpen) {
      this.levelUps++;
      // 첫 판 튜토리얼: 네 번째 레벨업에 플라즈마 유탄 전설 '집속탄', 3분이 지난 뒤 첫 레벨업에 신화 '연쇄 폭발'
      const first = Save.data.stats.runs === 0;
      this.giftScreen = null;
      // 개편 2단계: 레벨업으로 특수 능력을 주지 않으므로 튜토리얼 선물 카드도 없음
      void first;
    }
    this.choices = rollChoices(this.weapons, this.passives, this.rewardOpen ? 'boss' : this.forcedRarity, {
      guaranteeWeapon: this.weapons.length < gameData.guaranteeWeaponUntil,
      pool: this.weaponPool,
      luck: this.pHas('luckCircuit'),
      upgradesOnly: true,
      sockets: this.socketCards(),
      // 칩셋: 소켓 8칸이 다 찬 뒤부터 강화 카드와 섞여 나옴. 모자라면 칩·회복 카드
      extras: (this.chipsetsOpen() ? rollChipsets(gameData.chipsetCards, this.weaponRarity()) : []).map((id) => this.chipChoice(id)),
      fillers: this.fillerChoices(),
      // 첫 판 3분 전까지: 플라즈마 유탄이 조금 더 자주, 영웅(보라) 카드가 조금 더 자주
      ...(Save.data.stats.runs === 0 && this.elapsed < 180 ? { favor: 'plasmaGrenade', favorChance: 0.35, epicMul: 2.5 } : {}),
    });
    if (this.giftScreen && !this.rewardOpen) {
      const gift = this.giftScreen === 'cluster' ? abilityCard(this.weapons, 'plasmaGrenade', 'legendary', 'cluster') : abilityCard(this.weapons, 'plasmaGrenade', 'mythic', 'chainReaction');
      if (gift) {
        const same = this.choices.findIndex((c) => c.id === gift.id);
        this.choices[same >= 0 ? same : Math.floor(Math.random() * this.choices.length)] = gift;
      }
    }
    if (!this.rewardOpen) this.forcedRarity = undefined;
    // UI: 강화 카드는 장착한 아이템의 등급·소켓·태그로 보여 줌 (카드 등급은 효과용이라 그대로 둠)
    for (const c of this.choices) {
      if (c.card || c.item || c.pickAbility || c.ability || c.chipset || c.rarity.id !== 'common') continue;
      if (c.socket) {
        const k = this.sockets.get(c.socket);
        if (k) c.card = upgradeCard({ kind: ITEMS[k.id].kind as ItemKind, id: k.id, rarity: rarityById(k.rarity), tags: itemTags(k.id), lv: k.level, desc: c.desc });
      } else if (c.kind === 'weapon') {
        const w = this.weapons.find((o) => o.id === c.id);
        if (w) c.card = upgradeCard({ kind: 'weapon', id: w.id, rarity: rarityById(w.rarity), tags: this.wTags.get(w.id) ?? weaponTags(w.id, w.abilities), lv: w.level, desc: c.desc });
      }
    }
    this.levelUi.show(
      this.choices,
      this.rerolls,
      (i) => this.pick(i),
      () => {
        this.rerolls--;
        Sound.play('reroll');
        this.openLevelUp(true);
      },
      this.rewardOpen ? 'BOSS REWARD' : 'LEVEL UP',
      this.skipButton(0, () => {
        if (this.rewardOpen) this.bossRewards--;
        else this.pendingLevels--;
      }),
    );
  }

  /** 선택 포기 버튼: 칩을 받고 다음 화면으로 (rarityIdx: 상자 최소 등급, 레벨업은 0) */
  private skipButton(rarityIdx: number, after: () => void): { label: string; onSkip: () => void } {
    const list = gameData.supply.skipChips;
    const n = list[Phaser.Math.Clamp(rarityIdx, 0, list.length - 1)];
    return {
      label: tr('lvl.skip', { n }),
      onSkip: () => {
        if (this.state !== 'levelup') return;
        this.levelUi.hide();
        this.addChips(n);
        Sound.play('select');
        after();
        this.nextScreen();
      },
    };
  }

  /** 칩 얻기 (수집 시야: 칩 획득 +%) */
  private addChips(n: number): void {
    this.chips += n * (1 + (this.kit.v('cyber.pickup', 'chip') + this.kit.v('chip.chips')) / 100);
  }

  /**
   * 이 카드를 고르면 빠지는(바꿔 끼워지는) 장착품 이름. 없으면 null (UI가 교체 확인을 받을 때 씀)
   * 무기: 같은 자리(주·보조)에 다른 무기가 있으면 / 사이버웨어·장비: 같은 부위 소켓에 다른 아이템이 있으면
   */
  replaceTarget(c: Choice): string | null {
    if (!c.item || c.promote || c.pickAbility || c.chipset || c.socket) return null;
    if (c.item.kind === 'weapon') {
      const slot = weaponSlot(c.item.id as WeaponId);
      const cur = this.weapons.find((w) => w.slot === slot);
      return cur && cur.id !== c.item.id ? cur.name : null;
    }
    const it = ITEMS[c.item.id];
    const cur = it ? this.sockets.get(it.part) : undefined;
    return cur && cur.id !== c.item.id ? itemName(it.kind as ItemKind, cur.id) : null;
  }

  private pick(i: number): void {
    const c = this.choices[i];
    if (!c || this.state !== 'levelup') return;
    if (this.giftScreen && !this.rewardOpen) {
      if (this.giftScreen === 'cluster') Save.data.tutCluster = true;
      else Save.data.tutChain = true;
      this.giftScreen = null;
      Save.write();
    }
    Sound.play('select');
    if (c.item || c.pickAbility) {
      this.pickItem(c);
      return;
    }
    if (c.chipset) {
      this.addChipset(c.chipset);
    } else if (c.id === 'fillChips') {
      this.addChips(gameData.levelFillers.chips);
    } else if (c.id === 'fillHeal') {
      this.heal(Math.round((this.player.maxHp * gameData.levelFillers.healPct) / 100));
    } else if (c.kind === 'weapon') {
      const id = c.id as WeaponId;
      const owned = this.weapons.find((o) => o.id === id);
      const w = owned ?? this.addWeapon(id);
      if (owned) w.levelUp();
      w.bonus += c.rarity.weaponBonus;
      if (c.ability) {
        w.addAbility(c.ability.id);
        this.keepables.push({ kind: 'weapon', id, abilityId: c.ability.id, rarity: c.rarity.id });
      }
      if (!owned || c.ability) this.rebuildLoadout();
    } else if (c.socket) {
      // 개편 2-2: 사이버웨어·장비 소켓 레벨 +1
      const k = this.sockets.get(c.socket);
      if (k) k.level++;
      const oldMax = this.player.maxHp;
      this.rebuildLoadout(false);
      this.player.hp += Math.max(0, this.player.maxHp - oldMax);
    } else if (c.kind === 'passive') {
      const id = c.id as PassiveId;
      const st = this.passives.get(id) ?? { level: 0, total: 0, special: false };
      // 최대 레벨 특수 능력 카드는 레벨·수치는 그대로 두고 능력만 받는다
      if (!c.maxed) st.level++;
      if (c.ability) {
        this.keepables.push({ kind: 'passive', id, abilityId: c.ability.id, rarity: c.rarity.id });
        st.special = true;
        st.abilities = [...(st.abilities ?? []), c.ability.id];
        if (c.ability.id === 'creditMagnet') this.creditMagnet = true;
      }
      {
        const amt = c.maxed ? 0 : passiveAmount(id, c.rarity);
        st.total += amt;
        // 공격 속도는 곱연산으로 쌓는다
        if (passivesData[id].stat === 'cooldownMul') st.speedMul = (st.speedMul ?? 1) * (1 + amt / 100);
      }
      this.passives.set(id, st);
      const oldMax = this.player.maxHp;
      this.recalcStats();
      if (passivesData[id].stat === 'maxHp') this.player.hp += this.player.maxHp - oldMax; // 늘어난 만큼 즉시 회복
    } else {
      // 반복 강화
      const o = gameData.overflow.find((x) => x.id === c.id)!;
      if (o.stat === 'heal') this.heal(o.amount);
      else {
        this.overflow[o.id] = (this.overflow[o.id] ?? 0) + o.amount;
        if (o.stat === 'cooldownMul') this.overflow.cdMul = (this.overflow.cdMul ?? 1) * (1 + o.amount / 100);
        const oldMax = this.player.maxHp;
        this.recalcStats();
        if (o.stat === 'maxHp') this.player.hp += this.player.maxHp - oldMax;
      }
    }
    this.levelUi.hide();
    if (this.rewardOpen) this.bossRewards--;
    else this.pendingLevels--;
    this.nextScreen();
  }

  /** 고르는 화면이 끝났을 때 다음: 능력 고르기 → 보급 상자 → 레벨업 → 게임 */
  private nextScreen(): void {
    if (!this.abilityPending) this.checkMythicAwaken();
    if (this.abilityPending) this.openAbilityPick();
    else if (this.stationOpen) this.openStation(this.stationOpen);
    else if (this.chestQueue.length) this.openChest();
    else if (this.pendingLevels > 0 || this.bossRewards > 0) this.openLevelUp();
    else this.state = 'play';
  }

  // ───────────── 개편 3단계: 상점·리퍼닥 (챕터 시간표 stations.schedule, 화면 밖에 나타남) ─────────────
  private stations: Station[] = [];
  /** 이번 챕터 시간표(stations.schedule)에서 이미 지난 칸 수 */
  private stationsFired = 0;
  /** 지금 열려 있는 상점·리퍼닥 (능력 고르기 뒤 다시 열기용) */
  private stationOpen: Station | null = null;

  /** [값, 가중치] 목록에서 하나 */
  private pickWeighted(list: number[][]): number {
    const total = list.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * total;
    for (const [v, w] of list) if ((r -= w) < 0) return v;
    return list[list.length - 1][0];
  }

  /** 보급 상자(chestEvery초마다, 플레이어 근처)와 맵 칩 줄(30초마다, 플레이어에서 한 방향으로) */
  private updateSupply(dt: number): void {
    const SU = gameData.supply;
    const p = this.player;
    if ((this.nextChestT -= dt) <= 0) {
      this.nextChestT = Phaser.Math.FloatBetween(SU.chestEvery[0], SU.chestEvery[1]);
      const a = Math.random() * Math.PI * 2;
      const d = Phaser.Math.Between(90, 140);
      this.dropChest(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
    }
    if ((this.mapChipT -= dt) <= 0) {
      const M = SU.mapChips;
      this.mapChipT = M.every;
      // 빵 부스러기: 플레이어에서 무작위 방향으로 한 줄. 보스 경계 안이면 경계 밖 칸은 버림
      const a = Math.random() * Math.PI * 2;
      const n = Phaser.Math.Between(M.count[0], M.count[1]);
      const ar = this.arena;
      for (let i = 0; i < n; i++) {
        const d = M.start + i * M.gap;
        const x = p.x + Math.cos(a) * d;
        const y = p.y + Math.sin(a) * d;
        if (ar && (x < ar.x + 16 || x > ar.x + ar.w - 16 || y < ar.y + 20 || y > ar.y + ar.h - 20)) break;
        this.dropPickup('chip', x, y, 1);
      }
    }
  }

  private clearStations(): void {
    for (const s of this.stations) {
      s.label.destroy();
      s.arrow.destroy();
    }
    this.stations = [];
    this.stationOpen = null;
  }

  private spawnStations(kinds: ('shop' | 'ripper')[]): void {
    if (!kinds.length) return;
    const ST = gameData.stations;
    const p = this.player;
    const a = Math.random() * Math.PI * 2;
    const make = (kind: 'shop' | 'ripper', ang: number): Station => {
      const x = p.x + Math.cos(ang) * ST.dist;
      const y = p.y + Math.sin(ang) * ST.dist * 0.7;
      const color = kind === 'shop' ? '#fff23a' : '#39ff88';
      const name = tr(kind === 'shop' ? 'station.shop' : 'station.ripper');
      const label = this.add.text(x, y - 22, name, { ...TEXT, fontSize: '10px', color }).setOrigin(0.5, 1).setDepth(12);
      const arrow = this.add.text(0, 0, '', { ...TEXT, fontSize: '9px', color }).setOrigin(0.5).setScrollFactor(0).setDepth(115);
      return { kind, x, y, t: ST.life, label, arrow, stock: null, rerolls: 0, healed: false, osPage: -1, priceMul: kind === 'shop' ? ST.shop.priceGrowth ** Math.max(0, this.shopsSeen - 1) : 1 };
    };
    if (kinds.includes('shop')) this.shopsSeen++;
    // 이미 떠 있는 곳과 겹치지 않게 방향을 돌림
    kinds.forEach((k, i) => this.stations.push(make(k, a + i * 2.2)));
    // 진이 알려 줌
    this.phoneMsg(tr(kinds.length > 1 ? 'station.notice' : `station.notice.${kinds[0]}`));
  }

  /** 진 무전 한 줄 (없으면 화면 가운데 안내) */
  private phoneMsg(text: string): void {
    const t = this.add.text(VIEW_W / 2, 96, text, { ...TEXT, fontSize: '11px', color: '#39ff88', backgroundColor: '#120a24cc', padding: { x: 8, y: 4 } }).setOrigin(0.5).setScrollFactor(0).setDepth(130);
    Sound.play('select');
    this.tweens.add({ targets: t, alpha: 0, delay: 2600, duration: 500, onComplete: () => t.destroy() });
  }

  private updateStations(dt: number, zt: number): void {
    const ST = gameData.stations;
    // 보스전 중이면 끝날 때까지 기다렸다가 나옴 (그 사이 다음 시간이 지나도 한 번만)
    const SC = ST.schedule as { t: number; kinds: ('shop' | 'ripper')[] }[];
    if (!this.boss && !this.arena && this.stationsFired < SC.length && zt >= SC[this.stationsFired].t) {
      const kinds = new Set<'shop' | 'ripper'>();
      while (this.stationsFired < SC.length && zt >= SC[this.stationsFired].t) for (const k of SC[this.stationsFired++].kinds) kinds.add(k);
      // 같은 종류가 아직 떠 있으면 새로 띄우지 않고 그대로 둠
      this.spawnStations([...kinds].filter((k) => !this.stations.some((s) => s.kind === k && s.t > 0)));
    }
    if (!this.stations.length) return;
    const p = this.player;
    const cam = this.cameras.main;
    const fx = this.fx;
    for (const s of this.stations) {
      s.t -= dt;
      // 보스가 나오면 문을 닫음
      if (this.boss || this.arena) s.t = 0;
      if (s.t <= 0) continue;
      const blink = s.t < 10 && Math.floor(s.t * 4) % 2 === 0 ? 0.4 : 1;
      const name = tr(s.kind === 'shop' ? 'station.shop' : 'station.ripper');
      // UI: 네온 노점 (src/ui/StationMarks.ts, 그림이 오기 전 코드로 그림)
      drawStall(fx, s.kind, s.x, s.y, blink, this.elapsed, gameData.stations.reach);
      s.label.setPosition(s.x, s.y - 28).setAlpha(blink).setText(`${name} · ${Math.ceil(s.t)}s`);
      // 화면 밖이면 가장자리에 둥근 안내 (문양 + 남은 시간 고리 + 방향)
      const sx = s.x - cam.scrollX;
      const sy = s.y - cam.scrollY;
      const inView = sx > 0 && sx < VIEW_W && sy > 0 && sy < VIEW_H;
      if (inView) s.arrow.setVisible(false);
      else {
        const cx = VIEW_W / 2;
        const cy = VIEW_H / 2;
        const ang = Math.atan2(sy - cy, sx - cx);
        // 가장자리 안쪽 테두리 (위는 HUD, 아래는 능력 막대를 피함)
        const c = Math.cos(ang);
        const sn = Math.sin(ang);
        const k = Math.min(c > 0 ? (VIEW_W - 30 - cx) / c : c < 0 ? (30 - cx) / c : 1e9, sn > 0 ? (VIEW_H - 36 - cy) / sn : sn < 0 ? (72 - cy) / sn : 1e9);
        const ex = cx + c * k;
        const ey = cy + sn * k;
        drawMarker(fx, s.kind, cam.scrollX + ex, cam.scrollY + ey, ang, s.t / gameData.stations.life, this.elapsed);
        // 이름·시간 글자는 표시 아래 (아래쪽 가장자리면 위)
        s.arrow
          .setVisible(true)
          .setPosition(Phaser.Math.Clamp(ex, 44, VIEW_W - 44), ey + (sn > 0.6 ? -27 : 27))
          .setText(`${name} ${Math.ceil(s.t)}s`);
      }
      if (this.state === 'play' && (s.x - p.x) ** 2 + (s.y - p.y) ** 2 < (gameData.stations.reach + p.radius) ** 2) {
        this.stationUi.reset();
        this.openStation(s);
      }
    }
    for (const s of this.stations) if (s.t <= 0) {
      s.label.destroy();
      s.arrow.destroy();
    }
    this.stations = this.stations.filter((s) => s.t > 0);
  }

  /** 상점·리퍼닥 화면 열기 (고르면 다시 그림, 떠나면 닫힘) */
  private openStation(s: Station): void {
    if (this.state === 'play') Sound.play('levelup');
    this.state = 'levelup';
    this.stationOpen = s;
    s.arrow.setVisible(false);
    const ST = gameData.stations;
    const chips = Math.floor(this.chips);
    const pay = (n: number): boolean => {
      if (chips < n) {
        Sound.play('block');
        this.shake(80, 0.004);
        return false;
      }
      this.chips -= n;
      Sound.play('select');
      return true;
    };
    // 고른 뒤: 전설·신화 무기를 샀으면 능력부터 고르고 다시 이 화면으로, 아니면 화면을 다시 그림
    const after = () => {
      if (this.stationOpen !== s) return;
      if (this.abilityPending) {
        this.stationUi.hide();
        this.nextScreen();
      } else this.openStation(s);
    };
    const leave = () => {
      this.stationUi.hide();
      // 들렀다 나오면 그 노점은 문을 닫음
      s.t = 0;
      this.stationOpen = null;
      this.nextScreen();
    };
    if (s.kind === 'shop') {
      // UI: 블랙마켓 화면 (src/ui/StationUI.ts)
      const SH = ST.shop;
      if (!s.stock) {
        s.stock = rollItems(SH.items, this.equippedRarity(), undefined, SH.rarity);
        s.chip = (this.chipsetsOpen() ? rollChipsets(1, this.weaponRarity())[0] : undefined) ?? null;
      }
      const stock = s.stock;
      // 값: 상점이 나올 때마다 ×priceGrowth (아이템·칩셋·다시 뽑기·회복 모두)
      const pm = (n: number) => Math.round(n * s.priceMul);
      const healPrice = pm(SH.heal.price);
      const items = stock.map((r) => ({ choice: this.itemChoice(r), price: pm((SH.price as Record<string, number>)[r.rarity.id] ?? 50) }));
      // 칩셋 한 칸 (편집 페이지 값)
      if (s.chip) items.push({ choice: this.chipChoice(s.chip), price: pm(CHIPSETS[s.chip].price ?? 45) });
      const rr = pm(SH.reroll + SH.rerollStep * s.rerolls);
      this.stationUi.showShop(
        { chips, items, heal: s.healed ? undefined : { pct: SH.heal.pct, price: healPrice }, reroll: s.rerolls >= SH.rerollMax ? undefined : { price: rr } },
        {
          buy: (i) => {
            const it = items[i];
            if (!it || !pay(it.price)) return;
            if (it.choice.chipset) s.chip = null;
            else s.stock = s.stock!.filter((x) => x !== stock[i]);
            this.equipItem(it.choice);
            after();
          },
          heal: () => {
            if (!pay(healPrice)) return;
            s.healed = true;
            this.heal(Math.round((this.player.maxHp * SH.heal.pct) / 100));
            after();
          },
          reroll: () => {
            if (s.rerolls >= SH.rerollMax || !pay(rr)) return;
            s.rerolls++;
            s.stock = rollItems(SH.items, this.equippedRarity(), undefined, SH.rarity);
            s.chip = (this.chipsetsOpen() ? rollChipsets(1, this.weaponRarity())[0] : undefined) ?? null;
            after();
          },
          leave,
        },
      );
    } else {
      // UI: 리퍼닥 화면 — 사이버웨어 소켓 레벨 +1 (여러 번 가능), OS 바꿔 끼기
      const RP = ST.ripper;
      const cyber = (['neural', 'optic', 'skeletal'] as const).map((part) => {
        const k = this.sockets.get(part);
        const label = PART_NAME[part];
        if (!k) return { part, label };
        const max = ITEMS[k.id].maxLevel ?? 5;
        return {
          part,
          label,
          item: {
            name: itemName('cyber', k.id),
            art: itemArt(k.id),
            color: Phaser.Display.Color.HexStringToColor(rarityById(k.rarity).color).color,
            level: k.level,
            max,
            now: shortText(k.id, k.level, k.rarity) ?? itemText(k.id, k.level, k.rarity),
            next: k.level < max ? (shortText(k.id, k.level + 1, k.rarity) ?? itemText(k.id, k.level + 1, k.rarity)) : '',
            price: RP.cyberLevel[Math.min(k.level - 1, RP.cyberLevel.length - 1)],
          },
        };
      });
      // 해금한 OS만 (?debug에서는 모두)
      const unlocked = (id: string) => DEV_TOOLS || id === this.os.id || Save.osLevel(id) > 0;
      const list = OS_IDS.filter(unlocked).map((id) => {
        const st = new OsState(id, this.osLevelFor(id));
        return { id, name: st.name, level: st.level, color: st.def.color, tags: st.def.tags, lines: st.lines() };
      });
      this.stationUi.showRipper(
        { chips, cyber, os: { cur: this.os.id, price: RP.osSwap, list } },
        {
          upgrade: (part) => {
            const k = this.sockets.get(part);
            if (!k || k.level >= (ITEMS[k.id].maxLevel ?? 5)) return;
            const price = RP.cyberLevel[Math.min(k.level - 1, RP.cyberLevel.length - 1)];
            if (!pay(price)) return;
            k.level++;
            const oldMax = this.player.maxHp;
            this.rebuildLoadout(false);
            this.player.hp += Math.max(0, this.player.maxHp - oldMax);
            after();
          },
          swap: (id) => {
            if (id === this.os.id || !unlocked(id) || !pay(RP.osSwap)) return;
            this.setOs(id, this.osLevelFor(id));
            after();
          },
          leave,
        },
      );
    }
  }

  /** OS 레벨: 뽑기로 모은 개수 (?debug에서 개발자 도구로 고른 레벨이 있으면 그것, 해금 안 한 것은 1) */
  private osLevelFor(id: string): number {
    if (!OS_DEFS[id]?.active) return 1;
    const dev = DEV_TOOLS ? devOsPick()?.level : undefined;
    return dev ?? Math.max(1, Save.osLevel(id));
  }

  // ───────────── 개편 2단계: 보급 상자·아이템 ─────────────
  /** 장착 중인 아이템 id들 (보급 상자에 같은 것이 다시 나오지 않게) */
  private equippedIds(): Set<string> {
    const s = new Set<string>(this.weapons.map((w) => w.id));
    for (const k of this.sockets.values()) s.add(k.id);
    return s;
  }

  /**
   * 개편 2-2: 장착이 바뀌면 효과(아이템·태그 단계·조합)를 다시 모은다.
   * announce: 새로 켜진 태그 단계·조합을 화면에 알림
   */
  private rebuildLoadout(announce = true): void {
    const before = new Set([...this.kit.tiers.map((t) => t.hook), ...this.kit.combos.map((c) => c.hook)]);
    this.kit = new Loadout(
      this.weapons.map((w) => ({ id: w.id, abilities: w.abilities })),
      this.sockets,
      this.os.def.tags,
      this.chipsets,
    );
    const L = this.kit;
    this.wMul.clear();
    this.wTags.clear();
    for (const w of this.weapons) {
      const tags = weaponTags(w.id, w.abilities);
      this.wTags.set(w.id, tags);
      const mech = w.id === 'hackDrone' || w.id === 'turret';
      let dmg = 1;
      let cd = 1;
      let area = 1;
      if (mech) dmg *= 1 + L.v('gear.mechDmg') / 100;
      if (tags.includes('근접')) dmg *= 1 + L.v('syn.melee2') / 100;
      if (w.id === 'microMissile') dmg *= 1 + L.v('combo.missileThermal') / 100;
      // 무기 전용 칩셋: 그 무기 피해 +v%
      dmg *= 1 + L.v(`wchip.${w.id}`) / 100;
      if (mech) cd /= 1 + L.v('syn.mech3') / 100;
      if (tags.includes('전기')) area *= 1 + L.v('gear.elecRange') / 100;
      if (tags.includes('폭발')) area *= 1 + L.v('syn.boom2') / 100;
      // 뉴럴 5줄: 오버클럭 중 보조무기 재사용 대기 없음
      const flush = this.overdrive && this.os.has('neural.flush');
      const sub = w.slot === 'secondary' ? (flush ? 0.05 : Math.max(0.2, 1 - L.v('cyber.subCd') / 100)) : 1;
      this.wMul.set(w.id, { dmg, cd, sub, area });
    }
    if (!L.has('gear.shield')) this.gShield = 0;
    this.recalcStats();
    if (!announce) return;
    // 알림 문구는 짧은 문장·영어 이름 (src/ui/synergyText.ts, 없으면 build.json 원문)
    const fresh = [...L.tiers.map((t) => ({ hook: t.hook, label: `${tagName(t.tag)} ${t.count}`, text: tierShort(t.tag, t.count, t.text) })), ...L.combos.map((c) => ({ hook: c.hook, label: comboName(c.id), text: comboShort(c.id, c.text) }))].filter((x) => !before.has(x.hook));
    fresh.forEach((f, i) => this.time.delayedCall(i * 900, () => this.synergyToast(f.label, f.text)));
  }

  /** 시너지 켜짐 알림 (화면 위쪽) */
  private synergyToast(label: string, text: string): void {
    const t = this.add
      .text(VIEW_W / 2, 74, `${tr('syn.on')} · ${label}\n${text}`, { ...TEXT, fontSize: '10px', color: '#fff23a', align: 'center', backgroundColor: '#120a24cc', padding: { x: 8, y: 4 } })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(140);
    Sound.play('select');
    this.tweens.add({ targets: t, alpha: 0, delay: 2200, duration: 500, onComplete: () => t.destroy() });
  }

  /** GameContext: 켜진 효과 값 (없으면 undefined) */
  mod(hook: string): Record<string, number> | undefined {
    return this.kit.get(hook) ?? (this.os.has(hook) ? this.os.p : undefined);
  }

  /** GameContext: 무기별 배율 (아드레날린 주입기는 체력이 낮을 때만) */
  weaponMul(id: string): { dmg: number; cd: number; sub: number; area: number } {
    const m = this.wMul.get(id) ?? { dmg: 1, cd: 1, sub: 1, area: 1 };
    const L = this.kit;
    if (L.has('gear.lowHpSpeed') && this.player.hp < this.player.maxHp * 0.5) return { ...m, cd: m.cd / (1 + L.v('gear.lowHpSpeed') / 100) };
    return m;
  }

  /**
   * 신화 무기 각성: 신화 무기는 처음엔 신화 능력만 가짐.
   * 그 무기의 태그 중 하나가 장착 전체에서 gameData.mythicAwaken개 이상(태그 시너지 5)이 되면 전설 능력도 하나 고름 (한 번 얻으면 유지)
   */
  private checkMythicAwaken(): void {
    const need = gameData.mythicAwaken;
    for (const w of this.weapons) {
      if (w.rarity !== 'mythic') continue;
      const legend = weaponAbilities(w.id as WeaponId, 'legendary');
      if (legend.some((a) => w.abilities.has(a.id))) continue;
      const tag = weaponTags(w.id, w.abilities).find((t) => (this.kit.tagCount.get(t) ?? 0) >= need);
      if (!tag) continue;
      this.abilityPending = { weapon: w.id as WeaponId, tier: 'legendary' };
      this.synergyToast(`${tag} ${need}`, tr('syn.awaken', { name: w.name }));
      return;
    }
  }

  /** 레벨업 카드에 넣을 사이버웨어·장비 소켓 */
  private socketCards(): SocketCard[] {
    return [...this.sockets].map(([part, k]) => ({
      part,
      id: k.id,
      art: itemArt(k.id),
      title: itemName(ITEMS[k.id].kind as ItemKind, k.id),
      level: k.level,
      maxLevel: ITEMS[k.id].maxLevel ?? 5,
      nextDesc: itemText(k.id, k.level + 1, k.rarity),
    }));
  }

  /** 카드 설명 끝에 붙는 태그·조합 안내 (조합은 짝을 이미 꼈을 때만) */
  private tagLine(kind: ItemKind, id: string): string {
    const tags = kind === 'weapon' ? weaponTags(id) : itemTags(id);
    const eq = this.equippedIds();
    const combos = combosWith(id).filter((c) => eq.has(c.other));
    let out = tags.length ? `\n[${tags.join('·')}]` : '';
    for (const c of combos) out += `\n${tr('syn.combo', { name: c.name })} ${c.text}`;
    return out;
  }

  /** 보급 상자 열기: 아이템 3개 중 1개 */
  private openChest(): void {
    if (this.state === 'play') Sound.play('levelup');
    this.state = 'levelup';
    const min = this.chestQueue.shift();
    const rolls = rollItems(3, this.equippedRarity(), min);
    this.choices = rolls.map((r) => this.itemChoice(r));
    this.levelUi.show(this.choices, 0, (i) => this.pick(i), () => undefined, tr('item.title'), this.skipButton(Math.max(0, gameData.rarity.findIndex((r) => r.id === min)), () => undefined));
  }

  /** 칩셋이 나오는지: 소켓 8칸(무기 2·사이버웨어 3·장비 2·OS)이 다 찼을 때부터 */
  private chipsetsOpen(): boolean {
    return this.weapons.length >= 2 && this.sockets.size >= 5;
  }

  /** 끼고 있는 무기 id → 등급 (무기 전용 칩셋은 전설 이상일 때만) */
  private weaponRarity(): Map<string, string> {
    return new Map(this.weapons.map((w) => [w.id, w.rarity]));
  }

  /** 레벨업 빈자리 카드: 칩·체력 회복 (강화할 것도 칩셋도 모자랄 때) */
  private fillerChoices(): Choice[] {
    const common = rarityById('common');
    const F = gameData.levelFillers;
    return [
      { kind: 'overflow', id: 'fillChips', art: 'chip', rarity: common, title: tr('fill.chips', { n: F.chips }), levelLabel: tr('fill.label'), desc: tr('fill.chipsDesc', { n: F.chips }), card: { slot: tr('fill.label'), short: tr('fill.chipsDesc', { n: F.chips }), tags: [] } },
      { kind: 'overflow', id: 'fillHeal', art: 'heal', rarity: common, title: tr('fill.heal'), levelLabel: tr('fill.label'), desc: tr('fill.healDesc', { pct: F.healPct }), card: { slot: tr('fill.label'), short: tr('fill.healDesc', { pct: F.healPct }), tags: [] } },
    ] as Choice[];
  }

  /** 칩셋 카드 (레벨업·블랙마켓) */
  private chipChoice(id: string): Choice {
    const n = this.chipsets.get(id) ?? 0;
    const def = CHIPSETS[id];
    const kindLabel = def.kind === 'weapon' ? tr('chip.weapon', { name: weaponsData[def.weapon as WeaponId]?.name ?? '' }) : tr(def.kind === 'stat' ? 'chip.stat' : 'chip.special');
    const foot = n ? tr('chip.stack', { a: n, b: n + 1 }) : tr('chip.new');
    return {
      kind: 'overflow',
      id,
      chipset: id,
      art: chipArt(id),
      rarity: rarityById('common'),
      title: chipName(id),
      levelLabel: `${kindLabel} · ${foot}`,
      desc: chipText(id, n + 1),
      // UI: 칩셋 카드는 종류 색 띠(능력치 시안·특수 주황·무기 분홍)와 짧은 문장 (card.rarity는 표시만)
      card: {
        slot: '',
        short: chipShort(id, n + 1),
        tags: [],
        foot: { left: foot, right: n ? `×${n + 1}` : '' },
        rarity: { ...rarityById('rare'), label: kindLabel, color: CHIP_COLOR[def.kind] ?? CHIP_COLOR.stat },
      },
    } as Choice;
  }

  /** 칩셋 하나 더 (중첩 +1) */
  private addChipset(id: string): void {
    this.chipsets.set(id, (this.chipsets.get(id) ?? 0) + 1);
    const oldMax = this.player.maxHp;
    this.rebuildLoadout(false);
    this.player.hp += Math.max(0, this.player.maxHp - oldMax);
  }

  /** 끼고 있는 아이템 id → 등급 (등급 승급 카드용) */
  private equippedRarity(): Map<string, string> {
    const m = new Map<string, string>();
    for (const w of this.weapons) m.set(w.id, w.rarity);
    for (const k of this.sockets.values()) m.set(k.id, k.rarity);
    return m;
  }

  /** 등급 승급 카드: 같은 아이템의 등급 +1 (소켓 레벨 그대로) */
  private promoteChoice(r: ItemRoll): Choice {
    const kind = r.kind === 'weapon' ? 'weapon' : 'passive';
    const w = r.kind === 'weapon' ? this.weapons.find((o) => o.id === r.id) : undefined;
    const k = r.kind === 'weapon' ? undefined : this.sockets.get(ITEMS[r.id].part);
    const from = rarityById(w?.rarity ?? k?.rarity ?? 'common');
    const lv = w?.level ?? k?.level ?? 1;
    let desc = tr('item.promoteDesc', { from: from.label, to: r.rarity.label });
    if (r.kind === 'weapon') {
      desc += r.rarity.weaponBonus > 0 ? tr('lvl.bonus', { v: Math.round(r.rarity.weaponBonus * 100) }) : '';
      const tier = r.rarity.ability ? (r.rarity.id as 'legendary' | 'mythic') : null;
      if (tier && w && !weaponAbilities(r.id as WeaponId, tier).some((a) => w.abilities.has(a.id))) desc += '\n' + tr('item.pickAbility', { tier: r.rarity.label });
    } else desc += '\n' + itemText(r.id, lv, r.rarity.id);
    const card = itemCard({ kind: r.kind, id: r.id, rarity: r.rarity, lv, cur: null, tagCount: this.kit.tagCount, equipped: this.equippedIds(), activeCombos: this.kit.combos.map((c) => c.name) });
    card.foot = { left: tr('item.promote', { from: from.label, to: r.rarity.label }), right: `Lv ${lv}` };
    // 이미 끼고 있는 아이템이라 태그가 새로 늘지 않음: 추천·단계 ▲·경고는 빼고 태그만
    card.rec = undefined;
    card.warn = undefined;
    card.tags = card.tags.map((t) => ({ ...t, up: undefined }));
    if (r.kind !== 'weapon') card.short = itemText(r.id, lv, r.rarity.id);
    return { kind, id: r.id, art: itemArt(r.id), rarity: r.rarity, title: itemName(r.kind, r.id), levelLabel: tr('item.promote', { from: from.label, to: r.rarity.label }), desc, item: { kind: r.kind, id: r.id }, promote: true, card } as Choice;
  }

  /** 아이템 카드 (보급 상자·상점) */
  private itemChoice(r: ItemRoll): Choice {
    if (r.promote) return this.promoteChoice(r);
    const kind = r.kind === 'weapon' ? 'weapon' : 'passive';
    let desc = '';
    let lv = 1;
    let was: { name: string; tags: string[] } | null = null;
    let curId: string | undefined;
    if (r.kind === 'weapon') {
      const cur = this.weapons.find((w) => w.slot === weaponSlot(r.id as WeaponId));
      lv = cur?.level ?? 1;
      curId = cur?.id;
      if (cur) was = { name: cur.name, tags: this.wTags.get(cur.id) ?? weaponTags(cur.id, cur.abilities) };
      desc = weaponsData[r.id as WeaponId].desc + (r.rarity.weaponBonus > 0 ? tr('lvl.bonus', { v: Math.round(r.rarity.weaponBonus * 100) }) : '');
      if (r.rarity.ability) desc += '\n' + tr('item.pickAbility', { tier: r.rarity.label });
      if (r.rarity.id === 'mythic') desc += '\n' + tr('item.awakenHint', { n: gameData.mythicAwaken });
      if (cur) desc += '\n' + tr('item.replace', { cur: cur.name });
    } else {
      const cur = this.sockets.get(ITEMS[r.id].part);
      lv = cur?.level ?? 1;
      curId = cur?.id;
      if (cur) was = { name: itemName(ITEMS[cur.id].kind as ItemKind, cur.id), tags: itemTags(cur.id) };
      desc = itemText(r.id, lv, r.rarity.id);
      if (cur) desc += '\n' + tr('item.replace', { cur: itemName(ITEMS[cur.id].kind as ItemKind, cur.id) });
    }
    desc += this.tagLine(r.kind, r.id);
    const choice = { kind, id: r.id, art: itemArt(r.id), rarity: r.rarity, title: itemName(r.kind, r.id), levelLabel: `${socketLabel(r.kind, r.id)} · ${tr('lvl.socket', { lv })}`, desc, isNew: true, item: { kind: r.kind, id: r.id }, card: itemCard({ kind: r.kind, id: r.id, rarity: r.rarity, lv, cur: was, tagCount: this.kit.tagCount, equipped: this.equippedIds(), activeCombos: this.kit.combos.map((c) => c.name), curId }) } as Choice;
    // UI: 교체 카드는 한 번 더 눌러야 고름 (LevelUpUI 교체 확인)
    if (choice.card) choice.card.replace = this.replaceTarget(choice) ?? undefined;
    return choice;
  }

  /** 전설·신화 무기를 얻은 뒤 그 등급 능력 중 하나 고르기 */
  private openAbilityPick(): void {
    const a = this.abilityPending!;
    this.state = 'levelup';
    const rar = rarityById(a.tier);
    // UI: 능력이 무기에 새 태그를 더해 시너지 단계가 오르면 추천
    const w = this.weapons.find((o) => o.id === a.weapon);
    const has = new Set(w ? (this.wTags.get(w.id) ?? weaponTags(w.id, w.abilities)) : []);
    this.choices = weaponAbilities(a.weapon, a.tier).map((ab) => {
      const tags = abilityTags(a.weapon, ab.id)
        .filter((tag) => !has.has(tag))
        .map((tag) => {
          const next = (this.kit.tagCount.get(tag) ?? 0) + 1;
          return [2, 3, 4, gameData.mythicAwaken].includes(next) ? { tag, up: next } : { tag };
        });
      const card = { slot: `${weaponsData[a.weapon].name}`, short: ab.desc, tags, ...recommend({ id: `${a.weapon}:${ab.id}`, tags }) };
      return { kind: 'weapon', id: a.weapon, rarity: rar, title: ab.name, levelLabel: `${weaponsData[a.weapon].name} · ${rar.label}`, desc: ab.desc, pickAbility: { weapon: a.weapon, tier: a.tier }, ability: undefined, abilityId: ab.id, card } as unknown as Choice;
    });
    this.levelUi.show(this.choices, 0, (i) => this.pick(i), () => undefined, tr('item.abilityTitle', { tier: rar.label }));
  }

  /** 아이템·능력 카드 고름 */
  private pickItem(c: Choice): void {
    this.levelUi.hide();
    this.equipItem(c);
    this.nextScreen();
  }

  /** 아이템·능력 장착 (화면 넘김 없음: 보급 상자·상점이 같이 씀) */
  private equipItem(c: Choice): void {
    if (c.chipset) return void this.addChipset(c.chipset);
    if (c.promote) {
      // 등급 승급: 같은 아이템 등급 +1 (무기는 피해 보너스, 전설·신화가 되면 그 등급 능력을 아직 없으면 고름)
      if (c.item!.kind === 'weapon') {
        const w = this.weapons.find((o) => o.id === c.id);
        if (w) {
          w.rarity = c.rarity.id;
          w.bonus = c.rarity.weaponBonus;
          const tier = c.rarity.ability ? (c.rarity.id as 'legendary' | 'mythic') : null;
          if (tier && !weaponAbilities(w.id as WeaponId, tier).some((a) => w.abilities.has(a.id))) this.abilityPending = { weapon: w.id as WeaponId, tier };
        }
      } else {
        const k = this.sockets.get(ITEMS[c.id].part);
        if (k) k.rarity = c.rarity.id;
      }
      const oldMax = this.player.maxHp;
      this.rebuildLoadout();
      this.player.hp += Math.max(0, this.player.maxHp - oldMax);
      return;
    }
    if (c.pickAbility) {
      const w = this.weapons.find((o) => o.id === c.pickAbility!.weapon);
      const abId = (c as unknown as { abilityId: string }).abilityId;
      if (w) w.addAbility(abId);
      this.abilityPending = null;
      this.rebuildLoadout();
    } else if (c.item!.kind === 'weapon') {
      const id = c.id as WeaponId;
      const w = this.addWeapon(id);
      // 등급: 피해 보너스 (바꿔 끼우면 새 아이템 등급으로)
      w.bonus = c.rarity.weaponBonus;
      w.rarity = c.rarity.id;
      if (c.rarity.ability) this.abilityPending = { weapon: id, tier: c.rarity.id as 'legendary' | 'mythic' };
      this.rebuildLoadout();
    } else {
      // 사이버웨어·장비: 같은 부위 소켓에 끼움 (소켓 레벨 이어받음)
      const part = ITEMS[c.id].part;
      const old = this.sockets.get(part);
      this.sockets.set(part, { id: c.id, rarity: c.rarity.id, level: old?.level ?? 1 });
      const oldMax = this.player.maxHp;
      this.rebuildLoadout();
      this.player.hp += Math.max(0, this.player.maxHp - oldMax);
    }
  }

  /** 보급 상자를 떨어뜨림 (minRarity: 최소 등급) */
  private dropChest(x: number, y: number, minRarity = 'common'): void {
    const idx = gameData.rarity.findIndex((r) => r.id === minRarity);
    this.dropPickup('chest', x, y, Math.max(0, idx));
  }

  /** 무기 장착: 주무기·보조무기 소켓에 하나씩. 같은 소켓에 있던 무기는 빼고, 소켓 레벨·등급 보너스는 새 무기가 이어받음 */
  private addWeapon(id: WeaponId): WeaponBase {
    const w = createWeapon(id, this);
    const slot = weaponSlot(id);
    const i = this.weapons.findIndex((o) => o.slot === slot);
    if (i >= 0) {
      const old = this.weapons[i];
      while (w.level < old.level) w.levelUp();
      w.bonus = old.bonus;
      old.destroy();
      this.weapons.splice(i, 1, w);
    } else this.weapons.push(w);
    // 주무기가 앞에 오게 (일시정지 패널·결과 화면 순서)
    this.weapons.sort((a, b) => (a.slot === b.slot ? 0 : a.slot === 'primary' ? -1 : 1));
    return w;
  }

  /** 판 시작 무기: 도크9 무기고에서 고른 주무기·보조무기 (기본 스마트 피스톨·플라즈마 유탄) */
  private addStartWeapons(): void {
    const pri = Save.data.startPrimary as WeaponId;
    const sec = Save.data.startSecondary as WeaponId;
    this.addWeapon(weaponSlot(pri) === 'primary' ? pri : 'smartPistol');
    this.addWeapon(weaponSlot(sec) === 'secondary' ? sec : 'plasmaGrenade');
    this.rebuildLoadout(false);
  }

  heal(v: number, silent = false): void {
    const p = this.player;
    p.hp = Math.min(p.maxHp, p.hp + v);
    if (silent) return;
    const t = this.add.text(p.x, p.y - 24, `+${v}`, { ...TEXT, fontSize: '11px', color: '#39ff88' }).setOrigin(0.5).setDepth(90);
    this.tweens.add({ targets: t, y: t.y - 16, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  private endRun(victory: boolean): void {
    if (this.state === 'over') return;
    this.state = 'over';
    Ads.setPlaying(false);
    this.levelUi.hide();
    const result: RunResult = {
      victory,
      time: this.elapsed,
      kills: this.kills,
      level: this.level,
      weapons: this.weapons.map((w) => ({ name: w.name, level: w.level })),
      credits: this.creditsNow(victory),
      run: { ...this.run, kills: this.kills, time: this.elapsed, level: this.level, zone: this.zoneIdx + 1 },
      zone: `${this.zone.label} ${this.zone.name}`,
      heat: this.heat,
      runner: this.runner.name,
      zoneTime: this.elapsed - this.zoneStart,
      ...(victory ? {} : this.deathCause()),
    };
    this.clearArena();
    if (!victory) {
      Sound.play('gameover');
      Sound.music(null, 1000);
      this.player.sprite.setVisible(false);
      this.player.glow.setVisible(false);
      this.burst(this.player.x, this.player.y, COLORS.cyan, 30);
      this.shake(300, 0.015);
    }
    this.time.delayedCall(1500, () => this.scene.start('Result', result));
  }

  // ───────────────────────────── 메인 루프 ─────────────────────────────
  update(_time: number, deltaMs: number): void {
    // 입력 버튼(보조무기·대시·OS)과 조준점은 전투 중에만
    this.controls?.setVisible(this.state === 'play');
    this.syncInvButton();
    // 포털에 '지금 조작 중인지' 알림 (레벨업·대화·일시정지·이월 화면은 플레이 아님)
    Ads.setPlaying(this.state === 'play');
    this.syncOdFx();
    if (this.state !== 'play') return;
    // 2배속은 한 번에 큰 걸음 대신 작은 걸음 여러 번 (빠른 탄이 적을 뚫고 지나가지 않게)
    const total = Math.min(deltaMs / 1000, 0.05) * this.gameSpeed;
    const steps = this.gameSpeed > 1 ? Math.ceil(total / 0.034) : 1;
    for (let i = 0; i < steps && this.state === 'play'; i++) this.step(total / steps);
    this.syncOdFx();
  }

  /** 게임 시간 한 걸음 (realDt: 오버클럭 감속 전의 시간) */
  private step(realDt: number): void {
    // 보스 클로즈업 중에는 세상 시간을 멈추고 연출만 진행 (주인공·적·탄 정지, 보스 무적)
    if (this.cine) {
      this.updateCine(realDt);
      return;
    }
    // 뉴럴 오버클럭 발동 직후: 시간이 느려졌다가 원래 속도로 돌아온다
    let timeScale = 1;
    if (this.slowmo > 0) {
      this.slowmo = Math.max(0, this.slowmo - realDt);
      const k = 1 - this.slowmo / OD.slowmoTime; // 0 → 1
      timeScale = OD.slowmoScale + (1 - OD.slowmoScale) * k * k;
      Sound.musicRate(0.55 + 0.45 * k * k);
      if (this.slowmo <= 0) {
        Sound.musicRate(1);
        // 올라가는 소리는 오버클럭이 끝날 때 낸다 (발동 중에는 계속 느린 소리)
        if (!this.overdrive) Sound.play('slowmo_out');
      }
    }
    const dt = realDt * timeScale;
    this.elapsed += dt;
    const p = this.player;

    this.fx.clear();
    const subW = this.weapons.find((w) => w.slot === 'secondary');
    this.controls.subUse = subW ? ((weaponsData[subW.id] as { use?: SubUse }).use ?? 'tap') : 'none';
    const cam0 = this.cameras.main;
    // UI: 터치 버튼에 그릴 것 (보조무기 그림·등급 색, OS 문양·게이지)
    this.controls.look = {
      subId: subW?.id,
      subColor: subW ? Phaser.Display.Color.HexStringToColor(rarityById(subW.rarity).color).color : undefined,
      os: { id: this.os.id, color: Phaser.Display.Color.HexStringToColor(this.os.def.color).color, hasActive: this.os.hasActive, gauge: this.odGauge, on: this.specialOn, cdT: this.osCdT },
    };
    this.controls.update(1 - p.dashCd / p.dashCooldownMax, !this.specialOn && this.odGauge >= 100, subW?.readiness() ?? 0, subW?.activeOn ?? false, {
      x: p.x - cam0.scrollX,
      y: p.y - cam0.scrollY,
    });
    if (this.controls.consumeDash() && p.tryDash()) {
      // 화면 전체 번쩍임 대신 잔상 + 작은 고리
      this.dashRings.push({ r: 8, life: 0.22 });
      Sound.play('dash');
      this.sinceDash = 0;
      // 돌격 산탄 조합: 대시하면 샷건 재장전 즉시
      if (this.kit.has('combo.shotgunLegs')) this.weapons.find((w) => w.id === 'shotgun')?.resetCooldown();
      if ((this.runner.mods as { dashCloak?: number }).dashCloak) {
        if (!this.untracked) this.decoy = { x: p.x, y: p.y };
        p.cloakT = (this.runner.mods as { dashCloak?: number }).dashCloak!;
      }
      if (this.pHas('reboot')) {
        p.shield = 20;
        p.shieldT = 1;
      }
      this.dashFrom = { x: p.x, y: p.y };
      // 시간 왜곡: 주변 적과 적 탄이 느려짐
      if (this.pHas('timeWarp')) {
        for (const e of this.grid.query(p.x, p.y, 220, this.chainBuf)) if (e.active) this.slow(e, 1.5);
        for (const b of this.enemyBullets.items) {
          if (!b.active || (b.x - p.x) ** 2 + (b.y - p.y) ** 2 > 220 * 220) continue;
          b.vx *= 0.35;
          b.vy *= 0.35;
        }
        this.screenFlash(0x8a7aa8, 0.12, 300);
      }
    }
    const hackMul = p.hackT > 0 ? gameData.squadAi.hacker.slow : 1;
    const guard = this.specialOn && this.specialId === 'guardian' && this.os.has('guardian.stand') && p.shield > 0 ? 1 + this.os.v('move') / 100 : 1;
    p.update(dt, this.controls.moveX, this.controls.moveY, this.stats.moveMul * hackMul * guard);
    this.dashPath = null;
    if (this.wasDashing && !p.dashing) {
      this.dashPath = { x1: this.dashFrom.x, y1: this.dashFrom.y, x2: p.x, y2: p.y };
      // 칼날 대시: 지나간 길의 적에게 피해
      if (this.pHas('bladeDash')) this.lineDamage(this.dashPath, 14, 60 * this.stats.damageMul, COLORS.magenta);
      // 근접 4단계: 대시가 끝날 때 주변 베기
      if (this.kit.has('chip.dashBolt')) this.zapNearest(p.x, p.y, this.kit.v('chip.dashBolt', 'n', 2), this.kit.v('chip.dashBolt', 'dmg') * this.stats.damageMul);
      if (this.kit.has('syn.melee4')) this.synBlast(p.x, p.y, this.kit.v('syn.melee4', 'r', 60), this.kit.v('syn.melee4', 'dmg') * this.stats.damageMul * this.stats.meleeMul, COLORS.magenta, 'melee');
    }
    this.wasDashing = p.dashing;
    if (this.zone.rule === 'conveyor' && !p.dashing) {
      p.x += this.conveyorAt(p.y) * dt;
      p.sprite.setPosition(p.x, p.y);
      p.glow.setPosition(p.x, p.y);
    }
    if (this.regen > 0 && p.hp < p.maxHp) this.heal(this.regen * dt, true);
    const hidden = this.untracked;
    if (hidden) p.sprite.setAlpha(0.35);
    p.glow.setAlpha(hidden ? 0.15 : 0.45);
    if (hidden && !this.wasUntracked && !this.specialOn) Sound.play('glitch');
    this.wasUntracked = hidden;
    if (p.hackT > 0) p.sprite.setTint(0x39ff88);
    else if (p.sprite.isTinted) p.sprite.clearTint();
    if (this.arena) {
      const a = this.arena;
      p.x = Phaser.Math.Clamp(p.x, a.x + 10, a.x + a.w - 10);
      p.y = Phaser.Math.Clamp(p.y, a.y + 14, a.y + a.h - 14);
      p.sprite.setPosition(p.x, p.y);
      p.glow.setPosition(p.x, p.y);
    }
    if (p.dashing && (this.dashGhostT -= dt) <= 0) {
      this.dashGhostT = 0.025;
      this.spawnGhost(COLORS.cyan);
    }
    for (const r of this.dashRings) {
      r.life -= dt;
      r.r += 140 * dt;
      this.fx.lineStyle(2, COLORS.cyan, Math.max(0, r.life / 0.22)).strokeCircle(p.x, p.y, r.r);
    }
    this.dashRings = this.dashRings.filter((r) => r.life > 0);
    for (const r of this.dodgeRings) {
      r.life -= dt;
      r.r += 140 * dt;
      this.fx.lineStyle(2, 0xff2a3a, Math.max(0, r.life / 0.22)).strokeCircle(r.x, r.y, r.r);
    }
    this.dodgeRings = this.dodgeRings.filter((r) => r.life > 0);
    if (p.shieldT > 0) {
      // 쉴드 표시: 남은 시간만큼 옅어지는 시안 원
      this.fx.lineStyle(2, COLORS.cyan, 0.4 + p.shieldT * 0.5).strokeCircle(p.x, p.y, 15);
      this.fx.fillStyle(COLORS.cyan, 0.08).fillCircle(p.x, p.y, 15);
    }
    // 카메라 원점을 좌상단에 두었으므로 플레이어를 화면 가운데에 두도록 직접 따라간다
    const cam = this.cameras.main;
    const follow = Math.min(1, dt * 12);
    // 보스전 경계 안에서도 카메라는 플레이어를 따라간다 (예전에는 경계 중앙에 고정)
    cam.scrollX += (p.x - VIEW_W / 2 - cam.scrollX) * follow;
    cam.scrollY += (p.y - VIEW_H / 2 - cam.scrollY) * follow;
    this.updatePassiveSpecials(dt);
    // 빗줄기는 화면에 붙어서 아래로 흐른다 (슬로우 모션 때도 같이 느려짐)
    this.rainFx.tilePositionY -= 260 * dt;
    this.rainFx.tilePositionX += 30 * dt;
    this.bg.tilePositionX = this.cameras.main.scrollX;
    this.bg.tilePositionY = this.cameras.main.scrollY;
    this.skyline.tilePositionX = this.cameras.main.scrollX * 0.25;
    // 보스 경계전에는 먼 배경을 걷어내 싸움터에 집중시킨다
    this.skyline.alpha += ((this.arena ? 0 : 1) - this.skyline.alpha) * Math.min(1, dt * 3);

    const zt = this.elapsed - this.zoneStart;
    const nextBoss = gameData.bosses.filter((b) => b.zone === this.zone.id)[this.bossesSpawned];
    this.fixerWarnings(nextBoss, zt);
    if (nextBoss && !this.boss && !this.raid && this.transitionT <= 0 && zt >= nextBoss.time) this.spawnBoss(nextBoss);
    if (this.transitionT <= 0) this.updateRaid(dt);
    this.drawArena(dt);
    if (this.transitionT <= 0) this.spawner.update(dt, zt, zt, (wavesData as Record<string, Wave[]>)[this.zone.id], p.x, p.y, this.zoneHpMul(zt), 1, this.directorSense(), this.elapsed);
    this.updateZoneRule(dt);
    if (this.transitionT <= 0) this.updateCounters(dt, zt);
    this.updateStations(dt, zt);
    if (this.transitionT <= 0) this.updateSupply(dt);
    this.thornT -= dt;

    this.grid.clear();
    for (const e of this.enemyPool.items) if (e.active) this.grid.insert(e);

    this.updateOverdrive(dt);
    this.updateEnemies(dt);
    // 보스 기절(궤도 폭격·해커 5줄) 중에는 보스가 멈춤
    if (this.boss && this.bossStunT <= 0) this.updateBoss(dt);
    this.updateAim();
    for (const w of this.weapons) {
      this.dmgSrc = w.id;
      w.update(dt);
    }
    this.dmgSrc = null;
    this.updateSynergy(dt);
    this.updateBullets(dt);
    this.updateDps(dt);
    this.updateDmgNums(dt);
    this.updateEnemyBullets(dt);
    this.updateFx(dt);
    this.updateShouts(dt);
    this.updateChatter(dt);
    this.drawOverclockFx(realDt);
    this.updatePickups(dt);
    this.updateHud();

    if (this.transitionT > 0 && (this.transitionT -= dt) <= 0) this.startZoneDialog();
    else if (this.transitionT <= 0 && this.chestQueue.length && this.state === 'play') this.openChest();
    else if (this.transitionT <= 0 && (this.pendingLevels > 0 || this.bossRewards > 0) && this.state === 'play') this.openLevelUp();
  }

  private spawnEnemy(id: EnemyId, x: number, y: number, hpScale: number): Enemy | null {
    if (this.enemyPool.countActive() >= gameData.spawn.maxEnemies) return null;
    const e = this.enemyPool.acquire();
    e.spawn(id, x, y, hpScale * (1 + this.heat * meta.heat.hpPer));
    const sk = this.skin(id);
    if (sk) {
      e.tex = sk.texture;
      e.sprite.setTexture(sk.texture);
    }
    this.introduceUnit(e);
    return e;
  }

  /** 처음 만나는 적이면 진이 문자로 정체와 주의할 점을 알려 준다 (저장해서 다음 판부터는 생략). 설정에서 끄면 소개하지 않는다 */
  private introduceUnit(e: Enemy): void {
    if (!Settings.unitIntro) return;
    if (e.isBoss || e.id.startsWith('trooper_') || Save.data.seenUnits.includes(e.tex)) return; // 블랙 실드는 출동 알림만
    const guide = this.skin(e.id)?.guide ?? (enemiesData[e.id] as { guide?: string }).guide;
    if (!guide) return;
    Save.data.seenUnits.push(e.tex);
    Save.write();
    this.phoneText(guide, e.tex);
  }

  /** 일반 적이 아주 가끔 한마디 (화면 안에 있는 적 중 하나, 12~20초마다) */
  private updateChatter(dt: number): void {
    if ((this.chatterT -= dt) > 0) return;
    this.chatterT = Phaser.Math.FloatBetween(12, 20);
    const pick: { e: Enemy; lines: string[] }[] = [];
    for (const e of this.enemyPool.items) {
      if (!e.active || e.isBoss || !this.onScreen(e.x, e.y)) continue;
      const lines = this.skin(e.id)?.lines ?? (enemiesData[e.id] as { lines?: string[] }).lines;
      if (lines?.length) pick.push({ e, lines });
    }
    if (!pick.length) return;
    const c = pick[Math.floor(Math.random() * pick.length)];
    this.shout(c.e, c.lines[Math.floor(Math.random() * c.lines.length)], 0);
  }

  /** 구역별 겉모습: 같은 능력치의 적을 그 구역에 어울리는 그림·이름으로 (예: 기업 타워의 보안 요원). 그림이 없으면 원래대로 */
  private skin(id: string): { texture: string; name: string; guide?: string; lines?: string[] } | null {
    const s = (this.zone as { skins?: Record<string, { texture: string; name: string; guide?: string; lines?: string[] }> }).skins?.[id];
    return s && this.textures.exists(s.texture) ? s : null;
  }

  private enemyName(id: string): string {
    return this.skin(id)?.name ?? (id in enemiesData ? enemiesData[id as EnemyId].name : '');
  }

  private updateEnemies(dt: number): void {
    const p = this.player;
    const slow = this.odSlowMul;
    const hidden = this.untracked;
    const conv = this.zone.rule === 'conveyor';
    this.updatePsycho(dt);
    this.updateLinks(dt);
    this.updateMiniDrones(dt);
    for (const e of this.enemyPool.items) {
      if (!e.active) continue;
      if (e.dropT > 0 || e.landT > 0) {
        this.updateDrop(e, dt);
        continue;
      }
      if (e.airT > 0) {
        this.updateAir(e, dt);
        this.tickHitFlash(e, dt);
        continue;
      }
      if (e.charmT > 0) {
        e.charmT -= dt;
        if (e.charmT <= 0) {
          e.sprite.clearTint();
          if (e.psycho) this.setPsycho(e, false);
        } else {
          this.charmedAi(e, dt);
          this.tickHitFlash(e, dt);
          continue;
        }
      }
      if (e.stun > 0) {
        e.stun -= dt;
        if (e.stun <= 0) e.sprite.clearTint();
      } else if (!e.isBoss) {
        // 적이 플레이어를 놓쳤으면 마지막으로 본 자리로 간다
        const tx = hidden ? this.decoy.x : p.x;
        const ty = hidden ? this.decoy.y : p.y;
        const dx = tx - e.x;
        const dy = ty - e.y;
        const d = Math.hypot(dx, dy) || 1;
        let vx = (dx / d) * e.speed * slow;
        let vy = (dy / d) * e.speed * slow;
        if (e.id === 'gunner' || e.id === 'corrupt_cop') {
          // 사거리 안쪽을 유지하며 옆으로 돌다가 플레이어를 향해 사격 (부패 경찰은 3발 부채꼴)
          const rg = gameData.ranged[e.id] as { range: number; interval: number; bulletSpeed: number; bulletDamage: number; bulletLife: number; spread?: number; shots?: number };
          if (d < rg.range * 0.6) {
            vx = -vx;
            vy = -vy;
          } else if (d < rg.range * 0.9) {
            vx = (-dy / d) * e.speed * 0.4 * slow;
            vy = (dx / d) * e.speed * 0.4 * slow;
          }
          e.cd -= dt;
          if (e.cd <= 0 && !hidden && d < rg.range * 1.15 && this.onScreen(e.x, e.y)) {
            e.cd = rg.interval * Phaser.Math.FloatBetween(0.8, 1.2);
            e.atkT = 0.25;
            const shots = rg.shots ?? 1;
            for (let k = 0; k < shots; k++) {
              const off = shots > 1 ? (k / (shots - 1) - 0.5) * 2 * (rg.spread ?? 0) : 0;
              this.eShot(e.id).fire(e.x, e.y, Math.atan2(dy, dx) + off, rg.bulletSpeed, rg.bulletDamage, rg.bulletLife);
            }
            Sound.play('enemyshot');
          }
        }
        // 블랙 실드: 행동 점수로 고른 행동대로 움직인다 (공격 시작도 고른 행동일 때만)
        const role = roleOf(e.id);
        if (role) {
          const r = this.squadThink(e, role, dt, d, hidden);
          if (r) {
            vx = r[0] * slow;
            vy = r[1] * slow;
          }
        }
        const m = (gameData.melee as Record<string, MeleeDef>)[e.id];
        if (m) {
          // 사이버 사이코·진압대원: 가까워지면 잠깐 멈춰 예고한 뒤, 그 방향으로 돌진
          e.t -= dt;
          const SW = m.swing;
          if (SW && e.state === 'swing') {
            // 근접 요원: 진압봉 휘두르기. 예비동작이 끝나는 순간 한 번만 판정
            vx = vy = 0;
            e.swingT -= dt;
            if (!e.swingHit && e.swingT <= SW.recover) {
              e.swingHit = true;
              if (e.charmT <= 0 && p.invuln <= 0 && d < SW.reach + p.radius) this.hurtPlayer(e.damage * SW.damageMul, { kind: 'contact', id: e.id });
            }
            if (e.swingT <= 0) {
              e.state = 'walk';
              e.atkCd = this.elapsed + SW.cd;
            }
          } else if (SW && e.state === 'walk' && e.act === 'swing' && this.elapsed >= e.atkCd && !hidden) {
            e.state = 'swing';
            e.swingT = SW.windup + SW.recover;
            e.swingHit = false;
          } else if (e.state === 'walk' && e.t <= 0 && (role ? e.act === 'lunge' && !hidden : d < m.range && (!SW || d > (SW.range + p.radius) * 2))) {
            e.state = 'wind';
            if (this.onScreen(e.x, e.y)) Sound.play('lungewarn');
            e.t = m.windup;
            e.dirX = dx / d;
            e.dirY = dy / d;
          } else if (e.state === 'wind') {
            vx = vy = 0;
            const k = Math.max(0, e.t / m.windup);
            this.fx.lineStyle(2, 0xff2a3a, 0.9 - k * 0.5).lineBetween(e.x, e.y, e.x + e.dirX * m.lungeSpeed * m.lungeTime, e.y + e.dirY * m.lungeSpeed * m.lungeTime);
            if (e.t <= 0) {
              e.state = 'lunge';
              if (this.onScreen(e.x, e.y)) Sound.play('lunge');
              e.t = m.lungeTime;
            }
          } else if (e.state === 'lunge') {
            vx = e.dirX * m.lungeSpeed * slow;
            vy = e.dirY * m.lungeSpeed * slow;
            if (e.t <= 0) {
              e.state = 'walk';
              e.t = m.interval * Phaser.Math.FloatBetween(0.8, 1.2);
            }
          }
        }
        if (e.id === 'drone') this.droneAi(e, dt, dx, dy, d, slow, hidden, (x, y) => ((vx = x), (vy = y)));
        if (e.id === 'sniper_turret') this.turretAi(e, dt, dx, dy, d, hidden);
        else if (e.id === 'glitch_ghost') this.ghostAi(e, dt, d, hidden);
        if (e.id === 'kamikaze' && this.kamikazeAi(e, dt, d, (x, y) => ((vx = x), (vy = y)))) continue;
        if (e.id === 'trooper_sniper') this.sniperAi(e, dt, dx, dy, d, slow, (x, y) => ((vx = x), (vy = y)));
        else if (e.id === 'trooper_hacker') this.hackerAi(e, dt, dx, dy, d, slow, (x, y) => ((vx = x), (vy = y)));
        // 진압대 회피 대시 중 (회피를 고르는 건 SquadBrain)
        if (e.dodgeT > 0) {
          e.dodgeT -= dt;
          vx = e.dodgeVX * slow;
          vy = e.dodgeVY * slow;
          if ((e.ghostT -= dt) <= 0) {
            e.ghostT = gameData.squadAi.dodge.ghostEvery;
            this.spawnGhostAt(e.sprite.texture.key, e.x, e.y, e.sprite.flipX, 0xff2a3a);
          }
        }
        if (e.slowT > 0) {
          e.slowT -= dt;
          vx *= 0.55;
          vy *= 0.55;
        }
        if (conv) vx += this.conveyorAt(e.y);
        // 그림이 오른쪽을 보고 있으므로 플레이어가 왼쪽에 있으면 뒤집는다 (드론은 대칭이라 그대로)
        if (e.id !== 'drone') e.sprite.setFlipX(dx < 0);
        this.animateEnemy(e, dt, d, vx);
        // 주변 적과 겹치지 않도록 밀어냄
        for (const o of this.grid.query(e.x, e.y, e.radius * 2, this.near)) {
          if (o === e) continue;
          const ox = e.x - o.x;
          const oy = e.y - o.y;
          const od = Math.hypot(ox, oy);
          const min = e.radius + o.radius;
          if (od > 0 && od < min) {
            const push = ((min - od) / min) * (o.isBoss ? 200 : 60);
            vx += (ox / od) * push;
            vy += (oy / od) * push;
          }
        }
        e.x += vx * dt;
        e.y += vy * dt;
        // 드론은 움직이는 쪽으로 살짝 기운다
        if (e.flying) e.tilt += (Phaser.Math.Clamp(vx / 160, -1, 1) * 0.35 - e.tilt) * Math.min(1, dt * 8);
        // 너무 멀어진 적은 플레이어 주변으로 재배치
        if (d > gameData.spawn.despawnDistance && e.maxHp < 1000) {
          e.kill();
          this.spawner.spawnAround(e.id, p.x, p.y, this.enemyHpMul(this.elapsed - this.zoneStart), true);
          continue;
        }
      }
      this.placeEnemy(e);
      if (e.id.startsWith('c_')) this.fx.lineStyle(1, Phaser.Display.Color.HexStringToColor((CT.info as Record<string, { color: string }>)[e.id].color).color, 0.7).strokeCircle(e.x, e.y, e.radius + 4);
      this.tickHitFlash(e, dt);
      // 접촉 피해 (조종당한 적은 플레이어를 공격하지 않음)
      const rr = p.radius + e.radius;
      // 근접 요원은 몸으로 부딪혀선 피해를 주지 않고 진압봉 휘두르기로만 (돌진은 이동)
      const swingOnly = !!(gameData.melee as Record<string, MeleeDef>)[e.id]?.swing;
      const airborne = e === this.boss && (this.bossPhase === 'leap' || this.bossPhase === 'air' || this.bossPhase === 'enter' || this.bossPhase === 'walkIn');
      if (!swingOnly && !airborne && e.charmT <= 0 && p.invuln <= 0 && (p.x - e.x) ** 2 + (p.y - e.y) ** 2 < rr * rr) {
        const hp0 = p.hp;
        this.hurtPlayer(e.damage, { kind: e.isBoss ? 'boss' : 'contact', id: e.id });
        // 가시 갑주: 받은 피해의 3배를 돌려줌 · 거구: 일반 적을 밀어냄
        if (this.pHas('thornArmor') && hp0 > p.hp) this.damage(e, (hp0 - p.hp) * 3, 'melee');
        if (this.pHas('bulk') && e.active && !e.isBoss) {
          const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
          e.x += ((e.x - p.x) / d) * 30;
          e.y += ((e.y - p.y) / d) * 30;
        }
      }
    }
  }

  private psychoT = 0;
  /** 해킹 시너지 5 '사이코시스': 아군이 된 적 중 무작위 n명만 광폭화 (0.25초마다 빈자리 채움) */
  private updatePsycho(dt: number): void {
    if ((this.psychoT -= dt) > 0) return;
    this.psychoT = 0.25;
    const on = this.kit.has('syn.hack5');
    const charmed = this.enemyPool.items.filter((e) => e.active && e.charmT > 0);
    if (!on) {
      for (const e of charmed) if (e.psycho) this.setPsycho(e, false);
      return;
    }
    let need = this.kit.v('syn.hack5', 'n', 5) - charmed.filter((e) => e.psycho).length;
    const pool = charmed.filter((e) => !e.psycho);
    while (need-- > 0 && pool.length) this.setPsycho(pool.splice(Math.floor(Math.random() * pool.length), 1)[0], true);
  }

  private setPsycho(e: Enemy, on: boolean): void {
    e.psycho = on;
    e.sprite.setScale(e.baseScale * (on ? this.kit.v('syn.hack5', 'scale', 1.2) : 1));
    if (on) {
      e.sprite.setTint(PSYCHO_TINT);
      this.burst(e.x, e.y, 0xff3a4a, 6);
    } else if (e.charmT > 0) e.sprite.setTint(CHARM_TINT);
  }

  /** 조종당한 적: 가장 가까운 다른 적에게 달려가 들이받는다 (광폭화면 공격력·이동속도 증가) */
  private charmedAi(e: Enemy, dt: number): void {
    let best: Enemy | null = null;
    let bd = 200 * 200;
    for (const o of this.grid.query(e.x, e.y, 200, this.near)) {
      if (o === e || !o.active || o.charmT > 0) continue;
      const d = (o.x - e.x) ** 2 + (o.y - e.y) ** 2;
      if (d < bd) ((bd = d), (best = o));
    }
    e.charmCd -= dt;
    const spdMul = e.psycho ? 1 + this.kit.v('syn.hack5', 'spd', 50) / 100 : 1;
    const atkMul = e.psycho ? 1 + this.kit.v('syn.hack5', 'atk', 50) / 100 : 1;
    if (best) {
      const d = Math.sqrt(bd) || 1;
      e.x += ((best.x - e.x) / d) * e.speed * 1.3 * spdMul * dt;
      e.y += ((best.y - e.y) / d) * e.speed * 1.3 * spdMul * dt;
      if (d < e.radius + best.radius + 2 && e.charmCd <= 0) {
        e.charmCd = 0.5;
        this.damage(best, (20 + e.damage * 3) * this.stats.damageMul * atkMul, 'melee');
        this.burst(best.x, best.y, COLORS.magenta, 4);
      }
    }
    this.placeEnemy(e);
    this.fx.lineStyle(1, COLORS.magenta, 0.6).lineBetween(e.x, e.y - e.radius - 4, e.x, e.y - e.radius - 10);
  }

  /** 적 탄 하나를 꺼내며 쏜 적을 적어 둔다 (게임오버 화면의 사인) */
  private eShot(src: string, kind: 'bullet' | 'missile' = 'bullet'): EnemyBullet {
    const b = this.enemyBullets.acquire();
    b.src = src;
    b.srcKind = kind;
    return b;
  }

  private hurtPlayer(dmg: number, src?: HitSrc): void {
    const p = this.player;
    // 투명(광학 위장·고스트 대시) 중에는 어떤 공격도 통하지 않는다
    // 투명 중·보스 클로즈업 중에는 피해 없음
    // 투명: 대시 위장, 광학 위장 2줄부터는 피해 없음
    if (this.god || this.cine || (this.untracked && (this.player.cloakT > 0 || this.os.has('cloak.invuln')))) return;
    if (src) this.lastHit = src;
    // 보스(몸통·공격·탄 모두)에게 맞으면 보스 반대쪽으로 bossHitKnock px 밀림
    const kb = this.boss;
    const standing = this.specialOn && this.specialId === 'guardian' && this.os.has('guardian.stand') && p.shield > 0;
    if (src && kb && src.id === kb.id && !standing) {
      const kx = p.x - kb.x;
      const ky = p.y - kb.y;
      const kd = Math.hypot(kx, ky) || 1;
      p.x += (kx / kd) * gameData.bossHitKnock;
      p.y += (ky / kd) * gameData.bossHitKnock;
    }
    dmg *= 1 + this.heat * meta.heat.damagePer;
    // 적 공격력도 챕터 안에서 분마다 조금씩 오른다 (챕터마다 0부터)
    // (보스 몸통·돌진은 제외: 보스는 늘 챕터 끝에 나와서 이 보정이 통째로 얹히면 다섯 대에 끝난다)
    const bossHit = !!src && (src.kind === 'boss' || src.kind === 'contact') && /^(mid)?boss/.test(src.id);
    if (!bossHit) dmg *= 1 + ((this.elapsed - this.zoneStart) / 60) * gameData.enemyDamageGrowthPerMin;
    if (this.pHas('steelSkin')) dmg *= 0.85;
    const L = this.kit;
    dmg *= 1 - Math.min(80, L.v('gear.dr') + Math.min(50, L.v('chip.dr'))) / 100;
    this.sinceHurt = 0;
    this.lastHurtAt = this.elapsed;
    // 자기 갑옷 조합: EMP 필드가 켜져 있는 동안 받는 피해 감소
    if (L.has('combo.empArmor') && this.weapons.some((w) => w.id === 'empField' && w.activeOn)) dmg *= 1 - L.v('combo.empArmor') / 100;
    // 반응 지뢰 조합: 맞으면 발밑에 지뢰 (cd초에 1번)
    if (L.has('combo.mineReactive') && this.mineReactT <= this.elapsed) {
      const mw = this.weapons.find((w) => w.id === 'proxMine') as unknown as { dropAt?: (x: number, y: number) => void } | undefined;
      if (mw?.dropAt) {
        this.mineReactT = this.elapsed + L.v('combo.mineReactive', 'cd', 2);
        mw.dropAt(p.x, p.y);
      }
    }
    // 개편 2-2 반격: 반응 장갑 충격파, 반격 유탄 (맞으면 바로, 막아도)
    if (L.has('chip.hurtZap')) this.zapNearest(p.x, p.y, L.v('chip.hurtZap', 'n', 2), L.v('chip.hurtZap', 'dmg') * this.stats.damageMul);
    if (L.has('gear.reactive') && this.reactiveT <= 0) {
      this.reactiveT = 1;
      this.synBlast(p.x, p.y, L.v('gear.reactive', 'r', 70), L.v('gear.reactive') * this.stats.damageMul, COLORS.orange);
    }
    if (L.has('combo.grenadeReactive') && this.grenadeReactT <= 0) {
      const gw = this.weapons.find((w) => w.id === 'plasmaGrenade') as unknown as { autoThrow?: (x: number, y: number) => void } | undefined;
      const near = this.nearestEnemy(260).e;
      if (gw?.autoThrow && near) {
        this.grenadeReactT = L.v('combo.grenadeReactive', 'cd', 2);
        for (let i = 0; i < L.v('combo.grenadeReactive', 'n', 1); i++) gw.autoThrow(near.x + (Math.random() - 0.5) * 20 * i, near.y + (Math.random() - 0.5) * 20 * i);
      }
    }
    // 에너지 실드가 먼저 흡수 (깨지면 cd초 뒤 다시 참). 과부하 실드 조합: 깨질 때 EMP 폭발
    if (this.gShield > 0) {
      const absorbed = Math.min(this.gShield, dmg);
      this.gShield -= absorbed;
      dmg -= absorbed;
      if (this.gShield <= 0) {
        this.gShieldCd = L.v('gear.shield', 'cd', 10);
        if (L.has('combo.empShield')) this.synBlast(p.x, p.y, L.v('combo.empShield', 'r', 90), L.v('combo.empShield', 'dmg') * this.stats.damageMul, 0x66ffff, 'electric');
      }
      if (dmg <= 0) {
        p.invuln = 0.3;
        this.burst(p.x, p.y, COLORS.cyan, 6);
        Sound.play('block');
        return;
      }
    }
    // 광전사 5줄: 발동 중 받는 피해 감소
    if (this.berserk && this.os.has('berserk.last')) dmg *= 1 - this.os.v('dr') / 100;
    // 순간 재부팅 쉴드·가디언 보호막이 먼저 피해를 흡수
    if (p.shieldT > 0 && p.shield > 0) {
      const absorbed = Math.min(p.shield, dmg);
      p.shield -= absorbed;
      dmg -= absorbed;
      const guarding = this.specialOn && this.specialId === 'guardian';
      // 가디언 5줄: 보호막이 받은 피해 일부를 공격한 적에게 돌려줌
      if (guarding && this.os.has('guardian.reflect') && src) {
        const att = src.id === this.boss?.id ? this.boss : this.grid.query(p.x, p.y, 120, this.chainBuf).find((e) => e.active && e.id === src.id);
        if (att) {
          this.zap(p.x, p.y, att.x, att.y, 0x4fa8ff);
          this.synDamage(att, (absorbed * this.os.v('reflect', 50)) / 100);
        }
      }
      // 가디언 3줄: 보호막이 깨질 때 충격파
      if (guarding && p.shield <= 0 && this.os.has('guardian.burst')) this.synBlast(p.x, p.y, this.os.v('radius', 120), this.os.v('dmg', 120) * this.stats.damageMul, 0x4fa8ff);
      if (dmg <= 0) {
        p.invuln = 0.3;
        this.burst(p.x, p.y, COLORS.cyan, 6);
        Sound.play('block');
        return;
      }
    }
    p.hp -= dmg;
    p.invuln = bossHit ? PLAYER.bossHurtInvuln : PLAYER.hurtInvuln;
    // 광전사 5줄: 체력이 낮아지면 게이지가 차 있을 때 자동 발동
    if (this.specialId === 'berserk' && this.os.has('berserk.last') && !this.specialOn && this.odGauge >= 100 && p.hp > 0 && p.hp <= (p.maxHp * this.os.v('hpPct', 30)) / 100) this.activateSpecial();
    Sound.play('hurt');
    // 불굴: 치명상을 입으면 체력 1로 버티고 3초 무적 (챕터마다 1번)
    if (p.hp <= 0 && this.pHas('undying') && !this.undyingUsed) {
      this.undyingUsed = true;
      p.hp = 1;
      p.invuln = 3;
      this.screenFlash(0xff2a3a, 0.3, 400);
      const t = this.add.text(p.x, p.y - 28, 'UNDYING', { ...TEXT, fontSize: '13px', color: '#ff2a3a' }).setOrigin(0.5).setDepth(90);
      this.tweens.add({ targets: t, y: t.y - 20, alpha: 0, duration: 1400, onComplete: () => t.destroy() });
      return;
    }
    if (this.pHas('pulse')) {
      for (const e of this.grid.query(p.x, p.y, 70, this.chainBuf).slice()) {
        if (!e.active) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
        if (d > 70) continue;
        if (!e.isBoss) {
          e.x += ((e.x - p.x) / d) * 40;
          e.y += ((e.y - p.y) / d) * 40;
        }
        this.damage(e, 50 * this.stats.damageMul);
      }
      this.burst(p.x, p.y, COLORS.cyan, 16);
    }
    this.shake(120, 0.008);
    if (p.hp <= 0 && this.revives > 0) {
      // 리퍼닥 비상 재부팅: 한 번 되살아나며 주변 적을 밀어낸다
      this.revives--;
      p.hp = Math.ceil(p.maxHp * 0.5);
      p.invuln = 2;
      for (const e of this.grid.query(p.x, p.y, 120, this.chainBuf).slice()) {
        if (!e.active || e.isBoss) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
        e.x += ((e.x - p.x) / d) * 80;
        e.y += ((e.y - p.y) / d) * 80;
      }
      this.blockEnemyBullets(p.x, p.y, 200);
      this.screenFlash(COLORS.cyan, 0.4, 500);
      Sound.play('overclock');
      const t = this.add.text(p.x, p.y - 28, 'EMERGENCY REBOOT', { ...TEXT, fontSize: '13px', color: '#00f0ff' }).setOrigin(0.5).setDepth(90);
      this.tweens.add({ targets: t, y: t.y - 20, alpha: 0, duration: 1400, onComplete: () => t.destroy() });
      return;
    }
    if (p.hp <= 0) this.endRun(false);
  }

  private updateBullets(dt: number): void {
    for (const b of this.bullets.items) {
      if (!b.active) continue;
      b.update(dt);
      if (!b.active) continue;
      this.dmgSrc = b.src;
      for (const e of this.grid.query(b.x, b.y, b.radius + MAX_ENEMY_RADIUS, this.near)) {
        if (!e.active || b.hits.includes(e) || e.dodgeT > 0) continue;
        const rr = e.radius + b.radius;
        if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 < rr * rr) {
          // 관통: 꿰뚫을 때마다 피해 ×0.8 누적 (첫 적 100%). 슬러그 탄·검기는 제외
          const killed = this.damage(e, b.damage * (b.falloff ? gameData.falloff.pierce ** b.hits.length : 1), b.tag ?? 'bullet');
          b.hits.push(e);
          // 반사 장갑병: 총탄은 관통·연쇄 없이 사라진다
          if (e.id === 'c_mirror' && !b.tag) {
            b.kill();
            this.burst(b.x, b.y, COLORS.cyan, 3);
            break;
          }
          if (killed) b.onKill?.(e);
          b.onHit?.(e, killed);
          if (b.hitFx) this.playFx(b.hitFx, e.x, e.y);
          if (b.chain > 0) this.chainFrom(b, e);
          if (b.hits.length > b.pierce) {
            b.kill();
            break;
          }
        }
      }
    }
    this.dmgSrc = null;
  }

  /** 스마트 피스톨 연쇄 사격: 맞힌 자리에서 가장 가까운 다른 적에게 새 탄 */
  private chainFrom(b: Projectile, hit: Enemy): void {
    let best: Enemy | null = null;
    let bestD = 160 * 160;
    for (const o of this.grid.query(hit.x, hit.y, 160, this.chainBuf)) {
      if (!o.active || o === hit || b.hits.includes(o)) continue;
      const d = (o.x - hit.x) ** 2 + (o.y - hit.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (!best) return;
    const a = Math.atan2(best.y - hit.y, best.x - hit.x);
    // 튕긴 탄은 피해 ×0.8 (여러 번 튕기면 누적)
    this.fireBullet(hit.x, hit.y, a, b.speed, b.damage * gameData.falloff.chain, { target: best, chain: b.chain - 1 });
  }

  /** 사이버웨어 특수 능력 중 시간에 따라 발동하는 것 */
  private updatePassiveSpecials(dt: number): void {
    const p = this.player;
    this.sinceHurt += dt;
    if (this.pHas('nanoRegen') && this.sinceHurt > 3 && p.hp < p.maxHp) this.heal(2 * dt, true);
    if (this.streakT > 0 && (this.streakT -= dt) <= 0) this.streak = 0;
    // 가속 연쇄: 처치 후 1초 동안 공격 속도 +20% (곱연산)
    if (this.rushT > 0) this.rushT -= dt;
    this.stats.cooldownMul = this.baseCooldownMul / (this.rushT > 0 ? 1.2 : 1) / (1 + (this.focusStacks * this.kit.v('syn.prec5', 'v', 5)) / 100);
    // 특이점: 화면의 적을 한 점으로 끌어모은 뒤 폭발
    if (this.pHas('singularity')) {
      if (!this.singPull && (this.singT -= dt) <= 0) {
        this.singT = 15;
        let sx = 0;
        let sy = 0;
        let n = 0;
        for (const e of this.enemyPool.items) {
          if (!e.active || e.isBoss || !this.onScreen(e.x, e.y)) continue;
          sx += e.x;
          sy += e.y;
          n++;
        }
        if (n) this.singPull = { x: sx / n, y: sy / n, t: 0.7 };
      }
      const sp = this.singPull;
      if (sp) {
        sp.t -= dt;
        this.fx.lineStyle(2, 0x39ff88, 0.6).strokeCircle(sp.x, sp.y, 20 + sp.t * 120);
        for (const e of this.enemyPool.items) {
          if (!e.active || e.isBoss || !this.onScreen(e.x, e.y)) continue;
          const d = Math.hypot(sp.x - e.x, sp.y - e.y) || 1;
          const v = Math.min(d, 420 * dt) * this.ccMul(e);
          e.x += ((sp.x - e.x) / d) * v;
          e.y += ((sp.y - e.y) / d) * v;
        }
        if (sp.t <= 0) {
          for (const e of this.grid.query(sp.x, sp.y, 90, this.chainBuf).slice()) if (e.active && (e.x - sp.x) ** 2 + (e.y - sp.y) ** 2 < 90 * 90) this.damage(e, 120 * this.stats.damageMul, 'explosive');
          this.burst(sp.x, sp.y, 0x39ff88, 30);
          this.screenFlash(0x39ff88, 0.15, 200);
          Sound.play('explode');
          this.singPull = null;
        }
      }
    }
    if (this.pHas('dataSiphon') && (this.siphonT -= dt) <= 0) {
      this.siphonT = 30;
      for (const k of this.pickups.items) if (k.active && k.kind === 'xp') k.magnet = true;
      this.screenFlash(0x39ff88, 0.2, 250);
    }
  }

  private killEnemy(e: Enemy, tag?: DamageTag): void {
    this.kills++;
    // 스폰 디렉터 처치 속도용 (보스·진압대 제외)
    if (!e.isBoss && !e.id.startsWith('trooper_')) this.killTimes.push(this.elapsed);
    if (e.isBoss) {
      const def = this.bossDef!;
      this.boss = null;
      this.hookChain?.setVisible(false);
      this.hookHead?.setVisible(false);
      this.hookTrail?.setVisible(false);
      this.basiliGlow?.setVisible(false);
      this.basiliCore?.setVisible(false);
      this.basiliShadow?.setVisible(false);
      this.basiliFlash?.setVisible(false);
      this.basiliReflect?.setVisible(false);
      this.basiliHalo?.setVisible(false);
      this.stompRings = [];
      this.containers = [];
      this.clearPlasma();
      // XM-4 다리·반사광 겹 (몸통은 보스 스프라이트라 e.kill()로 사라짐)
      this.hideXm4Layers();
      this.bossDef = null;
      e.kill();
      const color = def.final ? 0xff2a3a : COLORS.orange;
      for (let i = 0; i < 6; i++) {
        this.time.delayedCall(i * 120, () => this.burst(e.x + Phaser.Math.Between(-20, 20), e.y + Phaser.Math.Between(-20, 20), color, 24));
      }
      this.shake(500, 0.02);
      this.hud.bossName.setText('');
      Sound.play('bossdie');
      if (!def.final) this.run.midbossKills++;
      else if (def.id === 'boss') this.run.bossKills++;
      else if (def.id === 'boss2') this.run.hexKills++;
      else this.run.coreKills++;
      if (def.final && this.zoneIdx < ZONES.length - 1) {
        // 개편 2단계: 챕터 보스 보상 — 다음 챕터 시작 때 여는 전설 이상 보급 상자 + 칩
        this.chestQueue.push(gameData.supply.bossMin);
        this.addChips(gameData.supply.chips.boss);
        // 구역 보스: 주변 적을 정리하고 의뢰인 대화 뒤 다음 구역으로
        this.clearArena();
        this.clearField();
        this.transitionT = 1.6;
        Sound.music(null, 800);
        const t = this.add.text(VIEW_W / 2, VIEW_H / 2 - 40, 'ZONE CLEAR', { ...TEXT, fontSize: '24px', color: '#39ff88' }).setOrigin(0.5).setScrollFactor(0).setDepth(120).setShadow(0, 0, '#39ff88', 10, true, true);
        this.tweens.add({ targets: t, alpha: 0, delay: 900, duration: 600, onComplete: () => t.destroy() });
      } else if (def.final) {
        // 센서스 정지: 주변을 정리하고 진과의 마지막 대화 뒤 결과 화면
        this.clearArena();
        this.clearField();
        Sound.music(null, 400);
        this.time.delayedCall(700, () => Sound.play('victory'));
        this.time.delayedCall(1600, () => {
          if (this.state === 'play') this.startDialog((zonesData as { ending?: Line[] }).ending ?? [], () => this.endRun(true));
        });
      } else {
        // 중간 보스 보상: 큰 경험치(바로 오름)와 회복
        this.gainXp(def.rewardXp);
        this.dropPickup('heal', e.x + 14, e.y, gameData.healAmount * 2);
        // 엘리트 보스 보상: 전설 이상 보급 상자 + 칩
        this.dropChest(e.x - 14, e.y, gameData.supply.midbossMin);
        this.addChips(gameData.supply.chips.midboss);
        Sound.music(this.zoneMusic, 1500);
      }
      return;
    }
    this.burst(e.x, e.y, e.id === 'thug' ? COLORS.orange : e.id === 'gunner' ? 0xb6ff3a : e.id.startsWith('trooper') ? 0xff2a3a : COLORS.magenta, e.id.startsWith('trooper') ? 20 : 8);
    Sound.play('kill');
    // 경험치는 줍지 않아도 바로 오름
    this.gainXp(e.xp);
    if (this.pHas('healCollect') && ++this.shardCount >= 50) {
      this.shardCount = 0;
      this.heal(5);
    }
    // 칩: 일반 처치는 확률로 1~3개 드롭, 블랙 실드 대원은 늘 드롭. 대원은 가끔 희귀 이상 상자 (상자는 시간마다 따로)
    const SU = gameData.supply;
    if (e.id.startsWith('trooper')) {
      this.dropPickup('chip', e.x + 5, e.y - 3, SU.chips.trooper);
      if (Math.random() < SU.trooperChance) this.dropChest(e.x, e.y, 'rare');
    } else if (Math.random() * 100 < SU.chipDrop.chance) this.dropPickup('chip', e.x + 5, e.y - 3, this.pickWeighted(SU.chipDrop.counts));
    if (Math.random() < gameData.healDropChance) this.dropPickup('heal', e.x + 6, e.y, gameData.healAmount);
    // OS 게이지: chargeKills명 처치로 가득
    const act = this.os.def.active;
    if (!this.specialOn && act) this.odGauge = Math.min(100, this.odGauge + 100 / act.chargeKills);
    this.osKill(e, tag);
    // 광전사 모드: 근접 무기로 처치했을 때만 체력 회복
    if (this.pHas('killStreak')) {
      this.streak = Math.min(20, this.streak + 1);
      this.streakT = 3;
    }
    if (this.pHas('killRush')) this.rushT = 1;
    if (e.id === 'drone') this.run.droneKills++;
    else if (e.id.startsWith('trooper')) this.run.trooperKills++;
    this.killProcs(e, tag);
    e.kill();
  }

  // ───────────── 개편 2-2: 시너지 효과 (태그 단계·조합) ─────────────
  /** 맞힐 때: 감전·화상·폭발 반복·관통 치명타·드론 아군화 */
  private hitProcs(e: Enemy, amount: number, tag: DamageTag | undefined, src: string | null, crit: boolean): void {
    const L = this.kit;
    const wt = (src && this.wTags.get(src)) || [];
    // 전기 5단계 과충전: 전기 공격으로 n번 맞히면 화면 안 모든 적에게 방전
    if (L.has('syn.elec5') && (tag === 'electric' || wt.includes('전기')) && ++this.elecHits >= L.v('syn.elec5', 'n', 100)) {
      this.elecHits = 0;
      this.overcharge(L.v('syn.elec5', 'dmg', 80));
    }
    if (L.has('syn.elec2') && (tag === 'electric' || wt.includes('전기')) && Math.random() * 100 < L.v('syn.elec2', 'chance')) this.addDot(e, 'shock', L.v('syn.elec2', 'dur'));
    if (L.has('syn.boom3') && (tag === 'explosive' || wt.includes('폭발'))) this.addDot(e, 'burn', L.v('syn.boom3', 'dur'));
    if (L.has('syn.boom4') && tag === 'explosive' && this.echoes.length < 80) this.echoes.push({ e, t: L.v('syn.boom4', 'delay'), dmg: (amount * L.v('syn.boom4', 'pct')) / 100 });
    // 전도 레일 조합: 레일건에 맞은 적은 감전
    if (src === 'railgun' && L.has('combo.railShock')) this.addDot(e, 'shock', L.v('combo.railShock', 'dur', 2));
    if (src === 'hackDrone' && L.has('combo.droneNeural') && Math.random() * 100 < L.v('combo.droneNeural', 'chance')) this.charm(e, L.v('combo.droneNeural', 'dur'));
    // 정밀 4단계: 치명타는 뒤의 적 n명에게도 같은 피해 (관통)
    if (crit && L.has('syn.prec4')) {
      const p = this.player;
      const a = Math.atan2(e.y - p.y, e.x - p.x);
      let n = L.v('syn.prec4', 'n', 1);
      const list = this.grid.query(e.x, e.y, 70, this.chainBuf).filter((o) => o.active && o !== e && Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(o.y - e.y, o.x - e.x) - a)) < 0.6);
      list.sort((u, v) => (u.x - e.x) ** 2 + (u.y - e.y) ** 2 - ((v.x - e.x) ** 2 + (v.y - e.y) ** 2));
      for (const o of list) {
        if (n-- <= 0) break;
        this.zap(e.x, e.y, o.x, o.y, COLORS.yellow);
        this.synDamage(o, amount, tag);
      }
    }
  }

  /** 처치할 때: 근접 회복·감전 번개·해킹 전염·아군화된 적 EMP */
  private killProcs(e: Enemy, tag?: DamageTag): void {
    const L = this.kit;
    const src = this.dmgSrc;
    const wt = (src && this.wTags.get(src)) || [];
    const dot = this.dots.get(e);
    this.dots.delete(e);
    if (L.has('syn.melee3') && (tag === 'melee' || wt.includes('근접'))) this.heal(L.v('syn.melee3', 'heal', 1), true);
    // 칩셋: 연쇄 폭발, 흡혈, 처치 보호막
    if (L.has('chip.killBoom') && Math.random() * 100 < L.v('chip.killBoom', 'chance')) this.synBlast(e.x, e.y, L.v('chip.killBoom', 'r', 40), L.v('chip.killBoom', 'dmg') * this.stats.damageMul, COLORS.orange, 'explosive');
    if (L.has('chip.vamp') && Math.random() * 100 < L.v('chip.vamp', 'chance')) this.heal(L.v('chip.vamp', 'heal', 1), true);
    if (L.has('chip.killShield') && ++this.chipKills >= Math.max(1, L.v('chip.killShield', 'n', 25))) {
      this.chipKills = 0;
      const p = this.player;
      p.shield = Math.max(p.shield, L.v('chip.killShield'));
      p.shieldT = Math.max(p.shieldT, 5);
    }
    if (dot && dot.shock > 0 && L.has('syn.elec3')) {
      // 감전된 적이 죽으면 근처 n명에게 번개 (감전 초당 피해의 3배)
      let n = L.v('syn.elec3', 'n', 2);
      const dmg = this.shockDps() * 3;
      for (const o of this.grid.query(e.x, e.y, 90, this.chainBuf).slice()) {
        if (n <= 0) break;
        if (!o.active || o === e || (o.x - e.x) ** 2 + (o.y - e.y) ** 2 > 90 * 90) continue;
        n--;
        this.zap(e.x, e.y, o.x, o.y, COLORS.cyan);
        this.synDamage(o, dmg, 'electric');
        if (o.active) this.addDot(o, 'shock', L.v('syn.elec2', 'dur', 2));
      }
    }
    // 해커 3줄: 감전(해킹)된 적이 죽으면 근처로 옮음
    if (dot && dot.hack > 0 && this.os.has('hacker.chain')) {
      let n = this.os.v('chain', 2);
      for (const o of this.grid.query(e.x, e.y, 90, this.chainBuf).slice()) {
        if (n <= 0) break;
        if (!o.active || o === e || (o.x - e.x) ** 2 + (o.y - e.y) ** 2 > 90 * 90) continue;
        n--;
        this.zap(e.x, e.y, o.x, o.y, 0x9d6bff);
        this.addDot(o, 'hack', this.os.v('dur', 4));
        if (this.os.has('hacker.slow')) this.slow(o, this.os.v('dur', 4));
      }
    }
    if (L.has('syn.hack3') && Math.random() * 100 < L.v('syn.hack3', 'chance')) {
      const o = this.grid.query(e.x, e.y, 110, this.chainBuf).find((q) => q.active && q !== e && !q.isBoss && q.charmT <= 0);
      if (o) this.charm(o, L.v('syn.hack3', 'dur', 3));
    }
    if (e.charmT > 0 && L.has('syn.hack4')) {
      const r = L.v('syn.hack4', 'r', 70);
      for (const o of this.grid.query(e.x, e.y, r, this.chainBuf)) if (o.active && o !== e && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < r * r) this.slow(o, L.v('syn.hack4', 'slow', 1.5));
      this.synRing(e.x, e.y, r, 0x66ffff);
    }
  }

  private shockDps(): number {
    return Math.max(this.kit.v('syn.elec2', 'dps'), this.kit.v('combo.railShock', 'dps')) * this.kit.v('syn.elec4', 'mul', 1) * this.stats.damageMul;
  }

  private addDot(e: Enemy, kind: 'shock' | 'burn' | 'hack', dur: number): void {
    if (!e.active || dur <= 0) return;
    let d = this.dots.get(e);
    if (!d) {
      if (this.dots.size > 300) return;
      this.dots.set(e, (d = { shock: 0, burn: 0, hack: 0, acc: 0 }));
    }
    d[kind] = Math.max(d[kind], dur);
  }

  /** 시너지 효과가 내는 피해 (다른 시너지를 다시 터뜨리지 않음) */
  private synDamage(e: Enemy, amount: number, tag?: DamageTag): boolean {
    const lock = this.procLock;
    this.procLock = true;
    const k = this.damage(e, amount, tag);
    this.procLock = lock;
    return k;
  }

  /** 반경 r 안의 적 모두에게 시너지 피해 + 퍼지는 고리 */
  private synBlast(x: number, y: number, r: number, dmg: number, color: number, tag?: DamageTag): void {
    for (const o of this.grid.query(x, y, r, this.chainBuf).slice()) if (o.active && (o.x - x) ** 2 + (o.y - y) ** 2 < (r + o.radius) ** 2) this.synDamage(o, dmg, tag);
    this.synRing(x, y, r, color);
  }

  /** 가까운 적 n명에게 번개 (칩셋 대시 방전·피격 방전) */
  private zapNearest(x: number, y: number, n: number, dmg: number): void {
    const list = this.grid.query(x, y, 140, this.chainBuf).filter((o) => o.active && (o.x - x) ** 2 + (o.y - y) ** 2 < 140 * 140);
    list.sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2));
    for (const o of list.slice(0, Math.max(0, Math.round(n)))) {
      this.zap(x, y, o.x, o.y, COLORS.cyan);
      this.synDamage(o, dmg, 'electric');
    }
  }

  private synRing(x: number, y: number, r: number, color: number): void {
    if (this.synRings.length < 40) this.synRings.push({ x, y, r: r * 0.3, max: r, life: 0.3, color });
  }

  private zap(x1: number, y1: number, x2: number, y2: number, color: number): void {
    if (this.zaps.length >= 40) return;
    const pts = [x1, y1];
    for (let i = 1; i < 4; i++) pts.push(x1 + ((x2 - x1) * i) / 4 + (Math.random() - 0.5) * 8, y1 + ((y2 - y1) * i) / 4 + (Math.random() - 0.5) * 8);
    pts.push(x2, y2, color);
    this.zaps.push({ pts, life: 0.15 });
  }

  /** 매 프레임: 장비(재생·실드), 감전·화상, 폭발 반복, 그림 */
  private updateSynergy(dt: number): void {
    const L = this.kit;
    const p = this.player;
    this.sinceDash += dt;
    this.reactiveT -= dt;
    this.grenadeReactT -= dt;
    if (L.has('gear.regen') && p.hp < p.maxHp && p.hp > 0) this.heal(L.v('gear.regen') * dt, true);
    if (L.has('chip.regen') && p.hp < p.maxHp && p.hp > 0) this.heal(L.v('chip.regen') * dt, true);
    // 냉각 칩셋: 0.25초마다 주변 적 감속
    if (L.has('chip.frost') && (this.frostT -= dt) <= 0) {
      this.frostT = 0.25;
      const r = L.v('chip.frost', 'r', 50);
      for (const o of this.grid.query(p.x, p.y, r, this.chainBuf)) if (o.active && (o.x - p.x) ** 2 + (o.y - p.y) ** 2 < r * r) this.slow(o, 0.4);
      this.fx.lineStyle(1, 0x9fe8ff, 0.18).strokeCircle(p.x, p.y, r);
    }
    if (L.has('gear.shield') && this.gShield <= 0 && (this.gShieldCd -= dt) <= 0) {
      this.gShield = L.v('gear.shield');
      this.gShieldCd = L.v('gear.shield', 'cd', 10);
    }
    // 감전·화상: 0.5초마다 묶어서
    if (this.dots.size) {
      const burnDps = L.v('syn.boom3', 'dps') * this.stats.damageMul;
      const shockDps = this.shockDps();
      const hackDps = this.os.v('dot', 15) * this.stats.damageMul;
      for (const [e, d] of [...this.dots]) {
        if (!e.active) {
          this.dots.delete(e);
          continue;
        }
        d.shock = Math.max(0, d.shock - dt);
        d.burn = Math.max(0, d.burn - dt);
        d.hack = Math.max(0, d.hack - dt);
        d.acc += dt;
        if (d.acc >= 0.5) {
          const dmg = ((d.shock > 0 ? shockDps : 0) + (d.burn > 0 ? burnDps : 0) + (d.hack > 0 ? hackDps : 0)) * d.acc;
          d.acc = 0;
          if (dmg > 0) this.synDamage(e, dmg);
        }
        if (d.shock <= 0 && d.burn <= 0 && d.hack <= 0) this.dots.delete(e);
        else if (e.active && Math.random() < dt * 6) this.burst(e.x, e.y, d.hack > 0 ? 0x9d6bff : d.shock > 0 ? COLORS.cyan : COLORS.orange, 1);
      }
    }
    for (const ec of this.echoes) {
      ec.t -= dt;
      if (ec.t <= 0 && ec.e.active) {
        this.burst(ec.e.x, ec.e.y, COLORS.orange, 3);
        this.synDamage(ec.e, ec.dmg);
      }
    }
    this.echoes = this.echoes.filter((ec) => ec.t > 0 && ec.e.active);
    // 그림: 에너지 실드, 번개, 고리
    const fx = this.fx;
    if (this.gShield > 0) fx.lineStyle(1.5, COLORS.cyan, 0.55).strokeCircle(p.x, p.y, 17);
    for (const z of this.zaps) {
      z.life -= dt;
      const c = z.pts[z.pts.length - 1];
      fx.lineStyle(1.5, c, Math.max(0, z.life / 0.15));
      fx.beginPath();
      fx.moveTo(z.pts[0], z.pts[1]);
      for (let i = 2; i < z.pts.length - 1; i += 2) fx.lineTo(z.pts[i], z.pts[i + 1]);
      fx.strokePath();
    }
    this.zaps = this.zaps.filter((z) => z.life > 0);
    for (const r of this.synRings) {
      r.life -= dt;
      r.r += ((r.max - r.r) * dt) / 0.1;
      fx.lineStyle(2, r.color, Math.max(0, r.life / 0.3)).strokeCircle(r.x, r.y, r.r);
    }
    this.synRings = this.synRings.filter((r) => r.life > 0);
  }

  private dropPickup(kind: PickupKind, x: number, y: number, v: number): void {
    this.pickups.acquire().spawn(kind, x, y, v);
  }

  private updatePickups(dt: number): void {
    const p = this.player;
    const pk = gameData.pickup;
    const radius = pk.radius * this.stats.pickupMul;
    if ((this.mergeT -= dt) <= 0) {
      this.mergeT = 1;
      this.mergePickups();
    }
    for (const k of this.pickups.items) {
      if (!k.active) continue;
      const dx = p.x - k.x;
      const dy = p.y - k.y;
      const d = Math.hypot(dx, dy);
      k.age += dt;
      // 가까이 있거나, 오래 떨어져 있던 경험치는 플레이어에게 끌려온다
      if (!k.magnet && (d < radius || (k.kind === 'xp' && k.age > pk.autoMagnetAge))) k.magnet = true;
      if (!k.magnet) continue;
      k.vel = Math.min(k.vel + 900 * dt, 500);
      k.x += (dx / (d || 1)) * k.vel * dt;
      k.y += (dy / (d || 1)) * k.vel * dt;
      k.sprite.setPosition(k.x, k.y);
      k.follow();
      if (d < 10) {
        k.kill();
        if (k.kind === 'heal') {
          this.heal(k.value);
          Sound.play('heal');
        } else if (k.kind === 'chest') {
          this.chestQueue.push(gameData.rarity[Math.round(k.value)]?.id ?? 'common');
          Sound.play('select');
        } else if (k.kind === 'chip') {
          // 칩 = 재화 + 경험치
          this.addChips(k.value);
          this.gainXp(k.value * gameData.supply.chipXp);
          const now = this.time.now;
          this.pickupStep = now - this.pickupAt > 400 ? 0 : Math.min(this.pickupStep + 1, 12);
          this.pickupAt = now;
          Sound.play('pickup', this.pickupStep * 50);
        } else {
          this.gainXp(k.value);
          // 연달아 주우면 음이 한 칸씩 올라간다 (무작위 음정 대신 계단처럼). 잠깐 쉬면 처음 음으로
          const now = this.time.now;
          this.pickupStep = now - this.pickupAt > 400 ? 0 : Math.min(this.pickupStep + 1, 12);
          this.pickupAt = now;
          Sound.play('pickup', this.pickupStep * 50);
          // 회복 수집: 조각 50개마다 체력 5
          if (this.pHas('healCollect') && ++this.shardCount >= 50) {
            this.shardCount = 0;
            this.heal(5);
          }
        }
      }
    }
  }

  /** 멀리 쌓인 경험치 조각을 64px 칸마다 하나로 합친다 (성능·가독성) */
  private mergePickups(): void {
    const pk = gameData.pickup;
    const p = this.player;
    let n = 0;
    for (const k of this.pickups.items) if (k.active && k.kind === 'xp') n++;
    if (n <= pk.mergeAbove) return;
    const cells = new Map<number, Pickup>();
    for (const k of this.pickups.items) {
      if (!k.active || k.kind !== 'xp' || k.magnet) continue;
      if ((k.x - p.x) ** 2 + (k.y - p.y) ** 2 < pk.mergeDistance ** 2) continue;
      const key = ((Math.floor(k.x / 64) & 0xffff) << 16) | (Math.floor(k.y / 64) & 0xffff);
      const host = cells.get(key);
      if (!host) {
        cells.set(key, k);
        continue;
      }
      host.value += k.value;
      host.sprite.setScale(Math.min(2.5, 1 + Math.log2(host.value) / 4));
      k.kill();
    }
  }

  private xpToNext(): number {
    const c = gameData.xpCurve;
    const L = this.level;
    return Math.round(c.base + c.linear * L + c.quad * L * L);
  }

  private gainXp(v: number): void {
    this.xp += v * (this.pHas('dataGorge') ? 1.3 : 1) * (1 + this.kit.v('chip.xp') / 100);
    while (this.xp >= this.xpToNext()) {
      this.xp -= this.xpToNext();
      this.level++;
      this.pendingLevels++;
    }
  }

  // ───────────────────────────── OS (Q 능력) ─────────────────────────────
  /** 지금 낀 OS (레벨에 따라 켜진 줄) */
  private os = new OsState('stock', 1);
  /** 최소 재사용 대기: 발동한 뒤 이 시간이 지나야 게이지가 다시 가득 참 */
  private osCdT = 0;
  /** 광학 위장 3줄: 풀린 뒤 첫 공격 강화 */
  private ambush = false;
  /** 발동 중 처치로 늘어난 지속 시간 합 (뉴럴 3줄·광학 위장 5줄 상한용) */
  private osExt = 0;
  /** 택티컬 표식: 적 → 남은 초 */
  private marks = new Map<Enemy, number>();
  /** 궤도 폭격 3줄 화염 지대 */
  private fireZones: { x: number; y: number; t: number }[] = [];
  /** 택티컬 5줄 무료 포탑 */
  private freeTurrets: { x: number; y: number; t: number; fire: number; img: Phaser.GameObjects.Image }[] = [];
  /** 보스 기절 (궤도 폭격·해커 5줄): 남은 초, 다시 걸 수 있기까지 */
  private bossStunT = 0;
  private bossStunCd = 0;

  /** GameContext: 뉴럴 오버클럭 중 공격속도 배율 */
  get odFireMul(): number {
    return this.overdrive ? this.os.v('atk', 2) : 1;
  }

  /** 뉴럴 오버클럭 중 적·적 탄 속도 배율 */
  private get odSlowMul(): number {
    return this.overdrive ? this.os.v('slow', 0.5) : 1;
  }

  isMarked(e: Enemy): boolean {
    return (this.marks.get(e) ?? 0) > 0;
  }

  /** 판 시작·개발자 도구: OS를 끼움 */
  private setOs(id: string, level: number): void {
    if (this.specialOn) this.endSpecial();
    this.os = new OsState(id, level);
    this.specialId = this.os.id;
    this.odGauge = 0;
    this.osCdT = 0;
    this.hud?.od.setColor(this.os.def.color);
    this.rebuildLoadout(false);
  }

  private updateOverdrive(dt: number): void {
    // OS 능력: 게이지가 차면 Q(모바일 OS 버튼)로 발동. 자동 조준이면 바로 발동
    const wantSkill = this.controls.consumeSkill();
    this.osCdT = Math.max(0, this.osCdT - dt);
    if (!this.os.hasActive) this.odGauge = 0;
    else if (!this.specialOn && this.osCdT > 0) this.odGauge = Math.min(this.odGauge, 99);
    if (this.os.hasActive && !this.specialOn && this.odGauge >= 100 && (wantSkill || this.controls.autoAim)) this.activateSpecial();
    if (this.specialOn) {
      this.odTime -= dt;
      this.odGauge = Phaser.Math.Clamp((this.odTime / this.specialDuration) * 100, 0, 100);
      if (this.overdrive) {
        this.odOverlay.setAlpha(0.06 + Math.sin(this.elapsed * 12) * 0.03);
        // 잔상 효과
        this.ghostTimer -= dt;
        if (this.ghostTimer <= 0) {
          this.ghostTimer = 0.04;
          this.spawnGhost(this.ghosts.length % 2 ? COLORS.magenta : COLORS.cyan);
        }
      } else if (this.berserk) {
        this.odOverlay.setAlpha(0.07 + Math.sin(this.elapsed * 9) * 0.03);
        if ((this.ghostTimer -= dt) <= 0) {
          this.ghostTimer = 0.07;
          this.spawnGhost(0xff2a3a);
        }
      } else if (this.specialId === 'orbital') this.updateOrbital(dt);
      if (this.odTime <= 0) this.endSpecial();
    }
    this.updateOsEffects(dt);
    for (const g of this.ghosts) {
      if (g.life <= 0) continue;
      g.life -= dt;
      g.img.setAlpha(Math.max(0, g.life / 0.25) * 0.6);
      if (g.life <= 0) g.img.setVisible(false);
    }
  }

  /** OS 능력이 끝날 때 */
  private endSpecial(): void {
    const os = this.os;
    if (this.overdrive) {
      Sound.slowWorld(false);
      Sound.play('slowmo_out');
      // 뉴럴 5줄: 끝날 때 주변 적 감속
      if (os.has('neural.flush')) {
        const r = os.v('radius', 160);
        for (const e of this.grid.query(this.player.x, this.player.y, r, this.chainBuf)) if (e.active && (e.x - this.player.x) ** 2 + (e.y - this.player.y) ** 2 < r * r) this.slow(e, os.v('slowT', 2));
        this.synRing(this.player.x, this.player.y, r, COLORS.magenta);
      }
    }
    if (this.specialId === 'cloak' && os.has('cloak.ambush')) this.ambush = true;
    this.specialOn = this.overdrive = false;
    this.odGauge = 0;
    this.odOverlay.setVisible(false);
    this.cameras.main.postFX?.clear();
    this.odFxOn = false;
    this.glitch.clear();
    if (this.berserk) {
      this.berserk = false;
      this.recalcStats();
    }
    // 뉴럴 5줄: 보조무기 재사용 대기 없음이 끝남
    if (os.has('neural.flush')) this.rebuildLoadout(false);
  }

  /** OS 능력 지속 시간 */
  private get specialDuration(): number {
    const os = this.os;
    if (this.specialId === 'orbital') return 0.6 + os.v('strikes', 2) * 2.5;
    return os.v('dur', OD.duration);
  }

  /**
   * 오버클럭 색감(비네트·색 변환)과 화면 덧칠은 전투 중에만.
   * 레벨업 카드·대화·일시정지 화면에서는 꺼서 카드 색이 원래대로 보이게 한다
   */
  private odFxOn = false;
  private syncOdFx(): void {
    const play = this.state === 'play';
    if (this.specialOn && (this.overdrive || this.berserk)) this.odOverlay.setVisible(play);
    const want = play && this.overdrive && !Settings.reducedFx;
    if (want === this.odFxOn) return;
    this.odFxOn = want;
    const fx = this.cameras.main.postFX;
    if (!fx) return;
    fx.clear();
    if (want) {
      fx.addVignette(0.5, 0.5, 0.95, 0.35);
      const cm = fx.addColorMatrix();
      cm.saturate(0.5);
      cm.hue(-25, true);
    }
  }

  /** OS 게이지 이름: 한국어 화면은 한글 이름, 영어는 대문자 라벨 + 레벨 */
  private specialLabel(): string {
    return `${I18n.lang === 'ko' ? this.os.def.name : this.os.def.label} Lv${this.os.level}`;
  }

  /** 조준점에서 가까운 적 n명 (r 안, 보스 포함 여부) */
  private nearAim(n: number, r: number, bosses = true): Enemy[] {
    const ax = this.aim.x;
    const ay = this.aim.y;
    const list = this.grid.query(ax, ay, r, this.chainBuf).filter((e) => e.active && (bosses || !e.isBoss) && (e.x - ax) ** 2 + (e.y - ay) ** 2 < r * r);
    list.sort((a, b) => (a.x - ax) ** 2 + (a.y - ay) ** 2 - ((b.x - ax) ** 2 + (b.y - ay) ** 2));
    return list.slice(0, n);
  }

  /** 보스 기절 (보스마다 cd초에 1번) */
  private stunBoss(t: number, cd: number): void {
    if (!this.boss || this.bossStunCd > 0 || this.cine || this.bossPhase === 'enter' || this.bossPhase === 'walkIn' || this.bossPhase === 'phaseShift') return;
    this.bossStunT = t;
    this.bossStunCd = cd;
    this.boss.sprite.setTint(0x66ffff);
  }

  private activateSpecial(): void {
    const def = this.os.def;
    const os = this.os;
    const p = this.player;
    const color = Phaser.Display.Color.HexStringToColor(def.color).color;
    this.specialOn = true;
    this.osExt = 0;
    this.odTime = this.specialDuration;
    this.osCdT = def.active?.minCooldown ?? 0;
    this.screenFlash(color, 0.3, 350);
    Sound.play('overclock');
    if (this.specialId === 'neural') {
      this.overdrive = true;
      this.odOverlay.setFillStyle(COLORS.magenta, 0.08).setVisible(true);
      // 슬로우 모션 + 충격파 + 색감 변화
      this.slowmo = OD.slowmoTime;
      Sound.play('slowmo');
      // 발동 내내 배경음악·효과음이 느리고 낮게 (산데비스탄 느낌)
      Sound.slowWorld(true);
      this.shockwaves.push({ r: 0, life: 0.6 }, { r: -40, life: 0.8 });
      this.odFxOn = false;
      this.syncOdFx();
      if (os.has('neural.flush')) this.rebuildLoadout(false);
    } else if (this.specialId === 'berserk') {
      this.berserk = true;
      this.recalcStats();
      this.odOverlay.setFillStyle(0xff2a3a, 0.08).setVisible(true);
      this.shake(200, 0.01);
    } else if (this.specialId === 'cloak') {
      this.decoy = { x: p.x, y: p.y };
      this.ambush = false;
      Sound.play('glitch');
    } else if (this.specialId === 'orbital') {
      this.orbitalT = 0;
      this.orbitalDone = 0;
      Sound.play('bosswarn');
    } else if (this.specialId === 'guardian') {
      // 보호막: 지속 시간 동안 피해를 먼저 흡수 (순간 재부팅 쉴드와 같은 칸)
      p.shield = Math.max(p.shield, os.v('shield', 40));
      p.shieldT = Math.max(p.shieldT, this.odTime);
      this.synRing(p.x, p.y, 40, 0x4fa8ff);
    } else if (this.specialId === 'tactical') {
      const n = os.has('tactical.multi') ? os.v('count', 5) : 1;
      for (const e of this.nearAim(n, 140)) {
        this.marks.set(e, os.v('dur', 8));
        this.burst(e.x, e.y, 0x00e5f2, 6);
      }
      if (os.has('tactical.drop')) {
        for (let i = 0; i < os.v('turrets', 2); i++) {
          const x = this.aim.x + (i - 0.5) * 30;
          const y = this.aim.y + 6;
          this.freeTurrets.push({ x, y, t: 10, fire: 0.3, img: this.add.image(x, y, 'turretw').setDepth(9).setTint(0x00e5f2) });
        }
      }
    } else if (this.specialId === 'hacker') {
      const r = os.v('radius', 120);
      for (const e of this.nearAim(60, r)) {
        this.addDot(e, 'hack', os.v('dur', 4));
        if (os.has('hacker.slow')) this.slow(e, os.v('dur', 4));
        if (os.has('hacker.stun') && (e.isBoss || e.maxHp >= 1000)) {
          if (e.isBoss) this.stunBoss(os.v('stun', 1), os.v('bossCd', 15));
          else this.stun(e, os.v('stun', 1));
        }
      }
      // 주변 적마다 OS 레벨에 따른 확률로 아군화 (보스 제외, 대원은 해커가 죽은 뒤에만: charm 안에서 막힘)
      const convP = os.v('convP');
      if (convP > 0) for (const e of this.nearAim(60, r, false)) if (Math.random() * 100 < convP) this.charm(e, os.v('convT', 5));
      this.synRing(this.aim.x, this.aim.y, r, 0x9d6bff);
      Sound.play('glitch');
    }
    const t = this.add
      .text(VIEW_W / 2, VIEW_H / 2 - 50, this.specialLabel(), { ...TEXT, fontSize: '22px', color: def.color })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(120)
      .setShadow(0, 0, def.color, 10, true, true);
    this.tweens.add({ targets: t, scale: 1.4, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  /** OS 발동 중 처치 (지속 연장·체력 회복·표식 처치) */
  private osKill(e: Enemy, tag?: DamageTag): void {
    const os = this.os;
    if (this.specialOn) {
      const ext = this.specialId === 'neural' && os.has('neural.extend') ? os.v('ext') : this.specialId === 'cloak' && os.has('cloak.chain') ? os.v('ext') : 0;
      if (ext > 0 && this.osExt < os.v('extMax', 3)) {
        const add = Math.min(ext, os.v('extMax', 3) - this.osExt);
        this.osExt += add;
        this.odTime += add;
      }
      if (this.berserk && os.has('berserk.heal') && (tag === 'melee' || (this.dmgSrc && (this.wTags.get(this.dmgSrc) ?? []).includes('근접')))) this.heal(os.v('heal', 2), true);
    }
    if (this.isMarked(e) && os.has('tactical.cdr')) this.weapons.find((w) => w.slot === 'secondary')?.reduceCooldown(os.v('cdr', 1));
    this.marks.delete(e);
  }

  /** 매 프레임: 표식, 화염 지대, 무료 포탑, 보스 기절 */
  private updateOsEffects(dt: number): void {
    const fx = this.fx;
    this.bossStunCd = Math.max(0, this.bossStunCd - dt);
    if (this.bossStunT > 0) {
      this.bossStunT -= dt;
      if (this.bossStunT <= 0 && this.boss) this.boss.sprite.clearTint();
    }
    for (const [e, t] of [...this.marks]) {
      if (!e.active || t - dt <= 0) {
        this.marks.delete(e);
        continue;
      }
      this.marks.set(e, t - dt);
      // 표식: 머리 위 노란 마름모
      const y = e.y - e.radius - 8;
      fx.lineStyle(1.5, 0x00e5f2, 0.9).strokeTriangle(e.x - 4, y, e.x + 4, y, e.x, y + 5);
    }
    if (this.fireZones.length) {
      const dps = this.os.v('burn', 30) * this.stats.damageMul;
      for (const z of this.fireZones) {
        z.t -= dt;
        fx.fillStyle(COLORS.orange, 0.18 + Math.sin(this.elapsed * 20 + z.x) * 0.05).fillCircle(z.x, z.y, 28);
        // 0.25초마다 묶어서 (최종 피해가 정수라 매 프레임 작은 피해는 부풀려짐)
        if (Math.floor((z.t + dt) * 4) === Math.floor(z.t * 4)) continue;
        for (const e of this.grid.query(z.x, z.y, 28, this.chainBuf).slice()) if (e.active && (e.x - z.x) ** 2 + (e.y - z.y) ** 2 < 28 * 28) this.synDamage(e, dps * 0.25, 'explosive');
      }
      this.fireZones = this.fireZones.filter((z) => z.t > 0);
    }
    for (const t of this.freeTurrets) {
      t.t -= dt;
      t.fire -= dt;
      if (t.t < 1) t.img.setAlpha(Math.floor(t.t * 10) % 2 ? 0.4 : 1);
      if (t.fire > 0) continue;
      const near = this.grid.query(t.x, t.y, 150, this.chainBuf).filter((e) => e.active);
      const e = near.find((q) => this.isMarked(q)) ?? near.sort((a, b) => (a.x - t.x) ** 2 + (a.y - t.y) ** 2 - ((b.x - t.x) ** 2 + (b.y - t.y) ** 2))[0];
      if (!e) continue;
      t.fire = 0.35;
      const a = Math.atan2(e.y - t.y, e.x - t.x);
      t.img.setRotation(a);
      this.fireBullet(t.x, t.y, a, 340, 14 * this.stats.damageMul, { life: 0.6, turnRate: 0 });
    }
    for (const t of this.freeTurrets) if (t.t <= 0) t.img.destroy();
    this.freeTurrets = this.freeTurrets.filter((t) => t.t > 0);
  }

  /** 궤도 폭격: 예고 표시(붉은 조준선) 뒤 화면 안 적에게 폭발 피해 (레벨에 따라 대상 수·횟수·피해) */
  private updateOrbital(dt: number): void {
    const os = this.os;
    const strikes = os.v('strikes', 2);
    const warn = SP.orbital.warn;
    this.orbitalT += dt;
    if (this.orbitalDone >= strikes) return;
    const at = 0.4 + this.orbitalDone * 2.5;
    const all = os.has('orbital.full');
    if (this.orbitalT >= at - warn) {
      const k = Phaser.Math.Clamp((at - this.orbitalT) / warn, 0, 1);
      const cam = this.cameras.main;
      this.fx.lineStyle(2, COLORS.yellow, 0.9 - k * 0.5).strokeCircle(cam.scrollX + VIEW_W / 2, cam.scrollY + VIEW_H / 2, 60 + k * 120);
      if (!this.orbitalTargets.length || this.orbitalPick !== this.orbitalDone) {
        this.orbitalPick = this.orbitalDone;
        const on = this.enemyPool.items.filter((e) => e.active && this.onScreen(e.x, e.y));
        this.orbitalTargets = all ? on : Phaser.Utils.Array.Shuffle(on).slice(0, os.v('targets', 6));
      }
      let n = 0;
      for (const e of this.orbitalTargets) {
        if (!e.active || n++ > 60) continue;
        this.fx.lineStyle(1, 0xff2a3a, 0.8).strokeCircle(e.x, e.y, 4 + k * 8);
      }
    }
    if (this.orbitalT >= at) {
      this.orbitalDone++;
      const dmg = os.v('dmg', 250) * this.stats.damageMul * this.stats.explosiveMul;
      let bursts = 0;
      for (const e of this.orbitalTargets.slice()) {
        if (!e.active) continue;
        if (bursts++ < 24) this.burst(e.x, e.y, COLORS.yellow, 6);
        if (os.has('orbital.burn') && this.fireZones.length < 40) this.fireZones.push({ x: e.x, y: e.y, t: os.v('burnT', 3) });
        if (e.isBoss && os.has('orbital.stun')) this.stunBoss(os.v('stun', 1), os.v('bossCd', 15));
        this.damage(e, dmg, 'explosive');
      }
      this.orbitalTargets = [];
      this.screenFlash(0xfff6c0, 0.45, 300);
      this.shake(260, 0.014);
      Sound.play('explode');
    }
  }
  private orbitalTargets: Enemy[] = [];
  private orbitalPick = -1;

  /** 레벨업 카드 + 리퍼닥 영구 강화 + 러너 특성 + 광전사 모드를 합쳐 능력치를 다시 계산 */
  private recalcStats(): void {
    const st = computeStats(this.passives, this.overflow);
    // 개편 2-2: 사이버웨어 효과
    const L = this.kit;
    st.damageMul *= 1 + L.v('cyber.dmg') / 100;
    st.cooldownMul = Math.max(0.25, st.cooldownMul / (1 + L.v('cyber.atkSpeed') / 100));
    st.pickupMul *= 1 + L.v('cyber.pickup') / 100;
    st.maxHpBonus += L.v('cyber.maxHp');
    st.moveMul *= 1 + L.v('cyber.move') / 100;
    // 칩셋 (능력치)
    st.damageMul *= 1 + L.v('chip.dmg') / 100;
    st.cooldownMul = Math.max(0.25, st.cooldownMul / (1 + L.v('chip.atkSpeed') / 100));
    st.maxHpBonus += L.v('chip.maxHp');
    st.moveMul *= 1 + L.v('chip.move') / 100;
    st.areaMul *= 1 + L.v('chip.area') / 100;
    st.pickupMul *= 1 + L.v('chip.pickup') / 100;
    const m = this.runner.mods as Partial<Record<'creditMul' | 'maxHpMul' | 'meleeMul' | 'explosiveMul' | 'areaMul', number>>;
    st.damageMul *= 1 + Save.clinicValue('dmg') / 100;
    st.moveMul *= (1 + Save.clinicValue('spd') / 100) * (this.berserk && this.os.has('berserk.move') ? 1 + this.os.v('move') / 100 : 1);
    st.pickupMul *= 1 + Save.clinicValue('pick') / 100;
    st.areaMul *= m.areaMul ?? 1;
    st.meleeMul = (m.meleeMul ?? 1) * (this.berserk ? this.os.v('melee', 1.4) : 1);
    st.explosiveMul = m.explosiveMul ?? 1;
    // 사이버웨어 신화: 거신 · 과부하 코어 · 거구
    if (this.pHas('titan')) {
      st.damageMul *= 1.5;
      st.moveMul *= 0.9;
    }
    if (this.pHas('overloadCore')) st.cooldownMul = Math.max(0.25, st.cooldownMul / 1.5);
    this.baseCooldownMul = st.cooldownMul;
    this.stats = st;
    const hpMul = this.pHas('overloadCore') ? 0.8 : 1;
    this.player.maxHp = Math.round((PLAYER.maxHp + Save.clinicValue('hp') + st.maxHpBonus + (this.pHas('bulk') ? 100 : 0)) * (m.maxHpMul ?? 1) * hpMul);
    this.player.dashCooldownMax = (this.pHas('bladeDash') ? 1 : this.pHas('reboot') ? PLAYER.dashCooldown - 1 : PLAYER.dashCooldown) * Math.max(0.3, 1 - L.v('cyber.dashCd') / 100 - (this.os.has('stock.dashCd') ? this.os.v('dashCd') / 100 : 0));
    this.player.hp = Math.min(this.player.hp, this.player.maxHp);
  }

  /** 지금까지 번 크레딧 (러너 특성 배율 포함) */
  private creditsNow(victory: boolean): number {
    const c = meta.credits;
    const zb = this.run.bossKills + this.run.hexKills + this.run.coreKills;
    const base = this.kills * c.perKill + this.elapsed * c.perSecond + this.run.midbossKills * c.midbossBonus + zb * c.zoneBossBonus + (victory ? c.victoryBonus : 0);
    return Math.floor(base * ((this.runner.mods as { creditMul?: number }).creditMul ?? 1) * (1 + this.heat * meta.heat.creditPer) * (this.creditMagnet ? 1.2 : 1));
  }

  /** 사이버웨어 특수 능력을 가지고 있는지 */
  private pHas(abilityId: string): boolean {
    for (const st of this.passives.values()) if (st.abilities?.includes(abilityId)) return true;
    return false;
  }

  /** 광학 위장 또는 고스트 대시 직후: 적이 플레이어를 놓친 상태 */
  private get untracked(): boolean {
    return (this.specialOn && this.specialId === 'cloak') || this.player.cloakT > 0;
  }

  /** 엘리트(블랙 실드)·보스도 플레이어를 놓쳤는지: 광학 위장 4줄 '완전 위장' 또는 대시 위장 */
  private get untrackedElite(): boolean {
    return (this.specialOn && this.specialId === 'cloak' && this.os.has('cloak.full')) || this.player.cloakT > 0;
  }

  private get zone(): Zone {
    return ZONES[this.zoneIdx];
  }

  /**
   * 일반 적 체력 배율 (챕터 시간 zt초). 1챕터는 hpCurve 그대로.
   * 2·3챕터는 레벨이 이어지므로 직전 챕터 끝 값의 zoneCurve.carry배에서 시작해 챕터 길이(len초) 동안 (1+growth)배까지 같은 기울기로 오른다 (넘으면 그대로 이어짐)
   */
  enemyHpMul(zt: number): number {
    if (this.zoneIdx === 0) return hpScaleAt(zt);
    const Z = gameData.zoneCurve;
    let end = hpScaleAt(Z.len);
    let start = end;
    for (let k = 1; k <= this.zoneIdx; k++) {
      start = end * Z.carry;
      end = start * (1 + Z.growth);
    }
    return start * (1 + (Z.growth * Math.max(0, zt)) / Z.len);
  }

  /** 스포너용: hpCurve에 곱할 배율 (2·3챕터 곡선 ÷ 1챕터 곡선) */
  private zoneHpMul(zt: number): number {
    return this.enemyHpMul(zt) / hpScaleAt(zt);
  }

  /** 지금 챕터의 전투 음악 (1 하층가 · 2 공장 · 3 기업 타워) */
  private get zoneMusic(): MusicKey {
    return (this.zone.music ?? 'battle') as MusicKey;
  }

  /** 지금 구역의 바닥·비·규칙을 적용하고 구역 이름을 띄운다 */
  private applyZone(fanfare: boolean): void {
    const z = this.zone;
    this.bg.setTexture(z.ground);
    this.skyline.setVisible(!!z.skyline);
    if (z.skyline) this.skyline.setTexture(z.skyline);
    this.rainFx.setVisible(z.rain);
    this.floorG.clear();
    this.laser = { phase: 'idle', t: 5, lines: [], hit: false };
    const t = this.add
      .text(VIEW_W / 2, VIEW_H / 2 - 60, `${z.label}\n${z.name}`, { ...TEXT, fontSize: '22px', color: '#00f0ff', align: 'center' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(120)
      .setShadow(0, 0, '#00f0ff', 10, true, true);
    const hint = this.add.text(VIEW_W / 2, VIEW_H / 2 - 18, z.ruleHint, { ...TEXT, fontSize: '12px', color: '#fff23a' }).setOrigin(0.5).setScrollFactor(0).setDepth(120);
    this.tweens.add({ targets: [t, hint], alpha: 0, delay: fanfare ? 2000 : 1200, duration: 600, onComplete: () => (t.destroy(), hint.destroy()) });
  }

  /** 구역 보스 처치 직후: 화면의 일반 적을 터뜨리고 탄을 지우며 경험치를 모두 끌어온다 */
  private clearField(): void {
    let n = 0;
    for (const e of this.enemyPool.items) {
      if (!e.active || e.isBoss) continue;
      if (n++ < 30) this.burst(e.x, e.y, COLORS.cyan, 4);
      e.kill();
    }
    for (const b of this.enemyBullets.items) if (b.active) b.kill();
    for (const k of this.pickups.items) if (k.active) k.magnet = true;
    if (this.raid) {
      this.raid.ship.destroy();
      this.raid.wash?.destroy();
      this.raid.washH?.destroy();
      this.raid.floorGlow?.destroy();
      this.raid.dust?.destroy();
      this.raid.shadow.destroy();
      this.raid = null;
    }
  }

  private startZoneDialog(): void {
    const next = ZONES[this.zoneIdx + 1] as Zone & { intro?: Line[] };
    const lines = [...(next.intro ?? [])];
    // 2챕터 첫 도달: 픽서가 시공간 가속 모듈 제어 코드를 넘겨 준다
    const gift = this.zoneIdx === 0 && !Save.data.speedUnlocked;
    if (gift) lines.push({ who: 'client', text: tr('speed.gift1') }, { who: 'client', text: tr('speed.gift2') }, { who: 'runner', text: tr('speed.gift3') });
    this.startDialog(lines, () => {
      this.enterNextZone();
      if (gift) this.unlockSpeed();
    });
  }

  private enterNextZone(): void {
    this.cameras.main.flash(400, 0, 240, 255);
    this.zoneIdx++;
    this.zoneStart = this.elapsed;
    this.clearStations();
    this.stationsFired = 0;
    this.bossesSpawned = 0;
    this.raidsInZone = 0;
    this.nextRaid = this.elapsed + this.zone.raidStart + Math.random() * gameData.raid.firstDelayMax;
    this.raidWaitClear = false;
    this.applyZone(true);
    Sound.music(this.zoneMusic, 1200);
    // 개편 2단계: 빌드를 한 판 내내 이어감 (예전 챕터 전환 초기화·능력 고르기 없음)
  }

  // ───────────────────────────── 카운터 몬스터 ─────────────────────────────
  /** 2챕터 중반부터, 플레이어가 전설·신화 능력을 가진 무기에 맞서는 카운터를 투입. 어느 챕터든 시작 3분(minZoneTime) 전에는 없다 */
  private updateCounters(dt: number, zt: number): void {
    if (this.zoneIdx < CT.startZone || (this.zoneIdx === CT.startZone && zt < CT.startTime) || zt < CT.minZoneTime) return;
    if ((this.counterT -= dt) > 0) return;
    this.counterT = CT.every;
    const by = CT.byWeapon as Record<string, string>;
    const types = Array.from(new Set(this.weapons.filter((w) => w.abilities.size > 0).map((w) => by[w.id]).filter(Boolean)));
    if (!types.length) return;
    let alive = 0;
    for (const e of this.enemyPool.items) if (e.active && e.id.startsWith('c_')) alive++;
    if (alive >= CT.maxAlive) return;
    const p = this.player;
    const hp = this.enemyHpMul(zt);
    for (let i = 0; i < CT.count; i++) {
      const id = Phaser.Utils.Array.GetRandom(types) as EnemyId;
      this.spawner.spawnAround(id, p.x, p.y, hp, true);
      if (!this.counterSeen.has(id)) {
        this.counterSeen.add(id);
        const info = (CT.info as Record<string, { label: string; color: string }>)[id];
        const t = this.add
          .text(VIEW_W / 2, 84, tr('counter.appear', { name: enemiesData[id].name, label: info.label }), { ...TEXT, fontSize: '12px', color: info.color, align: 'center' })
          .setOrigin(0.5, 0)
          .setScrollFactor(0)
          .setDepth(120);
        this.tweens.add({ targets: t, alpha: 0, delay: 2400, duration: 500, onComplete: () => t.destroy() });
        Sound.play('bosswarn');
      }
    }
  }

  // ───────────────────────────── 챕터 이월 ─────────────────────────────
  private keepInfo(k: Keep): { title: string; ability: { name: string; desc: string }; rarity: (typeof gameData.rarity)[number] } {
    const rarity = gameData.rarity.find((r) => r.id === k.rarity)!;
    if (k.kind === 'weapon') {
      const list = abilitiesData.weapons[k.id as WeaponId];
      const ability = [...list.legendary, ...list.mythic].find((a) => a.id === k.abilityId)!;
      return { title: weaponsData[k.id as WeaponId].name, ability, rarity };
    }
    return { title: passivesData[k.id as PassiveId].name, ability: passiveAbility(k.id as PassiveId, k.abilityId)!, rarity };
  }

  /** 다음 챕터 시작: 얻었던 전설·신화 카드 중 1장(3챕터는 2장)을 골라 가져가고 나머지 빌드는 초기화 */
  private carryPicks = 1;
  private carrySel: number[] = [];
  private carryMarks: Phaser.GameObjects.Rectangle[] = [];

  private startCarryOver(): void {
    // 같은 카드(같은 무기·패시브의 같은 능력)는 한 장으로 합친다. 등급은 높은 쪽을 남긴다
    const rank = (r: string) => gameData.rarity.findIndex((o) => o.id === r);
    const uniq = new Map<string, Keep>();
    for (const k of this.keepables) {
      const key = `${k.kind}:${k.id}:${k.abilityId}`;
      const cur = uniq.get(key);
      if (!cur || rank(k.rarity) > rank(cur.rarity)) uniq.set(key, k);
    }
    this.keepables = [...uniq.values()];
    const list = this.keepables;
    this.carryPicks = this.zoneIdx >= 2 ? 2 : 1;
    if (list.length <= this.carryPicks) {
      this.resetBuild([...list]);
      return;
    }
    this.carrySel = [];
    this.carryMarks = [];
    this.state = 'carry';
    Sound.duck(0.5);
    const add = <T extends Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T): T => {
      o.setScrollFactor(0).setDepth(300);
      this.carryUi.push(o);
      return o;
    };
    add(this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x000000, 0.72).setOrigin(0));
    add(this.add.text(VIEW_W / 2, 30, gameData.carryOver.title, { ...TEXT, fontSize: '20px', color: '#fff23a' }).setOrigin(0.5).setShadow(0, 0, '#fff23a', 8, true, true));
    add(this.add.text(VIEW_W / 2, 52, tr('carry.sub', { n: this.carryPicks }), { ...TEXT, fontSize: '11px', color: '#c8b8e8' }).setOrigin(0.5));
    const desc = add(this.add.text(VIEW_W / 2, 318, '', { ...TEXT, fontSize: '12px', color: '#e8f7ff', align: 'center', wordWrap: { width: 560 } }).setOrigin(0.5, 0));
    const cols = Math.min(4, list.length);
    const cw = 144;
    const ch = 50;
    const gap = 8;
    const x0 = VIEW_W / 2 - (cols * cw + (cols - 1) * gap) / 2;
    let carryArmed = -1;
    list.forEach((k, i) => {
      const info = this.keepInfo(k);
      const x = x0 + (i % cols) * (cw + gap);
      const y = 72 + Math.floor(i / cols) * (ch + gap);
      const col = Phaser.Display.Color.HexStringToColor(info.rarity.color).color;
      const card = add(this.add.rectangle(x, y, cw, ch, 0x120a24, 0.95).setOrigin(0).setStrokeStyle(2, col));
      this.carryMarks.push(card);
      add(this.add.text(x + 6, y + 5, `${i < 9 ? `[${i + 1}] ` : ''}${info.rarity.label} · ${info.title}`, { ...TEXT, fontSize: '11px', color: info.rarity.color }));
      add(this.add.text(x + 6, y + 25, `★ ${info.ability.name}`, { ...TEXT, fontSize: '12px', color: '#ffffff' }));
      card.setInteractive({ useHandCursor: true });
      card.on('pointerover', () => {
        card.setFillStyle(0x23123f, 0.95);
        desc.setText(`${info.title} · ${info.ability.name}: ${info.ability.desc}`);
        Sound.play('hover');
      });
      card.on('pointerout', () => card.setFillStyle(this.carrySel.includes(i) ? 0x3a1f66 : 0x120a24, 0.95));
      card.on('pointerdown', () => (carryArmed = i));
      card.on('pointerup', () => {
        if (carryArmed === i) this.chooseCarry(i);
        carryArmed = -1;
      });
    });
    desc.setText(isTouch() ? tr('carry.hint.touch') : tr('carry.hint.desktop'));
    this.carryKeys = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= list.length) this.chooseCarry(n - 1);
    };
    this.input.keyboard?.on('keydown', this.carryKeys);
  }

  private chooseCarry(i: number): void {
    if (this.state !== 'carry') return;
    const at = this.carrySel.indexOf(i);
    if (at >= 0) {
      this.carrySel.splice(at, 1);
      this.carryMarks[i]?.setFillStyle(0x120a24, 0.95);
      Sound.play('hover');
      return;
    }
    this.carrySel.push(i);
    this.carryMarks[i]?.setFillStyle(0x3a1f66, 0.95);
    if (this.carrySel.length < this.carryPicks) {
      Sound.play('hover');
      return;
    }
    const keep = this.carrySel.map((n) => this.keepables[n]);
    this.carryMarks = [];
    for (const o of this.carryUi) o.destroy();
    this.carryUi = [];
    if (this.carryKeys) this.input.keyboard?.off('keydown', this.carryKeys);
    this.carryKeys = undefined;
    Sound.play('select');
    Sound.duck(1);
    this.resetBuild(keep);
    this.state = 'play';
  }

  /** 빌드 초기화: 러너 시작 무기 Lv.1 + 고른 카드만 남긴다 */
  private resetBuild(keeps: Keep[]): void {
    for (const w of this.weapons) w.destroy();
    this.weapons = [];
    this.passives = new Map();
    this.overflow = {};
    this.level = 1;
    this.xp = 0;
    this.pendingLevels = 0;
    this.bossRewards = 0;
    this.rerolls = gameData.rerollsPerRun;
    this.forcedRarity = undefined;
    this.undyingUsed = false;
    this.streak = this.rushT = 0;
    this.addStartWeapons();
    for (const keep of keeps) {
      const rarity = gameData.rarity.find((r) => r.id === keep.rarity)!;
      if (keep.kind === 'weapon') {
        const w = this.weapons.find((o) => o.id === keep.id) ?? this.addWeapon(keep.id as WeaponId);
        w.bonus = Math.max(w.bonus, rarity.weaponBonus);
        w.addAbility(keep.abilityId);
      } else {
        const id = keep.id as PassiveId;
        const amt = passiveAmount(id, rarity);
        const cur = this.passives.get(id);
        if (cur) {
          cur.total += amt;
          cur.abilities = [...(cur.abilities ?? []), keep.abilityId];
          if (passivesData[id].stat === 'cooldownMul') cur.speedMul = 1 + cur.total / 100;
        } else this.passives.set(id, { level: 1, total: amt, special: true, abilities: [keep.abilityId], speedMul: passivesData[id].stat === 'cooldownMul' ? 1 + amt / 100 : undefined });
      }
    }
    this.keepables = [...keeps];
    this.rebuildLoadout(false);
    this.player.hp = this.player.maxHp;
    const name = keeps.map((k) => this.keepInfo(k).ability.name).join(', ');
    const t = this.add
      .text(VIEW_W / 2, VIEW_H / 2 + 10, keeps.length ? tr('carry.keep', { name }) : tr('carry.reset'), { ...TEXT, fontSize: '13px', color: '#fff23a' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(120);
    this.tweens.add({ targets: t, alpha: 0, delay: 1600, duration: 500, onComplete: () => t.destroy() });
  }

  // ───────────────────────────── 의뢰인 대화 ─────────────────────────────
  private startDialog(lines: Line[], done: () => void): void {
    if (!lines.length) return done();
    this.state = 'dialog';
    this.levelUi.hide();
    Sound.duck(0.4);
    const box = this.add.container(0, 0).setScrollFactor(0).setDepth(210);
    box.add(this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x07060f, 0.45).setOrigin(0));
    box.add(this.add.rectangle(24, VIEW_H - 112, VIEW_W - 48, 96, 0x0d0820, 0.95).setOrigin(0).setStrokeStyle(2, COLORS.magenta));
    const text = this.add.text(118, VIEW_H - 84, '', { ...TEXT, fontSize: '13px', wordWrap: { width: VIEW_W - 170, useAdvancedWrap: true }, lineSpacing: 4 });
    box.add(text);
    // 건너뛰기 버튼: 대화를 바로 끝낸다 (스페이스도 같음)
    const skip = this.add
      .text(VIEW_W - 30, VIEW_H - 136, isTouch() ? tr('dialog.skip.touch') : tr('dialog.skip'), { ...TEXT, fontSize: '11px', color: '#e8f7ff', backgroundColor: '#1a1030', padding: { x: 8, y: 3 } })
      .setOrigin(1, 0)
      // 컨테이너가 화면 고정이어도 클릭 판정은 자기 scrollFactor를 따르므로 버튼도 화면 고정으로
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    skip.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      this.skipDialog();
    });
    box.add(skip);
    this.dialog = { lines, i: -1, box, text, full: '', shown: 0, ev: null, done };
    this.advanceDialog();
  }

  /** 대화 건너뛰기: 남은 줄을 모두 넘기고 바로 끝낸다 */
  private skipDialog(): void {
    const d = this.dialog;
    if (!d || this.skipQueued) return;
    // 입력 처리 도중에 버튼(대화창)을 지우지 않도록 다음 프레임에 끝낸다 (모바일 연타 대비)
    this.skipQueued = true;
    this.time.delayedCall(0, () => {
      this.skipQueued = false;
      if (this.dialog !== d) return;
      d.i = d.lines.length - 1;
      d.shown = d.full.length;
      this.advanceDialog();
    });
  }
  private skipQueued = false;

  /** 글자가 다 나오지 않았으면 끝까지 보여주고, 다 나왔으면 다음 줄로 */
  private advanceDialog(): void {
    const d = this.dialog;
    if (!d) return;
    if (d.i >= 0 && d.shown < d.full.length) {
      d.shown = d.full.length;
      d.text.setText(d.full);
      return;
    }
    d.i++;
    // 줄마다 바뀌는 초상·이름은 지우고 다시 그린다 (배경 2개·본문·건너뛰기 버튼은 남김)
    d.box.list.slice(4).forEach((o) => o.destroy());
    if (d.i >= d.lines.length) {
      d.ev?.remove();
      d.box.destroy();
      this.dialog = null;
      this.state = 'play';
      // 대화 중에 눌린 스페이스(건너뛰기)·대시 버튼이 대화가 끝나자마자 대시로 나가지 않게 비운다
      this.controls.consumeDash();
      Sound.duck(1);
      d.done();
      return;
    }
    const line = d.lines[d.i];
    const isRunner = line.who === 'runner';
    const name = isRunner ? this.runner.name : zonesData.client.name;
    const tex = isRunner ? this.runner.texture : zonesData.client.texture;
    d.box.add(this.add.rectangle(36, VIEW_H - 102, 72, 72, 0x140c2a).setOrigin(0).setStrokeStyle(1, isRunner ? COLORS.cyan : COLORS.magenta));
    d.box.add(this.add.image(72, VIEW_H - 66, tex).setScale(2));
    d.box.add(this.add.text(118, VIEW_H - 104, name, { ...TEXT, fontSize: '13px', color: isRunner ? '#00f0ff' : '#ff2bd6' }));
    d.box.add(this.add.text(VIEW_W - 36, VIEW_H - 30, `${d.i + 1}/${d.lines.length}  ▶ ${isTouch() ? tr('dialog.next.touch') : 'ENTER'}`, { ...TEXT, fontSize: '10px', color: '#8a7aa8' }).setOrigin(1, 0));
    d.full = line.text.replace('{runner}', this.runner.name);
    d.shown = 0;
    d.text.setText('');
    Sound.play('select');
    d.ev?.remove();
    d.ev = this.time.addEvent({
      delay: 28,
      repeat: d.full.length,
      callback: () => {
        if (!this.dialog || d.shown >= d.full.length) return;
        d.shown++;
        d.text.setText(d.full.slice(0, d.shown));
      },
    });
  }

  // ───────────────────────────── 구역 규칙 ─────────────────────────────
  /** 인더스트리얼 구역: y 위치에 있는 컨베이어의 가로 속도 (띠 밖이면 0) */
  private conveyorAt(y: number): number {
    const c = ZR.conveyor;
    const m = ((y % c.period) + c.period) % c.period;
    if (m >= c.band) return 0;
    const row = Math.floor(y / c.period);
    return (((row % 2) + 2) % 2 === 0 ? 1 : -1) * c.speed;
  }

  private updateZoneRule(dt: number): void {
    const rule = this.zone.rule;
    if (rule === 'conveyor') this.drawConveyors();
    else if (rule === 'laser') this.updateLasers(dt);
  }

  private drawConveyors(): void {
    const c = ZR.conveyor;
    const g = this.floorG;
    const cam = this.cameras.main;
    g.clear();
    const y0 = Math.floor(cam.scrollY / c.period) * c.period;
    for (let y = y0; y < cam.scrollY + VIEW_H; y += c.period) {
      const dir = this.conveyorAt(y + 1) > 0 ? 1 : -1;
      // 레일과 벨트는 바닥 그림(ground_industrial)에 있다. 여기서는 움직이는 벨트 칸살과 화살표만 그린다
      const slat = 12;
      const so = (((this.elapsed * c.speed * dir) % slat) + slat) % slat;
      g.fillStyle(0x2c2246, 0.85);
      for (let x = Math.floor(cam.scrollX / slat) * slat - slat + so; x < cam.scrollX + VIEW_W + slat; x += slat) g.fillRect(x, y + 7, 2, c.band - 14);
      // 흐르는 방향을 보여주는 화살표 무늬
      const step = 28;
      const off = (((this.elapsed * c.speed * dir) % step) + step) % step;
      const xs = Math.floor(cam.scrollX / step) * step - step;
      g.lineStyle(2, COLORS.orange, 0.45);
      for (let x = xs + off; x < cam.scrollX + VIEW_W + step; x += step) {
        const cy = y + c.band / 2;
        g.lineBetween(x - 5 * dir, cy - 8, x + 5 * dir, cy);
        g.lineBetween(x + 5 * dir, cy, x - 5 * dir, cy + 8);
      }
    }
  }

  /** 기업 타워: 주기적으로 화면을 가로지르는 보안 레이저 (예고 → 발사) */
  private updateLasers(dt: number): void {
    const L = ZR.laser;
    const z = this.laser;
    const p = this.player;
    const cam = this.cameras.main;
    z.t -= dt;
    if (z.phase === 'idle' && z.t <= 0 && !this.dialog) {
      // 가로 또는 세로 줄 몇 개를 화면 안에 고르게 배치 (한 줄은 플레이어 근처)
      const horiz = Math.random() < 0.5;
      const span = horiz ? VIEW_H : VIEW_W;
      const base = horiz ? cam.scrollY : cam.scrollX;
      const pp = horiz ? p.y : p.x;
      z.lines = [];
      for (let i = 0; i < L.count; i++) {
        const v = i === 0 ? pp + Phaser.Math.Between(-24, 24) : base + ((i + Math.random() * 0.6) / (L.count + 0.5)) * span;
        z.lines.push(horiz ? [cam.scrollX - 60, v, cam.scrollX + VIEW_W + 60, v] : [v, cam.scrollY - 60, v, cam.scrollY + VIEW_H + 60]);
      }
      z.phase = 'warn';
      z.t = L.warn;
      z.hit = false;
      Sound.play('lungewarn');
    } else if (z.phase === 'warn') {
      const blink = Math.floor(z.t * 12) % 2 ? 0.8 : 0.3;
      for (const [x1, y1, x2, y2] of z.lines) this.fx.lineStyle(1, 0xff2a3a, blink).lineBetween(x1, y1, x2, y2);
      if (z.t <= 0) {
        z.phase = 'fire';
        z.t = L.fire;
        Sound.play('bosscharge');
      }
    } else if (z.phase === 'fire') {
      for (const [x1, y1, x2, y2] of z.lines) {
        this.fx.lineStyle(L.width + 4, 0xff2a3a, 0.35).lineBetween(x1, y1, x2, y2);
        this.fx.lineStyle(2, 0xffffff, 0.95).lineBetween(x1, y1, x2, y2);
        const dist = y1 === y2 ? Math.abs(p.y - y1) : Math.abs(p.x - x1);
        if (!z.hit && p.invuln <= 0 && dist < L.width + p.radius) {
          z.hit = true;
          this.hurtPlayer(L.damage, { kind: 'laser', id: '' });
        }
      }
      if (z.t <= 0) {
        z.phase = 'idle';
        z.t = L.every * Phaser.Math.FloatBetween(0.8, 1.2);
      }
    }
  }

  /** 적 그림 위치. 드론은 바닥(판정 위치) 위에 떠서 위아래로 흔들리고, 그림자는 바닥에 남는다 */
  private placeEnemy(e: Enemy): void {
    if (!e.flying) {
      // 진압대 공격 그림은 발 기준(origin 0.5,1)이라 기본 그림의 발 위치에 맞춘다
      e.sprite.setPosition(e.x, e.sprite.originY === 1 ? e.y + e.footOff : e.y);
      return;
    }
    const A = gameData.droneAi;
    const bob = Math.sin(this.elapsed * 5 + e.phase) * A.bob;
    const dive = e.state === 'lunge' ? 3 : 0; // 내리꽂을 때는 바닥 가까이
    e.sprite.setPosition(e.x, e.y - A.hover + bob + dive).setRotation(e.tilt);
    const k = 1 - (bob + dive) / (A.hover * 2.5); // 높이 뜰수록 그림자가 작고 옅다
    e.shadow.setPosition(e.x, e.y + A.shadowY).setScale(1 + (1 - k) * 0.6 - 0.15).setAlpha(0.55 * k);
  }

  /**
   * 보안 드론: 멀면 좌우로 흔들며 다가오고, 가까우면 플레이어 둘레를 선회하다가
   * 가끔 멈춰 렌즈를 밝힌 뒤(예고) 플레이어 쪽으로 내리꽂는다.
   */
  private droneAi(e: Enemy, dt: number, dx: number, dy: number, d: number, slow: number, hidden: boolean, set: (vx: number, vy: number) => void): void {
    const A = gameData.droneAi;
    const ux = dx / d;
    const uy = dy / d;
    e.t -= dt;
    if (e.state === 'walk') {
      let vx: number;
      let vy: number;
      if (d > A.orbit * 1.4) {
        const w = Math.sin(this.elapsed * A.weaveFreq + e.phase) * A.weave * e.side;
        vx = ux - uy * w;
        vy = uy + ux * w;
        const n = Math.hypot(vx, vy);
        vx = (vx / n) * e.speed;
        vy = (vy / n) * e.speed;
      } else {
        const rad = Phaser.Math.Clamp((d - A.orbit) / A.orbit, -1, 1) * 1.6; // 반지름 유지
        vx = (-uy * e.side + ux * rad) * e.speed * A.orbitSpeed;
        vy = (ux * e.side + uy * rad) * e.speed * A.orbitSpeed;
      }
      set(vx * slow, vy * slow);
      if (e.t <= 0 && !hidden && d < A.diveRange && this.onScreen(e.x, e.y)) {
        e.state = 'wind';
        e.t = A.windup;
      }
    } else if (e.state === 'wind') {
      // 살짝 물러나며 조준 (조준선은 끝까지 플레이어를 따라간다)
      e.dirX = ux;
      e.dirY = uy;
      set(-ux * 12 * slow, -uy * 12 * slow);
      const k = 1 - Math.max(0, e.t / A.windup);
      const L = A.diveSpeed * A.diveTime * 0.5; // 짧고 옅게 (드론이 여럿이어도 화면이 어지럽지 않게)
      this.fx.lineStyle(1, 0xff2a3a, 0.1 + k * 0.3).lineBetween(e.x, e.y - A.hover, e.x + ux * L, e.y - A.hover + uy * L);
      if (e.t <= 0) {
        e.state = 'lunge';
        e.t = A.diveTime;
      }
    } else {
      set(e.dirX * A.diveSpeed * slow, e.dirY * A.diveSpeed * slow);
      if (e.t <= 0) {
        e.state = 'walk';
        e.t = Phaser.Math.FloatBetween(A.diveEvery[0], A.diveEvery[1]);
        e.side = -e.side; // 다음엔 반대 방향으로 선회
      }
    }
  }

  /**
   * 일반 적·진압대 프레임: <id>_w2 그림이 있으면 걷기 두 장을 번갈아 쓰고,
   * 공격 중(예고·돌진, 사격·순간이동 직후, 접촉형은 26px 안)에는 <id>_aim 그림을 쓴다.
   * 저격 터렛은 조준선 동안이 아니라 발사하는 순간에만 공격 그림.
   */
  private animateEnemy(e: Enemy, dt: number, d: number, vx = 0): void {
    const base = e.tex;
    const hasAtk = this.textures.exists(`${base}_atk_00`);
    if (hasAtk && this.animateTrooper(e, d)) return;
    // 걷기 루프 그림(<id>_walk_NN)이 있으면 12fps로 재생. 공격 그림과 같은 발 기준(origin 0.5,1)
    let n = this.walkFrames.get(base);
    if (n === undefined) {
      n = 0;
      while (this.textures.exists(`${base}_walk_${String(n).padStart(2, '0')}`)) n++;
      this.walkFrames.set(base, n);
    }
    if (n > 0) {
      // 바라보는 쪽(플레이어 쪽)과 반대로 움직이면(뒷걸음·회피·도주) 걷기를 거꾸로 재생
      const back = Math.abs(vx) > 5 && vx < 0 !== e.sprite.flipX;
      e.walkPh = (((e.walkPh + dt * WALK_FPS * (back ? -1 : 1)) % n) + n) % n;
      const wk = `${base}_walk_${String(Math.floor(e.walkPh)).padStart(2, '0')}`;
      if (e.sprite.originY !== 1) {
        e.footOff = this.textures.get(e.tex).getSourceImage().height / 2;
        e.sprite.setOrigin(0.5, 1);
      }
      if (e.sprite.texture.key !== wk) e.sprite.setTexture(wk);
      return;
    }
    if (e.sprite.originY === 1) e.sprite.setOrigin(0.5);
    if (!this.textures.exists(`${base}_w2`)) return;
    e.atkT = Math.max(0, e.atkT - dt);
    // 공격 동작 그림이 있는 요원은 한 장짜리 _aim 대신 걷기 프레임으로 (공격은 animateTrooper가 맡음)
    const attacking =
      !hasAtk &&
      (e.atkT > 0 ||
      (e.state !== 'walk' && e.id !== 'sniper_turret') ||
      (CONTACT_POSE.has(e.id) && d < 26));
    const key = attacking ? `${base}_aim` : Math.floor(this.elapsed * 4 + e.x * 0.01) % 2 ? base : `${base}_w2`;
    const tex = this.textures.exists(key) ? key : base;
    if (e.sprite.texture.key !== tex) e.sprite.setTexture(tex);
  }

  /**
   * 블랙 실드 요원 공격 동작 (8프레임). 예고·조준·시전 동안은 준비 프레임을 그 시간에 맞춰 늘리고,
   * 실제 공격 순간부터 타격·후속 프레임과 공격 이펙트를 재생한다. 탱커는 가까우면 방패 치기를 한 번씩.
   * 공격 그림을 쓰는 동안이면 true (아니면 기본 걷기 프레임으로)
   */
  private animateTrooper(e: Enemy, d: number): boolean {
    const role = e.id.replace('trooper_', '') as keyof typeof TROOPER_ATK;
    const A = TROOPER_ATK[role];
    if (!A) return false;
    const prev = e.prevState;
    e.prevState = e.state;
    const scaled = (from: number, to: number, total: number) => {
      const ms = A.ms.slice(from, to + 1);
      const sum = ms.reduce((a, b) => a + b, 0);
      return ms.map((m) => (m / sum) * total);
    };
    const start = (from: number, to: number, durs: number[]) => {
      e.seq = { start: this.elapsed, frames: Array.from({ length: to - from + 1 }, (_, i) => from + i), durs, fxAt: A.fxStart - from, fxDone: false };
    };
    // 실제 공격이 일어나는 순간 → 타격 이후 시퀀스
    if (role === 'melee' && prev === 'wind' && e.state === 'lunge') {
      // 돌진(이동만): 낮은 돌진 자세 04~07, 휘두르기 이펙트 없음
      const M = (gameData.melee as Record<string, MeleeDef>)[e.id];
      start(4, 7, scaled(4, 7, M.lungeTime));
      e.seq!.fxDone = true;
    } else if (role === 'melee' && prev !== 'swing' && e.state === 'swing') {
      // 휘두르기: 준비 00~02를 예비동작 시간에 맞추고, 03(타격)에서 이펙트와 판정
      const SW = (gameData.melee as Record<string, MeleeDef>)[e.id].swing!;
      start(0, 3, [...scaled(0, 2, SW.windup), SW.recover]);
    } else if ((role === 'hacker' || role === 'sniper') && prev === 'wind' && e.state === 'walk') {
      start(A.fxStart, 7, A.ms.slice(A.fxStart).map((m) => m / 1000));
    } else if (role === 'tank' && !e.seq && e.act === 'bash' && d < 34 && this.elapsed >= e.atkCd) {
      start(0, 7, A.ms.map((m) => m / 1000));
      e.atkCd = this.elapsed + A.ms.reduce((a, b) => a + b, 0) / 1000 + 1;
    }
    let idx = -1;
    if (e.seq) {
      let t = this.elapsed - e.seq.start;
      let i = 0;
      while (i < e.seq.durs.length && t >= e.seq.durs[i]) t -= e.seq.durs[i++];
      if (i >= e.seq.frames.length) e.seq = null;
      else {
        idx = e.seq.frames[i];
        if (!e.seq.fxDone && i >= e.seq.fxAt) {
          e.seq.fxDone = true;
          this.trooperFx(e, A);
        }
      }
    } else if (e.state === 'wind' && role === 'melee') {
      // 돌진 예고: 낮게 웅크린 돌진 자세로 대기
      idx = 4;
    } else if (e.state === 'wind') {
      // 예고·조준·시전: 준비 프레임(근접 00~02, 해커 00~03, 저격 00~02)을 남은 시간에 맞춰
      const total = role === 'melee' ? (gameData.melee as Record<string, MeleeDef>)[e.id].windup : role === 'hacker' ? gameData.squadAi.hacker.cast : gameData.squadAi.sniper.aim;
      const last = A.fxStart - 1;
      const k = Phaser.Math.Clamp(1 - e.t / total, 0, 0.999);
      idx = Math.floor(k * (last + 1));
    }
    if (idx < 0) return false;
    const key = `${e.tex}_atk_${String(idx).padStart(2, '0')}`;
    if (!this.textures.exists(key)) return false;
    if (e.sprite.originY !== 1) {
      e.footOff = this.textures.get(e.tex).getSourceImage().height / 2;
      e.sprite.setOrigin(0.5, 1);
    }
    if (e.sprite.texture.key !== key) e.sprite.setTexture(key);
    return true;
  }

  /** 진압대 공격 이펙트: 이펙트 기준점(pivot)을 공격 그림 안의 지점(anchor)에 맞춰 1회 재생. 왼쪽을 보면 같이 뒤집는다 */
  private trooperFx(e: Enemy, A: (typeof TROOPER_ATK)[keyof typeof TROOPER_ATK]): void {
    const [fw, fh] = A.size;
    const flip = e.sprite.flipX;
    const ax = flip ? fw - A.anchor[0] : A.anchor[0];
    const foot = e.y + e.footOff;
    const x = e.x - fw / 2 + ax;
    const y = foot - fh + A.anchor[1];
    const [sw, sh] = A.fxSize;
    const ox = (flip ? sw - A.pivot[0] : A.pivot[0]) / sw;
    this.playSheet(A.fx, A.fxN, x, y, ox, A.pivot[1] / sh, 12, 11, flip);
  }

  /** 보스 모션: 걷기 2프레임, 돌진 예고(떨림), 돌진 자세, 코어는 둥실 떠 있음 */
  private animateBoss(b: Enemy, def: BossDef, dt: number): void {
    if (this.animateXm4(b, def, dt)) return;
    if (this.animateBossFrames(b, def, dt)) return;
    if (this.animateBasiliFrames(b, def, dt)) return;
    const ph = this.bossPhase;
    const f = ph === 'aim' || this.bossAtkT > 0 || BASILI_AIM.has(ph) ? 'aim' : ph === 'charge' ? 'charge' : Math.floor(this.elapsed * (ph === 'walkIn' ? 3 : 4)) % 2 ? 'w1' : 'w2';
    const key = `${def.id}_${f}`;
    if (this.textures.exists(key) && b.sprite.texture.key !== key) b.sprite.setTexture(key);
    const core = def.id === 'boss3';
    const bob = core ? Math.sin(this.elapsed * 2.5) * 3 : f === 'w1' || f === 'w2' ? -Math.abs(Math.sin(this.elapsed * 8)) * 1.5 : 0;
    // 예고 떨림: 돌진 조준, 발구르기 발 들기, 2페이즈 전환 (전환은 더 세게)
    const shakeAmp = ph === 'phaseShift' ? 4 : ph === 'aim' || ph === 'stomp' ? 2 : 0;
    const jitter = shakeAmp && !Settings.reducedFx ? (Math.random() - 0.5) * shakeAmp : 0;
    // 점프 낙하(그림 없는 보스): 공중에서 포물선으로 뜸
    const slD = (def as { slam?: SlamDef }).slam;
    const lift = ph === 'air' && slD ? Math.sin(Phaser.Math.Clamp(1 - this.bossTimer / slD.air, 0, 1) * Math.PI) * slD.height : 0;
    b.sprite.setPosition(b.x + jitter, b.y + bob - lift);
    if (!core) b.sprite.setFlipX(ph === 'charge' ? this.bossDir.x < 0 : ph === 'gatling' ? Math.cos(this.gatAim) < 0 : this.player.x < b.x);
  }

  /**
   * 동작별 프레임 그림이 있는 보스(코박): 걷기 루프, 돌진 예고(웅크림)·돌진 프레임.
   * 프레임 수·허리 위치는 아트의 <id>_anim.json, 재생 속도·배율은 game.json bosses[].anim에서 읽는다.
   * 그림이 교체돼도 JSON만 바뀌면 코드는 그대로 맞춰진다. 그림이 없으면 false (예전 2프레임 방식)
   */
  private animateBossFrames(b: Enemy, def: BossDef, dt: number): boolean {
    const A = (def as { anim?: BossAnim }).anim;
    const M = BOSS_ANIM[def.id];
    if (!A || !M || !this.textures.exists(`${def.id}_walk_00`)) return false;
    const ph = this.bossPhase;
    let motion: string;
    let idx: number;
    const n = (m: string) => M[m]?.frames ?? 0;
    const P2 = this.bossPhase2 ? (def as { phase2?: Phase2 }).phase2 : undefined;
    const sl = (def as { slam?: SlamDef }).slam;
    const hkA = (def as { hook?: HookDef }).hook;
    let lift = 0;
    if (ph === 'aim' && n('charge') > 0) {
      // 예고: 예고 프레임(chargeWind)을 예고 시간에 맞춰 한 번 재생
      const k = Phaser.Math.Clamp(1 - this.bossTimer / (P2?.aimTime ?? def.aimTime), 0, 0.999);
      const [w0, w1] = A.chargeWind;
      motion = 'charge';
      idx = w0 + Math.floor(k * (w1 - w0 + 1));
    } else if (ph === 'charge' && n('charge') > 0) {
      // 돌진: 처음 chargeFlashTime 동안 번쩍 프레임, 이후 돌진 프레임을 남은 시간에 맞춰
      const total = this.bossChargeTotal > 0 ? this.bossChargeTotal : (P2?.chargeTime ?? def.chargeTime) / (this.bossEnraged ? ((def as { enrage?: EnrageDef }).enrage?.mul ?? 1) : 1);
      const t = total - this.bossTimer;
      const [r0, r1] = A.chargeRun;
      motion = 'charge';
      idx = t < A.chargeFlashTime ? A.chargeFlash : r0 + Math.min(r1 - r0, Math.floor(((t - A.chargeFlashTime) / Math.max(0.01, total - A.chargeFlashTime)) * (r1 - r0 + 1)));
    } else if (ph.startsWith('hook') && hkA) {
      const span = (r: number[], k: number) => r[0] + Math.min(r[1] - r[0], Math.floor(Phaser.Math.Clamp(k, 0, 0.999) * (r[1] - r[0] + 1)));
      const h = this.hook;
      if (ph === 'hookAim') {
        motion = 'hook';
        idx = hkA.throwFrames[0];
      } else if (ph === 'hookFly') {
        motion = 'hook';
        idx = span(hkA.throwFrames, h.t / hkA.throwTime);
      } else if (ph === 'hookGap') {
        // 끌어온 뒤 칼을 들어 올리는 예비 동작 (내리찍기 공중 프레임)
        motion = 'slam';
        idx = sl ? span(sl.swingFrames, 1 - this.bossTimer / (hkA.gap / (this.bossEnraged ? ((def as { enrage?: EnrageDef }).enrage?.mul ?? 1) : 1))) : 0;
      } else {
        motion = 'hook';
        idx = span(hkA.pullFrames, ph === 'hookPull' ? 1 - this.bossTimer / hkA.pullTime : h.t / 0.3);
      }
    } else if ((ph === 'enter' || ph === 'taunt') && sl) {
      // 등장: 높은 곳에서 떨어지며(공중 프레임 → 마지막 airSwing초는 휘두르기) 착지 → 착지 자세 뒤 서서 말하기
      const ent = (def as { entrance?: EntranceDef }).entrance!;
      const span = (r: number[], k: number) => r[0] + Math.min(r[1] - r[0], Math.floor(Phaser.Math.Clamp(k, 0, 0.999) * (r[1] - r[0] + 1)));
      if (ph === 'enter') {
        if (this.bossTimer > sl.airSwing) {
          motion = 'leap';
          idx = sl.airFrames[1];
        } else {
          motion = 'slam';
          idx = span(sl.swingFrames, 1 - this.bossTimer / sl.airSwing);
        }
        lift = (this.bossTimer / ent.fall) ** 1.6 * ent.height;
      } else {
        const t = sl.recover + ent.holdLast - this.bossTimer;
        motion = 'slam';
        idx = t < sl.recover ? span(sl.landFrames, t / sl.recover) : sl.landFrames[1];
      }
    } else if ((ph === 'leap' || ph === 'air' || ph === 'slam') && sl) {
      // 점프 내리찍기: 웅크렸다 도약(leap) → 공중(도약 마지막 장, 착지 직전엔 칼 휘두르기) → 착지(slam)
      const rage = this.bossEnraged ? ((def as { enrage?: EnrageDef }).enrage?.mul ?? 1) : 1;
      const span = (r: number[], k: number) => r[0] + Math.min(r[1] - r[0], Math.floor(Phaser.Math.Clamp(k, 0, 0.999) * (r[1] - r[0] + 1)));
      if (ph === 'leap') {
        motion = 'leap';
        idx = span(sl.leapFrames, 1 - this.bossTimer / (sl.leap / rage));
      } else if (ph === 'air') {
        const swing = sl.airSwing / rage;
        if (this.bossTimer > swing) {
          // 떠오르는 프레임(airFrames)을 airRise초 동안 재생하고 마지막 장 유지
          motion = 'leap';
          idx = span(sl.airFrames, (sl.air / rage - this.bossTimer) / sl.airRise);
        } else {
          motion = 'slam';
          idx = span(sl.swingFrames, 1 - this.bossTimer / swing);
        }
        // 공중 높이: 포물선
        const k = Phaser.Math.Clamp(1 - this.bossTimer / (sl.air / rage), 0, 1);
        lift = Math.sin(k * Math.PI) * sl.height;
      } else {
        motion = 'slam';
        idx = span(sl.landFrames, 1 - this.bossTimer / sl.recover);
      }
    } else {
      motion = 'walk';
      b.walkPh = (b.walkPh + dt * A.walkFps) % n('walk');
      idx = Math.floor(b.walkPh);
    }
    const key = `${def.id}_${motion}_${String(idx).padStart(2, '0')}`;
    if (!this.textures.exists(key)) return false;
    if (b.sprite.texture.key !== key) b.sprite.setTexture(key);
    // 그림은 오른쪽을 본다. 뒤집으면 허리 위치(originX)도 반대쪽으로
    const flip = ph === 'charge' || ph === 'aim' || ph === 'leap' || ph === 'air' || ph === 'slam' || ph === 'enter' || ph.startsWith('hook') ? this.bossDir.x < 0 : this.player.x < b.x;
    const ox = M[motion].originX;
    b.sprite.setFlipX(flip).setOrigin(flip ? 1 - ox : ox, 1);
    const sc = this.bossAnimScale(def, motion);
    if (!this.tweens.isTweening(b.sprite)) b.sprite.setScale(sc);
    b.footOff = A.footY;
    const jitter = ph === 'aim' && !Settings.reducedFx ? (Math.random() - 0.5) * 2 : 0;
    b.sprite.setPosition(b.x + jitter, b.y + A.footY - lift);
    this.drawHook(b, def);
    return true;
  }

  /** 보스 표시 배율 (동작별 프레임 그림이면 그 동작 배율까지) */
  private bossAnimScale(def: BossDef | null, motion?: string): number {
    const A = def ? (def as { anim?: BossAnim }).anim : undefined;
    if (!A) return this.boss?.baseScale ?? BOSS_SCALE;
    const m = motion ?? this.boss?.sprite.texture.key.match(/_(walk|leap|charge|slam|hook)_\d+$/)?.[1] ?? 'walk';
    return BOSS_SCALE * A.scale * (A.motionScale[m] ?? 1);
  }

  /** 등장 자리: 화면 안, 플레이어에서 minDist 이상인 적 가운데 반경 안에 적이 가장 많은 곳 (없으면 플레이어 오른쪽) */
  private entranceSpot(ent: EntranceDef): { x: number; y: number } {
    const p = this.player;
    // 화면 안쪽 (위에서 떨어지는 모습이 보이게 위쪽은 넉넉히)
    const c = this.cameras.main;
    const cands = this.enemyPool.items.filter((e) => e.active && !e.isBoss && !e.id.startsWith('trooper_') && e.x > c.scrollX + 40 && e.x < c.scrollX + VIEW_W - 40 && e.y > c.scrollY + 90 && e.y < c.scrollY + VIEW_H - 20 && Math.hypot(e.x - p.x, e.y - p.y) >= ent.minDist);
    let best: { x: number; y: number } | null = null;
    let bestN = -1;
    for (const c of cands) {
      let n = 0;
      for (const o of cands) if ((o.x - c.x) ** 2 + (o.y - c.y) ** 2 <= ent.radius ** 2) n++;
      if (n > bestN) {
        bestN = n;
        best = { x: c.x, y: c.y };
      }
    }
    if (best) return best;
    if (this.arena) return { x: this.arena.x + this.arena.w - 60, y: p.y };
    return { x: p.x + Math.max(ent.minDist, 220), y: p.y };
  }

  /** 등장 낙하 자리 표시 (점프 내리찍기와 같은 모양, 졸개 처치 반경) */
  private drawEntranceMark(ent: EntranceDef): void {
    const k = Phaser.Math.Clamp(1 - this.bossTimer / ent.fall, 0, 1);
    const { x, y } = this.bossTo;
    this.fx.fillStyle(0xff2a3a, MARK_A * (0.1 + 0.15 * k)).fillEllipse(x, y, ent.radius * 2, ent.radius * 1.2);
    this.fx.fillStyle(0xff2a3a, MARK_A * 0.25).fillEllipse(x, y, ent.radius * 2 * k, ent.radius * 1.2 * k);
    this.fx.lineStyle(2, 0xff2a3a, MARK_A * (0.5 + Math.sin(this.elapsed * 30) * 0.3)).strokeEllipse(x, y, ent.radius * 2, ent.radius * 1.2);
  }

  /** 등장 착지: 반경 안 졸개를 처치(경험치·드롭·처치 수 없음), 플레이어 피해 없음, 충격파 + 한마디 */
  private entranceLand(b: Enemy, ent: EntranceDef, sl?: SlamDef): void {
    for (const e of this.enemyPool.items) {
      if (!e.active || e === b || e.isBoss || e.id.startsWith('trooper_')) continue;
      const nx = (e.x - b.x) / ent.radius;
      const ny = (e.y - b.y) / (ent.radius * 0.6);
      if (nx * nx + ny * ny > 1) continue;
      this.burst(e.x, e.y, 0xff2a3a, 6);
      e.kill();
    }
    const ring = this.add.ellipse(b.x, b.y, ent.radius * 2, ent.radius * 1.2).setStrokeStyle(3, 0xffa040, 0.9).setDepth(11);
    ring.setScale(0.3);
    this.tweens.add({ targets: ring, scale: 1.25, alpha: 0, duration: 420, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
    this.burst(b.x, b.y, 0xffa040, 24);
    this.shake(300, 0.016);
    Sound.play('explode');
    // 말풍선: 머리 위 (그림 높이만큼 올림), 등장 연출 동안
    const cineDef = (this.bossDef as { cine?: CineDef } | null)?.cine;
    if (cineDef?.intro) this.startCine(b, [ent.line, ...cineDef.intro], 0.3);
    else this.shout(b, tr(ent.line as Parameters<typeof tr>[0]), 0.15, false, ent.taunt, 10);
  }

  /** 지금 보스 그림에서 사슬이 손에서 나오는 점 (월드 좌표). 아트 midboss_anim.json hook.chainEnd */
  private hookHand(b: Enemy, def: BossDef): { x: number; y: number } {
    const M = BOSS_ANIM[def.id]?.hook as { w: number; h: number; chainEnd?: number[][] } | undefined;
    const f = Number(b.sprite.texture.key.match(/_hook_(\d+)$/)?.[1] ?? 0);
    const ce = M?.chainEnd?.[f];
    if (!M || !ce) return { x: b.x, y: b.y };
    const sp = b.sprite;
    const lx = (sp.flipX ? M.w - ce[0] : ce[0]) - sp.originX * M.w;
    const ly = ce[1] - sp.originY * M.h;
    return { x: sp.x + lx * sp.scaleX, y: sp.y + ly * sp.scaleY };
  }

  /** 갈고리 진행: 예고 → 날아감 → (맞음) 끌어오기 → 틈 → 내리찍기 / (빗나감·대시로 끊음) 감아들이기 */
  private updateHook(b: Enemy, def: BossDef, dt: number, rage: number, sl?: SlamDef): void {
    const hk = (def as { hook?: HookDef }).hook!;
    const p = this.player;
    const h = this.hook;
    h.t += dt;
    const hand = this.hookHand(b, def);
    const ph = this.bossPhase;
    if (ph === 'hookAim') {
      // 예고선이 플레이어를 따라가다가 발사 lockBefore초 전에 멈춘다 (비켜설 틈)
      if (this.bossTimer > (hk.lockBefore ?? 0)) {
        const tx = (this.untrackedElite ? this.decoy.x : p.x) - b.x;
        const ty = (this.untrackedElite ? this.decoy.y : p.y) - b.y;
        const dd = Math.hypot(tx, ty) || 1;
        h.ax = tx / dd;
        h.ay = ty / dd;
        this.bossDir = { x: h.ax, y: h.ay };
      }
      this.fx.lineStyle(2, 0xff2a3a, MARK_A * (0.4 + Math.sin(this.elapsed * 40) * 0.3));
      this.fx.lineBetween(hand.x, hand.y, hand.x + h.ax * hk.range, hand.y + h.ay * hk.range);
      if (this.bossTimer <= 0) {
        this.bossPhase = 'hookFly';
        h.t = 0;
        Sound.play('lunge');
        this.playSheet('fx_hook_flash', 3, hand.x, hand.y, 0.5, 0.5, 20, 13);
      }
    } else if (ph === 'hookFly') {
      const len0 = h.len;
      h.len = Math.min(hk.range, h.len + hk.speed * dt);
      const hx = hand.x + h.ax * h.len;
      const hy = hand.y + h.ay * h.len;
      // 매우 빨라 한 프레임에 수십 px를 가므로, 이번 프레임에 지나간 구간 전체로 맞았는지 본다
      const along = Phaser.Math.Clamp((p.x - hand.x) * h.ax + (p.y - hand.y) * h.ay, len0, h.len);
      const cx = hand.x + h.ax * along;
      const cy = hand.y + h.ay * along;
      // 대시(무적) 중이거나 방금 맞아 무적이면 그대로 지나간다
      if (p.invuln <= 0 && !p.dashing && (p.x - cx) ** 2 + (p.y - cy) ** 2 < ((p.radius + 8) * (hk.hitMul ?? 1)) ** 2) {
        this.hurtPlayer(hk.damage, { kind: 'boss', id: b.id });
        // 갈고리 머리는 맞은 자리에서 멈춘다 (이번 프레임에 더 나간 만큼 되돌림)
        h.len = along;
        this.playSheet('fx_hook_hit', 3, cx, cy, 0.5, 0.5, 20, 13);
        this.shake(120, 0.01);
        this.bossPhase = 'hookPull';
        this.bossTimer = hk.pullTime;
        h.t = 0;
        h.px = p.x;
        h.py = p.y;
      } else if (h.len >= hk.range) {
        this.playSheet('fx_hook_hit', 3, hx, hy, 0.5, 0.5, 20, 13);
        this.bossPhase = 'hookBack';
        // 빗나감: 끝나면 돌진·점프로 이어 갈 수 있다 (콤보)
        this.bossLastKind = 'hookMiss';
        h.t = 0;
      }
    } else if (ph === 'hookPull') {
      if (p.dashing) {
        // 대시로 사슬을 끊고 빠져나간다
        this.bossPhase = 'hookBack';
        h.t = 0;
      } else {
        const k = Phaser.Math.Clamp(1 - this.bossTimer / hk.pullTime, 0, 1);
        const e = k * k;
        const tx = b.x + h.ax * hk.pullTo;
        const ty = b.y + h.ay * hk.pullTo;
        p.x = Phaser.Math.Linear(h.px, tx, e);
        p.y = Phaser.Math.Linear(h.py, ty, e);
        h.len = Math.max(0, Math.hypot(p.x - hand.x, p.y - hand.y));
        if (this.bossTimer <= 0) {
          // 끌려온 뒤 피할 틈: 이 동안 칼을 들어 올린다
          this.bossPhase = 'hookGap';
          this.bossTimer = hk.gap / rage;
          h.len = 0;
          h.t = 0;
        }
      }
    } else if (ph === 'hookGap') {
      if (this.bossTimer <= 0) {
        if (sl) {
          this.bossPhase = 'slam';
          this.bossTimer = sl.recover;
          this.slamLand(b, sl);
        } else {
          this.bossPhase = 'walk';
          this.bossTimer = def.walkTime;
        }
      }
    } else if (ph === 'hookBack') {
      h.len = Math.max(0, h.len - hk.backSpeed * dt);
      if (h.len <= 0) {
        this.bossPhase = 'walk';
        this.bossTimer = def.walkTime;
      }
    }
  }

  /** 사슬(반복 그림)과 갈고리 머리: 손에서 갈고리 방향으로 len만큼 */
  private drawHook(b: Enemy, def: BossDef): void {
    const on = this.bossPhase === 'hookFly' || this.bossPhase === 'hookPull' || this.bossPhase === 'hookBack';
    if (!on || this.hook.len <= 1 || !this.textures.exists('midboss_hook_chain')) {
      this.hookChain?.setVisible(false);
      this.hookHead?.setVisible(false);
      this.hookTrail?.setVisible(false);
      return;
    }
    const M = BOSS_ANIM[def.id]?.hook as { chainTile?: { w: number; h: number; barRow?: number; barRows?: number[] }; head?: { w: number; h: number; join: number[] } } | undefined;
    // 사슬 반복 그림 크기는 아트 json(chainTile)을 따른다 (그림이 바뀌어도 그대로 맞춤)
    const th = M?.chainTile?.h ?? this.textures.get('midboss_hook_chain').getSourceImage().height;
    // 사슬 위쪽 = 손 지점 - barRow(또는 barRows[0]) px (아트 배치 규칙)
    const ct = M?.chainTile;
    const bar = ct ? (ct.barRows ? ct.barRows[0] : ct.barRow! + 0.5) / ct.h : 0.5;
    this.hookChain ??= this.add.tileSprite(0, 0, 8, th, 'midboss_hook_chain').setDepth(12.5);
    this.hookHead ??= this.add.image(0, 0, 'midboss_hook_head').setDepth(12.6);
    const hand = this.hookHand(b, def);
    const a = Math.atan2(this.hook.ay, this.hook.ax);
    const left = this.hook.ax < 0;
    const len = this.hook.len;
    // 왼쪽으로 던지면 그림이 뒤집히지 않게 세로로 뒤집는다
    this.hookChain.setVisible(true).setPosition(hand.x, hand.y).setSize(len, th).setOrigin(0, bar).setRotation(a).setFlipY(left);
    const j = M?.head?.join ?? [0, 2];
    const hw = M?.head?.w ?? 17;
    const hh = M?.head?.h ?? 12;
    this.hookHead
      .setVisible(true)
      .setPosition(hand.x + Math.cos(a) * len, hand.y + Math.sin(a) * len)
      .setOrigin(j[0] / hw, left ? 1 - (j[1] + 0.5) / hh : (j[1] + 0.5) / hh)
      .setRotation(a)
      .setFlipY(left);
    // 날아가는 동안 사슬 앞쪽 위에 속도 잔상 (오른쪽 끝 = 갈고리 머리, 가운데 줄 = 사슬 줄)
    if (this.textures.exists('fx_hook_trail')) {
      this.hookTrail ??= this.add.image(0, 0, 'fx_hook_trail', '0').setDepth(12.55);
      const fly = this.bossPhase === 'hookFly' && len > 12;
      this.hookTrail
        .setVisible(fly)
        .setFrame(String(Math.floor(this.elapsed * 20) % 3))
        .setPosition(hand.x + Math.cos(a) * len, hand.y + Math.sin(a) * len)
        .setOrigin(1, 0.5)
        .setRotation(a)
        .setFlipY(left)
        .setAlpha(Math.min(1, len / 48));
    }
  }

  // ───────────── 바실리 (최종 보스) ─────────────
  /** 단계와 상관없이 매 프레임: 호위 궤도, 충격파 고리, 2페이즈 발전기 빛 */
  private updateBasiliAlways(b: Enemy, bz: BasiliDef, dt: number): void {
    const p = this.player;
    // 호위: 바실리 둘레를 돌며 따라다닌다 (적 AI가 움직인 뒤 자리로 끌어당김)
    this.basiliGuards = this.basiliGuards.filter((e) => e.active && e.id === bz.call.id);
    const n = this.basiliGuards.length;
    this.basiliGuards.forEach((e, i) => {
      const a = this.elapsed * bz.call.orbit + (i / Math.max(1, n)) * Math.PI * 2;
      const tx = b.x + Math.cos(a) * bz.call.radius;
      const ty = b.y + Math.sin(a) * bz.call.radius * 0.7;
      const k = Math.min(1, dt * 10);
      e.x += (tx - e.x) * k;
      e.y += (ty - e.y) * k;
    });
    // 충격파 고리: 퍼지면서 고리 띠에 닿으면 피해 (한 고리에 한 번, 대시·무적이면 넘어감)
    const S = bz.stomp;
    for (const r of this.stompRings) {
      r.t += dt;
      if (r.t < 0) continue;
      const k = Math.min(1, r.t / S.time);
      const rad = k * S.radius;
      const alpha = 1 - k;
      this.fx.lineStyle(4, 0xffa040, 0.85 * alpha).strokeEllipse(r.x, r.y, rad * 2, rad * 1.2);
      this.fx.lineStyle(10, 0xff6a2a, 0.18 * alpha).strokeEllipse(r.x, r.y, rad * 2, rad * 1.2);
      if (!r.hit && p.invuln <= 0 && !p.dashing) {
        const q = Math.hypot(p.x - r.x, (p.y - r.y) / 0.6);
        if (Math.abs(q - rad) < S.band + p.radius) {
          r.hit = true;
          this.hurtPlayer(S.damage, { kind: 'boss', id: b.id });
        }
      }
    }
    this.stompRings = this.stompRings.filter((r) => r.t < S.time);
    // 2페이즈: 발전기 빛. 전환 동안 청록 → 빨강으로 바뀌고, 가운데는 흰빛에 가까운 빨강 (새 그림이 오기 전엔 몸 가운데에 덧입힘)
    if (this.bossPhase2 || this.bossPhase === 'phaseShift') {
      const G = bz.glow;
      this.basiliGlow ??= this.add.image(0, 0, this.softGlowKey()).setBlendMode(Phaser.BlendModes.ADD).setDepth(12.4);
      this.basiliCore ??= this.add.image(0, 0, this.softGlowKey()).setBlendMode(Phaser.BlendModes.ADD).setDepth(12.45);
      const k = this.bossPhase === 'phaseShift' ? Phaser.Math.Clamp(1 - this.bossTimer / bz.phaseShift, 0, 1) : 1;
      const c0 = Phaser.Display.Color.ValueToColor(Number(G.from));
      const c1 = Phaser.Display.Color.ValueToColor(Number(G.color));
      const mix = Phaser.Display.Color.Interpolate.ColorWithColor(c0, c1, 100, Math.round(k * 100));
      const tint = Phaser.Display.Color.GetColor(mix.r, mix.g, mix.b);
      const pulse = Settings.reducedFx ? 1 : 0.8 + Math.sin(this.elapsed * 6) * 0.2;
      // 그림이 있으면 프레임별 발전기 위치(boss_anim.json generator), 가려진 프레임(null)이면 숨김
      const gp = this.basiliPoint(b, 'generator');
      const sx = b.sprite.flipX ? -1 : 1;
      const hidden = gp === null;
      const x = gp ? gp.x : b.sprite.x + G.x * sx * b.sprite.scaleX;
      const y = gp ? gp.y : b.sprite.y + G.y * b.sprite.scaleY;
      const size = G.size * (0.6 + 0.4 * k) * (hidden ? 0 : 1);
      this.basiliGlow.setTint(tint).setVisible(true).setPosition(x, y).setDisplaySize(size * b.sprite.scaleX, size * b.sprite.scaleY).setAlpha(G.alpha * pulse);
      this.basiliCore
        .setTint(Number(G.core))
        .setVisible(k > 0.5)
        .setPosition(x, y)
        .setDisplaySize(size * 0.35 * b.sprite.scaleX, size * 0.35 * b.sprite.scaleY)
        .setAlpha(G.alpha * pulse * (k - 0.5) * 2);
    }
  }

  /** 바실리 전용 단계 (등장·전환·걷기 판단·개틀링·호출·발구르기). 처리했으면 true, 조준·돌진은 false로 공통 코드에 맡김 */
  private updateBasili(b: Enemy, def: BossDef, bz: BasiliDef, dt: number, dx: number, dy: number, d: number, tg: { x: number; y: number }, p2: Phase2 | null): boolean {
    const ph = this.bossPhase;
    const p = this.player;
    const slow = this.odSlowMul;
    const toWalk = () => {
      this.bossPhase = 'walk';
      this.bossTimer = def.walkTime;
    };
    if (ph === 'walkIn') {
      // 화면 밖에서 걸어 들어오기: 발 디딜 때마다 쿵
      b.x = Math.max(this.walkInTo, b.x - bz.walkIn.speed * dt);
      if ((this.walkInStep -= dt) <= 0) {
        this.walkInStep = bz.walkIn.step;
        this.shake(90, 0.007);
        this.playSheet('fx_land_dust', 18, b.x, b.y + b.radius, 56 / 112, 30 / 40, 14, 9.5);
        Sound.play('trooperland');
      }
      if (b.x <= this.walkInTo) {
        this.bossLastAttack = this.elapsed;
        this.bossPhase = 'walk';
        this.bossTimer = def.firstWalk;
        // 걸어 들어와 멈춘 뒤 클로즈업 + 등장 대사
        const cd = (def as { cine?: CineDef }).cine;
        if (cd?.intro) this.startCine(b, cd.intro, 0.2);
      }
      return true;
    }
    if (ph === 'phaseShift') {
      if (!Settings.reducedFx && Math.random() < 0.25) this.shake(60, 0.006);
      if (this.bossTimer <= 0) {
        // 2페이즈 발전기 빛(빨강)과 맞춰 붉게 번쩍
        this.screenFlash(0xff2a3a, 0.25, 300);
        this.bossPulse(b);
        this.bossLastAttack = this.elapsed;
        toWalk();
      }
      return true;
    }
    if (ph === 'walk') {
      b.x += (dx / d) * b.speed * slow * dt;
      b.y += (dy / d) * b.speed * slow * dt;
      if ((this.bossThinkT -= dt) <= 0) {
        this.bossThinkT = gameData.bossBrain.think;
        const { act, scores } = pickBasili({
          d,
          playerHp: Math.max(0, p.hp) / p.maxHp,
          moving: Phaser.Math.Clamp(Math.hypot(this.bossPVel.x, this.bossPVel.y) / PLAYER.speed, 0, 1),
          fleeing: Phaser.Math.Clamp((this.bossPVel.x * dx + this.bossPVel.y * dy) / d / PLAYER.speed, 0, 1),
          dashSpent: p.dashCd > 0,
          sinceAttack: this.elapsed - this.bossLastAttack,
          sinceCall: this.elapsed - this.basiliLastCall,
          guards: this.basiliGuards.length,
          p2: !!p2,
          last: this.basiliLast,
          current: this.bossAct as BasiliAct,
          combo: this.comboNow(),
        });
        this.bossScores = scores as Partial<Record<BossAct, number>>;
        if (act !== 'walk') {
          this.basiliLast = act;
          this.bossLastKind = act;
          this.comboCount = this.comboNow().includes(act) ? this.comboCount + 1 : 1;
          this.comboFrom = '';
          this.bossDir = { x: dx / d, y: dy / d };
          if (act === 'charge') {
            this.bossLastAttack = this.elapsed;
            this.bossPhase = 'aim';
            this.bossTimer = p2 ? p2.aimTime : def.aimTime;
            this.bossCharges = p2 ? p2.chargeCount : 1;
          } else if (act === 'gatling') {
            this.bossLastAttack = this.elapsed;
            this.bossPhase = 'gatling';
            this.bossTimer = bz.gatling.spin + bz.gatling.time;
            this.gatAim = Math.atan2(dy, dx);
            this.gatAcc = 0;
            this.gatShotFrame = -1;
            Sound.play('lungewarn');
          } else if (act === 'stomp') {
            this.bossLastAttack = this.elapsed;
            this.bossPhase = 'stomp';
            this.bossTimer = bz.stomp.lift;
            Sound.play('lungewarn');
          } else if (act === 'call') {
            this.bossPhase = 'call';
            this.bossTimer = bz.call.gesture;
            this.callSpawned = false;
            this.basiliLastCall = this.elapsed;
          }
        }
      }
      return true;
    }
    if (ph === 'gatling') {
      const G = bz.gatling;
      // 플레이어 쪽으로 천천히 돈다 (초당 turn도)
      const want = Math.atan2(dy, dx);
      const turn = Phaser.Math.DegToRad(G.turn) * dt;
      this.gatAim = Phaser.Math.Angle.RotateTo(this.gatAim, want, turn);
      if (this.bossTimer < G.time) {
        const rate = p2 ? bz.p2.gatlingRate : G.rate;
        const speed = G.speed * (p2 ? bz.p2.gatlingSpeed : 1);
        // 총구: 그림이 있으면 프레임별 총구 위치(boss_anim.json muzzle), 없으면 몸 앞
        const mp = this.basiliPoint(b, 'muzzle');
        const mx = mp ? mp.x : b.x + Math.cos(this.gatAim) * b.radius * 1.1;
        const my = mp ? mp.y : b.y - b.radius * 0.2 + Math.sin(this.gatAim) * b.radius * 0.8;
        // 사격 그림 한 장 = 한 발 (사격 시작 순간 첫 발, 이후 초당 rate장). 한 발마다 같은 프레임에 빛 칠한 몸·화염 1장·탄피 1개 (아트 shots 규칙)
        const SH = (bossAnim as { gatling?: { shots?: { perFrame: Record<string, { flash: number; casingRow: number }>; flashHoldMs: number } }; p2_gatling?: { shots?: { perFrame: Record<string, { flash: number; casingRow: number }>; flashHoldMs: number } } })[this.bossPhase2 ? 'p2_gatling' : 'gatling']?.shots;
        const loopR = (BOSS_ANIM.boss as Record<string, { phases?: Record<string, number[]> }>).gatling?.phases?.fireLoop ?? [5, 8];
        const due = Math.floor((G.time - this.bossTimer) * rate) + 1;
        while (this.gatAcc < due) {
          const frame = loopR[0] + (this.gatAcc % (loopR[1] - loopR[0] + 1));
          this.gatAcc++;
          this.gatShotFrame = frame;
          // 부채꼴로 흔들며 연사
          const a = this.gatAim + Math.sin(this.elapsed * 9) * Phaser.Math.DegToRad(G.fan / 2) + (Math.random() - 0.5) * 0.06;
          this.eShot(b.id).fire(mx, my, a, speed, G.damage, G.life);
          const pf = SH?.perFrame[String(frame)];
          this.basiliFlashT = SH ? SH.flashHoldMs / 1000 : bz.anim.flashTime;
          this.basiliFlashF = pf ? pf.flash : Math.floor(Math.random() * 5);
          this.ejectCasing(b, pf ? pf.casingRow : undefined);
          // 반동도 같은 발사에 한 번 (몸이 뒤로 밀렸다가 돌아옴)
          this.basiliKick = 1;
          if (!this.textures.exists('fx_boss_muzzle')) this.burst(mx, my, 0xfff23a, 2);
          if (Math.random() < 0.35) Sound.play('enemyshot');
        }
        // 총구 불꽃 (화염 그림이 없을 때만 도형으로)
        if (!this.textures.exists('fx_boss_muzzle')) this.fx.fillStyle(0xfff23a, 0.5 + Math.random() * 0.4).fillCircle(mx, my, 3 + Math.random() * 2);
      } else {
        // 돌아가기 시작: 총구 쪽 예고선
        this.fx.lineStyle(1.5, 0xff2a3a, MARK_A * 0.6).lineBetween(b.x, b.y, b.x + Math.cos(this.gatAim) * 200, b.y + Math.sin(this.gatAim) * 200);
      }
      if (this.bossTimer <= 0) toWalk();
      return true;
    }
    if (ph === 'call') {
      // 손짓 그림의 호위 등장 장(guardSpawnFrame)에 맞춰 호위를 부르고, 남은 장(팔 내림)을 마저 보인 뒤 걷기
      const CM = (bossAnim as { call?: { frames: number; guardSpawnFrame?: number } }).call;
      const spawnAt = CM && this.textures.exists('boss_call_00') ? ((CM.guardSpawnFrame ?? CM.frames - 1) / CM.frames) * bz.call.gesture : bz.call.gesture;
      if (this.bossTimer <= 0) toWalk();
      if (!this.callSpawned && bz.call.gesture - this.bossTimer >= spawnAt) {
        this.callSpawned = true;
        // 호위가 둘레에 나타남 (체력은 보스 부하와 같은 기준)
        const n = p2 ? bz.p2.guards : bz.call.count;
        const hp = this.enemyHpMul(this.elapsed - this.zoneStart);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const e = this.spawnEnemy(bz.call.id as EnemyId, b.x + Math.cos(a) * bz.call.radius, b.y + Math.sin(a) * bz.call.radius * 0.7, hp);
          if (e) this.basiliGuards.push(e);
        }
        this.bossPulse(b);
        Sound.play('bosswarn');
      }
      return true;
    }
    if (ph === 'stomp') {
      // 발 들기 예고: 퍼질 범위 표시
      const S = bz.stomp;
      const k = Phaser.Math.Clamp(1 - this.bossTimer / S.lift, 0, 1);
      this.fx.lineStyle(2, 0xff2a3a, MARK_A * (0.3 + 0.3 * k)).strokeEllipse(b.x, b.y, S.radius * 2, S.radius * 1.2);
      this.fx.fillStyle(0xff2a3a, MARK_A * 0.15 * k).fillEllipse(b.x, b.y, S.radius * 2 * k, S.radius * 1.2 * k);
      if (this.bossTimer <= 0) {
        // 충격파 피해 고리: 앞발 아래에서. 2페이즈는 이펙트와 같이 보는 방향 앞쪽으로 이어서 (offsetsX·delayFrames)
        const footX = this.stompFoot(b).x;
        const RF = (bossAnim as unknown as { fx?: { fx_boss_stomp_p2?: { fps: number; offsetsX?: number[]; delayFrames?: number[] } } }).fx?.fx_boss_stomp_p2;
        const ringDir = b.sprite.flipX ? -1 : 1;
        if (p2) {
          const offs = RF?.offsetsX ?? [0, 70];
          for (let i = 0; i < Math.min(bz.p2.stompRings, offs.length); i++) {
            const delay = RF ? (RF.delayFrames?.[i] ?? 0) / RF.fps : i * bz.p2.ringGap;
            this.stompRings.push({ x: footX + offs[i] * ringDir, y: b.y, t: -delay, hit: false });
          }
        } else this.stompRings.push({ x: footX, y: b.y, t: 0, hit: false });
        this.shake(260, 0.016);
        this.basiliSquash = bz.anim.squash;
        if (this.textures.exists('fx_boss_stomp')) {
          // 발구르기 이펙트 그림: 원점 = 내려찍는 앞발 아래(stomp.footImpact), 1:1 크기. 2페이즈는 작은 이펙트 2개를 발 기준 양옆에
          const FX = (bossAnim as unknown as { fx?: Record<string, { frameW: number; frameH: number; frames: number; fps: number; origin: number[]; offsetsX?: number[]; delayFrames?: number[] }> }).fx ?? {};
          const foot = this.stompFoot(b);
          const flip = b.sprite.flipX;
          const play = (key: string, dx: number) => {
            const F = FX[key];
            if (!F || !this.textures.exists(key)) return false;
            const ox = (flip ? F.frameW - F.origin[0] : F.origin[0]) / F.frameW;
            this.playSheet(key, F.frames, foot.x + dx, foot.y, ox, F.origin[1] / F.frameH, F.fps, b.sprite.depth + 0.1, flip);
            return true;
          };
          // 2페이즈: 앞발에서 시작해 보는 방향으로 offsetsX만큼 앞에, delayFrames(이펙트 프레임) 뒤에 이어서 → 충격이 앞으로 퍼짐
          const P2F = FX.fx_boss_stomp_p2;
          if (p2 && P2F && this.textures.exists('fx_boss_stomp_p2')) {
            const dir = flip ? -1 : 1;
            (P2F.offsetsX ?? [0]).forEach((dx, i) => {
              const delay = ((P2F.delayFrames?.[i] ?? 0) / P2F.fps) * 1000;
              if (delay <= 0) play('fx_boss_stomp_p2', dx * dir);
              else this.time.delayedCall(delay, () => play('fx_boss_stomp_p2', dx * dir));
            });
          } else play('fx_boss_stomp', 0);
        } else {
          this.playSheet('fx_land_dust', 18, b.x, b.y + b.radius, 56 / 112, 30 / 40, 12, 9.5);
          this.burst(b.x, b.y + b.radius * 0.5, 0x8a7a6a, 18);
        }
        Sound.play('explode');
        // 착지 후 낮게 버티는 자세 (그림: 착지 장 → 버팀 장)
        this.bossPhase = 'stompRec';
        this.bossTimer = bz.anim.stompRecover;
      }
      return true;
    }
    if (ph === 'stompRec') {
      if (this.bossTimer <= 0) toWalk();
      return true;
    }
    return false;
  }

  /** 발구르기에서 내려찍는 앞발 아래 바닥점 (boss_anim.json stomp.footImpact), 그림이 없으면 발밑 가운데 */
  private stompFoot(b: Enemy): { x: number; y: number } {
    const M = (bossAnim as { stomp?: { w: number; h: number; footImpact?: number[] } }).stomp;
    const sp = b.sprite;
    if (!M?.footImpact || !/^boss_(p2_)?stomp_/.test(sp.texture.key)) return { x: b.x, y: sp.y };
    const pt = M.footImpact;
    const lx = (sp.flipX ? M.w - pt[0] : pt[0]) - sp.originX * M.w;
    const ly = pt[1] - sp.originY * M.h;
    return { x: sp.x + lx * sp.scaleX, y: sp.y + ly * sp.scaleY };
  }

  /** 지금 이어 쓸 수 있는 콤보 공격 목록 (콤보 시간이 지났으면 없음) */
  private comboNow(): string[] {
    if (!this.comboFrom || this.elapsed > this.comboUntil) return [];
    const CB = gameData.bossBrain.combo;
    const table = this.comboTable(this.bossDef);
    return table[this.comboFrom] ?? [];
  }

  /** 보스 클로즈업 시작: 세상 시간을 멈추고 카메라가 보스로 다가가 확대, delay초 뒤부터 대사를 한 줄씩. 화면 고정 UI는 숨김 */
  private startCine(b: Enemy, keys: string[], delay: number): void {
    const cd = (this.bossDef as { cine?: CineDef } | null)?.cine;
    if (!cd || this.cine) return;
    const cam = this.cameras.main;
    // 바닥 배경·먼 배경(화면 고정 타일)은 남기고 UI만 숨긴다
    const keep = new Set<unknown>([this.bg, this.skyline]);
    const hidden = this.children.list.filter((o) => !keep.has(o) && (o as unknown as { scrollFactorX: number }).scrollFactorX === 0 && (o as unknown as { visible: boolean }).visible);
    for (const o of hidden) (o as unknown as { setVisible: (v: boolean) => void }).setVisible(false);
    const bars = [0, 1].map(() => this.add.rectangle(0, 0, 10, 10, 0x000000, 1).setOrigin(0).setScrollFactor(0).setDepth(300));
    // AI 점수 표시(머리 위 글씨)는 대사와 겹치지 않게 숨김 (연출이 끝나면 표시 코드가 다시 켬)
    this.bossDbg?.setVisible(false);
    for (const t of this.squadDbg.values()) t.setVisible(false);
    // 진행 중인 플레이어 대시 입력은 비운다
    this.controls.consumeDash();
    this.cine = { b, t: 0, dur: delay + keys.length * cd.lineTime + 0.4, delay, lines: keys, said: 0, each: cd.lineTime, zoom: cd.zoom, lift: cd.lift, hidden, bars, sx: cam.scrollX, sy: cam.scrollY };
  }

  /** 클로즈업 진행 (step 대신). 들어갈 때·나올 때 0.4초씩 확대·축소, 보스 그림은 계속 움직임 */
  private updateCine(dt: number): void {
    const c = this.cine!;
    const b = c.b;
    const def = this.bossDef;
    c.t += dt;
    this.fx.clear();
    // 2페이즈 전환 동작은 연출 중에도 재생 (전환 시간이 연출 앞부분)
    if (this.bossPhase === 'phaseShift') this.bossTimer = Math.max(0.0001, this.bossTimer - dt);
    // XM-4 2페이즈 전개도 연출 중에 재생
    const xzc = (def as { xm4?: Xm4Def } | null)?.xm4;
    const deploying = !!xzc && this.bossPhase === 'deploy';
    if (deploying && def && b.active) this.xmDeployStep(b, def, xzc, dt);
    if (def && b.active) this.animateBoss(b, def, this.bossPhase === 'phaseShift' || deploying ? dt : 0);
    // 대사하는 동안은 서 있는 자세(걷기 그림 중 두 발이 모인 장)로 플레이어를 본다. 2페이즈 전환 동작 중에는 그 동작을 보여 줌
    const cd = (def as { cine?: CineDef } | null)?.cine;
    const transforming = this.bossPhase === 'phaseShift' && this.bossTimer > 0.001;
    if (def && b.active && cd?.standFrame !== undefined && !transforming) {
      const p2Walk = this.bossPhase2 && this.textures.exists(`${def.id}_p2_walk_00`);
      const motion = p2Walk ? 'p2_walk' : 'walk';
      const key = `${def.id}_${motion}_${String(cd.standFrame).padStart(2, '0')}`;
      const M = BOSS_ANIM[def.id]?.[motion] ?? BOSS_ANIM[def.id]?.walk;
      if (M && this.textures.exists(key)) {
        const flip = this.player.x < b.x;
        b.sprite.setTexture(key).setFlipX(flip).setOrigin(flip ? 1 - M.originX : M.originX, 1);
      }
    }
    // 대사: delay초 뒤부터 lineTime마다 한 줄
    while (c.said < c.lines.length && c.t >= c.delay + c.said * c.each) {
      this.shout(b, tr(c.lines[c.said] as Parameters<typeof tr>[0]), 0, false, c.each, c.lift);
      c.said++;
    }
    this.updateShouts(dt);
    // 확대: 처음 0.4초 들어가고 마지막 0.4초 나옴
    const kin = Phaser.Math.Easing.Cubic.Out(Math.min(1, c.t / 0.4));
    const kout = Phaser.Math.Easing.Cubic.In(Math.min(1, Math.max(0, (c.dur - c.t) / 0.4)));
    const k = Math.min(kin, kout);
    const cam = this.cameras.main;
    const z = ZOOM * (1 + (c.zoom - 1) * k);
    const vw = (VIEW_W * ZOOM) / z;
    const vh = (VIEW_H * ZOOM) / z;
    const p = this.player;
    const tx = Phaser.Math.Linear(p.x, b.x, k);
    const ty = Phaser.Math.Linear(p.y, b.y - 10, k);
    cam.setZoom(z);
    cam.setScroll(tx - vw / 2, ty - vh / 2);
    // 화면 고정 배경 타일은 카메라 위치를 따라 무늬만 옮긴다 (평소 step과 같음)
    this.bg.tilePositionX = cam.scrollX;
    this.bg.tilePositionY = cam.scrollY;
    this.skyline.tilePositionX = cam.scrollX * 0.25;
    // 위아래 검은 띠 (화면 고정 그림도 확대되므로 배율로 나눠 크기를 맞춤)
    const barH = (VIEW_H * 0.11 * k * ZOOM) / z;
    c.bars[0].setPosition(0, 0).setSize(vw + 2, barH);
    c.bars[1].setPosition(0, vh - barH).setSize(vw + 2, barH + 1);
    if (c.t >= c.dur) this.endCine();
  }

  /** 클로즈업 건너뛰기: 남은 대사는 넘기고 바로 빠져나옴 */
  private skipCine(): void {
    const c = this.cine;
    if (!c) return;
    // 2페이즈 전환 동작은 끝까지 맞춰 둔다
    if (this.bossPhase === 'phaseShift') this.bossTimer = 0.0001;
    c.said = c.lines.length;
    for (const s of this.shouts) if (s.e === c.b) s.t = s.delay + s.life;
    c.t = Math.max(c.t, c.dur - 0.4);
  }

  private endCine(): void {
    const c = this.cine!;
    this.cine = null;
    // 코박 등장: 대사 뒤 남은 착지 자세는 건너뛰고 바로 걷기 (서 있다가 다시 웅크리지 않게)
    if (this.bossPhase === 'taunt') this.bossTimer = 0;
    for (const o of c.hidden) if ((o as unknown as { active: boolean }).active) (o as unknown as { setVisible: (v: boolean) => void }).setVisible(true);
    // 일시정지 메뉴용 설정 버튼 등 원래 숨어 있던 것은 그대로 (숨겼던 것만 되돌림)
    for (const r of c.bars) r.destroy();
    this.cameras.main.setZoom(ZOOM);
  }

  /** 콤보로 이어지는 공격 수 상한 (첫 공격 포함, game.json bossBrain.combo.maxChain, 없으면 2 = 한 번만 이어짐) */
  private comboMax(def: BossDef | null): number {
    const M = (gameData.bossBrain.combo as unknown as { maxChain?: Record<string, number> }).maxChain ?? {};
    const brain = String((def as { brain?: unknown } | null)?.brain ?? '');
    return M[brain] ?? 2;
  }

  /** 보스별 콤보 표 (game.json bossBrain.combo의 kovac / basili / gregor) */
  private comboTable(def: BossDef | null): Record<string, string[]> {
    const CB = gameData.bossBrain.combo as unknown as Record<string, Record<string, string[]>>;
    const brain = (def as { brain?: unknown } | null)?.brain;
    return CB[brain === 'basili' || brain === 'gregor' || brain === 'xm4' ? brain : 'kovac'] ?? {};
  }

  /** XM-4 포탑 방향(라디안), 기관총 발사 수·번갈아 쓰는 포신, 플라즈마 남은 발·다음 발까지, 지난 공격 */
  private xmAim = 0;
  private xmMgAcc = 0;
  private xmBarrel = 0;
  private xmPlasmaLeft = 0;
  private xmPlasmaNext = 0;
  private xmLast: Xm4Act = 'walk';
  /** XM-4 플라즈마 탄: 착탄점, 예고 남은 시간, 날아가는 중(포구에서 출발점), 터졌는지 */
  private plasmaShells: { x: number; y: number; t: number; fx: number; fy: number; hit: boolean; warn?: Phaser.GameObjects.Image; bolt?: Phaser.GameObjects.Image }[] = [];
  /** XM-4 그림 겹 (아래·뒷다리·앞다리·기관총 반사광). 몸통은 보스 스프라이트 */
  private xmLayers: { under: Phaser.GameObjects.Image; back: Phaser.GameObjects.Image; front: Phaser.GameObjects.Image; lit: Phaser.GameObjects.Image } | null = null;
  private xmWalkPh = 0;
  /** XM-4 몸통 동작: 포탑 상승(rise)·하강(lower)·2페이즈 전개(deploy) 재생 시간, 재생 fps, 02 방향으로 돌리는 중인지, 등장 상승·전개를 했는지 */
  private xmAnimT = 0;
  private xmAnimFps = 8;
  private xmRotating = false;
  private xmStarted = false;
  private xmDeployed = false;
  /** XM-4 등장 연출 중 (걸어 들어오기·포탑 상승, 무적) */
  private xmEntering = false;
  /** XM-4 점프 방향이 왼쪽인지 (하체·뚜껑 닫힌 몸통 반전), 점프 착지 뒤 포탑 상승 중인지 */
  private xmJumpFlip = true;
  private xmJumpRise = false;
  private xmFlashT = 0;
  private xmCasingRow = 0;
  /** XM-4 피격 흔들림 남은 시간 */
  private xmHitT = 0;
  /** 개발자 도구: 보스 무적 */
  private bossGod = false;

  /** 그레고르 컨테이너: 떨어질 자리, 남은 시간, 이미 떨어졌는지 */
  private containers: { x: number; y: number; t: number; hit: boolean }[] = [];

  /** 컨테이너 낙하 진행: 바닥 그림자(예고) → 위에서 떨어져 반경 안 피해 + 먼지·흔들림 */
  private updateContainers(b: Enemy, gz: GregorDef, dt: number): void {
    const D = gz.drop;
    const p = this.player;
    for (const c of this.containers) {
      c.t -= dt;
      if (c.t > 0) {
        const k = Phaser.Math.Clamp(1 - c.t / D.warn, 0, 1);
        // 그림자: 떨어질수록 진해지고 커짐
        this.fx.fillStyle(0x000000, 0.25 + 0.35 * k).fillEllipse(c.x, c.y, D.radius * 2 * (0.4 + 0.6 * k), D.radius * 1.2 * (0.4 + 0.6 * k));
        this.fx.lineStyle(1.5, 0xff2a3a, MARK_A * (0.4 + 0.4 * k)).strokeEllipse(c.x, c.y, D.radius * 2, D.radius * 1.2);
        // 마지막 0.3초: 위에서 컨테이너가 내려옴 (임시 도형)
        if (c.t < 0.3) {
          const h = (c.t / 0.3) * D.height;
          this.fx.fillStyle(0x5a6270, 1).fillRect(c.x - D.radius * 0.8, c.y - h - D.radius * 1.1, D.radius * 1.6, D.radius * 1.1);
          this.fx.lineStyle(2, 0xff8a1f, 1).strokeRect(c.x - D.radius * 0.8, c.y - h - D.radius * 1.1, D.radius * 1.6, D.radius * 1.1);
        }
      } else if (!c.hit) {
        c.hit = true;
        const nx = (p.x - c.x) / D.radius;
        const ny = (p.y - c.y) / (D.radius * 0.6);
        if (p.invuln <= 0 && nx * nx + ny * ny <= 1) this.hurtPlayer(D.damage, { kind: 'boss', id: b.id });
        this.playSheet('fx_land_dust', 18, c.x, c.y + 4, 56 / 112, 30 / 40, 14, 9.5);
        this.shake(140, 0.01);
        Sound.play('explode');
      }
    }
    this.containers = this.containers.filter((c) => c.t > -0.05 || !c.hit);
  }

  /** XM-4 그림 정보 (boss2_anim.json). 그림이 없으면 null (임시 도형) */
  private xmArt(): typeof boss2Anim | null {
    return this.textures.exists('boss2_under_00') && this.textures.exists('boss2_p1_turret_00') ? boss2Anim : null;
  }

  /** XM-4 포탑 방향 번호 0~15 (0 = 화면 오른쪽, 시계 방향 22.5도. 3/4 시점이라 세로를 0.55로 눌린 것으로 보고 계산) */
  private xmDir(): number {
    const a = Math.atan2(Math.sin(this.xmAim) / 0.55, Math.cos(this.xmAim));
    return (((Math.round(a / (Math.PI / 8)) % 16) + 16) % 16);
  }

  /** XM-4 발 위치 (월드 y): 판정 원 중심 + footOff - 점프 높이. 그리는 위치와 같은 식이라 업데이트 도중에도 맞음 */
  private xmFoot(b: Enemy): number {
    const def = this.bossDef as { xm4?: Xm4Def; slam?: SlamDef } | null;
    const sl = def?.slam;
    const lift = this.bossPhase === 'air' && sl ? Math.sin(Phaser.Math.Clamp(1 - this.bossTimer / sl.air, 0, 1) * Math.PI) * sl.height : 0;
    return b.y + (def?.xm4?.footOff ?? 0) - lift;
  }

  /** XM-4 몸통 겹 왼쪽 위 (월드). 다리 캔버스 원점(발 가운데)이 발 위치, 몸통은 걷기 프레임마다 bodyOffset만큼 */
  private xmBodyTL(b: Enemy): { x: number; y: number } {
    const A = boss2Anim;
    const f = Math.floor(this.xmWalkPh) % A.walk.frames;
    const off = A.walk.bodyOffset[f];
    const foot = this.xmFoot(b);
    return { x: b.x - A.origin.legsCanvas[0] + off[0], y: foot - A.origin.legsCanvas[1] + off[1] };
  }

  /** XM-4 포구·포드 위치 (월드)와 몸통 뒤에 가려지는지. 그림이 없으면 몸 위 가운데에서 포탑 방향으로 */
  private xmPoint(b: Enemy, kind: 'cannon' | 'mg' | 'pod', side: number): { x: number; y: number; hidden: boolean } {
    const art = this.xmArt();
    if (!art) {
      const c = Math.cos(this.xmAim);
      const sn = Math.sin(this.xmAim);
      const g = side ? 4 : -4;
      return { x: b.x + c * b.radius * 0.9 - sn * g, y: b.y - b.radius * 0.7 + sn * b.radius * 0.6 + c * g, hidden: false };
    }
    const tl = this.xmBodyTL(b);
    const dirs = art.anchors.dirs as unknown as Record<string, Record<string, Record<string, unknown>>>;
    const D = dirs[this.xmDeployed ? 'p2' : 'p1'][String(this.xmDir()).padStart(2, '0')] as { cannon: number[][]; cannonHidden: boolean; mg?: number[][]; pod?: number[] | null; podHidden?: boolean };
    let pt: number[] | null | undefined;
    let hidden = false;
    if (kind === 'cannon') {
      pt = D.cannon[side];
      hidden = D.cannonHidden;
    } else if (kind === 'mg') pt = D.mg?.[side];
    else {
      pt = D.pod;
      hidden = !!D.podHidden;
    }
    // 포드 점이 없는 방향: 포탑 가운데
    if (!pt) pt = [72, 30];
    return { x: tl.x + pt[0], y: tl.y + pt[1], hidden };
  }

  /** 방향 시트 한 번 재생: 열 = dir, 행 = 프레임 (row*cols + dir) */
  private playDirSheet(key: string, dir: number, rows: number, cols: number, x: number, y: number, ox: number, oy: number, fps: number, depth: number, flip = false): void {
    if (!this.textures.exists(key)) return;
    const img = this.add.image(x, y, key, String(dir)).setOrigin(ox, oy).setDepth(depth).setFlipX(flip);
    const t0 = this.elapsed;
    const tick = () => {
      const f = Math.floor((this.elapsed - t0) * fps);
      if (f >= rows || !img.active) {
        this.events.off('update', tick);
        img.destroy();
        return;
      }
      img.setFrame(String(f * cols + dir));
    };
    this.events.on('update', tick);
  }

  /** XM-4 그림 겹 쌓기: 아래 → 뒷다리 → 몸통(보스 스프라이트) → 반사광 → 앞다리. 그림이 없으면 false */
  private animateXm4(b: Enemy, def: BossDef, dt: number): boolean {
    const art = this.xmArt();
    const xz = (def as { xm4?: Xm4Def }).xm4;
    if (!art || !xz) return false;
    const ph = this.bossPhase;
    const A = art.walk;
    if (ph === 'walk' || ph === 'walkIn') this.xmWalkPh = (this.xmWalkPh + dt * A.fps * (ph === 'walkIn' ? Math.min(2.5, xz.walkInSpeed / Math.max(1, b.speed)) : 1)) % A.frames;
    const f = Math.floor(this.xmWalkPh) % A.frames;
    const nn = String(f).padStart(2, '0');
    // 점프 낙하: 공중 포물선
    // 피격 흔들림: 맞은 직후 겹 전체를 몇 px 흔듦
    let sx = 0;
    let sy = 0;
    if (this.xmHitT > 0) {
      this.xmHitT -= dt;
      if (!Settings.reducedFx) {
        sx = Math.round((Math.random() - 0.5) * 2 * xz.hitShake);
        sy = Math.round((Math.random() - 0.5) * xz.hitShake);
      }
    }
    const foot = this.xmFoot(b) + sy;
    const bx = b.x + sx;
    if (!this.xmLayers) {
      const mk = (depth: number) => this.add.image(0, 0, 'boss2_under_00').setDepth(depth);
      this.xmLayers = { under: mk(11.96), back: mk(11.97), front: mk(12.02), lit: mk(12.01).setVisible(false) };
    }
    const L = this.xmLayers;
    // 하체: 늘 왼쪽을 봄(좌우 반전). 점프 중(내리기·도약·공중·착지·다시 올리기)엔 뛰는 방향
    // 몸통: 등장 중, 1페이즈 점프의 뚜껑 닫힌·상승 그림은 하체와 같이 반전. 포탑 방향 그림은 반전하지 않음 (방향 그림이 따로 있음)
    const entering = ph === 'walkIn' || (ph === 'rise' && this.xmEntering);
    const jumping = ph === 'lower' || ph === 'leap' || ph === 'air' || ph === 'slam' || (ph === 'rise' && this.xmJumpRise);
    const legFlip = entering ? true : jumping ? this.xmJumpFlip : true;
    const ox0 = art.origin.legsCanvas[0] / art.canvas.legs[0];
    const ox = legFlip ? 1 - ox0 : ox0;
    const oy = art.origin.legsCanvas[1] / art.canvas.legs[1];
    L.under.setTexture(`boss2_under_${nn}`).setOrigin(ox, oy).setFlipX(legFlip).setPosition(bx, foot).setVisible(true);
    L.back.setTexture(`boss2_legs_back_${nn}`).setOrigin(ox, oy).setFlipX(legFlip).setPosition(bx, foot).setVisible(true);
    L.front.setTexture(`boss2_legs_front_${nn}`).setOrigin(ox, oy).setFlipX(legFlip).setPosition(bx, foot).setVisible(true);
    // 몸통: 포탑 상승·하강(1페이즈 점프 앞뒤, 등장)·2페이즈 전개 동작, 1페이즈 점프 중엔 뚜껑 닫힘, 그 밖엔 포탑 방향 그림
    const dir = String(this.xmDir()).padStart(2, '0');
    const RN = art.turretRise.frames;
    const fr = Math.min(RN - 1, Math.floor(this.xmAnimT * this.xmAnimFps));
    const nn2 = (i: number) => String(i).padStart(2, '0');
    const p2Body = this.bossPhase2 && this.xmDeployed;
    let body = `boss2_${p2Body ? 'p2' : 'p1'}_turret_${dir}`;
    let closed = false;
    if (ph === 'walkIn') body = 'boss2_body_closed';
    else if (ph === 'rise') body = `boss2_rise_${nn2(fr)}`;
    else if (ph === 'lower') body = this.xmRotating ? body : `boss2_rise_${nn2(RN - 1 - fr)}`;
    else if (ph === 'deploy') body = this.xmRotating ? `boss2_p1_turret_${dir}` : `boss2_deploy_${nn2(Math.min(art.phase2Transition.frames - 1, fr))}`;
    else if ((ph === 'leap' || ph === 'air' || ph === 'slam') && !p2Body) {
      body = 'boss2_body_closed';
      closed = true;
    }
    if (!this.textures.exists(body)) body = `boss2_${p2Body ? 'p2' : 'p1'}_turret_${dir}`;
    const off = A.bodyOffset[f];
    const [bw, bh] = art.canvas.body;
    // 몸통 원점 = 다리 원점 - bodyOffset (몸통 왼쪽 위가 다리 왼쪽 위 + offset에 오게)
    // 몸통 반전: 등장 중이거나, 점프 중 그림이 뚜껑 닫힘·상승·하강(02 방향 그림)일 때
    const motionBody = body === 'boss2_body_closed' || body.startsWith('boss2_rise_');
    const flip = entering || (jumping && motionBody && this.xmJumpFlip);
    const box0 = (art.origin.legsCanvas[0] - off[0]) / bw;
    const box = flip ? 1 - box0 : box0;
    const boy = (art.origin.legsCanvas[1] - off[1]) / bh;
    if (b.sprite.texture.key !== body) b.sprite.setTexture(body);
    b.sprite.setOrigin(box, boy).setPosition(bx, foot).setFlipX(flip).setScale(1);
    b.footOff = xz.footOff;
    // 기관총 반사광: 섬광 0~1프레임 = 1행(강), 2프레임 = 2행(약), 2페이즈 몸통 위에만
    if (this.xmFlashT > 0 && p2Body && !closed && this.textures.exists('fx_boss2_mg_lit')) {
      const row = this.xmFlashT > 1 / 30 ? 0 : 1;
      L.lit.setTexture('fx_boss2_mg_lit', String(row * 16 + this.xmDir())).setOrigin(box, boy).setPosition(bx, foot).setVisible(true);
    } else L.lit.setVisible(false);
    // 피격 번쩍임 등 몸통 색을 다리에도
    const tint = b.sprite.isTinted ? b.sprite.tintTopLeft : null;
    for (const o of [L.under, L.back, L.front]) {
      if (tint !== null) o.setTint(tint);
      else o.clearTint();
      o.setAlpha(b.sprite.alpha);
    }
    return true;
  }

  /** XM-4 그림 겹 숨기기 (보스가 죽거나 사라질 때) */
  private hideXm4Layers(): void {
    if (!this.xmLayers) return;
    for (const o of Object.values(this.xmLayers)) o.setVisible(false);
  }

  /** XM-4 플라즈마 탄: 예고 원 → 쌍열포 섬광 → 직선으로 아주 빠르게 → 광역 폭발 */
  private updatePlasma(b: Enemy, xz: Xm4Def, dt: number): void {
    const P = xz.plasma;
    const p = this.player;
    const art = !!this.xmArt();
    for (const s of this.plasmaShells) {
      const was = s.t;
      s.t -= dt;
      if (s.t > 0) {
        if (art && this.textures.exists('fx_boss2_plasma_warn')) {
          if (!s.warn) s.warn = this.add.image(s.x, s.y, 'fx_boss2_plasma_warn', '0').setOrigin(0.5, 0.5).setDepth(9.5);
          s.warn.setFrame(String(Math.floor(this.elapsed * 12) % 8));
        } else {
          const warn = this.bossPhase2 ? xz.p2.plasmaWarn : P.warn;
          const k = Phaser.Math.Clamp(1 - s.t / warn, 0, 1);
          this.fx.lineStyle(1.5, 0x40f0ff, MARK_A * (0.5 + 0.4 * Math.sin(this.elapsed * 30))).strokeEllipse(s.x, s.y, P.radius * 2, P.radiusY * 2);
          this.fx.fillStyle(0x40f0ff, MARK_A * 0.25 * k).fillEllipse(s.x, s.y, P.radius * 2 * k, P.radiusY * 2 * k);
        }
      } else if (s.t > -P.fly) {
        if (was > 0) {
          // 발사 순간: 쌍열포 A/B 번갈아 섬광, 그 포구에서 출발
          this.xmBarrel = 1 - this.xmBarrel;
          const mz = this.xmPoint(b, 'cannon', this.xmBarrel);
          s.fx = mz.x;
          s.fy = mz.y;
          this.playDirSheet('fx_boss2_cannon_flash', this.xmDir(), 3, 16, mz.x, mz.y, 0.5, 0.5, 30, mz.hidden ? 11.98 : 12.05);
          this.shake(60, 0.004);
          Sound.play('enemyshot');
        }
        const k = Phaser.Math.Clamp(-s.t / P.fly, 0, 1);
        const x = Phaser.Math.Linear(s.fx, s.x, k);
        const y = Phaser.Math.Linear(s.fy, s.y, k);
        if (art && this.textures.exists('fx_boss2_plasma_bolt')) {
          const a = Math.atan2(s.y - s.fy, s.x - s.fx);
          const dir = (((Math.round(a / (Math.PI / 8)) % 16) + 16) % 16);
          if (!s.bolt) s.bolt = this.add.image(x, y, 'fx_boss2_plasma_bolt', String(dir)).setOrigin(0.5, 0.5).setDepth(16);
          s.bolt.setPosition(x, y).setFrame(String((Math.floor(this.elapsed * 30) % 3) * 16 + dir));
        } else {
          const bx = Phaser.Math.Linear(s.fx, s.x, Math.max(0, k - 0.35));
          const by = Phaser.Math.Linear(s.fy, s.y, Math.max(0, k - 0.35));
          this.fx.lineStyle(6, 0x40f0ff, 0.5).lineBetween(bx, by, x, y);
          this.fx.lineStyle(2, 0xe0ffff, 1).lineBetween(bx, by, x, y);
        }
      } else if (!s.hit) {
        s.hit = true;
        s.warn?.destroy();
        s.bolt?.destroy();
        const nx = (p.x - s.x) / P.radius;
        const ny = (p.y - s.y) / P.radiusY;
        if (p.invuln <= 0 && nx * nx + ny * ny <= 1) this.hurtPlayer(P.damage, { kind: 'blast', id: b.id });
        if (art && this.textures.exists('fx_boss2_plasma_boom')) this.playSheet('fx_boss2_plasma_boom', 52, s.x, s.y, 112 / 224, 100 / 200, 30, 15);
        else {
          this.burst(s.x, s.y, 0x40f0ff, 16);
          const ring = this.add.ellipse(s.x, s.y, P.radius * 2, P.radiusY * 2).setStrokeStyle(3, 0x40f0ff, 0.9).setDepth(11);
          ring.setScale(0.3);
          this.tweens.add({ targets: ring, scale: 1.2, alpha: 0, duration: 300, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
        }
        this.shake(120, 0.008);
        Sound.play('explode');
      }
    }
    this.plasmaShells = this.plasmaShells.filter((s) => !s.hit);
  }

  /** 플라즈마 탄 정리 (보스 죽음·장면 시작) */
  private clearPlasma(): void {
    for (const s of this.plasmaShells) {
      s.warn?.destroy();
      s.bolt?.destroy();
    }
    this.plasmaShells = [];
  }

  /** XM-4 2페이즈 전개 진행: 포탑을 02로 돌린 뒤 전개 프레임, 끝나면 기관총·미사일 사용 가능. 클로즈업 중에도 이걸로 진행 */
  private xmDeployStep(b: Enemy, def: BossDef, xz: Xm4Def, dt: number): void {
    const art = this.xmArt();
    const a02 = Math.atan2(Math.sin(Math.PI / 4) * 0.55, Math.cos(Math.PI / 4));
    if (this.xmRotating) {
      this.xmAim = Phaser.Math.Angle.RotateTo(this.xmAim, a02, Phaser.Math.DegToRad(xz.rotateTurn) * dt);
      if (Math.abs(Phaser.Math.Angle.Wrap(this.xmAim - a02)) < 0.01) this.xmRotating = false;
      return;
    }
    this.xmAim = a02;
    this.xmAnimT += dt;
    if (!art || this.xmAnimT >= art.phase2Transition.frames / this.xmAnimFps) {
      this.xmDeployed = true;
      this.bossPulse(b);
      this.bossLastAttack = this.elapsed;
      this.bossPhase = 'walk';
      this.bossTimer = def.walkTime;
    }
  }

  /** XM-4 전용 단계: 걷기 판단·기관총·플라즈마 포격·미사일. 점프 낙하(leap·air·slam)는 false로 공통 코드에 맡김 */
  private updateXm4(b: Enemy, def: BossDef, xz: Xm4Def, dt: number, dx: number, dy: number, d: number): boolean {
    const ph = this.bossPhase;
    const p = this.player;
    const p2 = this.bossPhase2;
    const slow = this.odSlowMul;
    const toWalk = () => {
      this.bossPhase = 'walk';
      this.bossTimer = def.walkTime;
    };
    if (this.xmFlashT > 0) this.xmFlashT -= dt;
    // 포탑: 늘 플레이어 쪽으로 천천히 돈다 (포탑 기준점에서 플레이어까지 화면 각도)
    const tc = this.xmArt() ? { x: b.x, y: this.xmFoot(b) - 90 } : { x: b.x, y: b.y - b.radius * 0.7 };
    // 포탑 02 방향(오른쪽 아래)의 화면 각도: 상승·하강·전개 그림은 이 방향에서만
    const a02 = Math.atan2(Math.sin(Math.PI / 4) * 0.55, Math.cos(Math.PI / 4));
    // (2페이즈 전개는 xmDeployStep이 포탑을 돌림)
    const bodyBusy = ph === 'rise' || ph === 'lower' || ((ph === 'leap' || ph === 'air' || ph === 'slam') && !this.xmDeployed);
    // 반전된 동작(왼쪽으로 점프·등장)은 02 그림을 뒤집어 쓰므로 포탑을 06(왼쪽 아래)으로 맞춤
    const aRise = this.xmEntering || this.xmJumpFlip ? Math.PI - a02 : a02;
    if (bodyBusy) {
      if (this.xmRotating) {
        this.xmAim = Phaser.Math.Angle.RotateTo(this.xmAim, aRise, Phaser.Math.DegToRad(xz.rotateTurn) * dt);
        if (Math.abs(Phaser.Math.Angle.Wrap(this.xmAim - aRise)) < 0.01) this.xmRotating = false;
      } else this.xmAim = aRise;
    } else if (ph !== 'deploy') this.xmAim = Phaser.Math.Angle.RotateTo(this.xmAim, Math.atan2(p.y - tc.y, p.x - tc.x), Phaser.Math.DegToRad(xz.turn) * dt);
    const art = this.xmArt();
    const RF = art ? art.turretRise.frames : 1;
    // 등장: 대사 뒤 제자리까지 걸어와서 포탑 상승
    if (ph === 'walkIn') {
      b.x = Math.max(this.walkInTo, b.x - xz.walkInSpeed * dt);
      if (b.x <= this.walkInTo) {
        this.bossPhase = 'rise';
        this.xmAnimT = 0;
        this.xmAnimFps = xz.riseFps;
        this.xmRotating = false;
      }
      return true;
    }
    // (그림이 없을 때 등): 뚜껑 닫힌 채 나타나 포탑을 올림
    if (!this.xmStarted) {
      this.xmStarted = true;
      if (art) {
        this.bossPhase = 'rise';
        this.xmAnimT = 0;
        this.xmAnimFps = xz.riseFps;
        this.xmRotating = false;
        return true;
      }
    }
    // 2페이즈: 하던 공격(점프 제외)을 끊고 포탑을 02로 돌린 뒤 기관총·미사일 포드 전개
    if (p2 && !this.xmDeployed && (ph === 'walk' || ph === 'mgAim' || ph === 'mg' || ph === 'plasma' || ph === 'missileFire')) {
      if (art) {
        this.bossPhase = 'deploy';
        this.xmAnimT = 0;
        this.xmAnimFps = xz.riseFps;
        this.xmRotating = true;
        this.xmPlasmaLeft = 0;
        // 컷신: 전개 동작(포탑 돌리기 + 전개 프레임)을 확대해 보여 준 뒤 대사
        const cd = (def as { cine?: CineDef }).cine;
        if (cd?.p2) {
          const turnT = Math.abs(Phaser.Math.Angle.Wrap(this.xmAim - a02)) / Phaser.Math.DegToRad(xz.rotateTurn);
          this.startCine(b, cd.p2, turnT + art.phase2Transition.frames / xz.riseFps + 0.2);
        }
        return true;
      }
      this.xmDeployed = true;
    }
    if (ph === 'deploy') {
      this.xmDeployStep(b, def, xz, dt);
      return true;
    }
    if (ph === 'rise' || ph === 'lower') {
      if (!this.xmRotating) this.xmAnimT += dt;
      const n = RF;
      if (!this.xmRotating && this.xmAnimT >= n / this.xmAnimFps) {
        if (ph === 'lower') {
          // 뚜껑 닫힘 → 점프 (착지점은 지금 플레이어 자리)
          const sl = (def as { slam?: SlamDef }).slam!;
          this.bossPhase = 'leap';
          this.bossTimer = sl.leap;
          this.bossFrom = { x: b.x, y: b.y };
          this.bossTo = { x: (this.untrackedElite ? this.decoy : p).x, y: (this.untrackedElite ? this.decoy : p).y };
        } else {
          this.bossLastAttack = this.elapsed;
          // 등장 상승은 반전(왼쪽 아래 = 06 방향)으로 끝났으므로 포탑 방향을 거기에 맞춰 이어 감
          if (this.xmEntering || (this.xmJumpRise && this.xmJumpFlip)) this.xmAim = Math.PI - Math.atan2(Math.sin(Math.PI / 4) * 0.55, Math.cos(Math.PI / 4));
          this.xmJumpRise = false;
          this.xmEntering = false;
          toWalk();
        }
      }
      return true;
    }
    // 1페이즈 점프 착지 뒤: 포탑을 다시 올림 (빠르게)
    if (ph === 'slam' && this.bossTimer <= 0 && art && !this.xmDeployed) {
      this.xmJumpRise = true;
      this.bossPhase = 'rise';
      this.xmAnimT = 0;
      this.xmAnimFps = xz.quickFps;
      return true;
    }
    if (!this.xmArt()) {
      // 그림이 없을 때 임시 포탑 표시
      const m0 = this.xmPoint(b, 'cannon', 0);
      this.fx.lineStyle(4, 0x2a2f38, 1).lineBetween(b.x, b.y - b.radius * 0.7, m0.x, m0.y);
      this.fx.lineStyle(1.5, 0xff8a1f, 0.9).lineBetween(b.x, b.y - b.radius * 0.7, m0.x, m0.y);
    }
    if (ph === 'walk') {
      b.x += (dx / d) * b.speed * slow * dt;
      b.y += (dy / d) * b.speed * slow * dt;
      if ((this.bossThinkT -= dt) <= 0) {
        this.bossThinkT = gameData.bossBrain.think;
        this.bossSummoned = this.bossSummoned.filter((e) => e.active && e.id === def.summon);
        const { act, scores } = pickXm4({
          d,
          playerHp: Math.max(0, p.hp) / p.maxHp,
          moving: Phaser.Math.Clamp(Math.hypot(this.bossPVel.x, this.bossPVel.y) / PLAYER.speed, 0, 1),
          fleeing: Phaser.Math.Clamp((this.bossPVel.x * dx + this.bossPVel.y * dy) / d / PLAYER.speed, 0, 1),
          dashSpent: p.dashCd > 0,
          sinceAttack: this.elapsed - this.bossLastAttack,
          sinceSummon: this.elapsed - this.bossLastSummon,
          minions: Phaser.Math.Clamp(this.bossSummoned.length / Math.max(1, def.summonCount), 0, 1),
          p2,
          last: this.xmLast,
          current: this.bossAct as Xm4Act,
          combo: this.comboNow(),
        });
        this.bossScores = scores as Partial<Record<BossAct, number>>;
        if (act === 'summon') {
          this.bossLastSummon = this.elapsed;
          this.bossSummon = 0;
          // 소환도 콤보에 섞임: 동작이 없으니 바로 다음 콤보를 연다 (최대 maxChain까지)
          const viaCombo = this.comboNow().includes('summon');
          this.comboCount = viaCombo ? this.comboCount + 1 : 1;
          this.xmLast = 'summon';
          this.bossLastKind = 'summon';
          const table = this.comboTable(def);
          if (this.comboCount < this.comboMax(def) && table.summon) {
            this.comboFrom = 'summon';
            this.comboUntil = this.elapsed + gameData.bossBrain.combo.window + 0.3;
            this.bossThinkT = 0.3;
          } else this.comboFrom = '';
        } else if (act !== 'walk') {
          this.comboCount = this.comboNow().includes(act) ? this.comboCount + 1 : 1;
          this.comboFrom = '';
          this.bossLastAttack = this.elapsed;
          this.bossLastKind = act;
          this.xmLast = act;
          this.bossDir = { x: dx / d, y: dy / d };
          if (act === 'mg') {
            this.bossPhase = 'mgAim';
            this.bossTimer = xz.mg.aim;
            Sound.play('lungewarn');
          } else if (act === 'plasma') {
            this.bossPhase = 'plasma';
            this.xmPlasmaLeft = p2 ? xz.p2.plasmaShots : xz.plasma.shots;
            this.xmPlasmaNext = 0;
            this.bossTimer = 99;
          } else if (act === 'missile') {
            // 공통 미사일 발사 코드에 맡김 (다음 프레임에 포드에서 발사)
            this.bossMissile = 0;
            this.bossPhase = 'missileFire';
            this.bossTimer = xz.missileTime;
          } else if (act === 'jump') {
            this.xmJumpFlip = (this.untrackedElite ? this.decoy : p).x < b.x;
            if (art && !this.xmDeployed) {
              // 1페이즈: 포탑을 02로 돌리고 내려 뚜껑을 닫은 뒤 점프 (빠르게)
              this.bossPhase = 'lower';
              this.xmAnimT = 0;
              this.xmAnimFps = xz.quickFps;
              this.xmRotating = true;
            } else {
              // 2페이즈: 포탑을 올린 채 점프
              const sl = (def as { slam?: SlamDef }).slam!;
              this.bossPhase = 'leap';
              this.bossTimer = sl.leap;
              this.bossFrom = { x: b.x, y: b.y };
              this.bossTo = { x: (this.untrackedElite ? this.decoy : p).x, y: (this.untrackedElite ? this.decoy : p).y };
            }
          }
        }
      }
      return true;
    }
    if (ph === 'mgAim') {
      const m = this.xmPoint(b, 'mg', 0);
      this.fx.lineStyle(1.5, 0xff2a3a, MARK_A * (0.4 + Math.sin(this.elapsed * 40) * 0.3)).lineBetween(m.x, m.y, m.x + Math.cos(this.xmAim) * 260, m.y + Math.sin(this.xmAim) * 260);
      if (this.bossTimer <= 0) {
        this.bossPhase = 'mg';
        this.bossTimer = xz.mg.burst * xz.mg.interval;
        this.xmMgAcc = 0;
      }
      return true;
    }
    if (ph === 'mg') {
      const M = xz.mg;
      const due = Math.min(M.burst, Math.floor((M.burst * M.interval - this.bossTimer) / M.interval) + 1);
      while (this.xmMgAcc < due) {
        this.xmMgAcc++;
        // 총구 A/B 번갈아, 부채꼴로 흔들며. 한 발 = 섬광 3프레임 + 반사광 + 탄피 1개
        this.xmBarrel = 1 - this.xmBarrel;
        const mz = this.xmPoint(b, 'mg', this.xmBarrel);
        const a = this.xmAim + Math.sin(this.elapsed * 11) * Phaser.Math.DegToRad(M.fan / 2) + (Math.random() - 0.5) * 0.05;
        this.eShot(b.id).fire(mz.x, mz.y, a, M.speed, M.damage, M.life);
        const dir = this.xmDir();
        if (this.textures.exists('fx_boss2_mg_flash')) {
          this.playDirSheet('fx_boss2_mg_flash', dir, 3, 16, mz.x, mz.y, 0.5, 0.5, 30, 12.05);
          this.xmFlashT = 3 / 30;
          // 탄피: 시작점을 두 총구 가운데에, 포탑이 왼쪽(05~11)을 보면 좌우 반전
          const F = boss2Anim.fx.fx_boss2_casing;
          const ma = this.xmPoint(b, 'mg', 0);
          const mb = this.xmPoint(b, 'mg', 1);
          const flip = dir >= 5 && dir <= 11;
          this.xmCasingRow = (this.xmCasingRow + 1) % 3;
          this.playSheet('fx_boss2_casing', 34, (ma.x + mb.x) / 2, (ma.y + mb.y) / 2, (flip ? F.cell[0] - F.start[0] : F.start[0]) / F.cell[0], F.start[1] / F.cell[1], F.fps, 12.04, flip, 1, this.xmCasingRow * 34);
        } else this.fx.fillStyle(0xfff23a, 0.9).fillCircle(mz.x, mz.y, 3);
        if (Math.random() < 0.5) Sound.play('enemyshot');
      }
      if (this.bossTimer <= 0) toWalk();
      return true;
    }
    if (ph === 'plasma') {
      const P = xz.plasma;
      if ((this.xmPlasmaNext -= dt) <= 0 && this.xmPlasmaLeft > 0) {
        // 착탄점: 첫 발은 플레이어 자리, 다음 발은 플레이어가 움직이는 쪽으로 조금 앞
        const n = (p2 ? xz.p2.plasmaShots : P.shots) - this.xmPlasmaLeft;
        const v = Math.hypot(this.bossPVel.x, this.bossPVel.y) || 1;
        const lead = n > 0 ? P.spreadNext : 0;
        const tgx = p.x + (this.bossPVel.x / v) * lead * Math.min(1, v / PLAYER.speed);
        const tgy = p.y + (this.bossPVel.y / v) * lead * Math.min(1, v / PLAYER.speed);
        this.plasmaShells.push({ x: tgx, y: tgy, t: p2 ? xz.p2.plasmaWarn : P.warn, fx: b.x, fy: b.y, hit: false });
        this.xmPlasmaLeft--;
        this.xmPlasmaNext = P.gap;
        Sound.play('lungewarn');
      }
      // 마지막 발 예고를 놓은 뒤 잠깐 있다가 걷기 (예고·발사는 계속 진행)
      if (this.xmPlasmaLeft <= 0 && this.xmPlasmaNext <= 0) toWalk();
      return true;
    }
    if (ph === 'missileFire') {
      if (this.bossTimer <= 0) toWalk();
      return true;
    }
    return false;
  }

  /** 그레고르 전용 단계: 걷기 판단·컨테이너 낙하·팔 훑기. 조준·돌진은 false로 공통 코드에 맡김 */
  private updateGregor(b: Enemy, def: BossDef, gz: GregorDef, dt: number, dx: number, dy: number, d: number, rage: number): boolean {
    const ph = this.bossPhase;
    const p = this.player;
    const slow = this.odSlowMul;
    const toWalk = () => {
      this.bossPhase = 'walk';
      this.bossTimer = def.walkTime;
    };
    if (ph === 'walk') {
      b.x += (dx / d) * b.speed * rage * slow * dt;
      b.y += (dy / d) * b.speed * rage * slow * dt;
      if ((this.bossThinkT -= dt) <= 0) {
        this.bossThinkT = gameData.bossBrain.think;
        this.bossSummoned = this.bossSummoned.filter((e) => e.active && e.id === def.summon);
        const { act, scores } = pickGregor({
          d,
          playerHp: Math.max(0, p.hp) / p.maxHp,
          moving: Phaser.Math.Clamp(Math.hypot(this.bossPVel.x, this.bossPVel.y) / PLAYER.speed, 0, 1),
          fleeing: Phaser.Math.Clamp((this.bossPVel.x * dx + this.bossPVel.y * dy) / d / PLAYER.speed, 0, 1),
          dashSpent: p.dashCd > 0,
          sinceAttack: this.elapsed - this.bossLastAttack,
          sinceSummon: this.elapsed - this.bossLastSummon,
          minions: Phaser.Math.Clamp(this.bossSummoned.length / Math.max(1, def.summonCount), 0, 1),
          p2: this.bossEnraged,
          current: this.bossAct as GregorAct,
          combo: this.comboNow(),
        });
        this.bossScores = scores as Partial<Record<BossAct, number>>;
        if (act === 'summon') {
          this.bossLastSummon = this.elapsed;
          this.bossSummon = 0;
        } else if (act !== 'walk') {
          this.comboCount = this.comboNow().includes(act) ? this.comboCount + 1 : 1;
          this.comboFrom = '';
          this.bossLastAttack = this.elapsed;
          this.bossLastKind = act;
          this.bossDir = { x: dx / d, y: dy / d };
          if (act === 'charge') {
            this.bossPhase = 'aim';
            this.bossTimer = def.aimTime / rage;
            this.bossCharges = 1;
          } else if (act === 'sweep') {
            this.bossPhase = 'sweepAim';
            this.bossTimer = gz.sweep.aim / rage;
            Sound.play('lungewarn');
          } else if (act === 'drop') {
            // 컨테이너: 하나는 플레이어 자리, 나머지는 주변에 흩어서, 조금씩 시차를 두고
            const n = this.bossEnraged ? gz.drop.countRage : gz.drop.count;
            for (let i = 0; i < n; i++) {
              const a = Math.random() * Math.PI * 2;
              const r = i === 0 ? 0 : gz.drop.spread * (0.4 + 0.6 * Math.random());
              this.containers.push({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r * 0.7, t: gz.drop.warn / rage + i * gz.drop.stagger, hit: false });
            }
            this.bossPhase = 'drop';
            this.bossTimer = 0.6;
            this.bossPulse(b);
            Sound.play('bosswarn');
          }
        }
      }
      return true;
    }
    if (ph === 'drop') {
      // 손짓(조준 그림)으로 크레인을 부르는 짧은 동작
      if (this.bossTimer <= 0) toWalk();
      return true;
    }
    if (ph === 'sweepAim' || ph === 'sweep') {
      const S = gz.sweep;
      const a0 = Math.atan2(this.bossDir.y, this.bossDir.x);
      const half = Phaser.Math.DegToRad(S.angle / 2);
      if (ph === 'sweepAim') {
        // 예고: 부채꼴 범위 (차오름)
        const k = Phaser.Math.Clamp(1 - this.bossTimer / (S.aim / rage), 0, 1);
        this.fx.fillStyle(0xff2a3a, MARK_A * (0.1 + 0.2 * k)).slice(b.x, b.y, S.range, a0 - half, a0 + half, false).fillPath();
        this.fx.lineStyle(2, 0xff2a3a, MARK_A * (0.5 + Math.sin(this.elapsed * 30) * 0.3)).slice(b.x, b.y, S.range, a0 - half, a0 + half, false).strokePath();
        if (this.bossTimer <= 0) {
          this.bossPhase = 'sweep';
          this.bossTimer = S.swing;
          Sound.play('slash');
          // 판정: 부채꼴 안이면 피해 + 밀려남, 아니면 빗나감(콤보: 컨테이너 낙하로 이어짐)
          const px = p.x - b.x;
          const py = p.y - b.y;
          const pd = Math.hypot(px, py);
          const diff = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(py, px) - a0));
          if (pd <= S.range + p.radius && diff <= half && p.invuln <= 0 && !p.dashing) {
            this.hurtPlayer(S.damage, { kind: 'boss', id: b.id });
            p.x += (px / (pd || 1)) * S.knock;
            p.y += (py / (pd || 1)) * S.knock;
          } else this.bossLastKind = 'sweepMiss';
        }
      } else {
        // 휘두르는 선: 부채꼴을 한쪽에서 반대쪽으로 쓸고 지나감
        const k = Phaser.Math.Clamp(1 - this.bossTimer / S.swing, 0, 1);
        const a = a0 - half + k * half * 2;
        this.fx.lineStyle(5, 0xffd0a0, 0.9 * (1 - k * 0.5)).lineBetween(b.x, b.y, b.x + Math.cos(a) * S.range, b.y + Math.sin(a) * S.range);
        if (this.bossTimer <= 0) toWalk();
      }
      return true;
    }
    return false;
  }

  /** 개틀링 탄피: 드럼 위 배출구(port)에서 한 발에 하나 (변형 3줄 중 무작위, 왼쪽을 보면 반전) */
  private ejectCasing(b: Enemy, rowPick?: number): void {
    const F = (bossAnim as { fx?: { fx_boss_casing?: { frameW: number; frameH: number; frames: number; rows: number; fps: number; start: number[] } } }).fx?.fx_boss_casing;
    if (!F || !this.textures.exists('fx_boss_casing')) return;
    const pt = this.basiliPoint(b, 'port');
    if (!pt) return;
    const flip = b.sprite.flipX;
    const row = rowPick ?? Math.floor(Math.random() * F.rows);
    const ox = (flip ? F.frameW - F.start[0] : F.start[0]) / F.frameW;
    this.playSheet('fx_boss_casing', F.frames, pt.x, pt.y, ox, F.start[1] / F.frameH, F.fps, b.sprite.depth + 0.05, flip, 1, row * F.frames);
  }

  /** 바실리 지금 그림 안의 점(발전기·총구)을 월드 좌표로. 그림이 없거나 점 정보가 없으면 undefined, 그 프레임에서 가려졌으면 null */
  private basiliPoint(b: Enemy, kind: 'generator' | 'muzzle' | 'port'): { x: number; y: number } | null | undefined {
    const m = b.sprite.texture.key.match(/^boss_(walk|gatling|slam|stomp|phase|call|p2_walk|p2_gatling|p2_stomp)_(?:lit_)?(\d+)$/);
    if (!m) return undefined;
    const M = (BOSS_ANIM.boss as Record<string, { w: number; h: number; generator?: FramePts; muzzle?: FramePts; port?: FramePts }>)[m[1]];
    const list = M?.[kind];
    if (!M || !list) return undefined;
    const pt = list[Number(m[2])];
    if (!pt) return null;
    const sp = b.sprite;
    const lx = (sp.flipX ? M.w - pt[0] : pt[0]) - sp.originX * M.w;
    const ly = pt[1] - sp.originY * M.h;
    return { x: sp.x + lx * sp.scaleX, y: sp.y + ly * sp.scaleY };
  }

  /**
   * 바실리 동작별 프레임 그림 (boss_walk/gatling/slam_NN). 아직 그림이 없는 동작은 가까운 장면으로 대신
   * (호출·발구르기 = 걷기 첫 장, 2페이즈 전환 = 박치기 예고). 반동·총구 화염·반사광·그림자·발구르기 눌림은 코드로
   */
  private animateBasiliFrames(b: Enemy, def: BossDef, dt: number): boolean {
    const bz = (def as { basili?: BasiliDef }).basili;
    const M = BOSS_ANIM.boss as Record<string, { frames: number; w: number; h: number; originX: number; phases?: Record<string, number[]> }>;
    if (!bz || !this.textures.exists('boss_walk_00')) return false;
    const A = bz.anim;
    const ph = this.bossPhase;
    const P2 = this.bossPhase2 ? (def as { phase2?: Phase2 }).phase2 : undefined;
    const span = (r: number[], k: number) => r[0] + Math.min(r[1] - r[0], Math.floor(Phaser.Math.Clamp(k, 0, 0.999) * (r[1] - r[0] + 1)));
    const loop = (r: number[], t: number, fps: number) => r[0] + (Math.floor(t * fps) % (r[1] - r[0] + 1));
    let motion = 'walk';
    let idx = 0;
    let firing = false;
    const slamP = M.slam?.phases ?? { ready: [0, 1], windup: [2, 3], dash: [4, 7] };
    const gatP = M.gatling?.phases ?? { raise: [0, 4], fireLoop: [5, 8] };
    // 2페이즈 걷기 그림이 있으면 2페이즈에선 그걸로 (호출 임시 장면도)
    const walkM = this.bossPhase2 && M.p2_walk && this.textures.exists('boss_p2_walk_00') ? 'p2_walk' : 'walk';
    const stompM = M.stomp as { frames: number; phases?: Record<string, number[]>; impactFrame?: number } | undefined;
    const phaseM = M.phase as { frames: number; endFrame?: number } | undefined;
    if (ph === 'walk' || ph === 'walkIn') {
      motion = walkM;
      b.walkPh = (b.walkPh + dt * A.walkFps) % M[walkM].frames;
      idx = Math.floor(b.walkPh);
    } else if (ph === 'phaseShift' && phaseM && this.textures.exists('boss_phase_00')) {
      // 2페이즈 전환: 코트 쥠 → 발전기 폭발광 → 코트 찢김 → 2페이즈 자세, 한 번만
      motion = 'phase';
      idx = span([0, phaseM.endFrame ?? phaseM.frames - 1], 1 - this.bossTimer / bz.phaseShift);
    } else if ((ph === 'stomp' || ph === 'stompRec') && stompM && this.textures.exists('boss_stomp_00')) {
      // 발구르기: 발 들기·내려찍기(예고 시간 동안) → 착지(충격파) → 낮게 버팀
      const SP = stompM.phases ?? { lift: [0, 5], slam: [6, 6], recover: [8, 11] };
      const imp = stompM.impactFrame ?? 7;
      // 2페이즈 발구르기 그림이 있으면 2페이즈에선 그걸로 (캔버스·착지 장·앞발 위치는 같음)
      motion = this.bossPhase2 && M.p2_stomp && this.textures.exists('boss_p2_stomp_00') ? 'p2_stomp' : 'stomp';
      if (ph === 'stomp') idx = span([SP.lift[0], SP.slam[1]], 1 - this.bossTimer / bz.stomp.lift);
      else {
        const t = A.stompRecover - this.bossTimer;
        idx = t < 0.08 ? imp : span(SP.recover, (t - 0.08) / Math.max(0.01, A.stompRecover - 0.08));
      }
    } else if (ph === 'aim' || ph === 'phaseShift') {
      // 박치기 예고: 준비 두 장 → 예고 두 장을 천천히 반복 (2페이즈 전환도 임시로 같은 장면)
      const total = ph === 'aim' ? (P2?.aimTime ?? def.aimTime) : bz.phaseShift;
      const t = total - this.bossTimer;
      motion = 'slam';
      idx = t < A.ready ? span(slamP.ready, t / A.ready) : loop(slamP.windup, t - A.ready, A.windupFps);
    } else if (ph === 'charge') {
      // 돌진: 돌진 네 장을 돌진 시간 앞쪽에 한 번, 마지막 장 유지
      const total = P2?.chargeTime ?? def.chargeTime;
      motion = 'slam';
      idx = span(slamP.dash, (total - this.bossTimer) / (total * 0.6));
    } else if (ph === 'call' && M.call && this.textures.exists('boss_call_00')) {
      // 부하 호출: 팔 들기 → 손끝으로 원 두 바퀴(끝에 호위 등장) → 팔 내림
      motion = 'call';
      idx = span([0, M.call.frames - 1], 1 - this.bossTimer / bz.call.gesture);
    } else if (ph === 'call' || ph === 'stomp' || ph === 'stompRec') {
      // 아직 그림이 없는 동작: 걷기 첫 장
      motion = walkM;
      idx = 0;
    } else if (ph === 'gatling') {
      const G = bz.gatling;
      // 2페이즈 개틀링 그림이 있으면 2페이즈에선 그걸로
      motion = this.bossPhase2 && this.textures.exists('boss_p2_gatling_00') ? 'p2_gatling' : 'gatling';
      if (this.bossTimer > G.time) idx = span(gatP.raise, (G.spin + G.time - this.bossTimer) / G.spin);
      else {
        // 사격 그림은 발사와 1대1: 마지막 발사의 장을 보여 준다
        idx = this.gatShotFrame >= 0 ? this.gatShotFrame : gatP.fireLoop[0];
        firing = true;
      }
    }
    this.basiliFlashT = Math.max(0, this.basiliFlashT - dt);
    // 총구 화염이 보이는 동안은 빛을 미리 칠한 프레임(boss_gatling_lit_NN)으로
    const litKey = `boss_${motion}_lit_${String(idx).padStart(2, '0')}`;
    const lit = firing && this.basiliFlashT > 0 && this.textures.exists(litKey);
    const key = lit ? litKey : `boss_${motion}_${String(idx).padStart(2, '0')}`;
    if (!this.textures.exists(key)) return false;
    if (b.sprite.texture.key !== key) b.sprite.setTexture(key);
    const flip = ph === 'charge' || ph === 'aim' ? this.bossDir.x < 0 : ph === 'gatling' ? Math.cos(this.gatAim) < 0 : this.player.x < b.x;
    const ox = M[motion].originX;
    b.sprite.setFlipX(flip).setOrigin(flip ? 1 - ox : ox, 1);
    // 발구르기 착지: 몸이 잠깐 눌림
    this.basiliSquash = Math.max(0, this.basiliSquash - dt);
    const sq = A.squash > 0 ? this.basiliSquash / A.squash : 0;
    if (!this.tweens.isTweening(b.sprite)) b.sprite.setScale(b.baseScale * (1 + 0.08 * sq), b.baseScale * (1 - 0.12 * sq));
    b.footOff = A.footY;
    const shakeAmp = ph === 'phaseShift' ? 2 : ph === 'aim' ? 2 : 0;
    let jx = shakeAmp && !Settings.reducedFx ? (Math.random() - 0.5) * shakeAmp : 0;
    let jy = 0;
    // 개틀링 반동: 발사와 1대1. 발사 순간 총구 반대쪽으로 밀렸다가 kickTime초 동안 돌아옴
    this.basiliKick = Math.max(0, this.basiliKick - dt / A.kickTime);
    if (firing && !Settings.reducedFx) {
      const r = A.recoil * this.basiliKick;
      jx -= Math.cos(this.gatAim) * r;
      jy -= Math.sin(this.gatAim) * r * 0.5;
    }
    b.sprite.setPosition(b.x + jx, b.y + A.footY + jy);
    // 발밑 그림자
    this.basiliShadow ??= this.add.ellipse(0, 0, A.shadow.w, A.shadow.h, 0x000000, A.shadow.alpha);
    this.basiliShadow.setVisible(true).setPosition(b.x, b.y + A.footY - 2).setDepth(b.sprite.depth - 0.1).setScale(ph === 'charge' ? 1.1 : 1, 1);
    // 총구 화염 그림 + 후광 (그림이 있으면). 없으면 빛번짐 원 + 몸 반사광
    const mp = firing ? this.basiliPoint(b, 'muzzle') : null;
    if (this.textures.exists('fx_boss_muzzle')) {
      this.basiliFlash ??= this.add.image(0, 0, this.softGlowKey()).setBlendMode(Phaser.BlendModes.ADD).setDepth(12.6);
      this.basiliReflect ??= this.add.image(0, 0, key).setBlendMode(Phaser.BlendModes.ADD).setDepth(b.sprite.depth + 0.05);
      this.basiliReflect.setVisible(false);
      this.basiliHalo ??= this.add.image(0, 0, 'fx_boss_muzzle_glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(12.55);
      const on = !!mp && this.basiliFlashT > 0;
      if (on && mp) {
        const s = 1; // 이펙트는 1:1
        // 화염: 기준점 = 총구(왼쪽 끝, 총열 가운데). 왼쪽을 보면 좌우 반전
        this.basiliFlash
          .setVisible(true)
          .setBlendMode(Phaser.BlendModes.NORMAL)
          .setTexture('fx_boss_muzzle', String(this.basiliFlashF))
          .clearTint()
          .setFlipX(flip)
          .setOrigin(flip ? 1 : 0, 12 / 30)
          .setScale(s)
          .setAlpha(1)
          .setPosition(mp.x, mp.y);
        this.basiliHalo.setVisible(true).setPosition(mp.x, mp.y).setScale(s).setAlpha(0.8);
      } else {
        this.basiliFlash.setVisible(false);
        this.basiliHalo.setVisible(false);
      }
      return true;
    }
    this.basiliFlash ??= this.add.image(0, 0, this.softGlowKey()).setBlendMode(Phaser.BlendModes.ADD).setDepth(12.6);
    this.basiliReflect ??= this.add.image(0, 0, key).setBlendMode(Phaser.BlendModes.ADD).setDepth(b.sprite.depth + 0.05);
    if (mp) {
      const fl = 0.6 + Math.random() * 0.4;
      this.basiliFlash.setVisible(true).setBlendMode(Phaser.BlendModes.ADD).setTexture(this.softGlowKey()).setOrigin(0.5).setTint(Number(A.flash.color)).setPosition(mp.x, mp.y).setDisplaySize(A.flash.size * fl * BOSS_SCALE, A.flash.size * fl * BOSS_SCALE).setAlpha(0.9 * fl);
      this.basiliReflect
        .setVisible(true)
        .setTexture(key)
        .setTintFill(Number(A.reflect.color))
        .setFlipX(flip)
        .setOrigin(b.sprite.originX, 1)
        .setScale(b.sprite.scaleX, b.sprite.scaleY)
        .setPosition(b.sprite.x, b.sprite.y)
        .setAlpha(A.reflect.alpha * (0.4 + Math.random() * 0.6));
    } else {
      this.basiliFlash.setVisible(false);
      this.basiliReflect.setVisible(false);
    }
    return true;
  }

  /** 빛번짐용 부드러운 원 텍스처 (흰색 방사형 그라데이션, Add 합성 + 틴트로 씀) */
  private softGlowKey(): string {
    const key = 'fx_soft_glow';
    if (!this.textures.exists(key)) {
      const n = 64;
      const cv = this.textures.createCanvas(key, n, n)!;
      const cx = cv.getContext();
      const g = cx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.15)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      cx.fillStyle = g;
      cx.fillRect(0, 0, n, n);
      cv.refresh();
    }
    return key;
  }

  /** 점프 내리찍기 착지 범위: 떨어질 자리에 붉은 원, 착지가 가까울수록 안쪽이 차오른다 */
  private drawSlamMark(sl: SlamDef): void {
    const rage = this.bossEnraged ? ((this.bossDef as { enrage?: EnrageDef }).enrage?.mul ?? 1) : 1;
    const total = (sl.leap + sl.air) / rage;
    const left = this.bossPhase === 'leap' ? this.bossTimer + sl.air / rage : this.bossTimer;
    const k = Phaser.Math.Clamp(1 - left / total, 0, 1);
    const { x, y } = this.bossTo;
    this.fx.fillStyle(0xff2a3a, MARK_A * (0.1 + 0.15 * k)).fillEllipse(x, y, sl.radius * 2, sl.radius * 1.2);
    this.fx.fillStyle(0xff2a3a, MARK_A * 0.25).fillEllipse(x, y, sl.radius * 2 * k, sl.radius * 1.2 * k);
    this.fx.lineStyle(2, 0xff2a3a, MARK_A * (0.5 + Math.sin(this.elapsed * 30) * 0.3)).strokeEllipse(x, y, sl.radius * 2, sl.radius * 1.2);
  }

  /** 점프 내리찍기 착지: 범위 안이면 피해 + 밀려남, 충격파·흔들림 */
  private slamLand(b: Enemy, sl: SlamDef): void {
    const p = this.player;
    // 바닥 범위는 납작한 타원(가로 radius, 세로 0.6배)
    const nx = (p.x - b.x) / sl.radius;
    const ny = (p.y - b.y) / (sl.radius * 0.6);
    if (p.invuln <= 0 && nx * nx + ny * ny <= 1) {
      this.hurtPlayer(sl.damage, { kind: 'boss', id: b.id });
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      // 정중앙에 맞으면 보스가 뛰어온 방향으로 밀어낸다
      const ux = d > 1 ? (p.x - b.x) / d : this.bossDir.x;
      const uy = d > 1 ? (p.y - b.y) / d : this.bossDir.y;
      p.x += ux * sl.knock;
      p.y += uy * sl.knock;
    }
    const ring = this.add.ellipse(b.x, b.y, sl.radius * 2, sl.radius * 1.2).setStrokeStyle(3, 0xffa040, 0.9).setDepth(11);
    ring.setScale(0.3);
    this.tweens.add({ targets: ring, scale: 1.25, alpha: 0, duration: 380, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
    this.burst(b.x, b.y, 0xffa040, 18);
    // XM-4 점프 착지: 바실리 발구르기 이펙트를 발밑에 (boss_anim.json fx origin)
    const SF = (bossAnim as unknown as { fx?: Record<string, { frameW: number; frameH: number; frames: number; fps: number; origin: number[] }> }).fx?.fx_boss_stomp;
    if (b.id === 'boss2' && SF && this.textures.exists('fx_boss_stomp')) this.playSheet('fx_boss_stomp', SF.frames, b.x, this.xmFoot(b), SF.origin[0] / SF.frameW, SF.origin[1] / SF.frameH, SF.fps, 12.1);
    this.shake(220, 0.014);
    Sound.play('explode');
  }

  /** 소환·탄막 때 보스가 한 번 들썩인다 */
  private bossPulse(b: Enemy): void {
    this.tweens.killTweensOf(b.sprite);
    const S = this.bossAnimScale(this.bossDef);
    b.sprite.setScale(S);
    this.tweens.add({ targets: b.sprite, scaleX: 1.15 * S, scaleY: 0.88 * S, duration: 90, yoyo: true });
  }

  /** 저격 터렛: 제자리에서 조준선을 0.8초 보여준 뒤 강한 한 발 */
  private turretAi(e: Enemy, dt: number, dx: number, dy: number, d: number, hidden: boolean): void {
    const S = gameData.ranged.sniper_turret;
    e.t -= dt;
    if (e.state === 'walk' && e.t <= 0 && !hidden && d < S.range && this.onScreen(e.x, e.y)) {
      e.state = 'wind';
      e.t = S.aim;
      e.dirX = dx / d;
      e.dirY = dy / d;
    } else if (e.state === 'wind' && hidden) {
      e.state = 'walk';
      e.t = 0.6;
    } else if (e.state === 'wind') {
      e.dirX = dx / d;
      e.dirY = dy / d;
      this.fx.lineStyle(1, 0xff2a3a, 0.4 + (1 - e.t / S.aim) * 0.5).lineBetween(e.x, e.y, e.x + e.dirX * 300, e.y + e.dirY * 300);
      if (e.t <= 0) {
        this.eShot(e.id).fire(e.x, e.y, Math.atan2(e.dirY, e.dirX), S.bulletSpeed, S.bulletDamage, S.bulletLife, 1.3);
        Sound.play('enemyshot');
        e.atkT = 0.25;
        e.state = 'walk';
        e.t = S.interval * Phaser.Math.FloatBetween(0.8, 1.2);
      }
    }
  }

  /** 글리치 유령 AI: 몇 초마다 플레이어 근처 무작위 자리로 순간이동 */
  private ghostAi(e: Enemy, dt: number, d: number, hidden: boolean): void {
    const G = gameData.glitch;
    e.sprite.setAlpha(Math.random() < 0.1 ? 0.4 : 0.9);
    e.cd -= dt;
    if (e.cd > 0 || hidden || d > 300) return;
    e.cd = G.every * Phaser.Math.FloatBetween(0.8, 1.3);
    const p = this.player;
    const a = Math.random() * Math.PI * 2;
    const r = Phaser.Math.Between(G.min, G.max);
    this.burst(e.x, e.y, COLORS.magenta, 6);
    e.x = p.x + Math.cos(a) * r;
    e.y = p.y + Math.sin(a) * r;
    this.burst(e.x, e.y, COLORS.cyan, 6);
    e.atkT = 0.3;
    if (this.onScreen(e.x, e.y)) Sound.play('glitch');
  }

  /** 자폭 드론: 가까워지면 깜빡이며 멈칫한 뒤 폭발. 폭발했으면 true (이미 사라짐) */
  private kamikazeAi(e: Enemy, dt: number, d: number, setV: (x: number, y: number) => void): boolean {
    const K = enemiesData.kamikaze;
    if (e.state === 'walk' && d < 30) {
      e.state = 'wind';
      e.t = K.fuse;
    }
    if (e.state !== 'wind') return false;
    e.t -= dt;
    setV(0, 0);
    e.sprite.setTint(Math.floor(e.t * 16) % 2 ? 0xff2a3a : 0xffffff);
    if (e.t > 0) return false;
    const p = this.player;
    this.fx.lineStyle(2, COLORS.orange, 0.8).strokeCircle(e.x, e.y, K.blastRadius);
    this.burst(e.x, e.y, COLORS.orange, 14);
    if (this.onScreen(e.x, e.y)) Sound.play('explode');
    if (p.invuln <= 0 && (p.x - e.x) ** 2 + (p.y - e.y) ** 2 < K.blastRadius ** 2) this.hurtPlayer(K.blast, { kind: 'blast', id: e.id });
    e.kill();
    return true;
  }

  private updateEnemyBullets(dt: number): void {
    const p = this.player;
    const slow = this.odSlowMul;
    for (const b of this.enemyBullets.items) {
      if (!b.active) continue;
      if (b.homeDist > 0) {
        if (b.homeDelay > 0) b.homeDelay -= dt * slow;
        else b.steer(p.x, p.y, dt * slow);
      }
      b.update(dt * slow);
      // XM-4 미사일: 꼬리 연기, 수명이 다하면 터짐
      const xmMis = b.dirSheet === 'fx_boss2_missile';
      if (xmMis && b.active && (b.trailT -= dt) <= 0) {
        b.trailT = 0.05;
        const sp = Math.hypot(b.vx, b.vy) || 1;
        this.playSheet('fx_boss2_missile_smoke', 6, b.x - (b.vx / sp) * 8, b.y - (b.vy / sp) * 8, 0.5, 0.5, 20, 15.5);
      }
      if (!b.active) {
        if (xmMis) this.playSheet('fx_boss2_missile_hit', 8, b.x, b.y, 0.5, 0.5, 20, 16);
        continue;
      }
      if (p.invuln <= 0 && !this.untrackedElite && (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < (p.radius + b.radius) ** 2) {
        b.kill();
        if (xmMis) this.playSheet('fx_boss2_missile_hit', 8, b.x, b.y, 0.5, 0.5, 20, 16);
        // 반사 신경: 20% 확률로 피함
        if (this.pHas('reflex') && Math.random() < 0.2) {
          this.burst(p.x, p.y, COLORS.cyan, 4);
          continue;
        }
        this.hurtPlayer(b.damage, { kind: b.srcKind, id: b.src });
      }
    }
  }

  /** 뉴럴 오버클럭 중 화면 효과: 충격파, 글리치 띠, 가장자리 속도선 */
  private drawOverclockFx(realDt: number): void {
    const p = this.player;
    if (Settings.reducedFx) {
      this.shockwaves = [];
      this.glitch.clear();
      return;
    }
    for (const w of this.shockwaves) {
      w.life -= realDt;
      w.r += 520 * realDt;
      if (w.r > 0 && w.life > 0) {
        this.fx.lineStyle(3, COLORS.magenta, Math.min(1, w.life * 1.6)).strokeCircle(p.x, p.y, w.r);
        this.fx.lineStyle(1, COLORS.cyan, Math.min(1, w.life * 1.2)).strokeCircle(p.x, p.y, w.r * 0.92);
      }
    }
    this.shockwaves = this.shockwaves.filter((w) => w.life > 0);
    if (!this.overdrive) return;
    const g = this.glitch;
    g.clear();
    // 글리치 띠
    if (Math.random() < 0.35) {
      for (let i = 0, n = Phaser.Math.Between(1, 3); i < n; i++) {
        g.fillStyle(Math.random() < 0.5 ? COLORS.cyan : COLORS.magenta, Phaser.Math.FloatBetween(0.08, 0.25));
        g.fillRect(Phaser.Math.Between(-40, VIEW_W - 80), Phaser.Math.Between(0, VIEW_H), Phaser.Math.Between(80, 320), Phaser.Math.Between(1, 4));
      }
    }
    // 화면 가장자리에서 중심으로 향하는 속도선 (슬로우 모션 중 더 진하게)
    const strong = this.slowmo > 0 ? 1 : 0.45;
    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = Phaser.Math.Between(200, 260);
      const r1 = r0 + Phaser.Math.Between(30, 90);
      g.lineStyle(1, i % 2 ? COLORS.cyan : COLORS.magenta, 0.35 * strong);
      g.lineBetween(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.6, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.6);
    }
  }

  private spawnGhost(color: number): void {
    const p = this.player;
    this.spawnGhostAt(p.sprite.texture.key, p.x, p.y, p.sprite.flipX, color);
  }

  /** 잔상 한 장 (플레이어·회피하는 진압대 공용) */
  private spawnGhostAt(tex: string, x: number, y: number, flip: boolean, color: number): void {
    let g = this.ghosts.find((o) => o.life <= 0);
    if (!g) {
      if (this.ghosts.length >= 80) return;
      g = { img: this.add.image(0, 0, tex).setDepth(19).setBlendMode(Phaser.BlendModes.ADD), life: 0 };
      this.ghosts.push(g);
    }
    g.life = 0.25;
    g.img.setTexture(tex).setPosition(x, y).setFlipX(flip).setTint(color).setVisible(true);
  }

  /** 진압대 회피 기동: 뉴럴 오버클럭의 축소판. 플레이어 기준 옆으로 빠르게 미끄러지며 잔상, 그동안 피해 무시 */
  /**
   * 블랙 실드 판단 (SquadBrain): 0.25초마다(맞으면 곧바로) 행동마다 0~1 점수를 매겨 가장 높은 행동을 고른다.
   * 고른 행동의 이동 속도를 돌려준다. 공격·회피 동작 중이면 판단을 미루고 null (각 동작 코드가 움직임을 맡음)
   */
  private squadThink(e: Enemy, role: Role, dt: number, d: number, hidden: boolean): [number, number] | null {
    const B = gameData.squadBrain;
    const p = this.player;
    const tx = hidden ? this.decoy.x : p.x;
    const ty = hidden ? this.decoy.y : p.y;
    const ux = (tx - e.x) / d;
    const uy = (ty - e.y) / d;
    // 공격·회피 동작 중: 그 자리에 선다 (돌진·회피 이동은 각 동작 코드가 덮어씀)
    if (e.state !== 'walk' || e.dodgeT > 0 || e.seq) return [0, 0];
    const allies = this.enemyPool.items.filter((o) => o.active && o !== e && o.id.startsWith('trooper_'));
    const weakest = allies.reduce<Enemy | null>((w, o) => (!w || o.hp / o.maxHp < w.hp / w.maxHp ? o : w), null);
    if ((e.thinkT -= dt) <= 0) {
      e.thinkT = B.think;
      const onScr = this.onScreen(e.x, e.y);
      const r = pickAct({
        role,
        hp: e.hp / e.maxHp,
        playerHp: Math.max(0, p.hp) / p.maxHp,
        d,
        sinceHit: this.elapsed - e.lastHitAt,
        dodgeReady: onScr && this.elapsed >= e.dodgeReadyAt,
        attackReady: !hidden && onScr && (role === 'tank' ? this.elapsed >= e.atkCd : e.t <= 0),
        swingReady: role === 'melee' && !hidden && this.elapsed >= e.atkCd,
        hasTank: allies.some((o) => o.id === 'trooper_tank'),
        weakestAlly: weakest ? weakest.hp / weakest.maxHp : 1,
        current: e.act,
      });
      e.act = r.act;
      e.scores = r.scores;
      if (e.act === 'dodge') {
        // 체력이 낮으면 플레이어 반대쪽으로 크게, 아니면 옆으로
        this.startDodge(e, e.hp / e.maxHp < 0.35);
        e.dodgeReadyAt = this.elapsed + B.dodgeGap;
        return null;
      }
    }
    const sp = e.speed;
    switch (e.act) {
      case 'approach':
        return [ux * sp, uy * sp];
      case 'retreat':
        return [-ux * sp, -uy * sp];
      case 'keep': {
        // 선호 거리로 맞추면서 옆으로 돈다
        const pref = B.pref[role];
        const radial = Phaser.Math.Clamp((d - pref) / pref, -1, 1);
        const side = e.side >= 0 ? 1 : -1;
        return [(-uy * side * 0.4 + ux * radial) * sp, (ux * side * 0.4 + uy * radial) * sp];
      }
      case 'guard': {
        // 가장 다친 아군과 플레이어 사이에 선다
        if (!weakest) return [ux * sp, uy * sp];
        const gx = weakest.x + (tx - weakest.x) * 0.35 - e.x;
        const gy = weakest.y + (ty - weakest.y) * 0.35 - e.y;
        const gd = Math.hypot(gx, gy);
        return gd > 6 ? [(gx / gd) * sp, (gy / gd) * sp] : [0, 0];
      }
      case 'bash':
        // 방패를 들고 천천히 밀고 들어간다 (34px 안이면 방패 치기)
        return [ux * sp * 0.5, uy * sp * 0.5];
      case 'cover':
        return null; // 해커 AI가 탱커 뒤 자리를 잡는다
      default:
        return [0, 0]; // 돌진·휘두르기·해킹·저격: 그 자리에서 동작 시작
    }
  }

  private startDodge(e: Enemy, away = false): void {
    const D = gameData.squadAi.dodge;
    const p = this.player;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const side = Math.random() < 0.5 ? 1 : -1;
    // 옆으로 + (공격수는 앞으로 파고들고, 해커·저격수는 뒤로 빠짐). 도주 때는 플레이어 반대쪽으로 크게
    const fwd = away ? -1.6 : e.id === 'trooper_melee' ? 0.45 : -0.5;
    let vx = (-dy / d) * side + (dx / d) * fwd;
    let vy = (dx / d) * side + (dy / d) * fwd;
    const m = Math.hypot(vx, vy) || 1;
    vx /= m;
    vy /= m;
    e.dodgeVX = vx * D.speed;
    e.dodgeVY = vy * D.speed;
    e.dodgeT = D.time;
    e.ghostT = 0;
    const ev = (D.every as Record<string, number[]>)[e.id] ?? [2, 3];
    e.dodgeCd = Phaser.Math.FloatBetween(ev[0], ev[1]);
    // 플레이어 대시와 같은 퍼지는 원 (붉은색) + 대시 소리
    if (this.onScreen(e.x, e.y)) {
      this.dodgeRings.push({ x: e.x, y: e.y, r: 6, life: 0.22 });
      Sound.play('trooperdash');
    }
    // 예고·조준 중이던 동작은 취소
    if (e.state !== 'walk') {
      e.state = 'walk';
      e.t = 1;
    }
    this.burst(e.x, e.y, 0xff2a3a, 6);
    if (this.onScreen(e.x, e.y)) Sound.play('dash');
  }

  // ───────────────────────────── 픽서의 휴대폰 문자 ─────────────────────────────
  /** 중간 보스·구역 보스·블랙 실드가 나타나기 몇 초 전에 픽서 진이 문자로 알려 준다 */
  private fixerWarnings(nextBoss: BossDef | undefined, zt: number): void {
    const lead = gameData.fixerWarnLead;
    if (this.transitionT > 0) return;
    // 1구역 75초: 센서스가 러너에게 현상금을 걸었다 (갱단·부패 경찰이 노리는 이유)
    if (!this.bountySent && this.zoneIdx === 0 && zt >= 75) {
      this.bountySent = true;
      this.phoneText(tr('phone.bounty'));
    }
    const key = `${this.zoneIdx}-${this.bossesSpawned}`;
    if (nextBoss && !this.boss && this.warnedBoss !== key && zt >= nextBoss.time - lead) {
      this.warnedBoss = key;
      const name = enemiesData[nextBoss.id as EnemyId].name;
      // 보스마다 스토리에 맞춘 문자 (없으면 공용 문구)
      const own = `phone.boss.${nextBoss.id}` as Parameters<typeof tr>[0];
      const msg = tr(own);
      this.phoneText(msg !== own ? msg : tr(nextBoss.final ? 'phone.boss' : 'phone.midboss', { name, ga: josa(name, '이', '가') }), this.textures.exists(`${nextBoss.id}_portrait`) ? `${nextBoss.id}_portrait` : `${nextBoss.id}_w1`);
    }
    if (!this.raid && !this.boss && this.warnedRaid !== this.nextRaid && this.elapsed >= this.nextRaid - lead) {
      // 보스가 곧 나올 차례면 습격은 미뤄지므로 그때는 알리지 않는다
      const bossSoon = nextBoss && zt >= nextBoss.time - lead;
      if (!bossSoon) {
        this.warnedRaid = this.nextRaid;
        this.phoneText(tr('phone.raid'));
      }
    }
  }

  /** tex: 메시지에 붙일 그림 (처음 보는 적 소개 등) */
  private phoneText(msg: string, tex?: string): void {
    this.phoneQueue.push({ msg, tex: tex && this.textures.exists(tex) ? tex : undefined });
    if (!this.phoneBox) this.showNextPhone();
  }

  private showNextPhone(): void {
    const item = this.phoneQueue.shift();
    if (item === undefined) {
      this.phoneBox = null;
      return;
    }
    const { msg, tex } = item;
    const pic = 40; // 적 그림 칸 (그림이 있을 때만)
    const w = tex ? 226 : 196;
    const x = VIEW_W - w - 8;
    const y = VIEW_H - 182;
    const box = this.add.container(x + w + 20, y).setScrollFactor(0).setDepth(125);
    const tx = tex ? 12 + pic + 6 : 12;
    const text = this.add.text(tx, 34, msg, { ...TEXT, fontSize: '11px', color: '#e8f7ff', wordWrap: { width: w - tx - 12, useAdvancedWrap: true }, lineSpacing: 2 });
    const h = Math.max(tex ? pic + 42 : 62, text.height + 46);
    box.add(this.add.rectangle(0, 0, w, h, 0x0d0820, 0.94).setOrigin(0).setStrokeStyle(2, COLORS.magenta));
    box.add(this.add.rectangle(4, 4, w - 8, 20, 0x2a1050, 1).setOrigin(0));
    box.add(this.add.image(16, 14, zonesData.client.texture).setScale(0.5));
    box.add(this.add.text(30, 7, `✉ ${zonesData.client.name}`, { ...TEXT, fontSize: '11px', color: '#ff2bd6' }));
    box.add(this.add.text(w - 8, 8, tr('phone.now'), { ...TEXT, fontSize: '9px', color: '#8a7aa8' }).setOrigin(1, 0));
    box.add(this.add.rectangle(tx - 4, 29, text.width + 8, text.height + 8, 0x1a1040, 1).setOrigin(0).setStrokeStyle(1, 0x3a2466));
    if (tex) {
      box.add(this.add.rectangle(8, 29, pic, pic, 0x1a1040, 1).setOrigin(0).setStrokeStyle(1, COLORS.magenta));
      const img = this.add.image(8 + pic / 2, 29 + pic / 2, tex);
      // 보스 초상(새 그림, 몸 전체)은 칸에 꼭 맞게, 그 밖의 작은 그림은 0.25 단위 배율
      const fit = (pic - 4) / Math.max(img.width, img.height);
      img.setScale(tex.endsWith('_portrait') ? fit : Math.min(3, Math.floor(fit * 4 * ((pic - 6) / (pic - 4))) / 4 || 0.5));
      box.add(img);
    }
    box.add(text);
    box.setY(y + 62 - h);
    this.phoneBox = box;
    Sound.play('phone');
    this.tweens.add({ targets: box, x, duration: 260, ease: 'Back.out' });
    this.tweens.add({ targets: box, x: x - 2, duration: 40, yoyo: true, repeat: 3, delay: 260 });
    this.time.delayedCall(gameData.fixerWarnShow * 1000, () => {
      this.tweens.add({
        targets: box,
        x: VIEW_W + 20,
        alpha: 0,
        duration: 260,
        onComplete: () => {
          box.destroy();
          this.showNextPhone();
        },
      });
    });
  }

  /** 피격 틴트가 끝나면 원래 색(기절 시안·조종 분홍)으로 되돌린다 */
  private tickHitFlash(e: Enemy, dt: number): void {
    if (e.flash <= 0) return;
    e.flash -= dt;
    if (e.flash > 0) return;
    if (e.charmT > 0) e.sprite.setTint(e.psycho ? PSYCHO_TINT : CHARM_TINT);
    else if (e.stun > 0) e.sprite.setTint(0x66ffff);
    else if (e === this.boss && this.bossEnraged) e.sprite.setTint(Number((this.bossDef as { enrage?: EnrageDef }).enrage?.tint ?? 0xff6a6a));
    else e.sprite.clearTint();
  }

  /** 진압대 강하: drop 그림으로 떨어지고, 착지하면 land 그림 0.7초 + 먼지, 끝나면 서 있는 자세. 내내 무적 (깜빡임 없음) */
  private updateDrop(e: Enemy, dt: number): void {
    const footY = e.landY + this.textures.get(e.tex).getSourceImage().height / 2;
    e.x = e.landX;
    e.y = e.landY;
    if (e.dropT > 0) {
      e.dropT -= dt;
      const k = Phaser.Math.Clamp(1 - e.dropT / DROP.fall, 0, 1);
      e.sprite.setPosition(e.x, e.dropFromY + (footY - e.dropFromY) * k * k);
      if (e.dropT <= 0) {
        e.landT = DROP.land;
        if (this.textures.exists(`${e.tex}_land`)) e.sprite.setTexture(`${e.tex}_land`);
        e.sprite.setPosition(e.x, footY);
        this.playSheet('fx_land_dust', 18, e.x, footY, 56 / 112, 30 / 40, 12, 9.5);
        if (this.onScreen(e.x, e.y)) Sound.play('trooperland');
        // 마지막 대원이 착지하면 줄였던 다른 소리를 되돌린다
        if (--this.raidDropping <= 0) Sound.raidFocus(false);
        this.burst(e.x, footY, 0xff2a3a, 6);
        if (this.onScreen(e.x, e.y)) this.shake(80, 0.004);
      }
    } else {
      e.landT -= dt;
      e.sprite.setPosition(e.x, footY);
      if (e.landT <= 0) {
        e.landT = 0;
        e.sprite.setTexture(e.tex).setOrigin(0.5).setAlpha(1).setPosition(e.x, e.y);
        return;
      }
    }
  }

  /** 한 번 재생하는 시트 효과 (프레임 '0'..'n-1') */
  private playSheet(key: string, n: number, x: number, y: number, ox: number, oy: number, fps: number, depth: number, flip = false, scale = 1, first = 0): void {
    if (!this.textures.exists(key)) return;
    const img = this.add.image(x, y, key, String(first)).setOrigin(ox, oy).setDepth(depth).setFlipX(flip).setScale(scale);
    const t0 = this.elapsed;
    const tick = () => {
      const f = Math.floor((this.elapsed - t0) * fps);
      if (f >= n || !img.active) {
        this.events.off('update', tick);
        img.destroy();
        return;
      }
      img.setFrame(String(first + f));
    };
    this.events.on('update', tick);
  }

  // ───────────────────────────── 블랙 실드 진압대 습격 ─────────────────────────────
  // (이송기 그림 112x55: 착지 지점보다 SHIP_LIFT만큼 떠서 그림자 위에 있는다)
  private updateRaid(dt: number): void {
    const R = gameData.raid;
    const p = this.player;
    if (!this.raid) {
      if (this.raidWaitClear && !this.enemyPool.items.some((o) => o.active && o.id.startsWith('trooper_'))) {
        this.raidWaitClear = false;
        // 플레이어 스펙: 직전 부대 섬멸 시간 + 최근 DPS로 그 부대를 잡는 데 걸릴 시간 (둘 다 15초 이하 1, 60초 이상 0)
        const clear = this.elapsed - this.raidDeployAt;
        const dps = this.recentDps(R.dpsWindow);
        const ttk = dps > 0 ? this.raidSquadHp / dps : 999;
        const sc = (t: number) => Phaser.Math.Clamp((R.specSlow - t) / (R.specSlow - R.specFast), 0, 1);
        const score = (sc(clear) + sc(ttk)) / 2;
        this.raidSpec = { clear, ttk, score };
        // 강할수록 다음 습격이 빨리(40초), 다음 부대 체력이 높게(1.2배)
        this.nextRaid = this.elapsed + Phaser.Math.Linear(R.maxGap, R.minGap, score);
        this.raidHpMul = Phaser.Math.Linear(R.hpMin, R.hpMax, score);
      }
      if (this.boss || this.elapsed < this.nextRaid) return;
      const a = Math.random() * Math.PI * 2;
      const tx = p.x + Math.cos(a) * 110;
      const ty = p.y + Math.sin(a) * 80;
      const sx = this.cameras.main.scrollX - 60;
      const n = R.squad.length;
      const markers = Array.from({ length: n }, (_, i) => {
        const b = (i / n) * Math.PI * 2 + 0.4;
        return { x: tx + Math.cos(b) * 34, y: ty + Math.sin(b) * 22 };
      });
      this.raid = {
        phase: 'in', t: 0, sx, tx, ty, markers,
        // 날아오고 나갈 때는 덕트 엔진을 기울인 그림, 멈춰 있을 때는 정지 그림
        ship: this.add.image(sx, ty - SHIP_LIFT, this.textures.exists('dropship_move') ? 'dropship_move' : 'dropship').setDepth(30),
        shadow: this.add.ellipse(sx, ty + 8, 92, 20, 0x000000, 0.35).setDepth(9),
        wash: this.textures.exists('fx_ship_wash_move') ? this.add.image(sx, ty, 'fx_ship_wash_move', '0').setOrigin(0).setDepth(29.9) : null,
        washH: this.textures.exists('fx_ship_wash') ? this.add.image(sx, ty, 'fx_ship_wash', '0').setOrigin(0).setDepth(29.9).setAlpha(0) : null,
        floorGlow: this.add.image(tx, ty, this.softGlowKey()).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff2a3a).setDepth(8.9).setAlpha(0),
        tilt: SHIP_TILT_N,
        dust: this.textures.exists('fx_ship_dust') ? this.add.image(sx, ty + 8, 'fx_ship_dust', '0').setOrigin(88 / 176, 30 / 40).setDepth(9.5).setVisible(false) : null,
      };
      const warn = this.add
        .text(VIEW_W / 2, 72, tr('raid.warn'), { ...TEXT, fontSize: '16px', color: '#ff2a3a', align: 'center' })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(120);
      this.tweens.add({ targets: warn, alpha: 0.2, duration: 200, yoyo: true, repeat: 3, onComplete: () => warn.destroy() });
      // 블랙 실드 출동 경보: 오르내리는 사이렌
      Sound.raidFocus(true);
      Sound.play('raidsiren');
      return;
    }
    const r = this.raid;
    r.t += dt;
    const bob = Math.sin(this.elapsed * 4) * 1.5;
    if (r.phase === 'in') {
      const k = Math.min(1, r.t / R.flyIn);
      r.ship.x = r.sx + (r.tx - r.sx) * (1 - (1 - k) ** 3);
      if (k >= 1) {
        r.phase = 'hover';
        r.t = 0;
        // 착륙(정지) 엔진 소리
        Sound.play('shiphover');
      }
    } else if (r.phase === 'hover') {
      this.fx.fillStyle(0xff2a3a, 0.1).fillEllipse(r.tx, r.ty, 100, 54);
      if (r.t >= R.hover) {
        // 역할군별 대원 투입. 체력은 일반 몬스터와 같은 곡선·챕터 배율을 따르되,
        // 첫 습격 시각(raidStart, 5:30)의 곡선 값을 1로 맞춰 1챕터 첫 습격 4명 합계가 enemies.json 기본값(20,000)이 되게 한다
        const zt = this.elapsed - this.zoneStart;
        const hpMul = this.zoneHpMul(zt) * (hpScaleAt(zt) / hpScaleAt(this.zone.raidStart)) * this.raidHpMul;
        this.raidCount++;
        this.raidDeployAt = this.elapsed;
        this.raidsInZone++;
        const lines = [1, 2, 3, 4].sort(() => Math.random() - 0.5);
        // 말풍선은 한 번에 1~2명만 (누가 말할지는 무작위)
        const talkers = new Set([0, 1, 2, 3].sort(() => Math.random() - 0.5).slice(0, Math.random() < 0.5 ? 1 : 2));
        let said = 0;
        this.raidDropping = 0;
        r.markers.forEach((m, i) => {
          const e = this.spawnEnemy(R.squad[i] as EnemyId, m.x, m.y, hpMul);
          if (e) {
            e.t = 1.5 + Math.random();
            // 이송기 배에서 착지 지점까지 떨어진 뒤 착지 충격 (그동안 무적)
            e.dropT = DROP.fall + i * DROP.stagger;
            e.side = Math.random() < 0.5 ? 1 : -1;
            this.raidDropping++;
            e.dropFromY = r.ship.y + 10;
            e.landX = m.x;
            e.landY = m.y;
            if (this.textures.exists(`${e.tex}_drop`)) e.sprite.setTexture(`${e.tex}_drop`);
            e.sprite.setOrigin(0.5, 1);
          }
          // 말풍선: 반반 확률로 역할 대사 또는 '사이코를 제압하라' 대사
          if (e && talkers.has(i)) {
            this.shout(e, tr((Math.random() < 0.5 ? `squad.${e.id}` : `squad.psycho.${lines[i]}`) as Parameters<typeof tr>[0]), said * 0.5, said === 1);
            said++;
          }
        });
        if (!this.raidDropping) Sound.raidFocus(false);
        // 플레이어 스펙 계산용: 이번 부대 체력 합계
        this.raidSquadHp = this.enemyPool.items.filter((o) => o.active && o.id.startsWith('trooper_')).reduce((t, o) => t + o.maxHp, 0);
        Sound.play('explode');
        r.phase = 'out';
        r.t = 0;
        r.sx = r.ship.x;
      }
    } else {
      const k = Math.min(1, r.t / R.flyOut);
      r.ship.x = r.sx + (VIEW_W + 200) * k * k * k;
      if (k >= 1) {
        r.ship.destroy();
        r.shadow.destroy();
        r.wash?.destroy();
        r.washH?.destroy();
        r.floorGlow?.destroy();
        r.dust?.destroy();
        this.raid = null;
        // 다음 습격 쿨타임은 이번에 내린 요원이 모두 사살된 뒤부터 돈다 (updateRaid 앞부분에서 확인)
        this.nextRaid = Infinity;
        this.raidWaitClear = true;
        return;
      }
    }
    r.ship.y = r.ty - SHIP_LIFT + bob;
    r.shadow.setPosition(r.ship.x, r.ty + 8);
    // 엔진 기울기: 도착해 멈추면 전진 자세(5) → 정지 자세(0), 떠날 때 0 → 5. 프레임당 SHIP_TILT_MS
    const want = r.phase === 'hover' ? 0 : SHIP_TILT_N;
    r.tilt = want > r.tilt ? Math.min(want, r.tilt + (dt * 1000) / SHIP_TILT_MS) : Math.max(want, r.tilt - (dt * 1000) / SHIP_TILT_MS);
    const tk = `dropship_tilt_${String(Math.round(r.tilt)).padStart(2, '0')}`;
    if (this.textures.exists(tk)) r.ship.setTexture(tk);
    else r.ship.setTexture(r.phase === 'hover' || !this.textures.exists('dropship_move') ? 'dropship' : 'dropship_move');
    // 엔진 후류: 이동 중 기운 것, 정지 중 수직 (프레임 왼쪽 위 = 이송기 그림 왼쪽 위 - (12, 4)), 12fps 반복.
    // 엔진이 기우는 동안엔 두 후류를 기울기에 맞춰 겹쳐(수직 ↔ 기운 것) 방향이 함께 돌아가 보이게 한다
    const fr = String(Math.floor(this.elapsed * 12));
    const wx = r.ship.x - r.ship.width / 2 - 12;
    const wy = r.ship.y - r.ship.height / 2 - 4;
    const mk = Phaser.Math.Clamp(r.tilt / SHIP_TILT_N, 0, 1);
    if (r.wash) r.wash.setFrame(String(+fr % 12)).setPosition(wx, wy).setAlpha(r.washH ? mk : 1);
    if (r.washH) r.washH.setFrame(String(+fr % 12)).setPosition(wx, wy).setAlpha(1 - mk);
    // 엔진 후류 빛번짐 (WebGL 글로우, 한 번만 붙임)
    for (const w of [r.wash, r.washH]) if (w && w.preFX && !w.getData('glow')) {
      const G = gameData.shipGlow;
      w.preFX.padding = G.washPad;
      w.preFX.addGlow(Number(G.washColor), G.washOuter, 0, false, 0.1, 12);
      w.setData('glow', 1);
    }
    // 바닥 빨간 조명 빛번짐: 떠 있을수록(엔진이 수직일수록) 밝게, 살짝 일렁임
    if (r.floorGlow) {
      const G = gameData.shipGlow;
      const k = r.phase === 'out' ? 1 - mk : r.phase === 'hover' ? 1 - mk : 0;
      const fl = Settings.reducedFx ? 1 : 0.9 + Math.sin(this.elapsed * 7) * 0.06 + Math.sin(this.elapsed * 13.3) * 0.04;
      r.floorGlow.setPosition(r.tx, r.ty).setDisplaySize(G.floorW, G.floorH).setAlpha(G.floorAlpha * k * fl);
    }
    // 바닥 먼지: 떠 있는 동안에만
    if (r.dust) r.dust.setVisible(r.phase === 'hover').setPosition(r.ship.x, r.ty + 8).setFrame(String(+fr % 24));
    if (r.phase !== 'out') {
      // 착지 지점 표시
      const pulse = 0.5 + Math.sin(this.elapsed * 10) * 0.3;
      for (const m of r.markers) this.fx.lineStyle(1.5, 0xff2a3a, pulse).strokeCircle(m.x, m.y, 9);
    }
  }

  /** 저격수: 멀리 떨어져 붉은 조준선으로 1초 조준한 뒤 강한 한 발 (마지막 0.3초는 조준 고정) */
  private sniperAi(e: Enemy, dt: number, dx: number, dy: number, d: number, slow: number, setV: (x: number, y: number) => void): void {
    const S = gameData.squadAi.sniper;
    e.t -= dt;
    if (e.state === 'walk' && e.t <= 0 && e.act === 'shoot' && !this.untrackedElite && this.onScreen(e.x, e.y)) {
      e.state = 'wind';
      e.t = S.aim;
      Sound.play('lungewarn');
    } else if (e.state === 'wind' && this.untrackedElite) {
      // 조준 중에 투명해지면 표적을 놓친다
      e.state = 'walk';
      e.t = 0.6;
    } else if (e.state === 'wind') {
      setV(0, 0);
      if (e.t > S.lock) {
        e.dirX = dx / d;
        e.dirY = dy / d;
      }
      const locked = e.t <= S.lock;
      this.fx.lineStyle(locked ? 2 : 1, 0xff2a3a, locked ? 0.95 : 0.5).lineBetween(e.x, e.y, e.x + e.dirX * 420, e.y + e.dirY * 420);
      if (e.t <= 0) {
        this.eShot(e.id).fire(e.x, e.y, Math.atan2(e.dirY, e.dirX), S.bulletSpeed, S.bulletDamage, S.bulletLife, 1.6);
        Sound.play('enemyshot');
        e.state = 'walk';
        e.t = S.interval * Phaser.Math.FloatBetween(0.8, 1.2);
      }
    }
  }

  /** 해커: 탱커 뒤에 숨어 있다가 초록 해킹 빔으로 플레이어를 느리게 하고 대시를 막는다 */
  private hackerAi(e: Enemy, dt: number, dx: number, dy: number, d: number, slow: number, setV: (x: number, y: number) => void): void {
    const H = gameData.squadAi.hacker;
    const p = this.untrackedElite ? this.decoy : this.player;
    const tank = this.enemyPool.items.find((o) => o.active && o.id === 'trooper_tank');
    let tx: number;
    let ty: number;
    if (tank) {
      const tdx = tank.x - p.x;
      const tdy = tank.y - p.y;
      const td = Math.hypot(tdx, tdy) || 1;
      tx = tank.x + (tdx / td) * H.behindTank;
      ty = tank.y + (tdy / td) * H.behindTank;
    } else {
      tx = p.x - (dx / d) * H.range;
      ty = p.y - (dy / d) * H.range;
    }
    const gx = tx - e.x;
    const gy = ty - e.y;
    const gd = Math.hypot(gx, gy);
    // 이동은 SquadBrain이 정하고, 탱커 뒤로 숨기(cover)를 골랐을 때만 여기서 자리를 잡는다
    if (e.act === 'cover' && e.state === 'walk' && e.dodgeT <= 0) setV(gd > 6 ? (gx / gd) * e.speed * slow : 0, gd > 6 ? (gy / gd) * e.speed * slow : 0);
    e.t -= dt;
    if (e.state === 'walk' && e.t <= 0 && e.act === 'hack' && !this.untrackedElite && this.onScreen(e.x, e.y)) {
      e.state = 'wind';
      e.t = H.cast;
      Sound.play('glitch');
    } else if (e.state === 'wind' && this.untrackedElite) {
      e.state = 'walk';
      e.t = 0.6;
    } else if (e.state === 'wind') {
      // 지지직거리는 초록 빔 예고
      const steps = 7;
      this.fx.lineStyle(1.5, 0x39ff88, 0.8);
      this.fx.beginPath();
      this.fx.moveTo(e.x, e.y);
      for (let i = 1; i < steps; i++) {
        const k = i / steps;
        this.fx.lineTo(e.x + dx * k + Phaser.Math.Between(-5, 5), e.y + dy * k + Phaser.Math.Between(-5, 5));
      }
      this.fx.lineTo(p.x, p.y);
      this.fx.strokePath();
      if (e.t <= 0) {
        e.state = 'walk';
        e.t = H.interval * Phaser.Math.FloatBetween(0.8, 1.2);
        if (d < H.reach * 1.2) {
          const pl = this.player;
          pl.hackT = H.duration;
          Sound.play('glitch');
          this.screenFlash(0x39ff88, 0.15, 300);
          const t = this.add
            .text(pl.x, pl.y - 26, 'HACKED', { ...TEXT, fontSize: '11px', color: '#39ff88' })
            .setOrigin(0.5)
            .setDepth(90);
          this.tweens.add({ targets: t, y: t.y - 14, alpha: 0, duration: 1200, onComplete: () => t.destroy() });
        }
      }
    }
  }

  // ───────────────────────────── 최종 보스 경계 ─────────────────────────────
  private drawArena(dt: number): void {
    const g = this.arenaG;
    g.clear();
    const a = this.arena;
    if (!a) return;
    a.t += dt;
    const fadeIn = Math.min(1, a.t / 0.6);
    const flicker = Settings.reducedFx ? 0.8 : 0.65 + Math.sin(a.t * 9) * 0.2 + (Math.random() < 0.05 ? -0.3 : 0);
    g.fillStyle(0xff2a3a, 0.05 * fadeIn).fillRect(a.x, a.y, a.w, a.h);
    g.lineStyle(2, 0xff2a3a, flicker * fadeIn).strokeRect(a.x, a.y, a.w, a.h);
    g.lineStyle(1, 0x8a1a70, 0.8 * fadeIn).strokeRect(a.x + 4, a.y + 4, a.w - 8, a.h - 8);
    // 위아래로 흐르는 홀로그램 줄
    for (let i = 0; i < 3; i++) {
      const y = a.y + ((a.t * 40 + (i * a.h) / 3) % a.h);
      g.lineStyle(1, 0xff2a3a, 0.12 * fadeIn).lineBetween(a.x, y, a.x + a.w, y);
    }
    // 모서리 표시
    const c = 14;
    g.lineStyle(3, 0xe8f7ff, 0.9 * fadeIn);
    for (const [x, y, sx, sy] of [[a.x, a.y, 1, 1], [a.x + a.w, a.y, -1, 1], [a.x, a.y + a.h, 1, -1], [a.x + a.w, a.y + a.h, -1, -1]]) {
      g.lineBetween(x, y, x + c * sx, y);
      g.lineBetween(x, y, x, y + c * sy);
    }
    this.arenaLabel?.setPosition(a.x + 8, a.y + a.h - 16).setOrigin(0, 0).setAlpha(flicker * fadeIn);
  }

  private clearArena(): void {
    this.arena = null;
    this.arenaG.clear();
    this.arenaLabel?.destroy();
    this.arenaLabel = null;
  }

  // ───────────────────────────── 보스 ─────────────────────────────
  private spawnBoss(def: BossDef): void {
    this.bossesSpawned++;
    this.bossDef = def;
    const p = this.player;
    const warn = this.add
      .text(VIEW_W / 2, VIEW_H / 2 - 40, tr('boss.warn', { title: def.title }), { ...TEXT, fontSize: '18px', color: '#ff2a3a', align: 'center' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(120);
    this.tweens.add({ targets: warn, alpha: 0.2, duration: 250, yoyo: true, repeat: 4, onComplete: () => warn.destroy() });
    const id = def.id as EnemyId;
    const ar = (def as { arena?: { w: number; h: number } }).arena;
    if (ar) {
      // 최종 보스: 플레이어를 중심으로 붉은 홀로그램 경계를 친다
      this.arena = { x: p.x - ar.w / 2, y: p.y - ar.h / 2, w: ar.w, h: ar.h, t: 0 };
      this.arenaLabel?.destroy();
      this.arenaLabel = this.add
        .text(0, 0, 'SECURITY PERIMETER', { ...TEXT, fontSize: '10px', color: '#ff2a3a' })
        .setDepth(13);
    }
    const bx = this.arena ? this.arena.x + this.arena.w - 60 : p.x + 260;
    // 2·3챕터 보스 체력: 일반 적이 1챕터 같은 시각보다 오른 비율만큼 (레벨이 이어지므로, 사용자 결정)
    const bossHp = this.zoneIdx > 0 ? this.enemyHpMul(def.time) / hpScaleAt(def.time) : 1;
    this.boss = this.spawnEnemy(id, bx, p.y, bossHp);
    if (!this.boss) {
      // 적 수 한도에 걸리면 가장 먼 적 하나를 치우고 다시 시도
      const far = this.enemyPool.items.find((e) => e.active);
      far?.kill();
      this.boss = this.spawnEnemy(id, bx, p.y, bossHp);
    }
    this.bossPhase2 = false;
    this.bossEnraged = false;
    this.bossLastAttack = this.elapsed;
    this.bossLastSummon = this.elapsed;
    this.bossThinkT = 0;
    this.bossPrevPhase = 'walk';
    this.bossAct = 'walk';
    this.bossLastKind = '';
    this.comboFrom = '';
    this.comboCount = 0;
    this.basiliGuards = [];
    this.basiliLast = 'walk';
    this.stompRings = [];
    this.basiliLastCall = this.elapsed - 999;
    this.basiliGlow?.setVisible(false);
    this.basiliCore?.setVisible(false);
    this.bossScores = {};
    this.bossSummoned = [];
    this.bossPVel = { x: 0, y: 0 };
    this.bossPPrev = { x: p.x, y: p.y };
    this.bossShieldT = 0;
    this.bossMissile = 2;
    this.xmLast = 'walk';
    this.xmPlasmaLeft = 0;
    this.xmStarted = false;
    this.xmEntering = false;
    this.xmDeployed = false;
    this.xmRotating = false;
    this.xmWalkPh = 0;
    this.xmFlashT = 0;
    this.hideXm4Layers();
    this.bossAtkT = 0;
    this.bossMinionHp = 0;
    this.bossMinions = [];
    this.bossCharges = 0;
    this.bossVolley = 2;
    this.bossPhase = 'walk';
    this.bossTimer = def.firstWalk;
    this.bossSummon = def.firstSummon;
    const ent = (def as { entrance?: EntranceDef }).entrance;
    if (ent && this.boss) {
      // 등장: 화면 위에서 적이 가장 몰린 자리로 떨어진다 (떨어지는 동안 무적)
      const at = this.entranceSpot(ent);
      this.boss.x = at.x;
      this.boss.y = at.y;
      this.bossTo = { ...at };
      this.bossDir = { x: p.x < at.x ? -1 : 1, y: 0 };
      this.bossPhase = 'enter';
      this.bossTimer = ent.fall;
    }
    const bz = (def as { basili?: BasiliDef }).basili;
    if (bz && this.boss) {
      // 등장: 화면 오른쪽 밖에서 쿵쿵 걸어 들어온다 (그동안 무적)
      this.walkInTo = this.boss.x;
      this.boss.x = Math.max(this.boss.x, this.cameras.main.scrollX + VIEW_W + 50);
      this.bossPhase = 'walkIn';
      this.walkInStep = 0;
    }
    const xzs = (def as { xm4?: Xm4Def }).xm4;
    if (xzs && this.boss && this.xmArt()) {
      // XM-4 등장: 화면 오른쪽 끝에 뚜껑 닫고 서서 대사(클로즈업) → 제자리까지 걸어옴 → 포탑 상승 → 전투 (그동안 무적)
      this.walkInTo = this.boss.x;
      this.boss.x = Math.max(this.boss.x + 120, this.cameras.main.scrollX + VIEW_W - 40);
      this.bossPhase = 'walkIn';
      this.xmStarted = true;
      this.xmEntering = true;
    }
    this.hud.bossName.setText(enemiesData[id].name).setColor(def.final ? '#ff2a3a' : '#ff8a1f');
    Sound.play('bosswarn');
    this.time.delayedCall(450, () => Sound.play('bosswarn'));
    Sound.music('boss', 1200);
    // 등장 연출이 따로 없는 보스(그레고르 등): 나타나자마자 클로즈업 + 등장 대사
    this.containers = [];
    this.clearPlasma();
    const cdi = (def as { cine?: CineDef; entrance?: unknown; basili?: unknown }).cine;
    if (this.boss && cdi?.intro && !(def as { entrance?: unknown }).entrance && !(def as { basili?: unknown }).basili) this.startCine(this.boss, cdi.intro, 0.4);
  }

  private updateBoss(dt: number): void {
    const b = this.boss!;
    const def = this.bossDef!;
    const p = this.player;
    const slow = this.odSlowMul;
    // 투명 중에는 보스도 마지막으로 본 자리를 노린다
    const tg = this.untrackedElite ? this.decoy : p;
    const dx = tg.x - b.x;
    const dy = tg.y - b.y;
    const d = Math.hypot(dx, dy) || 1;
    this.bossTimer -= dt;
    const ph = (def as { phase2?: Phase2 }).phase2;
    if (ph && !this.bossPhase2 && b.hp < b.maxHp * ph.at) {
      // 2페이즈: 연속 돌진 + 탄막
      this.bossPhase2 = true;
      const t = this.add
        .text(VIEW_W / 2, VIEW_H / 2 - 40, 'PHASE 2', { ...TEXT, fontSize: '24px', color: '#ff2a3a' })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(120);
      this.tweens.add({ targets: t, scale: 1.4, alpha: 0, duration: 1100, onComplete: () => t.destroy() });
      Sound.play('bosswarn');
      this.screenFlash(0xff2a3a, 0.25, 400);
      this.shake(300, 0.01);
      this.bossVolley = 1;
      // 아르코난 코어: 2페이즈에 들어가면 방어벽을 세워 잠깐 무적
      this.bossShieldT = (ph as { shield?: number }).shield ?? 0;
      // 바실리: 코트를 찢는 전환 동작 (무적, 하던 공격 취소)
      const bz2 = (def as { basili?: BasiliDef }).basili;
      if (bz2) {
        this.bossPhase = 'phaseShift';
        this.bossTimer = bz2.phaseShift;
        // 전환 동작(코트 찢기)을 클로즈업으로 보여 준 뒤 대사
        const cd = (def as { cine?: CineDef }).cine;
        if (cd?.p2) this.startCine(b, cd.p2, bz2.phaseShift);
      }
    }
    if (this.bossShieldT > 0) {
      this.bossShieldT -= dt;
      const k = 0.5 + Math.sin(this.elapsed * 14) * 0.25;
      this.fx.lineStyle(3, 0x00f0ff, k).strokeCircle(b.x, b.y, b.radius + 14);
      this.fx.fillStyle(0x00f0ff, 0.12).fillCircle(b.x, b.y, b.radius + 14);
    }
    // 헥사워드: 플레이어를 일정 거리만큼 쫓아가는 유도 미사일
    const ms = (def as { missile?: { every: number; count?: number; spread?: number; speed: number; damage: number; homingDist: number } }).missile;
    const xz = (def as { xm4?: Xm4Def }).xm4;
    // XM-4: 점수 AI가 미사일을 고른 프레임(bossMissile = 0)에만 발사
    if (xz && this.bossMissile !== 0) this.bossMissile = 1e9;
    if (ms && (this.bossMissile -= dt) <= 0) {
      this.bossMissile = ms.every;
      this.bossPulse(b);
      // 발사 순간 공격 모션(어깨 미사일 포드가 열린 프레임)을 잠깐 보여준다
      this.bossAtkT = 0.45;
      const n = xz && this.bossPhase2 ? xz.p2.missileCount : (ms.count ?? 1);
      const base = Math.atan2(tg.y - b.y, tg.x - b.x);
      const look = this.textures.exists('boss_missile') ? 'boss_missile' : undefined;
      for (let i = 0; i < n; i++) {
        const a = base + (n > 1 ? (i / (n - 1) - 0.5) * 2 * (ms.spread ?? 0.4) : 0);
        // 포드 4곳에서 퍼져 나가 잠깐 직진한 뒤 추적
        const side = n > 1 ? i / (n - 1) - 0.5 : 0;
        const ox = Math.cos(base + Math.PI / 2) * side * b.radius * 1.2;
        const oy = Math.sin(base + Math.PI / 2) * side * b.radius * 1.2;
        const bl = this.eShot(b.id, 'missile');
        // XM-4: 등 위 미사일 포드에서 (그림 기준 위치), 작은 16방향 미사일
        const pod = xz && this.xmArt() ? this.xmPoint(b, 'pod', 0) : null;
        bl.fire(pod ? pod.x : b.x + ox, pod ? pod.y : b.y - b.radius * 0.4 + oy, a, ms.speed, ms.damage, ms.homingDist / ms.speed + 1.5, look ? 1 : 1.8, look);
        bl.homeDist = ms.homingDist;
        bl.homeDelay = (ms as { straight?: number }).straight ?? 0.5;
        if (xz) bl.turn = Phaser.Math.DegToRad(xz.missileTurn);
        if (pod && this.textures.exists('fx_boss2_missile')) bl.useDirSheet('fx_boss2_missile', 5);
      }
      Sound.play('enemyshot');
    }
    if (this.bossAtkT > 0) this.bossAtkT -= dt;
    const p2 = this.bossPhase2 && ph ? ph : null;

    // 분노: 체력이 낮아지면 붉게 변하고 이동·돌진이 빨라지며 예고가 짧아진다
    const en = (def as { enrage?: EnrageDef }).enrage;
    if (en && !this.bossEnraged && b.hp < b.maxHp * en.at) {
      this.bossEnraged = true;
      b.sprite.setTint(Number(en.tint));
      Sound.play('bosswarn');
      this.screenFlash(0xff2a3a, 0.2, 300);
      this.shake(350, 0.012);
      this.bossPulse(b);
      // 분노(2페이즈) 클로즈업 + 대사
      const cd = (def as { cine?: CineDef }).cine;
      if (cd?.p2) this.startCine(b, cd.p2, 0.2);
    }
    const rage = this.bossEnraged && en ? en.mul : 1;
    const sl = (def as { slam?: SlamDef }).slam;
    const ent = (def as { entrance?: EntranceDef }).entrance;
    const bz = (def as { basili?: BasiliDef }).basili;
    if (bz) this.updateBasiliAlways(b, bz, dt);
    const gz = (def as { gregor?: GregorDef }).gregor;
    if (gz) this.updateContainers(b, gz, dt);
    if (xz) this.updatePlasma(b, xz, dt);
    if (bz && this.updateBasili(b, def, bz, dt, dx, dy, d, tg, p2)) {
      // 바실리 전용 단계 처리됨 (조준·돌진은 아래 공통 코드)
    } else if (gz && this.updateGregor(b, def, gz, dt, dx, dy, d, rage)) {
      // 그레고르 전용 단계 처리됨 (조준·돌진은 아래 공통 코드)
    } else if (xz && this.updateXm4(b, def, xz, dt, dx, dy, d)) {
      // XM-4 전용 단계 처리됨 (점프 낙하는 아래 공통 코드)
    } else if (ent && (this.bossPhase === 'enter' || this.bossPhase === 'taunt')) {
      if (this.bossPhase === 'enter') {
        b.x = this.bossTo.x;
        b.y = this.bossTo.y;
        this.drawEntranceMark(ent);
      }
      if (this.bossTimer <= 0) {
        if (this.bossPhase === 'enter') {
          this.entranceLand(b, ent, sl);
          // 착지 자세를 끝까지 보여주고(마지막 장은 holdLast초 더) 곧바로 걸어오며 말한다 (말풍선은 taunt초)
          this.bossPhase = 'taunt';
          this.bossTimer = (sl?.recover ?? 0) + ent.holdLast;
        } else {
          this.bossPhase = 'walk';
          this.bossTimer = def.firstWalk;
        }
      }
    } else if (this.bossPhase === 'walk') {
      b.x += (dx / d) * b.speed * rage * slow * dt;
      b.y += (dy / d) * b.speed * rage * slow * dt;
      const hk = (def as { hook?: HookDef }).hook;
      // 공격 시작 (점수 AI·거리 규칙 공통)
      const start = (kind: 'charge' | 'hook' | 'slam') => {
        this.bossLastAttack = this.elapsed;
        this.bossLastKind = kind;
        // 열린 콤보 안에서 그 공격을 골랐으면 콤보로 나간 것
        this.comboCount = this.comboNow().includes(kind) ? this.comboCount + 1 : 1;
        this.comboFrom = '';
        this.bossDir = { x: dx / d, y: dy / d };
        if (kind === 'hook' && hk) {
          this.bossPhase = 'hookAim';
          this.bossTimer = hk.aim / rage;
          this.hook = { len: 0, ax: dx / d, ay: dy / d, px: 0, py: 0, t: 0 };
        } else if (kind === 'slam' && sl) {
          this.bossPhase = 'leap';
          this.bossTimer = sl.leap / rage;
          this.bossFrom = { x: b.x, y: b.y };
          this.bossTo = { x: tg.x, y: tg.y };
        } else {
          this.bossPhase = 'aim';
          this.bossTimer = (p2 ? p2.aimTime : def.aimTime) / rage;
          this.bossCharges = p2 ? p2.chargeCount : 1;
        }
      };
      if ((def as { brain?: boolean }).brain) {
        // 점수 AI: 걷는 동안 think초마다 행동 점수를 매겨 가장 높은 행동
        if ((this.bossThinkT -= dt) <= 0) {
          this.bossThinkT = gameData.bossBrain.think;
          const sumId = def.summon;
          this.bossSummoned = this.bossSummoned.filter((e) => e.active && e.id === sumId);
          const { act, scores } = pickBoss({
            d,
            playerHp: Math.max(0, p.hp) / p.maxHp,
            moving: Phaser.Math.Clamp(Math.hypot(this.bossPVel.x, this.bossPVel.y) / PLAYER.speed, 0, 1),
            fleeing: Phaser.Math.Clamp((this.bossPVel.x * dx + this.bossPVel.y * dy) / d / PLAYER.speed, 0, 1),
            dashSpent: p.dashCd > 0,
            sinceAttack: this.elapsed - this.bossLastAttack,
            sinceSummon: this.elapsed - this.bossLastSummon,
            minions: Phaser.Math.Clamp(this.bossSummoned.length / Math.max(1, def.summonCount), 0, 1),
            rage,
            p2: this.bossEnraged,
            current: this.bossAct,
            combo: this.comboNow(),
          });
          this.bossScores = scores;
          this.bossAct = act;
          if (act === 'summon') {
            this.bossLastSummon = this.elapsed;
            this.bossSummon = 0;
            this.bossAct = 'walk';
          } else if (act !== 'walk') {
            start(act);
            this.bossAct = 'walk';
          }
        }
      } else if (this.bossTimer <= 0) {
        if (hk && d >= hk.minDist && d < hk.maxDist) {
          // 중간 거리: 갈고리 (던지기 전 방향을 정해 예고선)
          this.bossPhase = 'hookAim';
          this.bossTimer = hk.aim / rage;
          this.bossDir = { x: dx / d, y: dy / d };
          this.hook = { len: 0, ax: dx / d, ay: dy / d, px: 0, py: 0, t: 0 };
        } else if (sl && d >= sl.minDist) {
          // 멀면 점프 내리찍기: 지금 플레이어 자리에 떨어진다 (뛰기 전에 자리를 정해 바닥에 표시)
          this.bossPhase = 'leap';
          this.bossTimer = sl.leap / rage;
          this.bossFrom = { x: b.x, y: b.y };
          this.bossTo = { x: tg.x, y: tg.y };
          this.bossDir = { x: dx / d, y: dy / d };
        } else {
          this.bossPhase = 'aim';
          this.bossTimer = (p2 ? p2.aimTime : def.aimTime) / rage;
          this.bossCharges = p2 ? p2.chargeCount : 1;
        }
      }
    } else if (sl && (this.bossPhase === 'leap' || this.bossPhase === 'air')) {
      this.drawSlamMark(sl);
      if (this.bossPhase === 'air') {
        const k = Phaser.Math.Clamp(1 - this.bossTimer / (sl.air / rage), 0, 1);
        b.x = Phaser.Math.Linear(this.bossFrom.x, this.bossTo.x, k);
        b.y = Phaser.Math.Linear(this.bossFrom.y, this.bossTo.y, k);
      }
      if (this.bossTimer <= 0) {
        if (this.bossPhase === 'leap') {
          this.bossPhase = 'air';
          this.bossTimer = sl.air / rage;
          Sound.play('bosscharge');
        } else {
          this.bossPhase = 'slam';
          this.bossTimer = sl.recover;
          b.x = this.bossTo.x;
          b.y = this.bossTo.y;
          this.slamLand(b, sl);
        }
      }
    } else if (this.bossPhase.startsWith('hook')) {
      this.updateHook(b, def, dt, rage, sl);
    } else if (this.bossPhase === 'slam') {
      if (this.bossTimer <= 0) {
        this.bossPhase = 'walk';
        this.bossTimer = def.walkTime;
      }
    } else if (this.bossPhase === 'aim') {
      // 돌진 예고선
      this.fx.lineStyle(2, 0xff2a3a, 0.4 + Math.sin(this.elapsed * 40) * 0.3);
      this.fx.lineBetween(b.x, b.y, b.x + (dx / d) * 360, b.y + (dy / d) * 360);
      this.bossDir = { x: dx / d, y: dy / d };
      if (this.bossTimer <= 0) {
        this.bossPhase = 'charge';
        Sound.play('bosscharge');
        // 분노면 속도가 rage배 빨라지는 만큼 시간을 줄여 돌진 거리는 그대로 (빠르게만)
        this.bossTimer = (p2 ? p2.chargeTime : def.chargeTime) / rage;
        // 코박: 돌진 거리 = 플레이어까지 거리 + chargeOver px (속도는 그대로, 시간이 달라짐)
        const over = (def as { chargeOver?: number }).chargeOver;
        if (over !== undefined) this.bossTimer = (d + over) / ((p2 ? p2.chargeSpeed : def.chargeSpeed) * rage);
        this.bossChargeTotal = this.bossTimer;
      }
    } else {
      const sp = (p2 ? p2.chargeSpeed : def.chargeSpeed) * rage;
      b.x += this.bossDir.x * sp * slow * dt;
      b.y += this.bossDir.y * sp * slow * dt;
      if (this.bossTimer <= 0) {
        if (--this.bossCharges > 0 && p2) {
          // 연속 돌진: 짧게 다시 조준
          this.bossPhase = 'aim';
          this.bossTimer = p2.aimTime / rage;
        } else {
          this.bossPhase = 'walk';
          this.bossTimer = def.walkTime;
        }
      }
    }
    const vol: Volley | undefined = p2 && (p2 as Partial<Volley>).volleyEvery ? p2 : (def as { volley?: Volley }).volley;
    if (vol && (this.bossVolley -= dt) <= 0) {
      // 탄막: 보스 주위로 탄을 원형으로 발사 (매번 조금씩 회전)
      this.bossVolley = vol.volleyEvery;
      this.volleyRot += 0.2;
      this.bossPulse(b);
      for (let i = 0; i < vol.volleyCount; i++) {
        const a = this.volleyRot + (i / vol.volleyCount) * Math.PI * 2;
        this.eShot(b.id).fire(b.x, b.y, a, vol.bulletSpeed, vol.bulletDamage, 5);
      }
      Sound.play('enemyshot');
    }
    if (this.arena && this.bossPhase !== 'walkIn') {
      const a = this.arena;
      b.x = Phaser.Math.Clamp(b.x, a.x + b.radius, a.x + a.w - b.radius);
      b.y = Phaser.Math.Clamp(b.y, a.y + b.radius, a.y + a.h - b.radius);
    }

    // 점수 AI 보스는 소환도 점수로 고른다 (고르면 bossSummon = 0)
    if (!(def as { brain?: boolean }).brain) this.bossSummon -= dt;
    else if (this.bossSummon > 0) this.bossSummon = 1e9;
    // 플레이어 이동 속도 (점수 AI 입력, 부드럽게)
    if (dt > 0) {
      const k = Math.min(1, dt * 6);
      this.bossPVel.x += ((p.x - this.bossPPrev.x) / dt - this.bossPVel.x) * k;
      this.bossPVel.y += ((p.y - this.bossPPrev.y) / dt - this.bossPVel.y) * k;
    }
    this.bossPPrev = { x: p.x, y: p.y };
    if (this.bossSummon <= 0) {
      this.bossSummon = def.summonEvery;
      this.bossPulse(b);
      // 소환 목록: summons가 있으면 여러 종류, 없으면 summon × summonCount
      const refill = !!(def as { refill?: boolean }).refill;
      // 보충형(아르코난 코어): 체력은 첫 소환 때 값으로 고정, 살아 있는 부하는 빼고 모자란 만큼만 소환
      if (!refill || this.bossMinionHp <= 0) this.bossMinionHp = this.enemyHpMul(this.elapsed - this.zoneStart);
      if (refill) this.bossMinions = this.bossMinions.filter((m) => m.e.active && m.e.id === m.id);
      const list = ((def as { summons?: { id: string; count: number }[] }).summons ?? [{ id: def.summon, count: def.summonCount }]).flatMap((s) => {
        const alive = refill ? this.bossMinions.filter((m) => m.id === s.id).length : 0;
        return Array<string>(Math.max(0, s.count - alive)).fill(s.id);
      });
      const n = list.length;
      list.forEach((id, i) => {
        const a = (i / n) * Math.PI * 2;
        // XM-4: 드론이 등 뒤(droneSpawn, 몸통 겹 아래 깊이)에서 나와 흩어짐
        const back = def.id === 'boss2' && this.xmArt() ? this.xmBodyTL(b) : null;
        const sp = boss2Anim.droneSpawn.point;
        const e = back
          ? this.spawnEnemy(id as EnemyId, back.x + sp[0] + Math.cos(a) * 10, back.y + sp[1] + Math.sin(a) * 6, this.bossMinionHp)
          : this.spawnEnemy(id as EnemyId, b.x + Math.cos(a) * 40, b.y + Math.sin(a) * 40, this.bossMinionHp);
        if (refill && e) this.bossMinions.push({ e, id });
        if (e) this.bossSummoned.push(e);
      });
    }
    this.animateBoss(b, def, dt);
    // 공격 준비도는 공격이 끝나고 다시 걷기 시작한 때부터 잰다 (긴 공격 직후 바로 다음 공격이 나오지 않게)
    if (this.bossPrevPhase !== 'walk' && this.bossPhase === 'walk') {
      this.bossLastAttack = this.elapsed;
      // 콤보: 방금 끝난 공격에 이어 쓸 공격이 있으면 잠깐(window초) 열어 둔다. 콤보로 나간 공격 뒤에는 다시 열지 않음 (한 번만 이어짐)
      const CB = gameData.bossBrain.combo;
      const table = this.comboTable(def);
      if (this.comboCount < this.comboMax(def) && table[this.bossLastKind]) {
        this.comboFrom = this.bossLastKind;
        this.comboUntil = this.elapsed + CB.window;
        this.bossThinkT = 0;
      } else this.comboFrom = '';
    }
    this.bossPrevPhase = this.bossPhase;
    // 보스가 화면에서 너무 멀어지면 다시 가까이
    const pd = Math.hypot(p.x - b.x, p.y - b.y) || 1;
    if (!this.arena && pd > 520 && this.bossPhase !== 'leap' && this.bossPhase !== 'air' && this.bossPhase !== 'enter' && this.bossPhase !== 'taunt' && this.bossPhase !== 'walkIn') {
      b.x = p.x - ((p.x - b.x) / pd) * 300;
      b.y = p.y - ((p.y - b.y) / pd) * 300;
    }
  }

  // ───────────────────────────── HUD ─────────────────────────────
  private updateHud(): void {
    const p = this.player;
    const m = String(Math.floor(this.elapsed / 60)).padStart(2, '0');
    const s = String(Math.floor(this.elapsed % 60)).padStart(2, '0');
    this.hud.time.setText(`${m}:${s}`);
    this.hud.zone.setText(`${this.zone.label} · ${this.zone.name}${this.heat ? `  ·  HEAT ${this.heat}` : ''}`);
    const g = this.hud.bars;
    g.clear();
    g.fillStyle(0x1a1030).fillRect(0, 0, VIEW_W, 4);
    g.fillStyle(COLORS.green).fillRect(0, 0, (VIEW_W * this.xp) / this.xpToNext(), 4);
    this.hudUi.update({
      elapsed: this.elapsed,
      level: this.level,
      kills: this.kills,
      credits: this.creditsNow(false),
      chips: this.chips,
      hp: p.hp,
      maxHp: p.maxHp,
      shield: p.shield,
      shieldOn: p.shieldT > 0,
      weapons: this.weapons,
      sockets: this.sockets,
      os: { id: this.os.id, level: this.os.level, color: this.os.def.color, hasActive: this.os.hasActive, label: this.specialLabel() },
      odGauge: this.odGauge,
      specialOn: this.specialOn,
      osCdT: this.osCdT,
      dash: 1 - p.dashCd / p.dashCooldownMax,
      touch: isTouch(),
    });

    // 플레이어 아래 체력·대시 바
    const cam = this.cameras.main;
    const sx = p.x - cam.scrollX - 12;
    const sy = p.y - cam.scrollY + 19;
    g.fillStyle(0x300010).fillRect(sx, sy, 24, 3);
    g.fillStyle(COLORS.magenta).fillRect(sx, sy, (24 * Math.max(0, p.hp)) / p.maxHp, 3);
    g.fillStyle(COLORS.cyan, 0.8).fillRect(sx, sy + 4, 24 * (1 - p.dashCd / p.dashCooldownMax), 1);
    // 보조무기 준비 (노랑). 켜짐 창 무기가 켜져 있으면 깜빡임
    const sub = this.weapons.find((w) => w.slot === 'secondary');
    if (sub) {
      const k = sub.readiness();
      g.fillStyle(COLORS.yellow, sub.activeOn ? 0.5 + Math.sin(this.elapsed * 12) * 0.4 : k >= 1 ? 0.9 : 0.45).fillRect(sx, sy + 6, 24 * k, 1);
    }

    this.placeVisorGlows();
    this.drawSquadDebug();

    // 진압대원 체력 바
    for (const e of this.enemyPool.items) {
      if (!e.active || e.isBoss || e.maxHp < 1000) continue;
      // 강하·착지 중(무적)에는 숨기고, 무적이 풀리면 머리 위에 표시
      if (e.dropT > 0 || e.landT > 0) continue;
      const ex = e.x - cam.scrollX - 11;
      const ey = e.y - cam.scrollY + (e.sprite.originY === 1 ? e.footOff - this.bodyTop(e.tex) : -18) - 5;
      g.fillStyle(0x30000a).fillRect(ex, ey, 22, 3);
      g.fillStyle(0xff2a3a).fillRect(ex, ey, (22 * Math.max(0, e.hp)) / e.maxHp, 3);
    }

    // 보스 체력
    if (this.boss) {
      const bw = 280;
      g.fillStyle(0x30000a).fillRect(VIEW_W / 2 - bw / 2, 56, bw, 5);
      g.fillStyle(this.bossDef?.final ? 0xff2a3a : COLORS.orange).fillRect(VIEW_W / 2 - bw / 2, 56, (bw * Math.max(0, this.boss.hp)) / this.boss.maxHp, 5);
    }

    this.hud.debug.setText(
      this.debug
        ? `FPS ${this.game.loop.actualFps.toFixed(0)}\nENEMY ${this.enemyPool.countActive()}\nBULLET ${this.bullets.countActive()}\n` +
            `HP ${Math.ceil(p.hp)}/${p.maxHp}${this.god ? ' GOD' : ''}\n[N]+100 [T]+60s [L]lvl\n[G]god [O]ability\n${tr('debug.rarity')}`
        : '',
    );
  }
}
