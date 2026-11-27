import Phaser from 'phaser';
import { BASE_TEXT, setupCamera } from '../ui/text';
import { Sound } from '../systems/Sound';
import { addMuteToggle, addFxToggle, addFullscreenToggle, addLangToggle } from '../ui/MuteToggle';
import { isTouch, enterFullscreen, isEmbedded } from '../systems/Fullscreen';
import { VIEW_W, VIEW_H } from '../config';
import { t, I18n } from '../i18n';
import { Ads } from '../systems/Ads';
import { makeGlitchLogo, TITLE_SIGNS } from '../ui/TitleArt';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    setupCamera(this);
    // 시작 화면 (UI 세션, 사용자 선택: 새 그림 + 글리치 로고 C + 효과)
    // 그림은 1280×720이라 0.5배로 그림 (카메라 2배 → 화면 픽셀 그대로)
    const H2 = 0.5;
    const hasArt = this.textures.exists('title_bg');
    if (hasArt) {
      this.add.image(0, 0, 'title_bg').setOrigin(0).setScale(H2);
      // 네온 숨쉬기: 밝은 간판 빛만 더해 천천히 밝아졌다 어두워짐
      const glow = this.add.image(0, 0, 'title_glow').setOrigin(0).setScale(H2).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.2);
      this.tweens.add({ targets: glow, alpha: 0.5, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      // 간판 깜빡임: 간판 하나가 가끔 몇 번 껌뻑 꺼짐 (배경 그림의 그 자리를 어둡게 덮음)
      const offs = TITLE_SIGNS.map(([x0, y0, x1, y1]) =>
        this.add.image(0, 0, 'title_bg').setOrigin(0).setScale(H2).setCrop(x0, y0, x1 - x0, y1 - y0).setTint(0x2a2440).setVisible(false),
      );
      const flicker = () => {
        const o = Phaser.Utils.Array.GetRandom(offs);
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n * 2; i++) this.time.delayedCall(i * (50 + Math.random() * 60), () => o.setVisible(i % 2 === 0));
        this.time.delayedCall(n * 2 * 110, () => o.setVisible(false));
        this.time.delayedCall(1200 + Math.random() * 2600, flicker);
      };
      this.time.delayedCall(900, flicker);
    } else this.add.image(0, 0, 'hideout').setOrigin(0).setDisplaySize(VIEW_W, VIEW_H);
    // 비 (게임 판과 같은 그림, 사선으로 흐름)
    const rain = this.textures.exists('rain') ? this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'rain').setOrigin(0).setAlpha(0.55) : null;
    if (hasArt) {
      // 주인공: 아주 천천히 숨쉬듯 들썩임, 테두리 빛은 따로 맥박 (PC는 마우스 쪽으로 살짝 시차)
      const hero = this.add.image(0, VIEW_H, 'title_hero').setOrigin(0, 1).setScale(H2);
      const rim = this.add.image(0, VIEW_H, 'title_rim').setOrigin(0, 1).setScale(H2).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.3);
      this.tweens.add({ targets: [hero, rim], y: VIEW_H + 1.5, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.tweens.add({ targets: rim, alpha: 0.85, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
        if (p.wasTouch) return;
        const k = p.x / (VIEW_W * 2) - 0.5;
        hero.setX(-4 - k * 6);
        rim.setX(hero.x);
      });
      hero.setX(-4);
      rim.setX(-4);
    }
    // 아래쪽은 글자가 잘 읽히게 어둡게
    const shade = this.add.graphics();
    shade.fillGradientStyle(0x07060f, 0x07060f, 0x07060f, 0x07060f, 0, 0, 0.85, 0.85).fillRect(0, VIEW_H - 120, VIEW_W, 120);

    // 로고: 오른쪽 위 비어 있는 하늘. 가끔 지직거림
    const lang = I18n.lang === 'ko' ? 'ko' : 'en';
    const base = makeGlitchLogo(this, lang);
    const lx = VIEW_W - 30;
    const logo = this.add.image(lx, 26, `${base}_0`).setOrigin(1, 0).setScale(0.5);
    const maxW = 300;
    if (logo.displayWidth > maxW) logo.setScale((0.5 * maxW) / logo.displayWidth);
    const ls = logo.scale;
    const lcx = lx - logo.displayWidth / 2;
    const glitch = () => {
      const frames = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < frames; i++)
        this.time.delayedCall(i * 55, () => logo.setTexture(`${base}_${1 + Math.floor(Math.random() * 3)}`).setX(lx + (Math.random() - 0.5) * 6));
      this.time.delayedCall(frames * 55, () => logo.setTexture(`${base}_0`).setX(lx).setScale(ls));
      this.time.delayedCall(2200 + Math.random() * 3200, glitch);
    };
    this.time.delayedCall(1500, glitch);
    this.add
      .text(lcx, logo.y + logo.displayHeight + 6, t('title.tagline'), { ...BASE_TEXT, fontSize: '12px', color: '#00f0ff' })
      .setOrigin(0.5, 0)
      .setShadow(0, 0, '#00f0ff', 6, true, true);
    const start = this.add
      .text(lcx, VIEW_H - 74, isTouch() ? t('title.start.touch') : t('title.start.desktop'), { ...BASE_TEXT, fontSize: '15px', color: '#ffffff' })
      .setOrigin(0.5);
    this.tweens.add({ targets: start, alpha: 0.25, duration: 700, yoyo: true, repeat: -1 });
    this.add
      .text(VIEW_W - 10, VIEW_H - 8, Ads.provider === 'crazygames' ? t('title.help.portal') : t('title.help'), {
        ...BASE_TEXT,
        fontSize: '9px',
        color: '#a898c8',
        align: 'right',
        lineSpacing: 1,
        wordWrap: { width: 420, useAdvancedWrap: true },
      })
      .setOrigin(1, 1);
    this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'scan').setOrigin(0);
    // 빌드 번호 (버그 제보 때 어느 빌드인지 확인용)
    this.add.text(6, 5, __BUILD__, { ...BASE_TEXT, fontSize: '8px', color: '#8a7aa8' }).setOrigin(0, 0).setAlpha(0.7);
    if (rain) this.events.on('update', (_t: number, dt: number) => {
      rain.tilePositionX -= dt * 0.06;
      rain.tilePositionY -= dt * 0.35;
    });

    Sound.music('title');
    // 오른쪽 위는 로고 자리라 설정 글자는 왼쪽 아래(주인공 코트 위, 어두운 곳)
    const mute = addMuteToggle(this, 10, VIEW_H - 80, 0);
    const fxBtn = addFxToggle(this, 10, VIEW_H - 62, 0);
    const fsBtn = addFullscreenToggle(this, 10, VIEW_H - 44, 0);
    const langBtn = addLangToggle(this, 10, Ads.provider === 'crazygames' ? VIEW_H - 44 : VIEW_H - 26, 0);
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      Sound.play('start');
      this.scene.start('Hideout');
    };
    this.input.keyboard!.once('keydown-ENTER', go);
    this.input.keyboard!.once('keydown-SPACE', go);
    // 소리 버튼을 누른 것은 게임 시작으로 치지 않는다
    const onUp = (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.includes(mute) || over.includes(fxBtn) || over.includes(fsBtn) || over.includes(langBtn)) this.input.once('pointerup', onUp);
      else {
        // 모바일: 탭해서 시작하면 바로 전체화면 + 가로 고정
        // 앱 속 웹 화면·iframe(아티팩트 등)에서는 자동 전체화면을 걸지 않는다 (화면 멈춤 방지)
        if (isTouch() && !isEmbedded() && !this.scale.isFullscreen && Ads.provider !== 'crazygames') enterFullscreen(this);
        go();
      }
    };
    this.input.once('pointerup', onUp);
  }
}
