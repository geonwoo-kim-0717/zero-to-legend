import Phaser from 'phaser';
import { COLORS, VIEW_W, VIEW_H } from '../config';
import { Sound } from '../systems/Sound';
import { setupCamera } from '../ui/text';
import { Ads } from '../systems/Ads';
import enemies from '../data/enemies.json';
// src/assets/*.png 를 모두 data URI로 포함하고, 파일 이름을 텍스처 키로 쓴다
const PNGS = import.meta.glob('../assets/*.png', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>;
const PIXEL_ART: [string, string][] = Object.entries(PNGS).map(([path, url]) => [path.split('/').pop()!.replace('.png', ''), url]);

/**
 * 적 그림의 바깥 윤곽선(검정)을 옅은 보라빛으로 바꾼다.
 * 어두운 바닥 위에서 어두운 적(타워 경비, 드론, 부패 경찰 등)의 실루엣이 묻히지 않게 하는 림 라이트.
 * 원본 PNG는 그대로 두고, 불러올 때만 바꾼다. 안쪽 윤곽선(팔다리 구분선)은 건드리지 않는다.
 */
const ENEMY_IDS = Object.keys(enemies);
const ENEMY_SKINS = ['guard_baton', 'guard_rifle', 'guard_shotgun', 'guard_charger', 'spider_bot'];
const RIM: [number, number, number] = [0x8a, 0x7a, 0xa8];
function isEnemyKey(key: string): boolean {
  const base = key.replace(/_(w1|w2|aim|charge)$/, '');
  return ENEMY_IDS.includes(base) || ENEMY_SKINS.includes(base);
}
function rimLight(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.width;
  const h = img.height;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const cx = cv.getContext('2d')!;
  cx.drawImage(img, 0, 0);
  const d = cx.getImageData(0, 0, w, h);
  const a = d.data;
  const clear = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || a[(y * w + x) * 4 + 3] === 0;
  const hit: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (a[i + 3] === 0 || a[i] !== 7 || a[i + 1] !== 6 || a[i + 2] !== 15) continue;
      if (clear(x - 1, y) || clear(x + 1, y) || clear(x, y - 1) || clear(x, y + 1)) hit.push(i);
    }
  for (const i of hit) {
    a[i] = RIM[0];
    a[i + 1] = RIM[1];
    a[i + 2] = RIM[2];
  }
  cx.putImageData(d, 0, 0);
  return cv;
}

/** data URI 이미지를 텍스처로 등록 */
function loadTexture(scene: Phaser.Scene, key: string, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (isEnemyKey(key)) scene.textures.addCanvas(key, rimLight(img));
      else scene.textures.addImage(key, img);
      resolve();
    };
    img.onerror = () => reject(new Error(`texture ${key} failed to load`));
    img.src = url;
  });
}

