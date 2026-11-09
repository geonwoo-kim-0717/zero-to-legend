import Phaser from 'phaser';
import { BASE_TEXT, setupCamera } from '../ui/text';
import { Sound } from '../systems/Sound';
import { addMuteToggle, addFxToggle, addFullscreenToggle, addLangToggle } from '../ui/MuteToggle';
import { isTouch, enterFullscreen } from '../systems/Fullscreen';
import { VIEW_W, VIEW_H } from '../config';
import { t, I18n } from '../i18n';
import { Ads } from '../systems/Ads';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    setupCamera(this);
    // 배경: 아지트(도크 9)와 같은 장면, 그 위에 언어별 로고 배너
    this.add.image(0, 0, 'hideout').setOrigin(0).setDisplaySize(VIEW_W, VIEW_H);
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x07060f, 0.35).setOrigin(0);
    const logoKey = I18n.lang === 'ko' ? 'title_ko' : 'title_en';
    if (this.textures.exists(logoKey)) {
      const logo = this.add.image(VIEW_W / 2, 96, logoKey);
      logo.setScale(Math.min(1, (VIEW_W - 40) / logo.width));
    } else
      this.add
        .text(VIEW_W / 2, 110, 'ZERO TO LEGEND', { ...BASE_TEXT, fontSize: '40px', color: '#ff2bd6' })
        .setOrigin(0.5)
        .setShadow(0, 0, '#ff2bd6', 14, true, true);
    // 아래쪽 글자가 배경에 묻히지 않게 어두운 띠
    this.add.rectangle(0, 176, VIEW_W, VIEW_H - 176, 0x07060f, 0.55).setOrigin(0);
    this.add
      .text(VIEW_W / 2, 190, t('title.tagline'), { ...BASE_TEXT, fontSize: '13px', color: '#00f0ff' })
      .setOrigin(0.5);
    const start = this.add
      .text(VIEW_W / 2, 236, isTouch() ? t('title.start.touch') : t('title.start.desktop'), { ...BASE_TEXT, fontSize: '15px', color: '#ffffff' })
      .setOrigin(0.5);
    this.tweens.add({ targets: start, alpha: 0.25, duration: 700, yoyo: true, repeat: -1 });
    this.add
      .text(VIEW_W / 2, 300, Ads.provider === 'crazygames' ? t('title.help.portal') : t('title.help'), {
        ...BASE_TEXT,
        fontSize: '11px',
        color: '#8a7aa8',
        align: 'center',
      })
      .setOrigin(0.5);
    this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'scan').setOrigin(0);

    Sound.music('title');
    const mute = addMuteToggle(this, VIEW_W - 10, 10);
    const fxBtn = addFxToggle(this, VIEW_W - 10, 28);
    const fsBtn = addFullscreenToggle(this, VIEW_W - 10, 46);
    const langBtn = addLangToggle(this, VIEW_W - 10, Ads.provider === 'crazygames' ? 46 : 64);
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
        if (isTouch() && !this.scale.isFullscreen && Ads.provider !== 'crazygames') enterFullscreen(this);
        go();
      }
    };
    this.input.once('pointerup', onUp);
  }
}
