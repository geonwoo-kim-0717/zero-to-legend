import Phaser from 'phaser';
import { VIEW_W, VIEW_H, COLORS, ZOOM } from '../config';
import { BASE_TEXT } from '../ui/text';
import { t } from '../i18n';
import gameData from '../data/game.json';

/**
 * 트윈스틱 입력: 키보드·마우스와 터치(가상 스틱 2개 + 버튼)를 하나로 합친다.
 * - 이동: WASD/방향키, 터치는 화면 왼쪽 절반 스틱
 * - 조준: 마우스 커서, 터치는 화면 오른쪽 절반 스틱(누르고 있으면 주무기 발사)
 * - 주무기: 왼쪽 클릭 누르고 있기 / 보조무기: 오른쪽 클릭(또는 E) / 대시: Space·Shift / OS 능력: Q
 */
export class InputController {
  moveX = 0;
  moveY = 0;
  /** 조준: 마우스면 화면 좌표(게임 좌표계, 줌 전), 터치 스틱이면 방향 */
  aimMode: 'mouse' | 'stick' | 'none' = 'none';
  /** 마우스 화면 좌표 (VIEW 기준) */
  pointerX = VIEW_W / 2;
  pointerY = VIEW_H / 2;
  /** 터치 조준 방향 (단위 벡터) */
  aimDX = 1;
  aimDY = 0;
  /** 주무기 방아쇠 */
  primaryHeld = false;
  /** 자동 조준 (봇·개발자 도구): 가까운 적을 노리고 알아서 쏨 */
  autoAim = false;
  private dashQueued = false;
  private skillQueued = false;
  /** 보조무기 신호를 받은 시각 (ms, 버퍼 시간 안이면 유효) */
  private secondaryAt = -1e9;
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private moveStick = { id: null as number | null, bx: 0, by: 0, x: 0, y: 0 };
  private aimStick = { id: null as number | null, bx: 0, by: 0, x: 0, y: 0 };
  private readonly stickR = 36;
  private readonly dashBtn = { x: VIEW_W - 44, y: VIEW_H - 92, r: 22 };
  private readonly secBtn = { x: VIEW_W - 92, y: VIEW_H - 60, r: 22 };
  private readonly skillBtn = { x: VIEW_W - 44, y: VIEW_H - 140, r: 18 };
  private gfx: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private touchUsed = false;
  private mouseLeft = false;

  constructor(private readonly scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,E,Q') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-SPACE', () => (this.dashQueued = true));
    kb.on('keydown-SHIFT', () => (this.dashQueued = true));
    kb.on('keydown-E', () => this.pressSecondary());
    kb.on('keydown-Q', () => (this.skillQueued = true));
    scene.input.addPointer(3);
    scene.input.mouse?.disableContextMenu();
    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(200);
    const lbl = (x: number, y: number, text: string) =>
      this.labels.push(scene.add.text(x, y, text, { ...BASE_TEXT, fontSize: '10px', color: '#ffffff', strokeThickness: 2 }).setOrigin(0.5).setScrollFactor(0).setDepth(201).setVisible(false));
    lbl(this.dashBtn.x, this.dashBtn.y, t('ui.dash'));
    lbl(this.secBtn.x, this.secBtn.y, 'SUB');
    lbl(this.skillBtn.x, this.skillBtn.y, 'OS');

