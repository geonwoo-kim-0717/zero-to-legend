import Phaser from 'phaser';
import { BASE_TEXT } from './text';
import { t } from '../i18n';
import { TAG_COLOR } from './LevelUpUI';
import { tagName } from './synergyText';

/**
 * 아지트 5번 탭 '무기고' (UI 시안 B 확정본)
 * 왼쪽: 주무기 6종·보조무기 6종 카드 두 줄 (장착 중·보유·가격), 누르면 오른쪽 자세히
 * 오른쪽: 고른 무기 자세히 + 버튼 (안 가졌으면 구매 → 한 번 더 눌러 확인, 가졌으면 따로 '장착')
 * 무기는 크레딧으로 한 번 사면 영구 (로직은 Save.buyWeapon·setStartWeapon, 메인 세션)
 */
export interface ArmoryWeapon {
  id: string;
  name: string;
  slot: 'primary' | 'secondary';
  tags: string[];
  short: string;
  owned: boolean;
  equipped: boolean;
}
export interface ArmoryModel {
  list: ArmoryWeapon[];
  credits: number;
  price: number;
  sel: string;
  /** 구매 확인 대기 중인 무기 (한 번 더 누르면 삼) */
  confirm: string | null;
}
export interface ArmoryActs {
  select: (id: string) => void;
  buy: (id: string) => void;
  equip: (id: string) => void;
}
interface PanelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const T = (size: number, color = '#e8f7ff', extra: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}) => ({ ...BASE_TEXT, fontSize: `${size}px`, color, strokeThickness: 0, ...extra });
const fmt = (n: number) => Math.floor(n).toLocaleString('ko-KR');
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

function tap(o: Phaser.GameObjects.GameObject, act: () => void): void {
  let armed = false;
  (o as Phaser.GameObjects.Rectangle).setInteractive({ useHandCursor: true });
  o.on('pointerdown', () => (armed = true));
  o.on('pointerout', () => (armed = false));
  o.on('pointerup', () => {
    if (armed) act();
    armed = false;
  });
}

