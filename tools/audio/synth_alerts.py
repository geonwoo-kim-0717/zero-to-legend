"""블랙 실드 사이렌(raidsiren), 픽서 문자(phone), 전설·신화 카드 등장음(legendary·mythic)과 고를 때 팡파르(jackpot)를 직접 합성한다 (CC0).
사용: python3 tools/audio/synth_alerts.py  → public/audio/sfx/raidsiren.mp3, phone.mp3 (ffmpeg 필요)"""
import math, os, struct, subprocess, tempfile, wave
import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'audio', 'sfx')


def write(name, samples):
    m = max(abs(x) for x in samples) or 1
    tmp = os.path.join(tempfile.gettempdir(), name + '.wav')
    w = wave.open(tmp, 'w'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b''.join(struct.pack('<h', int(x / m * 30000)) for x in samples)); w.close()
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
                    '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', os.path.join(OUT, name + '.mp3')], check=True)
    print(name)


def siren(dur=2.4):
    """군용 경보: 낮게 울리는 두 음 '우-웅'이 위아래로 오르내리는 소리 + 무전 잡음"""
    out, ph, ph2 = [], 0.0, 0.0
    for i in range(int(SR * dur)):
        t = i / SR
        # 0.6초 주기로 오르내림 (560Hz ↔ 940Hz)
        k = 0.5 - 0.5 * math.cos(2 * math.pi * t / 0.6)
        f = 560 + 380 * k
        ph += 2 * math.pi * f / SR
        ph2 += 2 * math.pi * (f * 0.5) / SR
        # 톱니에 가까운 거친 음색
        v = sum(math.sin(ph * h) / h for h in range(1, 7)) * 0.7 + math.sin(ph2) * 0.35
        env = min(1.0, t / 0.05) * min(1.0, (dur - t) / 0.25)
        out.append(v * env)
    # 넓은 공간감: 짧은 메아리
    d = int(SR * 0.11)
    res = out[:] + [0.0] * d
    for i, v in enumerate(out):
        res[i + d] += v * 0.3
    return res


def phone():
    """짧은 진동 두 번 + 맑은 두 음 알림"""
    out = []
    for buzz in range(2):
        for i in range(int(SR * 0.07)):
            t = i / SR
            out.append((math.sin(2 * math.pi * 170 * t) + 0.4 * math.sin(2 * math.pi * 340 * t)) * 0.35 * min(1, t / 0.005))
        out += [0.0] * int(SR * 0.05)
    for f, d in ((1318.5, 0.09), (1760.0, 0.16)):
        for i in range(int(SR * d)):
            t = i / SR
            out.append((math.sin(2 * math.pi * f * t) + 0.25 * math.sin(4 * math.pi * f * t)) * math.exp(-t * 14) * min(1, t / 0.004))
    return out


def write_stereo(name, lr):
    """lr: (N, 2) float 배열 → 스테레오 mp3"""
    lr = lr / (np.abs(lr).max() or 1) * 0.95
    tmp = os.path.join(tempfile.gettempdir(), name + '.wav')
    w = wave.open(tmp, 'w'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((lr * 32000).astype('<i2').tobytes()); w.close()
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-af', 'loudnorm=I=-14:TP=-1.0:LRA=9',
                    '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', os.path.join(OUT, name + '.mp3')], check=True)
    print(name)


