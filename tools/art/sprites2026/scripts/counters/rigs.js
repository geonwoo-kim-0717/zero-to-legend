// Bone rigs for the six counter units, on the clean working-size references (work_<id>.png, 140px high).
const P = require("/root/.claude/skills/codixel/core/pixel.js");
const R = {};
const legs = (r, b, f) => r
  .bone("thighB", "body", ...b[0], ...b[1], -1).bone("shinB", "thighB", ...b[1], ...b[2], -1)
  .bone("thighF", "body", ...f[0], ...f[1], 1).bone("shinF", "thighF", ...f[1], ...f[2], 1);
// leg paint boxes split at hip / knee rows and at the x between the legs
const legPaint = (x0, xm, x1, hip, knee) => ({
  thighB: [[x0, hip], [xm, hip], [xm, knee], [x0, knee + 2]], shinB: [[x0 - 4, knee - 2], [xm, knee - 2], [xm + 1, 140], [x0 - 4, 140]],
  thighF: [[xm, hip], [x1, hip], [x1, knee], [xm, knee]], shinF: [[xm, knee - 2], [x1 + 2, knee - 2], [x1 + 2, 140], [xm + 1, 140]] });

R.c_mirror = () => legs(new P.Rig(P.load("work_c_mirror.png"))
  .bone("body", null, 24, 88, 24, 22).bone("head", "body", 22, 22, 22, 0),
  [[18, 88], [16, 110], [14, 134]], [[29, 88], [30, 110], [30, 134]])
  .bind({ joint: 2, paint: { ...legPaint(4, 23, 36, 88, 110), body: [[36, 0], [52, 0], [52, 140], [36, 140]] } });   // mirror shield rides with the body

R.c_insulator = () => legs(new P.Rig(P.load("work_c_insulator.png"))
  .bone("body", null, 26, 80, 26, 22).bone("head", "body", 26, 22, 28, 2).bone("rod", "body", 59, 58, 60, 138, 2),
  [[22, 82], [20, 106], [18, 134]], [[31, 82], [33, 106], [34, 134]])
  .bind({ joint: 2, paint: { ...legPaint(14, 27, 46, 82, 106), body: [[0, 48], [15, 48], [15, 96], [0, 96]], rod: [[54, 0], [64, 0], [64, 140], [54, 140]] } });

R.c_dampener = () => legs(new P.Rig(P.load("work_c_dampener.png"))
  .bone("body", null, 40, 92, 42, 20),
  [[30, 92], [27, 114], [26, 132]], [[48, 92], [50, 114], [52, 132]])
  .bind({ joint: 2, paint: { ...legPaint(10, 39, 73, 92, 113), body: [[56, 50], [73, 50], [73, 88], [56, 88]] } });

R.c_thorn = () => legs(new P.Rig(P.load("work_c_thorn.png"))
  .bone("body", null, 28, 82, 30, 22).bone("head", "body", 32, 22, 34, 2),
  [[22, 84], [18, 108], [16, 134]], [[34, 84], [38, 108], [40, 134]])
  .bind({ joint: 2, paint: legPaint(2, 28, 55, 84, 108) });

R.c_prism = () => legs(new P.Rig(P.load("work_c_prism.png"))
  .bone("body", null, 28, 75, 28, 25).bone("head", "body", 28, 25, 30, 0),
  [[24, 76], [22, 102], [20, 134]], [[32, 76], [34, 102], [36, 134]])
  .bind({ joint: 2, paint: legPaint(8, 28, 48, 76, 102) });

R.c_firewall = () => new P.Rig(P.load("work_c_firewall.png"))
  .bone("body", null, 60, 70, 10, 70).bone("shield", "body", 120, 70, 120, 0, 1)
  .bind({ joint: 2, paint: { shield: [[104, 0], [139, 0], [139, 140], [104, 140]] } });
module.exports = R;
