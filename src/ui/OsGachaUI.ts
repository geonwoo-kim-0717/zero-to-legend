import Phaser from 'phaser';
import { BASE_TEXT } from './text';
import { VIEW_W, VIEW_H } from '../config';
import { Sound } from '../systems/Sound';
import { TAG_COLOR } from './LevelUpUI';
import { tagName } from './synergyText';
import { t, I18n } from '../i18n';

/** 아지트 패널 자리 (HideoutScene과 같은 값) */
export interface PanelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** OS 한 종의 상태 (뽑기 탭·도크 9) */
export interface OsView {
  id: string;
  name: string;
  color: string;
  level: number;
  /** 다음 레벨까지 (최대면 null) */
  next: { have: number; need: number } | null;
  equipped: boolean;
  tags: string[];
  lines: { text: string; on: boolean }[];
}

/** 뽑기 결과 한 장 */
export interface PullView {
  id: string;
  name: string;
  color: string;
  before: number;
  after: number;
  refund: number;
  /** 이 장을 받은 뒤 개수·다음 필요 (최대면 null) */
  copies: { have: number; need: number } | null;
}

const T = (size: number, color = '#e8f7ff', extra: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}) => ({ ...BASE_TEXT, fontSize: `${size}px`, color, strokeThickness: 0, ...extra });
const hexN = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;
const mix = (a: number, b: number, k: number) => {
  const ca = Phaser.Display.Color.IntegerToColor(a);
  const cb = Phaser.Display.Color.IntegerToColor(b);
  return Phaser.Display.Color.GetColor(ca.red + (cb.red - ca.red) * k, ca.green + (cb.green - ca.green) * k, ca.blue + (cb.blue - ca.blue) * k);
};
const fmt = (n: number) => Math.floor(n).toLocaleString('ko-KR');

/** 눌렀다 떼면 act */
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

/** 육각형 점들 */
const hexPts = (x: number, y: number, r: number) => [0, 1, 2, 3, 4, 5].map((i) => new Phaser.Math.Vector2(x + r * Math.cos((Math.PI / 3) * i), y + r * 0.92 * Math.sin((Math.PI / 3) * i)));

/**
 * 아지트 4번 탭 'OS 뽑기' (UI 시안 확정본)
 * 위: OS 7종 칸(문양·레벨 칸 5개·다음 레벨까지 개수와 막대·장착), 누르면 장착
 * 아래: 뽑기 기계(물음표 육각형 + 1회·10회 버튼, 10회에 '1회 무료'), 확률·환급 공개
 */
