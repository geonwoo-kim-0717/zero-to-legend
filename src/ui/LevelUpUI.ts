import Phaser from 'phaser';
import { BASE_TEXT } from './text';
import { Sound } from '../systems/Sound';
import { VIEW_W, VIEW_H } from '../config';
import type { Choice } from '../systems/Progression';
import type { CardInfo } from './cardInfo';
import { tagName } from './synergyText';
import { t } from '../i18n';

/** 태그 색 (시안 확정본) */
export const TAG_COLOR: Record<string, number> = {
  전기: 0x3ad7ff,
  폭발: 0xff8a2a,
  정밀: 0xc8ff3a,
  근접: 0xff5a8a,
  기계: 0xb0b8d0,
  해킹: 0x39ff88,
};

type Tier = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
/** 추천 색: 시너지 단계 초록, 이름 붙은 조합 주황 */
const REC = 0x39ff88;
const REC_COMBO = 0xffb04a;
const TIER_RANK: Record<Tier, number> = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };
const BASE = 0x120a24;
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const mix = (a: number, b: number, k: number) => {
  const ca = Phaser.Display.Color.IntegerToColor(a);
  const cb = Phaser.Display.Color.IntegerToColor(b);
  return Phaser.Display.Color.GetColor(ca.red + (cb.red - ca.red) * k, ca.green + (cb.green - ca.green) * k, ca.blue + (cb.blue - ca.blue) * k);
};

