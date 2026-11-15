---
name: sprite-qa
description: Verify Zero to Legend sprite art before reporting or handing off — same scale across motions, feet on the ground line, tiled projectiles (chains, ropes, beams) never breaking at any length, and colours and sizes matching the source art. Use before saying "same size", "connected" or "matches", whenever the user asks to check size, colour or breaks, or after any recolour or resize.
---

# Sprite QA

Never claim a property you did not measure. Each check below produces an image. Look at it with Read, then send the relevant one to the user.

## Same scale across motions
- `python3 scripts/scale_check.py out.gif "<dir>/walk_*.png" "<dir>/charge_*.png" ...` places the motions side by side, 3x, on a cyan ground line.
- Pass only when head and body size match and feet sit on the line, except airborne frames.
- Also print the feet row per frame (alpha max y). It must be the canvas bottom row.
- Compare with the game: player 32px, troopers 41px, and the previous version of the same enemy.

## Tiled projectile continuity
- `python3 scripts/tile_check.py tile.png head.png body_frame.png <endX> <endY> 1 2 7 13 14 15 40 150` checks lengths around the tile width and up to full reach, for every body frame the projectile is used with.
- Each length must report one component and touch the body.
- The demo canvas must be wide enough, or the head gets cut and shows as a false break.

## Colour and size against the source art
- When adding a part next to existing art (a chain coming out of a fist, an FX on a weapon), sample the pixels the art already has there and use those colours. Matching only a "bright part" is not matching.
- If the art already draws a stub of the part, either redraw the whole part or erase the stub (`git show <old>:path` keeps the original for reference). Never leave two different renderings side by side.
- Measure size from the art: column-height profile for link period, rows for thickness. Then show the original and the new part side by side at the same zoom, e.g. x10.
- When the user sends a reference crop, rebuild at the same pixel scale and show a comparison image of the reference and the result.

## Recolour checks
- When asked to turn yellow into red, count the pixels per hue band before and after and look at the sheet. Remember lights drawn in code too: grep GameScene for `fillStyle(COLORS.yellow` and similar, and tell main.

## Reporting
State in Korean, as separate points, what passed (with the numbers), what you could not check (in-game look), and any earlier claim that turned out wrong.
