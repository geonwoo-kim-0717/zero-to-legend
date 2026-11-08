const P = require("/root/.claude/skills/codixel/core/pixel.js"), fs = require("fs");
const it = [];
for (const k of ["midboss", "boss"]) {
  for (const n of ["w1", "w2", "aim", "charge"]) it.push({ buf: P.load(`out/${k}_${n}.png`), label: `${k}_${n}`.toUpperCase().replace(/_/g, " "), scale: 4 });
  for (const n of ["w1", "w2", "aim", "charge"]) { const f = P.trim(P.load(`full_${k}_${n}.png`), 2); it.push({ buf: P.resize(f, Math.round(f.w * 150 / f.h), 150), label: "RIG " + n.toUpperCase(), scale: 1 }); }
  const cur = P.load(`/home/user/zero-to-legend/src/assets/${k}_w1.png`); it.push({ buf: cur, label: "OLD", scale: 4 });
  for (const n of ["w1", "aim", "charge"]) it.push({ buf: P.load(`out/${k}_${n}.png`), label: "1X", scale: 1 });
}
P.save(P.sheet(it, { cols: 4 }), "preview.png");
const frames = [], seq = ["w1", "w2", "w1", "w2", "w1", "w2", "aim", "aim", "charge", "charge"];
for (const n of seq) { const b = new P.Buf(140, 64); b.rect(0, 0, 140, 64, [26, 16, 48]);
  [["midboss", 36], ["boss", 44]].forEach(([k, S], i) => { const f = P.load(`out/${k}_${n}.png`), e = f.w > S ? 6 : 0; b.sprite(f, 35 + i * 70 - (f.w >> 1), 58 - S - e); });
  frames.push(b); }
fs.writeFileSync("preview.gif", P.gif(frames, { delay: [240, 240, 240, 240, 240, 240, 200, 200, 200, 200], scale: 4 }));
