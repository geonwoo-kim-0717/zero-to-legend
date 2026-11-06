import Phaser from 'phaser';
import { VIEW_W, VIEW_H, COLORS, ZOOM } from '../config';

/** 키보드와 터치(가상 조이스틱 + 대시 버튼)를 하나의 이동 벡터로 합친다 */
export class InputController {
  moveX = 0;
  moveY = 0;
  private dashQueued = false;
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private stickId: number | null = null;
  private stickBaseX = 0;
  private stickBaseY = 0;
  private stickX = 0;
  private stickY = 0;
  private readonly stickR = 36;
  private readonly dashBtn = { x: VIEW_W - 52, y: VIEW_H - 52, r: 28 };
  private gfx: Phaser.GameObjects.Graphics;
  private touchUsed = false;

  constructor(private readonly scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-SPACE', () => (this.dashQueued = true));
    scene.input.addPointer(2);
    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(200);

    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch) return;
      this.touchUsed = true;
      if (Phaser.Math.Distance.Between(p.x / ZOOM, p.y / ZOOM, this.dashBtn.x, this.dashBtn.y) < this.dashBtn.r + 8) {
        this.dashQueued = true;
        return;
      }
      if (this.stickId === null) {
        this.stickId = p.id;
        this.stickBaseX = p.x / ZOOM;
        this.stickBaseY = p.y / ZOOM;
        this.stickX = this.stickY = 0;
      }
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.stickId) return;
      const dx = p.x / ZOOM - this.stickBaseX;
      const dy = p.y / ZOOM - this.stickBaseY;
      const d = Math.hypot(dx, dy);
      const k = d > this.stickR ? this.stickR / d : 1;
      this.stickX = (dx * k) / this.stickR;
      this.stickY = (dy * k) / this.stickR;
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (p.id !== this.stickId) return;
      this.stickId = null;
      this.stickX = this.stickY = 0;
    };
    scene.input.on('pointerup', release);
    scene.input.on('pointerupoutside', release);
  }

  consumeDash(): boolean {
    const d = this.dashQueued;
    this.dashQueued = false;
    return d;
  }

  update(dashReady: number): void {
    const k = this.keys;
    let x = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let y = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    if (this.stickId !== null) {
      x = this.stickX;
      y = this.stickY;
    }
    this.moveX = x;
    this.moveY = y;
    this.draw(dashReady);
  }

  /** dashReady: 0(쿨다운 시작) ~ 1(사용 가능) */
  private draw(dashReady: number): void {
    const g = this.gfx;
    g.clear();
    if (!this.touchUsed) return;
    if (this.stickId !== null) {
      g.lineStyle(2, COLORS.cyan, 0.5).strokeCircle(this.stickBaseX, this.stickBaseY, this.stickR);
      g.fillStyle(COLORS.cyan, 0.6).fillCircle(
        this.stickBaseX + this.stickX * this.stickR,
        this.stickBaseY + this.stickY * this.stickR,
        12,
      );
    }
    const b = this.dashBtn;
    g.fillStyle(COLORS.magenta, dashReady >= 1 ? 0.35 : 0.12).fillCircle(b.x, b.y, b.r);
    g.lineStyle(2, COLORS.magenta, 0.9);
    g.beginPath();
    g.arc(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * dashReady);
    g.strokePath();
  }
}