export function drawArmory(s: Phaser.Scene, panel: Phaser.GameObjects.Container, box: PanelBox, m: ArmoryModel, act: ArmoryActs): void {
  const add = <G extends Phaser.GameObjects.GameObject>(o: G): G => {
    panel.add(o);
    return o;
  };
  const owned = m.list.filter((w) => w.owned).length;
  const ht = add(s.add.text(box.x + 10, box.y + 7, t('armory.title'), T(14, '#ffffff', { strokeThickness: 2 })));
  add(s.add.text(ht.x + ht.width + 8, box.y + 11, t('armory.sub', { a: owned, b: m.list.length, price: fmt(m.price) }), T(9, '#8a7aa8')));
  const g = add(s.add.graphics());

  // 카드 두 줄
  const CW = 48;
  const CH = 78;
  const GAP = 4;
  const lx = box.x + 10;
  const rows: ['primary' | 'secondary', number][] = [
    ['primary', box.y + 28],
    ['secondary', box.y + 28 + CH + 22],
  ];
  for (const [slot, y0] of rows) {
    add(s.add.text(lx, y0, t(slot === 'primary' ? 'armory.primary' : 'armory.secondary'), T(9, '#00f0ff', { fontStyle: '900' })).setLetterSpacing(1));
    m.list
      .filter((w) => w.slot === slot)
      .forEach((w, i) => {
        const x = lx + i * (CW + GAP);
        const y = y0 + 14;
        const sel = w.id === m.sel;
        g.fillStyle(0x150d2a, 1).fillRect(x, y, CW, CH);
        if (sel) {
          g.lineStyle(2, 0x00f0ff, 0.3).strokeRect(x - 2, y - 2, CW + 4, CH + 4);
          g.lineStyle(2, 0x00f0ff, 1).strokeRect(x + 1, y + 1, CW - 2, CH - 2);
        } else g.lineStyle(1, w.equipped ? 0x39ff88 : 0x3a2a5a, 1).strokeRect(x + 0.5, y + 0.5, CW - 1, CH - 1);
        const key = s.textures.exists(`card_${w.id}`) ? `card_${w.id}` : `icon_${w.id}`;
        if (s.textures.exists(key)) {
          const im = add(s.add.image(x + CW / 2, y + 22, key).setDisplaySize(38, 38));
          if (!w.owned) im.setTint(0x55506a);
        }
        const nm = add(s.add.text(x + CW / 2, y + 43, w.name, T(7.5, w.owned ? '#ffffff' : '#a898c8', { align: 'center', wordWrap: { width: CW - 4, useAdvancedWrap: true }, lineSpacing: -1 })).setOrigin(0.5, 0));
        if (nm.height > 18) nm.setFontSize('6.5px');
        // 상태 띠
        const by = y + CH - 13;
        if (w.equipped) {
          g.fillStyle(0x39ff88, 1).fillRect(x + 3, by, CW - 6, 10);
          add(s.add.text(x + CW / 2, by + 5, t('armory.equipped'), T(7.5, '#0a0614', { fontStyle: '900' })).setOrigin(0.5));
        } else if (w.owned) {
          g.fillStyle(0x241a40, 1).fillRect(x + 3, by, CW - 6, 10);
          add(s.add.text(x + CW / 2, by + 5, t('armory.owned'), T(7.5, '#b8a8d8')).setOrigin(0.5));
        } else {
          g.fillStyle(0x2a2410, 1).fillRect(x + 3, by, CW - 6, 10);
          g.lineStyle(1, 0xfff23a, 1).strokeRect(x + 3.5, by + 0.5, CW - 7, 9);
          add(s.add.text(x + CW / 2, by + 5, `₵${fmt(m.price)}`, T(7.5, '#fff23a')).setOrigin(0.5));
        }
        const hit = add(s.add.rectangle(x, y, CW, CH, 0xffffff, 0).setOrigin(0));
        tap(hit, () => act.select(w.id));
      });
  }

  // 고른 무기 자세히
  const w = m.list.find((o) => o.id === m.sel) ?? m.list[0];
  const dx = lx + 6 * (CW + GAP) + 6;
  const dw = box.x + box.w - 10 - dx;
  const dy = box.y + 28;
  const dh = box.h - 38;
  g.fillStyle(0x150d2a, 1).fillRect(dx, dy, dw, dh);
  g.lineStyle(2, 0x00f0ff, 1).strokeRect(dx + 1, dy + 1, dw - 2, dh - 2);
  const cx = dx + dw / 2;
  const key = s.textures.exists(`card_${w.id}`) ? `card_${w.id}` : `icon_${w.id}`;
  if (s.textures.exists(key)) add(s.add.image(cx, dy + 34, key).setDisplaySize(54, 54));
  const nm = add(s.add.text(cx, dy + 64, w.name, T(12, '#ffffff', { strokeThickness: 2 })).setOrigin(0.5, 0));
  if (nm.width > dw - 10) nm.setScale((dw - 10) / nm.width);
  // 자리 · 태그
  const chips = [{ label: t(w.slot === 'primary' ? 'armory.primary' : 'armory.secondary'), col: 0x8a7aa8 }, ...w.tags.map((tg) => ({ label: tagName(tg), col: TAG_COLOR[tg] ?? 0xb8a8d8 }))];
  const texts = chips.map((c) => add(s.add.text(0, dy + 84, c.label, T(7.5, hex(c.col)))));
  const total = texts.reduce((a, o) => a + o.width + 6, 0) + 3 * (texts.length - 1);
  let tx = cx - total / 2;
  texts.forEach((o, i) => {
    o.setX(tx + 3);
    g.lineStyle(1, chips[i].col, 0.7).strokeRect(tx + 0.5, dy + 83.5, o.width + 5, 11);
    tx += o.width + 9;
  });
  add(s.add.text(cx, dy + 101, w.short, T(8.5, '#c8b8e8', { align: 'center', lineSpacing: 1, wordWrap: { width: dw - 12, useAdvancedWrap: true } })).setOrigin(0.5, 0));

  // 버튼
  const bw = dw - 16;
  const bx = dx + 8;
  const byy = dy + dh - 30;
  const button = (label: string, fill: number, color: string, stroke: number, on: (() => void) | null) => {
    const r = add(s.add.rectangle(bx, byy, bw, 20, fill, 1).setOrigin(0).setStrokeStyle(1.5, stroke, 1));
    add(s.add.text(bx + bw / 2, byy + 10, label, T(10, color, { fontStyle: '900' })).setOrigin(0.5));
    if (on) tap(r, on);
  };
  const note = (str: string, color = '#8a7aa8') => add(s.add.text(cx, byy - 4, str, T(8, color, { align: 'center', wordWrap: { width: dw - 10, useAdvancedWrap: true } })).setOrigin(0.5, 1));
  if (w.equipped) {
    note(t('armory.equippedNote'));
    button(t('armory.equipped'), 0x0e2a1a, '#39ff88', 0x39ff88, null);
  } else if (w.owned) {
    note(t(w.slot === 'primary' ? 'armory.equipNotePrimary' : 'armory.equipNoteSecondary'));
    button(t('armory.equip'), 0x0e2a1a, '#39ff88', 0x39ff88, () => act.equip(w.id));
  } else if (m.credits < m.price) {
    note(t('armory.credits', { n: fmt(m.credits) }));
    button(t('armory.short'), 0x2a2040, '#6a5a88', 0x3a2a5a, null);
  } else if (m.confirm === w.id) {
    note(t('armory.confirmNote'), '#ff2bd6');
    button(t('armory.confirm', { price: fmt(m.price) }), 0x3a0a30, '#ff2bd6', 0xff2bd6, () => act.buy(w.id));
  } else {
    note(t('armory.credits', { n: fmt(m.credits) }));
    button(t('armory.buy', { price: fmt(m.price) }), 0x2a2410, '#fff23a', 0xfff23a, () => act.buy(w.id));
  }
}
