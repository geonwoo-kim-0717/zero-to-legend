import Phaser from 'phaser';

/**
 * 판 배경(바닥·뒤 도시 실루엣) 채도 낮추기 (사용자 결정: 모든 챕터 30%, UI 세션)
 * 캐릭터·적·탄·UI는 그대로 두고 배경에만 회색을 섞어 앞의 것들이 더 잘 보이게 함.
 * 예전엔 preFX(색 행렬)를 걸었는데, 보스 등장 클로즈업처럼 카메라를 확대하면 효과 버퍼 가장자리에서 배경이 잘려 보여
 * 텍스처 자체를 한 번 회색 섞은 그림으로 바꿔 끼운다 (WebGL·캔버스 모두 같음, 프레임 비용 없음)
 */
export const BG_DESATURATE = 0.3;

/** 이미 바꾼 텍스처 (씬이 다시 시작돼도 한 번만) */
const toned = new Set<string>();

/** keys 텍스처를 채도 낮춘 그림으로 바꿔 끼움. 텍스처를 쓰는 오브젝트를 만들기 전에 부른다 */
export function toneBackground(scene: Phaser.Scene, keys: string[]): void {
  for (const key of keys) {
    if (toned.has(key) || !scene.textures.exists(key)) continue;
    const src = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const w = src.width;
    const h = src.height;
    if (!w || !h) continue;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    if (!ctx) continue;
    ctx.drawImage(src, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const k = BG_DESATURATE;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] += (l - d[i]) * k;
      d[i + 1] += (l - d[i + 1]) * k;
      d[i + 2] += (l - d[i + 2]) * k;
    }
    ctx.putImageData(img, 0, 0);
    scene.textures.remove(key);
    scene.textures.addCanvas(key, cv);
    toned.add(key);
  }
}
