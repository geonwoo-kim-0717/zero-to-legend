const P = require("/root/.claude/skills/codixel/core/pixel.js"), fs = require("fs");
const K = ["c_mirror", "c_insulator", "c_dampener", "c_thorn", "c_prism", "c_firewall"], it = [];
for (const k of K) {
  it.push({ buf: (() => { const c = P.load(`cut_${k}.png`); return P.resize(c, Math.round(c.w * 130 / c.h), 130); })(), label: k.slice(2).toUpperCase() + " REF", scale: 1 });
  for (const s of ["", "_w2"]) it.push({ buf: P.load(`out/${k}${s}.png`), label: s ? "W2" : "W1", scale: 5 });
}
P.save(P.sheet(it, { cols: 6 }), "preview.png");
const frames = [];
for (const s of ["", "_w2"]) {
  const b = new P.Buf(6 * 40, 40); b.rect(0, 0, 240, 40, [26, 16, 48]);
  K.forEach((k, i) => { const f = P.load(`out/${k}${s}.png`); b.sprite(f, i * 40 + 20 - (f.w >> 1), 36 - f.h); });
  frames.push(b);
}
fs.writeFileSync("preview.gif", P.gif(frames, { delay: 260, scale: 4 }));
