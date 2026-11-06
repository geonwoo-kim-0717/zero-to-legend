import Phaser from 'phaser';
import { BASE_TEXT, setupCamera } from '../ui/text';
import { Sound } from '../systems/Sound';
import { addMuteToggle, addFullscreenToggle, addLangToggle } from '../ui/MuteToggle';
import { notify } from '../systems/Fullscreen';
import { VIEW_W, VIEW_H, COLORS } from '../config';
import meta from '../data/meta.json';
import weapons from '../data/weapons.json';
import { Save, type RunnerId, type SpecialId, type StatKey, type ClinicId } from '../systems/Save';
import { t as tr, I18n } from '../i18n';
import { Ads } from '../systems/Ads';

type Tab = 'clinic' | 'bar' | 'board' | 'market';
const TABS: Tab[] = ['clinic', 'bar', 'board', 'market'];
const T = (size: number, color = '#e8f7ff') => ({ ...BASE_TEXT, fontSize: `${size}px`, color });
const PX = 156;
const PY = 44;
const PW = VIEW_W - PX - 12;
const PH = 258;
const fmt = (n: number) => Math.floor(n).toLocaleString('ko-KR');
/** 기록 진행도 표시: 시간 기록은 분 단위 */
const progress = (stat: string, cur: number, goal: number) =>
  stat === 'totalTime' || stat === 'bestTime' ? tr('hideout.minutes', { a: Math.min(Math.floor(cur / 60), goal / 60), b: goal / 60 }) : `${fmt(Math.min(cur, goal))}/${fmt(goal)}`;

/** 아지트(로비): 런 사이에 크레딧으로 영구 강화·러너 선택·의뢰 보상 받기 */
export class HideoutScene extends Phaser.Scene {
  private tab: Tab = 'bar';
  private panel!: Phaser.GameObjects.Container;
  private tabsG!: Phaser.GameObjects.Container;
  private credits!: Phaser.GameObjects.Text;
  private summary!: Phaser.GameObjects.Container;
  private hint!: Phaser.GameObjects.Text;

  constructor() {
    super('Hideout');
  }

  create(): void {
    setupCamera(this);
    this.add.image(0, 0, 'hideout').setOrigin(0).setDisplaySize(VIEW_W, VIEW_H);
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x07060f, 0.62).setOrigin(0);
    this.add.text(12, 10, tr('hideout.title'), T(18, '#ff2bd6')).setShadow(0, 0, '#ff2bd6', 8, true, true);
    this.add.text(I18n.lang === 'ko' ? 74 : 108, 16, tr('hideout.sub'), T(11, '#8a7aa8'));
    this.credits = this.add.text(VIEW_W - 12, 8, '', T(16, '#fff23a')).setOrigin(1, 0);
    addLangToggle(this, VIEW_W - 150, 13);
    this.add.rectangle(PX, PY, PW, PH, 0x0d0820, 0.88).setOrigin(0).setStrokeStyle(1, 0x3a2466);
    this.panel = this.add.container(0, 0);
    this.tabsG = this.add.container(0, 0);
    this.summary = this.add.container(0, 0);
    this.hint = this.add.text(PX + 10, PY + PH - 16, '', T(11, '#8a7aa8'));

