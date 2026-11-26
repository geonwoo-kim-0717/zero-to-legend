import Phaser from 'phaser';
import { BASE_TEXT } from './text';
import { VIEW_W, VIEW_H, COLORS } from '../config';
import gameData from '../data/game.json';
import { itemArt } from '../systems/Build';
import type { Sock } from '../systems/Loadout';
import { I18n } from '../i18n';

/** HUD가 그릴 때 받는 값 (GameScene이 매 프레임 넘김) */
export interface HudState {
  elapsed: number;
  level: number;
  kills: number;
  credits: number;
  chips: number;
  hp: number;
  maxHp: number;
  shield: number;
  shieldOn: boolean;
  weapons: readonly { id: string; level: number; rarity: string; abilities: ReadonlySet<string>; slot: 'primary' | 'secondary'; readiness(): number; activeOn: boolean }[];
  sockets: ReadonlyMap<string, Sock>;
  os: { id: string; level: number; color: string; hasActive: boolean; label: string };
  odGauge: number;
  specialOn: boolean;
  osCdT: number;
  /** 대시 준비 0~1 */
  dash: number;
  /** 터치 기기면 아래 능력 막대를 숨김 (버튼에 같은 표시가 있음) */
  touch: boolean;
}

const RAR = new Map(gameData.rarity.map((r) => [r.id, Phaser.Display.Color.HexStringToColor(r.color).color]));
const RANK: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };
const ORDER = ['primary', 'secondary', 'os', 'neural', 'optic', 'skeletal', 'defense', 'tactical'] as const;

const TEXT = { ...BASE_TEXT, fontSize: '12px', color: '#e8f7ff' };

/**
 * 전투 HUD (UI 시안 A 확정본)
 * - 왼쪽 위: LV 배지 + 체력바(보호막은 아래 시안 줄) + 소켓 8칸 작은 아이콘 (무기·OS / 사이버웨어 / 장비 묶음)
 * - 가운데 위: 시간·구역 (GameScene이 글자를 채움)
 * - 오른쪽 위: 처치 수 · 칩(◆) · 크레딧
 * - 아래 가운데: 능력 막대 (보조무기 · OS Q · 대시), 터치 기기는 버튼이 대신하므로 숨김
 */
export class Hud {
  /** GameScene이 그대로 쓰는 글자들 (예전 hud 객체와 같은 이름) */
  readonly t: {
    bars: Phaser.GameObjects.Graphics;
    time: Phaser.GameObjects.Text;
    level: Phaser.GameObjects.Text;
    hp: Phaser.GameObjects.Text;
    kills: Phaser.GameObjects.Text;
    debug: Phaser.GameObjects.Text;
    od: Phaser.GameObjects.Text;
    credits: Phaser.GameObjects.Text;
    bossName: Phaser.GameObjects.Text;
    zone: Phaser.GameObjects.Text;
    center: Phaser.GameObjects.Text;
  };
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly chips: Phaser.GameObjects.Text;
  private readonly sockImgs: Phaser.GameObjects.Image[] = [];
  private readonly sockLv: Phaser.GameObjects.Text[] = [];
  private readonly star: Phaser.GameObjects.Text[] = [];
  private readonly bar: Phaser.GameObjects.GameObject[] = [];
  private readonly subImg: Phaser.GameObjects.Image;
  private readonly osImg: Phaser.GameObjects.Image;
  private readonly osQ: Phaser.GameObjects.Text;
  private readonly osCd: Phaser.GameObjects.Text;
  private readonly dashTxt: Phaser.GameObjects.Text;
  private readonly keys: Phaser.GameObjects.Text[] = [];

  static readonly HP_W = 150;
  /** 소켓 줄 아래 (DPS 표시 등을 둘 y) */
  static readonly BELOW = 56;

