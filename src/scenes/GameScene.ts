import Phaser from 'phaser';
import { BASE_TEXT, setupCamera } from '../ui/text';
import { VIEW_W, VIEW_H, PLAYER, GRID_CELL, COLORS, MAX_ENEMY_RADIUS } from '../config';
import gameData from '../data/game.json';
import passivesData from '../data/passives.json';
import abilitiesData from '../data/abilities.json';
import weaponsData from '../data/weapons.json';
import enemiesData from '../data/enemies.json';
import { Player } from '../entities/Player';
import { Enemy, type EnemyId } from '../entities/Enemy';
import { Projectile, type BulletOpts } from '../entities/Projectile';
import { Pickup, type PickupKind } from '../entities/Pickup';
import { EnemyBullet } from '../entities/EnemyBullet';
import { Pool } from '../systems/Pool';
import { SpatialGrid } from '../systems/SpatialGrid';
import { Spawner, hpScaleAt } from '../systems/Spawner';
import { InputController } from '../systems/InputController';
import { createWeapon, type WeaponBase, type WeaponId } from '../weapons';
import type { GameContext, Stats, DamageTag } from '../weapons/types';
import meta from '../data/meta.json';
import zonesData from '../data/zones.json';
import wavesData from '../data/waves.json';
import type { Wave } from '../systems/Spawner';
import { Save, type Runner, type RunnerId, type SpecialId, type RunStats } from '../systems/Save';
import { rollChoices, computeStats, passiveAmount, passiveAbility, type Choice, type PassiveId, type PassiveState } from '../systems/Progression';
import { LevelUpUI } from '../ui/LevelUpUI';
import { Sound, type SfxKey, type MusicKey } from '../systems/Sound';
import { addMuteToggle, addFxToggle, addFullscreenToggle } from '../ui/MuteToggle';
import { isTouch } from '../systems/Fullscreen';
import { Settings } from '../systems/Settings';
import { Ads } from '../systems/Ads';
import type { RunResult } from './ResultScene';
import { t as tr } from '../i18n';

/** 공격 상태가 없는 접촉형 적: 플레이어에게 붙으면 공격 그림 */
const CONTACT_POSE = new Set<string>(['trooper_tank', 'thug', 'sec_bot', 'drone', 'rat_bot']);

