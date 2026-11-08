const P = require("/root/.claude/skills/codixel/core/pixel.js"), fs = require("fs");
for (const k of ["midboss", "boss"]) {
  const cut = P.trim(P.removeBg(P.load(`ref_${k}.png`), { tol: 40, erode: 1 }), 0);
  P.save(cut, `cut_${k}.png`);
  const w = P.trim(P.resize(cut, Math.round(cut.w * 140 / cut.h), 140), 0);
  P.save(w, `work_${k}.png`); P.save(P.ruler(w, 4, { step: 10 }), `ruler_${k}.png`);
  fs.writeFileSync(`cut_${k}.txt`, `${cut.w} ${cut.h}`); console.log(k, cut.w, cut.h, w.w, w.h);
}
