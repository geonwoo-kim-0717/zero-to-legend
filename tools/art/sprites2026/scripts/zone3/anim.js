// Pose each rig into walk A / walk B / attack at working size, feet kept on the ground, effects drawn at full size.
const P = require("/root/.claude/skills/codixel/core/pixel.js");
const R = require("./rigs.js");
const fs = require("fs");
const C = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4), 16)];
const Wh = C("E8F7FF"), Y = C("FFF23A"), O = C("FF8A1F"), Cy = C("00F0FF"), Gr = C("8A7AA8"), N3 = C("3D1F66");
const SIZE = { guard_baton: 20, guard_rifle: 20, guard_shotgun: 20, guard_charger: 24, spider_bot: 12 };
const CUT = { guard_baton: [337, 449], guard_rifle: [350, 434], guard_shotgun: [365, 432], guard_charger: [427, 429], spider_bot: [377, 242] };

const feet = { guard: ["shinB", "shinF"], spider: ["leg1", "leg2", "leg3", "leg4"] };
function lowest(rig, pose, names) {
  const T = rig.pose(pose);
  return Math.max(...names.map((n) => { const k = rig.index(n), b = rig.bones[k]; return P.Rig.apply(T[k], b.ex, b.ey)[1]; }));
}
const at = (rig, pose, bone, x, y) => P.Rig.apply(rig.pose(pose)[rig.index(bone)], x, y);
const star = (b, x, y, r, c1, c2) => { b.blob(x, y, r, c2); b.blob(x, y, r * 0.55, c1); b.line(x - r * 1.6, y, x + r * 1.8, y, c1); b.line(x, y - r * 1.3, x, y + r * 1.3, c2); };

const POSES = {
  guard_rifle: { feet: feet.guard,
    w2: { thighB: -0.7, shinB: 0.35, thighF: 0.7, shinF: -0.15 },
    aim: { body: { dx: -2 }, head: 0.05 },
    fx: (b, rig, p, ox, oy) => { const [x, y] = at(rig, p, "body", 96, 33); star(b, ox + x + 7, oy + y, 6, Wh, Y); b.blob(ox + x + 16, oy + y, 3, O); } },
  guard_shotgun: { feet: feet.guard,
    w2: { thighB: -0.7, shinB: 0.35, thighF: 0.7, shinF: -0.15 },
    aim: { body: { a: -0.1, dx: -5 }, head: 0.08 },
    fx: (b, rig, p, ox, oy) => { const [x, y] = at(rig, p, "body", 100, 36); star(b, ox + x + 8, oy + y, 8, Wh, Y);
      for (const d of [-1, 0, 1]) { b.blob(ox + x + 26, oy + y + d * 12, 3.5, O); b.blob(ox + x + 34, oy + y + d * 17, 3, Y); } } },
  guard_baton: { feet: feet.guard,
    w2: { thighB: -0.7, shinB: 0.35, thighF: 0.7, shinF: -0.15, arm: -0.15 },
    aim: { body: { a: 0.14 }, arm: 1.25, baton: 0.15, thighF: -0.35, shinF: 0.25, thighB: 0.3 },
    fx: (b, rig, p, ox, oy) => {           // swing smear: arc from where the tip started to where it is now
      const [sx, sy] = at(rig, p, "arm", 54, 42), r0 = 44;
      for (let d = -70; d <= 40; d += 2) { const a = d * Math.PI / 180;
        for (let r = r0 - 7; r <= r0 + 2; r++) b.pset(ox + sx + r * Math.cos(a), oy + sy + r * Math.sin(a), r > r0 - 2 ? Wh : Cy); } } },
  guard_charger: { feet: feet.guard,
    w2: { thighB: -0.65, shinB: 0.4, thighF: 0.6, shinF: -0.2, armB: -0.35, armF: 0.15 },
    aim: { body: { a: 0.22 }, head: -0.15, armF: { a: -0.3, dx: 8 }, fist: 0.08, armB: 0.6, thighB: 0.35, shinB: -0.1, thighF: -0.4, shinF: 0.35 },
    fx: (b, rig, p, ox, oy) => { const [x, y] = at(rig, p, "fist", 118, 46);
      for (let i = 0; i < 4; i++) b.line(ox - 30 + (i % 2) * 8, oy + 28 + i * 18, ox + 2 + (i % 2) * 8, oy + 28 + i * 18, i % 2 ? Gr : N3);
      for (let i = -1; i <= 1; i++) b.line(ox + x + 6, oy + y + i * 12, ox + x + 16, oy + y + i * 15, i ? Cy : Wh); } },
  spider_bot: { feet: feet.spider,
    w1: { leg1: -0.3, leg3: -0.3, leg2: 0.15, leg4: 0.15 },
    w2: { leg1: 0.15, leg3: 0.15, leg2: -0.3, leg4: -0.3 },
    aim: { body: { a: -0.25, dx: 14, dy: -16 }, leg3: -1.3, leg4: -1.2, leg1: 0.55, leg2: 0.45 }, air: true,
    fx: (b, rig, p, ox, oy) => { const [x, y] = at(rig, p, "body", 103, 28); star(b, ox + x, oy + y, 7, Wh, Cy); } },
};

for (const [k, cfg] of Object.entries(POSES)) {
  const rig = R[k](), S = SIZE[k], F = S + 12, sc = (S - 2) / Math.max(...CUT[k]) * CUT[k][1] / rig.src.h;
  const Wc = Math.ceil(F / sc), ox = (6 + S / 2) / sc - rig.src.w / 2, oy = (6 + S - 1) / sc - rig.src.h;
  const g0 = lowest(rig, cfg.w1 || {}, cfg.feet);
  for (const [name, pose] of [["", cfg.w1 || {}], ["_w2", cfg.w2], ["_aim", cfg.aim]]) {
    const p = JSON.parse(JSON.stringify(pose));
    if (!(name === "_aim" && cfg.air)) {                         // keep the lowest foot on the ground
      const dy = g0 - lowest(rig, p, cfg.feet), b = p.body ?? {}; p.body = typeof b === "number" ? { a: b, dy } : { ...b, dy: (b.dy ?? 0) + dy };
    }
    const buf = new P.Buf(Wc, Wc);
    rig.draw(buf, ox, oy, p);
    if (name === "_aim") cfg.fx(buf, rig, p, ox, oy);
    P.save(buf, `full_${k}${name}.png`);
  }
  fs.writeFileSync(`scale_${k}.txt`, `${sc} ${S}`);
}
