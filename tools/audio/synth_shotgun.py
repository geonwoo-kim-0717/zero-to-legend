"""샷건 발사음: 짧은 '탕' 파열음 + 묵직한 저음 쿵 + 금방 사라지는 잔향 (음 높이가 미끄러지는 '띠용' 성분 없이)
사용: python3 tools/audio/synth_shotgun.py  → public/audio/sfx/shotgun.mp3 (ffmpeg 필요)"""
import os, subprocess, tempfile, wave
import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '../../public/audio/sfx/shotgun.mp3')
rng = np.random.default_rng(7)


def lowpass(x, fc):
    # 1차 저역 통과 두 번 (12dB/oct)
    a = np.exp(-2 * np.pi * fc / SR)
    for _ in range(2):
        y = np.empty_like(x)
        acc = 0.0
        for i, v in enumerate(x):
            acc = (1 - a) * v + a * acc
            y[i] = acc
        x = y
    return x


def shotgun(dur=0.42):
    n = int(SR * dur)
    t = np.arange(n) / SR
    noise = rng.uniform(-1, 1, n)
    # 1) 파열: 아주 짧고 밝은 잡음
    crack = (noise - lowpass(noise, 1800)) * np.exp(-t / 0.006) * 0.9
    # 2) 몸통: 어두운 잡음이 빠르게 줄어듦
    body = lowpass(noise, 1400) * np.exp(-t / 0.07) * 2.6
    # 3) 저음 쿵: 70Hz 근처 사인 (음 높이 변화는 아주 작게)
    f = 72 - 18 * np.minimum(1, t / 0.12)
    thump = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.09) * 0.9
    # 4) 잔향: 더 어둡고 조금 긴 잡음
    tail = lowpass(noise, 600) * np.exp(-t / 0.16) * 1.4
    attack = np.minimum(1, t / 0.0015)
    x = (crack + body + thump + tail) * attack
    x = np.tanh(x * 1.6) / np.tanh(1.6)
    return (x / np.max(np.abs(x)) * 0.95).astype(np.float32)


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
    write(OUT, shotgun())
    print('wrote', os.path.abspath(OUT))
