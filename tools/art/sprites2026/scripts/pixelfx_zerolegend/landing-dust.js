// A trooper lands from the dropship: two dust rings roll out along the floor one after the other, grit hops away.
// Rings and puffs adapted from impacts/heavy-landing (after Sprite Fusion's open-source explosion,
// https://www.spritefusion.com/pixel-art-vfx/explosion, MIT License, Copyright (c) 2026 Hugo Duprez).
import { Particles, P, Rng, fit, TAU, WHITE, mix } from "../../core/index.js";
export const meta = {
  name: "Landing dust", desc: "Two dust rings roll out along the floor from a trooper's landing, grit hops away, all settles.",
  tags: ["dust", "landing", "ground", "one-shot"], size: [112, 40], origin: [56, 30], duration: 1.4, loop: false, fps: 12, bg: "ground",
  options: { palette: ["#2A2F45", "#3A4058", "#5C6680", "#A8B0C4", "#C9C2D9"], seed: 21 },
};
export function create(o) {
  const C = fit(o.palette, 5), R = new Rng(o.seed), floor = () => 0;
  const back = new Particles({ rng: R, ground: floor }), front = new Particles({ rng: R, ground: floor });
  const DUST = C[2], LIT = mix(C[3], WHITE, 0.25);
  const ring = (n, v0, v1, s0, s1, delay) => { for (let i = 0; i < n; i++) { const g = (i / n) * TAU + R.range(-0.1, 0.1), v = R.range(v0, v1), far = Math.sin(g) < 0;
    (far ? back : front).spawn(P.DUST, Math.cos(g) * 3, Math.sin(g) * 0.7 - 1, Math.cos(g) * v, Math.sin(g) * v * 0.16 - R.range(2, 8), R.range(0.45, 0.8), R.chance(0.45) ? LIT : DUST, R.range(s0, s1), delay + R.range(0, 0.03)); } };
  ring(22, 90, 130, 2.6, 3.8, 0.01); ring(18, 45, 75, 3.6, 5.4, 0.1);
  for (let i = 0; i < 8; i++) front.spawn(P.GRIT, R.range(-4, 4), -1, R.range(-70, 70), -R.range(30, 70), R.range(0.35, 0.7), C[1], 1, R.range(0, 0.05));
  let t = 0;
  return { update(dt) { t += dt; back.update(dt); front.update(dt); }, drawBack(p) { back.draw(p, "back"); back.draw(p, "front"); }, draw(p) { front.draw(p, "back"); front.draw(p, "front"); } };
}
