"""다운로드한 CC0 음원에서 게임용 효과음·배경음악을 만든다 (ffmpeg 필요).
사용: python3 tools/audio/process.py <다운로드 폴더>
다운로드 폴더 구조와 원본 주소는 public/audio/CREDITS.txt 참고."""
import os, subprocess, sys

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'audio')
J = 'subspace512/x/The Essential Retro Video Game Sound Effects Collection [512 sounds] By Juhani Junkala'
KS, KD, KU = 'kenney_scifi/x/Audio', 'kenney_digital/x', 'kenney_ui/x/Audio'

# 게임 키: (원본 파일, 최대 길이 초 또는 None)
SFX = {
    'shoot':      (f'{KS}/laserSmall_000.ogg', None),
    'slash':      (f'{J}/Weapons/Melee/sfx_wpn_sword1.wav', None),
    'explode':    (f'{J}/Explosions/Short/sfx_exp_short_hard4.wav', None),
    'kill':       (f'{J}/Explosions/Shortest/sfx_exp_shortest_soft1.wav', None),
    'pickup':     (f'{J}/General Sounds/Coins/sfx_coin_single3.wav', None),
    'heal':       (f'{J}/General Sounds/Positive Sounds/sfx_sounds_powerup3.wav', None),
    'levelup':    (f'{J}/General Sounds/Fanfares/sfx_sounds_fanfare1.wav', None),
    'hurt':       (f'{J}/General Sounds/Simple Damage Sounds/sfx_damage_hit3.wav', None),
    'dash':       (f'{KD}/phaseJump1.mp3', None),
    'overclock':  (f'{KS}/lowFrequency_explosion_000.ogg', 1.6),
    'glitch':     (f'{KU}/glitch_004.ogg', None),
    'enemyshot':  (f'{KS}/laserRetro_000.ogg', None),
    'lungewarn':  (f'{KD}/phaserDown1.mp3', None),
    'lunge':      (f'{J}/Weapons/Melee/sfx_wpn_sword3.wav', None),
    'block':      (f'{KS}/impactMetal_000.ogg', 0.35),
    'bosswarn':   (f'{J}/General Sounds/Alarms/Alarms/sfx_alarm_loop1.wav', None),
    'bosscharge': (f'{KS}/thrusterFire_000.ogg', 0.8),
    'bossdie':    (f'{J}/Explosions/Long/sfx_exp_long2.wav', None),
    'victory':    (f'{J}/General Sounds/Positive Sounds/sfx_sounds_powerup2.wav', None),
    'gameover':   (f'{KD}/lowDown.mp3', None),
    'netcrash':   (f'{KD}/zap2.mp3', None),
    'start':      (f'{J}/Movement/Portals and Transitions/sfx_movement_portal1.wav', 1.0),
    'hover':      (f'{KU}/tick_001.ogg', None),
    'select':     (f'{KU}/confirmation_001.ogg', None),
    'reroll':     (f'{KU}/glitch_001.ogg', None),
}
MUSIC = {
    'title':  'm_calm/calm.mp3',
    'battle': 'm_spacecity/spacecity.ogg',
    'boss':   'm_moonlight/moonlight.mp3',
}

def run(args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y'] + args, check=True)

os.makedirs(os.path.join(OUT, 'sfx'), exist_ok=True); os.makedirs(os.path.join(OUT, 'music'), exist_ok=True)
for key, (rel, maxlen) in SFX.items():
    f = ['silenceremove=start_periods=1:start_threshold=-50dB']
    if maxlen: f.append(f'atrim=0:{maxlen},afade=t=out:st={max(0, maxlen - 0.15)}:d=0.15')
    f.append('loudnorm=I=-16:TP=-1.5:LRA=11')
    run(['-i', os.path.join(SRC, rel), '-af', ','.join(f), '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', os.path.join(OUT, 'sfx', key + '.mp3')])
    print('sfx', key)
for key, rel in MUSIC.items():
    run(['-i', os.path.join(SRC, rel), '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '112k', os.path.join(OUT, 'music', key + '.mp3')])
    print('music', key)
