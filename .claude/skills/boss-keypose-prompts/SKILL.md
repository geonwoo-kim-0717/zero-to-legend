---
name: boss-keypose-prompts
description: Write copy-paste ChatGPT (free) image prompts for a Zero to Legend boss — the base side-view sprite, phase variants, and per-pattern keyposes (start/end) — so the images feed the keyframe → PixelLab motion pipeline cleanly. Use when the user asks for prompts for a boss or enemy image, keyposes for a pattern, or a fix for a generated image (wrong arm, cut-off body, three-quarter view).
---

# Boss keypose prompts for ChatGPT

The user generates the images in ChatGPT free; you write the prompts. Answer in Korean and keep the prompts in English, each in one ```text block so it can be copied in one go. Read the boss concept in the scratchpad `boss_concepts.md` if it exists. Ask about anything the concept does not settle.

## Base image (one block, all conditions merged)
Include every point below:
- "Pixel art game boss sprite, high-detail 2D pixel art in a dark cyberpunk style."
- One full-body character in a strict pure side profile facing right, like a 2D side-scrolling platformer sprite (not three-quarter, not facing the camera).
- The character description: name, body, weapons, and which arm holds what.
- Name arms as the near arm (closest to the viewer) and the far arm, never only left or right.
- The pose, with the whole body visible from head to feet and nothing cut off.
- Colours, ending with "absolutely no pink, no purple and no magenta anywhere on the character".
- Background: "one flat solid pure magenta (#FF00FF) ... no ground, no floor line, no shadow, no text, no frame, no border".
- "Square image, the character centered and taking about 60% of the image height, with empty space above the head."

## Phase variant
Attach the base image, then: "Redraw this exact same character, same pose, same size in the frame, same side profile facing right and same flat solid magenta background, with these changes only: ..."

## Keyposes (two per pattern: start and end)
- One common sentence goes before every pose. It must lock identity and size and the weapon arm:
  "Using the attached image as the exact same character (same design, colors, proportions, pixel art style and same size in the frame), draw him in a new pose. The <weapon> stays on his near arm ... exactly as in the attached image. Strict pure side profile facing right ..., whole body visible ..., flat solid pure magenta (#FF00FF) background, no ground, no shadow, no text, no effects, no motion lines, no pink or purple on the character. Square image. New pose:"
- Then one numbered pose line per image, e.g. "① Charge wind-up: ...".
- Projectiles, muzzle flashes, chains in flight and shockwaves are NOT drawn in the keyposes. They are code or FX, so write "the hook itself flying away is not shown".
- Plan a walk keypose: mid-stride, legs spread wide. Without it the walk stride comes out small.
- Give a table of which pose pairs make which motion. The walk doubles as the entrance where the concept allows.

## Fixing a bad image
- Wrong weapon arm: start a new chat, attach the image that has the correct arms (often the paired end pose), and edit it: "Edit the attached image. Keep ... The arm with <weapon> and the arm holding <other> must stay the SAME arms as in the attached image, attached to the same shoulders. Do not swap them ... Change only the pose, into ..."
  Give a one-line fallback for the same chat: "The blade is on the wrong arm. Compare with the first image I attached ...".
- Three-quarter view: "Redraw the same character in a strict pure side profile view facing right ... Keep everything else the same."
- Cut-off body: "Show the whole body from head to feet with empty magenta space around it."
- Floor or shadow: "Make the background one flat solid #FF00FF magenta only, no floor, no shadow."
- Pink or purple on the character: "Remove all pink and purple from the character; use only ..."
- A video prompt cannot swap arms. The keypose image must be fixed.

## Notes to the user
- ChatGPT free makes only a few images a day. Give a priority order: base, phase 2, then the keyposes.
- Mention which existing image to attach for each prompt.
