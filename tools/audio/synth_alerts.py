"""블랙 실드 출동 사이렌(raidsiren)과 픽서 문자 알림음(phone)을 직접 합성한다 (CC0).
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


def siren_epic(dur=3.6, seed=3):
    """웅장한 출동 경보 (v2): 첫 박자에 낮은 금관 '브라암' + 땅울림, 그 위로 좌우 두 대의 공습 사이렌이
    천천히 차오르다 내려가고, 큰 공간 잔향으로 마무리"""
    rng = np.random.default_rng(seed)
    n = int(SR * dur)
    t = np.arange(n) / SR
    # 1) 땅울림: 55Hz에서 30Hz로 떨어지는 저음 + 짧은 잡음 타격
    f_sub = 30 + 25 * np.exp(-t * 3)
    sub = np.sin(2 * np.pi * np.cumsum(f_sub) / SR) * np.exp(-t * 1.6)
    hit = rng.standard_normal(n) * np.exp(-t * 18) * 0.5
    # 2) 금관 '브라암': 라(A) 화음 톱니파 여러 겹을 낮은 필터로 뭉갬, 0.15초에 차오르고 길게 이어짐
    brass = np.zeros(n)
    for f, a in ((55, 1.0), (82.4, 0.7), (110, 0.6), (164.8, 0.35)):
        for det in (-0.6, 0.0, 0.6):
            ph = 2 * np.pi * (f + det) * t
            brass += a * (2 * ((ph / (2 * np.pi)) % 1) - 1)
    k = 0.035  # 한 극 저역 필터 (금관처럼 둥글게)
    out = np.empty(n); acc = 0.0
    for i in range(n):
        acc += k * (brass[i] - acc); out[i] = acc
    brass = out * np.minimum(1, t / 0.15) * np.exp(-np.maximum(0, t - 0.4) * 0.9)
    # 3) 공습 사이렌 두 대: 0.9초에 걸쳐 차오르고(330→760Hz) 잠깐 머문 뒤 내려감, 서로 5도 차이로 좌우에
    def wail(base, top, delay, pan):
        tt = np.maximum(0, t - delay)
        rise = np.clip(tt / 0.9, 0, 1)
        fall = np.clip((tt - 2.0) / 1.2, 0, 1)
        f = base + (top - base) * (1 - (1 - rise) ** 2) * (1 - fall ** 1.5) + 6 * np.sin(2 * np.pi * 5.2 * tt)
        ph = 2 * np.pi * np.cumsum(f) / SR
        v = np.sin(ph) + 0.45 * np.sin(2 * ph) + 0.2 * np.sin(3 * ph)
        env = np.clip(tt / 0.25, 0, 1) * np.clip((dur - t) / 0.5, 0, 1) * (t >= delay)
        v *= env
        return np.stack([v * (1 - pan), v * (1 + pan)], 1)
    sirens = wail(330, 760, 0.12, -0.45) + wail(495, 1140, 0.22, 0.45) * 0.7
    mono = sub * 1.4 + hit + brass * 0.9
    dry = np.stack([mono, mono], 1) + sirens * 0.55
    # 4) 큰 홀 잔향: 지수로 줄어드는 잡음 임펄스(좌우 다르게)를 FFT로 합성곱
    ir_n = int(SR * 1.8)
    ti = np.arange(ir_n) / SR
    wet = np.zeros((n + ir_n - 1, 2))
    for c in range(2):
        ir = rng.standard_normal(ir_n) * np.exp(-ti * 3.2)
        ir[: int(SR * 0.02)] *= np.linspace(0, 1, int(SR * 0.02))
        m = 1 << int(np.ceil(np.log2(n + ir_n)))
        wet[:, c] = np.fft.irfft(np.fft.rfft(dry[:, c], m) * np.fft.rfft(ir, m), m)[: n + ir_n - 1]
    wet /= np.abs(wet).max()
    mix = np.zeros_like(wet)
    mix[:n] += dry / np.abs(dry).max()
    mix += wet * 0.45
    fade = np.clip((len(mix) - np.arange(len(mix))) / (SR * 0.3), 0, 1)[:, None]
    return mix * fade


os.makedirs(OUT, exist_ok=True)
write_stereo('raidsiren', siren_epic())
write('phone', phone())
