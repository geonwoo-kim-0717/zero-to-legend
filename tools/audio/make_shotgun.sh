#!/bin/sh
# 샷건 발사음: 기존 사격음(shoot)을 낮게 내려 무게를 주고, 폭발음(explode) 앞부분을 짧게 섞어 산탄의 '퍽' 하는 몸통을 만든다.
# 다른 효과음과 같은 재료를 써서 톤이 동떨어지지 않게 한다.  사용: sh tools/audio/make_shotgun.sh
set -e
cd "$(dirname "$0")/../../public/audio/sfx"
ffmpeg -hide_banner -loglevel error -y -i shoot.mp3 -i explode.mp3 -filter_complex \
"[0:a]asetrate=44100*0.72,aresample=44100,highpass=f=120,volume=1.0[a];\
[1:a]atrim=0:0.28,asetpts=PTS-STARTPTS,asetrate=44100*1.25,aresample=44100,highpass=f=200,afade=t=out:st=0.08:d=0.14,volume=1.6[b];\
[a][b]amix=inputs=2:normalize=0,atrim=0:0.32,afade=t=out:st=0.2:d=0.12,alimiter=limit=0.95" \
-ac 1 -b:a 96k shotgun.mp3
