const P = require("/root/.claude/skills/codixel/core/pixel.js"), fs = require("fs");
const K = ["guard_baton", "guard_rifle", "guard_shotgun", "guard_charger", "spider_bot"], it = [];
for (const k of K) {
  for (const s of ["", "_w2", "_aim"]) it.push({ buf: P.load(`out/${k}${s}.png`), label: (k + s).replace(/_/g, " ").toUpperCase(), scale: 5 });
  const f = P.load(`full_${k}_aim.png`); it.push({ buf: P.resize(P.trim(f, 2), 110), label: "RIG AIM", scale: 1 });
}
P.save(P.sheet(it, { cols: 4 }), "preview.png");
const seq = ["", "_w2", "", "_w2", "", "_w2", "_aim", "_aim"], frames = [];
for (const s of seq) {
  const b = new P.Buf(5 * 40, 40); b.rect(0, 0, 200, 40, [26, 16, 48]);
  K.forEach((k, i) => { const f = P.load(`out/${k}${s}.png`), e = s === "_aim" ? 6 : 0; b.sprite(f, i * 40 + 20 - (f.w >> 1), 36 - f.h + e); });
  frames.push(b);
}
fs.writeFileSync("preview.gif", P.gif(frames, { delay: [240, 240, 240, 240, 240, 240, 260, 260], scale: 4 }));