/** 아이콘 뒤 후광 텍스처 (색·빛줄기 수마다 한 번 만듦) */
function haloTex(scene: Phaser.Scene, color: number, rays: number, rayColor = color): string {
  const key = `ui_halo_${color.toString(16)}_${rays}_${rayColor.toString(16)}`;
  if (scene.textures.exists(key)) return key;
  const S = 88 * 2;
  const tex = scene.textures.createCanvas(key, S, S)!;
  const ctx = tex.getContext();
  const c = Phaser.Display.Color.IntegerToColor(color);
  const rc = Phaser.Display.Color.IntegerToColor(rayColor);
  const m = S / 2;
  if (rays > 0) {
    ctx.save();
    ctx.translate(m, m);
    const n = rays;
    for (let i = 0; i < n; i++) {
      ctx.rotate((Math.PI * 2) / n);
      const g = ctx.createLinearGradient(0, 0, m * 0.95, 0);
      g.addColorStop(0, `rgba(${rc.red},${rc.green},${rc.blue},0.45)`);
      g.addColorStop(1, `rgba(${rc.red},${rc.green},${rc.blue},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const w = n > 10 ? 0.05 : 0.035;
      ctx.lineTo(Math.cos(-w * Math.PI) * m, Math.sin(-w * Math.PI) * m);
      ctx.lineTo(Math.cos(w * Math.PI) * m, Math.sin(w * Math.PI) * m);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  const g = ctx.createRadialGradient(m, m, 0, m, m, m * 0.72);
  g.addColorStop(0, `rgba(${c.red},${c.green},${c.blue},0.55)`);
  g.addColorStop(1, `rgba(${c.red},${c.green},${c.blue},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  tex.refresh();
  return key;
}

/** 카드 배치를 바꿀 때 (상점 등): 카드 위치·너비·최소 높이, 칩이 모자란 카드는 흐리게, 제목 색 */
export interface CardLayoutOpts {
  /** 좁은 화면용(상점): 그림 칸을 줄이고 추천은 제목 한 줄, 카드 높이는 fixedH */
  tight?: boolean;
  fixedH?: number;
  top?: number;
  cw?: number;
  minH?: number;
  titleColor?: string;
  dimmed?: boolean[];
}
/** show()가 돌려주는 카드 자리 (그 아래에 버튼을 붙일 때) */
export interface CardLayout {
  xs: number[];
  cw: number;
  top: number;
  ch: number;
}

/**
 * 선택 카드 화면 (레벨업·보급 상자·능력 고르기).
 * 키보드(1·2·3, R 다시 뽑기, X 포기)와 클릭/터치 모두 지원.
 * 디자인: 등급 띠 + 후광 + 원판 위 아이콘, 등급이 오를수록 테두리가 화려해짐 (UI 시안 B3 확정본)
 */
export class LevelUpUI {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private tweens: Phaser.Tweens.Tween[] = [];
  private keyHandler?: (e: KeyboardEvent) => void;

  constructor(private readonly scene: Phaser.Scene) {}

  get open(): boolean {
    return this.objs.length > 0;
  }

  show(choices: Choice[], rerolls: number, onPick: (i: number) => void, onReroll: () => void, title = 'LEVEL UP', skip?: { label: string; onSkip: () => void }, opts: CardLayoutOpts = {}): CardLayout {
    this.hide();
    const s = this.scene;
    const D = 300;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T, depth = D): T => {
      (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(depth);
      this.objs.push(o);
      return o;
    };
    const txt = (x: number, y: number, str: string, size: number, color: string, extra: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}, depth = D + 3) =>
      add(s.add.text(x, y, str, { ...BASE_TEXT, fontSize: `${size}px`, color, ...extra }), depth);

    add(s.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x000000, 0.68).setOrigin(0));
    const titleCol = opts.titleColor ?? (title === 'LEVEL UP' ? '#39ff88' : '#fff23a');
    txt(VIEW_W / 2, 30, title, 20, titleCol).setOrigin(0.5).setShadow(0, 0, titleCol, 8, true, true);

    const n = choices.length;
    const gap = 14;
    const cw = opts.cw ?? Math.min(184, Math.floor((VIEW_W - 24 - gap * (n - 1)) / n));
    const top = opts.top ?? 62;
    let armed = -1;
    const x0 = Math.round(VIEW_W / 2 - (n * cw + (n - 1) * gap) / 2);
    // 추천 이유와 별 줄·경고가 같이 있는 카드가 있으면 그림 칸을 줄여 글자 자리를 만듦
    const compact = !!opts.tight || choices.some((c) => c.card?.rec && (c.card.warn || c.card.star));

    // 1차: 카드 안 글자를 만들어 높이를 잰 뒤, 모든 카드를 같은 높이로 그림
    type Built = { x: number; tier: Tier; col: number; label: string; info: CardInfo; c: Choice; body: Phaser.GameObjects.GameObject[]; contentBottom: number };
    const built: Built[] = [];
    choices.forEach((c, i) => {
      const x = x0 + i * (cw + gap);
      // 강화 카드는 장착한 아이템의 등급으로 보여 줌 (card.rarity, 표시만)
      const R = c.card?.rarity ?? c.rarity;
      const tier = (R.id as Tier) ?? 'common';
      const col = Phaser.Display.Color.HexStringToColor(R.color).color;
      const info: CardInfo = c.card ?? {
        slot: c.pickAbility ? c.levelLabel : c.levelLabel,
        short: c.desc,
        tags: [],
        star: c.ability ? `★ ${c.ability.name}\n${c.ability.desc}` : undefined,
      };
      const cx = x + cw / 2;
      const body: Phaser.GameObjects.GameObject[] = [];
      // 이름
      const nameY = top + 17 + 6 + (compact ? 70 : 88) + 2;
      const name = txt(cx, nameY, c.title, 16, '#ffffff', { strokeThickness: 3 }).setOrigin(0.5, 0).setShadow(0, 0, hex(col), 6, true, true);
      if (name.width > cw - 12) name.setScale((cw - 12) / name.width);
      body.push(name);
      // 칩 줄: 소켓 + 태그
      const chipY = nameY + 24;
      const chips: { label: string; color: number; up: boolean; slot: boolean }[] = [];
      if (info.slot) chips.push({ label: info.slot, color: 0xb8a8d8, up: false, slot: true });
      for (const tg of info.tags) chips.push({ label: tg.up ? `${tagName(tg.tag)} ▲${tg.up}` : tagName(tg.tag), color: TAG_COLOR[tg.tag] ?? 0xb8a8d8, up: !!tg.up, slot: false });
      const chipTexts = chips.map((ch) => txt(0, chipY, ch.label, 9, hex(ch.color), { strokeThickness: 0, fontStyle: ch.up ? 'bold' : 'bold' }).setOrigin(0, 0));
      const pad = 4;
      const cgap = 3;
      const total = chipTexts.reduce((a, o) => a + o.width + pad * 2, 0) + cgap * Math.max(0, chipTexts.length - 1);
      let cxx = cx - total / 2;
      chipTexts.forEach((o, k) => {
        const ch = chips[k];
        const w = o.width + pad * 2;
        const h = 14;
        const bg = add(s.add.rectangle(cxx, chipY - 1, w, h, ch.color, ch.slot ? 0 : ch.up ? 0.28 : 0.1).setOrigin(0).setStrokeStyle(1, ch.color, ch.slot ? 0.4 : ch.up ? 1 : 0.5), D + 2);
        if (ch.up) {
          // 오르는 태그는 빛나게
          const glow = add(s.add.rectangle(cxx - 2, chipY - 3, w + 4, h + 4, ch.color, 0.18).setOrigin(0), D + 1);
          body.push(glow);
        }
        o.setX(cxx + pad);
        body.push(bg, o);
        cxx += w + cgap;
      });
      // 짧은 설명
      const descY = chipY + 22;
      const desc = txt(cx, descY, info.short, 11, '#e8f7ff', { align: 'center', lineSpacing: 3, strokeThickness: 2, wordWrap: { width: cw - 20, useAdvancedWrap: true } }).setOrigin(0.5, 0);
      body.push(desc);
      let bottom = desc.y + desc.height;
      if (info.star) {
        const st = txt(cx, bottom + 4, info.star, 10, hex(tier === 'common' ? 0xe8f7ff : col), { align: 'center', lineSpacing: 2, strokeThickness: 2, wordWrap: { width: cw - 16, useAdvancedWrap: true } }).setOrigin(0.5, 0);
        body.push(st);
        bottom = st.y + st.height;
      }
      // 추천 이유 (조합 완성·시너지 단계) / 경고 (조합 해제)
      if (info.rec) {
        const rc = info.rec.combo ? REC_COMBO : REC;
        const rt = txt(cx, bottom + 6, `${info.rec.combo ? '★ ' : '▲ '}${info.rec.title}`, 10, hex(rc), { strokeThickness: 2, fontStyle: '900', align: 'center', wordWrap: { width: cw - 14, useAdvancedWrap: true } }).setOrigin(0.5, 0);
        // 상점(tight)은 제목 한 줄만, 그 밖에는 짧은 효과 한 줄
        const rd = txt(cx, rt.y + rt.height + 1, opts.tight ? '' : info.rec.text, 9.5, '#d8ffe4', { strokeThickness: 2, align: 'center', lineSpacing: 1, wordWrap: { width: cw - 16, useAdvancedWrap: true } }).setOrigin(0.5, 0);
        if (opts.tight) rd.setY(rt.y + rt.height - rd.height);
        const bgR = add(s.add.rectangle(x + 6, rt.y - 3, cw - 12, rd.y + rd.height - rt.y + 6, rc, 0.1).setOrigin(0).setStrokeStyle(1, rc, 0.55), D + 2);
        body.push(rt, rd, bgR);
        bottom = rd.y + rd.height + 3;
      }
      if (info.warn) {
        const wt = txt(cx, bottom + 4, info.warn, 9.5, '#ff8a6a', { strokeThickness: 2, align: 'center', wordWrap: { width: cw - 14, useAdvancedWrap: true } }).setOrigin(0.5, 0);
        body.push(wt);
        bottom = wt.y + wt.height;
      }
      built.push({ x, tier, col, label: R.label, info, c, body, contentBottom: bottom });
    });
    const footH = 20;
    const ch = opts.fixedH ?? Math.min(VIEW_H - top - 40, Math.max(opts.minH ?? 248, Math.max(...built.map((b) => b.contentBottom)) - top + footH + 14));

    // 2차: 카드 틀·띠·후광·아래 줄·테두리·연출
    built.forEach((b, i) => {
      const { x, tier, col, info } = b;
      const rank = TIER_RANK[tier] ?? 0;
      const cx = x + cw / 2;
      const isMyth = tier === 'mythic';
      const isLeg = tier === 'legendary';
      const accent = isMyth ? 0xffb04a : col;

      // 바깥 빛 (영웅부터, 전설·신화는 더 넓게)
      const glow = add(s.add.graphics(), D - 1);
      const glowLayers = rank >= 4 ? 6 : rank >= 3 ? 5 : rank >= 2 ? 3 : 0;
      for (let k = glowLayers; k >= 1; k--) {
        glow.lineStyle(2, col, (rank >= 4 ? 0.22 : 0.16) * (1 - (k - 1) / glowLayers));
        glow.strokeRect(x - k * 2, top - k * 2, cw + k * 4, ch + k * 4);
      }
      if (rank >= 4) {
        this.tweens.push(s.tweens.add({ targets: glow, alpha: { from: 0.55, to: 1 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
      }

      // 배경: 위쪽은 등급 색으로 물들고 아래로 갈수록 어두움 (일반은 물들이지 않음)
      const bg = add(s.add.graphics(), D);
      const topCol = rank === 0 ? BASE : isMyth ? 0x5a0a1e : mix(BASE, col, 0.3);
      const midCol = isMyth ? 0x2a0616 : BASE;
      const half = Math.round(ch * 0.5);
      bg.fillGradientStyle(topCol, topCol, midCol, midCol, 0.97);
      bg.fillRect(x, top, cw, half);
      bg.fillGradientStyle(midCol, midCol, BASE, BASE, 0.97);
      bg.fillRect(x, top + half, cw, ch - half);

      // 등급 띠
      const band = add(s.add.graphics(), D + 1);
      const bh = 17;
      if (rank === 0) band.fillStyle(0x6a6a80).fillRect(x, top, cw, bh);
      else if (isLeg) {
        band.fillGradientStyle(0xffd21a, 0xfffbc0, 0xffd21a, 0xfffbc0, 1).fillRect(x, top, cw / 2, bh);
        band.fillGradientStyle(0xfffbc0, 0xffd21a, 0xfffbc0, 0xffd21a, 1).fillRect(x + cw / 2, top, cw / 2, bh);
      } else if (isMyth) {
        const seg = [0xff2bd6, 0xff2a3a, 0xff8a2a, 0xff2a3a];
        for (let k = 0; k < 3; k++) band.fillGradientStyle(seg[k], seg[k + 1], seg[k], seg[k + 1], 1).fillRect(x + (cw / 3) * k, top, cw / 3 + 1, bh);
      } else band.fillStyle(col).fillRect(x, top, cw, bh);
      const label = isMyth ? `◆ ${b.label} ◆` : isLeg ? `★ ${b.label} ★` : b.label;
      txt(cx, top + bh / 2, label, 11, '#0a0614', { strokeThickness: 0, fontStyle: '900' }).setOrigin(0.5).setLetterSpacing(2);
      txt(x + 6, top + bh / 2, String(i + 1), 10, '#0a0614', { strokeThickness: 0, fontStyle: '900' }).setOrigin(0, 0.5);

      // 후광 + 원판 + 아이콘
      const hy = top + bh + 6 + (compact ? 35 : 44);
      if (rank > 0) {
        const key = haloTex(s, isMyth ? 0xff2a3a : col, isMyth ? 12 : isLeg ? 8 : 0, isMyth ? 0xff8a2a : col);
        const halo = add(s.add.image(cx, hy, key).setScale(compact ? 0.4 : 0.5), D + 1);
        if (rank >= 3) this.tweens.push(s.tweens.add({ targets: halo, angle: 360, duration: isMyth ? 9000 : 14000, repeat: -1 }));
      }
      add(s.add.circle(cx, hy, compact ? 27 : 31, 0x0a0716, 1).setStrokeStyle(1, col, rank === 0 ? 0.5 : 0.6), D + 2);
      const art = b.c.art ?? b.c.id;
      const key = s.textures.exists(`card_${art}`) ? `card_${art}` : s.textures.exists(`icon_${art}`) ? `icon_${art}` : null;
      if (key) {
        const pic = add(s.add.image(Math.round(cx), Math.round(hy), key), D + 3);
        // 늘리면 픽셀 테두리가 들쭉날쭉해지므로 정수 배율만 (48px 그림은 그대로)
        pic.setScale(Math.max(1, Math.floor(48 / Math.max(pic.width, pic.height))));
      }

      // 아래 줄: ⇄ 교체 대상 · Lv
      if (info.foot) {
        const fy = top + ch - 6 - footH;
        add(s.add.rectangle(x + 6, fy, cw - 12, footH, 0x0a0618, 1).setOrigin(0).setStrokeStyle(1, 0xffffff, 0.1), D + 2);
        const fl = txt(x + 12, fy + footH / 2, info.foot.left, 10, '#b8a8d8', { strokeThickness: 0 }).setOrigin(0, 0.5);
        const fr0 = info.foot.right ? txt(x + cw - 12, fy + footH / 2, info.foot.right, 10, '#39ff88', { strokeThickness: 0 }).setOrigin(1, 0.5) : null;
        const room = cw - 24 - (fr0 ? fr0.width + 8 : 0);
        if (fl.width > room) fl.setScale(room / fl.width);
      }

      // 추천 카드: 위에 '추천' 꼬리표 + 초록 빛이 맥박처럼
      if (info.rec && !info.warn) {
        const rc = info.rec.combo ? REC_COMBO : REC;
        const ring = add(s.add.graphics(), D);
        for (let k = 1; k <= 3; k++) ring.lineStyle(2, rc, 0.32 * (1 - (k - 1) / 3)).strokeRect(x - 2 - k * 3, top - 2 - k * 3, cw + 4 + k * 6, ch + 4 + k * 6);
        this.tweens.push(s.tweens.add({ targets: ring, alpha: { from: 0.35, to: 1 }, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
        // '추천' 꼬리표는 등급 띠 오른쪽 안에 (위 안내 문장과 겹치지 않게)
        const tagT = txt(x + cw - 9, top + 9, t('rec.badge'), 9, '#0a0614', { strokeThickness: 0, fontStyle: '900' }, D + 7).setOrigin(1, 0.5);
        add(s.add.rectangle(tagT.x + 4, top + 2, tagT.width + 8, 14, rc, 1).setOrigin(1, 0).setStrokeStyle(1, 0x0a0614, 0.8), D + 6);
      }

      // 테두리: 일반 1px 회색, 희귀·영웅 2px, 전설·신화 3px + 안쪽 한 줄 + 모서리 꺾쇠
      const fr = add(s.add.graphics(), D + 4);
      if (rank === 0) fr.lineStyle(1, 0x8a8aa0, 1).strokeRect(x + 0.5, top + 0.5, cw - 1, ch - 1);
      else if (rank < 3) fr.lineStyle(2, col, 1).strokeRect(x + 1, top + 1, cw - 2, ch - 2);
      else {
        fr.lineStyle(3, col, 1).strokeRect(x + 1.5, top + 1.5, cw - 3, ch - 3);
        fr.lineStyle(1, col, 0.55).strokeRect(x + 4.5, top + 4.5, cw - 9, ch - 9);
        const L = isMyth ? 18 : 14;
        fr.lineStyle(3, accent, 1);
        const o = -3;
        const corners: [number, number, number, number][] = [
          [x + o, top + o, 1, 1],
          [x + cw - o, top + o, -1, 1],
          [x + o, top + ch - o, 1, -1],
          [x + cw - o, top + ch - o, -1, -1],
        ];
        for (const [px, py, dx, dy] of corners) {
          fr.beginPath();
          fr.moveTo(px + dx * L, py);
          fr.lineTo(px, py);
          fr.lineTo(px, py + dy * L);
          fr.strokePath();
        }
      }

      // 전설·신화: 사선 반짝임이 카드를 가로질러 지나감 (카드 안으로 잘라 그림)
      if (rank >= 3) {
        const shine = add(s.add.graphics(), D + 3);
        const st = { p: -0.4 };
        const slope = 0.47;
        const bw = 26;
        const draw = () => {
          shine.clear();
          const sx = x - ch * slope + (cw + ch * slope + bw) * st.p;
          for (let yy = 0; yy < ch; yy += 3) {
            const a = Math.max(x, sx + yy * slope);
            const z = Math.min(x + cw, sx + yy * slope + bw);
            if (z <= a) continue;
            shine.fillStyle(isMyth ? 0xffd0d0 : 0xffffff, 0.16).fillRect(a, top + ch - yy - 3, z - a, 3);
          }
        };
        this.tweens.push(s.tweens.add({ targets: st, p: 1.4, duration: 1400, delay: 300 + i * 150, repeatDelay: isMyth ? 1300 : 2200, repeat: -1, onUpdate: draw }));
      }
      // 신화: 불티가 떠오름
      if (isMyth) {
        for (let k = 0; k < 8; k++) {
          const e = add(s.add.rectangle(x + 8 + ((k * 53) % (cw - 16)), top + ch - 30, 2, 2, 0xffb04a, 1), D + 3);
          this.tweens.push(
            s.tweens.add({ targets: e, y: top + 30, alpha: { from: 1, to: 0 }, duration: 1800 + (k % 3) * 500, delay: k * 260, repeat: -1, onRepeat: () => e.setX(x + 8 + Math.random() * (cw - 16)) }),
          );
        }
      }

      // 칩이 모자란 카드 (상점): 어둡게 덮음
      if (opts.dimmed?.[i]) add(s.add.rectangle(x, top, cw, ch, 0x05030c, 0.5).setOrigin(0), D + 4);
      // 고르기: 카드 위에서 눌렀다 떼야 선택 (이동 중 손을 뗀 경우 무시)
      const hit = add(s.add.rectangle(x, top, cw, ch, 0xffffff, 0).setOrigin(0), D + 5);
      hit.setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => {
        hit.setFillStyle(0xffffff, 0.06);
        Sound.play('hover');
      });
      hit.on('pointerout', () => hit.setFillStyle(0xffffff, 0));
      hit.on('pointerdown', () => (armed = i));
      hit.on('pointerup', () => {
        if (armed === i) onPick(i);
        armed = -1;
      });
    });

    // 아래 버튼: 다시 뽑기, 선택 포기 (둘 다 있으면 나란히)
    const by = Math.min(VIEW_H - 16, top + ch + 22);
    const both = rerolls > 0 && !!skip;
    const button = (bx: number, label: string, color: string, armId: number, act: () => void) => {
      const b = txt(bx, by, label, 12, color, { backgroundColor: '#120a24', padding: { x: 10, y: 5 }, strokeThickness: 2 }, D + 6).setOrigin(0.5);
      b.setInteractive({ useHandCursor: true }).on('pointerdown', () => (armed = armId));
      b.on('pointerup', () => {
        if (armed === armId) act();
        armed = -1;
      });
      return b;
    };
    if (skip) {
      const sb = button(both ? VIEW_W / 2 + 70 : VIEW_W / 2, `${skip.label} [X]`, '#8a7aa8', 98, () => skip.onSkip());
      sb.on('pointerover', () => sb.setColor('#e8f7ff'));
      sb.on('pointerout', () => sb.setColor('#8a7aa8'));
    }
    if (rerolls > 0) button(both ? VIEW_W / 2 - 70 : VIEW_W / 2, t('lvl.reroll', { n: rerolls }), '#00f0ff', 99, onReroll);

    this.keyHandler = (e: KeyboardEvent) => {
      const k = Number(e.key);
      if (k >= 1 && k <= choices.length) onPick(k - 1);
      else if ((e.key === 'r' || e.key === 'R') && rerolls > 0) onReroll();
      else if ((e.key === 'x' || e.key === 'X') && skip) skip.onSkip();
    };
    s.input.keyboard!.on('keydown', this.keyHandler);
    return { xs: built.map((b) => b.x), cw, top, ch };
  }

  hide(): void {
    for (const tw of this.tweens) tw.remove();
    this.tweens = [];
    for (const o of this.objs) o.destroy();
    this.objs = [];
    if (this.keyHandler) this.scene.input.keyboard!.off('keydown', this.keyHandler);
    this.keyHandler = undefined;
  }
}
