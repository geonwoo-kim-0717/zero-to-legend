import Phaser from 'phaser';
import enemies from '../data/enemies.json';
import type { EnemyId } from '../entities/Enemy';
import { VIEW_W, VIEW_H } from '../config';
import gameData from '../data/game.json';
import { plan, RANGED, type DirSense, type DirPlan } from './Director';

/**
 * 챕터 시작부터 흐른 시간(초)에 따른 일반 적 체력 배율. game.json hpCurve 점들을 직선으로 잇고,
 * 마지막 점 뒤로는 마지막 구간의 기울기로 늘린다 (플레이어 성장 측정값에 맞춘 곡선).
 */
const CURVE = (gameData as unknown as { hpCurve: [number, number][] }).hpCurve;
export function hpScaleAt(elapsed: number): number {
  const t = Math.max(0, elapsed);
  for (let i = 1; i < CURVE.length; i++) {
    const [t1, v1] = CURVE[i];
    if (t <= t1) {
      const [t0, v0] = CURVE[i - 1];
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  const [ta, va] = CURVE[CURVE.length - 2];
  const [tb, vb] = CURVE[CURVE.length - 1];
  return vb + ((vb - va) * (t - tb)) / (tb - ta);
}

export interface Wave {
  start: number;
  end: number;
  interval: number;
  count: number;
  weights: Record<string, number>;
}

type SpawnFn = (id: EnemyId, x: number, y: number, hpScale: number) => void;

/** 가중치 표에서 하나를 무작위로 고른다 */
function pickWeighted(weights: Record<string, number>): string {
  const entries = Object.entries(weights);
  let n = Math.random() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [id, w] of entries) {
    n -= w;
    if (n < 0) return id;
  }
  return entries[0][0];
}

/** waves.json에 정의된 시간대별 규칙에 따라 화면 밖에서 적을 생성한다 */
export class Spawner {
  private timer = 0;
  private readonly ringR = Math.hypot(VIEW_W / 2, VIEW_H / 2) + gameData.spawn.ringExtra;

  constructor(private readonly spawn: SpawnFn) {}

  /** 최근 스폰 시각 (처치 속도 계산용) */
  private spawnTimes: number[] = [];
  /** 마지막 디렉터 판단 (디버그 표시용) */
  last: DirPlan | null = null;

  /** 최근 window초 동안 스폰한 수 */
  recentSpawns(now: number, window: number): number {
    while (this.spawnTimes.length && this.spawnTimes[0] < now - window) this.spawnTimes.shift();
    return this.spawnTimes.length;
  }

  /**
   * zt: 지금 구역에서 흐른 시간 (웨이브 표는 구역마다 따로), elapsed: 전체 시간 (체력 증가).
   * sense가 있으면 디렉터(Director.ts)가 스폰 수·원거리 비율·포위도를 정한다
   */
  update(dt: number, elapsed: number, zt: number, waves: Wave[], px: number, py: number, hpMul = 1, countMul = 1, sense?: DirSense, now = 0): void {
    const wave = waves.find((w) => zt >= w.start && zt < w.end);
    if (!wave) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = wave.interval;
    const hpScale = hpScaleAt(elapsed) * hpMul;
    const dir = sense ? plan(sense) : null;
    this.last = dir;
    // countMul: 챕터 초반 워밍업 × 디렉터. 소수점은 확률로 반올림해 평균 수를 맞춘다
    const exact = wave.count * countMul * (dir ? dir.countMul : 1);
    const n = Math.max(1, Math.floor(exact) + (Math.random() < exact % 1 ? 1 : 0));
    // 원거리 가중치에 디렉터 배율
    const weights = dir ? Object.fromEntries(Object.entries(wave.weights).map(([id, w]) => [id, RANGED.has(id) ? w * dir.rangedMul : w])) : wave.weights;
    // 포위도: 적마다 surround 확률로 사방 무작위, 아니면 무리 방향(체력이 낮으면 1곳, 중간이면 2곳)으로 몰려온다
    const packs = dir && dir.surround < 0.35 ? 1 : 2;
    const anchors = Array.from({ length: packs }, () => Math.random() * Math.PI * 2);
    const spread = (gameData.director.packSpread * Math.PI) / 180;
    for (let i = 0; i < n; i++) {
      const a = !dir || Math.random() < dir.surround ? undefined : anchors[i % packs] + Phaser.Math.FloatBetween(-spread, spread);
      this.spawnAround(pickWeighted(weights) as EnemyId, px, py, hpScale, false, a);
      this.spawnTimes.push(now);
    }
  }

  /** single: 멀어진 적을 다시 데려올 때는 무리를 새로 만들지 않는다 */
  spawnAround(id: EnemyId, px: number, py: number, hpScale: number, single = false, angle?: number): void {
    if (!(id in enemies)) return;
    const a = angle ?? Math.random() * Math.PI * 2;
    const r = this.ringR + Math.random() * gameData.spawn.ringJitter;
    const x = px + Math.cos(a) * r;
    const y = py + Math.sin(a) * r;
    // 쥐떼 봇처럼 무리로 나오는 적은 한 자리에 여럿
    const group = single ? 1 : ((enemies[id] as { group?: number }).group ?? 1);
    for (let i = 0; i < group; i++) this.spawn(id, x + (i ? Phaser.Math.Between(-12, 12) : 0), y + (i ? Phaser.Math.Between(-12, 12) : 0), hpScale);
  }
}
