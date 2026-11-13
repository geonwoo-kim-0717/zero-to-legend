import Phaser from 'phaser';
import { BASE_TEXT, setupCamera } from '../ui/text';
import { Sound } from '../systems/Sound';
import { addMuteToggle, addFullscreenToggle } from '../ui/MuteToggle';
import { VIEW_W, VIEW_H } from '../config';
import { Save, type RunStats } from '../systems/Save';
import { Ads } from '../systems/Ads';
import { t } from '../i18n';
import { Leaderboard } from '../systems/Leaderboard';
import { askName } from '../ui/NameInput';

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
  /** 도달한 챕터에서 버틴 시간(초) — 리더보드 점수용 */
  zoneTime?: number;
  /** 리더보드 점수 (한 번만 계산) */
  score?: number;
  scoreBest?: boolean;
  /** 사인과 픽서의 한마디 (패배했을 때만) */
  cause?: string;
  remark?: string;
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
    if (!r.saved) {
      const rec = Leaderboard.record({ zone: r.run.zone, zoneTime: r.zoneTime ?? 0, time: r.time, kills: r.kills, heat: r.heat, cleared: r.victory, runner: r.runner });
      r.score = rec.score;
      r.scoreBest = rec.isBest;
    }
    r.saved = true;
    this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'ground').setOrigin(0);
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x000000, 0.5).setOrigin(0);
        const color = r.victory ? '#39ff88' : '#ff2bd6';
    this.add
      .text(VIEW_W / 2, 56, r.victory ? 'CONTRACT COMPLETE' : 'FLATLINED', { ...BASE_TEXT, fontSize: '28px', color })
      .setOrigin(0.5)
      .setShadow(0, 0, color, 12, true, true);
    if (r.cause) {
      // 사인: 의료 모니터의 사망 기록처럼 붉은 띠 위에
      const line = this.add
        .text(VIEW_W / 2, 86, `${t('death.label')} · ${r.cause}`, { ...BASE_TEXT, fontSize: '12px', color: '#ffd0d6' })
        .setOrigin(0.5);
      this.add.rectangle(VIEW_W / 2, 86, line.width + 24, 18, 0x5a0a1c, 0.85).setStrokeStyle(1, 0xff2a3a).setDepth(0.5);
      line.setDepth(1);
    } else {
      this.add
        .text(VIEW_W / 2, 86, r.victory ? t('result.win') : t('result.lose'), {
          ...BASE_TEXT,
          fontSize: '12px',
          color: '#e8f7ff',
        })
        .setOrigin(0.5);
    }

    const m = Math.floor(r.time / 60);
    const s = String(Math.floor(r.time % 60)).padStart(2, '0');
    const rows: [string, string][] = [
      [t('result.runner'), r.heat ? t('result.runnerHeat', { name: r.runner, n: r.heat }) : r.runner],
      [t('result.zone'), r.zone],
      [t('result.time'), `${m}:${s}`],
      [t('result.kills'), `${r.kills}`],
      [t('result.level'), `${r.level}`],
      [t('result.credits'), t('result.creditsVal', { n: r.credits, total: Save.data.credits })],
    ];
    const scoreTxt = (r.score ?? 0).toLocaleString('en-US');
    rows.push([t('result.score'), r.scoreBest ? t('result.score.best', { n: scoreTxt }) : scoreTxt]);
    rows.forEach(([k, v], i) => {
      const last = i === rows.length - 1;
      this.add.text(190, 104 + i * 16, k, { ...BASE_TEXT, fontSize: '13px', color: last ? '#fff23a' : '#8a7aa8' });
      this.add.text(450, 104 + i * 16, v, { ...BASE_TEXT, fontSize: '13px', color: last ? '#fff23a' : '#ffffff' }).setOrigin(1, 0);
    });
    // 리더보드: 닉네임이 없으면 정하는 버튼, 있으면 등록됐다는 표시 (눌러서 닉네임 변경)
    const rankLabel = () => (Leaderboard.name ? t(Leaderboard.online ? 'result.rank.name' : 'result.rank.local', { name: Leaderboard.name }) : t('result.rank.set'));
    const rankBtn = this.add
      .text(12, 12, rankLabel(), { ...BASE_TEXT, fontSize: '12px', color: Leaderboard.name ? '#8a7aa8' : '#07060f', backgroundColor: Leaderboard.name ? undefined : '#fff23a', padding: { x: 6, y: 3 }, strokeThickness: Leaderboard.name ? 3 : 0 })
      .setDepth(5)
      .setInteractive({ useHandCursor: true });
    let naming = false;
    rankBtn.on('pointerup', async () => {
      if (naming) return;
      naming = true;
      const v = await askName(Leaderboard.name);
      // 입력 창을 닫은 클릭이 '아지트로 귀환'으로 이어지지 않게 잠깐 뒤에 푼다
      this.time.delayedCall(250, () => (naming = false));
      if (!v || !Leaderboard.setName(v)) return;
      void Leaderboard.push();
      Sound.play('select');
      rankBtn.setText(rankLabel()).setColor('#8a7aa8').setBackgroundColor('rgba(0,0,0,0)').setStroke('#000000', 3);
    });
    this.add
      .text(VIEW_W / 2, 220, r.weapons.map((w) => `${w.name} Lv.${w.level}`).join('   '), {
        ...BASE_TEXT,
        fontSize: '11px',
        color: '#00f0ff',
        align: 'center',
        wordWrap: { width: 560 },
      })
      .setOrigin(0.5, 0);
    // 픽서의 한마디가 두 줄이 되면 아래 줄들을 그만큼 내린다
    let below = 0;
    if (r.remark) {
      const rm = this.add
        .text(VIEW_W / 2, 246, `✉ ${r.remark}`, { ...BASE_TEXT, fontSize: '11px', color: '#ff2bd6', align: 'center', wordWrap: { width: 580, useAdvancedWrap: true } })
        .setOrigin(0.5, 0);
      below = Math.max(0, rm.y + rm.height + 10 - 274);
    }
    const notes: string[] = unlocked.map((n) => t('result.unlock', { name: n }));
    if (Save.data.heatMax > heatBefore) notes.push(t('result.heat', { n: Save.data.heatMax }));
    const ready = Save.claimable();
    if (ready > 0) notes.push(t('result.claim', { n: ready }));
    this.add
      .text(VIEW_W / 2, 280 + below, notes.join('   ·   ') || t('result.tip'), {
        ...BASE_TEXT,
        fontSize: notes.length ? '12px' : '11px',
        color: notes.length ? '#fff23a' : '#8a7aa8',
      })
      .setOrigin(0.5);

    const again = this.add.text(VIEW_W / 2, 304 + below, t('result.back'), { ...BASE_TEXT, fontSize: '14px', color: '#ffffff' }).setOrigin(0.5);
    this.tweens.add({ targets: again, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });
    this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'scan').setOrigin(0);
    Sound.music('title', 1200);
    const mute = addMuteToggle(this, VIEW_W - 10, 10);
    const fsBtn = addFullscreenToggle(this, VIEW_W - 10, 28);
    const adPause = { onStart: () => Sound.adPause(true), onEnd: () => Sound.adPause(false) };

    // 보상형 광고: 볼 수 있는 광고가 준비됐을 때만 버튼을 보여준다 (판마다 1번, 누를 때만)
    let adBtn: Phaser.GameObjects.Text | null = null;
    let busy = false;
    let leaving = false;
    if (!r.doubled && r.credits > 0) {
      void Ads.prepareRewarded().then((ok) => {
        if (!ok || leaving || !this.scene.isActive()) return;
        adBtn = this.add
          .text(VIEW_W / 2, Math.min(VIEW_H - 14, 334 + below), t('result.ad', { n: r.credits }), { ...BASE_TEXT, fontSize: '12px', color: '#07060f', backgroundColor: '#fff23a', padding: { x: 10, y: 4 }, strokeThickness: 0 })
          .setOrigin(0.5)
          .setInteractive({ useHandCursor: true });
        adBtn.on('pointerup', async () => {
          if (busy || r.doubled || leaving) return;
          busy = true;
          adBtn?.disableInteractive();
          const watched = await Ads.rewarded(adPause);
          busy = false;
          if (!this.scene.isActive()) return;
          if (watched) {
            r.doubled = true;
            Save.data.credits += r.credits;
            Save.write();
            Sound.play('levelup');
            adBtn?.setText(t('result.adDone', { n: r.credits, total: Save.data.credits }));
          } else adBtn?.setText(t('result.adNone'));
        });
      });
    }

    // 게임오버 직후 누르고 있던 입력으로 바로 넘어가지 않게 잠깐 대기
    this.time.delayedCall(600, () => {
      const go = async () => {
        // 광고 진행 중이면 이번 입력만 무시 (다음 입력은 다시 받는다)
        if (leaving || busy || naming) return;
        leaving = true;
        Sound.play('start');
        // 판 사이 전면 광고 (첫 판 제외, 3분에 1번, 광고가 안 오면 몇 초 안에 그냥 진행)
        await Ads.interstitial(adPause);
        this.scene.start('Hideout');
      };
      this.input.keyboard!.on('keydown-ENTER', go);
      this.input.on('pointerup', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
        if (over.includes(mute) || over.includes(fsBtn) || over.includes(rankBtn) || (adBtn && over.includes(adBtn))) return;
        void go();
      });
    });
  }
}
