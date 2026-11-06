import Phaser from 'phaser';
import { BASE_TEXT, setupCamera } from '../ui/text';
import { Sound } from '../systems/Sound';
import { addMuteToggle, addFxToggle, addFullscreenToggle } from '../ui/MuteToggle';
import { isTouch, enterFullscreen } from '../systems/Fullscreen';
import { VIEW_W, VIEW_H } from '../config';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    setupCamera(this);
    this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'ground').setOrigin(0);
        this.add
      .text(VIEW_W / 2, 110, 'ZERO TO LEGEND', { ...BASE_TEXT, fontSize: '40px', color: '#ff2bd6' })
      .setOrigin(0.5)
      .setShadow(0, 0, '#ff2bd6', 14, true, true);
    this.add
      .text(VIEW_W / 2, 150, '이름 없는 용병, 전설이 되기까지', { ...BASE_TEXT, fontSize: '13px', color: '#00f0ff' })
      .setOrigin(0.5);
    const start = this.add
      .text(VIEW_W / 2, 220, isTouch() ? '탭하여 전체화면으로 시작' : 'ENTER 또는 클릭하여 시작', { ...BASE_TEXT, fontSize: '15px', color: '#ffffff' })
      .setOrigin(0.5);
    this.tweens.add({ targets: start, alpha: 0.25, duration: 700, yoyo: true, repeat: -1 });
    this.add
      .text(VIEW_W / 2, 300, '이동 WASD·방향키 / 대시 SPACE / 일시정지 ESC / 전체화면 F\n모바일: 화면 드래그로 이동, 오른쪽 아래 버튼으로 대시, 오른쪽 위 Ⅱ로 일시정지', {
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
      if (over.includes(mute) || over.includes(fxBtn) || over.includes(fsBtn)) this.input.once('pointerup', onUp);
      else {
        // 모바일: 탭해서 시작하면 바로 전체화면 + 가로 고정
        if (isTouch() && !this.scale.isFullscreen) enterFullscreen(this);
        go();
      }
    };
    this.input.once('pointerup', onUp);
  }
}
