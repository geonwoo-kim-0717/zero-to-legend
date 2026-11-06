import Phaser from 'phaser';
import { BASE_TEXT, setupCamera } from '../ui/text';
import { Sound } from '../systems/Sound';
import { addMuteToggle, addFullscreenToggle } from '../ui/MuteToggle';
import { VIEW_W, VIEW_H } from '../config';
import { Save, type RunStats } from '../systems/Save';
import { Ads } from '../systems/Ads';

export interface RunResult {
  victory: boolean;
  time: number;
  kills: number;
  level: number;
  weapons: { name: string; level: number }[];
  credits: number;
  run: RunStats;
  runner: string;
  zone: string;
  heat: number;
  /** 이미 저장에 더했는지 (같은 결과로 두 번 저장하지 않게) */
  saved?: boolean;
  /** 보상형 광고로 크레딧 2배를 이미 받았는지 */
  doubled?: boolean;
}

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(r: RunResult): void {
    setupCamera(this);
    // 크레딧과 기록을 저장 (사망해도 100% 유지)
    const heatBefore = Save.data.heatMax;
    const unlocked = r.saved ? [] : Save.commitRun(r.run, r.credits, r.victory);
    r.saved = true;
    this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'ground').setOrigin(0);
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x000000, 0.5).setOrigin(0);
        const color = r.victory ? '#39ff88' : '#ff2bd6';
    this.add
      .text(VIEW_W / 2, 56, r.victory ? 'CONTRACT COMPLETE' : 'FLATLINED', { ...BASE_TEXT, fontSize: '28px', color })
      .setOrigin(0.5)
      .setShadow(0, 0, color, 12, true, true);
    this.add
      .text(VIEW_W / 2, 86, r.victory ? '아르코난 코어가 꺼졌다. 이름 없는 용병은 이제 전설이다.' : '이번 의뢰는 여기까지.', {
        ...BASE_TEXT,
        fontSize: '12px',
        color: '#e8f7ff',
      })
      .setOrigin(0.5);

    const m = Math.floor(r.time / 60);
    const s = String(Math.floor(r.time % 60)).padStart(2, '0');
    const rows: [string, string][] = [
      ['생존 시간', `${m}:${s}`],
      ['처치', `${r.kills}`],
      ['레벨', `${r.level}`],
      ['획득 크레딧', `+${r.credits}  (보유 ${Save.data.credits})`],
    ];
    rows.unshift(['러너', r.heat ? `${r.runner} (히트 ${r.heat})` : r.runner], ['도달 구역', r.zone]);
    rows.forEach(([k, v], i) => {
      this.add.text(200, 102 + i * 20, k, { ...BASE_TEXT, fontSize: '13px', color: '#8a7aa8' });
      this.add.text(440, 102 + i * 20, v, { ...BASE_TEXT, fontSize: '13px', color: '#ffffff' }).setOrigin(1, 0);
    });
    this.add
      .text(VIEW_W / 2, 230, r.weapons.map((w) => `${w.name} Lv.${w.level}`).join('   '), {
        ...BASE_TEXT,
        fontSize: '11px',
        color: '#00f0ff',
        align: 'center',
        wordWrap: { width: 560 },
      })
      .setOrigin(0.5, 0);
    const notes: string[] = unlocked.map((n) => `새 러너 해금: ${n}`);
    if (Save.data.heatMax > heatBefore) notes.push(`히트 레벨 ${Save.data.heatMax} 해금`);
    const ready = Save.claimable();
    if (ready > 0) notes.push(`의뢰 보드에서 받을 보상 ${ready}개`);
    this.add
      .text(VIEW_W / 2, 264, notes.join('   ·   ') || '크레딧은 아지트에서 영구 강화에 쓸 수 있어요', {
        ...BASE_TEXT,
        fontSize: notes.length ? '12px' : '11px',
        color: notes.length ? '#fff23a' : '#8a7aa8',
      })
      .setOrigin(0.5);

    const again = this.add
      .text(VIEW_W / 2, 300, 'ENTER 또는 탭하여 아지트로 귀환', { ...BASE_TEXT, fontSize: '14px', color: '#ffffff' })
      .setOrigin(0.5);
    this.tweens.add({ targets: again, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });
    this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'scan').setOrigin(0);
    Sound.music('title', 1200);
    const mute = addMuteToggle(this, VIEW_W - 10, 10);
    const fsBtn = addFullscreenToggle(this, VIEW_W - 10, 28);
    const adPause = { onStart: () => Sound.adPause(true), onEnd: () => Sound.adPause(false) };
    // 보상형 광고: 플레이어가 원할 때만 (판마다 1번)
    let adBtn: Phaser.GameObjects.Text | null = null;
    let busy = false;
    if (Ads.rewardedAvailable && !r.doubled && r.credits > 0) {
      adBtn = this.add
        .text(VIEW_W / 2, 330, `▶ 광고 보고 크레딧 2배 (+${r.credits})`, { ...BASE_TEXT, fontSize: '12px', color: '#07060f', backgroundColor: '#fff23a', padding: { x: 10, y: 4 }, strokeThickness: 0 })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      adBtn.on('pointerup', async () => {
        if (busy || r.doubled) return;
        busy = true;
        const ok = await Ads.rewarded(adPause);
        busy = false;
        if (ok) {
          r.doubled = true;
          Save.data.credits += r.credits;
          Save.write();
          Sound.play('levelup');
          adBtn?.setText(`크레딧 +${r.credits} 받음 (보유 ${Save.data.credits})`).disableInteractive();
        } else adBtn?.setText('광고를 끝까지 보지 않아 보상이 없어요');
      });
    }

    // 게임오버 직후 누르고 있던 입력으로 바로 넘어가지 않게 잠깐 대기
    this.time.delayedCall(600, () => {
      let leaving = false;
      const go = async () => {
        if (leaving || busy) return;
        leaving = true;
        Sound.play('start');
        // 판 사이 전면 광고 (첫 판 제외, 3분에 1번)
        await Ads.interstitial(adPause);
        this.scene.start('Hideout');
      };
      this.input.keyboard!.once('keydown-ENTER', go);
      const onUp = (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
        if (over.includes(mute) || over.includes(fsBtn) || (adBtn && over.includes(adBtn))) this.input.once('pointerup', onUp);
        else go();
      };
      this.input.once('pointerup', onUp);
    });
  }
}