  constructor(private readonly scene: Phaser.Scene) {
    const s = scene;
    const fixed = <T extends Phaser.GameObjects.Text>(o: T, depth = 100) => o.setScrollFactor(0).setDepth(depth);
    const HP_W = Hud.HP_W;
    this.g = s.add.graphics().setScrollFactor(0).setDepth(99.5);
    this.t = {
      bars: s.add.graphics().setScrollFactor(0).setDepth(100),
      time: fixed(s.add.text(VIEW_W / 2, 8, '00:00', { ...TEXT, fontSize: '16px', fontStyle: '900' }).setOrigin(0.5, 0)),
      level: fixed(s.add.text(12, 16, 'LV 1', { ...TEXT, fontSize: '10px', color: '#0a0614', fontStyle: '900', strokeThickness: 0 }).setOrigin(0, 0.5), 101),
      hp: fixed(s.add.text(0, 16, '', { ...TEXT, fontSize: '9px', strokeThickness: 3 }).setOrigin(0.5, 0.5), 101),
      kills: fixed(s.add.text(VIEW_W - 8, 8, '0', { ...TEXT, fontSize: '11px' }).setOrigin(1, 0)),
      debug: fixed(s.add.text(VIEW_W - 8, 60, '', { ...TEXT, fontSize: '11px', color: '#39ff88', align: 'right' }).setOrigin(1, 0)),
      od: fixed(s.add.text(VIEW_W / 2, VIEW_H - 60, '', { ...TEXT, fontSize: '9px' }).setOrigin(0.5, 1)),
      credits: fixed(s.add.text(VIEW_W - 8, 23, '', { ...TEXT, fontSize: '11px', color: '#fff23a' }).setOrigin(1, 0)),
      bossName: fixed(s.add.text(VIEW_W / 2, 42, '', { ...TEXT, fontSize: '11px', color: '#ff2a3a' }).setOrigin(0.5, 0)),
      zone: fixed(s.add.text(VIEW_W / 2, 27, '', { ...TEXT, fontSize: '9px', color: '#8a7aa8' }).setOrigin(0.5, 0)),
      center: fixed(s.add.text(VIEW_W / 2, VIEW_H / 2, '', { ...TEXT, fontSize: '20px', align: 'center' }).setOrigin(0.5).setVisible(false)),
    };
    this.t.time.setShadow(0, 0, '#00f0ff', 6, true, true);
    this.t.hp.setX(this.hpX() + HP_W / 2);
    this.chips = fixed(s.add.text(VIEW_W - 8, 23, '', { ...TEXT, fontSize: '11px', color: '#3ad7ff' }).setOrigin(1, 0));

    // 소켓 8칸 (14px 아이콘)
    for (let i = 0; i < ORDER.length; i++) {
      const { x, y } = this.sockPos(i);
      this.sockImgs.push(s.add.image(x + 10, y + 10, '__WHITE').setScrollFactor(0).setDepth(101).setVisible(false));
      this.sockLv.push(fixed(s.add.text(x + 21, y + 22, '', { ...TEXT, fontSize: '7px', color: '#39ff88', strokeThickness: 2 }).setOrigin(1, 1), 102));
      this.star.push(fixed(s.add.text(x - 1, y - 3, '', { ...TEXT, fontSize: '7px', color: '#fff23a', strokeThickness: 2 }), 102));
    }

    // 아래 능력 막대
    const by = VIEW_H - 32;
    const cx = VIEW_W / 2;
    this.subImg = s.add.image(cx - 46, by, '__WHITE').setScrollFactor(0).setDepth(101).setVisible(false);
    this.osImg = s.add.image(cx, by - 4, '__WHITE').setScrollFactor(0).setDepth(101).setVisible(false);
    this.osQ = fixed(s.add.text(cx, by - 4, 'Q', { ...TEXT, fontSize: '13px', fontStyle: '900', color: '#0a0614', strokeThickness: 0 }).setOrigin(0.5), 102);
    this.osCd = fixed(s.add.text(cx, by - 4, '', { ...TEXT, fontSize: '12px', fontStyle: '900' }).setOrigin(0.5), 103);
    this.dashTxt = fixed(s.add.text(cx + 46, by, '»', { ...TEXT, fontSize: '17px', fontStyle: '900', color: '#00f0ff' }).setOrigin(0.5), 102);
    const en = I18n.lang === 'en';
    const key = (x: number, y: number, str: string) => {
      const k = fixed(s.add.text(x, y, str, { ...TEXT, fontSize: '7px', color: '#b8a8d8', strokeThickness: 0, backgroundColor: '#05030c', padding: { x: 2, y: 0 } }).setOrigin(0.5), 103);
      this.keys.push(k);
      return k;
    };
    // 보조무기 자동 발사면 키 대신 '자동'
    const autoSub = (gameData.twinStick as { autoSecondary?: boolean }).autoSecondary === true;
    key(cx - 46, by + 19, autoSub ? (en ? 'AUTO' : '자동') : en ? 'R-CLICK' : '우클릭');
    key(cx, by + 19, 'OS');
    key(cx + 46, by + 19, 'SPACE');
    this.bar.push(this.subImg, this.osImg, this.osQ, this.osCd, this.dashTxt, ...this.keys, this.t.od);
  }

  private hpX(): number {
    return 8 + 40;
  }

  private sockPos(i: number): { x: number; y: number } {
    const gap = i >= 6 ? 10 : i >= 3 ? 5 : 0;
    return { x: 8 + i * 23 + gap, y: 28 };
  }

