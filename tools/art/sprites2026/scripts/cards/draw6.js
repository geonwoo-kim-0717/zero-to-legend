// Code-drawn stand-in renders for the six cards Scenario could not generate (plan limit): lit 3D-ish bodies built
// from melted primitives (P.solid), on a transparent 420px canvas; rim.py then adds the cyan/magenta rim light and
// grey background the generated renders have, so card.py treats them the same way.
const P = require("/root/.claude/skills/codixel/core/pixel.js");
const R = (a, b, n = 7) => Array.from({ length: n }, (_, i) => P.mix(a, b, i / (n - 1)));
const RED = R([70, 10, 20], [255, 90, 90]), CHROME = R([40, 42, 55], [245, 248, 255]), GUN = R([28, 30, 40], [150, 155, 175]);
const CYAN = R([0, 70, 90], [190, 255, 255]), GREEN = R([0, 70, 30], [190, 255, 200]), ORANGE = R([90, 30, 0], [255, 190, 90]);
const L = { light: [-0.5, -0.7, 0.55], k: 1.2 };
const out = {};
function canvas() { const b = new P.Buf(420, 420); return b; }

out.magnet = () => { const b = canvas();
  const arc = []; for (let a = 0; a <= Math.PI; a += Math.PI / 10) arc.push(P.cap(210 + 95 * Math.cos(a), 250 + 95 * Math.sin(a), 210 + 95 * Math.cos(a + Math.PI / 10), 250 + 95 * Math.sin(a + Math.PI / 10), 44));
  P.solid(b, [P.cap(115, 120, 115, 250, 44), P.cap(305, 120, 305, 250, 44), ...arc], RED, L);
  P.solid(b, [P.cap(115, 70, 115, 118, 46)], CHROME, { ...L, gloss: 0.6 }); P.solid(b, [P.cap(305, 70, 305, 118, 46)], CHROME, { ...L, gloss: 0.6 });
  for (const y of [150, 185, 220]) { P.solid(b, [P.ell(115, y, 50, 10)], CYAN, L); P.solid(b, [P.ell(305, y, 50, 10)], CYAN, L); }
  for (const [x, y, r] of [[200, 40, 9], [240, 70, 7], [175, 85, 6], [262, 30, 6]]) P.solid(b, [P.ell(x, y, r, r * 0.7, 0.6)], CHROME, L);
  return b; };

out.cd = () => { const b = canvas();
  for (const y of [150, 190, 230, 270]) P.solid(b, [P.cap(90, y, 330, y, 10)], CHROME, { ...L, gloss: 0.4 });     // cooling fins
  P.solid(b, [P.cap(210, 90, 210, 330, 78)], GUN, { ...L, gloss: 0.3 });
  P.solid(b, [P.cap(210, 120, 210, 300, 44)], CYAN, { ...L, ambient: 0.6 });                                       // coolant window
  P.solid(b, [P.cap(150, 70, 270, 70, 30)], GUN, L); P.solid(b, [P.cap(150, 350, 270, 350, 30)], GUN, L);
  for (const [x, y, r] of [[170, 40, 24], [215, 28, 28], [255, 42, 20]]) P.solid(b, [P.ell(x, y, r, r * 0.8)], R([180, 200, 215], [255, 255, 255]), { ...L, ambient: 0.7 });
  return b; };

out.hp = () => { const b = canvas();
  for (let i = 0; i < 6; i++) { const y = 95 + i * 42, w = 120 - Math.abs(i - 2) * 14;
    for (const s of [-1, 1]) P.solid(b, [P.cap(210 + s * 18, y, 210 + s * w * 0.75, y + 18, 11, 9), P.cap(210 + s * w * 0.75, y + 18, 210 + s * w, y + 52, 9, 7)], CHROME, { ...L, gloss: 0.5 }); }
  for (let i = 0; i < 8; i++) P.solid(b, [P.ell(210, 50 + i * 42, 26, 19)], CHROME, { ...L, gloss: 0.6 });
  for (let i = 0; i < 8; i++) P.solid(b, [P.ell(210, 71 + i * 42, 13, 5)], CYAN, { ...L, ambient: 0.7 });
  return b; };

out.spd = () => { const b = canvas();
  P.solid(b, [P.cap(250, 40, 225, 165, 44, 36)], GUN, { ...L, gloss: 0.3 });                                      // thigh
  P.solid(b, [P.cap(196, 100, 160, 330, 12), P.cap(160, 330, 185, 345, 10), P.cap(196, 100, 220, 90, 10)], CHROME, { ...L, gloss: 0.7 });   // piston, braced to thigh and ankle
  P.solid(b, [P.cap(225, 175, 190, 330, 32, 24)], GUN, { ...L, gloss: 0.3 });                                      // shin
  P.solid(b, [P.ell(225, 170, 34, 34)], CYAN, { ...L, ambient: 0.55 });                                            // knee joint
  P.solid(b, [P.ell(190, 340, 22, 22)], CYAN, { ...L, ambient: 0.55 });
  P.solid(b, [P.cap(175, 360, 300, 372, 24, 16), P.cap(190, 340, 180, 362, 20)], GUN, L);                                                         // foot
  for (const y of [120, 175, 230]) P.solid(b, [P.cap(35, y, 105, y, 5)], ORANGE, { ...L, ambient: 0.8 });          // speed streaks
  return b; };

out.pick = () => { const b = canvas();
  P.solid(b, [P.cap(200, 220, 200, 360, 14)], CHROME, { ...L, gloss: 0.5 });
  P.solid(b, [P.ell(200, 375, 80, 26)], GUN, L);
  P.solid(b, [P.ell(170, 170, 95, 60, -0.6)], CHROME, { ...L, gloss: 0.5 });                                       // dish
  P.solid(b, [P.ell(165, 175, 70, 40, -0.6)], GUN, L);
  P.solid(b, [P.cap(165, 175, 250, 110, 6)], CHROME, L); P.solid(b, [P.ell(252, 108, 12, 12)], GREEN, { ...L, ambient: 0.7 });
  for (const r of [50, 85, 120]) for (let a = -1.25; a <= 0.05; a += 0.035) {                                        // signal waves
    const x = 252 + r * Math.cos(a), y = 108 + r * Math.sin(a); P.solid(b, [P.ell(x, y, 6, 6)], GREEN, { ...L, ambient: 0.8 }); }
  return b; };

out.heal = () => { const b = canvas();
  P.solid(b, [P.cap(115, 305, 290, 130, 46)], R([150, 160, 175], [250, 252, 255]), { ...L, gloss: 0.6 });         // glass barrel
  P.solid(b, [P.cap(130, 290, 255, 165, 30)], GREEN, { ...L, ambient: 0.6 });                                       // nanite fluid
  P.solid(b, [P.cap(92, 328, 60, 360, 36, 30)], GUN, L); P.solid(b, [P.cap(60, 360, 35, 385, 10)], GUN, L);        // plunger
  P.solid(b, [P.cap(290, 130, 315, 105, 26, 20)], GUN, L);
  P.solid(b, [P.cap(315, 105, 395, 25, 4, 2)], CHROME, { ...L, gloss: 0.8 });                                       // needle
  for (const [x, y] of [[170, 245], [205, 210], [190, 255], [225, 190]]) P.solid(b, [P.ell(x, y, 7, 7)], R([200, 255, 220], [255, 255, 255]), { ...L, ambient: 0.9 });
  return b; };

const dir = process.argv[2] || "draw";
require("fs").mkdirSync(dir, { recursive: true });
for (const [k, f] of Object.entries(out)) P.save(f(), `${dir}/${k}.png`);
