// Floor dust kicked up under the hovering dropship: puffs born under the four plumes roll outward along the floor
// both ways, swell, lift a little and thin out; grit skips ahead of them. Dust technique after impacts/heavy-landing
// (Sprite Fusion's open-source explosion, https://www.spritefusion.com/pixel-art-vfx/explosion, MIT, (c) 2026 Hugo Duprez).
import { P, Rng, fit, WHITE, mix } from "../../core/index.js";
import { Ghosts } from "../scifi/_lib.js";
export const meta = {
  name: "Dropship floor dust",
  desc: "Dust rolling out both ways along the floor under a hovering dropship's exhaust, puffs swelling and thinning, grit skipping ahead.",
  tags: ["dust", "ground", "dropship", "loop"],
  size: [176, 40], origin: [88, 30], duration: 2, loop: true, fps: 12, bg: "ground",
  options: { palette: ["#2A2F45", "#3A4058", "#5C6680", "#A8B0C4", "#C9C2D9"], spread: 34, seed: 11 },
};
const D = meta.duration, cache = new Map();
function ghosts(o) {
  const key = `${o.seed}:${o.spread}:${o.palette.join()}`;
  if (cache.has(key)) return cache.get(key);
  const C = fit(o.palette, 5), rn = new Rng(o.seed), floor = () => 0;
  const g = new Ghosts(D, { ground: floor, box: [-88, -30, 88, 10] });
  for (const sx of [-o.spread, -o.spread * 0.35, o.spread * 0.35, o.spread]) {
    for (let i = 0; i < 20; i++) {
      const dir = sx < 0 ? -1 : 1, v = rn.range(30, 70);
      g.add(rn.range(0, D), P.DUST, sx + rn.range(-3, 3), -1, dir * v + rn.range(-10, 10), -rn.range(2, 9), rn.range(1.0, 1.6), rn.chance(0.4) ? mix(C[3], WHITE, 0.2) : C[2], rn.range(3.5, 6));
    }
    for (let i = 0; i < 4; i++) g.add(rn.range(0, D), P.GRIT, sx, -1, (sx < 0 ? -1 : 1) * rn.range(50, 110), -rn.range(20, 50), rn.range(0.4, 0.8), C[1], 1);
  }
  cache.set(key, g);
  return g;
}
export function draw(p, t, o) { const g = ghosts(o).at(t); g.draw(p, "back"); g.draw(p, "front"); }
