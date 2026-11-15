const KEY = 'ztl-reduced-fx';
const DMG_KEY = 'ztl-dmg-num';
let reduced = false;
let dmgNumbers = true;
try {
  reduced = localStorage.getItem(KEY) === '1';
  dmgNumbers = localStorage.getItem(DMG_KEY) !== '0';
} catch {
  /* 저장소를 못 쓰는 환경 */
}

/** 플레이어 설정 (브라우저에 기억) */
export const Settings = {
  /** 화면 효과 줄이기: 흔들림·번쩍임·글리치·속도선을 끈다 */
  get reducedFx(): boolean {
    return reduced;
  },
  toggleReducedFx(): boolean {
    reduced = !reduced;
    try {
      localStorage.setItem(KEY, reduced ? '1' : '0');
    } catch {
      /* 무시 */
    }
    return reduced;
  },
  /** 피해 숫자 표시 (기본 켬). 끄면 치명타 숫자도 꺼진다 */
  get dmgNumbers(): boolean {
    return dmgNumbers;
  },
  toggleDmgNumbers(): boolean {
    dmgNumbers = !dmgNumbers;
    try {
      localStorage.setItem(DMG_KEY, dmgNumbers ? '1' : '0');
    } catch {
      /* 무시 */
    }
    return dmgNumbers;
  },
};