def siren_epic(dur=4.0, seed=3):
    """웅장한 출동 경보 (v2): 첫 박자에 낮은 금관 '브라암' + 땅울림, 그 위로 좌우 두 대의 공습 사이렌이
    천천히 차오르다 내려가고, 큰 공간 잔향으로 마무리"""
    rng = np.random.default_rng(seed)
    n = int(SR * dur)
    t = np.arange(n) / SR
    # 1) 땅울림: 55Hz에서 30Hz로 떨어지는 저음 + 짧은 잡음 타격
    f_sub = 26 + 30 * np.exp(-t * 2.5)
    sub = np.sin(2 * np.pi * np.cumsum(f_sub) / SR) * np.exp(-t * 0.9)
    # 두 번째 쿵 (1.6초): 사이렌이 꼭대기에 닿을 때 한 번 더 내려찍음
    t2 = np.maximum(0, t - 1.6)
    sub += np.sin(2 * np.pi * np.cumsum(24 + 22 * np.exp(-t2 * 3)) / SR) * np.exp(-t2 * 1.4) * (t >= 1.6) * 0.8
    hit = rng.standard_normal(n) * np.exp(-t * 18) * 0.5
    # 2) 금관 '브라암': 라(A) 화음 톱니파 여러 겹을 낮은 필터로 뭉갬, 0.15초에 차오르고 길게 이어짐
    brass = np.zeros(n)
    for f, a in ((36.7, 1.1), (55, 1.0), (82.4, 0.6), (110, 0.4)):
        for det in (-0.6, 0.0, 0.6):
            ph = 2 * np.pi * (f + det) * t
            brass += a * (2 * ((ph / (2 * np.pi)) % 1) - 1)
    k = 0.022  # 한 극 저역 필터 (더 어둡고 무겁게)
    out = np.empty(n); acc = 0.0
    for i in range(n):
        acc += k * (brass[i] - acc); out[i] = acc
    brass = np.tanh(out * 2.2) * np.minimum(1, t / 0.12) * np.exp(-np.maximum(0, t - 1.2) * 0.6)
    # 3) 공습 사이렌 두 대: 0.9초에 걸쳐 차오르고(330→760Hz) 잠깐 머문 뒤 내려감, 서로 5도 차이로 좌우에
    def wail(base, top, delay, pan):
        tt = np.maximum(0, t - delay)
        rise = np.clip(tt / 1.3, 0, 1)
        fall = np.clip((tt - 2.0) / 1.2, 0, 1)
        f = base + (top - base) * (1 - (1 - rise) ** 2) * (1 - fall ** 1.5) + 6 * np.sin(2 * np.pi * 5.2 * tt)
        ph = 2 * np.pi * np.cumsum(f) / SR
        v = np.tanh((np.sin(ph) + 0.5 * np.sin(2 * ph) + 0.25 * np.sin(3 * ph)) * 1.6)
        env = np.clip(tt / 0.25, 0, 1) * np.clip((dur - t) / 0.5, 0, 1) * (t >= delay)
        v *= env
        return np.stack([v * (1 - pan), v * (1 + pan)], 1)
    sirens = wail(200, 520, 0.12, -0.45) + wail(300, 780, 0.22, 0.45) * 0.6
    mono = sub * 2.0 + hit * 0.8 + brass * 1.3
    dry = np.stack([mono, mono], 1) + sirens * 0.42
    # 4) 큰 홀 잔향: 지수로 줄어드는 잡음 임펄스(좌우 다르게)를 FFT로 합성곱
    ir_n = int(SR * 1.8)
    ti = np.arange(ir_n) / SR
    wet = np.zeros((n + ir_n - 1, 2))
    for c in range(2):
        ir = rng.standard_normal(ir_n) * np.exp(-ti * 2.4)
        ir = np.convolve(ir, np.ones(6) / 6, mode='same')  # 고음을 깎아 어두운 잔향
        ir[: int(SR * 0.02)] *= np.linspace(0, 1, int(SR * 0.02))
        m = 1 << int(np.ceil(np.log2(n + ir_n)))
        wet[:, c] = np.fft.irfft(np.fft.rfft(dry[:, c], m) * np.fft.rfft(ir, m), m)[: n + ir_n - 1]
    wet /= np.abs(wet).max()
    mix = np.zeros_like(wet)
    mix[:n] += dry / np.abs(dry).max()
    mix += wet * 0.45
    fade = np.clip((len(mix) - np.arange(len(mix))) / (SR * 0.3), 0, 1)[:, None]
    return mix * fade


