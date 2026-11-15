# Melee trooper walk, video method (preview only, not for release)

- trooper_melee_walk_00..11.png: 12-frame walk loop, 48x42, feet on the last row (origin 0.5,1 like the attack frames), 12 fps.
- Made from source_clip.mp4 (P-Video 2 Pro, 480p), one 24-frame loop (frames 7-31) sampled every 2nd frame, keyed, recoloured, pixelated.
- Known issue: the stun baton fades out in frames 02-04 (the video model dropped it).
- walk_loop_preview.patch: the throwaway GameScene change used for a local look (plays <tex>_walk_NN at 12 fps when present; the PNGs must be copied into src/assets).
