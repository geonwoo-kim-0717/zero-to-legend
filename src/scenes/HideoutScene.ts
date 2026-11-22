import { Leaderboard, type Entry } from '../systems/Leaderboard';
import { askName } from '../ui/NameInput';
import Phaser from 'phaser';
import { BASE_TEXT, setupCamera } from '../ui/text';
import { Sound } from '../systems/Sound';
import { addMuteToggle, addFullscreenToggle, addLangToggle } from '../ui/MuteToggle';
import { notify, isTouch } from '../systems/Fullscreen';
import { VIEW_W, VIEW_H, COLORS } from '../config';
import meta from '../data/meta.json';
import weapons from '../data/weapons.json';
import { Save, type RunnerId, type StatKey, type ClinicId } from '../systems/Save';
import { OS_DEFS, OS_IDS, OS_GACHA, OsState } from '../systems/Os';
import { t as tr, I18n } from '../i18n';
import { Ads } from '../systems/Ads';

type Tab = 'clinic' | 'bar' | 'board' | 'os';
type Who = 'jin' | 'doc' | 'runner';
interface DLine {
  who: Who;
  text: string;
}
/** 개편 4단계: 블랙마켓 대신 OS 뽑기 */
const TABS: Tab[] = ['clinic', 'bar', 'board', 'os'];
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
/** 첫 판 뒤 이만큼 이상 벌어 왔으면 '넉넉한' 대사 (모노와이어 600 + 시뮬레이션 칩 600 + 광전사 칩 1,000) */
const TUT_RICH = 2200;

export class HideoutScene extends Phaser.Scene {
  private tab: Tab = 'bar';
  private panel!: Phaser.GameObjects.Container;
  private tabsG!: Phaser.GameObjects.Container;
  private credits!: Phaser.GameObjects.Text;
  private summary!: Phaser.GameObjects.Container;
  private hint!: Phaser.GameObjects.Text;
  /** 아지트 대화창 (튜토리얼 · 리퍼닥 제안 · 초기화 확인) */
  private board: Phaser.GameObjects.Container | null = null;
  private goBtn!: Phaser.GameObjects.Rectangle;
  private goHint: Phaser.GameObjects.Text | null = null;
  private dlg: { lines: DLine[]; i: number; box: Phaser.GameObjects.Container; choices?: [string, () => void][]; done: () => void } | null = null;

  constructor() {
    super('Hideout');
  }

