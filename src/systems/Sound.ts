import Phaser from 'phaser';
import audio from '../data/audio.json';
import { Ads } from './Ads';

export type SfxKey = keyof typeof audio.sfx;
export type MusicKey = keyof typeof audio.music;
type Vol = Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound;

const STORAGE_KEY = 'ztl-muted';
let game: Phaser.Game | null = null;
const lastPlayed = new Map<string, number>();
let current: { key: MusicKey; sound: Vol } | null = null;
let pending: MusicKey | null = null;
let duckFactor = 1;
/** 사용자가 끈 소리 / 포털(CrazyGames)이 끈 소리 — 둘 중 하나라도 켜져 있으면 음소거 */
let userMuted = false;
let portalMuted = false;
const applyMute = () => {
  if (game) game.sound.mute = userMuted || portalMuted;
};
/** 이 시각까지 다른 효과음을 줄인다 (슬로우 모션 '우우웅'이 잘 들리게) */
let sfxDuckUntil = 0;

/** 장면 전환과 무관하게 볼륨을 서서히 바꾼다 (장면이 꺼져도 페이드가 끊기지 않게 rAF 사용) */
function fade(s: Vol, from: number, to: number, ms: number, done?: () => void): void {
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    if (!s.manager) return; // 이미 파괴됨
    s.volume = from + (to - from) * k;
    if (k < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}

const target = (key: MusicKey) => audio.musicVolume * audio.music[key].volume * duckFactor;

/** 효과음·배경음악 관리. 모든 장면이 같은 전역 사운드 매니저를 쓴다 */
export const Sound = {
  preload(scene: Phaser.Scene): void {
    for (const k of Object.keys(audio.sfx)) scene.load.audio(`sfx-${k}`, `audio/sfx/${k}.mp3`);
    for (const [k, m] of Object.entries(audio.music)) scene.load.audio(`music-${k}`, `audio/${m.file}`);
  },

  init(g: Phaser.Game): void {
    game = g;
    let muted = false;
    try {
      muted = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      /* 저장소를 못 쓰는 환경 */
    }
    userMuted = muted;
    applyMute();
    Ads.onPortalMute((m) => {
      portalMuted = m;
      applyMute();
    });
  },

  get muted(): boolean {
    return game?.sound.mute ?? false;
  },

  toggleMute(): boolean {
    if (!game) return false;
    userMuted = !userMuted;
    applyMute();
    try {
      localStorage.setItem(STORAGE_KEY, userMuted ? '1' : '0');
    } catch {
      /* 무시 */
    }
    return game.sound.mute;
  },

  /** 효과음. 같은 소리가 minGap(ms) 안에 다시 오면 무시해서 겹쳐 시끄러워지지 않게 한다 */
  play(key: SfxKey): void {
    if (!game || game.sound.mute) return;
    const def = audio.sfx[key];
    const now = performance.now();
    if (now - (lastPlayed.get(key) ?? -1e9) < def.minGap) return;
    lastPlayed.set(key, now);
    if (!game.cache.audio.exists(`sfx-${key}`)) return;
    if (key === 'slowmo') sfxDuckUntil = now + audio.slowmoDuck.ms;
    const duck = key !== 'slowmo' && now < sfxDuckUntil ? audio.slowmoDuck.factor : 1;
    game.sound.play(`sfx-${key}`, { volume: def.volume * audio.sfxVolume * duck, detune: (Math.random() * 2 - 1) * def.detune });
  },

  /** 배경음악 교체 (교차 페이드). null이면 끈다 */
  music(key: MusicKey | null, fadeMs = 700): void {
    if (!game) return;
    if (current?.key === key) return;
    pending = key;
    const old = current;
    current = null;
    if (old) fade(old.sound, old.sound.volume, 0, fadeMs, () => old.sound.destroy());
    if (!key) return;
    const start = () => {
      if (pending !== key || !game || !game.cache.audio.exists(`music-${key}`)) return;
      const s = game.sound.add(`music-${key}`, { loop: true, volume: 0 }) as Vol;
      s.play();
      current = { key, sound: s };
      fade(s, 0, target(key), fadeMs);
    };
    // 브라우저는 사용자가 한 번 누르기 전까지 소리를 막으므로, 그 뒤에 시작
    if (game.sound.locked) game.sound.once(Phaser.Sound.Events.UNLOCKED, start);
    else start();
  },

  /** 배경음악 재생 속도 (슬로우 모션 때 음악도 느려지며 음이 내려감). 1 = 원래 속도 */
  musicRate(r: number): void {
    if (current && 'setRate' in current.sound) current.sound.setRate(Phaser.Math.Clamp(r, 0.5, 1));
  },

  /** 광고가 나오는 동안 모든 소리를 멈췄다가 다시 튼다 */
  adPause(on: boolean): void {
    if (!game) return;
    if (on) game.sound.pauseAll();
    else game.sound.resumeAll();
  },

  /** 일시정지 등에서 배경음악을 잠시 줄인다 (1 = 원래 크기) */
  duck(f: number): void {
    duckFactor = f;
    if (current) current.sound.volume = target(current.key);
  },
};
