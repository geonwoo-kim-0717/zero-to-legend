import Phaser from 'phaser';

/**
 * 판 배경(바닥·뒤 도시 실루엣) 채도 낮추기 (사용자 결정: 모든 챕터 30%, UI 세션)
 * 캐릭터·적·탄·UI는 그대로 두고 배경에만 회색을 섞어 앞의 것들이 더 잘 보이게 함.
 * WebGL에서만 동작 (캔버스 렌더러면 preFX가 없어 그냥 원래 색)
 */
export const BG_DESATURATE = 0.3;

export function toneBackground(objs: (Phaser.GameObjects.TileSprite | Phaser.GameObjects.Image | undefined | null)[]): void {
  for (const o of objs) {
    const fx = o?.preFX?.addColorMatrix();
    fx?.grayscale(BG_DESATURATE);
  }
}