  create(): void {
    setupCamera(this);
    this.add.image(0, 0, 'hideout').setOrigin(0).setDisplaySize(VIEW_W, VIEW_H);
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x07060f, 0.4).setOrigin(0);
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
    this.textButton(I18n.lang === 'ko' ? 104 : 110, 325, tr('hideout.reset'), () => this.askReset());
    this.textButton(I18n.lang === 'ko' ? 104 : 110, 310, tr('lb.button'), () => this.openBoard());
    const go = (this.goBtn = this.add.rectangle(VIEW_W - 12, VIEW_H - 10, 132, 36, COLORS.magenta, 0.9)).setOrigin(1, 1).setStrokeStyle(2, 0xffffff);
    this.add.text(VIEW_W - 78, VIEW_H - 33, tr('hideout.deploy'), T(16, '#ffffff')).setOrigin(0.5);
    this.add.text(VIEW_W - 78, VIEW_H - 17, 'ENTER', T(10, '#ffd6f6')).setOrigin(0.5);
    go.setInteractive({ useHandCursor: true }).on('pointerup', () => this.deploy());
    go.on('pointerover', () => go.setFillStyle(0xff5ae0, 1));
    go.on('pointerout', () => go.setFillStyle(COLORS.magenta, 0.9));
    // 임시: 클리어한 챕터 다음부터 바로 시작 (바실리를 잡았으면 2챕터, XM-4를 잡았으면 3챕터)
    const st = Save.data.stats;
    const from: [number, boolean][] = [
      [1, st.bossKills > 0],
      [2, st.hexKills > 0],
    ];
    let fx = VIEW_W - 12;
    for (const [z, ok] of from.reverse()) {
      if (!ok) continue;
      const label = I18n.lang === 'ko' ? `${z + 1}챕터부터` : `From Ch.${z + 1}`;
      const b = this.add.text(fx, VIEW_H - 52, label, { ...T(11, '#ffffff'), backgroundColor: '#5a1a6a', padding: { x: 6, y: 3 } }).setOrigin(1, 1);
      b.setInteractive({ useHandCursor: true }).on('pointerup', () => this.deploy(z));
      b.on('pointerover', () => b.setBackgroundColor('#8a2aa0'));
      b.on('pointerout', () => b.setBackgroundColor('#5a1a6a'));
      fx -= b.width + 6;
    }
    this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'scan').setOrigin(0).setDepth(300);

    const kb = this.input.keyboard!;
    kb.on('keydown-ENTER', () => (this.board ? undefined : this.dlg ? this.dlgNext() : this.deploy()));
    // 대화: ENTER·탭 = 다음 줄, 스페이스 = 건너뛰기
    kb.on('keydown-SPACE', () => this.dlg && this.dlgSkip());
    if (Ads.provider !== 'crazygames') kb.on('keydown-ESC', () => !this.dlg && this.scene.start('Title'));
    TABS.forEach((id, i) => kb.on(`keydown-${['ONE', 'TWO', 'THREE', 'FOUR'][i]}`, () => !this.dlg && !this.board && this.setTab(id)));
    kb.on('keydown-LEFT', () => !this.dlg && this.tab === 'bar' && this.cycleRunner(-1));
    kb.on('keydown-RIGHT', () => !this.dlg && this.tab === 'bar' && this.cycleRunner(1));

    Sound.duck(1);
    Sound.music('title', 800);
    // 받을 보상이 있으면 의뢰 보드부터 보여준다
    this.tab = Save.claimable() > 0 ? 'board' : 'bar';
    this.dlg = null;
    this.refresh();
    this.goHint = null;
    this.board = null;
    this.showGoHint();
    this.time.delayedCall(300, () => this.tutorial());
  }

  // ───────────────────────────── 대화창 · 튜토리얼 ─────────────────────────────
  /** 아래쪽 대화창. 탭·ENTER로 넘기고, 마지막 줄에 선택지가 있으면 버튼으로 고른다 */
  private talk(lines: DLine[], done: () => void = () => undefined, choices?: [string, () => void][]): void {
    const box = this.add.container(0, 0).setDepth(250);
    const dim = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x000000, 0.45).setOrigin(0).setInteractive();
    dim.on('pointerup', () => this.dlgNext());
    box.add(dim);
    this.dlg = { lines, i: -1, box, choices, done };
    this.dlgNext();
  }

  private dlgNext(): void {
    const d = this.dlg;
    if (!d) return;
    const last = d.i === d.lines.length - 1;
    if (last && d.choices) return; // 선택지는 버튼으로만
    d.i++;
    d.box.list.slice(1).forEach((o) => o.destroy());
    if (d.i >= d.lines.length) {
      d.box.destroy();
      this.dlg = null;
      d.done();
      return;
    }
    const line = d.lines[d.i];
    const jin = line.who === 'jin';
    const me = line.who === 'runner';
    const col = me ? COLORS.cyan : jin ? COLORS.magenta : COLORS.green;
    const y = VIEW_H - 112;
    d.box.add(this.add.rectangle(24, y, VIEW_W - 48, 92, 0x0d0820, 0.96).setOrigin(0).setStrokeStyle(2, col));
    d.box.add(this.add.rectangle(34, y + 10, 72, 72, 0x140c2a).setOrigin(0).setStrokeStyle(1, col));
    const tex = me ? Save.runner().texture : jin ? 'client' : this.textures.exists('ripperdoc') ? 'ripperdoc' : 'client';
    const img = this.add.image(70, y + 46, tex);
    img.setScale(Math.min(64 / img.width, 64 / img.height, 2));
    if (!jin && !me && tex === 'client') img.setTint(0x66ff99);
    d.box.add(img);
    d.box.add(this.add.text(118, y + 8, me ? Save.runner().name : jin ? tr('npc.jin') : tr('npc.doc'), T(13, me ? '#00f0ff' : jin ? '#ff2bd6' : '#39ff88')));
    d.box.add(this.add.text(118, y + 28, line.text, { ...T(12), wordWrap: { width: VIEW_W - 170, useAdvancedWrap: true }, lineSpacing: 3 }));
    Sound.play('select');
    if (d.i === d.lines.length - 1 && d.choices) {
      d.choices.forEach(([label, fn], k) => {
        const bx = VIEW_W - 40 - k * 104;
        const bg = this.add.rectangle(bx, y + 66, 96, 20, k === 0 ? COLORS.yellow : 0x2a2040, 1).setOrigin(1, 0).setInteractive({ useHandCursor: true });
        const tx = this.add.text(bx - 48, y + 76, label, T(11, k === 0 ? '#07060f' : '#e8f7ff')).setOrigin(0.5).setStroke('#000000', 0);
        bg.on('pointerup', () => {
          d.box.destroy();
          this.dlg = null;
          fn();
        });
        d.box.add([bg, tx]);
      });
    } else {
      d.box.add(this.add.text(VIEW_W - 34, y + 74, `${d.i + 1}/${d.lines.length}  ▶`, T(10, '#8a7aa8')).setOrigin(1, 0));
      // 건너뛰기: 남은 줄을 넘긴다 (선택지가 있으면 선택지 줄까지)
      const sk = this.add
        .text(VIEW_W - 26, y - 22, isTouch() ? tr('dialog.skip.touch') : tr('dialog.skip'), { ...T(11, '#e8f7ff'), backgroundColor: '#1a1030', padding: { x: 8, y: 3 } })
        .setOrigin(1, 0)
        .setInteractive({ useHandCursor: true });
      sk.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        this.dlgSkip();
      });
      d.box.add(sk);
    }
  }

  /** 대화 건너뛰기: 선택지가 있으면 선택지 줄로, 없으면 대화를 끝낸다 */
  private dlgSkip(): void {
    const d = this.dlg;
    if (!d || this.skipQueued) return;
    // 입력 처리 도중에 버튼(대화창)을 지우지 않도록 다음 프레임에 넘긴다 (모바일 연타 대비)
    this.skipQueued = true;
    this.time.delayedCall(0, () => {
      this.skipQueued = false;
      if (this.dlg !== d) return;
      if (d.choices) {
        if (d.i >= d.lines.length - 1) return;
        d.i = d.lines.length - 2;
      } else d.i = d.lines.length - 1;
      this.dlgNext();
    });
  }
  private skipQueued = false;

  /** 첫 게임오버 뒤 진·리퍼닥 안내 (모든 저장에 한 번) */
  private tutorial(): void {
    // 개편판: 예전 튜토리얼(블랙마켓 무기·특수 능력 구매 안내)은 끔
    if (Save.data.introDone) return;
    const d = Save.data;
    if (this.dlg) return;
    const runner = Save.runner().name;
    const L = (who: Who, key: Parameters<typeof tr>[0]): DLine => ({ who, text: tr(key, { runner }) });
    // 처음 아지트에 왔을 때: 리퍼닥이 뉴럴 오버클럭을 알아보고 사용법을 알려 준다
    if (!d.introDone) {
      if (d.stats.runs > 0) {
        d.introDone = true;
        Save.write();
      } else {
        this.talk(
          (['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7', 'i8', 'i9'] as const).map((k) => L(k === 'i2' || k === 'i6' ? 'runner' : 'doc', `intro.${k}`)),
          () => {
            d.introDone = true;
            Save.write();
          },
        );
        return;
      }
    }
    if (d.stats.runs < 1) return;
    if (d.tut === 0) {
      // 시뮬레이션 칩 값이 모자라면 진이 채워 준다 (한 번)
      const price = meta.clinic.find((c) => c.id === 'startPick')!.costs[0];
      const topup = d.credits < price && !d.tutTopup;
      // 첫 판에서 크레딧을 넉넉히 벌어 왔으면 (시뮬레이션 칩 + 광전사 칩 + 여유) 진·리퍼닥이 알아챈다
      const rich = d.credits >= TUT_RICH;
      d.tutRich = rich;
      // 첫 판에 엔딩까지 봤으면 쓰러진 걸 수거한 게 아니다
      const lines = d.lastWin
        ? [L('jin', 'tut.a1w'), L('jin', 'tut.a2w'), L('jin', 'tut.a3w')]
        : rich
          ? [L('jin', 'tut.a1'), L('jin', 'tut.a2r'), L('jin', 'tut.a3r')]
          : [L('jin', 'tut.a1'), L('jin', 'tut.a2'), L('jin', 'tut.a3')];
      // 블랙마켓을 보여 주며 밀수 무기 안내 (구매는 강요하지 않음) → 리퍼닥 시뮬레이션 칩
      this.talk(lines, () => {
        this.tab = 'os';
        this.refresh();
        this.talk([L('jin', 'tut.a5'), ...(topup ? [L('jin', 'tut.a4')] : [])], () => {
          if (topup) {
            d.credits = price;
            d.tutTopup = true;
          }
          d.tut = 1;
          Save.write();
          this.tutorialB();
        });
      });
      return;
    }
    if (d.tut === 1) {
      // 예전 저장(모노와이어 구매 대기)도 바로 다음 단계로
      this.tutorialB();
      return;
    }
    if (d.tut === 2) {
      // 시뮬레이션 칩 구매 대기 (못 사면 건너뜀) → 산 걸 확인하면 리퍼닥이 광전사 칩 추천
      const simCost = meta.clinic.find((c) => c.id === 'startPick')!.costs[0];
      if (Save.clinicLevel('startPick' as ClinicId) === 0) {
        if (d.credits < simCost) {
          d.tut = 3;
          Save.write();
          this.sendOff();
        }
        return;
      }
      if (d.specials.includes('berserk')) {
        d.tut = 3;
        Save.write();
        this.sendOff();
        return;
      }
      const cost = meta.specials.berserk.cost;
      if (d.credits < cost) {
        d.tut = 3;
        Save.write();
        this.sendOff();
        return;
      }
      this.tab = 'clinic';
      this.refresh();
      this.talk([L('doc', 'tut.c1'), L('doc', 'tut.c2')], () => undefined, [
        [
          tr('tut.c.buy'),
          () => {
            const bought = Save.spend(cost);
            if (bought) {
              d.specials.push('berserk');
              Sound.play('levelup');
            }
            d.tut = 3;
            d.tutEquip = bought;
            Save.write();
            this.refresh();
            // 장착은 도크 9에서: 탭을 옮기고 장착할 때까지 안내
            this.talk([L('doc', 'tut.c.yes')], () => {
              if (!bought) return this.sendOff();
              this.tab = 'bar';
              this.refresh();
            });
          },
        ],
        [
          tr('tut.c.no'),
          () => {
            d.tut = 3;
            Save.write();
            this.talk([L('doc', 'tut.c.no.reply')], () => this.sendOff());
          },
        ],
      ]);
      return;
    }
    // 광전사 칩 장착 대기: 장착하면 진이 한마디 하고 출격 안내
    if (d.tutEquip && Save.special() === 'berserk') {
      d.tutEquip = false;
      Save.write();
      this.refresh();
      this.talk([L('jin', 'tut.e1')], () => this.sendOff());
    }
  }

  /** 블랙마켓 안내 뒤: 진이 리퍼닥으로 보내고, 리퍼닥이 시뮬레이션 칩 팁 */
  private tutorialB(): void {
    const runner = Save.runner().name;
    this.talk([{ who: 'jin', text: tr('tut.b1', { runner }) }], () => {
      this.tab = 'clinic';
      this.refresh();
      this.talk(
        [
          { who: 'doc', text: tr('tut.b2', { runner }) },
          // 시뮬레이션 칩을 살 돈이 있으면 지금 사라고, 없으면 모아 오라고
          { who: 'doc', text: tr(Save.data.credits >= meta.clinic.find((c) => c.id === 'startPick')!.costs[0] ? 'tut.b3s' : 'tut.b3', { runner }) },
        ],
        () => {
          Save.data.tut = 2;
          Save.write();
          this.refresh();
          this.tutorial();
        },
      );
    });
  }

  /** 첫 귀환 튜토리얼 마무리: 진이 두 번째 임무로 등을 떠민다 (한 번만). 출격 버튼이 깜빡인다 */
  private sendOff(): void {
    const d = Save.data;
    if (d.tutGo || d.stats.runs !== 1) return; // 첫 귀환 때만
    const runner = Save.runner().name;
    this.talk(
      [
        { who: 'jin', text: tr('tut.g1', { runner }) },
        { who: 'jin', text: tr('tut.g2', { runner }) },
      ],
      () => {
        d.tutGo = true;
        Save.write();
        this.showGoHint();
      },
    );
  }

  /** 두 번째 판 전까지 출격 버튼 강조 */
  private showGoHint(): void {
    const d = Save.data;
    if (!d.tutGo || d.stats.runs !== 1 || this.goHint) return;
    this.goHint = this.add.text(VIEW_W - 78, VIEW_H - 58, tr('tut.hint.go'), T(11, '#ff2bd6')).setOrigin(0.5).setDepth(5);
    this.tweens.add({ targets: [this.goHint, this.goBtn], alpha: 0.45, duration: 500, yoyo: true, repeat: -1 });
  }

  // ───────────────────────────── 리더보드 ─────────────────────────────
  private openBoard(): void {
    if (this.dlg || this.board) return;
    Sound.play('hover');
    const W = 420;
    const H = 300;
    const x = (VIEW_W - W) / 2;
    const y = (VIEW_H - H) / 2;
    const box = (this.board = this.add.container(0, 0).setDepth(260));
    const dim = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x07060f, 0.8).setOrigin(0).setInteractive();
    box.add(dim);
    box.add(this.add.rectangle(x, y, W, H, 0x0d0820, 0.98).setOrigin(0).setStrokeStyle(2, COLORS.magenta));
    box.add(this.add.text(x + 16, y + 10, tr('lb.title'), T(18, '#ff2bd6')));
    const close = () => {
      box.destroy();
      this.board = null;
    };
    const btn = (bx: number, label: string, fn: () => void, color = '#8a7aa8') => {
      const b = this.add.text(bx, y + H - 24, label, T(12, color)).setInteractive({ useHandCursor: true });
      b.on('pointerup', fn);
      box.add(b);
      return b;
    };
    const closeBtn = btn(x + W - 16, tr('lb.close'), close, '#e8f7ff');
    closeBtn.setOrigin(1, 0);
    btn(x + 16, Leaderboard.name ? `${tr('lb.rename')} (${Leaderboard.name})` : tr('lb.setname'), async () => {
      const v = await askName(Leaderboard.name);
      if (!v || !Leaderboard.setName(v)) return;
      await Leaderboard.push();
      if (this.board !== box) return;
      close();
      this.openBoard();
    }, Leaderboard.name ? '#8a7aa8' : '#fff23a');
    const status = this.add.text(x + W / 2, y + 150, tr('lb.loading'), T(12, '#8a7aa8')).setOrigin(0.5);
    box.add(status);
    const cols = [x + 16, x + 52, x + 300, x + 330, x + W - 16];
    const head = [tr('lb.col.rank'), tr('lb.col.name'), tr('lb.col.score'), tr('lb.col.zone'), tr('lb.col.time')];
    const rowAt = (i: number, cells: string[], color: string) => {
      const ry = y + 40 + i * 19;
      cells.forEach((c, k) => {
        const tx = this.add.text(cols[k], ry, c, T(k === 1 ? 12 : 11, color));
        if (k === 2 || k === 4) tx.setOrigin(1, 0);
        if (k === 2) tx.setX(cols[2] - 8);
        box.add(tx);
      });
    };
    rowAt(0, head, '#6a5a88');
    const line = (e: Entry, rank: number | string): string[] => [
      String(rank),
      e.name,
      e.score.toLocaleString('en-US'),
      e.cleared ? tr('lb.clear') : tr('lb.zone', { n: e.zone }),
      `${Math.floor(e.time / 60)}:${String(Math.floor(e.time % 60)).padStart(2, '0')}`,
    ];
    void Leaderboard.top(10).then(({ list, myRank, offline }) => {
      if (this.board !== box) return;
      status.setText('');
      if (!list.length) status.setText(Leaderboard.name || !Leaderboard.best ? tr('lb.empty') : tr('lb.noname'));
      list.forEach((e, i) => {
        if (e.me) box.add(this.add.rectangle(x + 8, y + 38 + (i + 1) * 19, W - 16, 18, 0x2a1050, 1).setOrigin(0));
        rowAt(i + 1, line(e, i + 1), e.me ? '#fff23a' : i < 3 ? '#00f0ff' : '#e8f7ff');
      });
      const foot: string[] = [];
      const mine = Leaderboard.best;
      if (offline) foot.push(tr(Leaderboard.online ? 'lb.offline' : 'lb.local'));
      else if (myRank) foot.push(tr('lb.myrank', { n: myRank }));
      if (mine) foot.push(tr('lb.mybest', { n: mine.score.toLocaleString('en-US') }));
      box.add(this.add.text(x + W / 2, y + H - 46, foot.join('   ·   '), T(11, offline ? '#ff8a1f' : '#39ff88')).setOrigin(0.5));
    });
  }

  private askReset(): void {
    if (this.dlg) return;
    this.talk([{ who: 'jin', text: tr('reset.ask') }], () => undefined, [
      [
        tr('reset.yes'),
        () => {
          Save.reset();
          Sound.play('select');
          this.scene.start('Title');
        },
      ],
      [tr('reset.no'), () => undefined],
    ]);
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
    else this.drawOs();
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
    const r = Save.runner('zero');
    const os = new OsState(Save.data.os, Save.osLevel(Save.data.os));
    const x = 250;
    this.summary.add(this.add.image(x, 330, r.texture).setScale(1.2));
    this.summary.add(this.add.text(x + 24, 316, r.name, T(13)));
    this.summary.add(this.add.text(x + 24, 333, `${weapons[r.startWeapon as keyof typeof weapons].name} · ${os.name} Lv${os.level}`, T(11, os.def.color)));
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
      const guide = Save.data.tut === 2 && c.id === 'startPick' && lv === 0;
      this.panel.add(this.add.text(PX + 10, y, c.name, T(12, guide ? '#ff2bd6' : '#e8f7ff')));
      if (guide) this.hint.setText(tr('tut.hint.clinic'));
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
          this.tutorial();
        });
      }
    });
  }

  // ───────────────────────────── 레인독 (러너 선택) ─────────────────────────────
  private drawBar(): void {
    this.title(tr('bar.title'), Save.data.heatMax > 0 ? '' : tr('bar.sub'));
    if (Save.data.heatMax > 0) this.drawHeat();
    // 개편판: 러너는 제로 한 명, 시작 무기 고정 (외형 꾸미기는 나중에)
    const r = Save.runner('zero');
    const x = PX + 10;
    const y = PY + 30;
    this.panel.add(this.add.rectangle(x, y, 150, 168, 0x2a1050, 1).setOrigin(0).setStrokeStyle(2, COLORS.magenta));
    this.panel.add(this.add.image(x + 75, y + 40, r.texture).setScale(2));
    this.panel.add(this.add.text(x + 75, y + 80, r.name, T(14, '#ffffff')).setOrigin(0.5, 0));
    this.panel.add(this.add.text(x + 75, y + 100, weapons[r.startWeapon as keyof typeof weapons].name, T(11, '#00f0ff')).setOrigin(0.5, 0));
    this.panel.add(this.add.text(x + 75, y + 118, tr('bar.fixedWeapon'), { ...T(10, '#8a7aa8'), align: 'center', wordWrap: { width: 140, useAdvancedWrap: true } }).setOrigin(0.5, 0));
    // 들고 나갈 OS (뽑기로 해금한 것 중에서)
    const opts = this.osOptions();
    const os = new OsState(Save.data.os, Save.osLevel(Save.data.os));
    const ox = PX + 172;
    this.panel.add(this.add.text(ox, y, tr('bar.os'), T(12, '#c8b8e8')));
    if (opts.length > 1) {
      this.button(ox + 40, y + 20, 24, '◀', true, () => this.cycleOs(-1), COLORS.cyan);
      this.button(ox + 270, y + 20, 24, '▶', true, () => this.cycleOs(1), COLORS.cyan);
    }
    this.panel.add(this.add.text(ox + 148, y + 21, `${os.name}  Lv${os.level}`, T(13, os.def.color)).setOrigin(0.5, 0));
    let ly = y + 46;
    for (const l of os.lines()) {
      const t = this.add.text(ox, ly, `${l.on ? '●' : '○'} ${l.text}`, { ...T(10, l.on ? '#e8f7ff' : '#5a4a78'), wordWrap: { width: PW - 182, useAdvancedWrap: true } });
      this.panel.add(t);
      ly += t.height + 3;
    }
    if (opts.length <= 1) this.panel.add(this.add.text(ox, ly + 4, tr('bar.osHint'), T(10, '#6a5a88')));
  }

  /** 낄 수 있는 OS (해금한 것) */
  private osOptions(): string[] {
    return OS_IDS.filter((id) => Save.osLevel(id) > 0);
  }

  private cycleOs(dir: number): void {
    const opts = this.osOptions();
    const i = (opts.indexOf(Save.data.os) + dir + opts.length) % opts.length;
    Save.equipOs(opts[i]);
    Sound.play('hover');
    this.refresh();
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
            this.tutorial();
          }
        });
    });
  }

  // ───────────────────────────── OS 뽑기 (개편 4단계) ─────────────────────────────
  /** 마지막 뽑기 결과 (탭을 다시 그려도 보이게) */
  private lastPull: { id: string; before: number; after: number; refund: number }[] = [];

  private drawOs(): void {
    const G = OS_GACHA;
    const pool = Object.keys(G.weights).filter((id) => OS_DEFS[id]?.enabled !== false);
    const total = pool.reduce((a, id) => a + (G.weights as Record<string, number>)[id], 0);
    const unlocked = pool.filter((id) => Save.osLevel(id) > 0).length;
    this.title(tr('os.title'), tr('os.sub', { a: unlocked, b: pool.length }));
    // 뽑기 버튼 + 확률 공개
    const by = PY + 30;
    this.button(PX + 130, by, 118, tr('os.pull1', { c: fmt(G.price) }), Save.data.credits >= G.price, () => this.pull(1));
    this.button(PX + 256, by, 118, tr('os.pull10', { c: fmt(G.tenPrice) }), Save.data.credits >= G.tenPrice, () => this.pull(10));
    this.panel.add(this.add.text(PX + 266, by + 3, tr('os.odds', { p: Math.round((1000 / pool.length) * ((G.weights as Record<string, number>)[pool[0]] / (total / pool.length))) / 10, refund: G.refund }), T(10, '#8a7aa8')));
    // OS 7종: 레벨·개수·장착
    pool.forEach((id, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = PX + 10 + col * 232;
      const y = PY + 56 + row * 44;
      const def = OS_DEFS[id];
      const lv = Save.osLevel(id);
      const next = Save.osNext(id);
      const on = Save.data.os === id;
      const color = Phaser.Display.Color.HexStringToColor(def.color).color;
      this.panel.add(this.add.rectangle(x, y, 226, 40, on ? 0x1a1040 : 0x140c2a, 1).setOrigin(0).setStrokeStyle(on ? 2 : 1, lv > 0 ? color : 0x3a2466));
      const key = this.textures.exists(`os_${id}`) ? `os_${id}` : null;
      if (key) this.panel.add(this.add.image(x + 20, y + 20, key).setDisplaySize(30, 30).setAlpha(lv > 0 ? 1 : 0.3));
      this.panel.add(this.add.text(x + 40, y + 4, I18n.lang === 'en' && def.nameEn ? def.nameEn : def.name, T(12, lv > 0 ? def.color : '#6a5a88')));
      this.panel.add(this.add.text(x + 40, y + 21, lv > 0 ? `Lv${lv}${next ? `  ·  ${next.have}/${next.need}` : `  ·  ${tr('os.max')}`}` : tr('os.locked'), T(10, lv > 0 ? '#e8f7ff' : '#6a5a88')));
      if (lv > 0) this.button(x + 220, y + 11, 50, on ? tr('os.equipped') : tr('os.equip'), !on, () => {
        Save.equipOs(id);
        Sound.play('select');
        this.refresh();
      }, COLORS.cyan);
    });
    // 마지막 뽑기 결과
    if (this.lastPull.length) {
      const parts = this.lastPull.map((r) => {
        const name = OS_DEFS[r.id]?.name ?? r.id;
        if (r.refund) return `${name} ₵+${r.refund}`;
        if (r.before === 0) return `${name} NEW`;
        if (r.after > r.before) return `${name} Lv${r.after}↑`;
        return name;
      });
      this.hint.setText(`${tr('os.result')} ${parts.join(' · ')}`);
    }
  }

  private pull(n: 1 | 10): void {
    const res = Save.pullOs(n);
    if (!res) {
      Sound.play('block');
      notify(this, tr('clinic.poor'));
      return;
    }
    this.lastPull = res;
    Sound.play(res.some((r) => r.before === 0 || r.after > r.before) ? 'levelup' : 'select');
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

  /** 출격. startZone: 임시 'N챕터부터' 버튼 (0 = 처음부터). 장면 데이터는 다음 시작에도 남으므로 늘 넘긴다 */
  private deploy(startZone = 0): void {
    // 개편판: 러너는 제로 한 명
    Save.data.runner = 'zero';
    Sound.play('start');
    this.scene.start('Game', { startZone });
  }
}
