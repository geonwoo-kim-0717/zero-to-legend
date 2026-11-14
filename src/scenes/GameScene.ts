import Phaser from 'phaser';
import { BASE_TEXT, setupCamera } from '../ui/text';
import { VIEW_W, VIEW_H, PLAYER, GRID_CELL, COLORS, MAX_ENEMY_RADIUS } from '../config';
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
import { InputController } from '../systems/InputController';
import { createWeapon, type WeaponBase, type WeaponId } from '../weapons';
import type { GameContext, Stats, DamageTag, FxOpts } from '../weapons/types';
import meta from '../data/meta.json';
import zonesData from '../data/zones.json';
import wavesData from '../data/waves.json';
import type { Wave } from '../systems/Spawner';
import { Save, type Runner, type RunnerId, type SpecialId, type RunStats } from '../systems/Save';
import { rollChoices, abilityCard, computeStats, passiveAmount, passiveAbility, type Choice, type PassiveId, type PassiveState } from '../systems/Progression';
import { LevelUpUI } from '../ui/LevelUpUI';
import { Sound, type SfxKey, type MusicKey } from '../systems/Sound';
import { addMuteToggle, addFxToggle, addFullscreenToggle } from '../ui/MuteToggle';
import { isTouch } from '../systems/Fullscreen';
import { Settings } from '../systems/Settings';
import { Ads } from '../systems/Ads';
import type { RunResult } from './ResultScene';
import { t as tr, I18n } from '../i18n';

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
const HP_W = 120;
type BossPhase = 'walk' | 'aim' | 'charge';
/** 블랙 실드 요원 공격 그림·이펙트 (아트 tools/art/sprites2026/scripts/troopers6/keys/atk_meta.json) */
const TROOPER_ATK = {
  tank: { ms: [90, 110, 140, 70, 90, 120, 110, 100], size: [48, 42], fxStart: 4, anchor: [41, 23], fx: 'fx_shield_bash', fxN: 8, fxSize: [64, 40], pivot: [32, 18] },
  melee: { ms: [90, 110, 140, 60, 80, 120, 110, 100], size: [48, 42], fxStart: 3, anchor: [22, 41], fx: 'fx_baton_slash', fxN: 10, fxSize: [136, 104], pivot: [44, 92] },
  hacker: { ms: [100, 120, 160, 80, 110, 160, 120, 100], size: [48, 42], fxStart: 4, anchor: [37, 13], fx: 'fx_hack_pulse', fxN: 10, fxSize: [64, 48], pivot: [20, 24] },
  sniper: { ms: [100, 140, 200, 70, 90, 110, 140, 140], size: [54, 48], fxStart: 3, anchor: [45, 47], fx: 'fx_sniper_muzzle', fxN: 23, fxSize: [96, 72], pivot: [44, 66] },
} as const;
/** 진압대 강하: 떨어지는 시간, 대원 사이 간격, 착지 충격 컷 유지 시간 (그동안 무적) */
const DROP = { fall: 0.45, stagger: 0.12, land: 0.7 };
/** 블랙 실드 이송기가 착지 지점 위로 떠 있는 높이 (그림 112x55 기준) */
const SHIP_LIFT = 44;
type BossDef = (typeof gameData.bosses)[number];
type MeleeDef = { range: number; interval: number; windup: number; lungeTime: number; lungeSpeed: number };
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

  private weapons: WeaponBase[] = [];
  private passives = new Map<PassiveId, PassiveState>();
  private state: State = 'play';
  private elapsed = 0;
  private kills = 0;
  private level = 1;
  private xp = 0;
  private pendingLevels = 0;
  /** 엘리트(중간) 보스 처치로 받을 전설·신화 확정 보상 수 */
  private bossRewards = 0;
  private rewardOpen = false;
  private rerolls = 0;
  private choices: Choice[] = [];
  private debug = false;
  private god = false;

  /** 이번 판의 러너와 장착한 특수 능력 */
  private runner!: Runner;
  private specialId: SpecialId = 'neural';
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
  /** 최종 보스전의 붉은 홀로그램 경계 (월드 좌표) */
  private arena: { x: number; y: number; w: number; h: number; t: number } | null = null;
  private arenaG!: Phaser.GameObjects.Graphics;
  private arenaLabel: Phaser.GameObjects.Text | null = null;
  /** 블랙 실드 진압대 습격 */
  private nextRaid = 0;
  /** 이번 판에 온 습격 횟수 (습격마다 체력 증가) */
  private raidCount = 0;
  private raid: {
    phase: 'in' | 'hover' | 'out';
    t: number;
    sx: number;
    tx: number;
    ty: number;
    ship: Phaser.GameObjects.Image;
    /** 엔진 후류(이동 중 기운 것/정지 중 수직)와 바닥 먼지(정지 중에만) */
    wash: Phaser.GameObjects.Image | null;
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
  private icons: { img: Phaser.GameObjects.Image; lvl: Phaser.GameObjects.Text; star: Phaser.GameObjects.Text }[] = [];

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
    this.elapsed = this.kills = this.xp = this.pendingLevels = this.bossRewards = 0;
    this.rewardOpen = false;
    this.level = 1;
    this.rerolls = gameData.rerollsPerRun;
    this.weapons = [];
    this.passives = new Map();
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
    this.nextRaid = ZONES[0].raidStart + Math.random() * gameData.raid.firstDelayMax;
    this.mergeT = this.dashGhostT = 0;
    this.dashRings = [];
    this.icons = [];
    this.dpsBuckets = new Map();
    this.dpsStart = new Map();
    this.critNums = [];
    this.dpsSec = -1;
    this.dpsShowT = 0;
    this.dmgSrc = null;
    this.overdrive = this.specialOn = this.berserk = this.wasUntracked = false;
    this.runner = Save.runner();
    this.specialId = Save.special(this.runner.id as RunnerId);
    this.revives = Save.clinicLevel('revive');
    this.regen = Save.clinicValue('regen');
    this.run = { kills: 0, droneKills: 0, meleeKills: 0, trooperKills: 0, midbossKills: 0, bossKills: 0, hexKills: 0, coreKills: 0, time: 0, level: 1, zone: 1 };
    this.zoneIdx = 0;
    this.zoneStart = 0;
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
    const marketOn = Save.data.market.filter((id) => !Save.data.marketOff.includes(id));
    this.weaponPool = Array.from(new Set([...meta.market.starter, ...marketOn, this.runner.startWeapon])) as WeaponId[];
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
    this.levelUi = new LevelUpUI(this);

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

    this.addWeapon(this.runner.startWeapon as WeaponId);
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
    const fsBtn = addFullscreenToggle(this, fxBtn.x + fxBtn.width + 12, VIEW_H - 18, 0);
    // 전투 중에는 숨기고 일시정지 화면에서만 보여준다 (M·V·F 키는 언제나 동작)
    this.settingUi = [muteBtn, fxBtn, ...(fsBtn.input?.enabled ? [fsBtn] : [])];
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
    // 1챕터 의뢰 브리핑
    // 첫 판: 진과 처음 만나는 대사 (아직 빚이 없다). 두 번째 판부터: 리퍼닥 수리비를 갚으라는 대사
    // 첫 판: 진과 첫 만남 · 지난 판 클리어: 새 주인 밑의 하층가 · 지난 판 2챕터 이상에서 쓰러짐: 바실리 백업 의체 · 그 밖: 빚 갚기
    const z0 = ZONES[0] as Zone & { intro?: Line[]; introFirst?: Line[]; introRetry?: Line[]; introClear?: Line[] };
    const sd = Save.data;
    const lines = sd.stats.runs === 0 ? z0.introFirst : sd.lastWin ? z0.introClear : sd.lastZone >= 1 ? z0.introRetry : z0.intro;
    this.startDialog(lines ?? z0.intro ?? [], () => undefined);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, this.onBlur, this);
      this.levelUi.hide();
      Sound.musicRate(1);
      Sound.slowWorld(false);
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
    kb.on('keydown-SPACE', () => this.state === 'dialog' && this.advanceDialog());
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
      else if (this.state === 'dialog') this.advanceDialog();
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
    const fixed = <T extends Phaser.GameObjects.Text>(t: T) => t.setScrollFactor(0).setDepth(100);
    this.hud = {
      bars: this.add.graphics().setScrollFactor(0).setDepth(100),
      time: fixed(this.add.text(VIEW_W / 2, 10, '00:00', { ...TEXT, fontSize: '16px' }).setOrigin(0.5, 0)),
      level: fixed(this.add.text(HP_W + 14, 6, 'LV 1', TEXT)),
      hp: fixed(this.add.text(8 + HP_W / 2, 6, '', { ...TEXT, fontSize: '10px', strokeThickness: 3 }).setOrigin(0.5, 0)),
      kills: fixed(this.add.text(VIEW_W - 8, 10, '0', TEXT).setOrigin(1, 0)),
      debug: fixed(this.add.text(VIEW_W - 8, 42, '', { ...TEXT, fontSize: '11px', color: '#39ff88', align: 'right' }).setOrigin(1, 0)),
      od: fixed(this.add.text(VIEW_W / 2, VIEW_H - 22, this.specialLabel(), { ...TEXT, fontSize: '11px', color: SP[this.specialId].color }).setOrigin(0.5, 1)),
      credits: fixed(this.add.text(VIEW_W - 8, 26, '', { ...TEXT, fontSize: '11px', color: '#fff23a' }).setOrigin(1, 0)),
      bossName: fixed(this.add.text(VIEW_W / 2, 42, '', { ...TEXT, fontSize: '11px', color: '#ff2a3a' }).setOrigin(0.5, 0)),
      zone: fixed(this.add.text(VIEW_W / 2, 29, '', { ...TEXT, fontSize: '10px', color: '#8a7aa8' }).setOrigin(0.5, 0)),
      center: fixed(
        this.add.text(VIEW_W / 2, VIEW_H / 2, '', { ...TEXT, fontSize: '20px', align: 'center' }).setOrigin(0.5).setVisible(false),
      ),
    };
    this.hud.time.setShadow(0, 0, '#00f0ff', 6, true, true);
    // 무기별 DPS: 왼쪽, 보유 아이콘 아래
    this.dpsText = fixed(this.add.text(8, 84, '', { ...TEXT, fontSize: '8px', color: '#c8b8e8', lineSpacing: 3 }));
  }

  // ───────────────────────────── GameContext ─────────────────────────────
  damage(e: Enemy, amount: number, tag?: DamageTag): boolean {
    if (!e.active) return false;
    if (e === this.boss && this.bossShieldT > 0) return false;
    // 회피 기동 중인 진압대는 피해를 받지 않음
    if (e.dodgeT > 0) return false;
    // 강하·착지 충격 중인 진압대는 무적
    if (e.dropT > 0 || e.landT > 0) return false;
    const DG = gameData.squadAi.dodge;
    if (DG.roles.includes(e.id) && e.dodgeCd < DG.reactBelow && e.hp > amount) this.startDodge(e);
    // 체력이 처음 30% 밑으로 떨어지면 한 번, 연속 회피로 플레이어에게서 빠진다
    if (DG.roles.includes(e.id) && !e.fled && e.hp > amount && e.hp - amount < e.maxHp * DG.fleeBelow) {
      e.fled = true;
      e.fleeLeft = DG.fleeCount;
      e.fleeCd = 0;
    }
    // 카운터 몬스터: 특정 피해 종류에 강함
    const res = (CT.mul as Record<string, Record<string, number>>)[e.id];
    if (res && tag && res[tag] !== undefined) amount *= res[tag];
    if (e.id === 'c_thorn' && tag === 'melee') this.thornReflect();
    // 강화 근섬유 특수 능력: 치명타 · 치명 폭주 · 분노 · 연속 처치
    const frenzy = this.pHas('critFrenzy');
    if ((frenzy || this.pHas('crit')) && Math.random() < (frenzy ? 0.25 : 0.1)) {
      amount *= frenzy ? 3 : 2;
      this.burst(e.x, e.y, COLORS.yellow, 4);
      this.critText(e.x, e.y - e.radius - 4, Math.round(amount));
    }
    if (this.pHas('rage')) amount *= 1 + 0.4 * (1 - this.player.hp / this.player.maxHp);
    if (this.streak > 0) amount *= 1 + 0.02 * this.streak;
    // 처형자: 맞고 체력 15% 이하로 남는 일반 적은 즉사
    if (!e.isBoss && this.pHas('executioner') && e.hp - amount <= e.maxHp * 0.15) amount = Math.max(amount, e.hp);
    this.logDamage(Math.min(amount, Math.max(0, e.hp)));
    if (e.hit(amount)) {
      if (tag === 'melee') this.run.meleeKills++;
      this.killEnemy(e);
      return true;
    }
    return false;
  }

  // ───────────── 적 말풍선 (블랙 실드 출동 대사) ─────────────
  private shouts: { e: Enemy; box: Phaser.GameObjects.Text; t: number; delay: number; below: boolean }[] = [];

  private shout(e: Enemy, text: string, delay: number, below = false): void {
    const box = this.add
      .text(e.x, e.y, text, { ...TEXT, fontSize: '9px', color: '#ffffff', backgroundColor: '#3a0a12', padding: { x: 5, y: 3 }, strokeThickness: 0 })
      .setOrigin(0.5, below ? 0 : 1)
      .setDepth(96)
      .setVisible(false);
    this.shouts.push({ e, box, t: 0, delay, below });
  }

  private updateShouts(dt: number): void {
    for (const s of this.shouts) {
      s.t += dt;
      const live = s.t - s.delay;
      if (!s.e.active || live > 1.5) {
        s.box.destroy();
        continue;
      }
      if (live < 0) continue;
      s.box.setVisible(true).setPosition(s.e.x, s.below ? s.e.y + s.e.radius + 8 : s.e.y - s.e.radius - 10).setAlpha(live > 1.2 ? (1.5 - live) / 0.3 : 1);
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

  /** 치명타 피해 숫자: 위로 떠오르며 사라짐 (최대 40개 재사용) */
  private critNums: { t: Phaser.GameObjects.Text; life: number }[] = [];
  private critText(x: number, y: number, dmg: number): void {
    let n = this.critNums.find((o) => o.life <= 0);
    if (!n) {
      if (this.critNums.length >= 40) return;
      n = { t: this.add.text(0, 0, '', { ...TEXT, fontSize: '10px', color: '#fff23a', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(97), life: 0 };
      this.critNums.push(n);
    }
    n.life = 0.7;
    n.t.setText(`${dmg}!`).setPosition(x + (Math.random() - 0.5) * 8, y).setAlpha(1).setScale(1.3).setVisible(true);
  }

  private updateCritNums(dt: number): void {
    for (const n of this.critNums) {
      if (n.life <= 0) continue;
      n.life -= dt;
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

  /** 해커가 살아 있으면 블랙 실드 요원 전원이 CC를 막는다 (기절·둔화 무시, 끌어당김·넉백 75% 감소, 조종은 1.5초 뒤 해제) */
  private hackerShield(e: Enemy): boolean {
    if (!e.id.startsWith('trooper_')) return false;
    const on = this.enemyPool.items.some((o) => o.active && o.id === 'trooper_hacker');
    // 막을 때 해커가 외친다 (출동당 한 번)
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
    return this.hackerShield(e) ? gameData.squadAi.hacker.ccPullKnockMul : 1;
  }

  /** 실 인형: 적을 잠깐 조종해 다른 적과 싸우게 한다 (보스 제외) */
  charm(e: Enemy, seconds: number): void {
    if (!e.active || e.isBoss) return;
    if (this.hackerShield(e)) seconds = Math.min(seconds, gameData.squadAi.hacker.charmMax);
    e.charmT = Math.max(e.charmT, seconds);
    e.sprite.setTint(0xff2bd6);
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

  /** 2챕터 첫 도달: 픽서가 넘겨 준 가속 모듈 제어 코드로 배속 버튼이 열린다 */
  private unlockSpeed(): void {
    if (Save.data.speedUnlocked) return;
    Save.data.speedUnlocked = true;
    Save.write();
    this.makeSpeedBtn();
    const b = this.speedBtn!;
    this.tweens.add({ targets: b, alpha: 0.25, duration: 200, yoyo: true, repeat: 4, ease: 'Sine.inOut' });
  }

  /** 일시정지 화면의 '임무 포기' 버튼 (누르면 한 번 더 묻고, 포기하면 패배로 결과 화면) */
  private showPauseMenu(on: boolean): void {
    for (const o of this.pauseUi) o.destroy();
    this.pauseUi = [];
    for (const b of this.settingUi) b.setVisible(on);
    if (!on) return;
    // 뒤를 어둡게 해서 글자가 잘 보이게
    this.pauseUi.push(this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x000000, 0.5).setOrigin(0).setScrollFactor(0).setDepth(99));
    this.buildPanel();
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
    btn(VIEW_W / 2, VIEW_H / 2 + 84, tr('pause.abandon'), '#ff5a6a', () => {
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
    });
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
      if (first && !Save.data.tutCluster && this.levelUps === 4) this.giftScreen = 'cluster';
      else if (first && !Save.data.tutChain && this.elapsed >= 180) this.giftScreen = 'chain';
    }
    this.choices = rollChoices(this.weapons, this.passives, this.rewardOpen ? 'boss' : this.forcedRarity, {
      guaranteeWeapon: this.weapons.length < gameData.guaranteeWeaponUntil,
      pool: this.weaponPool,
      luck: this.pHas('luckCircuit'),
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
    );
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
    if (c.kind === 'weapon') {
      const id = c.id as WeaponId;
      const owned = this.weapons.find((o) => o.id === id);
      const w = owned ?? this.addWeapon(id);
      if (owned) w.levelUp();
      w.bonus += c.rarity.weaponBonus;
      if (c.ability) {
        w.addAbility(c.ability.id);
        this.keepables.push({ kind: 'weapon', id, abilityId: c.ability.id, rarity: c.rarity.id });
      }
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
      const amt = c.maxed ? 0 : passiveAmount(id, c.rarity);
      st.total += amt;
      // 공격 속도는 곱연산으로 쌓는다
      if (passivesData[id].stat === 'cooldownMul') st.speedMul = (st.speedMul ?? 1) * (1 + amt / 100);
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
    if (this.pendingLevels > 0 || this.bossRewards > 0) this.openLevelUp();
    else this.state = 'play';
  }

  private addWeapon(id: WeaponId): WeaponBase {
    const w = createWeapon(id, this);
    this.weapons.push(w);
    return w;
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
    this.controls.update(1 - p.dashCd / p.dashCooldownMax);
    if (this.controls.consumeDash() && p.tryDash()) {
      // 화면 전체 번쩍임 대신 잔상 + 작은 고리
      this.dashRings.push({ r: 8, life: 0.22 });
      Sound.play('dash');
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
    p.update(dt, this.controls.moveX, this.controls.moveY, this.stats.moveMul * hackMul);
    this.dashPath = null;
    if (this.wasDashing && !p.dashing) {
      this.dashPath = { x1: this.dashFrom.x, y1: this.dashFrom.y, x2: p.x, y2: p.y };
      // 칼날 대시: 지나간 길의 적에게 피해
      if (this.pHas('bladeDash')) this.lineDamage(this.dashPath, 14, 60 * this.stats.damageMul, COLORS.magenta);
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
    if (this.transitionT <= 0) this.spawner.update(dt, zt, zt, (wavesData as Record<string, Wave[]>)[this.zone.id], p.x, p.y, this.zoneHpMul(zt), this.zoneSpawnMul(zt));
    this.updateZoneRule(dt);
    if (this.transitionT <= 0) this.updateCounters(dt, zt);
    this.thornT -= dt;

    this.grid.clear();
    for (const e of this.enemyPool.items) if (e.active) this.grid.insert(e);

    this.updateOverdrive(dt);
    this.updateEnemies(dt);
    if (this.boss) this.updateBoss(dt);
    for (const w of this.weapons) {
      this.dmgSrc = w.id;
      w.update(dt);
    }
    this.dmgSrc = null;
    this.updateBullets(dt);
    this.updateDps(dt);
    this.updateCritNums(dt);
    this.updateEnemyBullets(dt);
    this.updateFx(dt);
    this.updateShouts(dt);
    this.updateChatter(dt);
    this.drawOverclockFx(realDt);
    this.updatePickups(dt);
    this.updateHud();

    if (this.transitionT > 0 && (this.transitionT -= dt) <= 0) this.startZoneDialog();
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

  /** 처음 만나는 적이면 진이 문자로 정체와 주의할 점을 알려 준다 (저장해서 다음 판부터는 생략) */
  private introduceUnit(e: Enemy): void {
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
    const slow = this.overdrive ? OD.enemySpeedMul : 1;
    const hidden = this.untracked;
    const conv = this.zone.rule === 'conveyor';
    for (const e of this.enemyPool.items) {
      if (!e.active) continue;
      if (e.dropT > 0 || e.landT > 0) {
        this.updateDrop(e, dt);
        continue;
      }
      if (e.charmT > 0) {
        e.charmT -= dt;
        if (e.charmT <= 0) e.sprite.clearTint();
        else {
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
        const m = (gameData.melee as Record<string, MeleeDef>)[e.id];
        if (m) {
          // 사이버 사이코·진압대원: 가까워지면 잠깐 멈춰 예고한 뒤, 그 방향으로 돌진
          e.t -= dt;
          if (e.state === 'walk' && e.t <= 0 && d < m.range) {
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
        // 진압대 회피 기동
        const DGM = gameData.squadAi.dodge;
        if (DGM.roles.includes(e.id)) {
          if (e.fleeLeft > 0) e.fleeCd -= dt;
          if (e.dodgeT > 0) {
            e.dodgeT -= dt;
            vx = e.dodgeVX * slow;
            vy = e.dodgeVY * slow;
            if ((e.ghostT -= dt) <= 0) {
              e.ghostT = DGM.ghostEvery;
              this.spawnGhostAt(e.sprite.texture.key, e.x, e.y, e.sprite.flipX, 0xff2a3a);
            }
          } else if (e.fleeLeft > 0) {
            // 체력 30% 미만 도주: 회피 시작 간격 0.5초로 연속 회피
            if (e.fleeCd <= 0) {
              e.fleeLeft--;
              e.fleeCd = DGM.fleeGap;
              this.startDodge(e, true);
            }
          } else if ((e.dodgeCd -= dt) <= 0 && e.state === 'walk' && !hidden && this.onScreen(e.x, e.y)) this.startDodge(e);
        }
        if (e.slowT > 0) {
          e.slowT -= dt;
          vx *= 0.55;
          vy *= 0.55;
        }
        if (conv) vx += this.conveyorAt(e.y);
        if (e.id === 'trooper_sniper') this.sniperAi(e, dt, dx, dy, d, slow, (x, y) => ((vx = x), (vy = y)));
        else if (e.id === 'trooper_hacker') this.hackerAi(e, dt, dx, dy, d, slow, (x, y) => ((vx = x), (vy = y)));
        // 그림이 오른쪽을 보고 있으므로 플레이어가 왼쪽에 있으면 뒤집는다 (드론은 대칭이라 그대로)
        if (e.id !== 'drone') e.sprite.setFlipX(dx < 0);
        this.animateEnemy(e, dt, d);
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
          this.spawner.spawnAround(e.id, p.x, p.y, hpScaleAt(this.elapsed - this.zoneStart) * this.zone.hpMul, true);
          continue;
        }
      }
      this.placeEnemy(e);
      if (e.id.startsWith('c_')) this.fx.lineStyle(1, Phaser.Display.Color.HexStringToColor((CT.info as Record<string, { color: string }>)[e.id].color).color, 0.7).strokeCircle(e.x, e.y, e.radius + 4);
      this.tickHitFlash(e, dt);
      // 접촉 피해 (조종당한 적은 플레이어를 공격하지 않음)
      const rr = p.radius + e.radius;
      if (e.charmT <= 0 && p.invuln <= 0 && (p.x - e.x) ** 2 + (p.y - e.y) ** 2 < rr * rr) {
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

  /** 조종당한 적: 가장 가까운 다른 적에게 달려가 들이받는다 */
  private charmedAi(e: Enemy, dt: number): void {
    let best: Enemy | null = null;
    let bd = 200 * 200;
    for (const o of this.grid.query(e.x, e.y, 200, this.near)) {
      if (o === e || !o.active || o.charmT > 0) continue;
      const d = (o.x - e.x) ** 2 + (o.y - e.y) ** 2;
      if (d < bd) ((bd = d), (best = o));
    }
    e.charmCd -= dt;
    if (best) {
      const d = Math.sqrt(bd) || 1;
      e.x += ((best.x - e.x) / d) * e.speed * 1.3 * dt;
      e.y += ((best.y - e.y) / d) * e.speed * 1.3 * dt;
      if (d < e.radius + best.radius + 2 && e.charmCd <= 0) {
        e.charmCd = 0.5;
        this.damage(best, (20 + e.damage * 3) * this.stats.damageMul, 'melee');
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
    if (this.god || this.untracked) return;
    if (src) this.lastHit = src;
    dmg *= 1 + this.heat * meta.heat.damagePer;
    // 적 공격력도 챕터 안에서 분마다 조금씩 오른다 (챕터마다 0부터)
    // (보스 몸통·돌진은 제외: 보스는 늘 챕터 끝에 나와서 이 보정이 통째로 얹히면 다섯 대에 끝난다)
    const bossHit = !!src && (src.kind === 'boss' || src.kind === 'contact') && /^(mid)?boss/.test(src.id);
    if (!bossHit) dmg *= 1 + ((this.elapsed - this.zoneStart) / 60) * gameData.enemyDamageGrowthPerMin;
    if (this.pHas('steelSkin')) dmg *= 0.85;
    this.sinceHurt = 0;
    // 순간 재부팅 쉴드가 먼저 피해를 흡수
    if (p.shieldT > 0 && p.shield > 0) {
      const absorbed = Math.min(p.shield, dmg);
      p.shield -= absorbed;
      dmg -= absorbed;
      if (dmg <= 0) {
        p.invuln = 0.3;
        this.burst(p.x, p.y, COLORS.cyan, 6);
        Sound.play('block');
        return;
      }
    }
    p.hp -= dmg;
    p.invuln = bossHit ? PLAYER.bossHurtInvuln : PLAYER.hurtInvuln;
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
          b.hits.push(e);
          const killed = this.damage(e, b.damage, b.tag ?? 'bullet');
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
    this.fireBullet(hit.x, hit.y, a, b.speed, b.damage, { target: best, chain: b.chain - 1 });
  }

  /** 사이버웨어 특수 능력 중 시간에 따라 발동하는 것 */
  private updatePassiveSpecials(dt: number): void {
    const p = this.player;
    this.sinceHurt += dt;
    if (this.pHas('nanoRegen') && this.sinceHurt > 3 && p.hp < p.maxHp) this.heal(2 * dt, true);
    if (this.streakT > 0 && (this.streakT -= dt) <= 0) this.streak = 0;
    // 가속 연쇄: 처치 후 1초 동안 공격 속도 +20% (곱연산)
    if (this.rushT > 0) this.rushT -= dt;
    this.stats.cooldownMul = this.baseCooldownMul / (this.rushT > 0 ? 1.2 : 1);
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

  private killEnemy(e: Enemy): void {
    this.kills++;
    if (e.isBoss) {
      const def = this.bossDef!;
      this.boss = null;
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
        // 중간 보스 보상: 큰 경험치 덩어리와 회복
        this.dropPickup('xp', e.x, e.y, def.rewardXp);
        this.dropPickup('heal', e.x + 14, e.y, gameData.healAmount * 2);
        // 엘리트 보스 보상: 전설·신화 확정 카드
        this.bossRewards++;
        Sound.music(this.zoneMusic, 1500);
      }
      return;
    }
    this.burst(e.x, e.y, e.id === 'thug' ? COLORS.orange : e.id === 'gunner' ? 0xb6ff3a : e.id.startsWith('trooper') ? 0xff2a3a : COLORS.magenta, e.id.startsWith('trooper') ? 20 : 8);
    Sound.play('kill');
    this.dropPickup('xp', e.x, e.y, e.xp);
    if (Math.random() < gameData.healDropChance) this.dropPickup('heal', e.x + 6, e.y, gameData.healAmount);
    if (!this.specialOn) this.odGauge = Math.min(100, this.odGauge + OD.perKill);
    if (this.berserk) this.heal(SP.berserk.healPerKill, true);
    if (this.pHas('killStreak')) {
      this.streak = Math.min(20, this.streak + 1);
      this.streakT = 3;
    }
    if (this.pHas('killRush')) this.rushT = 1;
    if (e.id === 'drone') this.run.droneKills++;
    else if (e.id.startsWith('trooper')) this.run.trooperKills++;
    e.kill();
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
      if (d < 10) {
        k.kill();
        if (k.kind === 'heal') {
          this.heal(k.value);
          Sound.play('heal');
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
    this.xp += v * (this.pHas('dataGorge') ? 1.3 : 1);
    while (this.xp >= this.xpToNext()) {
      this.xp -= this.xpToNext();
      this.level++;
      this.pendingLevels++;
    }
  }

  // ───────────────────────────── 오버드라이브 ─────────────────────────────
  private updateOverdrive(dt: number): void {
    if (!this.specialOn && this.odGauge >= 100) this.activateSpecial();
    if (this.specialOn) {
      this.odTime -= dt;
      this.odGauge = (this.odTime / this.specialDuration) * 100;
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
      if (this.odTime <= 0) {
        if (this.overdrive) {
          Sound.slowWorld(false);
          Sound.play('slowmo_out');
        }
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
      }
    }
    for (const g of this.ghosts) {
      if (g.life <= 0) continue;
      g.life -= dt;
      g.img.setAlpha(Math.max(0, g.life / 0.25) * 0.6);
      if (g.life <= 0) g.img.setVisible(false);
    }
  }

  /** 게이지가 가득 차면 장착한 특수 능력을 10초간 켠다 */
  /** 특수 능력 지속 시간 (능력마다 따로 정할 수 있음, 없으면 공통값) */
  private get specialDuration(): number {
    return (SP[this.specialId] as { duration?: number }).duration ?? OD.duration;
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

  /** 특수 능력 게이지 이름: 한국어 화면은 한글 이름, 영어는 대문자 라벨 */
  private specialLabel(): string {
    const def = SP[this.specialId];
    return I18n.lang === 'ko' ? def.name : def.label;
  }

  private activateSpecial(): void {
    const def = SP[this.specialId];
    const color = Phaser.Display.Color.HexStringToColor(def.color).color;
    this.specialOn = true;
    this.odTime = this.specialDuration;
    this.screenFlash(color, 0.3, 350);
    Sound.play('overclock');
    if (this.specialId === 'neural') {
      this.overdrive = true;
      this.odOverlay.setFillStyle(COLORS.magenta, 0.08).setVisible(true);
      // 슬로우 모션 + 충격파 + 색감 변화
      this.slowmo = OD.slowmoTime;
      // 슬로우 모션: 깊게 떨어지는 '우우웅' + 음악도 같이 느려짐
      Sound.play('slowmo');
      // 발동 내내 배경음악·효과음이 느리고 낮게 (산데비스탄 느낌)
      Sound.slowWorld(true);
      this.shockwaves.push({ r: 0, life: 0.6 }, { r: -40, life: 0.8 });
      this.odFxOn = false;
      this.syncOdFx();
    } else if (this.specialId === 'berserk') {
      this.berserk = true;
      this.recalcStats();
      this.odOverlay.setFillStyle(0xff2a3a, 0.08).setVisible(true);
      this.shake(200, 0.01);
    } else if (this.specialId === 'cloak') {
      this.decoy = { x: this.player.x, y: this.player.y };
      Sound.play('glitch');
    } else {
      this.orbitalT = 0;
      this.orbitalDone = 0;
      Sound.play('bosswarn');
    }
    const t = this.add
      .text(VIEW_W / 2, VIEW_H / 2 - 50, this.specialLabel(), { ...TEXT, fontSize: '22px', color: def.color })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(120)
      .setShadow(0, 0, def.color, 10, true, true);
    this.tweens.add({ targets: t, scale: 1.4, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  /** 궤도 폭격: 예고 표시(붉은 조준선) 뒤 화면 안 모든 적에게 폭발 피해 */
  private updateOrbital(dt: number): void {
    const O = SP.orbital;
    this.orbitalT += dt;
    if (this.orbitalDone >= O.strikes) return;
    const at = 0.4 + (this.orbitalDone * OD.duration) / O.strikes;
    if (this.orbitalT >= at - O.warn) {
      const k = Phaser.Math.Clamp((at - this.orbitalT) / O.warn, 0, 1);
      const cam = this.cameras.main;
      // 화면 가운데 큰 조준 원 + 적마다 작은 표적
      this.fx.lineStyle(2, COLORS.yellow, 0.9 - k * 0.5).strokeCircle(cam.scrollX + VIEW_W / 2, cam.scrollY + VIEW_H / 2, 60 + k * 120);
      let n = 0;
      for (const e of this.enemyPool.items) {
        if (!e.active || !this.onScreen(e.x, e.y) || n++ > 60) continue;
        this.fx.lineStyle(1, 0xff2a3a, 0.8).strokeCircle(e.x, e.y, 4 + k * 8);
      }
    }
    if (this.orbitalT >= at) {
      this.orbitalDone++;
      const dmg = O.damage * this.stats.damageMul * this.stats.explosiveMul;
      let bursts = 0;
      for (const e of this.enemyPool.items.slice()) {
        if (!e.active || !this.onScreen(e.x, e.y)) continue;
        if (bursts++ < 24) this.burst(e.x, e.y, COLORS.yellow, 6);
        this.damage(e, dmg, 'explosive');
      }
      this.screenFlash(0xfff6c0, 0.45, 300);
      this.shake(260, 0.014);
      Sound.play('explode');
    }
  }

  /** 레벨업 카드 + 리퍼닥 영구 강화 + 러너 특성 + 광전사 모드를 합쳐 능력치를 다시 계산 */
  private recalcStats(): void {
    const st = computeStats(this.passives, this.overflow);
    const m = this.runner.mods as Partial<Record<'creditMul' | 'maxHpMul' | 'meleeMul' | 'explosiveMul' | 'areaMul', number>>;
    st.damageMul *= 1 + Save.clinicValue('dmg') / 100;
    st.moveMul *= (1 + Save.clinicValue('spd') / 100) * (this.berserk ? SP.berserk.moveMul : 1);
    st.pickupMul *= 1 + Save.clinicValue('pick') / 100;
    st.areaMul *= m.areaMul ?? 1;
    st.meleeMul = (m.meleeMul ?? 1) * (this.berserk ? SP.berserk.meleeMul : 1);
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
    this.player.dashCooldownMax = this.pHas('bladeDash') ? 1 : this.pHas('reboot') ? PLAYER.dashCooldown - 1 : PLAYER.dashCooldown;
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

  private get zone(): Zone {
    return ZONES[this.zoneIdx];
  }

  /**
   * 2·3챕터 초반 워밍업: 빌드가 레벨 1로 초기화된 직후라, 처음 warmup.time초 동안
   * 적 체력 배율은 1배에서 구역 배율까지, 생성 수는 spawnFrom배에서 1배까지 서서히 올린다.
   */
  private zoneWarm(zt: number): number {
    return this.zoneIdx === 0 ? 1 : Phaser.Math.Clamp(zt / gameData.zoneWarmup.time, 0, 1);
  }
  private zoneHpMul(zt: number): number {
    return 1 + (this.zone.hpMul - 1) * this.zoneWarm(zt);
  }
  private zoneSpawnMul(zt: number): number {
    const from = gameData.zoneWarmup.spawnFrom;
    return from + (1 - from) * this.zoneWarm(zt);
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
    this.bossesSpawned = 0;
    this.raidsInZone = 0;
    this.nextRaid = this.elapsed + this.zone.raidStart + Math.random() * gameData.raid.firstDelayMax;
    this.applyZone(true);
    Sound.music(this.zoneMusic, 1200);
    this.startCarryOver();
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
    const hp = hpScaleAt(zt) * this.zone.hpMul;
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
    this.addWeapon(this.runner.startWeapon as WeaponId);
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
    this.recalcStats();
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
    this.dialog = { lines, i: -1, box, text, full: '', shown: 0, ev: null, done };
    this.advanceDialog();
  }

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
    // 줄마다 바뀌는 초상·이름은 지우고 다시 그린다
    d.box.list.slice(3).forEach((o) => o.destroy());
    if (d.i >= d.lines.length) {
      d.ev?.remove();
      d.box.destroy();
      this.dialog = null;
      this.state = 'play';
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
  private animateEnemy(e: Enemy, dt: number, d: number): void {
    const base = e.tex;
    const hasAtk = this.textures.exists(`${base}_atk_00`);
    if (hasAtk && this.animateTrooper(e, d)) return;
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
      const M = (gameData.melee as Record<string, MeleeDef>)[e.id];
      start(3, 7, scaled(3, 7, M.lungeTime));
    } else if ((role === 'hacker' || role === 'sniper') && prev === 'wind' && e.state === 'walk') {
      start(A.fxStart, 7, A.ms.slice(A.fxStart).map((m) => m / 1000));
    } else if (role === 'tank' && !e.seq && d < 30 && this.elapsed >= e.atkCd) {
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
  private animateBoss(b: Enemy, def: BossDef): void {
    const ph = this.bossPhase;
    const f = ph === 'aim' || this.bossAtkT > 0 ? 'aim' : ph === 'charge' ? 'charge' : Math.floor(this.elapsed * 4) % 2 ? 'w1' : 'w2';
    const key = `${def.id}_${f}`;
    if (this.textures.exists(key) && b.sprite.texture.key !== key) b.sprite.setTexture(key);
    const core = def.id === 'boss3';
    const bob = core ? Math.sin(this.elapsed * 2.5) * 3 : f === 'w1' || f === 'w2' ? -Math.abs(Math.sin(this.elapsed * 8)) * 1.5 : 0;
    const jitter = ph === 'aim' && !Settings.reducedFx ? (Math.random() - 0.5) * 2 : 0;
    b.sprite.setPosition(b.x + jitter, b.y + bob);
    if (!core) b.sprite.setFlipX(ph === 'charge' ? this.bossDir.x < 0 : this.player.x < b.x);
  }

  /** 소환·탄막 때 보스가 한 번 들썩인다 */
  private bossPulse(b: Enemy): void {
    this.tweens.killTweensOf(b.sprite);
    b.sprite.setScale(BOSS_SCALE);
    this.tweens.add({ targets: b.sprite, scaleX: 1.15 * BOSS_SCALE, scaleY: 0.88 * BOSS_SCALE, duration: 90, yoyo: true });
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
    const slow = this.overdrive ? OD.enemySpeedMul : 1;
    for (const b of this.enemyBullets.items) {
      if (!b.active) continue;
      if (b.homeDist > 0) {
        if (b.homeDelay > 0) b.homeDelay -= dt * slow;
        else b.steer(p.x, p.y, dt * slow);
      }
      b.update(dt * slow);
      if (!b.active) continue;
      if (p.invuln <= 0 && !this.untracked && (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < (p.radius + b.radius) ** 2) {
        b.kill();
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
      this.phoneText(msg !== own ? msg : tr(nextBoss.final ? 'phone.boss' : 'phone.midboss', { name, ga: josa(name, '이', '가') }), `${nextBoss.id}_w1`);
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
      img.setScale(Math.min(3, Math.floor(((pic - 6) / Math.max(img.width, img.height)) * 4) / 4 || 0.5));
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
    if (e.charmT > 0) e.sprite.setTint(0xff2bd6);
    else if (e.stun > 0) e.sprite.setTint(0x66ffff);
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
  private playSheet(key: string, n: number, x: number, y: number, ox: number, oy: number, fps: number, depth: number, flip = false): void {
    if (!this.textures.exists(key)) return;
    const img = this.add.image(x, y, key, '0').setOrigin(ox, oy).setDepth(depth).setFlipX(flip);
    const t0 = this.elapsed;
    const tick = () => {
      const f = Math.floor((this.elapsed - t0) * fps);
      if (f >= n || !img.active) {
        this.events.off('update', tick);
        img.destroy();
        return;
      }
      img.setFrame(String(f));
    };
    this.events.on('update', tick);
  }

  // ───────────────────────────── 블랙 실드 진압대 습격 ─────────────────────────────
  // (이송기 그림 112x55: 착지 지점보다 SHIP_LIFT만큼 떠서 그림자 위에 있는다)
  private updateRaid(dt: number): void {
    const R = gameData.raid;
    const p = this.player;
    if (!this.raid) {
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
        dust: this.textures.exists('fx_ship_dust') ? this.add.image(sx, ty + 8, 'fx_ship_dust', '0').setOrigin(88 / 176, 30 / 40).setDepth(9.5).setVisible(false) : null,
      };
      const warn = this.add
        .text(VIEW_W / 2, 72, tr('raid.warn'), { ...TEXT, fontSize: '16px', color: '#ff2a3a', align: 'center' })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(120);
      this.tweens.add({ targets: warn, alpha: 0.2, duration: 200, yoyo: true, repeat: 3, onComplete: () => warn.destroy() });
      // 블랙 실드 출동 경보: 오르내리는 사이렌
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
        r.ship.setTexture('dropship');
        // 착륙(정지) 엔진 소리
        Sound.play('shiphover');
      }
    } else if (r.phase === 'hover') {
      this.fx.fillStyle(COLORS.yellow, 0.1).fillEllipse(r.tx, r.ty, 100, 54);
      if (r.t >= R.hover) {
        // 역할군별 대원 투입. 체력은 일반 몬스터와 같은 곡선·챕터 배율을 따르되,
        // 첫 습격 시각(raidStart, 5:30)의 곡선 값을 1로 맞춰 1챕터 첫 습격 4명 합계가 enemies.json 기본값(24,000)이 되게 한다
        const zt = this.elapsed - this.zoneStart;
        const hpMul = this.zoneHpMul(zt) * (hpScaleAt(zt) / hpScaleAt(this.zone.raidStart));
        this.raidCount++;
        this.raidsInZone++;
        const lines = [1, 2, 3, 4].sort(() => Math.random() - 0.5);
        // 말풍선은 한 번에 1~2명만 (누가 말할지는 무작위)
        const talkers = new Set([0, 1, 2, 3].sort(() => Math.random() - 0.5).slice(0, Math.random() < 0.5 ? 1 : 2));
        let said = 0;
        r.markers.forEach((m, i) => {
          const e = this.spawnEnemy(R.squad[i] as EnemyId, m.x, m.y, hpMul);
          if (e) {
            e.t = 1.5 + Math.random();
            // 이송기 배에서 착지 지점까지 떨어진 뒤 착지 충격 (그동안 무적)
            e.dropT = DROP.fall + i * DROP.stagger;
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
        Sound.play('explode');
        r.phase = 'out';
        r.t = 0;
        r.sx = r.ship.x;
        if (this.textures.exists('dropship_move')) r.ship.setTexture('dropship_move');
      }
    } else {
      const k = Math.min(1, r.t / R.flyOut);
      r.ship.x = r.sx + (VIEW_W + 200) * k * k * k;
      if (k >= 1) {
        r.ship.destroy();
        r.shadow.destroy();
        r.wash?.destroy();
        r.dust?.destroy();
        this.raid = null;
        this.nextRaid = this.elapsed + Phaser.Math.FloatBetween(R.minGap, R.maxGap);
        return;
      }
    }
    r.ship.y = r.ty - SHIP_LIFT + bob;
    r.shadow.setPosition(r.ship.x, r.ty + 8);
    // 엔진 후류: 이동 중 기운 것, 정지 중 수직 (프레임 왼쪽 위 = 이송기 그림 왼쪽 위 - (12, 4)), 12fps 반복
    const fr = String(Math.floor(this.elapsed * 12));
    if (r.wash) {
      const key = r.phase === 'hover' ? 'fx_ship_wash' : 'fx_ship_wash_move';
      if (this.textures.exists(key)) {
        r.wash.setTexture(key, String(+fr % 12));
        r.wash.setPosition(r.ship.x - r.ship.width / 2 - 12, r.ship.y - r.ship.height / 2 - 4);
      }
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
    if (d < S.range * 0.85) setV((-dx / d) * e.speed * slow, (-dy / d) * e.speed * slow);
    else if (d < S.range * 1.15) setV((-dy / d) * e.speed * 0.3 * slow, (dx / d) * e.speed * 0.3 * slow);
    e.t -= dt;
    if (e.state === 'walk' && e.t <= 0 && !this.untracked && d < S.range * 1.4 && this.onScreen(e.x, e.y)) {
      e.state = 'wind';
      e.t = S.aim;
      Sound.play('lungewarn');
    } else if (e.state === 'wind' && this.untracked) {
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
    const p = this.untracked ? this.decoy : this.player;
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
    setV(gd > 6 ? (gx / gd) * e.speed * slow : 0, gd > 6 ? (gy / gd) * e.speed * slow : 0);
    e.t -= dt;
    if (e.state === 'walk' && e.t <= 0 && !this.untracked && d < H.reach && this.onScreen(e.x, e.y)) {
      e.state = 'wind';
      e.t = H.cast;
      Sound.play('glitch');
    } else if (e.state === 'wind' && this.untracked) {
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
    this.boss = this.spawnEnemy(id, bx, p.y, 1);
    if (!this.boss) {
      // 적 수 한도에 걸리면 가장 먼 적 하나를 치우고 다시 시도
      const far = this.enemyPool.items.find((e) => e.active);
      far?.kill();
      this.boss = this.spawnEnemy(id, bx, p.y, 1);
    }
    this.bossPhase2 = false;
    this.bossShieldT = 0;
    this.bossMissile = 2;
    this.bossAtkT = 0;
    this.bossMinionHp = 0;
    this.bossMinions = [];
    this.bossCharges = 0;
    this.bossVolley = 2;
    this.bossPhase = 'walk';
    this.bossTimer = def.firstWalk;
    this.bossSummon = def.firstSummon;
    this.hud.bossName.setText(enemiesData[id].name).setColor(def.final ? '#ff2a3a' : '#ff8a1f');
    Sound.play('bosswarn');
    this.time.delayedCall(450, () => Sound.play('bosswarn'));
    Sound.music('boss', 1200);
  }

  private updateBoss(dt: number): void {
    const b = this.boss!;
    const def = this.bossDef!;
    const p = this.player;
    const slow = this.overdrive ? OD.enemySpeedMul : 1;
    // 투명 중에는 보스도 마지막으로 본 자리를 노린다
    const tg = this.untracked ? this.decoy : p;
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
    }
    if (this.bossShieldT > 0) {
      this.bossShieldT -= dt;
      const k = 0.5 + Math.sin(this.elapsed * 14) * 0.25;
      this.fx.lineStyle(3, 0x00f0ff, k).strokeCircle(b.x, b.y, b.radius + 14);
      this.fx.fillStyle(0x00f0ff, 0.12).fillCircle(b.x, b.y, b.radius + 14);
    }
    // 헥사워드: 플레이어를 일정 거리만큼 쫓아가는 유도 미사일
    const ms = (def as { missile?: { every: number; count?: number; spread?: number; speed: number; damage: number; homingDist: number } }).missile;
    if (ms && (this.bossMissile -= dt) <= 0) {
      this.bossMissile = ms.every;
      this.bossPulse(b);
      // 발사 순간 공격 모션(어깨 미사일 포드가 열린 프레임)을 잠깐 보여준다
      this.bossAtkT = 0.45;
      const n = ms.count ?? 1;
      const base = Math.atan2(tg.y - b.y, tg.x - b.x);
      const look = this.textures.exists('boss_missile') ? 'boss_missile' : undefined;
      for (let i = 0; i < n; i++) {
        const a = base + (n > 1 ? (i / (n - 1) - 0.5) * 2 * (ms.spread ?? 0.4) : 0);
        // 포드 4곳에서 퍼져 나가 잠깐 직진한 뒤 추적
        const side = n > 1 ? i / (n - 1) - 0.5 : 0;
        const ox = Math.cos(base + Math.PI / 2) * side * b.radius * 1.2;
        const oy = Math.sin(base + Math.PI / 2) * side * b.radius * 1.2;
        const bl = this.eShot(b.id, 'missile');
        bl.fire(b.x + ox, b.y - b.radius * 0.4 + oy, a, ms.speed, ms.damage, ms.homingDist / ms.speed + 1.5, look ? 1 : 1.8, look);
        bl.homeDist = ms.homingDist;
        bl.homeDelay = (ms as { straight?: number }).straight ?? 0.5;
      }
      Sound.play('enemyshot');
    }
    if (this.bossAtkT > 0) this.bossAtkT -= dt;
    const p2 = this.bossPhase2 && ph ? ph : null;

    if (this.bossPhase === 'walk') {
      b.x += (dx / d) * b.speed * slow * dt;
      b.y += (dy / d) * b.speed * slow * dt;
      if (this.bossTimer <= 0) {
        this.bossPhase = 'aim';
        this.bossTimer = p2 ? p2.aimTime : def.aimTime;
        this.bossCharges = p2 ? p2.chargeCount : 1;
      }
    } else if (this.bossPhase === 'aim') {
      // 돌진 예고선
      this.fx.lineStyle(2, 0xff2a3a, 0.4 + Math.sin(this.elapsed * 40) * 0.3);
      this.fx.lineBetween(b.x, b.y, b.x + (dx / d) * 360, b.y + (dy / d) * 360);
      this.bossDir = { x: dx / d, y: dy / d };
      if (this.bossTimer <= 0) {
        this.bossPhase = 'charge';
        Sound.play('bosscharge');
        this.bossTimer = p2 ? p2.chargeTime : def.chargeTime;
      }
    } else {
      const sp = p2 ? p2.chargeSpeed : def.chargeSpeed;
      b.x += this.bossDir.x * sp * slow * dt;
      b.y += this.bossDir.y * sp * slow * dt;
      if (this.bossTimer <= 0) {
        if (--this.bossCharges > 0 && p2) {
          // 연속 돌진: 짧게 다시 조준
          this.bossPhase = 'aim';
          this.bossTimer = p2.aimTime;
        } else {
          this.bossPhase = 'walk';
          this.bossTimer = def.walkTime;
        }
      }
    }
    const vol: Volley | undefined = p2 ?? (def as { volley?: Volley }).volley;
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
    if (this.arena) {
      const a = this.arena;
      b.x = Phaser.Math.Clamp(b.x, a.x + b.radius, a.x + a.w - b.radius);
      b.y = Phaser.Math.Clamp(b.y, a.y + b.radius, a.y + a.h - b.radius);
    }

    this.bossSummon -= dt;
    if (this.bossSummon <= 0) {
      this.bossSummon = def.summonEvery;
      this.bossPulse(b);
      // 소환 목록: summons가 있으면 여러 종류, 없으면 summon × summonCount
      const refill = !!(def as { refill?: boolean }).refill;
      // 보충형(아르코난 코어): 체력은 첫 소환 때 값으로 고정, 살아 있는 부하는 빼고 모자란 만큼만 소환
      if (!refill || this.bossMinionHp <= 0) this.bossMinionHp = hpScaleAt(this.elapsed - this.zoneStart) * this.zone.hpMul;
      if (refill) this.bossMinions = this.bossMinions.filter((m) => m.e.active && m.e.id === m.id);
      const list = ((def as { summons?: { id: string; count: number }[] }).summons ?? [{ id: def.summon, count: def.summonCount }]).flatMap((s) => {
        const alive = refill ? this.bossMinions.filter((m) => m.id === s.id).length : 0;
        return Array<string>(Math.max(0, s.count - alive)).fill(s.id);
      });
      const n = list.length;
      list.forEach((id, i) => {
        const a = (i / n) * Math.PI * 2;
        const e = this.spawnEnemy(id as EnemyId, b.x + Math.cos(a) * 40, b.y + Math.sin(a) * 40, this.bossMinionHp);
        if (refill && e) this.bossMinions.push({ e, id });
      });
    }
    this.animateBoss(b, def);
    // 보스가 화면에서 너무 멀어지면 다시 가까이
    const pd = Math.hypot(p.x - b.x, p.y - b.y) || 1;
    if (!this.arena && pd > 520) {
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
    this.hud.level.setText(`LV ${this.level}`);
    this.hud.kills.setText(`KILL ${this.kills}`);
    this.hud.zone.setText(`${this.zone.label} · ${this.zone.name}${this.heat ? `  ·  HEAT ${this.heat}` : ''}`);
    this.hud.credits.setText(`₵ ${this.creditsNow(false)}`);
    // 보유 아이템: 아이콘 + 레벨 숫자 (윗줄 무기, 아랫줄 사이버웨어), ★는 특수 능력
    const items = [
      ...this.weapons.map((w, i) => ({ key: `icon_${w.id}`, lvl: w.level, stars: w.abilities.size, row: 0, col: i })),
      ...[...this.passives].map(([id, st], i) => ({ key: `icon_${id}`, lvl: st.level, stars: st.abilities?.length ?? 0, row: 1, col: i })),
    ];
    for (let i = items.length; i < this.icons.length; i++) {
      const ic = this.icons[i];
      ic.img.setVisible(false);
      ic.lvl.setText('');
      ic.star.setText('');
    }
    items.forEach((it, i) => {
      let ic = this.icons[i];
      if (!ic) {
        ic = {
          img: this.add.image(0, 0, it.key).setOrigin(0).setScrollFactor(0).setDepth(100),
          lvl: this.add.text(0, 0, '', { ...TEXT, fontSize: '10px' }).setOrigin(1, 1).setScrollFactor(0).setDepth(101),
          star: this.add.text(0, 0, '', { ...TEXT, fontSize: '9px', color: '#fff23a' }).setOrigin(1, 0).setScrollFactor(0).setDepth(101),
        };
        this.icons.push(ic);
      }
      const x = 8 + it.col * 22;
      const y = 30 + it.row * 22;
      ic.img.setTexture(it.key).setPosition(x, y).setVisible(true);
      ic.lvl.setPosition(x + 18, y + 19).setText(String(it.lvl));
      ic.star.setPosition(x + 19, y - 4).setText('★'.repeat(it.stars));
    });

    const g = this.hud.bars;
    g.clear();
    g.fillStyle(0x1a1030).fillRect(0, 0, VIEW_W, 4);
    g.fillStyle(COLORS.green).fillRect(0, 0, (VIEW_W * this.xp) / this.xpToNext(), 4);

    // 왼쪽 위 큰 체력바 (30% 아래로 떨어지면 빨갛게 깜빡임)
    const hpK = Math.max(0, p.hp) / p.maxHp;
    const low = hpK < 0.3;
    g.fillStyle(0x07060f, 0.85).fillRect(6, 6, HP_W + 4, 15);
    g.fillStyle(0x300010).fillRect(8, 8, HP_W, 11);
    g.fillStyle(low && Math.floor(this.elapsed * 6) % 2 ? 0xffffff : low ? 0xff2a3a : COLORS.magenta).fillRect(8, 8, HP_W * hpK, 11);
    if (p.shieldT > 0 && p.shield > 0) g.fillStyle(COLORS.cyan, 0.8).fillRect(8, 17, Math.min(HP_W, (HP_W * p.shield) / p.maxHp), 2);
    this.hud.hp.setText(`${Math.ceil(Math.max(0, p.hp))} / ${p.maxHp}`);

    // 오버드라이브 게이지
    const ow = 160;
    const ox = VIEW_W / 2 - ow / 2;
    const oy = VIEW_H - 18;
    g.fillStyle(0x2a0a24).fillRect(ox, oy, ow, 5);
    const full = this.specialOn || this.odGauge >= 100;
    g.fillStyle(full ? (Math.floor(this.elapsed * 10) % 2 ? COLORS.magenta : COLORS.cyan) : COLORS.magenta).fillRect(ox, oy, (ow * this.odGauge) / 100, 5);
    this.hud.od.setAlpha(full ? 1 : 0.6);

    // 플레이어 아래 체력·대시 바
    const cam = this.cameras.main;
    const sx = p.x - cam.scrollX - 12;
    const sy = p.y - cam.scrollY + 19;
    g.fillStyle(0x300010).fillRect(sx, sy, 24, 3);
    g.fillStyle(COLORS.magenta).fillRect(sx, sy, (24 * Math.max(0, p.hp)) / p.maxHp, 3);
    g.fillStyle(COLORS.cyan, 0.8).fillRect(sx, sy + 4, 24 * (1 - p.dashCd / p.dashCooldownMax), 1);

    // 진압대원 체력 바
    for (const e of this.enemyPool.items) {
      if (!e.active || e.isBoss || e.maxHp < 1000) continue;
      const ex = e.x - cam.scrollX - 11;
      const ey = e.y - cam.scrollY - 18;
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
