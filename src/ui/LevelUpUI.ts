import Phaser from 'phaser';
import { BASE_TEXT } from './text';
import { Sound } from '../systems/Sound';
import { VIEW_W, VIEW_H } from '../config';
import type { Choice } from '../systems/Progression';
import { t } from '../i18n';


/** 레벨업 3택 1 화면. 키보드(1·2·3, R)와 클릭/터치 모두 지원 */
export class LevelUpUI {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private keyHandler?: (e: KeyboardEvent) => void;

  constructor(private readonly scene: Phaser.Scene) {}

  get open(): boolean {
    return this.objs.length > 0;
  }

  show(choices: Choice[], rerolls: number, onPick: (i: number) => void, onReroll: () => void, title = 'LEVEL UP'): void {
    this.hide();
    const s = this.scene;
    const add = <T extends Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T): T => {
      o.setScrollFactor(0).setDepth(300);
      this.objs.push(o);
      return o;
    };

    add(s.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x000000, 0.65).setOrigin(0));
    add(
      s.add
        .text(VIEW_W / 2, 46, title, { ...BASE_TEXT, fontSize: '20px', color: title === 'LEVEL UP' ? '#39ff88' : '#fff23a' })
        .setOrigin(0.5)
        .setShadow(0, 0, '#39ff88', 8, true, true),
    );

    const cw = 176;
    const ch = 214;
    const gap = 16;
    const x0 = VIEW_W / 2 - (choices.length * cw + (choices.length - 1) * gap) / 2;
    choices.forEach((c, i) => {
      const x = x0 + i * (cw + gap);
      const y = 64;
      const col = Phaser.Display.Color.HexStringToColor(c.rarity.color).color;
      const card = add(s.add.rectangle(x, y, cw, ch, 0x120a24, 0.95).setOrigin(0).setStrokeStyle(2, col));
      card.setInteractive({ useHandCursor: true });
      card.on('pointerover', () => {
        card.setFillStyle(0x23123f, 0.95);
        Sound.play('hover');
      });
      card.on('pointerout', () => card.setFillStyle(0x120a24, 0.95));
      card.on('pointerup', () => onPick(i));

      add(s.add.text(x + 8, y + 8, `[${i + 1}]`, { ...BASE_TEXT, fontSize: '11px', color: '#8a7aa8' }));
      add(
        s.add
          .text(x + cw - 8, y + 8, c.rarity.label, { ...BASE_TEXT, fontSize: '11px', color: c.rarity.color })
          .setOrigin(1, 0),
      );
      const kind = t(c.kind === 'weapon' ? 'lvl.kind.weapon' : c.kind === 'passive' ? 'lvl.kind.passive' : 'lvl.kind.overflow');
      add(s.add.text(x + cw / 2, y + 34, kind, { ...BASE_TEXT, fontSize: '11px', color: '#8a7aa8' }).setOrigin(0.5));
      add(
        s.add
          .text(x + cw / 2, y + 54, c.title, { ...BASE_TEXT, fontSize: '16px', color: c.rarity.color })
          .setOrigin(0.5),
      );
      add(
        s.add
          .text(x + cw / 2, y + 76, c.levelLabel, {
            ...BASE_TEXT,
            fontSize: '11px',
            color: c.isNew ? '#fff23a' : '#39ff88',
          })
          .setOrigin(0.5),
      );
      add(
        s.add
          .text(x + cw / 2, y + 100, c.desc, {
            ...BASE_TEXT,
            fontSize: '12px',
            color: '#e8f7ff',
            align: 'center',
            wordWrap: { width: cw - 16, useAdvancedWrap: true },
          })
          .setOrigin(0.5, 0),
      );
      // 전설·신화: 특수 능력
      if (c.ability) {
        add(s.add.rectangle(x + 10, y + 140, cw - 20, 1, col, 0.6).setOrigin(0));
        add(
          s.add
            .text(x + cw / 2, y + 148, `★ ${c.ability.name}\n${c.ability.desc}`, {
              ...BASE_TEXT,
              fontSize: '11px',
              color: c.rarity.color,
              align: 'center',
              lineSpacing: 2,
              wordWrap: { width: cw - 16, useAdvancedWrap: true },
            })
            .setOrigin(0.5, 0),
        );
      }
    });

    if (rerolls > 0) {
      const btn = add(
        s.add
          .text(VIEW_W / 2, 314, t('lvl.reroll', { n: rerolls }), {
            ...BASE_TEXT,
            fontSize: '12px',
            color: '#00f0ff',
            backgroundColor: '#120a24',
            padding: { x: 10, y: 6 },
          })
          .setOrigin(0.5),
      );
      btn.setInteractive({ useHandCursor: true }).on('pointerup', onReroll);
    }

    this.keyHandler = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= choices.length) onPick(n - 1);
      else if ((e.key === 'r' || e.key === 'R') && rerolls > 0) onReroll();
    };
    s.input.keyboard!.on('keydown', this.keyHandler);
  }

  hide(): void {
    for (const o of this.objs) o.destroy();
    this.objs = [];
    if (this.keyHandler) this.scene.input.keyboard!.off('keydown', this.keyHandler);
    this.keyHandler = undefined;
  }
}