  update(st: HudState): void {
    const g = this.g;
    const s = this.scene;
    g.clear();
    // 위쪽 옅은 어둠 (글자가 배경에 묻히지 않게)
    for (let i = 0; i < 6; i++) g.fillStyle(0x05030c, 0.12).fillRect(0, 0, VIEW_W, 58 - i * 9);

    // LV 배지 + 체력
    const lvW = 36;
    g.fillStyle(COLORS.green, 1).fillRect(8, 9, lvW, 14);
    this.t.level.setText(`LV ${st.level}`).setX(8 + lvW / 2).setOrigin(0.5, 0.5);
    if (this.t.level.width > lvW - 2) this.t.level.setScale((lvW - 2) / this.t.level.width);
    else this.t.level.setScale(1);
    const hx = this.hpX();
    const W = Hud.HP_W;
    const hpK = Math.max(0, st.hp) / st.maxHp;
    const low = hpK < 0.3;
    g.fillStyle(0x05030c, 1).fillRect(hx - 1, 8, W + 2, 16);
    g.fillStyle(0x300010, 1).fillRect(hx, 9, W, 14);
    g.fillStyle(low && Math.floor(st.elapsed * 6) % 2 ? 0xffffff : low ? 0xff2a3a : COLORS.magenta, 1).fillRect(hx, 9, W * hpK, 14);
    g.fillStyle(0xffffff, 0.18).fillRect(hx, 9, W * hpK, 4);
    if (st.shieldOn && st.shield > 0) g.fillStyle(COLORS.cyan, 1).fillRect(hx, 20, Math.min(W, (W * st.shield) / st.maxHp), 3);
    this.t.hp.setText(`${Math.ceil(Math.max(0, st.hp))} / ${st.maxHp}`);

    // 소켓 8칸
    const w = (slot: 'primary' | 'secondary') => st.weapons.find((o) => o.slot === slot);
    ORDER.forEach((k, i) => {
      const { x, y } = this.sockPos(i);
      let tex: string | null = null;
      let rar = 'common';
      let lv = '';
      let stars = 0;
      let col = 0x8a8aa0;
      if (k === 'primary' || k === 'secondary') {
        const o = w(k);
        if (o) {
          tex = `icon_${o.id}`;
          rar = o.rarity;
          lv = String(o.level);
          stars = o.abilities.size;
        }
      } else if (k === 'os') {
        tex = `icon_os_${st.os.id}`;
        col = Phaser.Display.Color.HexStringToColor(st.os.color).color;
        rar = 'os';
        lv = String(st.os.level);
      } else {
        const o = st.sockets.get(k);
        if (o) {
          tex = `icon_${itemArt(o.id)}`;
          rar = o.rarity;
          lv = String(o.level);
        }
      }
      if (rar !== 'os') col = RAR.get(rar) ?? col;
      const rank = rar === 'os' ? 2 : RANK[rar] ?? 0;
      const img = this.sockImgs[i];
      if (!tex) {
        g.fillStyle(0x05030c, 0.6).fillRect(x, y, 20, 20);
        g.lineStyle(1, 0xffffff, 0.35);
        for (let a = 0; a < 20; a += 4) {
          g.lineBetween(x + a, y, x + a + 2, y);
          g.lineBetween(x + a, y + 20, x + a + 2, y + 20);
          g.lineBetween(x, y + a, x, y + a + 2);
          g.lineBetween(x + 20, y + a, x + 20, y + a + 2);
        }
        img.setVisible(false);
      } else {
        if (rank >= 3) g.lineStyle(2, col, 0.3).strokeRect(x - 2, y - 2, 24, 24);
        g.fillStyle(0x0a0716, 0.85).fillRect(x, y, 20, 20);
        g.lineStyle(rank >= 3 ? 2 : 1, col, rank === 0 ? 0.8 : 1).strokeRect(x + 0.5, y + 0.5, 19, 19);
        if (s.textures.exists(tex)) img.setTexture(tex).setVisible(true);
        else img.setVisible(false);
      }
      this.sockLv[i].setText(lv);
      this.star[i].setText('★'.repeat(stars)).setColor(Phaser.Display.Color.IntegerToColor(col).rgba);
    });

    // 오른쪽 위: 처치 · 칩 · 크레딧
    // 한 줄: ◆칩  ₵크레딧 (오른쪽 끝은 크레딧, 그 왼쪽에 칩)
    this.t.kills.setText(`KILL ${st.kills}`);
    this.t.credits.setText(`₵ ${st.credits}`);
    this.chips.setText(`${Math.floor(st.chips)}`).setX(this.t.credits.x - this.t.credits.width - 10);
    const cx = this.chips.x - this.chips.width - 7;
    const cy = this.chips.y + 8;
    g.fillStyle(0x3ad7ff, 1).fillPoints([new Phaser.Math.Vector2(cx, cy - 5), new Phaser.Math.Vector2(cx + 4, cy), new Phaser.Math.Vector2(cx, cy + 5), new Phaser.Math.Vector2(cx - 4, cy)], true);

    // 아래 능력 막대
    for (const o of this.bar) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(!st.touch);
    if (st.touch) return;
    const by = VIEW_H - 32;
    const mx = VIEW_W / 2;
    // 보조무기
    const sub = w('secondary');
    const sx = mx - 46;
    if (sub) {
      const k = sub.readiness();
      const ready = k >= 1;
      const sc = RAR.get(sub.rarity) ?? 0xb8a8d8;
      if (ready || sub.activeOn) g.lineStyle(2, sc, 0.35 + (sub.activeOn ? Math.sin(st.elapsed * 12) * 0.3 : 0)).strokeRect(sx - 21, by - 21, 42, 42);
      g.fillStyle(0x0a0716, 0.9).fillRect(sx - 18, by - 18, 36, 36);
      g.lineStyle(2, sc, 1).strokeRect(sx - 18, by - 18, 36, 36);
      this.subImg.setTexture(s.textures.exists(`icon_${sub.id}`) ? `icon_${sub.id}` : '__WHITE').setScale(2).setVisible(true);
      // 재사용 대기: 아직 안 찬 만큼 위에서부터 어둡게 덮음
      if (!ready) g.fillStyle(0x05030c, 0.72).fillRect(sx - 17, by - 17, 34, 34 * (1 - k));
    } else {
      this.subImg.setVisible(false);
      g.lineStyle(1, 0xffffff, 0.3).strokeRect(sx - 18, by - 18, 36, 36);
    }

    // OS: 게이지 고리 + 문양 + Q
    const oy = by - 4;
    const oc = Phaser.Display.Color.HexStringToColor(st.os.color).color;
    const full = st.os.hasActive && st.odGauge >= 100 && st.osCdT <= 0;
    g.fillStyle(0x0a0716, 0.92).fillCircle(mx, oy, 22);
    g.lineStyle(4, 0x2a0a24, 1).strokeCircle(mx, oy, 20);
    if (st.os.hasActive) {
      g.lineStyle(4, oc, 1);
      g.beginPath();
      g.arc(mx, oy, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, st.odGauge / 100), false);
      g.strokePath();
    }
    if (full || st.specialOn) {
      const a = st.specialOn ? 0.5 + Math.sin(st.elapsed * 10) * 0.3 : 0.45;
      for (let n = 1; n <= 3; n++) g.lineStyle(2, oc, a * (1 - n / 4)).strokeCircle(mx, oy, 22 + n * 2);
    }
    const emblem = s.textures.exists(`icon_os_${st.os.id}`) ? `icon_os_${st.os.id}` : null;
    if (emblem && !full) this.osImg.setTexture(emblem).setScale(2).setPosition(mx, oy).setVisible(true).setAlpha(st.os.hasActive ? 1 : 0.6);
    else this.osImg.setVisible(false);
    if (full) {
      // 다 차면 OS 색 육각형 + Q
      const hex = [0, 1, 2, 3, 4, 5].map((i) => new Phaser.Math.Vector2(mx + 14 * Math.cos((Math.PI / 3) * i), oy + 13 * Math.sin((Math.PI / 3) * i)));
      g.fillStyle(oc, 1).fillPoints(hex, true);
    }
    this.osQ.setVisible(full);
    this.osCd.setText(st.os.hasActive && st.osCdT > 0 && !st.specialOn ? String(Math.ceil(st.osCdT)) : '');
    // OS 이름: 준비되면 밝게, 아니면 흐리게
    const label = st.os.hasActive ? `${st.os.label}${full ? (I18n.lang === 'en' ? '  READY' : '  준비') : ''}` : st.os.label;
    if (this.t.od.text !== label) this.t.od.setText(label);
    this.t.od.setColor(st.os.color).setAlpha(full || st.specialOn ? 1 : 0.55);
    if (full) this.t.od.setShadow(0, 0, st.os.color, 6, true, true);
    else this.t.od.setShadow(0, 0, st.os.color, 0, false, false);

    // 대시
    const dx = mx + 46;
    const dReady = st.dash >= 1;
    g.fillStyle(0x0a0716, 0.9).fillRect(dx - 18, by - 18, 36, 36);
    if (!dReady) g.fillStyle(0x05030c, 0.72).fillRect(dx - 17, by - 17, 34, 34 * (1 - st.dash));
    g.lineStyle(2, COLORS.cyan, dReady ? 1 : 0.45).strokeRect(dx - 18, by - 18, 36, 36);
    if (dReady) g.lineStyle(2, COLORS.cyan, 0.3).strokeRect(dx - 21, by - 21, 42, 42);
    this.dashTxt.setAlpha(dReady ? 1 : 0.4);
  }
}
