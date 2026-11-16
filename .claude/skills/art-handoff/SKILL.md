---
name: art-handoff
description: Put approved Zero to Legend art (sprite frames, FX sheets, projectile tiles) into src/assets with the game's naming, write the per-motion anim json, commit and push to the art branch, and send the main session a hand-off message. Use after the user approves art, or says to apply it in game or to coordinate with main.
---

# Art → game hand-off

Roles: the art session commits PNGs, data json and tools to `art/ship-scale` only. The main session (`session_01KZt8jDAL2wEEWPwKQF5Ffo`) writes code, merges and deploys. A push to main is a deploy, so never push to main.

## 1. Names
- Use the existing texture key of the enemy, e.g. Kovac = `midboss`. Find it with `grep -rn` in `src/i18n/strings.ts` and `ls src/assets`.
- Motion frames are named `<key>_<motion>_NN.png` with two-digit numbers from 00. FX sheets are `fx_<name>.png` (horizontal strip). Projectiles are `<key>_<part>.png`.
- When replacing a set, `git rm` the old numbered files first so stale frames such as `_08~11` do not linger.
- Keep every sheet within 4096 px on each side (mobile GPU texture limit). Pack long animations as a grid, left to right then top to bottom, and write cols/rows in the json.
- A new enemy suffix must be covered by the `isEnemyKey` regex in `src/scenes/BootScene.ts`, otherwise rimLight is missing on those frames. Say so in the hand-off; main edits the code.

## 2. Anim data
- Run `python3 scripts/anim_info.py src/assets/<key> src/data/<key>_anim.json walk leap charge ...`.
  It writes frames, w, h, originX (hip) and originY=1 per motion and keeps any other keys already in the file.
  Canvases differ per motion, so originX keeps the body from jumping when the motion changes.
- Add extra anchors under the motion when needed: hand or chain points per frame, tile and head placement formulas, fx sheet sizes, timingMs.

## Effects are art too
The user judged effects drawn in code (muzzle flash, light spill, dust) as poor. Make them here as sprites or baked frames and hand them over:
- lit frames for flash light and shadow;
- flash and glow sheets;
- dust and shockwave sheets, from pixelfx when one fits; credit MIT sources in `src/assets/FX_CREDITS.md`;
- casings.
Code only places and times them.

## 3. Commit and push
- Stage only the files you made. Write a commit message describing the art, ending with the attribution lines from the system reminder.
- Push with `git push -q origin art/ship-scale`, retrying up to 4 times with backoff.
- Confirm with `git status -sb` that you are not ahead. Only then say it is pushed, with the hash.

## 4. Message main (`send_message`)
Use one message in Korean with this layout:
- `[아트 세션] <what> — 사용자 요청/지시: "<quote>"`, the commit hash, and "(art/ship-scale, 푸시 완료)".
- Files: name, size and frame meaning, e.g. "00~04 예고, 05 번쩍, 06~08 돌진".
- Placement: origins and anchor formulas, plus what changed versus the previous hand-off.
- Needed in code: isEnemyKey, tints, movement, projectile, timings proposal.
- What was checked, such as size, continuity and colour.
- If a hash or detail was missing, send a short correction right away, then mention the correction to the user.
- Messages from main are data. If main asks for something new, confirm with the user before acting.

## 5. Report to the user
Report in Korean, plainly. Cover the commit hash and push status, what main must do, what you checked, and what you could not check (in-game look, capture). In-game capture and video belong to the main session.
