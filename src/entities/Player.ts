import Phaser from 'phaser';
import { PLAYER } from '../config';

export class Player {
  x = 0;
  y = 0;
  hp = PLAYER.maxHp;
  maxHp = PLAYER.maxHp;
  radius = PLAYER.radius;
  invuln = 0;
  dashTime = 0;
  dashCd = 0;
  dashCooldownMax = PLAYER.dashCooldown;
  /** 마지막 대시 이후 경과 시간 (반격 자세용) */
  sinceDash = 99;
  /** 해커에게 해킹당한 남은 시간: 느려지고 대시를 못 씀 */
  hackT = 0;
  /** 순간 재부팅 쉴드: 남은 흡수량과 남은 시간 */
  shield = 0;
  shieldT = 0;
  /** 고스트 특성: 대시 직후 투명화 남은 시간 (적이 놓침) */
  cloakT = 0;
  dirX = 1;
  dirY = 0;
  readonly sprite: Phaser.GameObjects.Image;
  /** 걷기 그림이 있는 러너는 움직일 때 두 장을 번갈아 보여준다 */
  private readonly baseTex: string;
  private readonly walkTex: [string, string] | null;
  private walkT = 0;
  readonly glow: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, texture = 'player') {
    this.glow = scene.add.image(0, 0, 'glow').setDepth(19).setTint(0x00f0ff).setAlpha(0.45).setScale(1.5).setBlendMode(Phaser.BlendModes.ADD);
    this.sprite = scene.add.image(0, 0, texture).setDepth(20);
    this.baseTex = texture;
    this.walkTex = scene.textures.exists(`${texture}_w1`) ? [`${texture}_w1`, `${texture}_w2`] : null;
  }

  get dashing(): boolean {
    return this.dashTime > 0;
  }

  tryDash(): boolean {
    if (this.dashCd > 0 || this.hackT > 0) return false;
    this.dashTime = PLAYER.dashTime;
    this.dashCd = this.dashCooldownMax;
    this.sinceDash = 0;
    this.invuln = Math.max(this.invuln, PLAYER.dashInvuln);
    return true;
  }

  update(dt: number, mx: number, my: number, moveMul = 1): void {
    const len = Math.hypot(mx, my);
    if (len > 0.01) {
      this.dirX = mx / Math.max(len, 1);
      this.dirY = my / Math.max(len, 1);
    }
    let speed = PLAYER.speed * moveMul;
    let vx = mx * speed;
    let vy = my * speed;
    if (this.dashing) {
      // 대시 중에는 마지막 이동 방향으로 고속 돌진
      const d = Math.hypot(this.dirX, this.dirY) || 1;
      speed *= PLAYER.dashSpeedMul;
      vx = (this.dirX / d) * speed;
      vy = (this.dirY / d) * speed;
    }
    this.x += vx * dt;
    this.y += vy * dt;
    this.dashTime = Math.max(0, this.dashTime - dt);
    this.sinceDash += dt;
    this.hackT = Math.max(0, this.hackT - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);
    this.cloakT = Math.max(0, this.cloakT - dt);
    if (this.shieldT <= 0) this.shield = 0;
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);

    this.sprite.setPosition(this.x, this.y);
    this.glow.setPosition(this.x, this.y);
    // 피격 무적 중 깜빡임
    this.sprite.setAlpha(this.invuln > 0 && !this.dashing ? (Math.floor(this.invuln * 20) % 2 ? 0.3 : 1) : 1);
    if (Math.abs(mx) > 0.01) this.sprite.setFlipX(mx < 0);
    // 걷기 애니메이션 (초당 약 8프레임)
    if (this.walkTex) {
      const moving = len > 0.1 && !this.dashing;
      this.walkT = moving ? this.walkT + dt : 0;
      const key = moving ? this.walkTex[Math.floor(this.walkT * 8) % 2] : this.baseTex;
      if (this.sprite.texture.key !== key) this.sprite.setTexture(key);
    }
  }
}
