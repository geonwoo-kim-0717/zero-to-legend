import Phaser from 'phaser';
import { BASE_TEXT } from './text';
import { VIEW_W, VIEW_H } from '../config';
import { Sound } from '../systems/Sound';
import type { Choice } from '../systems/Progression';
import { LevelUpUI, TAG_COLOR } from './LevelUpUI';
import { tagName } from './synergyText';
import { t, I18n } from '../i18n';
import { SLOT_EN } from './cardInfo';

/** 블랙마켓 화면에 넘길 것 */
export interface ShopModel {
  chips: number;
  items: { choice: Choice; price: number }[];
  heal?: { pct: number; price: number };
  /** 다시 뽑기 (한 번 쓰면 없음) */
  reroll?: { price: number };
}
export interface ShopActs {
  buy: (i: number) => void;
  heal: () => void;
  reroll: () => void;
  leave: () => void;
}

/** 리퍼닥 화면에 넘길 것 */
export interface RipperModel {
  chips: number;
  cyber: {
    part: string;
    label: string;
    item?: { name: string; art: string; color: number; level: number; max: number; now: string; next: string; price: number };
  }[];
  os: {
    cur: string;
    price: number;
    list: { id: string; name: string; level: number; color: string; tags: string[]; lines: { text: string; on: boolean }[] }[];
  };
}
export interface RipperActs {
  upgrade: (part: string) => void;
  swap: (id: string) => void;
  leave: () => void;
}

const D = 310;
/** 블랙마켓 카드 높이: 위 56 + 244 + 구매 버튼(4+20) = 324, 아래 버튼 줄은 328부터 */
const SHOP_CARD_H = 244;
const CHIP = 0x3ad7ff;
const RED = 0xff5a6a;
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/**
 * 상점(블랙마켓)·리퍼닥 화면 (UI 시안 확정본)
 * - 블랙마켓: 아이템 카드 3장 + 카드마다 구매 버튼, 아래에 체력 회복·다시 뽑기·떠나기
 * - 리퍼닥: 왼쪽 사이버웨어 강화 줄, 오른쪽 OS 8종 격자 + 고른 OS 자세히 + 바꿔 끼기
 */
