import Phaser from 'phaser';

/** 적이 쏘는 탄 */
export class EnemyBullet {
  active = false;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  life = 0;
  damage = 0;
  readonly sprite: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    this.sprite = scene.add.image(0, 0, 'ebullet').setDepth(16).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
  }

  radius = 3;

  fire(x: number, y: number, angle: number, speed: number, damage: number, life: number, scale = 1): void {
    this.active = true;
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.damage = damage;
    this.life = life;
    this.radius = 3 * scale;
    this.sprite.setPosition(x, y).setVisible(true).setRotation(angle).setScale(scale);
  }

  update(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    this.sprite.setPosition(this.x, this.y);
    if (this.life <= 0) this.kill();
  }

  kill(): void {
    this.active = false;
    this.sprite.setVisible(false);
  }
}
