import Phaser from 'phaser';
import { VIEW_W, VIEW_H, COLORS, ZOOM } from '../config';
import { BASE_TEXT } from '../ui/text';
import { t } from '../i18n';

/** 보조무기 종류: tap = 가까운 적이 있으면 바로(EMP·드론·미사일), drag = 적이 몰린 곳에(유탄·포탑·지뢰). 둘 다 자동 발사 (GameScene) */
export type SubUse = 'tap' | 'drag' | 'none';

/**
 * 트윈스틱 입력: 키보드·마우스와 터치(이동 스틱 + 버튼)를 하나로 합친다.
 * - 이동: WASD/방향키, 터치는 버튼이 아닌 곳을 누르고 끄는 가상 스틱
 * - 주무기: 자동 발사. 마우스를 쓰면 커서 방향, 아니면(터치) 가장 가까운 적 (GameScene이 조준점을 정함)
 * - 보조무기: 자동 발사. 터치 화면 오른쪽 아래에 누르지 못하는 재사용 표시만 그림
 * - 대시: Space·Shift / 터치 버튼, OS 능력: Q / 터치 버튼
 */
export class InputController {
  moveX = 0;
  moveY = 0;
  /** 조준: mouse = 커서를 따라감, auto = 가까운 적 */
  aimMode: 'mouse' | 'auto' = 'auto';
  /** 마우스 화면 좌표 (VIEW 기준) */
  pointerX = VIEW_W / 2;
  pointerY = VIEW_H / 2;
  /** 자동 조준 (봇·개발자 도구): 가까운 적을 노림 */
  autoAim = false;
  /** 지금 낀 보조무기 종류 (GameScene이 정함, none이면 재사용 표시를 안 그림) */
  subUse: SubUse = 'none';
  private dashQueued = false;
  private skillQueued = false;
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private moveStick = { id: null as number | null, bx: 0, by: 0, x: 0, y: 0 };
  private readonly stickR = 36;
  // 오른쪽 아래 엄지 자리에 대시, 그 왼쪽에 OS (보조무기는 자동 발사라 버튼 없음, 재사용 대기는 HUD 왼쪽 위 소켓 칸에)
  private readonly dashBtn = { x: VIEW_W - 50, y: VIEW_H - 52, r: 24 };
  private readonly skillBtn = { x: VIEW_W - 114, y: VIEW_H - 40, r: 21 };
  private gfx: Phaser.GameObjects.Graphics;
  /** 버튼 위 글자·그림 (터치일 때만) */
  private labels: Phaser.GameObjects.Text[] = [];
  private osImg: Phaser.GameObjects.Image;
  private dashTxt: Phaser.GameObjects.Text;
  private osQ: Phaser.GameObjects.Text;
  private osCd: Phaser.GameObjects.Text;
  private touchUsed = false;
  /** 버튼에 그릴 것 (GameScene이 매 프레임 채움): 보조무기 그림·등급 색, OS 문양·색·게이지 */
  look: {
    subId?: string;
    subColor?: number;
    os?: { id: string; color: number; hasActive: boolean; gauge: number; on: boolean; cdT: number };
  } = {};

