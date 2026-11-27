import Phaser from 'phaser';

/**
 * 보급 상자 그림 (사용자 선택 시안 C: 하드케이스, 아트가 오기 전 코드로 그림, UI 세션)
 * 손잡이 달린 무기 가방 24×22px (아래 2줄은 그림자). 잠금쇠·띠는 등급 색, 영웅부터 아래 띠, 전설·신화는 금속 모서리, 신화는 가운데 붉은 십자.
 * 텍스처: crate_<0~4> (등급 순서: 일반·희귀·영웅·전설·신화), crate_glow (빛), crate_beam (빛기둥) — 빛·빛기둥은 흰색이라 등급 색으로 틴트
 */
export const CRATE_COLOR = ['#e8f7ff', '#00f0ff', '#ff2bd6', '#fff23a', '#ff2a3a'] as const;
export const crateKey = (rank: number) => `crate_${Math.max(0, Math.min(4, Math.round(rank)))}`;

const OUT = '#05030c';
const GOLD = '#ffd23a';

function mix(a: string, b: string, t: number): string {
  const A = Phaser.Display.Color.HexStringToColor(a);
  const B = Phaser.Display.Color.HexStringToColor(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${c(A.red, B.red)},${c(A.green, B.green)},${c(A.blue, B.blue)})`;
}

function drawCrate(ctx: CanvasRenderingContext2D, rank: number): void {
  const col = CRATE_COLOR[rank];
  const p = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  // 그림자
  p(3, 20, 18, 1, 'rgba(0,0,0,0.45)');
  p(1, 19, 22, 1, 'rgba(0,0,0,0.3)');
  // 손잡이
  p(8, 2, 8, 4, OUT);
  p(9, 3, 6, 1, '#8a8fb0');
  p(9, 3, 1, 3, '#8a8fb0');
  p(14, 3, 1, 3, '#8a8fb0');
  // 몸통
  p(0, 5, 24, 14, OUT);
  p(1, 6, 22, 12, '#24203a');
  p(1, 6, 22, 1, '#3a3458');
  for (let x = 3; x < 21; x += 3) p(x, 12, 2, 4, '#1a1430');
  p(1, 10, 22, 1, '#120e22');
  // 잠금쇠 (일반은 회색)
  const lc = rank === 0 ? '#8a8aa0' : col;
  p(4, 8, 3, 4, OUT);
  p(5, 9, 1, 2, lc);
  p(17, 8, 3, 4, OUT);
  p(18, 9, 1, 2, lc);
  if (rank >= 1) p(10, 7, 4, 1, lc);
  if (rank >= 2) p(1, 17, 22, 1, mix(col, OUT, 0.3));
  if (rank >= 3) {
    const t = rank === 4 ? '#ff8a2a' : GOLD;
    p(0, 5, 3, 3, t);
    p(21, 5, 3, 3, t);
    p(0, 16, 3, 3, t);
    p(21, 16, 3, 3, t);
  }
  if (rank === 4) {
    p(10, 13, 4, 2, '#ff2a3a');
    p(11, 12, 2, 4, '#ff2a3a');
  }
}

/** 게임 시작 때 한 번: 상자 5단계 + 빛·빛기둥 텍스처 (이미 있으면 건너뜀) */
export function makeCrateArt(scene: Phaser.Scene): void {
  const T = scene.textures;
  for (let r = 0; r < 5; r++) {
    const key = crateKey(r);
    if (T.exists(key)) continue;
    const c = T.createCanvas(key, 24, 22);
    if (!c) continue;
    drawCrate(c.getContext(), r);
    c.refresh();
    T.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
  if (!T.exists('crate_glow')) {
    const c = T.createCanvas('crate_glow', 48, 48);
    if (c) {
      const x = c.getContext();
      const g = x.createRadialGradient(24, 24, 1, 24, 24, 24);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 48, 48);
      c.refresh();
    }
  }
  if (!T.exists('crate_beam')) {
    const c = T.createCanvas('crate_beam', 12, 48);
    if (c) {
      const x = c.getContext();
      const g = x.createLinearGradient(0, 0, 0, 48);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,0.6)');
      x.fillStyle = g;
      x.fillRect(0, 0, 12, 48);
      // 가장자리는 옅게
      x.globalCompositeOperation = 'destination-out';
      x.fillStyle = 'rgba(0,0,0,0.5)';
      x.fillRect(0, 0, 2, 48);
      x.fillRect(10, 0, 2, 48);
      c.refresh();
    }
  }
}
