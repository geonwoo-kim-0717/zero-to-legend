import Phaser from 'phaser';
import { CHIPSETS, CHIPSET_IDS } from '../systems/Chipsets';

/**
 * 칩셋 그림 (아트가 오기 전 코드로 그림, UI 세션)
 * 24px 픽셀 칩 몸체(다리 달린 회로 칩) + 가운데 9×9 기호, 종류별 색 (능력치 시안·특수 주황·무기 분홍).
 * 무기 전용 칩셋은 가운데에 그 무기 아이콘(icon_<무기>)을 넣음.
 * 텍스처: icon_chip_<id> (24px), card_chip_<id> (48px = 2배, 픽셀 그대로)
 */
export const CHIP_COLOR = { stat: '#3ad7ff', special: '#ffb04a', weapon: '#ff2bd6' } as const;

/** 9×9 기호 ('#' = 칠함) */
const G: Record<string, string[]> = {
  cs_dmg: ['......##.', '.....###.', '....###..', '#..###...', '.####....', '..##.....', '.####....', '##..#....', '#........'],
  cs_rate: ['..#####..', '.#.....#.', '#...#...#', '#...#...#', '#...###.#', '#.......#', '#.......#', '.#.....#.', '..#####..'],
  cs_hp: ['.##...##.', '####.####', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....', '.........'],
  cs_move: ['#...#....', '##..##...', '.##..##..', '..##..##.', '...##..##', '..##..##.', '.##..##..', '##..##...', '#...#....'],
  cs_crit: ['....#....', '..#####..', '.#..#..#.', '.#.....#.', '###.#.###', '.#.....#.', '.#..#..#.', '..#####..', '....#....'],
  cs_area: ['#...#...#', '.#..#..#.', '..#...#..', '...###...', '####.####', '...###...', '..#...#..', '.#..#..#.', '#...#...#'],
  cs_pick: ['.##...##.', '.##...##.', '.##...##.', '.##...##.', '.##...##.', '.##...##.', '..##.##..', '...###...', '.........'],
  cs_xp: ['....#....', '...###...', '..#####..', '.###.###.', '....#....', '....#....', '....#....', '.#######.', '.........'],
  cs_regen: ['...###...', '...###...', '...###...', '#########', '#########', '#########', '...###...', '...###...', '...###...'],
  cs_dr: ['#########', '#.......#', '#..###..#', '#..###..#', '#.......#', '.#.....#.', '..#...#..', '...#.#...', '....#....'],
  cs_killBoom: ['....#....', '.#..#..#.', '..#####..', '.##...##.', '###.#.###', '.##...##.', '..#####..', '.#..#..#.', '....#....'],
  cs_dashBolt: ['.....###.', '....###..', '...###...', '..######.', '.....##..', '....##...', '...##....', '..##.....', '.#.......'],
  cs_rhythm: ['...######', '...#....#', '...#....#', '...#....#', '...#....#', '.###..###', '####.####', '.##...##.', '.........'],
  cs_hurtZap: ['.##...##.', '####.####', '####.####', '###.#####', '.##..###.', '..###.#..', '...##.#..', '....#....', '.........'],
  cs_vamp: ['....#....', '....#....', '...###...', '..#####..', '.#######.', '.#######.', '.##.####.', '..#####..', '...###...'],
  cs_luck: ['..#####..', '.#.....#.', '#..###..#', '#..#....#', '#..###..#', '#....#..#', '#..###..#', '.#.....#.', '..#####..'],
  cs_killShield: ['#########', '####.####', '###...###', '#.......#', '##.....##', '.##...##.', '..##.##..', '...###...', '....#....'],
  cs_execute: ['..#####..', '.#######.', '##..#..##', '##..#..##', '#########', '.###.###.', '..#####..', '..#.#.#..', '.........'],
  cs_hunter: ['.........', '#...#...#', '##.###.##', '#########', '#########', '#.#.#.#.#', '#########', '.........', '.........'],
  cs_frost: ['....#....', '.#..#..#.', '..#.#.#..', '...###...', '#########', '...###...', '..#.#.#..', '.#..#..#.', '....#....'],
};
/** 기호가 없는 칩셋 (편집 페이지에서 새로 추가된 것): 칩 무늬 */
const FALLBACK = ['.........', '.#######.', '.#.....#.', '.#.###.#.', '.#.#.#.#.', '.#.###.#.', '.#.....#.', '.#######.', '.........'];

const rgb = (hex: string) => Phaser.Display.Color.HexStringToColor(hex);
const css = (c: Phaser.Display.Color, a = 1) => `rgba(${c.red},${c.green},${c.blue},${a})`;
const shade = (c: Phaser.Display.Color, k: number) => {
  const o = c.clone();
  if (k > 0) o.lighten(k * 100);
  else o.darken(-k * 100);
  return o;
};

/** 24px 칩 그림을 그림 */
function drawChip(scene: Phaser.Scene, ctx: CanvasRenderingContext2D, id: string): void {
  const def = CHIPSETS[id];
  const col = rgb(CHIP_COLOR[def?.kind ?? 'stat'] ?? CHIP_COLOR.stat);
  const px = (x: number, y: number, w: number, h: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  };
  const OUT = '#05030c';
  // 다리 (위·아래·왼쪽·오른쪽 3개씩)
  for (const k of [7, 11, 15]) {
    px(k, 1, 2, 3, OUT);
    px(k, 20, 2, 3, OUT);
    px(1, k, 3, 2, OUT);
    px(20, k, 3, 2, OUT);
    px(k, 2, 2, 2, '#8a8fb0');
    px(k, 20, 2, 2, '#8a8fb0');
    px(2, k, 2, 2, '#8a8fb0');
    px(20, k, 2, 2, '#8a8fb0');
  }
  // 몸체: 어두운 외곽선 + 종류 색 테두리 + 어두운 판
  px(3, 3, 18, 18, OUT);
  px(4, 4, 16, 16, css(shade(col, -0.25)));
  px(5, 5, 14, 14, '#1a1430');
  px(5, 5, 14, 1, css(col, 0.35));
  // 모서리 표시 (칩 방향 점)
  px(6, 6, 1, 1, css(col, 0.8));
  // 가운데: 무기 전용은 무기 아이콘, 아니면 9×9 기호
  if (def?.kind === 'weapon' && def.weapon && scene.textures.exists(`icon_${def.weapon}`)) {
    const src = scene.textures.get(`icon_${def.weapon}`).getSourceImage() as CanvasImageSource & { width: number; height: number };
    ctx.drawImage(src, 12 - src.width / 2, 12 - src.height / 2);
    return;
  }
  const glyph = G[id] ?? FALLBACK;
  const light = css(shade(col, 0.25));
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 9; x++) {
      if (glyph[y][x] !== '#') continue;
      px(7 + x, 7 + y, 1, 1, y < 3 ? light : css(col));
    }
}

/** 게임 시작 때 한 번: 모든 칩셋 그림 텍스처를 만듦 (이미 있으면 건너뜀) */
export function makeChipArt(scene: Phaser.Scene): void {
  for (const id of CHIPSET_IDS) {
    const small = `icon_chip_${id}`;
    const big = `card_chip_${id}`;
    if (scene.textures.exists(big)) continue;
    const s = scene.textures.createCanvas(small, 24, 24);
    if (!s) continue;
    drawChip(scene, s.getContext(), id);
    s.refresh();
    const b = scene.textures.createCanvas(big, 48, 48);
    if (!b) continue;
    const bc = b.getContext();
    bc.imageSmoothingEnabled = false;
    bc.drawImage(s.getSourceImage() as HTMLCanvasElement, 0, 0, 48, 48);
    b.refresh();
    scene.textures.get(small).setFilter(Phaser.Textures.FilterMode.NEAREST);
    scene.textures.get(big).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}

/** 칩셋 카드 그림 이름 (LevelUpUI는 card_<art>를 찾음) */
export const chipArt = (id: string) => `chip_${id}`;
