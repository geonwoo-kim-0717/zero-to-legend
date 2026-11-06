/**
 * 광고 연결부. 빌드할 때 VITE_ADS 로 어디에 올릴지 고른다.
 *  - none       : 광고 없음 (기본값, claude.ai 미리보기)
 *  - h5         : 내 웹사이트 + Google AdSense H5 게임 광고 (Ad Placement API)
 *  - crazygames : CrazyGames 포털 (포털이 광고를 넣고 수익을 나눔)
 *  - admob      : 안드로이드 앱 (Capacitor + AdMob)
 *
 * 광고 위치는 두 곳뿐이다.
 *  - interstitial: 판이 끝나고 아지트로 돌아갈 때 (첫 판 제외, 3분에 최대 1번)
 *  - rewarded    : 결과 화면의 "광고 보고 크레딧 2배" 버튼 (판마다 1번, 플레이어가 고를 때만)
 *
 * 광고가 오지 않을 때(승인 전, 광고 없음, 차단 등) 게임이 멈추지 않도록
 * 모든 요청에 시간 제한을 둔다: 일정 시간 안에 광고가 시작되지 않으면 그냥 넘어간다.
 */
type Provider = 'none' | 'h5' | 'crazygames' | 'admob';

const env = import.meta.env;
const PROVIDER = ((env.VITE_ADS as string) || 'none') as Provider;
const TEST = env.VITE_AD_TEST === '1';
const INTERSTITIAL_GAP_MS = 3 * 60 * 1000;
/** 광고 요청 뒤 이 시간 안에 광고가 시작되지 않으면 포기 */
const START_TIMEOUT_MS = 5000;
/** 광고가 시작된 뒤 끝 신호가 이 시간 안에 안 오면 포기 (안전장치) */
const MAX_AD_MS = 90000;

type AdEvents = { onStart?: () => void; onEnd?: () => void };

interface CrazySdk {
  init(): Promise<void>;
  ad: { requestAd(type: 'midgame' | 'rewarded', cb: { adStarted?: () => void; adFinished?: () => void; adError?: (e: unknown) => void }): void };
  game: {
    gameplayStart(): void;
    gameplayStop(): void;
    loadingStart(): void;
    loadingStop(): void;
    settings?: { muteAudio?: boolean };
    addSettingsChangeListener?(fn: (s: { muteAudio?: boolean }) => void): void;
  };
}
type AdBreak = (o: Record<string, unknown>) => void;
declare global {
  interface Window {
    CrazyGames?: { SDK: CrazySdk };
    adsbygoogle?: unknown[];
    adBreak?: AdBreak;
    adConfig?: AdBreak;
  }
}

let ready = false;
let lastInterstitial = 0;
let runsFinished = 0;
let playing = false;
let crazy: CrazySdk | null = null;
/** h5: 미리 받아 둔 보상형 광고를 보여주는 함수 (Google이 광고가 있을 때만 줌) */
let h5ShowReward: (() => void) | null = null;
let h5RewardResult: ((ok: boolean) => void) | null = null;
// AdMob 플러그인은 앱 빌드에서만 불러온다 (웹 번들에 섞이지 않게)
let admob: typeof import('@capacitor-community/admob').AdMob | null = null;
/** 포털이 요청한 강제 음소거 (CrazyGames muteAudio) */
let portalMute: ((muted: boolean) => void) | null = null;

function loadScript(src: string, attrs: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`load failed: ${src}`));
    document.head.appendChild(s);
  });
}

/**
 * 광고 한 번을 시간 제한과 함께 실행한다.
 * run(started, done): 광고가 시작되면 started(), 끝나면 done(보상 여부)를 부른다.
 */
function guarded(ev: AdEvents, run: (started: () => void, done: (ok: boolean) => void) => void, startTimeout = START_TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    let finished = false;
    let began = false;
    const done = (ok: boolean) => {
      if (finished) return;
      finished = true;
      clearTimeout(startTimer);
      clearTimeout(maxTimer);
      if (began) ev.onEnd?.();
      resolve(ok);
    };
    const started = () => {
      if (began || finished) return;
      began = true;
      clearTimeout(startTimer);
      ev.onStart?.();
    };
    const startTimer = setTimeout(() => !began && done(false), startTimeout);
    const maxTimer = setTimeout(() => done(false), MAX_AD_MS);
    try {
      run(started, done);
    } catch (e) {
      console.warn('[ads] request failed', e);
      done(false);
    }
  });
}

