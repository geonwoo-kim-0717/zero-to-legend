"""블랙 실드 출동 효과음 3종 (게임의 다른 효과음처럼 짧고 묵직하게, 음 높이가 크게 미끄러지는 성분 없이)
- shiphover.mp3  : 이송기가 멈춰 떠 있을 때 덕트 엔진 소리 (저음 웅웅 + 터빈 바람, 1.7초, 끝은 서서히 줄어듦)
- trooperland.mp3: 요원 착지 '쿵' (저음 충격 + 금속 장갑 철컥 + 짧은 먼지 바람, 0.45초)
- trooperdash.mp3: 요원 회피 대시 (짧은 바람 '쉭' + 서보 모터 지잉, 0.25초)
사용: python3 tools/audio/synth_raid.py  (ffmpeg 필요)"""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from synth_shotgun import SR, lowpass, write

OUT = os.path.join(os.path.dirname(__file__), '../../public/audio/sfx')
rng = np.random.default_rng(11)


def norm(x, peak=0.95):
    return (x / np.max(np.abs(x)) * peak).astype(np.float32)


def shiphover(dur=1.7):
    n = int(SR * dur); t = np.arange(n) / SR
    noise = rng.uniform(-1, 1, n)
    env = np.minimum(1, t / 0.15) * np.clip((dur - t) / 0.6, 0, 1)
    # 저음 웅웅: 48Hz + 배음, 약한 떨림
    wob = 1 + 0.04 * np.sin(2 * np.pi * 7 * t)
    hum = (np.sin(2 * np.pi * 48 * t * wob) + 0.5 * np.sin(2 * np.pi * 96 * t) + 0.25 * np.sin(2 * np.pi * 144 * t)) * 0.8
    # 덕트 바람: 대역 잡음 (어두운 쪽)
    wind = (lowpass(noise, 900) - lowpass(noise, 180)) * 2.2
    # 터빈: 아주 작은 고음 (거의 일정한 높이)
    turb = np.sin(2 * np.pi * (620 + 15 * np.sin(2 * np.pi * 3 * t)) * t) * 0.06
    # 착지 순간 '푸쉭' (처음 0.3초 밝은 바람)
    puff = (noise - lowpass(noise, 2000)) * np.exp(-t / 0.12) * 0.5
    x = (hum + wind + turb) * env + puff
    return norm(np.tanh(x * 1.2), 0.85)


def trooperland(dur=0.45):
    n = int(SR * dur); t = np.arange(n) / SR
    noise = rng.uniform(-1, 1, n)
    f = 64 - 22 * np.minimum(1, t / 0.08)
    thump = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.08) * 1.2
    body = lowpass(noise, 700) * np.exp(-t / 0.05) * 2.0
    # 장갑 철컥: 두 개의 짧은 금속음 (조금 어긋나게)
    clank = np.zeros(n)
    for at, fr in ((0.004, 1350), (0.022, 1720)):
        k = np.clip(t - at, 0, None)
        clank += np.sin(2 * np.pi * fr * k) * np.exp(-k / 0.018) * (t >= at) * 0.35
    dust = (lowpass(noise, 2500) - lowpass(noise, 400)) * np.exp(-t / 0.14) * 0.6
    x = (thump + body + clank + dust) * np.minimum(1, t / 0.001)
    return norm(np.tanh(x * 1.5) / np.tanh(1.5))


def trooperdash(dur=0.25):
    n = int(SR * dur); t = np.arange(n) / SR
    noise = rng.uniform(-1, 1, n)
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5
    whoosh = (lowpass(noise, 3000) - lowpass(noise, 500)) * env * 1.6
    # 서보 지잉: 짧은 중음, 높이는 살짝만 오름
    servo = np.sign(np.sin(2 * np.pi * (300 + 120 * t / dur) * t)) * 0.08 * np.exp(-t / 0.08)
    return norm(np.tanh((whoosh + servo) * 1.3), 0.8)


if __name__ == '__main__':
    for name, fn in (('shiphover', shiphover), ('trooperland', trooperland), ('trooperdash', trooperdash)):
        path = os.path.join(OUT, f'{name}.mp3')
        write(path, fn())
        print('wrote', os.path.abspath(path))
