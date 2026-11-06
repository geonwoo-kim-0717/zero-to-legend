import Phaser from 'phaser';

/** 손가락으로 조작하는 기기인지 (휴대폰·태블릿) */
export function isTouch(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
}

/** iPhone은 게임 화면 전체화면을 지원하지 않는다 (iPad는 지원) */
export function isIPhone(): boolean {
  return /iPhone|iPod/.test(navigator.userAgent);
}

type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void> };

/** 전체화면으로 바꾸고, 모바일이면 가로로 고정한다. 사용자 입력(탭·클릭·키) 안에서 불러야 한다 */
export function enterFullscreen(scene: Phaser.Scene): void {
  const sm = scene.scale;
  if (!sm.fullscreen.available) {
    notify(scene, isIPhone() ? 'iPhone은 공유 → 홈 화면에 추가로 전체화면 실행' : '이 화면에서는 전체화면을 쓸 수 없어요');
    return;
  }
  if (!sm.isFullscreen) sm.startFullscreen({ navigationUI: 'hide' });
  // 가로 고정 (지원하지 않는 브라우저는 조용히 넘어감)
  (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape').catch(() => undefined);
}

export function toggleFullscreen(scene: Phaser.Scene): void {
  if (scene.scale.isFullscreen) scene.scale.stopFullscreen();
  else enterFullscreen(scene);
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