export const Ads = {
  provider: PROVIDER,

  /** 포털의 음소거 요청을 받을 곳 (Sound에서 등록) */
  onPortalMute(fn: (muted: boolean) => void): void {
    portalMute = fn;
    if (crazy?.game.settings?.muteAudio !== undefined) fn(!!crazy.game.settings.muteAudio);
  },

  async init(): Promise<void> {
    try {
      if (PROVIDER === 'h5') {
        const client = env.VITE_ADSENSE_CLIENT as string | undefined;
        if (!client) return;
        window.adsbygoogle = window.adsbygoogle || [];
        window.adBreak = window.adConfig = (o) => window.adsbygoogle!.push(o);
        if (TEST) document.documentElement.setAttribute('data-adbreak-test', 'on');
        // 웹 빌드는 index.html 에 이미 태그가 있으므로 다시 넣지 않는다
        if (!document.querySelector('script[src*="adsbygoogle.js"]')) {
          const attrs: Record<string, string> = { 'data-ad-client': client, crossorigin: 'anonymous' };
          if (TEST) attrs['data-adbreak-test'] = 'on';
          await loadScript(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`, attrs);
        }
        window.adConfig?.({ preloadAdBreaks: 'on', sound: 'on' });
        ready = true;
      } else if (PROVIDER === 'crazygames') {
        await loadScript('https://sdk.crazygames.com/crazygames-sdk-v3.js');
        crazy = window.CrazyGames?.SDK ?? null;
        await crazy?.init();
        ready = !!crazy;
        // 포털 설정의 음소거를 게임 소리보다 우선
        crazy?.game.addSettingsChangeListener?.((s) => portalMute?.(!!s.muteAudio));
        if (crazy?.game.settings?.muteAudio !== undefined) portalMute?.(!!crazy.game.settings.muteAudio);
      } else if (PROVIDER === 'admob') {
        const mod = await import('@capacitor-community/admob');
        admob = mod.AdMob;
        await admob.initialize({ initializeForTesting: TEST });
        // 유럽 등 동의가 필요한 지역이면 동의 창 (UMP)
        const consent = await admob.requestConsentInfo();
        if (consent.isConsentFormAvailable && consent.status === mod.AdmobConsentStatus.REQUIRED) await admob.showConsentForm();
        ready = true;
      }
    } catch (e) {
      console.warn('[ads] init failed', e);
      ready = false;
    }
  },

  /** 로딩 시작·끝 (CrazyGames 규칙) */
  loadingStart(): void {
    crazy?.game.loadingStart();
  },
  loadingStop(): void {
    crazy?.game.loadingStop();
  },

  /** 실제로 조작하며 플레이 중인지 포털에 알린다. 메뉴·일시정지·레벨업 화면에서는 false */
  setPlaying(on: boolean): void {
    if (on === playing) return;
    playing = on;
    if (on) crazy?.game.gameplayStart();
    else crazy?.game.gameplayStop();
  },

  /**
   * 보상형 광고를 볼 수 있는지 미리 확인한다. 볼 수 있을 때만 버튼을 보여주기 위함.
   * h5는 Google이 광고를 준비했을 때만 beforeReward를 불러준다 (Google 권장 방식).
   */
  prepareRewarded(): Promise<boolean> {
    if (!ready) return Promise.resolve(false);
    if (PROVIDER !== 'h5') return Promise.resolve(true);
    if (!window.adBreak) return Promise.resolve(false);
    h5ShowReward = null;
    return new Promise((resolve) => {
      let answered = false;
      const answer = (ok: boolean) => {
        if (answered) return;
        answered = true;
        resolve(ok);
      };
      setTimeout(() => answer(false), START_TIMEOUT_MS);
      window.adBreak!({
        type: 'reward',
        name: 'double-credits',
        beforeAd: () => this.adEvents?.onStart?.(),
        afterAd: () => this.adEvents?.onEnd?.(),
        beforeReward: (showAdFn: () => void) => {
          h5ShowReward = showAdFn;
          answer(true);
        },
        adDismissed: () => h5RewardResult?.(false),
        adViewed: () => h5RewardResult?.(true),
        adBreakDone: () => {
          answer(false);
          h5RewardResult?.(false);
        },
      });
    });
  },

  /** h5 보상형 광고가 진행되는 동안 쓰는 이벤트 */
  adEvents: null as AdEvents | null,

  /** 보상형 광고. 끝까지 보면 true. 광고가 안 오면 몇 초 뒤 false */
  rewarded(ev: AdEvents = {}): Promise<boolean> {
    if (!ready) return Promise.resolve(false);
    if (PROVIDER === 'h5') {
      const show = h5ShowReward;
      h5ShowReward = null;
      if (!show) return Promise.resolve(false);
      this.adEvents = ev;
      return new Promise((resolve) => {
        const guard = setTimeout(() => finish(false), MAX_AD_MS);
        const finish = (ok: boolean) => {
          clearTimeout(guard);
          h5RewardResult = null;
          this.adEvents = null;
          resolve(ok);
        };
        h5RewardResult = finish;
        show();
      });
    }
    return guarded(ev, (started, done) => {
      if (crazy) {
        crazy.ad.requestAd('rewarded', { adStarted: started, adFinished: () => done(true), adError: () => done(false) });
      } else if (admob) {
        const adId = (env.VITE_ADMOB_REWARDED as string) || 'ca-app-pub-3940256099942544/5224354917';
        admob
          .prepareRewardVideoAd({ adId, isTesting: TEST })
          .then(() => {
            started();
            return admob!.showRewardVideoAd();
          })
          .then(
            () => done(true),
            () => done(false),
          );
      } else done(false);
    });
  },

  /** 판이 끝난 뒤 전면 광고. 첫 판은 건너뛰고, 3분에 1번까지. 광고가 안 오면 몇 초 뒤 그냥 진행 */
  async interstitial(ev: AdEvents = {}): Promise<void> {
    runsFinished++;
    if (!ready || runsFinished < 2 || Date.now() - lastInterstitial < INTERSTITIAL_GAP_MS) return;
    lastInterstitial = Date.now();
    await guarded(ev, (started, done) => {
      if (PROVIDER === 'h5' && window.adBreak) {
        window.adBreak({ type: 'next', name: 'run-end', beforeAd: started, afterAd: () => done(true), adBreakDone: () => done(false) });
      } else if (crazy) {
        crazy.ad.requestAd('midgame', { adStarted: started, adFinished: () => done(true), adError: () => done(false) });
      } else if (admob) {
        const adId = (env.VITE_ADMOB_INTERSTITIAL as string) || 'ca-app-pub-3940256099942544/1033173712';
        admob
          .prepareInterstitial({ adId, isTesting: TEST })
          .then(() => {
            started();
            return admob!.showInterstitial();
          })
          .then(
            () => done(true),
            () => done(false),
          );
      } else done(false);
    }, 3000);
  },
};
