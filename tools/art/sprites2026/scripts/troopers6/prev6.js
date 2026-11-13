const P = require("/root/.claude/skills/codixel/core/pixel.js"), fs = require("fs");
const K = ["trooper_tank", "trooper_melee", "trooper_hacker", "trooper_sniper"], A = { walk: 8, atk: 10, drop: 6, land: 6 };
const frames = [], N = 10;
for (let f = 0; f < 20; f++) {
  const b = new P.Buf(4 * 4 * 56, 4 * 60); b.rect(0, 0, b.w, b.h, [26, 16, 48]);
  K.forEach((k, r) => Object.entries(A).forEach(([a, n], c) => { const im = P.load(`out/${k}_${a}_${String(f % n).padStart(2, "0")}.png`);
    const yo = a === "drop" ? (f % n) * 2 - 8 : 0; b.sprite(im, c * 4 * 56 / 4 * 1 + c * 0 + c * 56 * 0 + c * 56 + 2 + r * 0, r * 60 + 4 + yo); }));
  frames.push(b);
}
fs.writeFileSync("troopers6.gif", P.gif(frames.map((b) => b), { delay: 110, scale: 3 }));
// static sheet of every frame
const it = [];
for (const k of K) for (const [a, n] of Object.entries(A)) for (let i = 0; i < n; i++) it.push({ buf: P.load(`out/${k}_${a}_${String(i).padStart(2, "0")}.png`), label: i ? "" : `${k.slice(8)} ${a}`, scale: 3 });
P.save(P.sheet(it, { cols: 30 }), "troopers6_sheet.png");
