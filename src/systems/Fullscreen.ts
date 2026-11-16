import Phaser from 'phaser';
import { t } from '../i18n';

/** 손가락으로 조작하는 기기인지 (휴대폰·태블릿) */
export function isTouch(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
}

/** iPhone은 게임 화면 전체화면을 지원하지 않는다 (iPad는 지원) */
export function isIPhone(): boolean {
  return /iPhone|iPod/.test(navigator.userAgent);
}

/**
 * 다른 페이지 안(iframe)이나 앱 속 웹 화면(안드로이드 WebView)에서 돌고 있는지.
 * 이런 곳은 전체화면을 제대로 지원하지 않아, 자동 전체화면을 걸면 들어갔다 바로 풀리기를 반복하며 화면이 멈춘다
 * (안드로이드 Claude 앱 아티팩트에서 확인)
 */
export function isEmbedded(): boolean {
  let framed = true;
  try {
    framed = window.self !== window.top;
  } catch {
    framed = true;
  }
  return framed || /; wv\)/.test(navigator.userAgent);
}

type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void> };

/** 전체화면으로 바꾸고, 모바일이면 가로로 고정한다. 사용자 입력(탭·클릭·키) 안에서 불러야 한다 */
export function enterFullscreen(scene: Phaser.Scene): void {
  const sm = scene.scale;
  if (!sm.fullscreen.available) {
    notify(scene, isIPhone() ? t('ui.fs.iphone') : t('ui.fs.unavailable'));
    return;
  }
  if (!sm.isFullscreen) sm.startFullscreen({ navigationUI: 'hide' });
  // 가로 고정 (지원하지 않는 브라우저는 조용히 넘어감)
  (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape').catch(() => undefined);
}

export function toggleFullscreen(scene: Phaser.Scene): void {
  if (scene.scale.isFullscreen) {
    // 사용자가 직접 끈 경우는 다시 자동으로 켜지 않는다
    wantFullscreen = false;
    scene.scale.stopFullscreen();
  } else enterFullscreen(scene);
}

/** 한 번 전체화면에 들어간 뒤 (사용자가 버튼으로 끄기 전까지) 전체화면을 유지하고 싶은지 */
let wantFullscreen = false;

/**
 * 모바일: 회전·뒤로가기 등으로 전체화면이 풀린 뒤 다시 가로가 되면 전체화면으로 되돌린다.
 * 브라우저는 사용자 입력 없이 전체화면 요청을 거부하는 경우가 많아서,
 * 가로가 되는 순간 한 번 시도하고, 거부되면 가로 상태에서 첫 터치 때 다시 요청한다.
 */
export function initAutoFullscreen(game: Phaser.Game, enabled: boolean): void {
  if (!enabled || !isTouch() || isEmbedded()) return;
  const sm = game.scale;
  if (!sm.fullscreen.available) return;
  let enteredAt = 0;
  sm.on(Phaser.Scale.Events.ENTER_FULLSCREEN, () => {
    wantFullscreen = true;
    enteredAt = performance.now();
  });
  // 들어가자마자(1.5초 안에) 풀리면 이 환경은 전체화면을 못 버티는 것: 다시 요청하지 않는다 (요청 반복으로 화면이 멈추는 것 방지)
  sm.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, () => {
    if (performance.now() - enteredAt < 1500) wantFullscreen = false;
  });
  const landscape = () => window.matchMedia?.('(orientation: landscape)').matches ?? window.innerWidth > window.innerHeight;
  const restore = () => {
    if (!wantFullscreen || sm.isFullscreen || !landscape()) return;
    sm.startFullscreen({ navigationUI: 'hide' });
    (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape').catch(() => undefined);
  };
  // 가로가 되는 순간 (허용하는 브라우저는 여기서 바로 전체화면)
  const onTurn = () => setTimeout(restore, 300);
  window.matchMedia?.('(orientation: landscape)').addEventListener?.('change', onTurn);
  window.addEventListener('orientationchange', onTurn);
  // 거부됐으면 가로 상태의 첫 터치에서 (터치를 뗄 때가 브라우저가 허락하는 사용자 입력)
  window.addEventListener('touchend', restore, { capture: true, passive: true });
}

/** 화면 위쪽에 잠깐 안내 문구 */
export function notify(scene: Phaser.Scene, text: string): void {
  const t = scene.add
    .text(320, 58, text, {
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold',
      fontSize: '12px',
      color: '#e8f7ff',
      backgroundColor: '#1a1030',
      padding: { x: 10, y: 6 },
      stroke: '#05030c',
      strokeThickness: 2,
      resolution: 2,
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(400);
  scene.tweens.add({ targets: t, alpha: 0, delay: 2200, duration: 500, onComplete: () => t.destroy() });
}
