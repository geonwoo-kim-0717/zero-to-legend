import Phaser from 'phaser';
import { VIEW_W, VIEW_H, ZOOM } from './config';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { GameScene } from './scenes/GameScene';
import { ResultScene } from './scenes/ResultScene';
import { HideoutScene } from './scenes/HideoutScene';
import { Ads } from './systems/Ads';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_W * ZOOM,
  height: VIEW_H * ZOOM,
  pixelArt: true,
  backgroundColor: '#07060f',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, TitleScene, HideoutScene, GameScene, ResultScene],
});

void Ads.init();

// 개발 중 브라우저 콘솔/자동 테스트에서 접근하기 위함
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) (window as unknown as { game: Phaser.Game }).game = game;
