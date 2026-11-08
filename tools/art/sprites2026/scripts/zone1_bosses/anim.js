// Pose the zone-1 boss rigs: w1 / w2 walk (feet kept on the ground), aim (wind-up), charge (rush); effects at full size.
const P = require("/root/.claude/skills/codixel/core/pixel.js");
const R = require("./rigs.js"), fs = require("fs");
const C = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4), 16)];
const Wh = C("E8F7FF"), Y = C("FFF23A"), O = C("FF8A1F"), Rd = C("FF2A3A"), Gr = C("8A7AA8"), N3 = C("3D1F66");
const SIZE = { midboss: 36, boss: 44 };
const lowest = (rig, pose) => { const T = rig.pose(pose);
  return Math.max(...["shinB", "shinF"].map((n) => { const k = rig.index(n), b = rig.bones[k]; return P.Rig.apply(T[k], b.ex, b.ey)[1]; })); };
const at = (rig, p, bone, x, y) => P.Rig.apply(rig.pose(p)[rig.index(bone)], x, y);
const speed = (b, ox, oy, ys, len) => ys.forEach((y, i) => b.line(ox - len + (i % 2) * 6, oy + y, ox - 4 + (i % 2) * 6, oy + y, i % 2 ? Gr : N3, 2));

const POSES = {
  midboss: {
    w2: { thighB: -0.6, shinB: 0.4, thighF: 0.55, shinF: -0.15, armF: 0.2, armB: -0.15 },
    aim: { body: -0.12, head: 0.08, armB: 1.7, foreB: 0.35, cleaver: 0.25, armF: -0.35, thighF: -0.3, shinF: 0.3, thighB: 0.25 },
    charge: { body: 0.3, head: -0.2, armB: -1.35, foreB: -0.3, cleaver: -0.4, armF: 0.35, thighB: 0.5, shinB: -0.1, thighF: -0.7, shinF: 0.55 },
    fx: { aim: (b, rig, p, ox, oy) => { const [x, y] = at(rig, p, "cleaver", 10, 116);    // cleaver heats up: sparks round the blade
            for (const [dx, dy, c] of [[-6, -4, Y], [5, -8, O], [-2, 6, Y], [8, 2, Rd], [-9, 3, O]]) b.blob(ox + x + dx, oy + y + dy, 2, c); },
          charge: (b, rig, p, ox, oy) => { speed(b, ox, oy, [30, 52, 74, 96, 118], 30);
            const [sx, sy] = at(rig, p, "armB", 42, 30);                                      // hot slash arc in front
            for (let d = -50; d <= 70; d += 2) { const a = d * Math.PI / 180;
              for (let r = 74; r <= 82; r++) b.pset(ox + sx + r * Math.cos(a), oy + sy + r * Math.sin(a), r > 79 ? Y : O); } } } },
  boss: {
    w2: { thighB: -0.5, shinB: 0.35, thighF: 0.5, shinF: -0.15, coatB: 0.12, armB: -0.15, gunarm: 0.05 },
    aim: { body: -0.06, head: 0.05, gunarm: -0.2, gun: -0.1, coatB: -0.05 },
    charge: { body: 0.25, head: -0.15, gunarm: -0.3, gun: 0.05, coatB: 0.65, armB: 0.5, thighB: 0.45, shinB: 0.0, thighF: -0.6, shinF: 0.45 },
    fx: { aim: (b, rig, p, ox, oy) => { const [x, y] = at(rig, p, "gun", 103, 38);       // rotary barrels firing
            b.blob(ox + x + 7, oy + y + 1, 8, Y); b.blob(ox + x + 6, oy + y + 1, 4, Wh);
            b.line(ox + x, oy + y + 1, ox + x + 22, oy + y + 1, Wh, 2); b.blob(ox + x + 18, oy + y - 6, 3, O); b.blob(ox + x + 18, oy + y + 8, 3, O); },
          charge: (b, rig, p, ox, oy) => speed(b, ox, oy, [36, 58, 80, 102, 124], 32) } },
};

for (const [k, cfg] of Object.entries(POSES)) {
  const rig = R[k](), S = SIZE[k], F = S + 12, [cw, ch] = fs.readFileSync(`cut_${k}.txt`, "utf8").split(" ").map(Number);
  const sc = (S - 2) / Math.max(cw, ch) * ch / rig.src.h;
  const Wc = Math.ceil(F / sc), ox = (6 + S / 2) / sc - rig.src.w / 2, oy = (6 + S - 1) / sc - rig.src.h, g0 = lowest(rig, {});
  for (const [name, pose] of [["w1", {}], ["w2", cfg.w2], ["aim", cfg.aim], ["charge", cfg.charge]]) {
    const p = JSON.parse(JSON.stringify(pose)), dy = g0 - lowest(rig, p), b0 = p.body ?? 0;
    p.body = typeof b0 === "number" ? { a: b0, dy } : { ...b0, dy };
    const buf = new P.Buf(Wc, Wc);
    rig.draw(buf, ox, oy, p);
    if (cfg.fx[name]) cfg.fx[name](buf, rig, p, ox, oy);
    P.save(buf, `full_${k}_${name}.png`);
  }
  fs.writeFileSync(`scale_${k}.txt`, `${sc} ${S}`);
}