def tone(f, t, kind='tri'):
    ph = 2 * math.pi * f * t
    if kind == 'sq':
        return 0.6 if math.sin(ph) >= 0 else -0.6
    if kind == 'tri':
        return 2 / math.pi * math.asin(math.sin(ph))
    return math.sin(ph)


def mix(dur, notes):
    """notes: (start, freq, length, kind, vol)"""
    out = [0.0] * int(SR * dur)
    for st, f, ln, kind, vol in notes:
        a = int(SR * st)
        for i in range(int(SR * ln)):
            if a + i >= len(out):
                break
            t = i / SR
            env = min(1, t / 0.005) * math.exp(-t * 3.2 / ln)
            out[a + i] += tone(f, t, kind) * env * vol
    return out


def legendary():
    """전설 카드 등장: 반짝이며 올라가는 금빛 아르페지오 + 끝의 화음"""
    C = 523.25
    notes = []
    for k, m in enumerate([1, 1.26, 1.5, 2, 2.52, 3, 4]):
        notes.append((k * 0.055, C * m, 0.35, 'sq', 0.35))
        notes.append((k * 0.055, C * m * 2, 0.25, 'sin', 0.15))
    for m in (2, 2.52, 3, 4):
        notes.append((0.42, C * m, 0.9, 'tri', 0.35))
    out = mix(1.4, notes)
    # 반짝이 (짧고 높은 핑)
    import random
    random.seed(3)
    for _ in range(18):
        st = 0.35 + random.random() * 0.9
        f = random.choice([3136, 3520, 4186, 4699])
        a = int(SR * st)
        for i in range(int(SR * 0.06)):
            if a + i < len(out):
                out[a + i] += math.sin(2 * math.pi * f * i / SR) * math.exp(-i / SR * 60) * 0.2
    return out


def mythic():
    """신화 카드 등장: 낮게 쿵 + 빨려 올라가는 소리 + 웅장한 화음"""
    n = int(SR * 2.0)
    out = [0.0] * n
    for i in range(int(SR * 0.6)):
        t = i / SR
        f = 70 * math.exp(-t * 3)
        out[i] += math.sin(2 * math.pi * f * t + 3 * t) * math.exp(-t * 4) * 1.0
    ph = 0.0
    for i in range(int(SR * 0.55)):
        t = i / SR
        ph += 2 * math.pi * (200 + 1400 * (t / 0.55) ** 2) / SR
        a = int(SR * 0.15) + i
        out[a] += math.sin(ph) * 0.25 * (t / 0.55)
    A = 220.0
    chord = mix(1.4, [(0, A * m, 1.4, kind, v) for m, kind, v in ((1, 'sq', 0.25), (1.19, 'tri', 0.3), (1.5, 'tri', 0.3), (2, 'sq', 0.2), (2.38, 'sin', 0.2), (3, 'sin', 0.15), (4, 'sin', 0.12))])
    a = int(SR * 0.6)
    for i, v in enumerate(chord):
        if a + i < n:
            out[a + i] += v * (1 + 0.15 * math.sin(2 * math.pi * 5 * i / SR))
    return out


def jackpot():
    """전설·신화 카드를 골랐을 때: 짧은 팡파르"""
    G = 783.99
    return mix(0.9, [(0, G, 0.12, 'sq', 0.35), (0.1, G * 1.26, 0.12, 'sq', 0.35), (0.2, G * 1.5, 0.6, 'sq', 0.35), (0.2, G * 2, 0.6, 'tri', 0.3), (0.2, G * 0.5, 0.6, 'tri', 0.3)])


os.makedirs(OUT, exist_ok=True)
write('legendary', legendary())
write('mythic', mythic())
write('jackpot', jackpot())
write_stereo('raidsiren', siren_epic())
write('phone', phone())
