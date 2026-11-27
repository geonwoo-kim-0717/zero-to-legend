import Phaser from 'phaser';
import { BASE_TEXT } from './text';
import { VIEW_W, VIEW_H } from '../config';
import { Sound } from '../systems/Sound';
import gameData from '../data/game.json';
import build from '../data/build.json';
import osData from '../data/os.json';
import abilitiesData from '../data/abilities.json';
import weaponsData from '../data/weapons.json';
import { ITEMS, itemName, itemText, itemArt, type ItemKind } from '../systems/Build';
import { weaponTags, itemTags, type Sock, type ActiveTier, type ActiveCombo } from '../systems/Loadout';
import { shortText } from './cardInfo';
import { TAG_COLOR } from './LevelUpUI';
import { tagName, tierShort, comboName, comboShort, chipStat } from './synergyText';
import { CHIPSETS, chipName } from '../systems/Chipsets';
import { CHIP_COLOR } from './ChipArt';
import { I18n, t } from '../i18n';

/** 장비창에 넘길 것 (GameScene이 가진 그대로) */
export interface EquipInput {
  weapons: { id: string; name: string; level: number; rarity: string; abilities: Set<string>; slot: 'primary' | 'secondary' }[];
  sockets: ReadonlyMap<string, Sock>;
  os: { id: string; name: string; color: string; desc?: string };
  tagCount: ReadonlyMap<string, number>;
  tiers: readonly ActiveTier[];
  combos: readonly ActiveCombo[];
  /** 칩셋 id → 중첩 (없으면 칩셋 탭 숨김) */
  chipsets?: ReadonlyMap<string, number>;
}

type SlotKey = 'primary' | 'secondary' | 'os' | 'neural' | 'optic' | 'skeletal' | 'defense' | 'tactical';

interface SlotView {
  key: SlotKey;
  label: string;
  empty: boolean;
  name: string;
  rarity: { id: string; label: string; color: number };
  level?: number;
  maxLevel?: number;
  tex?: string;
  tags: string[];
  text: string;
  abilities: { name: string; desc: string; mythic: boolean }[];
  osColor?: number;
}

const RAR = gameData.rarity;
const rarityOf = (id: string) => {
  const r = RAR.find((o) => o.id === id) ?? RAR[0];
  return { id: r.id, label: r.label, color: Phaser.Display.Color.HexStringToColor(r.color).color };
};
const RANK: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

const LABEL_KO: Record<SlotKey, string> = { primary: '주무기', secondary: '보조무기', os: 'OS', neural: '신경', optic: '안구', skeletal: '골격', defense: '방어', tactical: '전술' };
const LABEL_EN: Record<SlotKey, string> = { primary: 'Primary', secondary: 'Secondary', os: 'OS', neural: 'Neural', optic: 'Optic', skeletal: 'Skeletal', defense: 'Defense', tactical: 'Tactical' };

/** 인체도 배치: 칸 왼쪽 위 좌표, 몸에 이어지는 점 */
/** 오른쪽 자세히 칸 설명이 내려갈 수 있는 끝 (논리 px). 그 아래는 시너지·칩셋 탭과 버튼 자리 */
const DETAIL_MAX_Y = 196;

const LAYOUT: Record<SlotKey, { x: number; y: number; to: [number, number] }> = {
  os: { x: 146, y: 34, to: [174, 126] },
  neural: { x: 40, y: 44, to: [168, 128] },
  optic: { x: 252, y: 44, to: [180, 130] },
  secondary: { x: 40, y: 140, to: [150, 166] },
  primary: { x: 252, y: 140, to: [204, 160] },
  skeletal: { x: 146, y: 236, to: [174, 176] },
  defense: { x: 40, y: 236, to: [164, 200] },
  tactical: { x: 252, y: 236, to: [184, 200] },
};

