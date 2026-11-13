// Black Shield troopers: walk x8, attack x10, drop x6 (falling out of the dropship), land x6 — full-size frames.
const P = require("/root/.claude/skills/codixel/core/pixel.js");
const R = require("./rigs.js"), fs = require("fs");
const C = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4), 16)];
const Wh = C("E8F7FF"), Y = C("FFF23A"), O = C("FF8A1F"), Cy = C("00F0FF"), G = C("39FF88"), L = C("B6FF3A"), Gr = C("8A7AA8"), D1 = C("5C6680"), D2 = C("3A4058");
const SIZE = { trooper_tank: 36, trooper_melee: 36, trooper_hacker: 36, trooper_sniper: 42 };
const FEET = ["shinB", "shinF"];
const cut = (k) => fs.readFileSync(`cut_${k}.txt`, "utf8").split(" ").map(Number);
function lowest(rig, pose) { const T = rig.pose(pose); return Math.max(...FEET.map((n) => { const i = rig.index(n), b = rig.bones[i]; return P.Rig.apply(T[i], b.ex, b.ey)[1]; })); }
const at = (rig, p, bone, x, y) => P.Rig.apply(rig.pose(p)[rig.index(bone)], x, y);
const dust = (b, x, y, s, k) => { for (let i = -2; i <= 2; i++) { const r = s * (1 + k * 0.5) * (1 - Math.abs(i) * 0.15); b.blob(x + i * s * (1.2 + k * 0.6), y - 2 - k * 2, r, i % 2 ? D1 : D2); } };
const S2 = (t) => Math.sin(t * Math.PI * 2);
function walk(k, extra = {}) { const t = k / 8, s = S2(t);
  return { thighB: 0.45 * s, shinB: 0.45 * Math.max(0, -S2(t + 0.25)), thighF: -0.45 * s, shinF: 0.45 * Math.max(0, S2(t + 0.25)), ...extra }; }
const ease = (x) => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
const ATK = {
  trooper_tank: (k) => { const a = k < 4 ? -ease(k / 3) * 6 : k < 6 ? 14 * ease((k - 3) / 2) - 6 : 8 * (1 - ease((k - 5) / 4));   // brace, shield bash, recover
    return { pose: { body: { a: k < 4 ? -0.08 * ease(k / 3) : k < 6 ? 0.12 : 0.12 * (1 - ease((k - 5) / 4)), dx: a }, thighB: k >= 4 && k < 7 ? -0.5 : 0, thighF: k >= 4 && k < 7 ? 0.4 : 0, shinB: k >= 4 && k < 7 ? 0.3 : 0 },
      fx: (b, rig, p, ox, oy) => { if (k >= 4 && k <= 6) { const [x, y] = at(rig, p, "shield", 104, 80); for (let i = -2; i <= 2; i++) b.line(ox + x + 4, oy + y + i * 16, ox + x + 18 - Math.abs(i) * 3, oy + y + i * 18, i % 2 ? Cy : Wh); } } }; },
  trooper_melee: (k) => { const raise = k < 4 ? ease(k / 3) : k < 6 ? 1 - ease((k - 3) / 2) * 1.6 : -0.6 * (1 - ease((k - 5) / 4));
    return { pose: { armF: -1.9 * Math.max(0, raise) + 0.5 * Math.max(0, -raise), foreF: -0.6 * Math.max(0, raise), body: { a: k >= 4 && k < 7 ? 0.12 : -0.05 * Math.max(0, raise), dx: k >= 4 && k < 7 ? 4 : 0 } },
      fx: (b, rig, p, ox, oy) => { const [x, y] = at(rig, p, "foreF", 98, 94); b.blob(ox + x, oy + y, k >= 3 && k <= 6 ? 7 : 4, Cy); b.blob(ox + x, oy + y, 3, Wh);
        if (k >= 4 && k <= 6) for (let d = -80; d <= 30; d += 3) { const a = d * Math.PI / 180, cx = at(rig, p, "armF", 68, 46); for (let r = 44; r <= 50; r++) b.pset(ox + cx[0] + r * Math.cos(a), oy + cx[1] + r * Math.sin(a), r > 47 ? Wh : Cy); } } }; },
  trooper_hacker: (k) => { const up = k < 3 ? ease(k / 2) : k < 8 ? 1 : 1 - ease((k - 7) / 2);
    return { pose: { armR: -1.45 * up, body: { a: -0.03 * up } },
      fx: (b, rig, p, ox, oy) => { if (k >= 3 && k <= 7) { const [x, y] = at(rig, p, "armR", 62, 88); const len = 20 + (k - 3) * 14;
        for (let i = 0; i < len; i += 2) { b.pset(ox + x + 2 + i, oy + y + Math.round(Math.sin((i + k * 5) / 4) * 2), G); b.pset(ox + x + 2 + i, oy + y + 1, L); }
        b.blob(ox + x + 2, oy + y, 5, G); b.blob(ox + x + 2, oy + y, 2, Wh); } } }; },
  trooper_sniper: (k) => { const rec = k === 3 ? 6 : k === 4 ? 4 : k === 5 ? 2 : 0;
    return { pose: { body: { dx: -rec, a: -0.02 * rec / 6 }, head: k >= 7 && k <= 8 ? 0.06 : 0 },
      fx: (b, rig, p, ox, oy) => { const [x, y] = at(rig, p, "body", 126, 42);
        if (k === 3) { b.blob(ox + x + 6, oy + y, 9, O); b.blob(ox + x + 6, oy + y, 5, Y); b.blob(ox + x + 4, oy + y, 2, Wh); for (let i = -1; i <= 1; i++) b.line(ox + x + 10, oy + y + i * 4, ox + x + 24, oy + y + i * 9, Y); }
        if (k === 4) b.blob(ox + x + 8, oy + y - 2, 5, Gr);
        if (k >= 7 && k <= 8) { const [sx, sy] = at(rig, p, "body", 70, 40); b.blob(ox + sx, oy + sy - (k - 6) * 6, 2, Y); } } }; },
};
const DROP = (k) => { const tuck = 1 - k / 5;   // falling, legs tucked -> extended for landing, arms out for balance
  return { thighB: -0.9 * tuck - 0.1, shinB: 1.3 * tuck + 0.1, thighF: -0.7 * tuck + 0.1, shinF: 1.1 * tuck, body: { a: 0.08 * tuck } }; };
