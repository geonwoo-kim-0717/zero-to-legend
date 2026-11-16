// One gatling shell casing for Basili: thrown up and back out of the ejection port, tumbling, bouncing on the floor,
// then lying a moment and fading. Casing recipe from projectiles/_lib.js (after Sprite Fusion's open-source
// muzzle-flash, https://www.spritefusion.com/pixel-art-vfx/muzzle-flash, MIT License, Copyright (c) 2026 Hugo Duprez).
import { clamp, rng, fit, TAU } from "../../core/index.js";
import { casing } from "../projectiles/_lib.js";
import { WHITE } from "../../core/index.js";
export const meta = {
  name: "Basili casing", desc: "One brass casing kicked up and back from the gatling's ejection port, bouncing and settling on the floor.",
  tags: ["casing", "gun", "brass", "one-shot"], size: [72, 64], origin: [52, 60], duration: 0.9, loop: false, fps: 30, bg: "ground",
  options: { brass: ["#4a2e10", "#8c5c1c", "#d9a441", "#ffe39a"], height: 51, seed: 1 },
};
export function draw(p, t, o) {
  const B = fit(o.brass, 4), r = rng(o.seed, 7), D = meta.duration;
  const k = casing(0, -o.height, -r.range(22, 46), -r.range(70, 120), r.sign() * r.range(20, 32), t, 850, -0.5, 0.42, r.range(0, TAU));
  // a bigger shell for a gatling: 5 px long, 2 px thick, dark rim on the far side, bright lip at the mouth
  const f = clamp((D - t) / 0.2), ca = Math.cos(k.a), sa = Math.sin(k.a), x = k.x, y = k.y - 1;
  for (let i = -2; i <= 2; i++) {
    const cx = x + ca * i, cy = y + sa * i;
    p.dot(cx, cy, i === 2 ? B[3] : i >= 0 ? B[2] : B[1], f);
    p.dot(cx - sa, cy + ca, i === 2 ? B[2] : B[0], f);
  }
  if (k.hit >= 0 && k.hit < 0.07) { p.px(x, y - 1, WHITE); p.glow(x, y, 5, B[3], 0.5 * (1 - k.hit / 0.07)); }
}