export function drawOsTab(
  s: Phaser.Scene,
  panel: Phaser.GameObjects.Container,
  box: PanelBox,
  d: { list: OsView[]; credits: number; price: number; tenPrice: number; odds: number; refund: number },
  act: { pull: (n: 1 | 10) => void; equip: (id: string) => void },
): void {
  const add = <G extends Phaser.GameObjects.GameObject>(o: G): G => {
    panel.add(o);
    return o;
  };
  const en = I18n.lang === 'en';
  const unlocked = d.list.filter((o) => o.level > 0).length;
  add(s.add.text(box.x + 10, box.y + 7, t('os.title'), T(14, '#ffffff', { strokeThickness: 2 })));
  add(s.add.text(box.x + 76 + (en ? 6 : 0), box.y + 11, t('os.sub2', { a: unlocked, b: d.list.length }), T(9, '#8a7aa8')));

  // OS 칸
  const g = add(s.add.graphics());
  const n = d.list.length;
  const cw = 58;
  const gap = 4;
  const x0 = box.x + (box.w - (n * cw + (n - 1) * gap)) / 2;
  const y0 = box.y + 32;
  const ch = 96;
  d.list.forEach((o, i) => {
    const x = x0 + i * (cw + gap);
    const col = hexN(o.color);
    const lock = o.level <= 0;
    g.fillStyle(0x120a24, 1).fillRect(x, y0, cw, ch);
    if (o.equipped) {
      g.lineStyle(2, col, 1).strokeRect(x + 1, y0 + 1, cw - 2, ch - 2);
      g.lineStyle(2, col, 0.25).strokeRect(x - 2, y0 - 2, cw + 4, ch + 4);
      g.fillStyle(col, 1).fillRect(x, y0, cw, 10);
      add(s.add.text(x + cw / 2, y0 + 5, t('os.equipped'), T(7, '#0a0614', { fontStyle: '900' })).setOrigin(0.5));
    } else g.lineStyle(1, 0xffffff, 0.1).strokeRect(x + 0.5, y0 + 0.5, cw - 1, ch - 1);
    const key = `os_${o.id}`;
    if (s.textures.exists(key)) {
      const im = add(s.add.image(x + cw / 2, y0 + 30, key).setDisplaySize(40, 40));
      if (lock) im.setTint(0x403850).setAlpha(0.6);
    }
    const nm = add(s.add.text(x + cw / 2, y0 + 52, o.name, T(8.5, lock ? '#5a4a78' : '#e8f7ff')).setOrigin(0.5, 0));
    if (nm.width > cw - 2) nm.setScale((cw - 2) / nm.width);
    for (let k = 0; k < 5; k++) g.fillStyle(k < o.level ? col : 0xffffff, k < o.level ? 1 : 0.1).fillRect(x + 6 + k * 9.5, y0 + 66, 7, 4);
    const cp = lock ? t('os.locked') : o.next ? `${o.next.have} / ${o.next.need}` : t('os.max');
    add(s.add.text(x + cw / 2, y0 + 73, cp, T(8, '#8a7aa8')).setOrigin(0.5, 0));
    if (!lock && o.next) {
      g.fillStyle(0xffffff, 0.08).fillRect(x + 5, y0 + ch - 7, cw - 10, 3);
      g.fillStyle(col, 1).fillRect(x + 5, y0 + ch - 7, (cw - 10) * Math.min(1, o.next.have / o.next.need), 3);
    }
    if (!lock && !o.equipped) {
      const hit = add(s.add.rectangle(x, y0, cw, ch, 0xffffff, 0).setOrigin(0));
      hit.on('pointerover', () => hit.setFillStyle(0xffffff, 0.05));
      hit.on('pointerout', () => hit.setFillStyle(0xffffff, 0));
      tap(hit, () => act.equip(o.id));
    }
  });

  // 뽑기 기계
  const mx = box.x + 10;
  const my = y0 + ch + 8;
  const mw = box.w - 20;
  const mh = box.y + box.h - 8 - my;
  g.fillGradientStyle(0x2a0a30, 0x2a0a30, 0x120a24, 0x120a24, 1).fillRect(mx, my, mw, mh);
  g.lineStyle(1, 0xff2bd6, 0.4).strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);
  // 물음표 육각형 창
  const sw = 108;
  const sx = mx + 10;
  const sy = my + 8;
  const sh = mh - 16;
  g.fillStyle(0x0a0716, 1).fillRect(sx, sy, sw, sh);
  g.lineStyle(2, 0xff2bd6, 1).strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);
  for (let k = 1; k <= 3; k++) g.lineStyle(2, 0xff2bd6, 0.12 * (4 - k)).strokeRect(sx + 1 + k * 2, sy + 1 + k * 2, sw - 2 - k * 4, sh - 2 - k * 4);
  const hx = sx + sw / 2;
  const hy = sy + sh / 2;
  g.fillGradientStyle(0xff2bd6, 0xff2bd6, 0x3ad7ff, 0x3ad7ff, 1).fillPoints(hexPts(hx, hy, 30), true);
  const q = add(s.add.text(hx, hy, '?', T(26, '#0a0614', { fontStyle: '900' })).setOrigin(0.5));
  s.tweens.add({ targets: q, scale: 1.12, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

  // 버튼
  const btn = (x: number, w: number, label: string, price: number, col: number, badge: string | null, n: 1 | 10) => {
    const ok = d.credits >= price;
    const by = my + 10;
    const bh = 36;
    const bg = add(s.add.graphics());
    bg.fillStyle(0x0a0716, 1).fillRect(x, by, w, bh);
    bg.lineStyle(2, ok ? col : 0x5a4a78, 1).strokeRect(x + 1, by + 1, w - 2, bh - 2);
    if (ok) bg.lineStyle(2, col, 0.25).strokeRect(x - 2, by - 2, w + 4, bh + 4);
    add(s.add.text(x + w / 2, by + 11, label, T(12, ok ? '#ffffff' : '#6a5a88', { fontStyle: '900' })).setOrigin(0.5));
    add(s.add.text(x + w / 2, by + 26, `₵ ${fmt(price)}`, T(9.5, ok ? '#fff23a' : '#ff5a6a', { fontStyle: '900' })).setOrigin(0.5));
    if (badge) {
      add(s.add.text(x + w + 4, by - 6, badge, T(8, '#0a0614', { fontStyle: '900', backgroundColor: '#fff23a', padding: { x: 3, y: 0 } })).setOrigin(1, 0));
    }
    const hit = add(s.add.rectangle(x - 2, by - 2, w + 4, bh + 4, 0xffffff, 0).setOrigin(0));
    tap(hit, () => (ok ? act.pull(n) : Sound.play('block')));
  };
  const bx = sx + sw + 14;
  const bw = (mx + mw - 12 - bx - 12) / 2;
  btn(bx, bw, t('os.pull1x'), d.price, 0xff2bd6, null, 1);
  btn(bx + bw + 12, bw, t('os.pull10x'), d.tenPrice, 0xfff23a, t('os.free1'), 10);
  add(
    s.add.text(bx, my + 54, `${t('os.odds2', { n: d.list.length, p: d.odds, refund: d.refund })}\n${t('os.noCash')}`, T(8.5, '#8a7aa8', { lineSpacing: 2, wordWrap: { width: mx + mw - 12 - bx, useAdvancedWrap: true } })),
  );
}

/**
 * 도크 9 · 출격 준비 (UI 시안 확정본)
 * 왼쪽: 제로 카드 (시작 무기 고정), 오른쪽 위: 고른 OS 자세히, 아래: OS 8종 문양 줄 (누르면 바로 고름)
 */
export function drawDock(
  s: Phaser.Scene,
  panel: Phaser.GameObjects.Container,
  box: PanelBox,
  d: { runner: { name: string; texture: string; weapon: string }; list: OsView[]; topRight: number },
  act: { equip: (id: string) => void },
): void {
  const add = <G extends Phaser.GameObjects.GameObject>(o: G): G => {
    panel.add(o);
    return o;
  };
  const ht = add(s.add.text(box.x + 10, box.y + 7, t('bar.title'), T(14, '#ffffff', { strokeThickness: 2 })));
  // 히트 고르기가 있으면 오른쪽 위를 비워 둠 (d.topRight: 그 왼쪽 끝)
  const sub = add(s.add.text(ht.x + ht.width + 8, box.y + 11, t('bar.sub'), T(9, '#8a7aa8')));
  if (sub.x + sub.width > d.topRight - 6) sub.setVisible(false);
  const g = add(s.add.graphics());
  // 러너 카드
  const rx = box.x + 10;
  const ry = box.y + 32;
  const rw = 128;
  const rh = box.h - 42;
  g.fillStyle(0x2a1050, 1).fillRect(rx, ry, rw, rh);
  g.lineStyle(2, 0xff2bd6, 1).strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);
  add(s.add.image(rx + rw / 2, ry + 52, d.runner.texture).setScale(2));
  add(s.add.text(rx + rw / 2, ry + 94, d.runner.name, T(14, '#ffffff', { strokeThickness: 2 })).setOrigin(0.5, 0));
  add(s.add.text(rx + rw / 2, ry + 114, d.runner.weapon, T(11, '#00f0ff')).setOrigin(0.5, 0));
  add(s.add.text(rx + rw / 2, ry + 132, t('bar.fixedWeapon2'), T(9, '#8a7aa8', { align: 'center', wordWrap: { width: rw - 16, useAdvancedWrap: true } })).setOrigin(0.5, 0));

  // 고른 OS 자세히
  const cur = d.list.find((o) => o.equipped) ?? d.list[0];
  const col = hexN(cur.color);
  const ox = rx + rw + 12;
  const ow = box.x + box.w - 10 - ox;
  const oy = ry;
  const oh = 106;
  g.fillStyle(0x120a24, 1).fillRect(ox, oy, ow, oh);
  g.lineStyle(2, col, 1).strokeRect(ox + 1, oy + 1, ow - 2, oh - 2);
  g.lineStyle(2, col, 0.25).strokeRect(ox - 2, oy - 2, ow + 4, oh + 4);
  if (s.textures.exists(`os_${cur.id}`)) add(s.add.image(ox + 32, oy + 32, `os_${cur.id}`));
  const nm = add(s.add.text(ox + 64, oy + 8, `${cur.name} Lv${cur.level}`, T(13, '#ffffff', { strokeThickness: 2 })).setShadow(0, 0, cur.color, 5, true, true));
  let tx = nm.x + nm.width + 6;
  for (const tag of cur.tags) {
    const tc = TAG_COLOR[tag] ?? 0xb8a8d8;
    const tt = add(s.add.text(tx + 4, oy + 11, tagName(tag), T(8.5, `#${tc.toString(16).padStart(6, '0')}`)));
    g.fillStyle(tc, 0.12).fillRect(tx, oy + 10, tt.width + 8, 13);
    g.lineStyle(1, tc, 0.6).strokeRect(tx + 0.5, oy + 10.5, tt.width + 7, 12);
    tx += tt.width + 11;
  }
  let ly = oy + 28;
  for (const l of cur.lines) {
    if (ly > oy + oh - 12) break;
    const lt = add(s.add.text(ox + 64, ly, `${l.on ? '●' : '○'} ${l.text}`, T(9, l.on ? '#e8f7ff' : '#5a4a78')));
    let str = lt.text;
    while (lt.width > ow - 72 && str.length > 2) {
      str = str.slice(0, -1);
      lt.setText(`${str}…`);
    }
    ly += 13;
  }

  // OS 고르기 줄
  const py = oy + oh + 12;
  const n = d.list.length;
  const pw = Math.min(44, Math.floor((ow - (n - 1) * 5) / n));
  d.list.forEach((o, i) => {
    const x = ox + i * (pw + 5);
    const c = hexN(o.color);
    const lock = o.level <= 0;
    g.fillStyle(0x120a24, 1).fillRect(x, py, pw, pw);
    if (o.equipped) {
      g.lineStyle(2, c, 1).strokeRect(x + 1, py + 1, pw - 2, pw - 2);
      g.lineStyle(2, c, 0.3).strokeRect(x - 2, py - 2, pw + 4, pw + 4);
    } else g.lineStyle(1, 0xffffff, 0.15).strokeRect(x + 0.5, py + 0.5, pw - 1, pw - 1);
    if (s.textures.exists(`os_${o.id}`)) {
      const im = add(s.add.image(x + pw / 2, py + pw / 2, `os_${o.id}`).setDisplaySize(pw - 8, pw - 8));
      if (lock) im.setTint(0x403850).setAlpha(0.6);
    }
    if (!lock) add(s.add.text(x + pw - 1, py + pw, `Lv${o.level}`, T(7.5, '#39ff88', { backgroundColor: '#05030c', padding: { x: 1, y: 0 } })).setOrigin(1, 1));
    if (!lock && !o.equipped) {
      const hit = add(s.add.rectangle(x, py, pw, pw, 0xffffff, 0).setOrigin(0));
      tap(hit, () => act.equip(o.id));
    }
  });
  add(s.add.text(ox, py + pw + 6, t('bar.osHint2'), T(9, '#6a5a88')));
}