function views(d: EquipInput): Record<SlotKey, SlotView> {
  const en = I18n.lang === 'en';
  const L = en ? LABEL_EN : LABEL_KO;
  const out = {} as Record<SlotKey, SlotView>;
  const empty = (key: SlotKey): SlotView => ({ key, label: L[key], empty: true, name: '', rarity: rarityOf('common'), tags: [], text: '', abilities: [] });
  for (const slot of ['primary', 'secondary'] as const) {
    const w = d.weapons.find((o) => o.slot === slot);
    if (!w) {
      out[slot] = empty(slot);
      continue;
    }
    const lib = (abilitiesData.weapons as Record<string, { legendary: { id: string; name: string; desc: string }[]; mythic: { id: string; name: string; desc: string }[] }>)[w.id];
    const abilities = [...w.abilities].flatMap((id) => {
      const m = lib?.mythic.find((a) => a.id === id);
      const l = lib?.legendary.find((a) => a.id === id);
      const a = m ?? l;
      return a ? [{ name: a.name, desc: a.desc, mythic: !!m }] : [];
    });
    out[slot] = {
      key: slot,
      label: L[slot],
      empty: false,
      name: w.name,
      rarity: rarityOf(w.rarity),
      level: w.level,
      maxLevel: (weaponsData as Record<string, { levels: unknown[] }>)[w.id]?.levels.length ?? 8,
      tex: `card_${w.id}`,
      tags: weaponTags(w.id, w.abilities),
      text: shortText(w.id, w.level, w.rarity) ?? (weaponsData as Record<string, { desc: string }>)[w.id]?.desc ?? '',
      abilities,
    };
  }
  for (const part of ['neural', 'optic', 'skeletal', 'defense', 'tactical'] as const) {
    const k = d.sockets.get(part);
    if (!k) {
      out[part] = empty(part);
      continue;
    }
    const it = ITEMS[k.id];
    out[part] = {
      key: part,
      label: L[part],
      empty: false,
      name: itemName(it.kind as ItemKind, k.id),
      rarity: rarityOf(k.rarity),
      level: k.level,
      maxLevel: it.maxLevel ?? 5,
      tex: `card_${itemArt(k.id)}`,
      tags: itemTags(k.id),
      text: itemText(k.id, k.level, k.rarity),
      abilities: [],
    };
  }
  const osDef = (osData.os as Record<string, { tags?: string[] }>)[d.os.id];
  const oc = Phaser.Display.Color.HexStringToColor(d.os.color).color;
  out.os = { key: 'os', label: 'OS', empty: false, name: d.os.name, rarity: { id: 'os', label: 'OS', color: oc }, tags: osDef?.tags ?? [], text: d.os.desc ?? '', abilities: [], osColor: oc };
  return out;
}

/**
 * 일시정지 장비창 (UI 시안 B 확정본): 왼쪽은 캐릭터 둘레의 소켓 8칸, 오른쪽은 고른 칸 자세히 · 시너지 · 조합.
 * 컨테이너 하나로 돌려주므로 pauseUi에 넣으면 같이 지워진다.
 */
