// Pose each counter rig into walk A (rest) / walk B (stride) at working size, feet kept on the ground.
const P = require("/root/.claude/skills/codixel/core/pixel.js");
const R = require("./rigs.js");
const fs = require("fs");
const SIZE = { c_mirror: 26, c_insulator: 26, c_dampener: 26, c_thorn: 26, c_prism: 26, c_firewall: 24 };
const CUT = { c_mirror: [179, 485], c_insulator: [214, 469], c_dampener: [225, 432], c_thorn: [191, 484], c_prism: [167, 467], c_firewall: [412, 414] };
const FEET = ["shinB", "shinF"];
function lowest(rig, pose, names) {
  const T = rig.pose(pose);
  return Math.max(...names.map((n) => { const k = rig.index(n), b = rig.bones[k]; return P.Rig.apply(T[k], b.ex, b.ey)[1]; }));
}
const STRIDE = { thighB: -0.6, shinB: 0.35, thighF: 0.6, shinF: -0.15 };
const POSES = {
  c_mirror: { w2: { ...STRIDE, thighB: -0.45, thighF: 0.45 } },
  c_insulator: { w2: { ...STRIDE, rod: -0.06 } },
  c_dampener: { w2: { thighB: -0.4, shinB: 0.3, thighF: 0.4, shinF: -0.1, body: { a: 0.03 } } },
  c_thorn: { w2: STRIDE },
  c_prism: { w2: { ...STRIDE, head: { a: 0, dy: -2 } } },
  c_firewall: { air: true, w1: {}, w2: { body: { dy: -5 }, shield: { a: 0.05, dx: 2 } } },
};
for (const [k, cfg] of Object.entries(POSES)) {
  const rig = R[k](), S = SIZE[k], F = S + 12, sc = (S - 2) / Math.max(...CUT[k]) * CUT[k][1] / rig.src.h;
  const Wc = Math.ceil(F / sc), ox = (6 + S / 2) / sc - rig.src.w / 2, oy = (6 + S - 1) / sc - rig.src.h;
  const g0 = cfg.air ? 0 : lowest(rig, {}, FEET);
  for (const [name, pose] of [["", cfg.w1 || {}], ["_w2", cfg.w2]]) {
    const p = JSON.parse(JSON.stringify(pose));
    if (!cfg.air) { const dy = g0 - lowest(rig, p, FEET), b = p.body ?? {}; p.body = typeof b === "number" ? { a: b, dy } : { ...b, dy: (b.dy ?? 0) + dy }; }
    const buf = new P.Buf(Wc, Wc);
    rig.draw(buf, ox, oy, p);
    P.save(buf, `full_${k}${name}.png`);
  }
  fs.writeFileSync(`scale_${k}.txt`, `${sc} ${S}`);
}