    // 아래쪽: 설정 버튼 · 지금 러너 · 출격
    addMuteToggle(this, 12, 310, 0);
    addFullscreenToggle(this, 12, 325, 0);
    this.textButton(12, 340, tr('hideout.export'), () => this.exportSave());
    this.textButton(I18n.lang === 'ko' ? 104 : 110, 340, tr('hideout.import'), () => this.importSave());
    const go = this.add.rectangle(VIEW_W - 12, VIEW_H - 10, 132, 36, COLORS.magenta, 0.9).setOrigin(1, 1).setStrokeStyle(2, 0xffffff);
    this.add.text(VIEW_W - 78, VIEW_H - 33, tr('hideout.deploy'), T(16, '#ffffff')).setOrigin(0.5);
    this.add.text(VIEW_W - 78, VIEW_H - 17, 'ENTER', T(10, '#ffd6f6')).setOrigin(0.5);
    go.setInteractive({ useHandCursor: true }).on('pointerup', () => this.deploy());
    go.on('pointerover', () => go.setFillStyle(0xff5ae0, 1));
    go.on('pointerout', () => go.setFillStyle(COLORS.magenta, 0.9));
    this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'scan').setOrigin(0).setDepth(300);

    const kb = this.input.keyboard!;
    kb.on('keydown-ENTER', () => this.deploy());
    if (Ads.provider !== 'crazygames') kb.on('keydown-ESC', () => this.scene.start('Title'));
    TABS.forEach((id, i) => kb.on(`keydown-${['ONE', 'TWO', 'THREE', 'FOUR'][i]}`, () => this.setTab(id)));
    kb.on('keydown-LEFT', () => this.tab === 'bar' && this.cycleRunner(-1));
    kb.on('keydown-RIGHT', () => this.tab === 'bar' && this.cycleRunner(1));

    Sound.duck(1);
    Sound.music('title', 800);
    // 받을 보상이 있으면 의뢰 보드부터 보여준다
    this.tab = Save.claimable() > 0 ? 'board' : 'bar';
    this.refresh();
  }

  // ───────────────────────────── 공통 ─────────────────────────────
  private refresh(): void {
    this.credits.setText(`₵ ${fmt(Save.data.credits)}`);
    this.drawTabs();
    this.panel.removeAll(true);
    this.hint.setText('');
    if (this.tab === 'clinic') this.drawClinic();
    else if (this.tab === 'bar') this.drawBar();
    else if (this.tab === 'board') this.drawBoard();
    else this.drawMarket();
    this.drawSummary();
  }

  private setTab(t: Tab): void {
    if (this.tab === t) return;
    this.tab = t;
    Sound.play('hover');
    this.refresh();
  }

  private drawTabs(): void {
    this.tabsG.removeAll(true);
    TABS.forEach((id, i) => {
      const y = PY + i * 46;
      const on = this.tab === id;
      const bg = this.add.rectangle(12, y, 136, 40, on ? 0x2a1050 : 0x0d0820, on ? 1 : 0.8).setOrigin(0).setStrokeStyle(on ? 2 : 1, on ? COLORS.magenta : 0x3a2466);
      bg.setInteractive({ useHandCursor: true }).on('pointerup', () => this.setTab(id));
      const name = this.add.text(22, y + 5, `${i + 1}  ${tr(`hideout.tab.${id}`)}`, T(13, on ? '#ffffff' : '#c8b8e8'));
      const sub = this.add.text(38, y + 22, tr(`hideout.tab.${id}.sub`), T(11, on ? '#00f0ff' : '#6a5a88'));
      this.tabsG.add([bg, name, sub]);
      const n = id === 'board' ? Save.claimable() : 0;
      if (n > 0) {
        const badge = this.add.text(140, y + 6, `${n}`, { ...T(11, '#07060f'), backgroundColor: '#fff23a', padding: { x: 5, y: 1 }, strokeThickness: 0 }).setOrigin(1, 0);
        this.tabsG.add(badge);
      }
    });
  }

  private drawSummary(): void {
    this.summary.removeAll(true);
    const r = Save.runner();
    const sp = meta.specials[Save.special()];
    const x = 250;
    this.summary.add(this.add.image(x, 330, r.texture).setScale(1.2));
    this.summary.add(this.add.text(x + 24, 316, r.name, T(13)));
    this.summary.add(this.add.text(x + 24, 333, `${weapons[r.startWeapon as keyof typeof weapons].name} · ${sp.name}`, T(11, '#00f0ff')));
  }

  /** 패널 안에 들어가는 버튼. enabled가 false면 흐리게만 그린다 */
  private button(x: number, y: number, w: number, label: string, enabled: boolean, onClick: () => void, color = COLORS.yellow): void {
    const bg = this.add.rectangle(x, y, w, 18, enabled ? color : 0x2a2040, enabled ? 0.95 : 0.8).setOrigin(1, 0);
    const t = this.add.text(x - w / 2, y + 9, label, T(11, enabled ? '#07060f' : '#6a5a88')).setOrigin(0.5).setStroke('#000000', 0);
    this.panel.add([bg, t]);
    if (!enabled) return;
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setAlpha(0.75));
    bg.on('pointerout', () => bg.setAlpha(0.95));
    bg.on('pointerup', onClick);
  }

  private textButton(x: number, y: number, label: string, onClick: () => void): void {
    const t = this.add.text(x, y, label, T(11, '#8a7aa8')).setInteractive({ useHandCursor: true });
    t.on('pointerover', () => t.setColor('#e8f7ff'));
    t.on('pointerout', () => t.setColor('#8a7aa8'));
    t.on('pointerup', onClick);
  }

  private title(text: string, sub: string): void {
    this.panel.add(this.add.text(PX + 10, PY + 8, text, T(14, '#ffffff')));
    this.panel.add(this.add.text(PX + PW - 10, PY + 11, sub, T(11, '#8a7aa8')).setOrigin(1, 0));
  }

  // ───────────────────────────── 리퍼닥 ─────────────────────────────
  /** 글자 폭을 재서 이름 칸 너비를 정한다 (언어마다 이름 길이가 달라서) */
  private measure(texts: string[], size: number): number {
    const probe = this.add.text(0, 0, '', T(size)).setVisible(false);
    const w = Math.max(...texts.map((s) => probe.setText(s).width));
    probe.destroy();
    return w;
  }

  private clinicPipX(): number {
    return PX + 10 + Math.max(80, this.measure(meta.clinic.map((c) => c.name), 12) + 8);
  }

  private boardDescX(): number {
    return PX + 10 + Math.max(90, this.measure(meta.contracts.map((c) => c.name), 11) + 8);
  }

  private drawClinic(): void {
    this.title(tr('clinic.title'), tr('clinic.sub'));
    meta.clinic.forEach((c, i) => {
      const y = PY + 30 + i * 22;
      const pipX = this.clinicPipX();
      const lv = Save.clinicLevel(c.id as ClinicId);
      const max = c.costs.length;
      const v = (n: number) => String(Math.round(n * c.per * 10) / 10);
      this.panel.add(this.add.text(PX + 10, y, c.name, T(12)));
      for (let k = 0; k < max; k++) {
        this.panel.add(this.add.rectangle(pipX + k * 13, y + 4, 10, 9, k < lv ? COLORS.cyan : 0x2a2040).setOrigin(0).setStrokeStyle(1, 0x3a2466));
      }
      const now = lv > 0 ? (c.id === 'revive' ? tr('clinic.owned') : c.desc.replace('{v}', v(lv))) : tr('clinic.none');
      const next = lv < max ? (c.id === 'revive' ? c.desc : c.desc.replace('{v}', v(lv + 1))) : '';
      this.panel.add(this.add.text(pipX + 72, y + 1, lv < max ? `${now}  →  ${next}` : `${now}  ${tr('clinic.max')}`, T(11, lv > 0 ? '#00f0ff' : '#8a7aa8')));
      if (lv >= max) this.button(PX + PW - 10, y, 70, 'MAX', false, () => undefined);
      else {
        const cost = c.costs[lv];
        this.button(PX + PW - 10, y, 70, `₵ ${fmt(cost)}`, Save.data.credits >= cost, () => {
          if (!Save.spend(cost)) return;
          Save.data.clinic[c.id as ClinicId] = lv + 1;
          Save.write();
          Sound.play('levelup');
          this.refresh();
        });
      }
    });
    // 특수 능력: 다른 러너의 능력을 사서 레인독에서 장착
    const y0 = PY + 190;
    this.panel.add(this.add.text(PX + 10, y0, tr('clinic.specials'), T(11, '#c8b8e8')));
    (Object.keys(meta.specials) as SpecialId[]).forEach((id, i) => {
      const sp = meta.specials[id];
      const owned = Save.data.specials.includes(id);
      const x = PX + 10 + i * 114;
      const col = Phaser.Display.Color.HexStringToColor(sp.color).color;
      const chip = this.add.rectangle(x, y0 + 18, 108, 34, 0x140c2a, 1).setOrigin(0).setStrokeStyle(1, owned ? col : 0x3a2466);
      this.panel.add(chip);
      this.panel.add(this.add.text(x + 6, y0 + 21, sp.name, T(11, owned ? sp.color : '#c8b8e8')));
      this.panel.add(this.add.text(x + 6, y0 + 36, owned ? tr('clinic.owned') : tr('clinic.buy', { cost: fmt(sp.cost) }), T(10, owned ? '#39ff88' : Save.data.credits >= sp.cost ? '#fff23a' : '#6a5a88')));
      chip.setInteractive({ useHandCursor: !owned });
      chip.on('pointerover', () => this.hint.setText(`${sp.name}: ${sp.desc}`));
      chip.on('pointerout', () => this.hint.setText(''));
      if (!owned)
        chip.on('pointerup', () => {
          if (!Save.spend(sp.cost)) {
            notify(this, tr('clinic.poor'));
            return;
          }
          Save.data.specials.push(id);
          Save.write();
          Sound.play('levelup');
          this.refresh();
        });
    });
  }

  // ───────────────────────────── 레인독 (러너 선택) ─────────────────────────────
  private drawBar(): void {
    this.title(tr('bar.title'), Save.data.heatMax > 0 ? '' : tr('bar.sub'));
    if (Save.data.heatMax > 0) this.drawHeat();
    meta.runners.forEach((r, i) => {
      const x = PX + 10 + i * 115;
      const y = PY + 30;
      const open = Save.isUnlocked(r);
      const on = Save.data.runner === r.id;
      const card = this.add.rectangle(x, y, 109, 168, on ? 0x2a1050 : 0x140c2a, 1).setOrigin(0).setStrokeStyle(on ? 2 : 1, on ? COLORS.magenta : 0x3a2466);
      this.panel.add(card);
      const img = this.add.image(x + 54, y + 26, r.texture).setScale(1.5);
      if (!open) img.setTint(0x000000).setAlpha(0.7);
      this.panel.add(img);
      let ty = y + 52;
      const line = (s: string, size: number, color: string) => {
        const t = this.add.text(x + 54, ty, s, { ...T(size, color), align: 'center', wordWrap: { width: 100, useAdvancedWrap: true } }).setOrigin(0.5, 0);
        this.panel.add(t);
        ty += t.height + 1;
      };
      line(r.name, 13, open ? '#ffffff' : '#8a7aa8');
      if (open) {
        line(r.concept, 11, '#8a7aa8');
        line(weapons[r.startWeapon as keyof typeof weapons].name, 11, '#00f0ff');
        line(r.trait, 11, '#e8f7ff');
      } else {
        const u = r.unlock!;
        line(tr('bar.locked'), 11, '#ff2a3a');
        line(u.desc, 11, '#c8b8e8');
        const prog = Save.unlockProgress(r);
        this.panel.add(this.add.rectangle(x + 10, y + 148, 89, 5, 0x2a2040).setOrigin(0));
        this.panel.add(this.add.rectangle(x + 10, y + 148, 89 * prog, 5, COLORS.yellow).setOrigin(0));
        const cur = Save.data.stats[u.stat as StatKey];
        const show = progress(u.stat, cur, u.goal);
        this.panel.add(this.add.text(x + 54, y + 155, show, T(10, '#8a7aa8')).setOrigin(0.5, 0));
      }
      card.setInteractive({ useHandCursor: open });
      card.on('pointerup', () => this.pickRunner(r.id as RunnerId));
    });
    // 장착할 특수 능력 고르기: 러너 고유 능력 + 리퍼닥에서 산 능력
    const opts = this.specialOptions();
    const cur = Save.special();
    const sp = meta.specials[cur];
    const y = PY + 206;
    this.panel.add(this.add.text(PX + 10, y + 2, tr('bar.special'), T(12, '#c8b8e8')));
    if (opts.length > 1) {
      this.button(PX + 100, y, 24, '◀', true, () => this.cycleSpecial(-1), COLORS.cyan);
      this.button(PX + 290, y, 24, '▶', true, () => this.cycleSpecial(1), COLORS.cyan);
    }
    this.panel.add(this.add.text(PX + 196, y + 1, sp.name, T(13, sp.color)).setOrigin(0.5, 0));
    this.panel.add(this.add.text(PX + 300, y + 3, opts.length > 1 ? '' : tr('bar.specialHint'), T(10, '#6a5a88')));
    this.panel.add(this.add.text(PX + 10, y + 22, sp.desc, T(11, '#e8f7ff')));
  }

  /** 히트 레벨 고르기 (최종 클리어 뒤 열림): 적이 강해지는 대신 크레딧이 늘어난다 */
  private drawHeat(): void {
    const h = Math.min(Save.data.heat, Save.data.heatMax);
    const x = PX + PW - 10;
    const y = PY + 6;
    this.button(x, y, 20, '▶', h < Save.data.heatMax, () => this.setHeat(h + 1), COLORS.orange);
    this.panel.add(this.add.text(x - 26, y + 1, tr('bar.heat', { n: h }), T(12, h ? '#ff8a1f' : '#c8b8e8')).setOrigin(1, 0));
    this.button(x - 80, y, 20, '◀', h > 0, () => this.setHeat(h - 1), COLORS.orange);
    const label = this.add.text(x - 106, y + 2, '?', T(11, '#8a7aa8')).setOrigin(1, 0).setInteractive();
    label.on('pointerover', () => this.hint.setText(tr('bar.heatHint', { desc: meta.heat.desc })));
    label.on('pointerout', () => this.hint.setText(''));
    this.panel.add(label);
  }

  private setHeat(v: number): void {
    Save.data.heat = Phaser.Math.Clamp(v, 0, Save.data.heatMax);
    Save.write();
    Sound.play('hover');
    this.refresh();
  }

  private specialOptions(): SpecialId[] {
    const own = Save.runner().special as SpecialId;
    return [own, ...Save.data.specials.filter((s) => s !== own)];
  }

  private cycleSpecial(dir: number): void {
    const opts = this.specialOptions();
    const i = (opts.indexOf(Save.special()) + dir + opts.length) % opts.length;
    Save.data.equipped[Save.data.runner] = opts[i];
    Save.write();
    Sound.play('hover');
    this.refresh();
  }

  private pickRunner(id: RunnerId): void {
    const r = Save.runner(id);
    if (!Save.isUnlocked(r)) {
      Sound.play('block');
      notify(this, tr('bar.lockedMsg', { desc: r.unlock?.desc ?? '' }));
      return;
    }
    if (Save.data.runner === id) return;
    Save.data.runner = id;
    Save.write();
    Sound.play('select');
    this.refresh();
  }

  private cycleRunner(dir: number): void {
    const open = meta.runners.filter((r) => Save.isUnlocked(r));
    const i = open.findIndex((r) => r.id === Save.data.runner);
    this.pickRunner(open[(i + dir + open.length) % open.length].id as RunnerId);
  }

  // ───────────────────────────── 의뢰 보드 ─────────────────────────────
  private drawBoard(): void {
    this.title(tr('board.title'), tr('board.sub', { a: meta.contracts.filter((c) => Save.data.claimed.includes(c.id)).length, b: meta.contracts.length }));
    meta.contracts.forEach((c, i) => {
      const y = PY + 28 + i * 19;
      const descX = this.boardDescX();
      const cur = Save.data.stats[c.stat as StatKey];
      const done = cur >= c.goal;
      const claimed = Save.data.claimed.includes(c.id);
      this.panel.add(this.add.text(PX + 10, y, c.name, T(11, claimed ? '#6a5a88' : '#ffffff')));
      this.panel.add(this.add.text(descX, y + 1, c.desc, T(10, claimed ? '#5a4a78' : '#c8b8e8')));
      const show = progress(c.stat, cur, c.goal);
      this.panel.add(this.add.text(PX + PW - 88, y + 1, show, T(10, done ? '#39ff88' : '#8a7aa8')).setOrigin(1, 0));
      if (claimed) this.button(PX + PW - 10, y, 74, tr('board.done'), false, () => undefined);
      else
        this.button(PX + PW - 10, y, 74, done ? tr('board.claim', { n: fmt(c.reward) }) : `₵ ${fmt(c.reward)}`, done, () => {
          if (Save.claim(c.id)) {
            Sound.play('levelup');
            this.refresh();
          }
        });
    });
  }

  // ───────────────────────────── 블랙마켓 ─────────────────────────────
  private drawMarket(): void {
    const prices = meta.market.prices as Record<string, number>;
    const ids = Object.keys(prices);
    const owned = ids.filter((id) => Save.data.market.includes(id)).length;
    this.title(tr('market.title'), tr('market.sub', { a: owned, b: ids.length }));
    ids.forEach((id, i) => {
      const w = weapons[id as keyof typeof weapons];
      const have = Save.data.market.includes(id);
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = PX + 10 + col * 232;
      const y = PY + 30 + row * 57;
      const off = have && Save.data.marketOff.includes(id);
      this.panel.add(this.add.rectangle(x, y, 226, 54, have && !off ? 0x1a1040 : 0x140c2a, 1).setOrigin(0).setStrokeStyle(1, have && !off ? COLORS.cyan : 0x3a2466));
      this.panel.add(this.add.image(x + 18, y + 27, `icon_${id}`).setScale(2).setAlpha(off ? 0.35 : 1));
      this.panel.add(this.add.text(x + 36, y + 5, w.name, T(12, off ? '#6a5a88' : have ? '#00f0ff' : '#ffffff')));
      this.panel.add(this.add.text(x + 36, y + 22, w.desc, { ...T(10, off ? '#6a5a88' : '#c8b8e8'), wordWrap: { width: 182, useAdvancedWrap: true } }));
      if (have)
        // 산 무기는 켜고 끌 수 있다: 꺼 두면 레벨업 카드에 나오지 않음
        this.button(x + 220, y + 4, 66, off ? tr('market.off') : tr('market.on'), true, () => this.toggleMarket(id), off ? 0x8a7aa8 : COLORS.green);
      else
        this.button(x + 220, y + 4, 66, `₵ ${fmt(prices[id])}`, Save.data.credits >= prices[id], () => {
          if (!Save.spend(prices[id])) return;
          Save.data.market.push(id);
          Save.data.stats.marketBuys++;
          Save.write();
          Sound.play('levelup');
          this.refresh();
        });
    });
  }

  private toggleMarket(id: string): void {
    const off = Save.data.marketOff;
    const i = off.indexOf(id);
    if (i >= 0) off.splice(i, 1);
    else off.push(id);
    Save.write();
    Sound.play(i >= 0 ? 'select' : 'hover');
    this.refresh();
  }

  // ───────────────────────────── 저장 코드 · 출격 ─────────────────────────────
  private exportSave(): void {
    const code = Save.exportCode();
    const fallback = () => {
      try {
        window.prompt(tr('save.promptExport'), code);
      } catch {
        notify(this, tr('save.copyBlocked'));
      }
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).then(() => notify(this, tr('save.copied')), fallback);
    else fallback();
  }

  private importSave(): void {
    let code: string | null = null;
    try {
      code = window.prompt(tr('save.promptImport'));
    } catch {
      notify(this, tr('save.importBlocked'));
      return;
    }
    if (!code) return;
    if (Save.importCode(code)) {
      notify(this, tr('save.imported'));
      this.refresh();
    } else notify(this, tr('save.bad'));
  }

  private deploy(): void {
    if (!Save.isUnlocked(Save.runner())) Save.data.runner = 'zero';
    Sound.play('start');
    this.scene.start('Game');
  }
}
