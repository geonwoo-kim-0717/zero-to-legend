"""보스(코박·바실리) 기술별 효과음 합성 (CC0, 이 게임용으로 직접 합성)
사용: python3 tools/audio/synth_boss.py  → public/audio/sfx/boss_*.mp3 (ffmpeg 필요)

코박: 갈고리 예고(톱니 감기)·발사(쉭+사슬)·명중(쇠 부딪힘)·감아들이기(사슬 끌림),
      돌진 예고(엔진 공회전)·돌진(분사 굉음), 점프(도약 바람), 내리찍기 착지(쿵+파편), 드론 소환(신호음)
바실리: 개틀링 회전(모터 상승음)·한 발(짧은 탕), 발구르기 예고(유압 쉭)·착지(깊은 충격파),
        호위 호출(무전 잡음+호루라기), 2페이즈 전환(코트 찢기 + 발전기 기동)"""
import os, subprocess, tempfile, wave
import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '../../public/audio/sfx')
rng = np.random.default_rng(11)


def T(dur):
    return np.arange(int(SR * dur)) / SR


def noise(n):
    return rng.uniform(-1, 1, n)


def lowpass(x, fc, order=2):
    """1차 저역 통과를 order번. fc는 상수 또는 샘플마다 바뀌는 배열"""
    fc = np.broadcast_to(np.asarray(fc, dtype=float), x.shape)
    a = np.exp(-2 * np.pi * fc / SR)
    for _ in range(order):
        y = np.empty_like(x)
        acc = 0.0
        for i in range(len(x)):
            acc = (1 - a[i]) * x[i] + a[i] * acc
            y[i] = acc
        x = y
    return x


def highpass(x, fc):
    return x - lowpass(x, fc, 1)


def band(x, lo, hi):
    return highpass(lowpass(x, hi), lo)


def osc(freq, t, shape='sin'):
    """freq: 상수 또는 시간마다 바뀌는 배열 (위상 누적)"""
    f = np.broadcast_to(np.asarray(freq, dtype=float), t.shape)
    ph = 2 * np.pi * np.cumsum(f) / SR
    if shape == 'sin':
        return np.sin(ph)
    if shape == 'saw':
        return 2 * ((ph / (2 * np.pi)) % 1) - 1
    if shape == 'sq':
        return np.sign(np.sin(ph))
    raise ValueError(shape)


def env(t, attack, decay):
    return np.minimum(1, t / max(attack, 1e-4)) * np.exp(-t / decay)


def place(dst, src, at):
    i = int(at * SR)
    if i >= len(dst):
        return
    m = min(len(src), len(dst) - i)
    dst[i:i + m] += src[:m]


def metal_click(dur=0.03, freqs=(2100, 3400, 5200), amp=1.0):
    """쇠붙이 딸깍: 아주 짧은 밝은 잡음 + 맞지 않는 배음 몇 개"""
    t = T(dur)
    x = highpass(noise(len(t)), 2500) * np.exp(-t / 0.002) * 0.8
    for k, f in enumerate(freqs):
        x += np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * np.exp(-t / (0.012 / (1 + k * 0.4))) * 0.5
    return x * amp


def chain(dur, rate, amp0=1.0, amp1=0.3, jitter=0.4):
    """사슬 짤랑임: 쇠 딸깍이 rate번/초로 불규칙하게"""
    x = np.zeros(int(SR * dur))
    t = 0.0
    while t < dur:
        k = t / dur
        a = amp0 + (amp1 - amp0) * k
        place(x, metal_click(0.025, tuple(f * rng.uniform(0.85, 1.2) for f in (1800, 2900, 4400)), a * rng.uniform(0.5, 1)), t)
        t += (1 / rate) * rng.uniform(1 - jitter, 1 + jitter)
    return x


def thump(t, f0, f1, sweep, decay, amp=1.0):
    f = f1 + (f0 - f1) * np.exp(-t / sweep)
    return osc(f, t) * env(t, 0.002, decay) * amp


