import math, wave, struct, random
SR = 44100
def sweep(path, dur, f0, f1, wob=6.0, trem=7.0, decay=0.9, attack=0.06, noise=0.05, sub=True):
    k = math.log(f1 / f0) / dur
    out = []
    lp = 0.0
    rnd = random.Random(3)
    for i in range(int(SR * dur)):
        t = i / SR
        ph = 2 * math.pi * f0 * (math.exp(k * t) - 1) / k + 0.6 * math.sin(2 * math.pi * wob * t)
        v = math.sin(ph) + 0.55 * math.sin(2 * ph) + 0.3 * math.sin(3 * ph)
        if sub: v += 0.6 * math.sin(ph / 2)
        n = rnd.uniform(-1, 1); lp += (n - lp) * 0.05; v += lp * noise * 8
        env = min(1.0, t / attack) * math.exp(-decay * t) * (0.8 + 0.2 * math.sin(2 * math.pi * trem * t))
        env *= min(1.0, (dur - t) / 0.12)
        out.append(v * env)
    # 간단한 메아리
    d1, d2 = int(SR * 0.07), int(SR * 0.15)
    res = out[:] + [0.0] * d2
    for i, v in enumerate(out):
        res[i + d1] += v * 0.35; res[i + d2] += v * 0.2
    m = max(abs(x) for x in res) or 1
    w = wave.open(path, 'w'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b''.join(struct.pack('<h', int(x / m * 30000)) for x in res)); w.close()
sweep('slowmo.wav', 1.4, 320, 62)
sweep('slowmo_out.wav', 0.6, 70, 280, wob=4, trem=10, decay=0.3, attack=0.03, sub=False)
