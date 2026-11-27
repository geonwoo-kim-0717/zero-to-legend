import Phaser from 'phaser';
import { CRATE_COLOR, crateKey } from '../ui/CrateArt';

/** chip: 판 안 재화 칩 (value = 개수) */
export type PickupKind = 'xp' | 'heal' | 'chest' | 'chip';

export class Pickup {
  active = false;
  kind: PickupKind = 'xp';
  x = 0;
  y = 0;
  value = 0;
  magnet = false;
  vel = 0;
  /** 떨어진 뒤 지난 시간 (오래되면 플레이어에게 끌려옴) */
  age = 0;
  readonly sprite: Phaser.GameObjects.Image;
  /** 상자 효과 (UI 세션): 영웅부터 빛, 전설부터 빛기둥, 신화는 불꽃 입자. 상자가 아니면 숨김 */
  private readonly glow: Phaser.GameObjects.Image;
  private readonly beam: Phaser.GameObjects.Image;
  private readonly sparks: Phaser.GameObjects.Rectangle[] = [];
  private fxTweens: Phaser.Tweens.Tween[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    this.sprite = scene.add.image(0, 0, 'xp').setDepth(5).setVisible(false);
    this.glow = scene.add.image(0, 0, 'crate_glow').setDepth(4.9).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.beam = scene.add.image(0, 0, 'crate_beam').setOrigin(0.5, 1).setDepth(4.9).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    for (let i = 0; i < 3; i++) this.sparks.push(scene.add.rectangle(0, 0, 1, 1, 0xff8a2a).setDepth(5.1).setVisible(false));
  }

  /** 상자 효과를 상자 자리로 (끌려올 때 GameScene이 위치를 바꾼 뒤 부름) */
  follow(): void {
    if (this.kind !== 'chest') return;
    this.glow.setPosition(this.x, this.y);
    this.beam.setPosition(this.x, this.y + 4);
    this.sparks.forEach((o, i) => o.setX(this.x + (i - 1) * 7));
  }

  private stopFx(): void {
    for (const t of this.fxTweens) t.stop();
    this.fxTweens = [];
    this.glow.setVisible(false);
    this.beam.setVisible(false);
    for (const o of this.sparks) o.setVisible(false);
  }

  private startFx(rank: number): void {
    this.stopFx();
    const col = Phaser.Display.Color.HexStringToColor(CRATE_COLOR[rank]).color;
    const tw = this.scene.tweens;
    if (rank >= 2) {
      this.glow.setTint(col).setVisible(true).setAlpha(0.7).setScale(rank >= 4 ? 1.3 : 1);
      this.fxTweens.push(tw.add({ targets: this.glow, alpha: { from: 0.45, to: 1 }, duration: rank >= 4 ? 450 : 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' }));
    }
    if (rank >= 3) {
      this.beam.setTint(col).setVisible(true).setScale(1, rank >= 4 ? 1.4 : 1.1);
      this.fxTweens.push(tw.add({ targets: this.beam, alpha: { from: 0.5, to: 1 }, duration: rank >= 4 ? 450 : 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' }));
    }
    if (rank >= 4) {
      this.sparks.forEach((o, i) => {
        o.setVisible(true).setPosition(this.x + (i - 1) * 7, this.y - 6);
        this.fxTweens.push(tw.add({ targets: o, y: { from: this.y - 4, to: this.y - 26 }, alpha: { from: 1, to: 0 }, duration: 900, delay: i * 300, repeat: -1, onRepeat: () => o.setY(this.y - 4) }));
      });
    }
    this.follow();
  }

  spawn(kind: PickupKind, x: number, y: number, value: number): void {
    this.active = true;
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.value = value;
    this.magnet = false;
    this.vel = 0;
    this.age = 0;
    const crate = kind === 'chest' && this.scene.textures.exists(crateKey(value));
    this.sprite
      .setTexture(crate ? crateKey(value) : kind)
      .setPosition(x, y)
      .setVisible(true)
      .setScale(kind === 'xp' && value >= 3 ? 1.5 : kind === 'chip' ? 0.8 + Math.min(3, value) * 0.15 : 1)
      .setTint(kind === 'chest' && !crate ? [0xe8f7ff, 0x00f0ff, 0xff2bd6, 0xfff23a, 0xff2a3a][Math.round(value)] ?? 0xffffff : 0xffffff)
      .setBlendMode(kind === 'xp' ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    if (crate) this.startFx(Math.max(0, Math.min(4, Math.round(value))));
    else this.stopFx();
  }

  kill(): void {
    this.active = false;
    this.sprite.setVisible(false);
    this.stopFx();
  }
}