def finish(x, drive=1.0, peak=0.95, fade=0.02):
    if drive > 0:
        x = np.tanh(x * drive) / np.tanh(drive)
    n = int(SR * fade)
    if n:
        x[-n:] *= np.linspace(1, 0, n)
    return (x / (np.max(np.abs(x)) + 1e-9) * peak).astype(np.float32)


# ─── 코박 ───
def hookaim():
    # 갈고리 예고 0.6초: 톱니바퀴 감기 (딸깍 간격이 점점 짧아짐) + 낮은 긴장 울림
    dur = 0.6
    x = np.zeros(int(SR * dur))
    t, gap = 0.0, 0.09
    while t < dur - 0.04:
        place(x, metal_click(0.03, (1500, 2600, 3900), 0.6 + 0.4 * t / dur), t)
        t += gap
        gap = max(0.035, gap * 0.86)
    tt = T(dur)
    x += osc(90 + 40 * tt / dur, tt, 'saw') * 0.12 * np.minimum(1, tt / 0.3)
    return finish(lowpass(x, 7000, 1), 1.2)


def hookfire():
    # 갈고리 발사: 짧은 쿵 + 빠르게 멀어지는 쉭 + 풀려나가는 사슬
    dur = 0.45
    t = T(dur)
    whoosh = lowpass(band(noise(len(t)), 600, 5000), 2500 + 3000 * np.exp(-t / 0.08)) * env(t, 0.01, 0.09) * 1.6
    x = whoosh + thump(t, 160, 70, 0.03, 0.05, 0.8)
    x += chain(dur, 45, 0.7, 0.1)
    return finish(x, 1.3)


def hookhit():
    # 갈고리 명중: 쇠가 몸에 박히는 '쾅'(맞지 않는 배음) + 둔한 저음
    dur = 0.4
    t = T(dur)
    x = highpass(noise(len(t)), 1500) * np.exp(-t / 0.004) * 0.9
    for f, d, a in ((410, 0.12, 0.7), (1130, 0.08, 0.5), (1870, 0.06, 0.4), (2650, 0.04, 0.3), (3720, 0.03, 0.2)):
        x += np.sin(2 * np.pi * f * t) * np.exp(-t / d) * a
    x += thump(t, 140, 60, 0.02, 0.07, 1.0)
    return finish(x, 1.6)


def hookreel():
    # 감아들이기·끌어오기: 사슬 촘촘한 짤랑 + 윈치 모터
    dur = 0.45
    t = T(dur)
    x = chain(dur, 38, 0.8, 0.5, 0.25)
    motor = lowpass(osc(110 + 60 * t / dur, t, 'saw'), 900) * 0.35 * (1 + 0.3 * np.sin(2 * np.pi * 30 * t))
    x += motor * np.minimum(1, t / 0.03)
    return finish(x, 1.2)


def chargewarn():
    # 돌진 예고: 엔진 공회전 (피스톤 떨림이 빨라지며 음이 올라감)
    dur = 0.6
    t = T(dur)
    f = 48 + 52 * (t / dur) ** 1.5
    eng = osc(f, t, 'saw') + 0.6 * osc(f * 2.01, t, 'sq')
    trem = 0.6 + 0.4 * np.sign(np.sin(2 * np.pi * np.cumsum(f / 2) / SR))
    x = lowpass(eng * trem, 700 + 900 * t / dur) * np.minimum(1, t / 0.05) * (0.6 + 0.4 * t / dur)
    x += lowpass(noise(len(t)), 400) * 0.6
    return finish(x, 2.0)


def charge():
    # 돌진: 분사 굉음 (터지듯 시작, 낮은 엔진 + 거친 바람)
    dur = 0.7
    t = T(dur)
    roar = lowpass(noise(len(t)), 900 + 1500 * np.exp(-t / 0.15)) * 2.0
    eng = lowpass(osc(95 - 20 * t / dur, t, 'saw'), 600) * 0.7
    x = (roar + eng) * env(t, 0.01, 0.35)
    x += thump(t, 120, 50, 0.03, 0.12, 1.0)
    return finish(x, 1.8)


