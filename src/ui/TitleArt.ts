import Phaser from 'phaser';
import { FONT } from './text';

/**
 * 시작 화면 그림·로고 (사용자 선택: 로고 시안 C 글리치, UI 세션)
 * 로고: 흰 픽셀 글자 + 시안·분홍 색 어긋남 + 줄 밀림 + 스캔 줄. 글꼴로 작게 그린 글자를 픽셀 격자로 바꿔 그림 (배경 투명, 한국어·영어).
 * 텍스처: logo_<lang>_0 (기본), logo_<lang>_1~3 (지직거릴 때 잠깐 보이는 프레임). 칸 하나 = CELL px, 화면에는 0.5배로 그림
 */
const CELL = 3;

/** 시작 화면 배경(1280×720)에서 깜빡일 네온 간판 자리 [x0, y0, x1, y1] (주인공에 가리지 않는 것) */
export const TITLE_SIGNS: [number, number, number, number][] = [
  [1168, 342, 1200, 478],
  [650, 496, 688, 580],
  [518, 388, 546, 464],
  [1022, 444, 1044, 496],
  [766, 516, 790, 564],
];

/** 글자를 작게 그려 알파 격자(0/1)로 */
function textGrid(lines: string[], size: number, track: number): number[][] {
  const c = document.createElement('canvas');
  const x = c.getContext('2d')!;
  const font = `900 ${size}px ${FONT}`;
  x.font = font;
  const width = (s: string) => [...s].reduce((a, ch) => a + x.measureText(ch).width + track, -track);
  const ws = lines.map(width);
  const lh = size * 1.02;
  const pad = 6;
  c.width = Math.ceil(Math.max(...ws)) + pad * 2;
  c.height = Math.ceil(lh * lines.length) + pad * 2;
  x.font = font;
  x.textBaseline = 'top';
  x.fillStyle = '#fff';
  lines.forEach((l, i) => {
    let px = pad + (c.width - pad * 2 - ws[i]) / 2;
    for (const ch of l) {
      x.fillText(ch, px, pad + i * lh - size * 0.08);
      px += x.measureText(ch).width + track;
    }
  });
  const d = x.getImageData(0, 0, c.width, c.height).data;
  const g: number[][] = [];
  for (let yy = 0; yy < c.height; yy++) {
    const r: number[] = [];
    for (let xx = 0; xx < c.width; xx++) r.push(d[(yy * c.width + xx) * 4 + 3] > 110 ? 1 : 0);
    g.push(r);
  }
  return g;
}

/** 격자 한 장을 그림. shift: 줄 → 옆으로 밀 칸 수, split: 색 어긋남 칸 수 */
function paint(scene: Phaser.Scene, key: string, g: number[][], shift: Record<number, number>, split: number): void {
  const H = g.length;
  const W = g[0].length;
  const margin = 8;
  const tex = scene.textures.createCanvas(key, (W + margin * 2) * CELL, H * CELL);
  if (!tex) return;
  const x = tex.getContext();
  const draw = (dx: number, col: string) => {
    x.fillStyle = col;
    for (let yy = 0; yy < H; yy++) {
      const s = shift[yy] ?? 0;
      for (let xx = 0; xx < W; xx++) if (g[yy][xx]) x.fillRect((xx + dx + s + margin) * CELL, yy * CELL, CELL, CELL);
    }
  };
  x.globalCompositeOperation = 'lighter';
  draw(-split, '#00c8ff');
  draw(split, '#ff2bd6');
  x.globalCompositeOperation = 'source-over';
  draw(0, '#f4f8ff');
  // 스캔 줄 (두 칸마다 한 줄을 옅게 지움)
  x.globalCompositeOperation = 'destination-out';
  x.fillStyle = 'rgba(0,0,0,0.35)';
  for (let yy = 0; yy < H * CELL; yy += CELL * 2) x.fillRect(0, yy + CELL, tex.width, 1);
  x.globalCompositeOperation = 'source-over';
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/** 언어별 글리치 로고 텍스처 4장을 만들고 기본 키를 돌려줌 (이미 있으면 다시 안 만듦) */
export function makeGlitchLogo(scene: Phaser.Scene, lang: 'ko' | 'en'): string {
  const base = `logo_${lang}`;
  if (scene.textures.exists(`${base}_0`)) return base;
  const lines = lang === 'ko' ? ['제로 투', '레전드'] : ['ZERO TO', 'LEGEND'];
  const g = textGrid(lines, lang === 'ko' ? 24 : 22, 1);
  const H = g.length;
  // 기본: 줄 몇 개만 살짝 밀림
  paint(scene, `${base}_0`, g, { [Math.round(H * 0.18)]: 4, [Math.round(H * 0.2)]: 4, [Math.round(H * 0.46)]: -3, [Math.round(H * 0.48)]: -3, [Math.round(H * 0.78)]: 5 }, 2);
  // 지직거림 프레임: 다른 줄들이 크게 밀리고 색이 더 벌어짐
  const rnd = (seed: number) => () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let f = 1; f <= 3; f++) {
    const r = rnd(f * 7919);
    const shift: Record<number, number> = {};
    for (let k = 0; k < 4; k++) {
      const y0 = Math.floor(r() * H);
      const h = 1 + Math.floor(r() * 3);
      const s = Math.round((r() - 0.5) * 10);
      for (let yy = y0; yy < Math.min(H, y0 + h); yy++) shift[yy] = s;
    }
    paint(scene, `${base}_${f}`, g, shift, 3 + f);
  }
  return base;
}
