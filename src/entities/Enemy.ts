import Phaser from 'phaser';
import enemies from '../data/enemies.json';
import gameData from '../data/game.json';

/** 보스 그림·판정 크기 배율 (game.json bossScale) */
export const BOSS_SCALE = (gameData as { bossScale?: number }).bossScale ?? 1;

export type EnemyId = keyof typeof enemies;
export type EnemyDef = (typeof enemies)[EnemyId];

export class Enemy {
  active = false;
  id: EnemyId = 'drone';
  isBoss = false;
  x = 0;
  y = 0;
  hp = 0;
  maxHp = 0;
  speed = 0;
  damage = 0;
  radius = 0;
  xp = 0;
  flash = 0;
  stun = 0;
  /** 사이버 사이코의 돌진 베기 상태 */
  state: 'walk' | 'wind' | 'lunge' = 'walk';
  t = 0;
  dirX = 0;
  dirY = 0;
  /** 원거리 적의 다음 사격까지 남은 시간 */
  cd = 0;
  /** EMP 필드 등으로 느려진 남은 시간 */
  slowT = 0;
  /** 실 인형에 조종당한 남은 시간 (다른 적을 공격) */
  charmT = 0;
  charmCd = 0;
  /** 진압대 회피 기동: 남은 시간, 다음 회피까지, 회피 속도 */
  dodgeT = 0;
  dodgeCd = 0;
  dodgeVX = 0;
  dodgeVY = 0;
  ghostT = 0;
  /** 공격 프레임(_aim)을 보여줄 남은 시간 (사격·순간이동 직후) */
  atkT = 0;
  readonly sprite: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    this.sprite = scene.add.image(0, 0, 'drone').setDepth(10).setVisible(false);
  }

  spawn(id: EnemyId, x: number, y: number, hpScale: number): void {
    const def = enemies[id];
    this.active = true;
    this.id = id;
    this.isBoss = id.startsWith('boss') || id.startsWith('midboss');
    this.x = x;
    this.y = y;
    this.hp = this.maxHp = def.hp * hpScale;
    this.speed = def.speed * (this.isBoss ? 1 : Phaser.Math.FloatBetween(0.9, 1.1));
    this.damage = def.damage;
    this.radius = def.radius * (this.isBoss ? BOSS_SCALE : 1);
    this.xp = def.xp;
    this.flash = 0;
    this.stun = 0;
    this.slowT = 0;
    this.atkT = 0;
    this.charmT = 0;
    this.dodgeT = 0;
    this.dodgeCd = 3 + Math.random() * 3;
    this.state = 'walk';
    this.t = 2 + Math.random() * 2;
    this.cd = 1 + Math.random() * 1.5;
    this.sprite.setTexture(def.texture).setPosition(x, y).setVisible(true).clearTint().setFlipX(false).setScale(this.isBoss ? BOSS_SCALE : 1).setAlpha(1).setDepth(this.isBoss ? 12 : 10);
  }

  /** 피해를 주고, 죽었으면 true */
  hit(dmg: number): boolean {
    this.hp -= dmg;
    this.flash = 0.06;
    this.sprite.setTintFill(0xffffff);
    return this.hp <= 0;
  }

  kill(): void {
    this.active = false;
    this.sprite.setVisible(false);
  }
}
