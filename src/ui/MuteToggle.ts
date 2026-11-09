import Phaser from 'phaser';
import { BASE_TEXT } from './text';
import { Sound } from '../systems/Sound';
import { Settings } from '../systems/Settings';
import { toggleFullscreen, notify, isTouch } from '../systems/Fullscreen';
import { t as tr, I18n } from '../i18n';
import { Ads } from '../systems/Ads';

/** 작은 글자 버튼도 손가락으로 누르기 쉽게 판정 영역을 좌우 6px·위아래 10px 넓힌다 (라벨이 바뀌면 다시 맞춤) */
function padHit(t: Phaser.GameObjects.Text, px = 6, py = 10): Phaser.GameObjects.Text {
  const fit = () => {
    const r = new Phaser.Geom.Rectangle(-px, -py, t.width + px * 2, t.height + py * 2);
    if (t.input) t.input.hitArea = r;
    else t.setInteractive({ hitArea: r, hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
  };
  fit();
  const setText = t.setText.bind(t);
  t.setText = ((v: string | string[]) => {
    setText(v);
    fit();
    return t;
  }) as typeof t.setText;
  return t;
}

/** 터치 기기에서는 키보드 단축키 안내 ' (M)' 같은 꼬리를 뗀다 */
const key = (s: string) => (isTouch() ? s.replace(/\s*\([A-Z]\)$/, '') : s);

const label = () => key(Sound.muted ? tr('ui.sound.off') : tr('ui.sound.on'));

/** 화면 구석의 소리 켜기/끄기 버튼 + M 키. 클릭·탭·키 모두 지원 */
export function addMuteToggle(scene: Phaser.Scene, x: number, y: number, originX = 1): Phaser.GameObjects.Text {
  const t = scene.add
    .text(x, y, label(), { ...BASE_TEXT, fontSize: '11px', color: '#8a7aa8' })
    .setOrigin(originX, 0)
    .setScrollFactor(0)
    .setDepth(160);
  padHit(t);
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

const fxLabel = () => key(Settings.reducedFx ? tr('ui.fx.reduced') : tr('ui.fx.normal'));

/** 화면 효과 줄이기 버튼 + V 키 (흔들림·번쩍임·글리치를 끔) */
export function addFxToggle(scene: Phaser.Scene, x: number, y: number, originX = 1): Phaser.GameObjects.Text {
  const t = scene.add
    .text(x, y, fxLabel(), { ...BASE_TEXT, fontSize: '11px', color: '#8a7aa8' })
    .setOrigin(originX, 0)
    .setScrollFactor(0)
    .setDepth(160);
  padHit(t);
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
  const label = () => key(scene.scale.isFullscreen ? tr('ui.fs.exit') : tr('ui.fs.enter'));
  const t = scene.add
    .text(x, y, label(), { ...BASE_TEXT, fontSize: '11px', color: '#8a7aa8' })
    .setOrigin(originX, 0)
    .setScrollFactor(0)
    .setDepth(160);
  padHit(t);
  // CrazyGames는 게임 안 전체화면 버튼을 금지한다 (포털이 제공)
  if (Ads.provider === 'crazygames') return t.setVisible(false).disableInteractive();
  t.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
    e.stopPropagation();
    toggleFullscreen(scene);
  });
  // 다른 버튼처럼 눌렀을 때 장면 쪽 입력(조이스틱·시작)으로 번지지 않게
  t.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => e.stopPropagation());
  const refresh = () => t.setText(label());
  const onKey = () => toggleFullscreen(scene);
  const onFail = () => notify(scene, tr('ui.fs.blocked'));
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

/** 언어 바꾸기 버튼 + L 키. 바꾸면 지금 화면을 다시 그린다 (설정은 기억) */
export function addLangToggle(scene: Phaser.Scene, x: number, y: number, originX = 1): Phaser.GameObjects.Text {
  const t = scene.add
    .text(x, y, key(tr('ui.lang')), { ...BASE_TEXT, fontSize: '11px', color: '#8a7aa8' })
    .setOrigin(originX, 0)
    .setScrollFactor(0)
    .setDepth(160);
  padHit(t);
  const toggle = () => {
    I18n.toggle();
    scene.scene.restart();
  };
  t.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
    e.stopPropagation();
  });
  t.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
    e.stopPropagation();
    toggle();
  });
  scene.input.keyboard?.on('keydown-L', toggle);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.input.keyboard?.off('keydown-L', toggle));
  return t;
}
