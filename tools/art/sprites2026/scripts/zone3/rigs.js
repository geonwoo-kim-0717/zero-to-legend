// Bone rigs for the five zone-3 skins, on the clean working-size references (work_<id>.png).
const P = require("/root/.claude/skills/codixel/core/pixel.js");
const R = {};
const legs = (r, b, f) => r
  .bone("thighB", "body", ...b[0], ...b[1], -1).bone("shinB", "thighB", ...b[1], ...b[2], -1)
  .bone("thighF", "body", ...f[0], ...f[1], 1).bone("shinF", "thighF", ...f[1], ...f[2], 1);

R.guard_rifle = () => legs(new P.Rig(P.load("work_guard_rifle.png"))
  .bone("body", null, 40, 62, 40, 26).bone("head", "body", 40, 26, 40, 2),
  [[32, 64], [22, 88], [12, 114]], [[46, 64], [52, 86], [56, 114]])
  .bind({ joint: 2, paint: {
    thighB: [[4, 62], [39, 62], [33, 88], [4, 92]], shinB: [[0, 88], [31, 88], [27, 120], [0, 120]],
    thighF: [[39, 62], [66, 62], [62, 87], [44, 87]], shinF: [[42, 86], [70, 86], [72, 120], [42, 120]],
    body: [[50, 22], [97, 22], [97, 52], [50, 52]] } });

R.guard_shotgun = () => legs(new P.Rig(P.load("work_guard_shotgun.png"))
  .bone("body", null, 42, 62, 42, 25).bone("head", "body", 42, 25, 42, 2),
  [[32, 66], [22, 92], [14, 116]], [[52, 66], [58, 90], [60, 116]])
  .bind({ joint: 2, paint: {
    thighB: [[4, 64], [43, 64], [36, 92], [4, 96]], shinB: [[0, 90], [34, 90], [32, 120], [0, 120]],
    thighF: [[43, 64], [70, 64], [66, 90], [46, 90]], shinF: [[44, 89], [76, 89], [76, 120], [44, 120]],
    body: [[50, 25], [101, 25], [101, 55], [50, 55]] } });

R.guard_baton = () => legs(new P.Rig(P.load("work_guard_baton.png"))
  .bone("body", null, 40, 74, 38, 30).bone("head", "body", 38, 30, 38, 4)
  .bone("arm", "body", 54, 42, 66, 32, 2).bone("baton", "arm", 66, 32, 86, 8, 2),
  [[30, 78], [24, 96], [18, 116]], [[48, 78], [54, 98], [56, 116]])
  .bind({ joint: 2, paint: {
    thighB: [[6, 76], [40, 76], [34, 98], [6, 100]], shinB: [[0, 96], [32, 96], [30, 120], [0, 120]],
    thighF: [[40, 76], [66, 76], [62, 98], [44, 98]], shinF: [[42, 96], [70, 96], [70, 120], [42, 120]],
    body: [[0, 46], [26, 46], [24, 84], [0, 84]],
    arm: [[52, 30], [63, 24], [72, 34], [68, 54], [52, 54]], baton: [[63, 24], [72, 0], [90, 0], [90, 22], [72, 34]] } });

R.guard_charger = () => legs(new P.Rig(P.load("work_guard_charger.png"))
  .bone("body", null, 52, 70, 60, 22).bone("head", "body", 66, 22, 74, 2)
  .bone("armB", "body", 36, 36, 26, 60, -2).bone("armF", "body", 76, 44, 96, 50, 2).bone("fist", "armF", 96, 50, 118, 46, 2),
  [[42, 72], [26, 90], [10, 116]], [[62, 72], [72, 90], [78, 116]])
  .bind({ joint: 2, paint: {
    armB: [[10, 28], [40, 28], [38, 74], [10, 74]],
    armF: [[76, 36], [96, 36], [96, 66], [76, 66]], fist: [[96, 34], [119, 34], [119, 62], [96, 62]],
    thighB: [[14, 72], [50, 72], [40, 92], [14, 92]], shinB: [[0, 88], [34, 88], [36, 120], [0, 120]],
    thighF: [[50, 70], [84, 70], [84, 92], [58, 92]], shinF: [[60, 88], [96, 88], [96, 120], [60, 120]] } });

R.spider_bot = () => new P.Rig(P.load("work_spider_bot.png"))
  .bone("body", null, 60, 30, 100, 30)
  .bone("leg1", "body", 28, 42, 6, 72, 1).bone("leg2", "body", 55, 46, 42, 72, 1)
  .bone("leg3", "body", 72, 46, 80, 74, 1).bone("leg4", "body", 110, 45, 120, 70, 1)
  .bind({ joint: 2, paint: {
    body: [[0, 0], [125, 0], [125, 38], [36, 38], [36, 44], [0, 40]],
    leg1: [[0, 40], [34, 38], [34, 50], [14, 80], [0, 80]], leg2: [[38, 46], [58, 44], [56, 54], [50, 80], [36, 80]],
    leg3: [[66, 46], [82, 44], [90, 80], [72, 80], [70, 54]], leg4: [[104, 42], [125, 42], [125, 80], [110, 80]] } });

module.exports = R;
if (require.main === module) {
  const items = [];
  for (const [k, make] of Object.entries(R)) {
    const rig = make(), own = P.ruler(rig.ownerMap(), 3, { step: 10 });
    rig.drawBones(own, 0, 0, {}, { scale: 3 });
    items.push({ buf: own, label: k.toUpperCase().replace("_", " "), scale: 1 }, { buf: rig.legend(), label: "", scale: 1 });
  }
  P.save(P.sheet(items, { cols: 4 }), "owners.png");
}
