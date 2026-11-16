// One gatling shell casing for Basili: thrown up and back out of the ejection port, tumbling, bouncing on the floor,
// then lying a moment and fading. Casing recipe from projectiles/_lib.js (after Sprite Fusion's open-source
// muzzle-flash, https://www.spritefusion.com/pixel-art-vfx/muzzle-flash, MIT License, Copyright (c) 2026 Hugo Duprez).
import { clamp, rng, fit, TAU } from "../../core/index.js";
import { casing, drawCasing } from "../projectiles/_lib.js";
export const meta = {
  name: "Basili casing", desc: "One brass casing kicked up and back from the gatling's ejection port, bouncing and settling on the floor.",
  tags: ["casing", "gun", "brass", "one-shot"], size: [72, 64], origin: [52, 60], duration: 0.9, loop: false, fps: 30, bg: "ground",
  options: { brass: ["#4a2e10", "#8c5c1c", "#d9a441", "#ffe39a"], height: 46, seed: 1 },
};
export function draw(p, t, o) {
  const B = fit(o.brass, 4), r = rng(o.seed, 7), D = meta.duration;
  const k = casing(0, -o.height, -r.range(22, 46), -r.range(70, 120), r.sign() * r.range(20, 32), t, 850, -0.5, 0.42, r.range(0, TAU));
  drawCasing(p, k, B, clamp((D - t) / 0.2));
}