/**
 * 뽑기 연출: 뒷면 카드가 깔리고 하나씩 뒤집힘 (1회는 1초 안에 끝남), 누르면 남은 카드를 한 번에 열고 다시 누르면 닫힘
 * 새로 해금·레벨업은 빛나는 띠, 중복은 +1 (개수), 최대 레벨 중복은 환급
 */
export class PullReveal {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private timers: Phaser.Time.TimerEvent[] = [];
  private flips: (() => void)[] = [];
  private shown = 0;
  private keyHandler?: (e: KeyboardEvent) => void;

  constructor(private readonly s: Phaser.Scene) {}

  get open(): boolean {
    return this.objs.length > 0;
  }

  show(res: PullView[], onClose: () => void): void {
    this.close();
    const s = this.s;
    const D = 400;
    const add = <G extends Phaser.GameObjects.GameObject>(o: G, depth = D): G => {
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(depth);
      this.objs.push(o);
      return o;
    };
    const one = res.length === 1;
    const bg = add(s.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x04020a, 0.9).setOrigin(0), D - 1);
    add(s.add.text(VIEW_W / 2, 28, one ? t('os.pullTitle1') : t('os.pullTitle10'), T(18, '#fff23a', { fontStyle: '900', strokeThickness: 2 })).setOrigin(0.5).setShadow(0, 0, '#fff23a', 8, true, true));
    const cw = one ? 120 : 92;
    const ch = one ? 150 : 104;
    const cols = one ? 1 : 5;
    const gap = 8;
    const x0 = VIEW_W / 2 - (cols * cw + (cols - 1) * gap) / 2;
    const y0 = one ? 70 : 52;
    const foot = add(s.add.text(VIEW_W / 2, VIEW_H - 62, '', T(10, '#b8a8d8')).setOrigin(0.5), D + 2);
    const ok = add(s.add.text(VIEW_W / 2, VIEW_H - 36, t('os.ok'), T(12, '#00f0ff', { fontStyle: '900', backgroundColor: '#0a0716', padding: { x: 20, y: 4 } })).setOrigin(0.5), D + 2).setVisible(false);
    const summary = () => {
      const nNew = res.filter((r) => r.before === 0).length;
      const nUp = res.filter((r) => r.before > 0 && r.after > r.before).length;
      const ref = res.reduce((a, r) => a + r.refund, 0);
      const parts = [nNew ? t('os.sumNew', { n: nNew }) : '', nUp ? t('os.sumUp', { n: nUp }) : '', ref ? t('os.sumRefund', { n: ref }) : ''].filter(Boolean);
      foot.setText(parts.join(' · ') || t('os.sumNone'));
      ok.setVisible(true);
    };
    res.forEach((r, i) => {
      const x = x0 + (i % cols) * (cw + gap);
      const y = y0 + Math.floor(i / cols) * (ch + gap);
      const cx = x + cw / 2;
      const cy = y + ch / 2;
      // 뒷면
      const back = add(s.add.container(cx, cy), D + 1);
      const bgG = s.add.graphics();
      bgG.fillStyle(0x1a1030, 1).fillRect(-cw / 2, -ch / 2, cw, ch);
      // 뒷면 무늬: 카드 안에서만 (가로 줄무늬)
      for (let k = 6; k < ch - 4; k += 10) bgG.fillStyle(0x140c2a, 1).fillRect(-cw / 2 + 4, -ch / 2 + k, cw - 8, 5);
      bgG.lineStyle(2, 0x3a2466, 1).strokeRect(-cw / 2 + 1, -ch / 2 + 1, cw - 2, ch - 2);
      back.add([bgG, s.add.text(0, 0, '?', T(30, '#3a2466', { fontStyle: '900' })).setOrigin(0.5)]);
      // 앞면
      const col = hexN(r.color);
      const isNew = r.before === 0;
      const isUp = !isNew && r.after > r.before;
      const front = add(s.add.container(cx, cy), D + 1).setVisible(false);
      const fg = s.add.graphics();
      if (isNew || isUp) for (let k = 3; k >= 1; k--) fg.lineStyle(2, col, 0.18 * (4 - k)).strokeRect(-cw / 2 - k * 2, -ch / 2 - k * 2, cw + k * 4, ch + k * 4);
      const tint = mix(0x120a24, col, 0.28);
      fg.fillGradientStyle(tint, tint, 0x120a24, 0x120a24, 1);
      fg.fillRect(-cw / 2, -ch / 2, cw, ch);
      fg.lineStyle(2, col, 1).strokeRect(-cw / 2 + 1, -ch / 2 + 1, cw - 2, ch - 2);
      const items: Phaser.GameObjects.GameObject[] = [fg];
      if (isNew || isUp) {
        fg.fillStyle(col, 1).fillRect(-cw / 2, -ch / 2, cw, 12);
        items.push(s.add.text(0, -ch / 2 + 6, isNew ? t('os.badgeNew') : t('os.badgeUp'), T(8, '#0a0614', { fontStyle: '900' })).setOrigin(0.5));
      }
      if (s.textures.exists(`os_${r.id}`)) items.push(s.add.image(0, -ch / 2 + (one ? 54 : 38), `os_${r.id}`).setScale(one ? 1.5 : 1));
      items.push(s.add.text(0, ch / 2 - (one ? 40 : 34), r.name, T(one ? 12 : 10, '#ffffff', { strokeThickness: 2 })).setOrigin(0.5).setShadow(0, 0, r.color, 5, true, true));
      const st = r.refund ? `₵ +${r.refund}` : isNew ? 'NEW' : isUp ? `Lv ${r.after} ↑` : r.copies ? `+1 (${r.copies.have}/${r.copies.need})` : '+1';
      const sc = r.refund ? '#fff23a' : isNew ? '#fff23a' : isUp ? '#39ff88' : '#b8a8d8';
      items.push(s.add.text(0, ch / 2 - (one ? 20 : 15), st, T(one ? 11 : 9.5, sc, { fontStyle: '900' })).setOrigin(0.5));
      front.add(items);
      // 뒤집기: 뒷면이 좁아졌다가 앞면이 넓어짐
      let flipped = false;
      const flip = (fast: boolean) => {
        if (flipped) return;
        flipped = true;
        const dur = fast ? 60 : one ? 160 : 110;
        s.tweens.add({
          targets: back,
          scaleX: 0,
          duration: dur,
          onComplete: () => {
            back.setVisible(false);
            front.setVisible(true).setScale(0, 1);
            s.tweens.add({ targets: front, scaleX: 1, duration: dur, ease: 'Back.easeOut' });
            if (!fast) Sound.play(isNew || isUp ? 'levelup' : r.refund ? 'select' : 'hover');
            this.shown++;
            if (this.shown >= res.length) summary();
          },
        });
      };
      this.flips.push(() => flip(true));
      // 1회는 0.25초 뒤, 10회는 0.25초부터 한 장씩 0.12초 간격
      this.timers.push(s.time.delayedCall(250 + i * 120, () => flip(false)));
    });
    // 누르면: 다 안 열렸으면 한 번에 열기, 다 열렸으면 닫기
    const close = () => {
      this.close();
      onClose();
    };
    const tapAll = () => {
      if (this.shown < res.length) {
        for (const tm of this.timers) tm.remove();
        for (const f of this.flips) f();
        return;
      }
      close();
    };
    tap(bg, tapAll);
    tap(ok, close);
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') tapAll();
    };
    s.input.keyboard!.on('keydown', this.keyHandler);
  }

  close(): void {
    for (const tm of this.timers) tm.remove();
    this.timers = [];
    this.flips = [];
    this.shown = 0;
    for (const o of this.objs) o.destroy();
    this.objs = [];
    if (this.keyHandler) this.s.input.keyboard!.off('keydown', this.keyHandler);
    this.keyHandler = undefined;
  }
}
