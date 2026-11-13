// Exhaust plumes for the Zero to Legend dropship. The flame (ragged noise cone, white heart, shock diamonds,
// cooling puffs) is adapted from this library's scifi/jetpack, itself after Sprite Fusion's open-source fire
// (https://www.spritefusion.com/pixel-art-vfx/fire), MIT License, Copyright (c) 2026 Hugo Duprez.
import { P, Rng, fit, tileFbm, lerp, rand, TAU, WHITE } from "../../core/index.js";
import { Ghosts } from "../scifi/_lib.js";

// local (0,0) = the ship sprite's top-left pixel; the four ducted fans of the 112x55 sprite
const FANS = [[19, 11], [82, 11], [14, 43], [81, 42]];
export const meta = {
  name: "Dropship wash",
  desc: "Four ducted-fan exhausts under a hovering dropship: cyan plasma cones with white hearts and shock knots, vapour puffs shed below. tilt leans them back for forward flight.",
  tags: ["scifi", "thrust", "exhaust", "dropship", "loop"],
  size: [136, 120],
  origin: [12, 4],
  duration: 1,
  loop: true,
  fps: 12,
  bg: "dark",
  options: {
    palette: ["#0F4A55", "#0A7A8A", "#2E9AA8", "#00F0FF", "#8FD8DE", "#E8F7FF"],
    vapour: "#A8B0C4",
    length: 26,
    tilt: 0,
    seed: 7,
  },
};
const D = meta.duration;
const cache = new Map();
function ghosts(o, F, dir) {
  const key = `${o.seed}:${o.tilt}:${o.length}:${o.palette.join()}`;
  if (cache.has(key)) return cache.get(key);
  const rn = new Rng(o.seed), L = o.length, g = new Ghosts(D, { sparks: [WHITE, F[5], F[4], F[3]], box: [-12, -4, 124, 116] });
  for (const [fx, fy] of FANS) {
    const bx = fx + dir[0] * L, by = fy + 9 + dir[1] * L;
    for (let i = 0; i < 6; i++) g.add(rn.range(0, D), P.VAPOUR, bx + rn.range(-2, 2), by + rn.range(-1, 2), dir[0] * rn.range(20, 40) + rn.range(-8, 8), dir[1] * rn.range(20, 40), rn.range(0.5, 0.9), o.vapour, rn.range(2, 3.4));
    for (let i = 0; i < 3; i++) g.add(rn.range(0, D), P.SPARK, fx + dir[0] * L * 0.5, fy + 9 + dir[1] * L * 0.5, dir[0] * rn.range(40, 90) + rn.range(-25, 25), dir[1] * rn.range(40, 90), rn.range(0.15, 0.3));
  }
  cache.set(key, g);
  return g;
}
export function draw(p, t, o) {
  const F = fit(o.palette, 6), ph = t / D, f = Math.floor(t * 12) % 12, S = o.seed, a = (o.tilt * Math.PI) / 180;
  const dir = [-Math.sin(a), Math.cos(a)], nrm = [Math.cos(a), Math.sin(a)];   // plume axis and its cross direction
  const g = ghosts(o, F, dir).at(t);
  g.draw(p, "back");
  FANS.forEach(([fx, fy], j) => {
    const ox = fx, oy = fy + 9, L = o.length * (0.9 + 0.1 * Math.sin(TAU * 3 * ph + j) + 0.08 * (rand(S, f, j) - 0.5));
    const ext = L + 6;
    p.shade(Math.floor(ox - ext), Math.floor(oy - 4), Math.ceil(ox + ext), Math.ceil(oy + ext), (x, y, out) => {
      const dx = x - ox, dy = y - oy, v = (dx * dir[0] + dy * dir[1]) / L, u = dx * nrm[0] + dy * nrm[1];
      if (v < -0.05) return;
      const w = lerp(3.6, 0.8, Math.min(1, v)) + 1.2 * Math.sin(Math.min(1, v) * Math.PI);
      const n = tileFbm(u / 3 + j * 5, v * L / 4 - ph * 12, 0, 10, S + j, 2), q = Math.abs(u) / w + n * 0.45;
      if (v > 1.12 || q > 1.2) return;
      const heat = (1 - v) * 1.15 - q * 0.9 + n * 0.25;
      if (q > 0.95) { out.c = heat > 0.2 ? F[2] : F[1]; if (heat < -0.3) out.a = 0.5; return; }
      out.c = heat > 0.82 ? WHITE : heat > 0.62 ? F[5] : heat > 0.42 ? F[4] : heat > 0.22 ? F[3] : heat > 0.02 ? F[2] : F[1];
    });
    for (let i = 0; i < 2; i++) {                                 // shock knots down the core
      const s = 4 + i * 5.5 + Math.sin(TAU * 2 * ph + i) * 0.4, cx = ox + dir[0] * s, cy = oy + dir[1] * s, r = i ? 1 : 2;
      if (s > L * 0.7) break;
      for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) { const d = Math.abs(xx) + Math.abs(yy); if (d <= r) p.px(Math.round(cx + xx), Math.round(cy + yy), d < r ? WHITE : F[5]); }
    }
    p.glow(ox, oy + 1, 7, WHITE, 0.35);
    p.glow(ox + dir[0] * L * 0.5, oy + dir[1] * L * 0.5, L * 0.7, F[3], 0.3);
  });
  g.draw(p, "front");
}