const LAND = (k) => { const c = [1, 0.85, 0.6, 0.35, 0.15, 0][k];   // impact crouch rising to stand
  return { pose: { thighB: -0.75 * c, shinB: 1.25 * c, thighF: -0.55 * c, shinF: 1.05 * c, body: { a: 0.1 * c } }, fx: k <= 3 ? (b, ox, oy, g) => dust(b, ox + 50, oy + g, 7, k) : null }; };

for (const k of Object.keys(R)) {
  const rig = R[k](), S = SIZE[k], F = S + 12, [cw, ch] = cut(k), sc = (S - 2) / Math.max(cw, ch) * ch / rig.src.h;
  const Wc = Math.ceil(F / sc), ox = (6 + S / 2) / sc - rig.src.w / 2, oy = (6 + S - 1) / sc - rig.src.h;
  const g0 = lowest(rig, {});
  const out = (name, pose, fx, air) => {
    const p = JSON.parse(JSON.stringify(pose));
    if (!air) { const dy = g0 - lowest(rig, p), b = p.body ?? {}; p.body = typeof b === "number" ? { a: b, dy } : { ...b, dy: (b.dy ?? 0) + dy }; }
    const buf = new P.Buf(Wc, Wc); rig.draw(buf, ox, oy, p); if (fx) fx(buf, rig, p, ox, oy); P.save(buf, `full_${k}_${name}.png`);
  };
  for (let i = 0; i < 8; i++) out(`walk_${String(i).padStart(2, "0")}`, walk(i, k === "trooper_melee" ? { armF: 0.15 * S2(i / 8) } : k === "trooper_hacker" ? { armR: -0.15 * S2(i / 8) } : {}));
  for (let i = 0; i < 10; i++) { const a = ATK[k](i); out(`atk_${String(i).padStart(2, "0")}`, a.pose, a.fx); }
  for (let i = 0; i < 6; i++) out(`drop_${String(i).padStart(2, "0")}`, DROP(i), null, true);
  for (let i = 0; i < 6; i++) { const l = LAND(i); out(`land_${String(i).padStart(2, "0")}`, l.pose, l.fx ? (b, r, p, x, y) => l.fx(b, x, y, rig.src.h) : null); }
  fs.writeFileSync(`scale_${k}.txt`, `${sc} ${S}`);
  console.log(k, "ok");
}
