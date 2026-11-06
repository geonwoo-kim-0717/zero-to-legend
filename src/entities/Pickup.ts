import Phaser from 'phaser';

export type PickupKind = 'xp' | 'heal';

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

  constructor(scene: Phaser.Scene) {
    this.sprite = scene.add.image(0, 0, 'xp').setDepth(5).setVisible(false);
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
    this.sprite
      .setTexture(kind)
      .setPosition(x, y)
      .setVisible(true)
      .setScale(kind === 'xp' && value >= 3 ? 1.5 : 1)
      .setBlendMode(kind === 'xp' ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
  }

  kill(): void {
    this.active = false;
    this.sprite.setVisible(false);
  }
}
