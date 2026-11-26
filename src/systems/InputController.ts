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
  private drag: { id: number; sx: number; sy: number; x: number; y: number; rx: number; ry: number } | null = null;
  private readonly stickR = 36;
  // UI 시안 A: 오른쪽 아래 보조 버튼을 엄지 자리로, 왼쪽에 대시, 왼쪽 위에 OS (누름 판정도 이 좌표)
  private readonly secBtn = { x: VIEW_W - 50, y: VIEW_H - 52, r: 26 };
  /** 보조무기 자동 발사 (game.json twinStick.autoSecondary): 보조 버튼은 누르지 못하는 재사용 표시로만 남음 */
  private readonly autoSub = (gameData.twinStick as { autoSecondary?: boolean }).autoSecondary === true;
  private readonly dashBtn = { x: VIEW_W - 118, y: VIEW_H - 36, r: 20 };
  private readonly skillBtn = { x: VIEW_W - 102, y: VIEW_H - 94, r: 21 };
  private gfx: Phaser.GameObjects.Graphics;
  /** 버튼 위 글자·그림 (터치일 때만) */
  private labels: Phaser.GameObjects.Text[] = [];
  private subImg: Phaser.GameObjects.Image;
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
    kb.on('keydown-E', () => this.pressSecondary(this.aimMode === 'mouse' ? { x: this.pointerX, y: this.pointerY } : null));
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
    txt(this.secBtn.x, this.secBtn.y + this.secBtn.r + 7, t(this.autoSub ? 'ui.subAuto' : 'ui.sub'), 8, '#b8a8d8', { strokeThickness: 2 });
    txt(this.dashBtn.x, this.dashBtn.y + this.dashBtn.r + 7, t('ui.dash'), 8, '#b8a8d8', { strokeThickness: 2 });
    txt(this.skillBtn.x, this.skillBtn.y + this.skillBtn.r + 8, 'OS', 8, '#b8a8d8', { strokeThickness: 2 });
    this.dashTxt = txt(this.dashBtn.x, this.dashBtn.y - 2, '»', 17, '#00f0ff', { fontStyle: '900' });
    this.osQ = txt(this.skillBtn.x, this.skillBtn.y, 'Q', 13, '#0a0614', { fontStyle: '900', strokeThickness: 0 });
    this.osCd = txt(this.skillBtn.x, this.skillBtn.y, '', 12, '#ffffff', { fontStyle: '900' });
    this.subImg = scene.add.image(this.secBtn.x, this.secBtn.y, '__WHITE').setScrollFactor(0).setDepth(201).setVisible(false);
    this.osImg = scene.add.image(this.skillBtn.x, this.skillBtn.y, '__WHITE').setScrollFactor(0).setDepth(201).setVisible(false);

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
        // PC에서는 보조 버튼을 그리지 않으므로 마우스로 끌기도 없음 (우클릭·E가 커서 자리에 씀)
        return;
      }
      this.touchUsed = true;
      this.aimMode = 'auto';
      if (near(x, y, this.dashBtn)) return void (this.dashQueued = true);
      if (near(x, y, this.skillBtn)) return void (this.skillQueued = true);
      if (!this.autoSub && this.subUse !== 'none' && near(x, y, this.secBtn)) return void this.startSub(p.id, x, y);
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
        // 버튼이 오른쪽 아래라 왼쪽은 엄지가 덜 감: 왼쪽으로 끈 거리만 2배 (사용자 요청)
        const dx = x - this.drag.sx;
        this.drag.rx = x;
        this.drag.ry = y;
        this.drag.x = this.drag.sx + (dx < 0 ? dx * gameData.twinStick.dragLeftMul : dx);
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
        const moved = Math.hypot(d.rx - d.sx, d.ry - d.sy) >= gameData.twinStick.dragMin;
        // 손가락을 버튼 위로 되돌려 놓으면 자동(가까운 적)
        this.pressSecondary(moved && !near(d.rx, d.ry, this.secBtn) ? { x: d.x, y: d.y } : null);
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
    if (!v) {
      for (const l of this.labels) l.setVisible(false);
      this.subImg.setVisible(false);
      this.osImg.setVisible(false);
      this.drag = null;
    }
  }

  /** 보조무기 버튼을 누름: tap 무기는 바로, drag 무기는 끌기 시작 */
  private startSub(id: number, x: number, y: number): void {
    if (this.subUse === 'tap') return void this.pressSecondary(null);
    this.drag = { id, sx: x, sy: y, x, y, rx: x, ry: y };
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
      this.subImg.setVisible(false);
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

    // 보조무기: 무기 그림 + 등급 색 테두리, 재사용 대기 부채꼴, 준비되면 노란 고리
    const sb = this.secBtn;
    const hasSub = this.subUse !== 'none';
    this.labels[0].setVisible(hasSub);
    if (hasSub) {
      const ready = subReady >= 1;
      const col = this.look.subColor ?? COLORS.cyan;
      g.fillStyle(0x0a0716, 0.78).fillCircle(sb.x, sb.y, sb.r);
      if (this.secondaryPending) g.fillStyle(col, 0.35).fillCircle(sb.x, sb.y, sb.r);
      const key = this.look.subId ? `icon_${this.look.subId}` : '';
      if (key && this.scene.textures.exists(key)) this.subImg.setTexture(key).setScale(2).setVisible(true).setAlpha(ready || subOn ? 1 : 0.55);
      else this.subImg.setVisible(false);
      if (!subOn) cover(sb, subReady);
      g.lineStyle(2, col, 1).strokeCircle(sb.x, sb.y, sb.r);
      if (subOn) g.lineStyle(3, col, 0.5 + Math.sin(now / 80) * 0.4).strokeCircle(sb.x, sb.y, sb.r + 4);
      else if (ready && !this.autoSub) {
        g.lineStyle(3, COLORS.yellow, 1).strokeCircle(sb.x, sb.y, sb.r + 4);
        g.lineStyle(2, COLORS.yellow, 0.25).strokeCircle(sb.x, sb.y, sb.r + 7);
      }
      // 끌기 미리보기: 플레이어에서 떨어질 자리까지 선 + 원
      const d = this.drag;
      if (d && Math.hypot(d.rx - d.sx, d.ry - d.sy) >= gameData.twinStick.dragMin) {
        const from = player ?? sb;
        g.lineStyle(1, COLORS.yellow, 0.5).lineBetween(from.x, from.y, d.x, d.y);
        g.lineStyle(2, COLORS.yellow, 0.9).strokeCircle(d.x, d.y, 14);
        g.fillStyle(COLORS.yellow, 0.15).fillCircle(d.x, d.y, 14);
        // 손가락 자리 → 겨눈 자리 (왼쪽 2배일 때 얼마나 늘었는지)
        if (Math.abs(d.x - d.rx) > 2) g.lineStyle(1, COLORS.yellow, 0.25).lineBetween(d.rx, d.ry, d.x, d.y);
      }
    } else this.subImg.setVisible(false);

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
    this.labels[2].setVisible(osOn);
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