  constructor(private readonly scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,E,Q') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-SPACE', () => (this.dashQueued = true));
    kb.on('keydown-SHIFT', () => (this.dashQueued = true));
    kb.on('keydown-Q', () => (this.skillQueued = true));
    scene.input.addPointer(3);
    scene.input.mouse?.disableContextMenu();
    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(200);
    const txt = (x: number, y: number, text: string, size: number, color: string, extra: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}) => {
      const o = scene.add.text(x, y, text, { ...BASE_TEXT, fontSize: `${size}px`, color, strokeThickness: 2, ...extra }).setOrigin(0.5).setScrollFactor(0).setDepth(202).setVisible(false);
      this.labels.push(o);
      return o;
    };
    // 버튼 아래 이름
    txt(this.dashBtn.x, this.dashBtn.y + this.dashBtn.r + 7, t('ui.dash'), 8, '#b8a8d8', { strokeThickness: 2 });
    txt(this.skillBtn.x, this.skillBtn.y + this.skillBtn.r + 8, 'OS', 8, '#b8a8d8', { strokeThickness: 2 });
    this.dashTxt = txt(this.dashBtn.x, this.dashBtn.y - 2, '»', 17, '#00f0ff', { fontStyle: '900' });
    this.osQ = txt(this.skillBtn.x, this.skillBtn.y, 'Q', 13, '#0a0614', { fontStyle: '900', strokeThickness: 0 });
    this.osCd = txt(this.skillBtn.x, this.skillBtn.y, '', 12, '#ffffff', { fontStyle: '900' });
    this.osImg = scene.add.image(this.skillBtn.x, this.skillBtn.y, '__WHITE').setScrollFactor(0).setDepth(201).setVisible(false);

    const near = (px: number, py: number, b: { x: number; y: number; r: number }) => Phaser.Math.Distance.Between(px, py, b.x, b.y) < b.r + 8;
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const x = p.x / ZOOM;
      const y = p.y / ZOOM;
      if (!p.wasTouch) {
        this.aimMode = 'mouse';
        this.pointerX = x;
        this.pointerY = y;
        return;
      }
      this.touchUsed = true;
      this.aimMode = 'auto';
      if (near(x, y, this.dashBtn)) return void (this.dashQueued = true);
      if (near(x, y, this.skillBtn)) return void (this.skillQueued = true);
      const s = this.moveStick;
      if (s.id === null) {
        s.id = p.id;
        s.bx = x;
        s.by = y;
        s.x = s.y = 0;
      }
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const x = p.x / ZOOM;
      const y = p.y / ZOOM;
      if (!p.wasTouch) {
        this.pointerX = x;
        this.pointerY = y;
        this.aimMode = 'mouse';
        return;
      }
      const s = this.moveStick;
      if (p.id !== s.id) return;
      const dx = x - s.bx;
      const dy = y - s.by;
      const d = Math.hypot(dx, dy);
      const k = d > this.stickR ? this.stickR / d : 1;
      s.x = (dx * k) / this.stickR;
      s.y = (dy * k) / this.stickR;
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch) return;
      const s = this.moveStick;
      if (p.id !== s.id) return;
      s.id = null;
      s.x = s.y = 0;
    };
    scene.input.on('pointerup', release);
    scene.input.on('pointerupoutside', release);
    scene.game.events.on(Phaser.Core.Events.BLUR, this.reset, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.game.events.off(Phaser.Core.Events.BLUR, this.reset, this));
  }

  /** 일시정지·카드 화면 등에서는 버튼·조준점을 숨김 */
  setVisible(v: boolean): void {
    if (this.gfx.visible === v) return;
    this.gfx.setVisible(v);
    if (!v) {
      for (const l of this.labels) l.setVisible(false);
      this.osImg.setVisible(false);
    }
  }

  /** 창을 벗어나면 누르고 있던 것을 놓은 것으로 */
  private reset(): void {
    this.moveStick.id = null;
    this.moveStick.x = this.moveStick.y = 0;
  }

  consumeDash(): boolean {
    const d = this.dashQueued;
    this.dashQueued = false;
    return d;
  }

  /** OS 능력(Q) 신호를 한 번 씀 */
  consumeSkill(): boolean {
    const d = this.skillQueued;
    this.skillQueued = false;
    return d;
  }

  /**
   * dashReady: 0(쿨다운 시작) ~ 1(사용 가능). _subReady·_subOn·_player: 예전 보조 버튼용, 지금은 안 씀 (호출 모양은 그대로)
   * _player: 플레이어 화면 좌표 (예전 끌기 미리보기용, 지금은 안 씀. 호출 모양은 그대로 둠)
   */
  update(dashReady: number, skillReady = false, _subReady = 0, _subOn = false, _player?: { x: number; y: number }): void {
    const k = this.keys;
    let x = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let y = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    if (this.moveStick.id !== null) {
      x = this.moveStick.x;
      y = this.moveStick.y;
    }
    this.moveX = x;
    this.moveY = y;
    this.draw(dashReady, skillReady);
  }

  private draw(dashReady: number, skillReady: boolean): void {
    const g = this.gfx;
    g.clear();
    // 마우스 조준점 (십자선)
    if (this.aimMode === 'mouse' && !this.autoAim) {
      const cx = this.pointerX;
      const cy = this.pointerY;
      g.lineStyle(1.5, COLORS.cyan, 0.9);
      g.strokeCircle(cx, cy, 5);
      g.lineBetween(cx - 9, cy, cx - 3, cy);
      g.lineBetween(cx + 3, cy, cx + 9, cy);
      g.lineBetween(cx, cy - 9, cx, cy - 3);
      g.lineBetween(cx, cy + 3, cx, cy + 9);
    }
    // 버튼은 터치일 때만 (PC는 HUD 아래 막대가 같은 것을 보여 줌)
    const show = this.touchUsed && this.gfx.visible;
    for (const l of this.labels) l.setVisible(show);
    if (!show) {
      this.osImg.setVisible(false);
      return;
    }
    const s = this.moveStick;
    if (s.id !== null) {
      g.lineStyle(2, COLORS.cyan, 0.5).strokeCircle(s.bx, s.by, this.stickR);
      g.fillStyle(COLORS.cyan, 0.6).fillCircle(s.bx + s.x * this.stickR, s.by + s.y * this.stickR, 12);
    }
    const now = this.scene.time.now;
    /** 아직 안 찬 만큼 어둡게 덮는 부채꼴 (12시부터 시계 방향으로 차오름) */
    const cover = (b: { x: number; y: number; r: number }, k: number) => {
      if (k >= 1) return;
      g.fillStyle(0x05030c, 0.7);
      g.slice(b.x, b.y, b.r - 1, -Math.PI / 2 + Math.PI * 2 * Math.max(0, k), Math.PI * 1.5, false);
      g.fillPath();
    };


    // 대시: » + 재사용 대기 부채꼴, 준비되면 시안 고리
    const b = this.dashBtn;
    const dReady = dashReady >= 1;
    g.fillStyle(0x0a0716, 0.78).fillCircle(b.x, b.y, b.r);
    cover(b, dashReady);
    g.lineStyle(2, COLORS.cyan, dReady ? 1 : 0.5).strokeCircle(b.x, b.y, b.r);
    if (dReady) g.lineStyle(2, COLORS.cyan, 0.3).strokeCircle(b.x, b.y, b.r + 4);
    this.dashTxt.setAlpha(dReady ? 1 : 0.4);

    // OS: 게이지 고리 + 문양, 다 차면 OS 색 육각형 + Q (Q가 없는 OS는 버튼을 숨김)
    const o = this.look.os;
    const k = this.skillBtn;
    const osOn = !!o?.hasActive;
    this.labels[1].setVisible(osOn);
    this.osQ.setVisible(false);
    this.osCd.setText('');
    if (!o || !osOn) {
      this.osImg.setVisible(false);
      return;
    }
    const full = skillReady && o.cdT <= 0;
    g.fillStyle(0x0a0716, 0.78).fillCircle(k.x, k.y, k.r);
    g.lineStyle(4, 0x2a0a24, 1).strokeCircle(k.x, k.y, k.r + 2);
    g.lineStyle(4, o.color, 1);
    g.beginPath();
    g.arc(k.x, k.y, k.r + 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, Math.min(1, o.gauge / 100)), false);
    g.strokePath();
    if (full || o.on) {
      const a = o.on ? 0.5 + Math.sin(now / 100) * 0.3 : 0.45;
      for (let n = 1; n <= 3; n++) g.lineStyle(2, o.color, a * (1 - n / 4)).strokeCircle(k.x, k.y, k.r + 4 + n * 2);
    }
    if (full) {
      const hex = [0, 1, 2, 3, 4, 5].map((i) => new Phaser.Math.Vector2(k.x + 14 * Math.cos((Math.PI / 3) * i), k.y + 13 * Math.sin((Math.PI / 3) * i)));
      g.fillStyle(o.color, 1).fillPoints(hex, true);
      this.osImg.setVisible(false);
      this.osQ.setVisible(true);
    } else {
      const key = `icon_os_${o.id}`;
      if (this.scene.textures.exists(key)) this.osImg.setTexture(key).setScale(2).setVisible(true).setAlpha(o.on ? 1 : 0.6);
      else this.osImg.setVisible(false);
      if (o.cdT > 0 && !o.on) this.osCd.setText(String(Math.ceil(o.cdT)));
    }
  }
}
