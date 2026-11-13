const P = require("/root/.claude/skills/codixel/core/pixel.js");
const R = {};
const legs = (r, b, f) => r
  .bone("thighB", "body", ...b[0], ...b[1], -1).bone("shinB", "thighB", ...b[1], ...b[2], -1)
  .bone("thighF", "body", ...f[0], ...f[1], 1).bone("shinF", "thighF", ...f[1], ...f[2], 1);
const LP = (x0, xm, x1, hip, knee) => ({
  thighB: [[x0, hip], [xm, hip], [xm, knee], [x0, knee + 2]], shinB: [[x0 - 4, knee - 2], [xm, knee - 2], [xm + 1, 140], [x0 - 4, 140]],
  thighF: [[xm, hip], [x1, hip], [x1, knee], [xm, knee]], shinF: [[xm, knee - 2], [x1 + 2, knee - 2], [x1 + 2, 140], [xm + 1, 140]] });
R.trooper_tank = () => legs(new P.Rig(P.load("work_trooper_tank.png"))
  .bone("body", null, 52, 92, 52, 34).bone("head", "body", 52, 34, 52, 4).bone("shield", "body", 80, 60, 88, 130, 2),
  [[44, 94], [42, 114], [40, 136]], [[62, 94], [66, 114], [66, 136]])
  .bind({ joint: 2, paint: { ...LP(20, 54, 76, 94, 114), body: [[0, 40], [30, 40], [30, 100], [0, 100]], shield: [[74, 42], [106, 42], [106, 140], [74, 140]] } });
R.trooper_melee = () => legs(new P.Rig(P.load("work_trooper_melee.png"))
  .bone("body", null, 48, 90, 48, 34).bone("head", "body", 48, 34, 50, 4)
  .bone("armF", "body", 68, 46, 80, 72, 2).bone("foreF", "armF", 80, 72, 94, 92, 2),
  [[38, 92], [36, 113], [34, 136]], [[56, 92], [64, 113], [70, 136]])
  .bind({ joint: 2, paint: { ...LP(14, 48, 78, 92, 113), body: [[0, 45], [26, 45], [26, 97], [0, 97]], armF: [[64, 40], [86, 40], [88, 76], [70, 80]], foreF: [[76, 70], [105, 70], [105, 110], [80, 110]] } });
R.trooper_hacker = () => legs(new P.Rig(P.load("work_trooper_hacker.png"))
  .bone("body", null, 36, 88, 36, 34).bone("head", "body", 38, 34, 38, 4).bone("armR", "body", 58, 46, 62, 88, 2),
  [[28, 90], [26, 112], [24, 136]], [[44, 90], [46, 112], [48, 136]])
  .bind({ joint: 2, paint: { ...LP(8, 36, 64, 90, 112), body: [[0, 40], [16, 40], [16, 97], [0, 97]], armR: [[52, 40], [71, 40], [71, 97], [54, 97]] } });
R.trooper_sniper = () => legs(new P.Rig(P.load("work_trooper_sniper.png"))
  .bone("body", null, 38, 92, 36, 30).bone("head", "body", 34, 30, 30, 2),
  [[30, 94], [24, 114], [20, 136]], [[46, 94], [50, 114], [54, 136]])
  .bind({ joint: 2, paint: LP(4, 38, 70, 94, 114) });
module.exports = R;
