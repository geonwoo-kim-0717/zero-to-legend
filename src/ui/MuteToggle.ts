import Phaser from 'phaser';
import { BASE_TEXT } from './text';
import { Sound } from '../systems/Sound';
import { Settings } from '../systems/Settings';
import { toggleFullscreen, notify } from '../systems/Fullscreen';

const label = () => (Sound.muted ? '♪ 소리 끔 (M)' : '♪ 소리 켬 (M)');

/** 화면 구석의 소리 켜기/끄기 버튼 + M 키. 클릭·탭·키 모두 지원 */
export function addMuteToggle(scene: Phaser.Scene, x: number, y: number, originX = 1): Phaser.GameObjects.Text {
  const t = scene.add
    .text(x, y, label(), { ...BASE_TEXT, fontSize: '11px', color: '#8a7aa8' })
    .setOrigin(originX, 0)
    .setScrollFactor(0)
    .setDepth(160)
    .setInteractive({ useHandCursor: true });
  const toggle = () => {
    Sound.toggleMute();
    t.setText(label()).setColor(Sound.muted ? '#5a4a78' : '#8a7aa8');
  };
  t.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
    e.stopPropagation();
    toggle();
  });
  scene.input.keyboard?.on('keydown-M', toggle);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.input.keyboard?.off('keydown-M', toggle));
  return t;
}

const fxLabel = () => (Settings.reducedFx ? '화면 효과: 줄임 (V)' : '화면 효과: 보통 (V)');

/** 화면 효과 줄이기 버튼 + V 키 (흔들림·번쩍임·글리치를 끔) */
export function addFxToggle(scene: Phaser.Scene, x: number, y: number, originX = 1): Phaser.GameObjects.Text {
  const t = scene.add
    .text(x, y, fxLabel(), { ...BASE_TEXT, fontSize: '11px', color: '#8a7aa8' })
    .setOrigin(originX, 0)
    .setScrollFactor(0)
    .setDepth(160)
    .setInteractive({ useHandCursor: true });
  const toggle = () => {
    Settings.toggleReducedFx();
    t.setText(fxLabel());
  };
  t.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
    e.stopPropagation();
    toggle();
  });
  scene.input.keyboard?.on('keydown-V', toggle);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.input.keyboard?.off('keydown-V', toggle));
  return t;
}

/** 전체화면 버튼 + F 키. 브라우저가 사용자 입력 안에서만 전체화면을 허락하므로 pointerup에서 바로 요청한다 */
export function addFullscreenToggle(scene: Phaser.Scene, x: number, y: number, originX = 1): Phaser.GameObjects.Text {
  const label = () => (scene.scale.isFullscreen ? '⛶ 창 모드 (F)' : '⛶ 전체화면 (F)');
  const t = scene.add
    .text(x, y, label(), { ...BASE_TEXT, fontSize: '11px', color: '#8a7aa8' })
    .setOrigin(originX, 0)
    .setScrollFactor(0)
    .setDepth(160)
    .setInteractive({ useHandCursor: true });
  t.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
    e.stopPropagation();
    toggleFullscreen(scene);
  });
  // 다른 버튼처럼 눌렀을 때 장면 쪽 입력(조이스틱·시작)으로 번지지 않게
  t.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => e.stopPropagation());
  const refresh = () => t.setText(label());
  const onKey = () => toggleFullscreen(scene);
  const onFail = () => notify(scene, '전체화면 전환이 막혔어요. 다시 눌러 주세요');
  scene.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, refresh);
  scene.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, refresh);
  scene.scale.on(Phaser.Scale.Events.FULLSCREEN_FAILED, onFail);
  scene.input.keyboard?.on('keydown-F', onKey);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.scale.off(Phaser.Scale.Events.ENTER_FULLSCREEN, refresh);
    scene.scale.off(Phaser.Scale.Events.LEAVE_FULLSCREEN, refresh);
    scene.scale.off(Phaser.Scale.Events.FULLSCREEN_FAILED, onFail);
    scene.input.keyboard?.off('keydown-F', onKey);
  });
  return t;
}