type State = 'play' | 'levelup' | 'paused' | 'over' | 'dialog' | 'carry';
/** 이번 판에 얻은 전설·신화 능력 (챕터 이월 후보) */
type Keep = { kind: 'weapon' | 'passive'; id: string; abilityId: string; rarity: string };
const CT = gameData.counters;
type Zone = (typeof zonesData.zones)[number];
type Line = { who: string; text: string };
type Volley = { volleyEvery: number; volleyCount: number; bulletSpeed: number; bulletDamage: number };
const ZONES = zonesData.zones;
const ZR = gameData.zoneRules;
type BossPhase = 'walk' | 'aim' | 'charge';
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
    shadow: Phaser.GameObjects.Ellipse;
    markers: { x: number; y: number }[];
  } | null = null;
  /** 픽서 진의 휴대폰 문자 (보스·진압대 등장 예고): 화면 오른쪽 아래, 한 번에 하나씩 */
  private phoneQueue: string[] = [];
  private phoneBox: Phaser.GameObjects.Container | null = null;
  /** 이미 예고한 보스(구역-순번)와 진압대 습격 시각 */
  private warnedBoss = '';
  private warnedRaid = -1;
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
    this.phoneBox = null;
    this.warnedBoss = '';
    this.warnedRaid = -1;
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
    addFullscreenToggle(this, fxBtn.x + fxBtn.width + 12, VIEW_H - 18, 0);
    if (isTouch()) {
      // 터치 기기에는 Esc가 없으므로 일시정지 버튼을 둔다
      const pb = this.add
        .text(VIEW_W - 8, 30, 'Ⅱ', { ...TEXT, fontSize: '16px', color: '#e8f7ff', backgroundColor: '#1a1030', padding: { x: 8, y: 2 } })
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(160)
        .setInteractive();
      pb.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        if (this.state === 'play') this.togglePause();
      });
    }
    // 1챕터 의뢰 브리핑
    this.startDialog((ZONES[0] as Zone & { intro?: Line[] }).intro ?? [], () => undefined);
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
      level: fixed(this.add.text(8, 10, 'LV 1', TEXT)),
      kills: fixed(this.add.text(VIEW_W - 8, 10, '0', TEXT).setOrigin(1, 0)),
      debug: fixed(this.add.text(VIEW_W - 8, 42, '', { ...TEXT, fontSize: '11px', color: '#39ff88', align: 'right' }).setOrigin(1, 0)),
      od: fixed(this.add.text(VIEW_W / 2, VIEW_H - 22, SP[this.specialId].label, { ...TEXT, fontSize: '11px', color: SP[this.specialId].color }).setOrigin(0.5, 1)),
      credits: fixed(this.add.text(VIEW_W - 8, 26, '', { ...TEXT, fontSize: '11px', color: '#fff23a' }).setOrigin(1, 0)),
      bossName: fixed(this.add.text(VIEW_W / 2, 42, '', { ...TEXT, fontSize: '11px', color: '#ff2a3a' }).setOrigin(0.5, 0)),
      zone: fixed(this.add.text(VIEW_W / 2, 29, '', { ...TEXT, fontSize: '10px', color: '#8a7aa8' }).setOrigin(0.5, 0)),
      center: fixed(
        this.add.text(VIEW_W / 2, VIEW_H / 2, '', { ...TEXT, fontSize: '20px', align: 'center' }).setOrigin(0.5).setVisible(false),
      ),
    };
    this.hud.time.setShadow(0, 0, '#00f0ff', 6, true, true);
  }

  // ───────────────────────────── GameContext ─────────────────────────────
  damage(e: Enemy, amount: number, tag?: DamageTag): boolean {
    if (!e.active) return false;
    // 회피 기동 중인 진압대는 피해를 받지 않음
    if (e.dodgeT > 0) return false;
    const DG = gameData.squadAi.dodge;
    if (DG.roles.includes(e.id) && e.dodgeCd < DG.reactBelow && e.hp > amount) this.startDodge(e);
    // 카운터 몬스터: 특정 피해 종류에 강함
    const res = (CT.mul as Record<string, Record<string, number>>)[e.id];
    if (res && tag && res[tag] !== undefined) amount *= res[tag];
    if (e.id === 'c_thorn' && tag === 'melee') this.thornReflect();
    // 강화 근섬유 특수 능력: 치명타 · 치명 폭주 · 분노 · 연속 처치
    const frenzy = this.pHas('critFrenzy');
    if ((frenzy || this.pHas('crit')) && Math.random() < (frenzy ? 0.25 : 0.1)) {
      amount *= frenzy ? 3 : 2;
      this.burst(e.x, e.y, COLORS.yellow, 4);
    }
    if (this.pHas('rage')) amount *= 1 + 0.4 * (1 - this.player.hp / this.player.maxHp);
    if (this.streak > 0) amount *= 1 + 0.02 * this.streak;
    // 처형자: 맞고 체력 15% 이하로 남는 일반 적은 즉사
    if (!e.isBoss && this.pHas('executioner') && e.hp - amount <= e.maxHp * 0.15) amount = Math.max(amount, e.hp);
    if (e.hit(amount)) {
      if (tag === 'melee') this.run.meleeKills++;
      this.killEnemy(e);
      return true;
    }
    return false;
  }

  fireBullet(x: number, y: number, angle: number, speed: number, damage: number, opts?: BulletOpts): void {
    this.bullets.acquire().fire(x, y, angle, speed, damage, opts);
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

  /** 실 인형: 적을 잠깐 조종해 다른 적과 싸우게 한다 (보스 제외) */
  charm(e: Enemy, seconds: number): void {
    if (!e.active || e.isBoss) return;
    e.charmT = Math.max(e.charmT, seconds);
    e.sprite.setTint(0xff2bd6);
  }

  stun(e: Enemy, seconds: number): void {
    if (!e.active || e.isBoss || e.id === 'c_insulator' || e.id === 'c_thorn') return;
    e.stun = Math.max(e.stun, seconds);
    e.sprite.setTint(0x66ffff);
  }

  slow(e: Enemy, seconds: number): void {
    if (e.id === 'c_prism') return;
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
    this.hurtPlayer(CT.thornReflect);
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
  }

  private openLevelUp(): void {
    if (this.state === 'play') Sound.play('levelup');
    this.state = 'levelup';
    // 보스 보상이 남아 있으면 먼저 연다 (모든 카드가 전설·신화)
    this.rewardOpen = this.bossRewards > 0;
    this.choices = rollChoices(this.weapons, this.passives, this.rewardOpen ? 'boss' : this.forcedRarity, {
      guaranteeWeapon: this.weapons.length < gameData.guaranteeWeaponUntil,
      pool: this.weaponPool,
      luck: this.pHas('luckCircuit'),
    });
    if (!this.rewardOpen) this.forcedRarity = undefined;
    this.levelUi.show(
      this.choices,
      this.rerolls,
      (i) => this.pick(i),
      () => {
        this.rerolls--;
        Sound.play('reroll');
        this.openLevelUp();
      },
      this.rewardOpen ? 'BOSS REWARD' : 'LEVEL UP',
    );
  }

  private pick(i: number): void {
    const c = this.choices[i];
    if (!c || this.state !== 'levelup') return;
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
    if (this.state !== 'play') return;
    const realDt = Math.min(deltaMs / 1000, 0.05);
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
    if (p.shieldT > 0) {
      // 쉴드 표시: 남은 시간만큼 옅어지는 시안 원
      this.fx.lineStyle(2, COLORS.cyan, 0.4 + p.shieldT * 0.5).strokeCircle(p.x, p.y, 15);
      this.fx.fillStyle(COLORS.cyan, 0.08).fillCircle(p.x, p.y, 15);
    }
    // 카메라 원점을 좌상단에 두었으므로 플레이어를 화면 가운데에 두도록 직접 따라간다
    const cam = this.cameras.main;
    const follow = Math.min(1, dt * 12);
    // 최종 보스전에는 경계 중앙에 카메라를 고정해 경계 전체가 보이게 한다
    const fxp = this.arena ? this.arena.x + this.arena.w / 2 : p.x;
    const fyp = this.arena ? this.arena.y + this.arena.h / 2 : p.y;
    cam.scrollX += (fxp - VIEW_W / 2 - cam.scrollX) * follow;
    cam.scrollY += (fyp - VIEW_H / 2 - cam.scrollY) * follow;
    this.updatePassiveSpecials(dt);
    // 빗줄기는 화면에 붙어서 아래로 흐른다 (슬로우 모션 때도 같이 느려짐)
    this.rainFx.tilePositionY -= 260 * dt;
    this.rainFx.tilePositionX += 30 * dt;
    this.bg.tilePositionX = this.cameras.main.scrollX;
    this.bg.tilePositionY = this.cameras.main.scrollY;
    this.skyline.tilePositionX = this.cameras.main.scrollX * 0.25;
    // 보스 경계전에는 카메라가 고정되어 화면 위쪽 바닥도 싸움터가 되므로 먼 배경을 걷어낸다
    this.skyline.alpha += ((this.arena ? 0 : 1) - this.skyline.alpha) * Math.min(1, dt * 3);

    const zt = this.elapsed - this.zoneStart;
    const nextBoss = gameData.bosses.filter((b) => b.zone === this.zone.id)[this.bossesSpawned];
    this.fixerWarnings(nextBoss, zt);
    if (nextBoss && !this.boss && !this.raid && this.transitionT <= 0 && zt >= nextBoss.time) this.spawnBoss(nextBoss);
    if (this.transitionT <= 0) this.updateRaid(dt);
    this.drawArena(dt);
    if (this.transitionT <= 0) this.spawner.update(dt, zt, zt, (wavesData as Record<string, Wave[]>)[this.zone.id], p.x, p.y, this.zone.hpMul);
    this.updateZoneRule(dt);
    if (this.transitionT <= 0) this.updateCounters(dt, zt);
    this.thornT -= dt;

    this.grid.clear();
    for (const e of this.enemyPool.items) if (e.active) this.grid.insert(e);

    this.updateOverdrive(dt);
    this.updateEnemies(dt);
    if (this.boss) this.updateBoss(dt);
    for (const w of this.weapons) w.update(dt);
    this.updateBullets(dt);
    this.updateEnemyBullets(dt);
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
    return e;
  }

  private updateEnemies(dt: number): void {
    const p = this.player;
    const slow = this.overdrive ? OD.enemySpeedMul : 1;
    const hidden = this.untracked;
    const conv = this.zone.rule === 'conveyor';
    for (const e of this.enemyPool.items) {
      if (!e.active) continue;
      if (e.charmT > 0) {
        e.charmT -= dt;
        if (e.charmT <= 0) e.sprite.clearTint();
        else {
          this.charmedAi(e, dt);
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
              this.enemyBullets.acquire().fire(e.x, e.y, Math.atan2(dy, dx) + off, rg.bulletSpeed, rg.bulletDamage, rg.bulletLife);
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
        if (e.id === 'sniper_turret') this.turretAi(e, dt, dx, dy, d, hidden);
        else if (e.id === 'glitch_ghost') this.ghostAi(e, dt, d, hidden);
        if (e.id === 'kamikaze' && this.kamikazeAi(e, dt, d, (x, y) => ((vx = x), (vy = y)))) continue;
        // 진압대 회피 기동
        const DGM = gameData.squadAi.dodge;
        if (DGM.roles.includes(e.id)) {
          if (e.dodgeT > 0) {
            e.dodgeT -= dt;
            vx = e.dodgeVX * slow;
            vy = e.dodgeVY * slow;
            if ((e.ghostT -= dt) <= 0) {
              e.ghostT = DGM.ghostEvery;
              this.spawnGhostAt(e.sprite.texture.key, e.x, e.y, e.sprite.flipX, 0xff2a3a);
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
        // 너무 멀어진 적은 플레이어 주변으로 재배치
        if (d > gameData.spawn.despawnDistance && e.maxHp < 1000) {
          e.kill();
          this.spawner.spawnAround(e.id, p.x, p.y, hpScaleAt(this.elapsed - this.zoneStart) * this.zone.hpMul, true);
          continue;
        }
      }
      e.sprite.setPosition(e.x, e.y);
      if (e.id.startsWith('c_')) this.fx.lineStyle(1, Phaser.Display.Color.HexStringToColor((CT.info as Record<string, { color: string }>)[e.id].color).color, 0.7).strokeCircle(e.x, e.y, e.radius + 4);
      if (e.flash > 0) {
        e.flash -= dt;
        if (e.flash <= 0) {
          if (e.stun > 0) e.sprite.setTint(0x66ffff);
          else e.sprite.clearTint();
        }
      }
      // 접촉 피해 (조종당한 적은 플레이어를 공격하지 않음)
      const rr = p.radius + e.radius;
      if (e.charmT <= 0 && p.invuln <= 0 && (p.x - e.x) ** 2 + (p.y - e.y) ** 2 < rr * rr) {
        const hp0 = p.hp;
        this.hurtPlayer(e.damage);
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
    e.sprite.setPosition(e.x, e.y);
    this.fx.lineStyle(1, COLORS.magenta, 0.6).lineBetween(e.x, e.y - e.radius - 4, e.x, e.y - e.radius - 10);
  }

  private hurtPlayer(dmg: number): void {
    const p = this.player;
    // 투명(광학 위장·고스트 대시) 중에는 어떤 공격도 통하지 않는다
    if (this.god || this.untracked) return;
    dmg *= 1 + this.heat * meta.heat.damagePer;
    // 적 공격력도 챕터 안에서 분마다 조금씩 오른다 (챕터마다 0부터)
    dmg *= 1 + ((this.elapsed - this.zoneStart) / 60) * gameData.enemyDamageGrowthPerMin;
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
    p.invuln = PLAYER.hurtInvuln;
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
          if (b.chain > 0) this.chainFrom(b, e);
          if (b.hits.length > b.pierce) {
            b.kill();
            break;
          }
        }
      }
    }
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
          const v = Math.min(d, 420 * dt);
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
        this.clearArena();
        Sound.music(null, 400);
        this.time.delayedCall(700, () => Sound.play('victory'));
        this.endRun(true);
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
          Sound.play('pickup');
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
      this.odGauge = (this.odTime / OD.duration) * 100;
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
  private activateSpecial(): void {
    const def = SP[this.specialId];
    const color = Phaser.Display.Color.HexStringToColor(def.color).color;
    this.specialOn = true;
    this.odTime = OD.duration;
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
      const fx = this.cameras.main.postFX;
      if (fx && !Settings.reducedFx) {
        fx.addVignette(0.5, 0.5, 0.95, 0.35);
        const cm = fx.addColorMatrix();
        cm.saturate(0.5);
        cm.hue(-25, true);
      }
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
      .text(VIEW_W / 2, VIEW_H / 2 - 50, def.label, { ...TEXT, fontSize: '22px', color: def.color })
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
    this.tweens.add({ targets: [t, hint], alpha: 0, delay: fanfare ? 2600 : 1600, duration: 700, onComplete: () => (t.destroy(), hint.destroy()) });
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
      this.raid.shadow.destroy();
      this.raid = null;
    }
  }

  private startZoneDialog(): void {
    const next = ZONES[this.zoneIdx + 1] as Zone & { intro?: Line[] };
    this.startDialog(next.intro ?? [], () => this.enterNextZone());
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
  /** 2챕터 중반부터, 플레이어가 전설·신화 능력을 가진 무기에 맞서는 카운터를 투입 */
  private updateCounters(dt: number, zt: number): void {
    if (this.zoneIdx < CT.startZone || (this.zoneIdx === CT.startZone && zt < CT.startTime)) return;
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
        this.tweens.add({ targets: t, alpha: 0, delay: 3500, duration: 600, onComplete: () => t.destroy() });
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

  /** 다음 챕터 시작: 얻었던 전설·신화 카드 중 1장을 골라 가져가고 나머지 빌드는 초기화 */
  private startCarryOver(): void {
    const list = this.keepables;
    if (!list.length) {
      this.resetBuild(null);
      return;
    }
    this.state = 'carry';
    Sound.duck(0.5);
    const add = <T extends Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T): T => {
      o.setScrollFactor(0).setDepth(300);
      this.carryUi.push(o);
      return o;
    };
    add(this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x000000, 0.72).setOrigin(0));
    add(this.add.text(VIEW_W / 2, 30, gameData.carryOver.title, { ...TEXT, fontSize: '20px', color: '#fff23a' }).setOrigin(0.5).setShadow(0, 0, '#fff23a', 8, true, true));
    add(this.add.text(VIEW_W / 2, 52, tr('carry.sub'), { ...TEXT, fontSize: '11px', color: '#c8b8e8' }).setOrigin(0.5));
    const desc = add(this.add.text(VIEW_W / 2, 318, '', { ...TEXT, fontSize: '12px', color: '#e8f7ff', align: 'center', wordWrap: { width: 560 } }).setOrigin(0.5, 0));
    const cols = Math.min(4, list.length);
    const cw = 144;
    const ch = 50;
    const gap = 8;
    const x0 = VIEW_W / 2 - (cols * cw + (cols - 1) * gap) / 2;
    list.forEach((k, i) => {
      const info = this.keepInfo(k);
      const x = x0 + (i % cols) * (cw + gap);
      const y = 72 + Math.floor(i / cols) * (ch + gap);
      const col = Phaser.Display.Color.HexStringToColor(info.rarity.color).color;
      const card = add(this.add.rectangle(x, y, cw, ch, 0x120a24, 0.95).setOrigin(0).setStrokeStyle(2, col));
      add(this.add.text(x + 6, y + 5, `${i < 9 ? `[${i + 1}] ` : ''}${info.rarity.label} · ${info.title}`, { ...TEXT, fontSize: '11px', color: info.rarity.color }));
      add(this.add.text(x + 6, y + 25, `★ ${info.ability.name}`, { ...TEXT, fontSize: '12px', color: '#ffffff' }));
      card.setInteractive({ useHandCursor: true });
      card.on('pointerover', () => {
        card.setFillStyle(0x23123f, 0.95);
        desc.setText(`${info.title} · ${info.ability.name}: ${info.ability.desc}`);
        Sound.play('hover');
      });
      card.on('pointerout', () => card.setFillStyle(0x120a24, 0.95));
      card.on('pointerup', () => this.chooseCarry(i));
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
    const keep = this.keepables[i];
    for (const o of this.carryUi) o.destroy();
    this.carryUi = [];
    if (this.carryKeys) this.input.keyboard?.off('keydown', this.carryKeys);
    this.carryKeys = undefined;
    Sound.play('select');
    Sound.duck(1);
    this.resetBuild(keep);
    this.state = 'play';
  }

  /** 빌드 초기화: 러너 시작 무기 Lv.1 + 고른 카드 1장만 남긴다 */
  private resetBuild(keep: Keep | null): void {
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
    if (keep) {
      const rarity = gameData.rarity.find((r) => r.id === keep.rarity)!;
      if (keep.kind === 'weapon') {
        const w = this.weapons.find((o) => o.id === keep.id) ?? this.addWeapon(keep.id as WeaponId);
        w.bonus = rarity.weaponBonus;
        w.addAbility(keep.abilityId);
      } else {
        const id = keep.id as PassiveId;
        const amt = passiveAmount(id, rarity);
        this.passives.set(id, { level: 1, total: amt, special: true, abilities: [keep.abilityId], speedMul: passivesData[id].stat === 'cooldownMul' ? 1 + amt / 100 : undefined });
      }
    }
    this.keepables = keep ? [keep] : [];
    this.recalcStats();
    this.player.hp = this.player.maxHp;
    const name = keep ? this.keepInfo(keep).ability.name : '';
    const t = this.add
      .text(VIEW_W / 2, VIEW_H / 2 + 10, keep ? tr('carry.keep', { name }) : tr('carry.reset'), { ...TEXT, fontSize: '13px', color: '#fff23a' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(120);
    this.tweens.add({ targets: t, alpha: 0, delay: 2200, duration: 600, onComplete: () => t.destroy() });
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
          this.hurtPlayer(L.damage);
        }
      }
      if (z.t <= 0) {
        z.phase = 'idle';
        z.t = L.every * Phaser.Math.FloatBetween(0.8, 1.2);
      }
    }
  }

  /**
   * 일반 적·진압대 프레임: <id>_w2 그림이 있으면 걷기 두 장을 번갈아 쓰고,
   * 공격 중(예고·돌진, 사격·순간이동 직후, 접촉형은 26px 안)에는 <id>_aim 그림을 쓴다.
   * 저격 터렛은 조준선 동안이 아니라 발사하는 순간에만 공격 그림.
   */
  private animateEnemy(e: Enemy, dt: number, d: number): void {
    if (!this.textures.exists(`${e.id}_w2`)) return;
    e.atkT = Math.max(0, e.atkT - dt);
    const attacking =
      e.atkT > 0 ||
      (e.state !== 'walk' && e.id !== 'sniper_turret') ||
      (CONTACT_POSE.has(e.id) && d < 26);
    const key = attacking ? `${e.id}_aim` : Math.floor(this.elapsed * 4 + e.x * 0.01) % 2 ? e.id : `${e.id}_w2`;
    const tex = this.textures.exists(key) ? key : e.id;
    if (e.sprite.texture.key !== tex) e.sprite.setTexture(tex);
  }

  /** 보스 모션: 걷기 2프레임, 돌진 예고(떨림), 돌진 자세, 코어는 둥실 떠 있음 */
  private animateBoss(b: Enemy, def: BossDef): void {
    const ph = this.bossPhase;
    const f = ph === 'aim' ? 'aim' : ph === 'charge' ? 'charge' : Math.floor(this.elapsed * 4) % 2 ? 'w1' : 'w2';
    const key = `${def.id}_${f}`;
    if (this.textures.exists(key) && b.sprite.texture.key !== key) b.sprite.setTexture(key);
    const core = def.id === 'boss3';
    const bob = core ? Math.sin(this.elapsed * 2.5) * 3 : f === 'w1' || f === 'w2' ? -Math.abs(Math.sin(this.elapsed * 8)) * 1.5 : 0;
    const jitter = ph === 'aim' && !Settings.reducedFx ? (Math.random() - 0.5) * 2 : 0;
    b.sprite.setPosition(b.x + jitter, b.y + bob);
    if (!core) b.sprite.setFlipX(ph === 'charge' ? this.bossDir.x < 0 : this.player.x < b.x);
    // 2페이즈: 붉은 기운
    if (this.bossPhase2) {
      const r = b.radius + 6 + Math.sin(this.elapsed * 10) * 2;
      this.fx.lineStyle(2, 0xff2a3a, 0.5).strokeCircle(b.x, b.y, r);
      this.fx.fillStyle(0xff2a3a, 0.08).fillCircle(b.x, b.y, r);
    }
  }

  /** 소환·탄막 때 보스가 한 번 들썩인다 */
  private bossPulse(b: Enemy): void {
    this.tweens.killTweensOf(b.sprite);
    b.sprite.setScale(1);
    this.tweens.add({ targets: b.sprite, scaleX: 1.15, scaleY: 0.88, duration: 90, yoyo: true });
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
        this.enemyBullets.acquire().fire(e.x, e.y, Math.atan2(e.dirY, e.dirX), S.bulletSpeed, S.bulletDamage, S.bulletLife, 1.3);
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
    if (p.invuln <= 0 && (p.x - e.x) ** 2 + (p.y - e.y) ** 2 < K.blastRadius ** 2) this.hurtPlayer(K.blast);
    e.kill();
    return true;
  }

  private updateEnemyBullets(dt: number): void {
    const p = this.player;
    const slow = this.overdrive ? OD.enemySpeedMul : 1;
    for (const b of this.enemyBullets.items) {
      if (!b.active) continue;
      b.update(dt * slow);
      if (!b.active) continue;
      if (p.invuln <= 0 && !this.untracked && (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < (p.radius + b.radius) ** 2) {
        b.kill();
        // 반사 신경: 20% 확률로 피함
        if (this.pHas('reflex') && Math.random() < 0.2) {
          this.burst(p.x, p.y, COLORS.cyan, 4);
          continue;
        }
        this.hurtPlayer(b.damage);
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
  private startDodge(e: Enemy): void {
    const D = gameData.squadAi.dodge;
    const p = this.player;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const side = Math.random() < 0.5 ? 1 : -1;
    // 옆으로 + (공격수는 앞으로 파고들고, 해커·저격수는 뒤로 빠짐)
    const fwd = e.id === 'trooper_melee' ? 0.45 : -0.5;
    let vx = (-dy / d) * side + (dx / d) * fwd;
    let vy = (dx / d) * side + (dy / d) * fwd;
    const m = Math.hypot(vx, vy) || 1;
    vx /= m;
    vy /= m;
    e.dodgeVX = vx * D.speed;
    e.dodgeVY = vy * D.speed;
    e.dodgeT = D.time;
    e.ghostT = 0;
    e.dodgeCd = Phaser.Math.FloatBetween(D.everyMin, D.everyMax);
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
    const key = `${this.zoneIdx}-${this.bossesSpawned}`;
    if (nextBoss && !this.boss && this.warnedBoss !== key && zt >= nextBoss.time - lead) {
      this.warnedBoss = key;
      const name = enemiesData[nextBoss.id as EnemyId].name;
      this.phoneText(tr(nextBoss.final ? 'phone.boss' : 'phone.midboss', { name, ga: josa(name, '이', '가') }));
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

  private phoneText(msg: string): void {
    this.phoneQueue.push(msg);
    if (!this.phoneBox) this.showNextPhone();
  }

  private showNextPhone(): void {
    const msg = this.phoneQueue.shift();
    if (msg === undefined) {
      this.phoneBox = null;
      return;
    }
    const w = 196;
    const x = VIEW_W - w - 8;
    const y = VIEW_H - 182;
    const box = this.add.container(x + w + 20, y).setScrollFactor(0).setDepth(125);
    const text = this.add.text(12, 34, msg, { ...TEXT, fontSize: '11px', color: '#e8f7ff', wordWrap: { width: w - 24, useAdvancedWrap: true }, lineSpacing: 2 });
    const h = Math.max(62, text.height + 46);
    box.add(this.add.rectangle(0, 0, w, h, 0x0d0820, 0.94).setOrigin(0).setStrokeStyle(2, COLORS.magenta));
    box.add(this.add.rectangle(4, 4, w - 8, 20, 0x2a1050, 1).setOrigin(0));
    box.add(this.add.image(16, 14, zonesData.client.texture).setScale(0.5));
    box.add(this.add.text(30, 7, `✉ ${zonesData.client.name}`, { ...TEXT, fontSize: '11px', color: '#ff2bd6' }));
    box.add(this.add.text(w - 8, 8, tr('phone.now'), { ...TEXT, fontSize: '9px', color: '#8a7aa8' }).setOrigin(1, 0));
    box.add(this.add.rectangle(8, 29, text.width + 8, text.height + 8, 0x1a1040, 1).setOrigin(0).setStrokeStyle(1, 0x3a2466));
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

  // ───────────────────────────── 블랙 실드 진압대 습격 ─────────────────────────────
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
        ship: this.add.image(sx, ty - 34, 'dropship').setDepth(30),
        shadow: this.add.ellipse(sx, ty + 8, 58, 14, 0x000000, 0.35).setDepth(9),
      };
      const warn = this.add
        .text(VIEW_W / 2, 72, tr('raid.warn'), { ...TEXT, fontSize: '16px', color: '#ff2a3a', align: 'center' })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(120);
      this.tweens.add({ targets: warn, alpha: 0.2, duration: 220, yoyo: true, repeat: 5, onComplete: () => warn.destroy() });
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
        Sound.play('bosscharge');
      }
    } else if (r.phase === 'hover') {
      this.fx.fillStyle(COLORS.yellow, 0.1).fillEllipse(r.tx, r.ty, 100, 54);
      if (r.t >= R.hover) {
        // 역할군별 대원 투입. 습격마다 체력이 hpGrowthPerRaid배씩 늘어난다
        const hpMul = this.zone.raidHpMul * Math.pow(R.hpGrowthPerRaid, this.raidsInZone);
        this.raidCount++;
        this.raidsInZone++;
        r.markers.forEach((m, i) => {
          const e = this.spawnEnemy(R.squad[i] as EnemyId, m.x, m.y, hpMul);
          if (e) e.t = 1.5 + Math.random();
          this.burst(m.x, m.y, 0xff2a3a, 10);
        });
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
        this.raid = null;
        this.nextRaid = this.elapsed + Phaser.Math.FloatBetween(R.minGap, R.maxGap);
        return;
      }
    }
    r.ship.y = r.ty - 34 + bob;
    r.shadow.setPosition(r.ship.x, r.ty + 8);
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
        this.enemyBullets.acquire().fire(e.x, e.y, Math.atan2(e.dirY, e.dirX), S.bulletSpeed, S.bulletDamage, S.bulletLife, 1.6);
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
    }
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
        this.enemyBullets.acquire().fire(b.x, b.y, a, vol.bulletSpeed, vol.bulletDamage, 5);
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
      const n = def.summonCount;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        this.spawnEnemy(def.summon as EnemyId, b.x + Math.cos(a) * 40, b.y + Math.sin(a) * 40, hpScaleAt(this.elapsed - this.zoneStart) * this.zone.hpMul);
      }
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
      const y = 28 + it.row * 22;
      ic.img.setTexture(it.key).setPosition(x, y).setVisible(true);
      ic.lvl.setPosition(x + 18, y + 19).setText(String(it.lvl));
      ic.star.setPosition(x + 19, y - 4).setText('★'.repeat(it.stars));
    });

    const g = this.hud.bars;
    g.clear();
    g.fillStyle(0x1a1030).fillRect(0, 0, VIEW_W, 4);
    g.fillStyle(COLORS.green).fillRect(0, 0, (VIEW_W * this.xp) / this.xpToNext(), 4);

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
