// A Black Shield hacker fires a hack from the wrist: a green spark gathers in the palm, two thin rings pop out,
// and a stream of data bits flickers off forward (to the right), then winks out.
import { Rng, fit, mix, WHITE } from "../../core/index.js";
export const meta = {
  name: "Hack pulse", desc: "Green spark gathers at the wrist, two thin rings pop, data bits stream forward and wink out.",
  tags: ["hack", "scifi", "cast", "one-shot"], size: [64, 48], origin: [20, 24], duration: 0.75, loop: false, fps: 12, bg: "dark",
  options: { palette: ["#0B3D26", "#14804A", "#39FF88", "#B6FF3A", "#E8FFF0"], bits: 12, seed: 5 },
};
export function create(o) {
  const C = fit(o.palette, 5), R = new Rng(o.seed);
  const bits = Array.from({ length: o.bits }, () => ({ d: R.range(0, 0.25), v: R.range(55, 95), y: R.range(-7, 7), w: R.chance(0.5) ? 2 : 1, c: R.chance(0.3) ? C[4] : R.chance(0.5) ? C[3] : C[2], f: R.range(0, 6) }));
  let t = 0;
  return {
    update(dt) { t += dt; },
    draw(p) {
      const g = Math.min(1, t / 0.15), fade = t < 0.45 ? 1 : Math.max(0, 1 - (t - 0.45) / 0.3);
      if (fade > 0) { p.glow(0, 0, 3 + 4 * g, C[2], 0.5 * fade); p.disc(0, 0, t < 0.2 ? 1 + g : 1.5, t < 0.3 ? C[4] : C[3], fade); }
      for (const [d, c] of [[0.1, C[2]], [0.22, C[1]]]) { const k = (t - d) / 0.35; if (k > 0 && k < 1) p.ring(0, 0, 3 + k * 16, 1, mix(c, WHITE, 0.2 * (1 - k)), 1 - k); }
      for (const b of bits) { const s = t - 0.12 - b.d; if (s <= 0 || s > 0.4) continue;
        if (Math.floor((t * 12 + b.f)) % 3 === 0) continue;
        const x = 3 + s * b.v, y = b.y * (0.4 + s * 2); p.rect(Math.round(x), Math.round(y), b.w, 1, b.c, 1 - s / 0.4); }
    },
  };
}
