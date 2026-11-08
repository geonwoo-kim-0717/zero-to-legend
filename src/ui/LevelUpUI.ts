import Phaser from 'phaser';
import { BASE_TEXT } from './text';
import { Sound } from '../systems/Sound';
import { Settings } from '../systems/Settings';
import { VIEW_W, VIEW_H } from '../config';
import type { Choice } from '../systems/Progression';
import { t } from '../i18n';

const CW = 176;
const CH = 236;
const GAP = 16;
const TOP = 60;

/** 레벨업 3택 1 화면. 키보드(1·2·3, R)와 클릭/터치 모두 지원.
 *  전설·신화 카드는 늦게 뒤집히며 등장: 화면 번쩍임, 흔들림, 뒤에서 도는 빛줄기, 반짝이, 빛나는 테두리 */
export class LevelUpUI {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private tweens: Phaser.Tweens.Tween[] = [];
  private timers: Phaser.Time.TimerEvent[] = [];
  private keyHandler?: (e: KeyboardEvent) => void;
  /** 전설·신화 카드가 다 뒤집히기 전에는 고를 수 없게 (실수로 넘기지 않도록) */
  private lockUntil = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  get open(): boolean {
    return this.objs.length > 0;
  }

  show(choices: Choice[], rerolls: number, onPick: (i: number) => void, onReroll: () => void, title = 'LEVEL UP'): void {
    this.hide();
    const s = this.scene;
    const calm = Settings.reducedFx;
    const add = <T extends Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T, depth = 300): T => {
      o.setScrollFactor(0).setDepth(depth);
      this.objs.push(o);
      return o;
    };
    const tw = (cfg: Phaser.Types.Tweens.TweenBuilderConfig) => {
      const x = s.tweens.add(cfg);
      this.tweens.push(x);
      return x;
    };

