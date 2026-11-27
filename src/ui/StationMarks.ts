import Phaser from 'phaser';

/** 노점 색: 블랙마켓 노랑, 리퍼닥 초록 */
export const STATION_COLOR = { shop: 0xfff23a, ripper: 0x39ff88 } as const;

/**
 * 맵 위 노점 (그림이 오기 전 코드로 그린 네온 노점, UI 시안 확정본)
 * - 블랙마켓: 줄무늬 차양 + 진열 상자 + 간판 줄
 * - 리퍼닥: 초록 십자 간판 + 진료 침대
 * g는 월드 좌표 그래픽(fx), a는 깜빡임 알파, time은 경과 초
 */
export function drawStall(g: Phaser.GameObjects.Graphics, kind: 'shop' | 'ripper', x: number, y: number, a: number, time: number, reach: number): void {
  const col = STATION_COLOR[kind];
  const pulse = 0.5 + Math.sin(time * 5) * 0.2;
  // 닿으면 열리는 범위
  g.lineStyle(1, col, 0.3 * a);
  const R = reach + 10 + Math.sin(time * 4) * 2;
  for (let i = 0; i < 24; i += 2) g.beginPath().arc(x, y, R, (i / 24) * Math.PI * 2, ((i + 1) / 24) * Math.PI * 2).strokePath();
  // 바닥 빛
  g.fillStyle(col, 0.08 * a).fillEllipse(x, y + 10, 52, 16);
  // 기둥
  g.fillStyle(0x2a1a40, a).fillRect(x - 18, y - 14, 3, 26).fillRect(x + 15, y - 14, 3, 26);
  if (kind === 'shop') {
    // 줄무늬 차양
    for (let i = 0; i < 6; i++) g.fillStyle(i % 2 ? 0xfff23a : 0xff2bd6, 0.95 * a).fillRect(x - 22 + i * 7.33, y - 22, 7.4, 8);
    g.fillStyle(0xffffff, 0.25 * a).fillRect(x - 22, y - 22, 44, 2);
    // 진열 상자
    g.fillStyle(0x3ad7ff, a).fillRect(x - 14, y - 6, 7, 6);
    g.fillStyle(0xff2bd6, a).fillRect(x - 3, y - 7, 7, 7);
    g.fillStyle(0x39ff88, a).fillRect(x + 8, y - 5, 6, 5);
  } else {
    // 십자 간판
    g.fillStyle(0x0a1410, 0.95 * a).fillRect(x - 13, y - 26, 26, 14);
    g.lineStyle(1.5, col, a).strokeRect(x - 13, y - 26, 26, 14);
    g.fillStyle(col, (0.7 + pulse * 0.3) * a).fillRect(x - 2, y - 24, 4, 10).fillRect(x - 6, y - 21, 12, 4);
    // 진료 침대
    g.fillStyle(0x8a8fb0, a).fillRect(x - 12, y - 6, 24, 4);
    g.fillStyle(0x3ad7ff, 0.8 * a).fillRect(x - 12, y - 9, 6, 3);
  }
  // 카운터 (네온 테두리)
  g.fillStyle(0x120a24, 0.95 * a).fillRect(x - 20, y, 40, 12);
  g.lineStyle(1.5, col, a).strokeRect(x - 20, y, 40, 12);
  g.fillStyle(col, pulse * a).fillRect(x - 16, y + 4, 32, 3);
}

/**
 * 화면 밖 노점 안내 (가장자리, 화면 좌표 그래픽): 둥근 표시 + 문양 + 남은 시간 고리 + 방향 화살표
 * frac: 남은 시간 비율(1 → 0)
 */
export function drawMarker(g: Phaser.GameObjects.Graphics, kind: 'shop' | 'ripper', x: number, y: number, ang: number, frac: number, time: number): void {
  const col = STATION_COLOR[kind];
  const r = 14;
  // 방향 화살표 (원 바깥)
  const bx = (w: number) => x + Math.cos(ang + w) * (r + 2);
  const by = (w: number) => y + Math.sin(ang + w) * (r + 2);
  g.fillStyle(col, 0.95).fillTriangle(x + Math.cos(ang) * (r + 10), y + Math.sin(ang) * (r + 10), bx(0.45), by(0.45), bx(-0.45), by(-0.45));
  // 몸통
  g.fillStyle(0x0a0716, 0.9).fillCircle(x, y, r);
  g.lineStyle(1, col, 0.8).strokeCircle(x, y, r);
  // 남은 시간 고리
  g.lineStyle(3, 0xffffff, 0.15).strokeCircle(x, y, r + 3);
  g.lineStyle(3, col, frac < 0.2 && Math.floor(time * 4) % 2 ? 0.35 : 1);
  g.beginPath().arc(x, y, r + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, frac)).strokePath();
  // 문양: 블랙마켓 ◆, 리퍼닥 ✚
  g.fillStyle(col, 1);
  if (kind === 'shop') g.fillPoints([new Phaser.Math.Vector2(x, y - 7), new Phaser.Math.Vector2(x + 6, y), new Phaser.Math.Vector2(x, y + 7), new Phaser.Math.Vector2(x - 6, y)], true);
  else g.fillRect(x - 2, y - 7, 4, 14).fillRect(x - 7, y - 2, 14, 4);
}
