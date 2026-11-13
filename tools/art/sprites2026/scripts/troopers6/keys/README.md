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
