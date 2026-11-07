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
  /** 유도: 남은 추적 거리 (0이면 직진) */
  homeDist = 0;

  fire(x: number, y: number, angle: number, speed: number, damage: number, life: number, scale = 1, texture = 'ebullet'): void {
    this.active = true;
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.damage = damage;
    this.life = life;
    this.radius = 3 * scale;
    this.homeDist = 0;
    if (this.sprite.texture.key !== texture) this.sprite.setTexture(texture).setBlendMode(texture === 'ebullet' ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    this.sprite.setPosition(x, y).setVisible(true).setRotation(angle).setScale(scale);
    if (texture !== 'ebullet') this.radius = Math.max(this.radius, 4);
  }

  /** 목표 쪽으로 방향을 튼다 (속도는 그대로). 추적 거리를 다 쓰면 직진 */
  steer(tx: number, ty: number, dt: number): void {
    const sp = Math.hypot(this.vx, this.vy) || 1;
    const cur = Math.atan2(this.vy, this.vx);
    const want = Math.atan2(ty - this.y, tx - this.x);
    const a = cur + Phaser.Math.Clamp(Phaser.Math.Angle.Wrap(want - cur), -3 * dt, 3 * dt);
    this.vx = Math.cos(a) * sp;
    this.vy = Math.sin(a) * sp;
    this.sprite.setRotation(a);
    this.homeDist -= sp * dt;
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
