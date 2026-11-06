"""블랙 실드 출동 사이렌(raidsiren)과 픽서 문자 알림음(phone)을 직접 합성한다 (CC0).
사용: python3 tools/audio/synth_alerts.py  → public/audio/sfx/raidsiren.mp3, phone.mp3 (ffmpeg 필요)"""
import math, os, struct, subprocess, tempfile, wave

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


os.makedirs(OUT, exist_ok=True)
write('raidsiren', siren())
write('phone', phone())
