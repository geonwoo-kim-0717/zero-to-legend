# Black Shield drop / land keyframes

Generated with the 2dimg2motion method (image model draws the poses, scripts only cut, scale and pixelate).

- `sources/troopers6_keys/<id>_keys.png`: Scenario FLUX.2 Klein 9B sheets on #ff00ff, reference = the trooper source.
  - tank: 4 cells, cells 2 (air tuck) and 3 (impact) used. melee/hacker/sniper: 2 cells, both used.
  - sniper cell 1: the duplicate upper barrel was erased (rows < 66, cols >= 152 of the cut); the original cut is `sniper_key2_orig.png`.
- Cut: split cell, flood out magenta, keep the largest component, crop.
- `keys_px.py`: per-trooper scale sheet->source (tank 1.7 shield, melee 1.5/1.22 helmet, hacker 1.55 helmet, sniper 1.35 rifle),
  `process.recolor_black`, brightness matched to the trooper's own work image (hue kept, accents excluded),
  placed on the troopers6 canvas with the same centre and foot line, `counters/pix_ext.pix`, magenta fringe cleanup.
  Paths inside point at the session scratch folder (`TR` = troopers6 work data, `tmp/` = cuts); change them to rerun.
- Output: `src/assets/trooper_<id>_drop.png` (tuck), `trooper_<id>_land.png` (impact), cropped so the feet are on the last row.

Effects: `scripts/pixelfx_zerolegend/*.js` are pixelfx effects (github patch-gg/pixelfx, put under src/fx/zerolegend/),
rendered with `node tools/render.mjs zerolegend/<id> --sheet --bg none [--opts '{"tilt":40}']`.

## Attack (8 frames each)
- Keyposes generated per trooper (sources/troopers6_keys/atk/): S start, A wind-up, M mid, B strike, F follow-through.
  Picks: tank A=tank_a#1 B=tank_b#2 S/M/F=tank_m1; melee A/B=melee_a, S=melee_m2#1, M=melee_mid1, F=melee_m1#3;
  hacker A/B=hacker_a, S/M/F=hacker_m2; sniper A/B=sniper_a, S=sniper_m2#3, M/F=sniper_m1#2,#3.
- `atk5_px.py` (+ `atk_scales.json`) pixelates them like keys_px.py; `atk_build.py` orders them, adds the rigged
  holds (A2 = 1px crouch, B2 = 1px forward or crouch, F2 = 1px crouch) and writes `trooper_<id>_atk_NN.png` + `atk_meta.json`
  (per-frame ms, which fx, fx start frame, fx anchor in frame pixels).
- Effects: fx_shield_bash (zerolegend/shield-bash), fx_baton_slash (melee/sword-slash, cyan palette),
  fx_hack_pulse (zerolegend/hack-pulse), fx_sniper_muzzle (projectiles/muzzle-pistol, height 31). All 12fps, one-shot.