def jump():
    # 점프: 무릎 굽혔다 튀어 오르는 둔한 쿵 + 위로 올라가는 바람
    dur = 0.5
    t = T(dur)
    x = thump(t, 110, 55, 0.03, 0.08, 1.0)
    sweep = 400 + 3000 * (t / dur)
    x += lowpass(band(noise(len(t)), 300, 6000), sweep) * np.sin(np.pi * np.minimum(1, t / dur)) * 1.2
    return finish(x, 1.3)


def slam():
    # 내리찍기 착지: 칼이 땅을 찍는 금속 '캉' + 큰 쿵 + 흩어지는 파편
    dur = 0.9
    t = T(dur)
    x = thump(t, 160, 38, 0.05, 0.22, 1.6)
    x += lowpass(noise(len(t)), 2500) * np.exp(-t / 0.03) * 1.2
    x += lowpass(noise(len(t)), 350) * env(t, 0.01, 0.3) * 1.6
    for f, d in ((620, 0.08), (1480, 0.05), (2330, 0.04)):
        x += np.sin(2 * np.pi * f * t) * np.exp(-t / d) * 0.35
    deb = np.zeros(len(t))
    for _ in range(14):
        place(deb, metal_click(0.02, (900 * rng.uniform(0.7, 1.4), 1800, 2700), rng.uniform(0.1, 0.35)), rng.uniform(0.06, 0.5))
    x += deb
    return finish(x, 1.8)


def summon():
    # 드론 소환: 짧은 디지털 호출 신호 (두 음 위로) + 잡음 딸깍
    dur = 0.5
    t = T(dur)
    x = np.zeros(len(t))
    for i, (at, f) in enumerate(((0.0, 660), (0.09, 990), (0.18, 1320))):
        tt = T(0.08)
        b = osc(f, tt, 'sq') * env(tt, 0.002, 0.04) * 0.5
        place(x, b, at)
    x = lowpass(x, 4000, 1)
    x += band(noise(len(t)), 1500, 6000) * np.exp(-t / 0.01) * 0.6
    tail = T(0.25)
    place(x, osc(1320 * (1 + 0.004 * np.sin(2 * np.pi * 18 * tail)), tail, 'sin') * env(tail, 0.005, 0.08) * 0.35, 0.26)
    return finish(x, 1.0, 0.8)


# ─── 바실리 ───
def gatspin():
    # 개틀링 돌아가기 0.4초: 모터 회전이 빨라지는 상승음 + 총열 덜그럭
    dur = 0.45
    t = T(dur)
    k = t / dur
    f = 70 + 330 * k ** 1.3
    x = lowpass(osc(f, t, 'saw') + 0.5 * osc(f * 3, t, 'sin'), 1200 + 2500 * k) * 0.8
    rat = np.zeros(len(t))
    tt, gap = 0.0, 0.06
    while tt < dur:
        place(rat, metal_click(0.02, (1200, 2100, 3300), 0.4), tt)
        tt += gap
        gap = max(0.018, gap * 0.82)
    x += rat
    x *= np.minimum(1, t / 0.03)
    return finish(x, 1.4, 0.9, 0.01)


def gatshot():
    # 개틀링 한 발: 짧고 단단한 '탕' (연사에 묻히지 않게 아주 짧게)
    dur = 0.11
    t = T(dur)
    n = noise(len(t))
    x = highpass(n, 1500) * np.exp(-t / 0.004) * 1.0
    x += lowpass(n, 1800) * np.exp(-t / 0.02) * 1.6
    x += thump(t, 180, 90, 0.01, 0.03, 0.9)
    return finish(x, 2.0, 0.95, 0.01)


