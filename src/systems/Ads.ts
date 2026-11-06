/**
 * 광고 연결부. 빌드할 때 VITE_ADS 로 어디에 올릴지 고른다.
 *  - none       : 광고 없음 (기본값, claude.ai 미리보기·itch.io)
 *  - h5         : 내 웹사이트 + Google AdSense H5 게임 광고 (Ad Placement API)
 *  - crazygames : CrazyGames 포털 (포털이 광고를 넣고 수익을 나눔)
 *  - admob      : 안드로이드 앱 (Capacitor + AdMob)
 *
 * 광고 위치는 두 곳뿐이다.
 *  - interstitial: 판이 끝나고 아지트로 돌아갈 때 (첫 판 제외, 3분에 최대 1번)
 *  - rewarded    : 결과 화면의 "광고 보고 크레딧 2배" 버튼 (판마다 1번, 플레이어가 고를 때만)
 */
type Provider = 'none' | 'h5' | 'crazygames' | 'admob';

const env = import.meta.env;
const PROVIDER = ((env.VITE_ADS as string) || 'none') as Provider;
const TEST = env.VITE_AD_TEST === '1';
const INTERSTITIAL_GAP_MS = 3 * 60 * 1000;

type AdEvents = { onStart?: () => void; onEnd?: () => void };

interface CrazySdk {
  init(): Promise<void>;
  ad: { requestAd(type: 'midgame' | 'rewarded', cb: { adStarted?: () => void; adFinished?: () => void; adError?: (e: unknown) => void }): void };
  game: { gameplayStart(): void; gameplayStop(): void; loadingStart(): void; loadingStop(): void };
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
let crazy: CrazySdk | null = null;
// AdMob 플러그인은 앱 빌드에서만 불러온다 (웹 번들에 섞이지 않게)
let admob: typeof import('@capacitor-community/admob').AdMob | null = null;

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

export const Ads = {
  provider: PROVIDER,

  /** 보상형 광고 버튼을 보여줄지 */
  get rewardedAvailable(): boolean {
    return ready && PROVIDER !== 'none';
  },

  async init(): Promise<void> {
    try {
      if (PROVIDER === 'h5') {
        const client = env.VITE_ADSENSE_CLIENT as string | undefined;
        if (!client) return;
        window.adsbygoogle = window.adsbygoogle || [];
        window.adBreak = window.adConfig = (o) => window.adsbygoogle!.push(o);
        const attrs: Record<string, string> = { 'data-ad-client': client, crossorigin: 'anonymous' };
        if (TEST) attrs['data-adbreak-test'] = 'on';
        // 웹 빌드는 index.html 에 이미 태그가 있으므로 다시 넣지 않는다
        if (!document.querySelector('script[src*="adsbygoogle.js"]')) await loadScript(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`, attrs);
        else if (TEST) document.documentElement.setAttribute('data-adbreak-test', 'on');
        window.adConfig?.({ preloadAdBreaks: 'on', sound: 'on' });
        ready = true;
      } else if (PROVIDER === 'crazygames') {
        await loadScript('https://sdk.crazygames.com/crazygames-sdk-v3.js');
        crazy = window.CrazyGames?.SDK ?? null;
        await crazy?.init();
        ready = !!crazy;
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

  /** 포털이 플레이 중인지 알고 싶어 할 때 (CrazyGames 규칙) */
  gameplayStart(): void {
    crazy?.game.gameplayStart();
  },
  gameplayStop(): void {
    crazy?.game.gameplayStop();
  },

  /** 판이 끝난 뒤 전면 광고. 첫 판은 건너뛰고, 3분에 1번까지 */
  async interstitial(ev: AdEvents = {}): Promise<void> {
    runsFinished++;
    if (!ready || runsFinished < 2 || Date.now() - lastInterstitial < INTERSTITIAL_GAP_MS) return;
    lastInterstitial = Date.now();
    await new Promise<void>((resolve) => {
      const done = () => {
        ev.onEnd?.();
        resolve();
      };
      if (PROVIDER === 'h5' && window.adBreak) {
        window.adBreak({ type: 'next', name: 'run-end', beforeAd: ev.onStart, afterAd: ev.onEnd, adBreakDone: () => resolve() });
      } else if (crazy) {
        crazy.ad.requestAd('midgame', { adStarted: ev.onStart, adFinished: done, adError: done });
      } else if (admob) {
        const adId = (env.VITE_ADMOB_INTERSTITIAL as string) || 'ca-app-pub-3940256099942544/1033173712';
        ev.onStart?.();
        admob
          .prepareInterstitial({ adId, isTesting: TEST })
          .then(() => admob!.showInterstitial())
          .then(done, done);
      } else resolve();
    });
  },

  /** 보상형 광고. 끝까지 보면 true */
  rewarded(ev: AdEvents = {}): Promise<boolean> {
    if (!ready) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      let rewarded = false;
      const finish = () => {
        ev.onEnd?.();
        resolve(rewarded);
      };
      if (PROVIDER === 'h5' && window.adBreak) {
        let shown = false;
        window.adBreak({
          type: 'reward',
          name: 'double-credits',
          beforeAd: ev.onStart,
          afterAd: ev.onEnd,
          beforeReward: (showAdFn: () => void) => {
            shown = true;
            showAdFn();
          },
          adDismissed: () => (rewarded = false),
          adViewed: () => (rewarded = true),
          adBreakDone: () => resolve(shown && rewarded),
        });
      } else if (crazy) {
        crazy.ad.requestAd('rewarded', {
          adStarted: ev.onStart,
          adFinished: () => {
            rewarded = true;
            finish();
          },
          adError: finish,
        });
      } else if (admob) {
        const adId = (env.VITE_ADMOB_REWARDED as string) || 'ca-app-pub-3940256099942544/5224354917';
        ev.onStart?.();
        admob
          .prepareRewardVideoAd({ adId, isTesting: TEST })
          .then(() => admob!.showRewardVideoAd())
          .then(() => {
            rewarded = true;
            finish();
          }, finish);
      } else resolve(false);
    });
  },
};