    const near = (px: number, py: number, b: { x: number; y: number; r: number }) => Phaser.Math.Distance.Between(px, py, b.x, b.y) < b.r + 8;
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch) {
        // 마우스: 왼쪽 = 주무기, 오른쪽 = 보조무기
        this.aimMode = 'mouse';
        if (p.rightButtonDown()) this.pressSecondary();
        if (p.leftButtonDown()) this.mouseLeft = true;
        return;
      }
      this.touchUsed = true;
      const x = p.x / ZOOM;
      const y = p.y / ZOOM;
      if (near(x, y, this.dashBtn)) return void (this.dashQueued = true);
      if (near(x, y, this.secBtn)) return void this.pressSecondary();
      if (near(x, y, this.skillBtn)) return void (this.skillQueued = true);
      // 화면 왼쪽 절반 = 이동 스틱, 오른쪽 절반 = 조준 스틱
      const s = x < VIEW_W / 2 ? this.moveStick : this.aimStick;
      if (s.id === null) {
        s.id = p.id;
        s.bx = x;
        s.by = y;
        s.x = s.y = 0;
        if (s === this.aimStick) this.aimMode = 'stick';
      }
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch) {
        this.pointerX = p.x / ZOOM;
        this.pointerY = p.y / ZOOM;
        this.aimMode = 'mouse';
        return;
      }
      for (const s of [this.moveStick, this.aimStick]) {
        if (p.id !== s.id) continue;
        const dx = p.x / ZOOM - s.bx;
        const dy = p.y / ZOOM - s.by;
        const d = Math.hypot(dx, dy);
        const k = d > this.stickR ? this.stickR / d : 1;
        s.x = (dx * k) / this.stickR;
        s.y = (dy * k) / this.stickR;
      }
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch) {
        if (!p.leftButtonDown()) this.mouseLeft = false;
        return;
      }
      for (const s of [this.moveStick, this.aimStick]) {
        if (p.id !== s.id) continue;
        s.id = null;
        s.x = s.y = 0;
      }
    };
    scene.input.on('pointerup', release);
    scene.input.on('pointerupoutside', release);
    scene.game.events.on(Phaser.Core.Events.BLUR, this.reset, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.game.events.off(Phaser.Core.Events.BLUR, this.reset, this));
  }

  /** 창을 벗어나면 누르고 있던 것을 놓은 것으로 */
  private reset(): void {
    this.mouseLeft = false;
    this.moveStick.id = this.aimStick.id = null;
    this.moveStick.x = this.moveStick.y = this.aimStick.x = this.aimStick.y = 0;
  }

  private pressSecondary(): void {
    this.secondaryAt = this.scene.time.now;
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

  /** 보조무기 신호가 남아 있는지 (누른 뒤 bufferSec 안) */
  get secondaryPending(): boolean {
    return this.scene.time.now - this.secondaryAt < gameData.twinStick.bufferSec * 1000;
  }

  consumeSecondary(): void {
    this.secondaryAt = -1e9;
  }

  /** 조준 스틱을 밀고 있는지 (터치 사격) */
  get aimStickActive(): boolean {
    return this.aimStick.id !== null && Math.hypot(this.aimStick.x, this.aimStick.y) > 0.3;
  }

  update(dashReady: number, skillReady = false): void {
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
    if (this.aimStickActive) {
      const d = Math.hypot(this.aimStick.x, this.aimStick.y) || 1;
      this.aimDX = this.aimStick.x / d;
      this.aimDY = this.aimStick.y / d;
    }
    this.primaryHeld = this.aimMode === 'stick' ? this.aimStickActive : this.mouseLeft;
    this.draw(dashReady, skillReady);
  }

  /** dashReady: 0(쿨다운 시작) ~ 1(사용 가능) */
  private draw(dashReady: number, skillReady: boolean): void {
    const g = this.gfx;
    g.clear();
    for (const l of this.labels) l.setVisible(this.touchUsed);
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
    if (!this.touchUsed) return;
    this.labels[0].setAlpha(dashReady >= 1 ? 0.7 : 0.3);
    this.labels[2].setAlpha(skillReady ? 0.9 : 0.3);
    for (const [s, c] of [
      [this.moveStick, COLORS.cyan],
      [this.aimStick, COLORS.magenta],
    ] as const) {
      if (s.id === null) continue;
      g.lineStyle(2, c, 0.5).strokeCircle(s.bx, s.by, this.stickR);
      g.fillStyle(c, 0.6).fillCircle(s.bx + s.x * this.stickR, s.by + s.y * this.stickR, 12);
    }
    const b = this.dashBtn;
    g.fillStyle(COLORS.magenta, dashReady >= 1 ? 0.35 : 0.12).fillCircle(b.x, b.y, b.r);
    g.lineStyle(2, COLORS.magenta, 0.9);
    g.beginPath();
    g.arc(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * dashReady);
    g.strokePath();
    g.fillStyle(COLORS.cyan, this.secondaryPending ? 0.45 : 0.2).fillCircle(this.secBtn.x, this.secBtn.y, this.secBtn.r);
    g.lineStyle(2, COLORS.cyan, 0.8).strokeCircle(this.secBtn.x, this.secBtn.y, this.secBtn.r);
    g.fillStyle(COLORS.yellow, skillReady ? 0.45 : 0.1).fillCircle(this.skillBtn.x, this.skillBtn.y, this.skillBtn.r);
    g.lineStyle(2, COLORS.yellow, skillReady ? 0.9 : 0.3).strokeCircle(this.skillBtn.x, this.skillBtn.y, this.skillBtn.r);
  }
}