/** cb.onAbandon이 없으면(카드 고르기 중 보기) 임무 포기 버튼 없이 '돌아가기'만 */
export function buildEquipPanel(scene: Phaser.Scene, d: EquipInput, cb: { onResume: () => void; onAbandon?: () => void }): Phaser.GameObjects.Container {
  const s = scene;
  const root = s.add.container(0, 0).setScrollFactor(0).setDepth(131);
  // 컨테이너 안 물체도 각자 스크롤을 0으로 (안 그러면 누르기 판정이 카메라 스크롤만큼 어긋남)
  const add = <T extends Phaser.GameObjects.GameObject>(o: T, into: Phaser.GameObjects.Container = root): T => {
    (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor?.(0);
    into.add(o);
    return o;
  };
  const txt = (x: number, y: number, str: string, size: number, color: string, extra: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}, into = root) =>
    add(s.add.text(x, y, str, { ...BASE_TEXT, fontSize: `${size}px`, color, ...extra }), into);
  const en = I18n.lang === 'en';
  /** 한 줄에 안 들어가면 끝을 … 로 자름 */
  const fit = (o: Phaser.GameObjects.Text, room: number) => {
    let str = o.text;
    while (o.width > room && str.length > 2) {
      str = str.slice(0, -1);
      o.setText(`${str}…`);
    }
    return o;
  };

  // 뒤 어둡게 + 빈 곳을 눌러도 계속되지 않게 막는 판
  const blocker = add(s.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x04020a, 0.72).setOrigin(0));
  blocker.setInteractive();
  txt(18, 8, cb.onAbandon ? (en ? 'PAUSED' : '일시정지') : en ? 'INVENTORY' : '인벤토리', 13, '#00f0ff', { fontStyle: '900', strokeThickness: 2 }).setLetterSpacing(2).setShadow(0, 0, '#00f0ff', 6, true, true);
  txt(96, 11, en ? 'Gear · 8 sockets' : '장비 · 소켓 8칸', 9, '#8a7aa8', { strokeThickness: 0 });

  const V = views(d);
  let sel: SlotKey = 'primary';

  // 몸과 이어지는 점선
  const lines = add(s.add.graphics());
  for (const k of Object.keys(LAYOUT) as SlotKey[]) {
    const p = LAYOUT[k];
    const sx = p.x + 28;
    const sy = p.y + 28;
    const [tx, ty] = p.to;
    const len = Math.hypot(tx - sx, ty - sy);
    lines.lineStyle(1, 0x00f0ff, 0.35);
    for (let a = 0; a < len; a += 4) {
      const k0 = a / len;
      const k1 = Math.min(1, (a + 2) / len);
      lines.lineBetween(sx + (tx - sx) * k0, sy + (ty - sy) * k0, sx + (tx - sx) * k1, sy + (ty - sy) * k1);
    }
    lines.fillStyle(0x00f0ff, 1).fillCircle(tx, ty, 2);
  }
  // 가운데 캐릭터 (3배, 정수 배율)
  if (s.textures.exists('player')) {
    add(s.add.image(174, 160, 'player').setScale(3));
  }

  // 소켓 칸
  const tileFrames = new Map<SlotKey, Phaser.GameObjects.Graphics>();
  const drawSel = () => {
    for (const [k, g] of tileFrames) {
      g.clear();
      if (k !== sel) continue;
      const p = LAYOUT[k];
      g.lineStyle(2, 0xffffff, 1).strokeRect(p.x - 4, p.y - 4, 64, 64);
    }
  };
  for (const k of Object.keys(LAYOUT) as SlotKey[]) {
    const v = V[k];
    const { x, y } = LAYOUT[k];
    const T = 56;
    const g = add(s.add.graphics());
    const col = v.rarity.color;
    const rank = v.key === 'os' ? 2 : RANK[v.rarity.id] ?? 0;
    if (v.empty) {
      g.fillStyle(0x0a0716, 0.5).fillRect(x, y, T, T);
      g.lineStyle(1, 0xffffff, 0.25);
      for (let a = 0; a < T; a += 6) {
        g.lineBetween(x + a, y, x + Math.min(T, a + 3), y);
        g.lineBetween(x + a, y + T, x + Math.min(T, a + 3), y + T);
        g.lineBetween(x, y + a, x, y + Math.min(T, a + 3));
        g.lineBetween(x + T, y + a, x + T, y + Math.min(T, a + 3));
      }
      txt(x + T / 2, y + T / 2, '+', 22, '#ffffff', { strokeThickness: 0 }).setOrigin(0.5).setAlpha(0.3);
    } else {
      // 바깥 빛 (영웅부터)
      if (rank >= 2) for (let n = 3; n >= 1; n--) g.lineStyle(2, col, 0.14 * (1 - (n - 1) / 3)).strokeRect(x - n * 2, y - n * 2, T + n * 4, T + n * 4);
      g.fillStyle(0x0a0716, 1).fillRect(x, y, T, T);
      if (rank > 0) {
        g.fillStyle(col, 0.18).fillCircle(x + T / 2, y + T / 2, 24);
        g.fillStyle(col, 0.1).fillCircle(x + T / 2, y + T / 2, 28);
      }
      if (rank === 0) g.lineStyle(1, 0x8a8aa0, 1).strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
      else if (rank < 3) g.lineStyle(2, col, 1).strokeRect(x + 1, y + 1, T - 2, T - 2);
      else {
        g.lineStyle(3, col, 1).strokeRect(x + 1.5, y + 1.5, T - 3, T - 3);
        g.lineStyle(1, col, 0.55).strokeRect(x + 4.5, y + 4.5, T - 9, T - 9);
      }
      if (v.key === 'os') {
        // OS 문양 (그림이 오기 전 임시: 육각형 + 이름)
        const hx = x + T / 2;
        const hy = y + T / 2;
        const pts = (r: number) => [0, 1, 2, 3, 4, 5].map((i) => new Phaser.Math.Vector2(hx + r * Math.cos((Math.PI / 3) * i), hy + r * 0.92 * Math.sin((Math.PI / 3) * i)));
        const osKey = `os_${d.os.id}`;
        if (s.textures.exists(osKey)) add(s.add.image(hx, hy, osKey));
        else {
          g.fillStyle(col, 1).fillPoints(pts(23), true);
          g.fillStyle(0x120a24, 1).fillPoints(pts(20), true);
          const words = d.os.name.split(' ');
          txt(hx, hy, words.length > 1 ? `${words[0]}\n${words.slice(1).join(' ')}` : words[0], 8, hex(col), { align: 'center', strokeThickness: 0, lineSpacing: -1 }).setOrigin(0.5);
        }
      } else if (v.tex && s.textures.exists(v.tex)) {
        add(s.add.image(x + T / 2, y + T / 2, v.tex));
      }
      if (v.level !== undefined) {
        const lv = txt(x + T, y + T, `Lv${v.level}`, 8, '#39ff88', { strokeThickness: 0, backgroundColor: '#05030c', padding: { x: 2, y: 0 } }).setOrigin(1, 1);
        lv.setX(x + T + 1);
      }
      if (v.abilities.length) txt(x + 2, y - 2, '★'.repeat(v.abilities.length), 10, hex(col), { strokeThickness: 2 });
    }
    txt(x + T / 2, y + T + 3, v.empty ? `${v.label} · ${en ? 'empty' : '비어 있음'}` : v.label, 9, '#8a7aa8', { strokeThickness: 0 }).setOrigin(0.5, 0);
    const fr = add(s.add.graphics());
    tileFrames.set(k, fr);
    const hit = add(s.add.rectangle(x - 4, y - 4, T + 8, T + 8, 0xffffff, 0).setOrigin(0));
    let armed = false;
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => (armed = true));
    hit.on('pointerout', () => (armed = false));
    hit.on('pointerup', () => {
      if (!armed) return;
      armed = false;
      if (sel === k) return;
      sel = k;
      Sound.play('hover');
      drawSel();
      drawRight();
    });
  }

  // 오른쪽: 자세히 · 시너지 · 조합
  const right = add(s.add.container(0, 0));
  const RX = 356;
  const RW = 266;
  let tab: 'syn' | 'chip' = 'syn';
  /** 칩셋 탭: 두 줄 칸 (그림·이름 ×중첩·짧은 효과), 종류별로 모음 */
  const drawChips = (list: [string, number][], y0: number) => {
    if (!list.length) {
      txt(RX, y0, en ? 'No chipsets yet · from level-ups and the black market' : '아직 칩셋 없음 · 레벨업·블랙마켓에서 얻음', 9.5, '#5a4a78', { strokeThickness: 0 }, right);
      return;
    }
    const order = { weapon: 0, special: 1, stat: 2 } as Record<string, number>;
    list.sort((a, b) => (order[CHIPSETS[a[0]].kind] ?? 3) - (order[CHIPSETS[b[0]].kind] ?? 3) || b[1] - a[1]);
    const colW = Math.floor(RW / 2);
    const rowH = 27;
    const rowsFit = Math.max(1, Math.floor((VIEW_H - 46 - y0) / rowH));
    const cap = rowsFit * 2;
    const shown = list.length > cap ? list.slice(0, cap - 1) : list;
    shown.forEach(([id, n], i) => {
      const x = RX + (i % 2) * colW;
      const y = y0 + Math.floor(i / 2) * rowH;
      const def = CHIPSETS[id];
      // 무기 전용 칩셋인데 그 무기를 안 끼고 있으면 효과가 꺼짐 (중첩은 남음): 흐리게
      const off = def.kind === 'weapon' && !d.weapons.some((w) => w.id === def.weapon);
      const kc = off ? '#5a4a78' : (CHIP_COLOR[def.kind] ?? CHIP_COLOR.stat);
      const key = `icon_chip_${id}`;
      if (s.textures.exists(key)) add(s.add.image(x + 12, y + 12, key), right).setAlpha(off ? 0.35 : 1);
      const nm = txt(x + 28, y, chipName(id), 9.5, off ? '#5a4a78' : '#e8f7ff', { strokeThickness: 0 }, right);
      const st = txt(nm.x + nm.width + 4, y, `×${n}`, 9.5, kc, { strokeThickness: 0, fontStyle: '900' }, right);
      if (st.x + st.width > x + colW - 4) {
        fit(nm, Math.max(20, x + colW - 4 - 28 - st.width - 4));
        st.setX(nm.x + nm.width + 4);
      }
      fit(txt(x + 28, y + 13, off ? (en ? 'Off: no weapon' : '꺼짐: 무기 없음') : chipStat(id, n), 8.5, off ? '#6a5a88' : '#8a7aa8', { strokeThickness: 0 }, right), colW - 32);
    });
    if (shown.length < list.length) {
      const i = shown.length;
      txt(RX + (i % 2) * colW + 28, y0 + Math.floor(i / 2) * rowH + 6, en ? `+${list.length - shown.length} more` : `외 ${list.length - shown.length}종`, 9.5, '#8a7aa8', { strokeThickness: 0 }, right);
    }
  };

  const drawRight = () => {
    right.removeAll(true);
    const v = V[sel];
    const col = v.rarity.color;
    const rank = v.key === 'os' ? 2 : RANK[v.rarity.id] ?? 0;
    let y = 30;
    const dg = add(s.add.graphics(), right);
    const body: Phaser.GameObjects.Text[] = [];
    const bandH = 15;
    if (v.empty) {
      body.push(txt(RX + 10, y + bandH + 10, en ? `${v.label} socket is empty.\nGet items from supply crates.` : `${v.label} 소켓이 비어 있습니다.\n보급 상자에서 아이템을 얻으면 끼워집니다.`, 10.5, '#b8a8d8', { strokeThickness: 0, lineSpacing: 3 }, right));
    } else {
      const nm = txt(RX + 8, y + bandH + 5, v.name, 15, '#ffffff', { strokeThickness: 3 }, right).setShadow(0, 0, hex(col), 6, true, true);
      body.push(nm);
      let ty = nm.y + nm.height + 3;
      if (v.tags.length) {
        let tx = RX + 8;
        for (const tag of v.tags) {
          const tc = TAG_COLOR[tag] ?? 0xb8a8d8;
          const tt = txt(tx + 4, ty, tagName(tag), 9, hex(tc), { strokeThickness: 0 }, right);
          dg.fillStyle(tc, 0.1).fillRect(tx, ty - 1, tt.width + 8, 14);
          dg.lineStyle(1, tc, 0.5).strokeRect(tx + 0.5, ty - 0.5, tt.width + 7, 13);
          tx += tt.width + 11;
        }
        ty += 18;
      }
      const ds = txt(RX + 8, ty, v.text, 10.5, '#e8f7ff', { strokeThickness: 0, lineSpacing: 2, wordWrap: { width: RW - 16, useAdvancedWrap: true } }, right);
      // 긴 설명(OS 5줄 등)이 아래 시너지 탭을 버튼 쪽으로 밀지 않게: 칸 높이를 넘으면 글자를 줄임 (최소 7px)
      for (let fs = 10; ds.y + ds.height > DETAIL_MAX_Y && fs >= 7; fs -= 0.5) ds.setFontSize(`${fs}px`).setLineSpacing(fs < 9 ? 1 : 2);
      body.push(ds);
      ty = ds.y + ds.height + 3;
      for (const a of v.abilities) {
        const at = txt(RX + 8, ty, `★ ${a.name}  ${a.desc}`, 10, hex(a.mythic ? rarityOf('mythic').color : rarityOf('legendary').color), { strokeThickness: 0, lineSpacing: 2, wordWrap: { width: RW - 16, useAdvancedWrap: true } }, right);
        body.push(at);
        ty = at.y + at.height + 2;
      }
    }
    const bottom = Math.max(...body.map((o) => o.y + o.height)) + 7;
    const h = bottom - y;
    // 틀 (등급 위계: 카드와 같은 규칙을 작게)
    dg.fillStyle(0x120a24, 0.96).fillRect(RX, y, RW, h);
    if (!v.empty) dg.fillGradientStyle(col, col, 0x120a24, 0x120a24, 0.22).fillRect(RX, y + bandH, RW, Math.min(50, h - bandH));
    if (rank >= 2) for (let n = 3; n >= 1; n--) dg.lineStyle(2, col, 0.14 * (1 - (n - 1) / 3)).strokeRect(RX - n * 2, y - n * 2, RW + n * 4, h + n * 4);
    dg.lineStyle(v.empty ? 1 : 2, v.empty ? 0x8a8aa0 : col, 1).strokeRect(RX + 1, y + 1, RW - 2, h - 2);
    dg.fillStyle(v.empty ? 0x6a6a80 : rank === 0 ? 0x6a6a80 : col, 1).fillRect(RX, y, RW, bandH);
    right.sendToBack(dg);
    const tierLabel = v.empty ? '' : v.key === 'os' ? 'OS' : rank >= 3 ? `★ ${v.rarity.label} ★` : v.rarity.label;
    txt(RX + 6, y + bandH / 2, tierLabel, 10, '#0a0614', { strokeThickness: 0, fontStyle: '900' }, right).setOrigin(0, 0.5);
    const lvTxt = v.level !== undefined ? `${v.label} · Lv ${v.level} / ${v.maxLevel}` : v.label;
    txt(RX + RW - 6, y + bandH / 2, lvTxt, 10, '#0a0614', { strokeThickness: 0, fontStyle: '900' }, right).setOrigin(1, 0.5);

    // 탭: 시너지·조합 | 칩셋 (n)
    y = bottom + 8;
    const chips = [...(d.chipsets ?? new Map<string, number>())].filter(([id, n]) => n > 0 && CHIPSETS[id]);
    const tabs: ['syn' | 'chip', string][] = [['syn', en ? 'SYNERGY' : '시너지']];
    if (d.chipsets) tabs.push(['chip', `${en ? 'CHIPSETS' : '칩셋'} ${chips.reduce((a, [, n]) => a + n, 0)}`]);
    let tx0 = RX;
    for (const [k, label] of tabs) {
      const on = tab === k;
      const tt = txt(tx0 + 6, y, label, 10, on ? '#ffffff' : '#8a7aa8', { strokeThickness: 0, fontStyle: on ? '900' : 'bold' }, right).setLetterSpacing(1);
      const tg = add(s.add.graphics(), right);
      if (on) tg.fillStyle(0x00f0ff, 1).fillRect(tx0, y + 14, tt.width + 12, 2);
      if (tabs.length > 1) {
        const hit = add(s.add.rectangle(tx0, y - 3, tt.width + 12, 19, 0xffffff, 0).setOrigin(0), right);
        let armed = false;
        hit.setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => (armed = true));
        hit.on('pointerout', () => (armed = false));
        hit.on('pointerup', () => {
          if (!armed || tab === k) return;
          armed = false;
          tab = k;
          Sound.play('hover');
          drawRight();
        });
      }
      tx0 += tt.width + 18;
    }
    y += 19;
    if (tab === 'chip') {
      drawChips(chips, y);
      return;
    }
    const rows = [...d.tagCount].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const top: Record<string, ActiveTier> = {};
    for (const tr of d.tiers) if (!top[tr.tag] || top[tr.tag].count < tr.count) top[tr.tag] = tr;
    const pg = add(s.add.graphics(), right);
    // 아래 버튼(VIEW_H - 46) 위까지만: 자리가 모자라면 줄 수를 줄임
    const synRoom = Math.max(1, Math.floor((VIEW_H - 46 - y) / 16));
    for (const [tag, n] of rows.slice(0, Math.min(6, synRoom))) {
      const tc = TAG_COLOR[tag] ?? 0xb8a8d8;
      const tt = txt(RX + 17, y + 1, tagName(tag), en ? 7 : 9, hex(tc), { strokeThickness: 0 }, right).setOrigin(0.5, 0);
      pg.fillStyle(tc, 0.12).fillRect(RX, y, 34, 13);
      pg.lineStyle(1, tc, 0.6).strokeRect(RX + 0.5, y + 0.5, 33, 12);
      void tt;
      for (let i = 0; i < 4; i++) {
        const on = i < n;
        pg.fillStyle(on ? tc : 0xffffff, on ? 1 : 0.1).fillRect(RX + 40 + i * 11, y + 4, 9, 5);
      }
      const act = top[tag];
      fit(txt(RX + 88, y + 1, act ? `${act.count}${en ? '' : '단계'} · ${tierShort(tag, act.count, act.text)}` : en ? 'from 2' : '2개부터', 9.5, act ? '#e8f7ff' : '#5a4a78', { strokeThickness: 0 }, right), RW - 88);
      y += 16;
    }
    if (!rows.length) {
      txt(RX, y, en ? 'No tags yet' : '아직 태그 없음', 9.5, '#5a4a78', { strokeThickness: 0 }, right);
      y += 16;
    }

    // 조합: 켜진 것 → 하나만 빠진 것 (최대 2줄)
    const lines: { name: string; text: string; on: boolean }[] = d.combos.map((c) => ({ name: comboName(c.name), text: comboShort(c.name, en ? 'active' : '발동 중'), on: true }));
    const have = new Set<string>([...d.weapons.map((w) => w.id), ...[...d.sockets.values()].map((k) => k.id)]);
    for (const c of Object.values(build.combos as Record<string, { name: string; needs: string[]; enabled?: boolean }>)) {
      if (c.enabled === false || d.combos.some((a) => a.name === c.name)) continue;
      const miss = c.needs.filter((id) => !have.has(id));
      if (miss.length !== 1 || miss.length === c.needs.length) continue;
      const id = miss[0];
      const nm = ITEMS[id] ? itemName(ITEMS[id].kind as ItemKind, id) : ((weaponsData as Record<string, { name: string }>)[id]?.name ?? id);
      lines.push({ name: comboName(c.name), text: en ? `needs ${nm}` : `${nm} 필요`, on: false });
    }
    if (lines.length && y + 4 + 15 + 13 <= VIEW_H - 46) {
      y += 4;
      txt(RX, y, en ? 'COMBOS' : '조합', 10, '#b8a8d8', { strokeThickness: 0 }, right).setLetterSpacing(1);
      y += 15;
      for (const l of lines.slice(0, Math.max(1, Math.floor((VIEW_H - 46 - y) / 15)))) {
        const a = txt(RX, y, l.name, 9.5, '#e8f7ff', { strokeThickness: 0 }, right);
        txt(RX + a.width + 8, y, l.text, 9.5, l.on ? '#39ff88' : '#ff8a2a', { strokeThickness: 0 }, right);
        y += 15;
      }
    }
  };

  // 아래 버튼: 계속하기 · 임무 포기
  const button = (x: number, label: string, color: string, act: () => void) => {
    const b = txt(x, VIEW_H - 32, label, 11, color, { backgroundColor: '#120a24', padding: { x: 12, y: 4 }, strokeThickness: 0 }).setOrigin(0, 0.5);
    let armed = false;
    b.setInteractive({ useHandCursor: true });
    b.on('pointerdown', () => (armed = true));
    b.on('pointerout', () => (armed = false));
    b.on('pointerup', () => {
      if (armed) act();
      armed = false;
    });
    return b;
  };
  const go = button(RX, cb.onAbandon ? (en ? 'Resume' : '계속하기') : en ? 'Back' : '돌아가기', '#00f0ff', cb.onResume);
  if (cb.onAbandon) button(go.x + go.width + 8, t('pause.abandon'), '#ff5a6a', cb.onAbandon);

  drawSel();
  drawRight();
  return root;
}
