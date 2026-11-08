const P = require("/root/.claude/skills/codixel/core/pixel.js");
const T = { c_mirror: 28, c_insulator: 40, c_dampener: 40, c_thorn: 40, c_prism: 36, c_firewall: 40 };
const items = [];
for (const [k, tol] of Object.entries(T)) {
  let b = P.trim(P.erode(P.load(`nobg_${k}.png`), 1), 0);
  P.save(b, `cut_${k}.png`);
  const H = 140, w = Math.round(b.w * H / b.h);
  const work = P.resize(b, w, H);
  P.save(work, `work_${k}.png`);
  console.log(k, b.w, b.h, "->", w, H);
  items.push({ buf: P.ruler(work, 3, { step: 10 }), label: k });
}
P.save(P.sheet(items, { cols: 3 }), "rulers.png");