def stompwarn():
    # 발구르기 예고 0.7초: 다리 유압이 압축되는 쉭 + 무게 실리는 낮은 삐걱임
    dur = 0.7
    t = T(dur)
    k = t / dur
    hiss = band(noise(len(t)), 1500, 2000 + 4000 * k) * (0.2 + 0.8 * k) * 0.8
    groan = lowpass(osc(45 + 25 * k + 4 * np.sin(2 * np.pi * 7 * t), t, 'saw'), 300 + 300 * k) * 1.0
    x = (hiss + groan) * np.minimum(1, t / 0.08)
    return finish(x, 1.6, 0.85)


def stomp():
    # 발구르기 착지: 바닥이 울리는 깊은 충격파 (낮게 오래) + 쾅
    dur = 1.2
    t = T(dur)
    x = thump(t, 120, 30, 0.08, 0.35, 2.0)
    x += lowpass(noise(len(t)), 1800) * np.exp(-t / 0.025) * 1.4
    x += lowpass(noise(len(t)), 180) * env(t, 0.02, 0.45) * 2.4
    # 퍼져 나가는 고리: 낮은 울림이 한 번 더
    x += thump(T(dur), 70, 40, 0.1, 0.25, 0.6) * (t > 0.12)
    return finish(x, 2.2)


def call():
    # 호위 호출: 무전기 켜지는 잡음 '칙' + 짧은 호루라기 두 번
    dur = 0.75
    t = T(dur)
    x = band(noise(len(t)), 800, 4000) * (t < 0.12) * 0.7 * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 60 * t)))
    for at, f0, f1 in ((0.13, 1900, 2300), (0.36, 2300, 1700)):
        tt = T(0.2)
        f = f0 + (f1 - f0) * tt / 0.2 + 30 * np.sin(2 * np.pi * 28 * tt)
        place(x, osc(f, tt) * env(tt, 0.01, 0.12) * 0.7, at)
    x = band(x, 300, 3800)
    x += band(noise(len(t)), 800, 3500) * 0.05
    return finish(x, 1.3, 0.85)


def phase():
    # 2페이즈 전환 1.2초: 코트가 찢기는 소리 → 몸속 발전기가 켜지며 올라가는 웅웅
    dur = 1.3
    t = T(dur)
    rip = band(noise(len(t)), 900, 5000)
    jag = np.repeat(rng.uniform(0.2, 1, int(dur * 120) + 1), SR // 120 + 1)[: len(t)]
    rip *= jag * (t < 0.45) * np.minimum(1, t / 0.01) * np.exp(-np.maximum(0, t - 0.2) / 0.12)
    k = np.clip((t - 0.25) / 0.95, 0, 1)
    f = 40 + 180 * k ** 1.6
    hum = lowpass(osc(f, t, 'saw') + 0.5 * osc(f * 1.5, t, 'sq'), 400 + 1600 * k) * (t > 0.25) * np.minimum(1, k * 4)
    hum *= 0.5 + 0.5 * k
    x = rip * 1.3 + hum * 0.8
    x += thump(np.maximum(0, t - 1.1), 90, 40, 0.03, 0.15, 1.0) * (t >= 1.1)
    return finish(x, 1.5, 0.95, 0.05)


SOUNDS = {
    'boss_hookaim': hookaim,
    'boss_hookfire': hookfire,
    'boss_hookhit': hookhit,
    'boss_hookreel': hookreel,
    'boss_chargewarn': chargewarn,
    'boss_charge': charge,
    'boss_jump': jump,
    'boss_slam': slam,
    'boss_summon': summon,
    'boss_gatspin': gatspin,
    'boss_gatshot': gatshot,
    'boss_stompwarn': stompwarn,
    'boss_stomp': stomp,
    'boss_call': call,
    'boss_phase': phase,
}


def write(path, x):
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        tmp = f.name
    with wave.open(tmp, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-b:a', '96k', path], check=True)
    os.remove(tmp)


if __name__ == '__main__':
    import sys
    only = sys.argv[1:]
    for k, fn in SOUNDS.items():
        if only and k not in only:
            continue
        write(os.path.join(OUT, k + '.mp3'), fn())
        print('wrote', k)