    const best = choices.some((c) => c.rarity.id === 'mythic') ? 'mythic' : choices.some((c) => c.rarity.ability) ? 'legendary' : null;
    const dim = add(s.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x000000, 0.65).setOrigin(0));
    // 신화가 있으면 붉게, 전설이면 금빛으로 바탕이 숨 쉰다
    if (best && !calm) {
      dim.setFillStyle(best === 'mythic' ? 0x2a0008 : 0x1a1400, 0.72);
      tw({ targets: dim, alpha: 0.85, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    add(
      s.add
        .text(VIEW_W / 2, 46, title, { ...BASE_TEXT, fontSize: '20px', color: title === 'LEVEL UP' ? '#39ff88' : '#fff23a' })
        .setOrigin(0.5)
        .setShadow(0, 0, '#39ff88', 8, true, true),
    );

    const cards: { bg: Phaser.GameObjects.Rectangle; box: Phaser.GameObjects.Container; c: Choice; x: number }[] = [];
    let bottom = 0;
    const x0 = VIEW_W / 2 - (choices.length * CW + (choices.length - 1) * GAP) / 2;
    choices.forEach((c, i) => {
      const x = x0 + i * (CW + GAP);
      const col = Phaser.Display.Color.HexStringToColor(c.rarity.color).color;
      // 카드 묶음은 가운데 기준 (뒤집기·튀어 오르기를 위해)
      const box = add(s.add.container(x + CW / 2, TOP + CH / 2), 301);
      const L = (o: Phaser.GameObjects.GameObject) => (box.add(o), o);
      const ox = -CW / 2;
      const oy = -CH / 2;
      const bg = L(s.add.rectangle(ox, oy, CW, CH, 0x120a24, 0.95).setOrigin(0).setStrokeStyle(2, col)) as Phaser.GameObjects.Rectangle;
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => {
        bg.setFillStyle(0x23123f, 0.95);
        Sound.play('hover');
      });
      bg.on('pointerout', () => bg.setFillStyle(0x120a24, 0.95));
      bg.on('pointerup', () => this.tryPick(i, onPick));

      L(s.add.text(ox + 8, oy + 8, `[${i + 1}]`, { ...BASE_TEXT, fontSize: '11px', color: '#8a7aa8' }));
      L(s.add.text(ox + CW - 8, oy + 8, c.rarity.label, { ...BASE_TEXT, fontSize: '11px', color: c.rarity.color }).setOrigin(1, 0));
      const kind = t(c.kind === 'weapon' ? 'lvl.kind.weapon' : c.kind === 'passive' ? 'lvl.kind.passive' : 'lvl.kind.overflow');
      L(s.add.text(0, oy + 8, kind, { ...BASE_TEXT, fontSize: '11px', color: '#8a7aa8' }).setOrigin(0.5, 0));
      const img = s.textures.exists(`card_${c.id}`) ? `card_${c.id}` : s.textures.exists(`icon_${c.id}`) ? `icon_${c.id}` : null;
      L(s.add.rectangle(0, oy + 50, 56, 56, 0x07060f, 0.9).setStrokeStyle(1, col, 0.7));
      if (img) {
        const pic = L(s.add.image(0, oy + 50, img)) as Phaser.GameObjects.Image;
        pic.setScale(Math.min(48 / pic.width, 48 / pic.height));
      }
      L(s.add.text(0, oy + 92, c.title, { ...BASE_TEXT, fontSize: '16px', color: c.rarity.color }).setOrigin(0.5));
      L(s.add.text(0, oy + 112, c.levelLabel, { ...BASE_TEXT, fontSize: '11px', color: c.isNew ? '#fff23a' : '#39ff88' }).setOrigin(0.5));
      const descText = L(
        s.add
          .text(0, oy + 128, c.desc, { ...BASE_TEXT, fontSize: '12px', color: '#e8f7ff', align: 'center', wordWrap: { width: CW - 16, useAdvancedWrap: true } })
          .setOrigin(0.5, 0),
      ) as Phaser.GameObjects.Text;
      bottom = Math.max(bottom, TOP + CH / 2 + descText.y + descText.height);
      if (c.ability) {
        const sepY = Math.max(oy + 160, descText.y + descText.height + 6);
        L(s.add.rectangle(ox + 10, sepY, CW - 20, 1, col, 0.6).setOrigin(0));
        const ab = L(
          s.add
            .text(0, sepY + 6, `★ ${c.ability.name}\n${c.ability.desc}`, {
              ...BASE_TEXT,
              fontSize: '11px',
              color: c.rarity.color,
              align: 'center',
              lineSpacing: 1,
              wordWrap: { width: CW - 16, useAdvancedWrap: true },
            })
            .setOrigin(0.5, 0),
        ) as Phaser.GameObjects.Text;
        bottom = Math.max(bottom, TOP + CH / 2 + ab.y + ab.height);
      }
      cards.push({ bg, box, c, x });
    });

    // 글이 긴 카드가 있으면 모든 카드를 같은 높이로 늘린다
    const cardBottom = Math.max(TOP + CH, bottom + 8);
    const h = cardBottom - TOP;
    for (const { bg } of cards) {
      bg.height = h;
      bg.setSize(CW, h);
      bg.input!.hitArea.setTo(0, 0, CW, h);
    }

    // ── 등장 연출 ──
    let lock = 0;
    let specialIdx = 0;
    cards.forEach(({ box, c, x }, i) => {
      if (calm) return;
      if (!c.rarity.ability) {
        // 일반 카드: 아래에서 살짝 튀어 오름
        box.setAlpha(0).setY(box.y + 14);
        tw({ targets: box, alpha: 1, y: box.y - 14, duration: 180, delay: i * 70, ease: 'Back.out' });
        return;
      }
      const mythic = c.rarity.id === 'mythic';
      const delay = 380 + specialIdx++ * 420;
      lock = Math.max(lock, delay + 260);
      this.special(box, c, x, h, mythic, delay, add, tw);
    });
    this.lockUntil = s.time.now + lock;

    if (rerolls > 0) {
      const btn = add(
        s.add
          .text(VIEW_W / 2, Math.min(VIEW_H - 18, cardBottom + 20), t('lvl.reroll', { n: rerolls }), {
            ...BASE_TEXT,
            fontSize: '12px',
            color: '#00f0ff',
            backgroundColor: '#120a24',
            padding: { x: 10, y: 6 },
          })
          .setOrigin(0.5),
      );
      btn.setInteractive({ useHandCursor: true }).on('pointerup', () => s.time.now >= this.lockUntil && onReroll());
    }

    this.keyHandler = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= choices.length) this.tryPick(n - 1, onPick);
      else if ((e.key === 'r' || e.key === 'R') && rerolls > 0 && s.time.now >= this.lockUntil) onReroll();
    };
    s.input.keyboard!.on('keydown', this.keyHandler);
  }

  private tryPick(i: number, onPick: (i: number) => void): void {
    if (this.scene.time.now < this.lockUntil) return;
    onPick(i);
  }

  /** 전설·신화 카드: 뒷면으로 기다렸다가 번쩍이며 뒤집힘 → 빛줄기·반짝이·빛나는 테두리 */
  private special(
    box: Phaser.GameObjects.Container,
    c: Choice,
    x: number,
    h: number,
    mythic: boolean,
    delay: number,
    add: <T extends Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T, depth?: number) => T,
    tw: (cfg: Phaser.Types.Tweens.TweenBuilderConfig) => Phaser.Tweens.Tween,
  ): void {
    const s = this.scene;
    const col = Phaser.Display.Color.HexStringToColor(c.rarity.color).color;
    const cx = x + CW / 2;
    const cy = TOP + h / 2;

    // 뒷면: 카드 크기의 어두운 판에 물음표, 살짝 떨림
    const back = add(s.add.container(cx, cy), 302);
    back.add(s.add.rectangle(0, 0, CW, h, 0x07060f, 1).setStrokeStyle(2, col));
    back.add(s.add.rectangle(0, 0, CW - 16, h - 16, mythic ? 0x2a0010 : 0x2a2200, 1).setStrokeStyle(1, col, 0.5));
    back.add(s.add.text(0, 0, '?', { ...BASE_TEXT, fontSize: '54px', color: c.rarity.color }).setOrigin(0.5));
    box.setScale(0, 1);
    tw({ targets: back, x: cx + 1.5, duration: 40, yoyo: true, repeat: Math.floor(delay / 80) });
    tw({ targets: back, scaleX: 1.04, scaleY: 1.04, duration: delay * 0.5, yoyo: true });

    // 뒤에서 도는 빛줄기
    const rays = add(s.add.graphics({ x: cx, y: cy }), 300);
    const n = mythic ? 16 : 12;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      rays.fillStyle(k % 2 ? col : 0xffffff, mythic ? 0.22 : 0.16);
      rays.fillTriangle(0, 0, Math.cos(a - 0.09) * 230, Math.sin(a - 0.09) * 230, Math.cos(a + 0.09) * 230, Math.sin(a + 0.09) * 230);
    }
    rays.setAlpha(0).setScale(0.3);

    // 빛나는 테두리 (밖으로 숨 쉼)
    const glow = add(s.add.rectangle(cx, cy, CW + 8, h + 8).setStrokeStyle(4, col, 0.9), 300);
    glow.setAlpha(0);

    // 위에 붙는 큰 글자
    const label = add(
      s.add
        .text(cx, TOP - 4, mythic ? 'MYTHIC!!' : 'LEGENDARY!', { ...BASE_TEXT, fontSize: '15px', color: c.rarity.color })
        .setOrigin(0.5, 1)
        .setShadow(0, 0, c.rarity.color, 10, true, true),
      303,
    );
    label.setScale(0);

    // 반짝이
    const sparks = add(
      s.add.particles(cx, cy, 'spark', {
        x: { min: -CW / 2, max: CW / 2 },
        y: { min: -h / 2, max: h / 2 },
        lifespan: 900,
        speedY: { min: -40, max: -10 },
        scale: { start: 1.2, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: mythic ? [0xff2a3a, 0xfff23a, 0xff2bd6, 0xffffff] : [0xfff23a, 0xffffff, 0xffd060],
        frequency: mythic ? 45 : 70,
        emitting: false,
      }),
      303,
    );

    // 번쩍임 (뒤집히는 순간)
    const flash = add(s.add.rectangle(cx, cy, CW, h, 0xffffff, 1), 304);
    flash.setAlpha(0);

    // 지나가는 빛 (카드 위를 비스듬히 훑음)
    const shine = add(s.add.rectangle(cx - CW, cy, 18, h + 30, 0xffffff, 0.22).setAngle(18), 302);
    const mask = s.make.graphics({}).fillRect(cx - CW / 2, cy - h / 2, CW, h);
    mask.setScrollFactor(0);
    shine.setMask(mask.createGeometryMask());
    this.objs.push(mask);
    shine.setVisible(false);

    const flip = s.time.delayedCall(delay, () => {
      Sound.play(mythic ? 'mythic' : 'legendary');
      s.cameras.main.shake(mythic ? 320 : 200, mythic ? 0.008 : 0.004);
      tw({ targets: back, scaleX: 0, duration: 110, ease: 'Quad.in', onComplete: () => back.setVisible(false) });
      tw({ targets: box, scaleX: 1.12, scaleY: 1.12, duration: 160, delay: 100, ease: 'Back.out', onComplete: () => tw({ targets: box, scaleX: 1, scaleY: 1, duration: 140 }) });
      flash.setAlpha(0.9);
      tw({ targets: flash, alpha: 0, duration: 380, delay: 110 });
      tw({ targets: rays, alpha: 1, scale: 1, duration: 300, delay: 100, ease: 'Quad.out' });
      tw({ targets: rays, angle: 360, duration: mythic ? 5000 : 8000, repeat: -1 });
      tw({ targets: rays, alpha: 0.55, duration: 600, delay: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      tw({ targets: label, scale: 1, duration: 260, delay: 140, ease: 'Back.out' });
      tw({ targets: label, y: TOP - 8, duration: 500, delay: 400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      glow.setAlpha(1);
      tw({ targets: glow, scaleX: 1.04, scaleY: 1.03, alpha: 0.35, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      sparks.start();
      sparks.explode(mythic ? 40 : 24);
      shine.setVisible(true);
      tw({ targets: shine, x: cx + CW, duration: 650, delay: 200, repeat: -1, repeatDelay: 1300 });
      // 신화: 테두리 색이 빨강·금·자홍으로 돈다
      if (mythic) {
        const cols = [0xff2a3a, 0xfff23a, 0xff2bd6];
        let k = 0;
        const cyc = s.time.addEvent({
          delay: 160,
          loop: true,
          callback: () => {
            k = (k + 1) % cols.length;
            glow.setStrokeStyle(4, cols[k], 0.9);
          },
        });
        this.timers.push(cyc);
      }
    });
    this.timers.push(flip);
  }

  /** 전설·신화 카드를 고른 순간: 화면 가운데 큰 글자와 팡파르 */
  static celebrate(scene: Phaser.Scene, c: Choice): void {
    if (!c.ability) return;
    const mythic = c.rarity.id === 'mythic';
    Sound.play('jackpot');
    if (Settings.reducedFx) return;
    const col = c.rarity.color;
    const y = VIEW_H * 0.38;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const band = scene.add.rectangle(VIEW_W / 2, y, VIEW_W, 56, 0x000000, 0.6).setScrollFactor(0).setDepth(320);
    const big = scene.add
      .text(VIEW_W / 2, y - 8, `★ ${mythic ? 'MYTHIC' : 'LEGENDARY'} ★`, { ...BASE_TEXT, fontSize: '22px', color: col })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(321)
      .setShadow(0, 0, col, 12, true, true);
    const name = scene.add
      .text(VIEW_W / 2, y + 16, `${c.title} · ${c.ability.name}`, { ...BASE_TEXT, fontSize: '12px', color: '#ffffff' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(321);
    objs.push(band, big, name);
    band.setScale(1, 0);
    big.setScale(2.2).setAlpha(0);
    scene.tweens.add({ targets: band, scaleY: 1, duration: 140 });
    scene.tweens.add({ targets: big, scale: 1, alpha: 1, duration: 260, ease: 'Back.out' });
    const sparks = scene.add
      .particles(VIEW_W / 2, y, 'spark', {
        speed: { min: 120, max: 320 },
        angle: { min: 0, max: 360 },
        lifespan: 800,
        scale: { start: 1.5, end: 0 },
        tint: mythic ? [0xff2a3a, 0xfff23a, 0xff2bd6] : [0xfff23a, 0xffffff],
        emitting: false,
      })
      .setScrollFactor(0)
      .setDepth(322);
    sparks.explode(mythic ? 60 : 36);
    objs.push(sparks);
    scene.cameras.main.flash(180, mythic ? 255 : 255, mythic ? 60 : 230, mythic ? 80 : 120);
    scene.time.delayedCall(1300, () =>
      scene.tweens.add({
        targets: [band, big, name],
        alpha: 0,
        duration: 300,
        onComplete: () => objs.forEach((o) => o.destroy()),
      }),
    );
  }

  hide(): void {
    for (const x of this.tweens) x.remove();
    for (const x of this.timers) x.remove();
    this.tweens = [];
    this.timers = [];
    for (const o of this.objs) o.destroy();
    this.objs = [];
    if (this.keyHandler) this.scene.input.keyboard!.off('keydown', this.keyHandler);
    this.keyHandler = undefined;
  }
}
