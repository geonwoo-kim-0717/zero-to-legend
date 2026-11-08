// Bone rigs for the zone-1 bosses on the 140px-high working references.
const P = require("/root/.claude/skills/codixel/core/pixel.js");
const R = {};
R.midboss = () => new P.Rig(P.load("work_midboss.png"))       // 'Butcher' Kovac
  .bone("body", null, 65, 82, 80, 25)
  .bone("head", "body", 88, 25, 96, 2, 1)
  .bone("armB", "body", 42, 30, 26, 60, -1).bone("foreB", "armB", 26, 60, 24, 82, -1).bone("cleaver", "foreB", 22, 84, 8, 120, -1)
  .bone("thighB", "body", 55, 86, 45, 106, -2).bone("shinB", "thighB", 45, 106, 35, 136, -2)
  .bone("thighF", "body", 86, 86, 96, 106, 2).bone("shinF", "thighF", 96, 106, 100, 138, 2)
  .bone("armF", "body", 88, 42, 104, 68, 3).bone("foreF", "armF", 104, 68, 125, 88, 3)
  .bind({ joint: 2, paint: {
    armB: [[25, 18], [64, 18], [64, 52], [30, 52]], foreB: [[8, 38], [36, 38], [37, 86], [8, 86]],
    cleaver: [[0, 80], [30, 80], [24, 130], [0, 130]],
    thighB: [[34, 84], [68, 84], [60, 110], [34, 110]], shinB: [[14, 106], [58, 106], [52, 140], [14, 140]],
    thighF: [[70, 84], [104, 84], [108, 108], [74, 108]], shinF: [[72, 104], [116, 104], [120, 140], [72, 140]],
    armF: [[96, 40], [110, 40], [114, 62], [100, 74], [94, 58]], foreF: [[96, 60], [114, 56], [131, 80], [131, 104], [108, 104]] } });

R.boss = () => new P.Rig(P.load("work_boss.png"))             // Carlo 'Red' Vasily
  .bone("body", null, 50, 82, 45, 25)
  .bone("head", "body", 45, 25, 45, 0, 1)
  .bone("coatB", "body", 20, 62, 10, 130, -2)
  .bone("armB", "body", 26, 40, 20, 86, -1)
  .bone("thighB", "body", 40, 86, 35, 110, -1).bone("shinB", "thighB", 35, 110, 26, 138, -1)
  .bone("thighF", "body", 58, 86, 65, 112, 1).bone("shinF", "thighF", 65, 112, 70, 138, 1)
  .bone("gunarm", "body", 60, 46, 74, 56, 3).bone("gun", "gunarm", 74, 56, 103, 38, 3)
  .bind({ joint: 2, paint: {
    coatB: [[0, 62], [30, 62], [30, 100], [22, 110], [14, 140], [0, 140]],
    armB: [[6, 40], [32, 40], [33, 92], [6, 92]],
    thighB: [[28, 84], [50, 84], [48, 112], [26, 112]], shinB: [[16, 108], [48, 108], [47, 140], [16, 140]],
    thighF: [[50, 82], [88, 82], [88, 112], [50, 112]], shinF: [[49, 108], [92, 108], [92, 140], [49, 140]],
    gunarm: [[56, 42], [73, 42], [75, 68], [56, 68]], gun: [[72, 26], [103, 26], [103, 66], [72, 66]] } });
module.exports = R;
if (require.main === module) {
  const it = [];
  for (const [k, mk] of Object.entries(R)) { const r = mk(), o = P.ruler(r.ownerMap(), 3, { step: 10 }); r.drawBones(o, 0, 0, {}, { scale: 3 });
    it.push({ buf: o, label: k.toUpperCase(), scale: 1 }, { buf: r.legend(), label: "", scale: 1 }); }
  P.save(P.sheet(it, { cols: 4 }), "owners.png");
}