/** 픽셀아트 PNG(src/assets)를 불러오고, 아직 그림이 없는 항목(보스·탄·아이템)은 도형으로 임시 텍스처를 만든다 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    setupCamera(this);
    const bar = this.add.rectangle(VIEW_W / 2 - 100, VIEW_H / 2 + 14, 0, 4, COLORS.cyan).setOrigin(0, 0.5);
    this.add.rectangle(VIEW_W / 2, VIEW_H / 2 + 14, 200, 4).setStrokeStyle(1, COLORS.gridLine);
    this.add.text(VIEW_W / 2, VIEW_H / 2 - 6, 'LOADING', { fontFamily: 'sans-serif', fontSize: '12px', color: '#8a7aa8', resolution: 2 }).setOrigin(0.5);
    this.load.on('progress', (v: number) => (bar.width = 200 * v));
    Sound.preload(this);
    Ads.loadingStart();
  }

  create(): void {
    Sound.init(this.game);
    this.children.removeAll(true);
    const g = this.add.graphics();
    const make = (key: string, w: number, h: number, draw: () => void) => {
      g.clear();
      draw();
      g.generateTexture(key, w, h);
    };

    make('glow', 32, 32, () => {
      for (let r = 16; r > 0; r -= 2) g.fillStyle(0xffffff, 0.04 + (16 - r) * 0.012).fillCircle(16, 16, r);
    });
    make('bullet', 6, 6, () => {
      g.fillStyle(COLORS.yellow).fillCircle(3, 3, 3);
      g.fillStyle(0xffffff).fillCircle(3, 3, 1);
    });
    make('xp', 6, 8, () => {
      g.fillStyle(COLORS.green).fillPoints([{ x: 3, y: 0 }, { x: 6, y: 4 }, { x: 3, y: 8 }, { x: 0, y: 4 }], true);
    });
    make('ebullet', 6, 6, () => {
      g.fillStyle(0xff2a3a).fillCircle(3, 3, 3);
      g.fillStyle(0xffffff).fillCircle(3, 3, 1);
    });
    make('hackdrone', 8, 8, () => {
      g.fillStyle(COLORS.cyan).fillRect(1, 1, 6, 6);
      g.fillStyle(0xffffff).fillRect(3, 3, 2, 2);
    });
    make('grenade', 6, 6, () => {
      g.fillStyle(COLORS.magenta).fillCircle(3, 3, 3);
      g.fillStyle(COLORS.yellow).fillCircle(3, 3, 1);
    });
    make('heal', 10, 10, () => {
      g.fillStyle(0xffffff).fillRect(0, 0, 10, 10);
      g.fillStyle(COLORS.green).fillRect(4, 1, 2, 8).fillRect(1, 4, 8, 2);
    });
    make('wave', 18, 8, () => {
      g.fillStyle(COLORS.cyan, 0.5).fillEllipse(9, 4, 18, 8);
      g.fillStyle(0xffffff).fillEllipse(11, 4, 10, 3);
    });
    make('missile', 8, 4, () => {
      g.fillStyle(0xe8f7ff).fillRect(0, 1, 6, 2);
      g.fillStyle(0xff2a3a).fillRect(6, 0, 2, 4);
      g.fillStyle(COLORS.orange).fillRect(0, 1, 1, 2);
    });
    make('mine', 8, 8, () => {
      g.fillStyle(0x1a1030).fillCircle(4, 4, 4);
      g.fillStyle(0x8a7aa8).fillCircle(4, 4, 3);
      g.fillStyle(0xff2a3a).fillRect(3, 3, 2, 2);
    });
    make('turretw', 12, 12, () => {
      g.fillStyle(0x8a7aa8).fillRect(2, 3, 8, 6);
      g.fillStyle(0x1a1030).fillRect(3, 4, 6, 4);
      g.fillStyle(0xe8f7ff).fillRect(8, 5, 4, 2);
      g.fillStyle(COLORS.yellow).fillRect(4, 5, 2, 2);
    });
    make('spark', 3, 3, () => g.fillStyle(0xffffff).fillRect(0, 0, 3, 3));
    make('scan', 4, 2, () => g.fillStyle(0x000000, 0.25).fillRect(0, 1, 4, 1));
    g.destroy();

    // 웹 폰트가 준비된 뒤 글자를 그려야 대체 글꼴로 굳지 않는다 (최대 2초 대기)
    const ready = document.fonts
      ? Promise.race([
          Promise.all([document.fonts.load('700 16px "Noto Sans KR"'), document.fonts.load('900 16px "Noto Sans KR"')]),
          new Promise((r) => setTimeout(r, 2000)),
        ])
      : Promise.resolve();
    Promise.all([ready.catch(() => undefined), ...PIXEL_ART.map(([k, u]) => loadTexture(this, k, u))])
      .then(() => {
        Ads.loadingStop();
        // CrazyGames: 한 번의 클릭으로 플레이할 수 있게 타이틀을 건너뛰고 아지트로
        this.scene.start(Ads.provider === 'crazygames' ? 'Hideout' : 'Title');
      })
      .catch((e) => console.error(e));
  }
}
