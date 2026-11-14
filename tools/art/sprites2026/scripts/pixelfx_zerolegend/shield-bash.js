// Black Shield riot trooper rams with the shield: a cyan shock crescent bursts off the shield face,
// a short ring of force pushes forward, speed streaks trail behind and a few sparks glance off.
import { Particles, P, Rng, fit, mix, WHITE } from "../../core/index.js";
export const meta = {
  name: "Shield bash", desc: "Cyan shock crescent bursts off the shield face, a force ring pushes forward, speed streaks and glancing sparks.",
  tags: ["impact", "shield", "bash", "one-shot"], size: [64, 40], origin: [32, 18], duration: 0.6, loop: false, fps: 12, bg: "dark",
  options: { palette: ["#0F4A55", "#0A7A8A", "#2E9AA8", "#00F0FF", "#8FD8DE", "#E8F7FF"], sparks: ["#FFF23A", "#E8F7FF"], seed: 9 },
};
export function create(o) {
  const C = fit(o.palette, 6), S = fit(o.sparks, 2), R = new Rng(o.seed), ps = new Particles({ rng: R, ground: () => 20 });
  for (let i = 0; i < 9; i++) { const a = R.range(-1.1, 1.1); ps.spawn(P.SPARK, 2, a * 8, Math.cos(a) * R.range(70, 130), Math.sin(a) * R.range(40, 90), R.range(0.2, 0.4), S[i % 2], 1, R.range(0.02, 0.1)); }
  let t = 0;
  return {
    update(dt) { t += dt; ps.update(dt); },
    draw(p) {
      const k = t / 0.35;
      if (k < 1) {   // shock crescent: a thick arc that widens and thins as it pushes off the shield
        const r = 8 + k * 14, w = Math.max(1, 3 * (1 - k));
        p.arc(-4, 0, r, w, -1.0, 1.0, k < 0.3 ? C[5] : mix(C[3], C[1], k), 1 - k * 0.6);
        p.arc(-4, 0, r - w - 1, 1, -0.8, 0.8, C[2], 0.7 * (1 - k));
      }
      if (t < 0.12) p.glow(0, 0, 10, C[4], 0.6 * (1 - t / 0.12));
      if (t < 0.3) for (let i = -2; i <= 2; i++) { const L = 10 - Math.abs(i) * 2, x = -14 - t * 30; p.line(x - L, i * 6, x, i * 6, i % 2 ? C[2] : C[4], 1 - t / 0.3); }
      ps.draw(p, "back"); ps.draw(p, "front");
    },
  };
}
