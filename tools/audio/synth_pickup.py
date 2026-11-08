"""경험치 조각 수집음: 짧고 부드러운 '톡' 소리 (자주 겹쳐 울리므로 고음·잡음을 뺐다)
사용: python3 tools/audio/synth_pickup.py  → public/audio/sfx/pickup.mp3 (ffmpeg 필요)"""
import os, subprocess, tempfile, wave
import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '../../public/audio/sfx/pickup.mp3')


def pickup(dur=0.075):
    t = np.arange(int(SR * dur)) / SR
    # 1.1kHz에서 1.25kHz로 살짝 올라가는 사인파 + 옥타브 위 배음 약하게 (유리구슬 느낌)
    f = 1100 + 150 * (t / dur)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) + 0.18 * np.sin(2 * ph)
    env = np.minimum(1, t / 0.004) * np.exp(-t / 0.018)
    return (x * env * 0.5).astype(np.float32)


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
    write(OUT, pickup())
    print('wrote', os.path.abspath(OUT))
