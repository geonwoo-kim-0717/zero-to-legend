import Phaser from 'phaser';
import { VIEW_W, VIEW_H, ZOOM } from './config';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { GameScene } from './scenes/GameScene';
import { ResultScene } from './scenes/ResultScene';
import { HideoutScene } from './scenes/HideoutScene';
import { Ads } from './systems/Ads';
import { I18n } from './i18n';
import { initAutoFullscreen } from './systems/Fullscreen';

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

// 화면 크기가 바뀌면 (회전, 아이폰 홈 화면 실행 직후 주소창·상태바 변화) 조금 기다렸다가 다시 맞춘다
const refit = () => {
  for (const ms of [50, 300, 800]) setTimeout(() => game.scale.refresh(), ms);
};
window.addEventListener('resize', refit);
window.addEventListener('orientationchange', refit);
window.visualViewport?.addEventListener('resize', refit);
window.addEventListener('pageshow', refit);
refit();

I18n.init();
void Ads.init();
// 모바일 전체화면이 풀린 뒤 가로로 돌아오면 다시 전체화면 (포털은 자체 전체화면을 쓰므로 제외)
initAutoFullscreen(game, Ads.provider !== 'crazygames');

// 진단: AI 표시 빌드·?debug에서는 오류를 화면에 띄운다 (모바일 앱처럼 콘솔을 못 보는 곳에서 원인 확인용)
if (import.meta.env.VITE_AI_SHOW === '1' || /[?&](debug|ai)\b/.test(location.search)) {
  const box = document.createElement('pre');
  box.style.cssText = 'position:fixed;left:4px;top:4px;right:4px;max-height:45%;overflow:auto;margin:0;padding:6px;z-index:99;background:rgba(40,0,0,.85);color:#ff8a8a;font:11px monospace;white-space:pre-wrap;pointer-events:none;display:none';
  document.body.appendChild(box);
  const show = (msg: string) => {
    box.style.display = 'block';
    box.textContent = (box.textContent + '\n' + msg).slice(-3000);
  };
  window.addEventListener('error', (e) => show(`오류: ${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}:${e.colno}\n${(e.error as Error | undefined)?.stack ?? ''}`));
  window.addEventListener('unhandledrejection', (e) => show(`오류(약속): ${String((e.reason as Error | undefined)?.stack ?? e.reason)}`));
}

// 개발 중 브라우저 콘솔/자동 테스트에서 접근하기 위함
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) (window as unknown as { game: Phaser.Game }).game = game;
