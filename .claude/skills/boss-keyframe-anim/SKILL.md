---
name: boss-keyframe-anim
description: Turn ChatGPT keypose images of a Zero to Legend boss or enemy into pixel-art motion frames with PixelLab (first frame + last frame), all motions at one fixed scale with feet on the canvas bottom row. Use when the user uploads keypose images, asks to make or redo a boss walk, attack, jump or other motion, or asks to try PixelLab on a character.
---

# Boss keyframe → PixelLab motion

Art session routine. Output is PNG frames only; game code belongs to the main session (see `art-handoff`).

## 0. Before generating
- Check PixelLab balance: `curl -sS -H "Authorization: Bearer proxy-injected" https://api.pixellab.ai/v2/balance`.
  One motion costs 1-3 generations (smaller canvas = cheaper). Tell the user the cost when the balance is low.
- The API key is a network secret on the environment (host api.pixellab.ai). Never ask for it in chat; if it is missing, use `request_credential`.
- Ask what size the character should be in game if not decided. Reference sizes: player 32px, troopers 41px, old midboss 54px, Kovac renewal ~76px standing.

## 1. Normalise every keypose to ONE source scale
- ChatGPT images arrive at ~1254px with a flat magenta background.
- `python3 scripts/norm_key.py <in.png> <kN_frame.png> --k=<K> [--lift=0.12]` puts each pose on a 960 magenta canvas, feet at 0.82*960, centred.
  `K = 0.58*960 / (figure height of the boss's base image)`. Use the SAME K for every pose of one boss. `--lift` only for airborne poses.
- Check the head looks the same size on all frames before spending generations.

## 2. Pick the game scale once per boss
- Write a scale file `scale_<boss>.txt` containing `<game px per 960-frame px> 0 0`.
  Example: Kovac medium = `0.1364` (standing figure 557px at 960 → 76px).
- NEVER reuse a scale measured on a 480p video for 960 keyframes (that gave a 2x size error once).

## 3. Generate
`python3 scripts/pl_run.py A_frame.png B_frame.png scale_<boss>.txt <outdir> <name> 8 "<action text>"`
- Pixelates both keyframes on one shared window (same scale, same ground), calls `animate-with-text-v3` with `first_frame`/`last_frame`, `no_background`, and writes `<name>_00..08.png` plus `<name>_sheet.png` (last tile = target end frame).
- Walk loop: pass the same frame as A and B.
- Takeoff/leap: A = walk pose, B = airborne pose.
- Action text: start with "side view", describe the motion in one sentence.
- `scripts/pl_job.py <endpoint> <body.json> <out.json>` is the generic POST + poll helper for other endpoints, such as `vfx`.
  Its `sprite` field must be `{"type":"base64","base64":...}`.

## 4. Review (look at the sheet yourself before showing)
- Big pose changes often produce one or two broken in-betweens: a smeared ghost, a flash frame, or a weapon jumping to the other arm. List them by number and propose dropping them. The user decides.
- Small motions (wind-up, walk, idle) come out well. Large motions may skip the middle.
- Weapon on the wrong arm in a keypose means a broken in-between. Fix the keypose, not the video prompt (see `boss-keypose-prompts`).

## 5. Size check across motions
- Run `sprite-qa` `scale_check.py` with every motion of the boss. Body and head must match, and feet must be on the ground line except in airborne frames.
- Only report "same scale" after this check has passed.

## 6. Show the user
- Send a GIF and the frame sheet with `SendUserFile`.
- Say what is good, what is broken with frame numbers, and the generations used and left.
- Do not hand off before the user approves.
