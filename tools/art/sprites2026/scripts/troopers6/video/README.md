# Trooper walk from generated video

1. First frame: a side-profile walk pose (from the generated walk sheets) on a 960 magenta square, figure 58% high, feet at 82%.
2. Clip: P-Video 2 Pro img2video, 480p, 5 s, mode cost, prompt "walking in place like a treadmill ... weapon held still ... pure side profile ... flat magenta".
3. `vid_proc.py <trooper> <sheet> <scale> [start period]`: extract frames, find the loop (leg-band mask), take 12 frames of one cycle,
   key magenta, recolour black + brightness match (pxlib.make), pixelate on the troopers6 canvas, head-aligned.
   Used: melee 1.23 7 24, tank 1.0 (auto 38/24), hacker 1.24 8 25, sniper 1.12 8 25.
Known: melee walk frames 01-03 lose the baton (the video model faded it); kept as approved.
