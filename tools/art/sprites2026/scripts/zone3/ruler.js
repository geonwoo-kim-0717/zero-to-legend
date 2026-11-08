const P = require("/root/.claude/skills/codixel/core/pixel.js");
const K = ["guard_baton", "guard_rifle", "guard_shotgun", "guard_charger", "spider_bot"];
for (const k of K) {
  const cut = P.load(`../cut_${k}.png`);
  const H = k === "spider_bot" ? 80 : 120;                 // working size: big enough to rig, small enough to read
  const w = P.trim(P.resize(cut, Math.round(cut.w * H / cut.h), H), 0);
  P.save(w, `work_${k}.png`);
  P.save(P.ruler(w, 4, { step: 10 }), `ruler_${k}.png`);
  console.log(k, w.w, w.h);
}