export class StationUI {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private keyHandler?: (e: KeyboardEvent) => void;
  /** 리퍼닥에서 고른 OS (다시 그려도 유지) */
  private selOs: string | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly cards: LevelUpUI,
  ) {}

  hide(): void {
    this.cards.hide();
    for (const o of this.objs) o.destroy();
    this.objs = [];
    if (this.keyHandler) this.scene.input.keyboard!.off('keydown', this.keyHandler);
    this.keyHandler = undefined;
  }

  /** 새 노점에 들어갈 때 (고른 OS 초기화) */
  reset(): void {
    this.selOs = null;
  }

  private add<T extends Phaser.GameObjects.GameObject>(o: T, depth = D): T {
    (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
    (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(depth);
    this.objs.push(o);
    return o;
  }

  private txt(x: number, y: number, str: string, size: number, color: string, extra: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}, depth = D + 2): Phaser.GameObjects.Text {
    return this.add(this.scene.add.text(x, y, str, { ...BASE_TEXT, fontSize: `${size}px`, color, strokeThickness: 0, ...extra }), depth);
  }

  /** 눌렀다 떼면 act (버튼 밖에서 뗀 것은 무시) */
  private tap(o: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform, act: () => void): void {
    let armed = false;
    (o as unknown as Phaser.GameObjects.Rectangle).setInteractive({ useHandCursor: true });
    o.on('pointerdown', () => (armed = true));
    o.on('pointerout', () => (armed = false));
    o.on('pointerup', () => {
      if (armed) act();
      armed = false;
    });
  }

  /** ◆ 칩 모양 (작은 마름모) */
  private diamond(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color = CHIP): void {
    g.fillStyle(color, 1).fillPoints([new Phaser.Math.Vector2(x, y - r), new Phaser.Math.Vector2(x + r, y), new Phaser.Math.Vector2(x, y + r), new Phaser.Math.Vector2(x - r, y)], true);
  }

  /** 오른쪽 위 가진 칩 */
  private balance(chips: number): void {
    const g = this.add(this.scene.add.graphics(), D + 1);
    const tx = this.txt(VIEW_W - 16, 10, String(chips), 15, hex(CHIP), { fontStyle: '900', strokeThickness: 2 }).setOrigin(1, 0).setShadow(0, 0, hex(CHIP), 6, true, true);
    this.diamond(g, tx.x - tx.width - 9, tx.y + 10, 5);
  }

  /** 값 버튼: [◆값 라벨], 칩이 모자라면 빨갛게 */
  private priceButton(x: number, y: number, w: number, h: number, price: number, label: string, ok: boolean, color: number, act: () => void, size = 12): void {
    const g = this.add(this.scene.add.graphics(), D + 1);
    const c = ok ? color : RED;
    g.fillStyle(ok ? 0x0a1420 : 0x1a0a10, 0.95).fillRect(x, y, w, h);
    g.lineStyle(2, c, ok ? 1 : 0.6).strokeRect(x + 1, y + 1, w - 2, h - 2);
    if (ok) g.lineStyle(2, c, 0.2).strokeRect(x - 2, y - 2, w + 4, h + 4);
    const pt = this.txt(0, y + h / 2, price > 0 ? String(price) : t('station.free'), size, ok ? hex(CHIP) : hex(RED), { fontStyle: '900' }).setOrigin(0, 0.5);
    const lt = this.txt(0, y + h / 2, ok ? label : t('station.need'), size, ok ? '#e8f7ff' : hex(RED), { fontStyle: '900' }).setOrigin(0, 0.5);
    const dw = price > 0 ? 12 : 0;
    const total = dw + pt.width + 6 + lt.width;
    let cx = x + w / 2 - total / 2;
    if (price > 0) this.diamond(g, cx + 4, y + h / 2, 4, ok ? CHIP : RED);
    cx += dw;
    pt.setX(cx);
    lt.setX(cx + pt.width + 6);
    const hit = this.add(this.scene.add.rectangle(x - 2, y - 2, w + 4, h + 4, 0xffffff, 0).setOrigin(0), D + 3);
    this.tap(hit, () => {
      if (!ok) {
        Sound.play('block');
        return;
      }
      act();
    });
  }

  showShop(m: ShopModel, a: ShopActs): void {
    this.hide();
    const s = this.scene;
    const dimmed = m.items.map((it) => it.price > m.chips);
    const lay = this.cards.show(
      m.items.map((it) => it.choice),
      0,
      (i) => (dimmed[i] ? Sound.play('block') : a.buy(i)),
      () => undefined,
      t('station.shop'),
      undefined,
      // 카드 수에 맞춰 폭을 줄임 (아이템 3 + 칩셋 1 = 4장)
      { top: 56, cw: Math.min(184, Math.floor((VIEW_W - 24 - 12 * (m.items.length - 1)) / Math.max(1, m.items.length))), tight: true, fixedH: SHOP_CARD_H, titleColor: '#fff23a', dimmed },
    );
    this.txt(VIEW_W / 2, 43, t('station.shopHint'), 9, '#8a7aa8').setOrigin(0.5, 0);
    this.balance(m.chips);
    // 카드마다 구매 버튼
    // 카드 높이를 고정해 구매 버튼이 아래 버튼 줄(VIEW_H - 32)과 겹치지 않게
    m.items.forEach((it, i) => this.priceButton(lay.xs[i], lay.top + lay.ch + 4, lay.cw, 20, it.price, t('station.buy'), !dimmed[i], CHIP, () => a.buy(i)));
    // 아래 줄: 체력 회복 · 다시 뽑기 · 떠나기
    const by = VIEW_H - 32;
    const svc = (x: number, icon: string, iconCol: number, label: string, price: number, act: () => void) => {
      const g = this.add(s.add.graphics(), D + 1);
      const ok = price <= m.chips;
      const lt = this.txt(x + 30, by + 12, label, 11, ok ? '#e8f7ff' : '#8a7aa8').setOrigin(0, 0.5);
      const pt = this.txt(lt.x + lt.width + 18, by + 12, String(price), 11, ok ? hex(CHIP) : hex(RED), { fontStyle: '900' }).setOrigin(0, 0.5);
      const w = pt.x + pt.width + 10 - x;
      g.fillStyle(0x120a24, 0.95).fillRect(x, by, w, 24);
      g.lineStyle(1, 0xffffff, ok ? 0.3 : 0.15).strokeRect(x + 0.5, by + 0.5, w - 1, 23);
      g.fillStyle(iconCol, ok ? 1 : 0.4).fillCircle(x + 15, by + 12, 8);
      this.diamond(g, pt.x - 8, by + 12, 4, ok ? CHIP : RED);
      this.txt(x + 15, by + 12, icon, 11, '#0a0614', { fontStyle: '900' }).setOrigin(0.5);
      const hit = this.add(s.add.rectangle(x, by, w, 24, 0xffffff, 0).setOrigin(0), D + 3);
      this.tap(hit, () => (ok ? act() : Sound.play('block')));
      return x + w;
    };
    let x = 16;
    if (m.heal) x = svc(x, '+', 0xff2bd6, t('station.healPct', { pct: m.heal.pct }), m.heal.price, a.heal) + 10;
    if (m.reroll) svc(x, '⟳', CHIP, t('station.reroll'), m.reroll.price, a.reroll);
    this.leaveButton(a.leave);
  }

  private leaveButton(leave: () => void): void {
    const by = VIEW_H - 32;
    const lt = this.txt(VIEW_W - 30, by + 12, `${t('station.leave')} [X]`, 11, '#b8a8d8').setOrigin(1, 0.5);
    const g = this.add(this.scene.add.graphics(), D + 1);
    const x = lt.x - lt.width - 14;
    const w = VIEW_W - 16 - x;
    g.fillStyle(0x120a24, 0.95).fillRect(x, by, w, 24);
    g.lineStyle(1, 0x8a7aa8, 0.5).strokeRect(x + 0.5, by + 0.5, w - 1, 23);
    const hit = this.add(this.scene.add.rectangle(x, by, w, 24, 0xffffff, 0).setOrigin(0), D + 3);
    this.tap(hit, leave);
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'x' || e.key === 'X' || e.key === 'Escape') leave();
    };
    this.scene.input.keyboard!.on('keydown', this.keyHandler);
  }

  showRipper(m: RipperModel, a: RipperActs): void {
    this.hide();
    const s = this.scene;
    const GREEN = 0x39ff88;
    this.add(s.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x04020a, 0.8).setOrigin(0), D - 1).setInteractive();
    this.txt(VIEW_W / 2, 24, t('station.clinic'), 18, hex(GREEN), { fontStyle: '900', strokeThickness: 2 }).setOrigin(0.5).setLetterSpacing(2).setShadow(0, 0, hex(GREEN), 8, true, true);
    this.balance(m.chips);
    const g = this.add(s.add.graphics(), D);
    const panel = (x: number, w: number, title: string, sub: string) => {
      g.fillStyle(0x0a1410, 0.92).fillRect(x, 52, w, 256);
      g.lineStyle(1, GREEN, 0.35).strokeRect(x + 0.5, 52.5, w - 1, 255);
      const tt = this.txt(x + 10, 59, title, 10, hex(GREEN)).setLetterSpacing(1);
      this.txt(tt.x + tt.width + 8, 60, sub, 8.5, '#8a7aa8');
    };

    // 왼쪽: 사이버웨어 강화
    const LX = 16;
    const LW = 286;
    panel(LX, LW, t('station.cyber'), t('station.cyberSub'));
    m.cyber.forEach((c, i) => {
      const y = 76 + i * 74;
      const it = c.item;
      g.fillStyle(0x120a24, 1).fillRect(LX + 8, y, LW - 16, 66);
      g.lineStyle(1, 0xffffff, 0.1).strokeRect(LX + 8.5, y + 0.5, LW - 17, 65);
      const tx = LX + 14;
      const ty = y + 7;
      if (!it) {
        for (let a2 = 0; a2 < 52; a2 += 6) {
          g.lineStyle(1, 0xffffff, 0.3);
          g.lineBetween(tx + a2, ty, tx + Math.min(52, a2 + 3), ty);
          g.lineBetween(tx + a2, ty + 52, tx + Math.min(52, a2 + 3), ty + 52);
          g.lineBetween(tx, ty + a2, tx, ty + Math.min(52, a2 + 3));
          g.lineBetween(tx + 52, ty + a2, tx + 52, ty + Math.min(52, a2 + 3));
        }
        this.txt(tx + 26, ty + 26, '+', 20, '#ffffff').setOrigin(0.5).setAlpha(0.3);
        this.txt(tx + 64, ty + 12, t('station.empty', { part: partLabel(c) }), 12, '#8a7aa8');
        this.txt(tx + 64, ty + 30, t('station.emptyHint'), 9, '#5a4a78');
        return;
      }
      g.fillStyle(0x0a0716, 1).fillRect(tx, ty, 52, 52);
      g.lineStyle(2, it.color, 1).strokeRect(tx + 1, ty + 1, 50, 50);
      const key = `card_${it.art}`;
      if (s.textures.exists(key)) this.add(s.add.image(tx + 26, ty + 26, key), D + 2);
      const nm = this.txt(tx + 62, ty, it.name, 12, '#ffffff', { strokeThickness: 2 }).setShadow(0, 0, hex(it.color), 5, true, true);
      this.txt(nm.x + nm.width + 5, ty + 2, partLabel(c), 8.5, '#8a7aa8');
      const maxed = it.level >= it.max;
      const room = LW - 16 - 62 - 6 - 68;
      if (maxed) {
        this.txt(tx + 62, ty + 18, `Lv ${it.level} · ${t('station.max')}`, 10, '#fff23a');
        this.fit(this.txt(tx + 62, ty + 32, it.now, 9.5, '#e8f7ff'), room);
        return;
      }
      this.txt(tx + 62, ty + 17, `Lv ${it.level} → `, 10, '#b8a8d8');
      this.txt(tx + 62 + 44, ty + 17, `Lv ${it.level + 1}`, 10, '#39ff88');
      this.fit(this.txt(tx + 62, ty + 31, it.now, 9.5, '#e8f7ff'), room);
      this.fit(this.txt(tx + 62, ty + 43, `→ ${it.next}`, 9.5, '#39ff88'), room);
      const ok = it.price <= m.chips;
      this.priceButton(LX + LW - 8 - 64, y + 16, 58, 34, it.price, t('station.upgrade'), ok, GREEN, () => a.upgrade(c.part), 10);
    });

    // 오른쪽: OS 바꿔 끼기
    const RX = 314;
    const RW = 310;
    panel(RX, RW, t('station.os'), m.os.price > 0 ? `◆${m.os.price}` : `${t('station.free')} · ${t('station.osSub')}`);
    if (!this.selOs || this.selOs === m.os.cur || !m.os.list.some((o) => o.id === this.selOs)) this.selOs = m.os.list.find((o) => o.id !== m.os.cur)?.id ?? m.os.cur;
    const cell = 70;
    const gx = RX + (RW - cell * 4) / 2;
    m.os.list.forEach((o, i) => {
      const x = gx + (i % 4) * cell + (cell - 52) / 2;
      const y = 76 + Math.floor(i / 4) * 62;
      const col = Phaser.Display.Color.HexStringToColor(o.color).color;
      const cur = o.id === m.os.cur;
      const sel = o.id === this.selOs;
      g.fillStyle(0x120a24, 1).fillRect(x, y, 52, 46);
      if (cur) {
        g.lineStyle(2, col, 1).strokeRect(x + 1, y + 1, 50, 44);
        g.lineStyle(2, col, 0.25).strokeRect(x - 2, y - 2, 56, 50);
      } else g.lineStyle(1, 0xffffff, 0.12).strokeRect(x + 0.5, y + 0.5, 51, 45);
      if (sel) g.lineStyle(2, 0xffffff, 1).strokeRect(x - 3, y - 3, 58, 52);
      const key = `os_${o.id}`;
      if (s.textures.exists(key)) this.add(s.add.image(x + 26, y + 23, key), D + 2);
      this.txt(x + 51, y + 45, `Lv${o.level}`, 7.5, '#39ff88', { backgroundColor: '#05030c', padding: { x: 2, y: 0 } }, D + 3).setOrigin(1, 1);
      if (cur) {
        g.fillStyle(col, 1).fillRect(x, y - 1, 52, 10);
        this.txt(x + 26, y + 4, t('station.inUse'), 7.5, '#0a0614', { fontStyle: '900' }, D + 3).setOrigin(0.5);
      }
      const nm = this.txt(x + 26, y + 48, o.name, 8, '#b8a8d8').setOrigin(0.5, 0);
      if (nm.width > cell - 2) nm.setScale((cell - 2) / nm.width);
      const hit = this.add(s.add.rectangle(x - 3, y - 3, 58, 62, 0xffffff, 0).setOrigin(0), D + 3);
      this.tap(hit, () => {
        if (this.selOs === o.id) return;
        this.selOs = o.id;
        Sound.play('hover');
        this.showRipper(m, a);
      });
    });
    // 고른 OS 자세히
    const o = m.os.list.find((x) => x.id === this.selOs)!;
    const col = Phaser.Display.Color.HexStringToColor(o.color).color;
    // OS가 4개 이하면 한 줄만 쓰니 자세히 칸을 위로 늘림
    const dy = 76 + Math.max(1, Math.ceil(m.os.list.length / 4)) * 62 + 2;
    const dh = 308 - 6 - dy;
    g.fillStyle(0x120a24, 1).fillRect(RX + 8, dy, RW - 16, dh);
    g.lineStyle(1, col, 0.9).strokeRect(RX + 8.5, dy + 0.5, RW - 17, dh - 1);
    const nm = this.txt(RX + 16, dy + 5, `${o.name} Lv${o.level}`, 12, '#ffffff', { strokeThickness: 2 }).setShadow(0, 0, o.color, 5, true, true);
    let tagX = nm.x + nm.width + 6;
    for (const tag of o.tags) {
      const tc = TAG_COLOR[tag] ?? 0xb8a8d8;
      const tt = this.txt(tagX + 4, dy + 7, tagName(tag), 8.5, hex(tc));
      g.fillStyle(tc, 0.12).fillRect(tagX, dy + 6, tt.width + 8, 13);
      g.lineStyle(1, tc, 0.6).strokeRect(tagX + 0.5, dy + 6.5, tt.width + 7, 12);
      tagX += tt.width + 11;
    }
    // 레벨 줄은 완결 문장: 줄바꿈해서 보여 주고, 칸을 넘치면 글자를 줄임(최소 7px). 그래도 넘치는 줄은 숨기고 '외 n줄'
    const lineObjs = o.lines.map((l) => this.txt(RX + 16, 0, `${l.on ? '●' : '○'} ${l.text}`, 9, l.on ? '#e8f7ff' : '#5a4a78', { lineSpacing: 0, wordWrap: { width: RW - 32, useAdvancedWrap: true } }));
    const room = dy + dh - 4 - (dy + 23);
    const total = () => lineObjs.reduce((a, x) => a + x.height + 1, 0);
    for (let fs = 8.5; total() > room && fs >= 7; fs -= 0.5) for (const x of lineObjs) x.setFontSize(`${fs}px`);
    let ly = dy + 23;
    let hidden = 0;
    for (const x of lineObjs) {
      x.setY(ly);
      if (ly + x.height > dy + dh - 4) {
        x.setVisible(false);
        hidden++;
      }
      ly += x.height + 1;
    }
    if (hidden) this.txt(RX + RW - 16, dy + dh - 3, I18n.lang === 'en' ? `+${hidden} more` : `외 ${hidden}줄`, 8, '#8a7aa8').setOrigin(1, 1);
    if (o.id !== m.os.cur) {
      const ok = m.os.price <= m.chips;
      this.priceButton(RX + RW - 8 - 6 - 74, dy + 4, 74, 18, m.os.price, t('station.swap'), ok, col, () => a.swap(o.id), 10);
    }
    this.leaveButton(a.leave);
  }

  /** 한 줄에 안 들어가면 끝을 … 로 자름 */
  private fit(o: Phaser.GameObjects.Text, room: number): Phaser.GameObjects.Text {
    let str = o.text;
    while (o.width > room && str.length > 2) {
      str = str.slice(0, -1);
      o.setText(`${str}…`);
    }
    return o;
  }
}

/** 리퍼닥 소켓 이름 (영어판이면 영어) */
function partLabel(c: { part: string; label: string }): string {
  return I18n.lang === 'en' ? (SLOT_EN[c.part] ?? c.label) : c.label;
}
