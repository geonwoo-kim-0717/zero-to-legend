---
name: phase-variant-transfer
description: Make the phase-2 (or damaged, powered-up, recoloured) version of a Zero to Legend boss motion from its phase-1 frames, so every frame carries the same tears, glows and overheated parts as one approved reference. Use when the user asks for a phase-2 walk, gatling or other motion, wants a variant "like the transition's last frame", or wants a variant applied to the rest of a motion's frames.
---

# Phase-variant transfer

Art session routine (Basili phase-2 walk and gatling). Output is PNG frames. Hand-off follows `art-handoff`.

## Two stages: one approved key frame first, then the rest

### Stage A: one key frame, checked with the user
1. Take the visual reference, usually the last frame of the phase transition, and line it up with one phase-1 frame of the same motion.
   Find the offset per body part (head, generator, gun, sleeve, legs) by grey-level matching.
2. Copy the reference 1:1 onto that frame, part by part:
   - the generator block within its radius;
   - the barrel's hot section;
   - the coat: tears, burns and stains, removing pixels where the reference has none and adding torn ends;
   - the far-arm glow.
   Keep the phase-1 pose. Put the outline back on newly opened coat edges.
3. Show three panels at x5–x6 with a grid: phase-1 frame, new frame, aligned reference. Add a zoom of the generator.
   Report the pixel counts per part and the checks below. **Wait for the user to approve this one frame.**

### Stage B: propagate with `scripts/transfer.py <config.json>`
- `ref1` is the approved frame's phase-1 source and `ref2` the approved frame. Note `frames` is a list of `[in, out]`.
- `regions`: aligned copy of changed pixels where the target still matches ref1, with options:
  - `R`: search radius. `max_err`: skip the region when the pose differs too much.
  - `tol`: colour tolerance for a match.
  - `nbr` 7: at least 7 of the 3x3 neighbours must also match. This stops speckle on parts that moved.
  - `remove` / `add`: allow tears to delete pixels or torn ends to add them.
  - Keep `lut` off when poses differ. A colour table recolours grey everywhere and makes red speckle.
- `mode: "patch"`: rigid features such as the generator.
  - Anchored on the bright teal screen, searched only near the box. If the anchor is hidden (behind a raised gun), the region is skipped.
- `heat`: a weapon that changes angle is never region-copied.
  - Give `ref_axis` on the approved frame, then per-frame `axes` keyed by the index in `frames`. Use the muzzle and the drum end.
  - The barrel is recoloured band by band (tip hottest) from ref1→ref2 colour pairs.
  - Region copies ignore the ref barrel area, so old barrel pixels never land on legs.
- It drops loose bits of 6 px or fewer that the edit cut off, and prints one JSON report per frame.

## Checks (all must pass before showing)
- `parts` 1: one body. `bbox_in == bbox_out`: same size and ground line as phase 1.
- `new_colours` 0: only phase-1 and reference colours.
- No teal left around the generator, counted with ints (uint8 overflow gave false counts once).
- Phase-1 vs phase-2 sheet of every frame, and an x5 zoom of 2–3 frames next to the reference.
- First, reproduce the approved key frame with the tool (0 px different). This proves the config.

## Lessons
- Gemini or video won't keep tears consistent. Painting by rule (jagged hem, cyan→red) looked fake. Copying 1:1 from the reference frame is what the user approved.
- Hold onto the user's order: the first frame gets checked before the rest are made.
- The lit (flash) frames are a separate pass. Light only the parts facing the flash: face front, chest, belly, front thigh, far arm, barrel top. Use hand-placed zones aligned per frame; edge-band rules missed the chest. Darken only the back. Push the colour toward amber, not olive.
