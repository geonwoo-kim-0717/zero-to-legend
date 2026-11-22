import Phaser from 'phaser';
import { VIEW_W, VIEW_H, COLORS, ZOOM } from '../config';
import { BASE_TEXT } from '../ui/text';
import { t } from '../i18n';
import gameData from '../data/game.json';

/** 보조무기 쓰는 법: tap = 누르면 바로(EMP·드론·미사일), drag = 끌어 놓은 자리에(유탄·포탑·지뢰) */
export type SubUse = 'tap' | 'drag' | 'none';

/**
 * 트윈스틱 입력: 키보드·마우스와 터치(이동 스틱 + 버튼)를 하나로 합친다.
 * - 이동: WASD/방향키, 터치는 버튼이 아닌 곳을 누르고 끄는 가상 스틱
 * - 주무기: 자동 발사. 마우스를 쓰면 커서 방향, 아니면(터치) 가장 가까운 적 (GameScene이 조준점을 정함)
 * - 보조무기: 화면 오른쪽 아래 버튼 (둘레에 재사용 대기 표시)
 *   tap 무기는 버튼·우클릭·E를 누르면 바로, drag 무기는 버튼에서 끌어 놓은 자리에 (우클릭·E는 커서 자리)
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
  /** 자동 조준 (봇·개발자 도구): 가까운 적을 노리고 보조무기도 알아서 씀 */
  autoAim = false;
  /** 지금 낀 보조무기를 쓰는 법 (GameScene이 정함) */
  subUse: SubUse = 'none';
  private dashQueued = false;
  private skillQueued = false;
  /** 보조무기 신호를 받은 시각 (ms, 버퍼 시간 안이면 유효) */
  private secondaryAt = -1e9;
  /** 보조무기를 쓸 화면 좌표 (VIEW 기준). null이면 자동(가까운 적) */
  private subAt: { x: number; y: number } | null = null;
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private moveStick = { id: null as number | null, bx: 0, by: 0, x: 0, y: 0 };
  /** 보조무기 버튼에서 끌고 있는 손가락·마우스 */
  private drag: { id: number; sx: number; sy: number; x: number; y: number } | null = null;
  private readonly stickR = 36;
  private readonly secBtn = { x: VIEW_W - 52, y: VIEW_H - 54, r: 24 };
  private readonly dashBtn = { x: VIEW_W - 112, y: VIEW_H - 34, r: 19 };
  private readonly skillBtn = { x: VIEW_W - 40, y: VIEW_H - 112, r: 16 };
  private gfx: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private subLabel: Phaser.GameObjects.Text;
  private touchUsed = false;

  constructor(private readonly scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,E,Q') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-SPACE', () => (this.dashQueued = true));
    kb.on('keydown-SHIFT', () => (this.dashQueued = true));
    kb.on('keydown-E', () => this.pressSecondary(this.aimMode === 'mouse' ? { x: this.pointerX, y: this.pointerY } : null));
    kb.on('keydown-Q', () => (this.skillQueued = true));
    scene.input.addPointer(3);
    scene.input.mouse?.disableContextMenu();
    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(200);
    const lbl = (x: number, y: number, text: string) => {
      const o = scene.add.text(x, y, text, { ...BASE_TEXT, fontSize: '10px', color: '#ffffff', strokeThickness: 2 }).setOrigin(0.5).setScrollFactor(0).setDepth(201).setVisible(false);
      this.labels.push(o);
      return o;
    };
    lbl(this.dashBtn.x, this.dashBtn.y, t('ui.dash'));
    lbl(this.skillBtn.x, this.skillBtn.y, 'OS');
    this.subLabel = scene.add
      .text(this.secBtn.x, this.secBtn.y, 'SUB', { ...BASE_TEXT, fontSize: '10px', color: '#ffffff', strokeThickness: 2 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(201)
      .setVisible(false);

    const near = (px: number, py: number, b: { x: number; y: number; r: number }) => Phaser.Math.Distance.Between(px, py, b.x, b.y) < b.r + 8;
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const x = p.x / ZOOM;
      const y = p.y / ZOOM;
      if (!p.wasTouch) {
        this.aimMode = 'mouse';
        this.pointerX = x;
        this.pointerY = y;
        // 마우스: 오른쪽 = 커서 자리에 보조무기, 왼쪽으로 버튼을 누르면 터치와 같음
        if (p.rightButtonDown()) return void this.pressSecondary({ x, y });
        if (p.leftButtonDown() && this.subUse !== 'none' && near(x, y, this.secBtn)) this.startSub(p.id, x, y);
        return;
      }
      this.touchUsed = true;
      this.aimMode = 'auto';
      if (near(x, y, this.dashBtn)) return void (this.dashQueued = true);
      if (near(x, y, this.skillBtn)) return void (this.skillQueued = true);
      if (this.subUse !== 'none' && near(x, y, this.secBtn)) return void this.startSub(p.id, x, y);
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
      if (this.drag && p.id === this.drag.id) {
        this.drag.x = x;
        this.drag.y = y;
      }
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
      if (this.drag && p.id === this.drag.id) {
        const d = this.drag;
        this.drag = null;
        // 짧게 누르기 = 자동(가까운 적), 끌어 놓기 = 놓은 자리
        const moved = Math.hypot(d.x - d.sx, d.y - d.sy) >= gameData.twinStick.dragMin;
        this.pressSecondary(moved && !near(d.x, d.y, this.secBtn) ? { x: d.x, y: d.y } : null);
      }
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
    this.subLabel.setVisible(v && this.subUse !== 'none');
    for (const l of this.labels) l.setVisible(v && this.touchUsed);
    if (!v) this.drag = null;
  }

  /** 보조무기 버튼을 누름: tap 무기는 바로, drag 무기는 끌기 시작 */
  private startSub(id: number, x: number, y: number): void {
    if (this.subUse === 'tap') return void this.pressSecondary(null);
    this.drag = { id, sx: x, sy: y, x, y };
  }

  /** 창을 벗어나면 누르고 있던 것을 놓은 것으로 */
  private reset(): void {
    this.drag = null;
    this.moveStick.id = null;
    this.moveStick.x = this.moveStick.y = 0;
  }

  private pressSecondary(at: { x: number; y: number } | null): void {
    this.secondaryAt = this.scene.time.now;
    this.subAt = at;
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

  /** 보조무기를 쓸 화면 좌표 (VIEW 기준). null이면 자동 */
  get secondaryTarget(): { x: number; y: number } | null {
    return this.subAt;
  }

  consumeSecondary(): void {
    this.secondaryAt = -1e9;
  }

  /**
   * dashReady: 0(쿨다운 시작) ~ 1(사용 가능), subReady: 보조무기 준비 0~1, subOn: 켜짐 창 무기가 켜져 있음
   * player: 플레이어 화면 좌표 (끌기 미리보기 선)
   */
  update(dashReady: number, skillReady = false, subReady = 0, subOn = false, player?: { x: number; y: number }): void {
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
    this.draw(dashReady, skillReady, subReady, subOn, player);
  }

  private draw(dashReady: number, skillReady: boolean, subReady: number, subOn: boolean, player?: { x: number; y: number }): void {
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
    // 보조무기 버튼: 둘레에 재사용 대기 (PC·터치 모두)
    const sb = this.secBtn;
    const hasSub = this.subUse !== 'none';
    this.subLabel.setVisible(hasSub);
    if (hasSub) {
      const ready = subReady >= 1;
      const pulse = subOn ? 0.5 + Math.sin(this.scene.time.now / 80) * 0.3 : ready ? 0.4 : 0.12;
      g.fillStyle(COLORS.cyan, this.secondaryPending ? 0.55 : pulse).fillCircle(sb.x, sb.y, sb.r);
      g.lineStyle(2, 0x0a2030, 0.8).strokeCircle(sb.x, sb.y, sb.r + 3);
      g.lineStyle(3, ready ? COLORS.yellow : COLORS.cyan, ready ? 1 : 0.85);
      g.beginPath();
      g.arc(sb.x, sb.y, sb.r + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, Math.min(1, subReady)));
      g.strokePath();
      this.subLabel.setAlpha(ready ? 1 : 0.5);
      // 끌기 미리보기: 버튼(또는 플레이어)에서 손가락까지 선 + 떨어질 자리
      const d = this.drag;
      if (d && Math.hypot(d.x - d.sx, d.y - d.sy) >= gameData.twinStick.dragMin) {
        const from = player ?? sb;
        g.lineStyle(1, COLORS.yellow, 0.5).lineBetween(from.x, from.y, d.x, d.y);
        g.lineStyle(2, COLORS.yellow, 0.9).strokeCircle(d.x, d.y, 14);
        g.fillStyle(COLORS.yellow, 0.15).fillCircle(d.x, d.y, 14);
      }
    }
    if (!this.touchUsed) return;
    this.labels[0].setAlpha(dashReady >= 1 ? 0.7 : 0.3);
    this.labels[1].setAlpha(skillReady ? 0.9 : 0.3);
    const s = this.moveStick;
    if (s.id !== null) {
      g.lineStyle(2, COLORS.cyan, 0.5).strokeCircle(s.bx, s.by, this.stickR);
      g.fillStyle(COLORS.cyan, 0.6).fillCircle(s.bx + s.x * this.stickR, s.by + s.y * this.stickR, 12);
    }
    const b = this.dashBtn;
    g.fillStyle(COLORS.magenta, dashReady >= 1 ? 0.35 : 0.12).fillCircle(b.x, b.y, b.r);
    g.lineStyle(2, COLORS.magenta, 0.9);
    g.beginPath();
    g.arc(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * dashReady);
    g.strokePath();
    g.fillStyle(COLORS.yellow, skillReady ? 0.45 : 0.1).fillCircle(this.skillBtn.x, this.skillBtn.y, this.skillBtn.r);
    g.lineStyle(2, COLORS.yellow, skillReady ? 0.9 : 0.3).strokeCircle(this.skillBtn.x, this.skillBtn.y, this.skillBtn.r);
  }
}
