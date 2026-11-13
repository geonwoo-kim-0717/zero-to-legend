const P = require("/root/.claude/skills/codixel/core/pixel.js"), R = require("./rigs.js"), it = [];
for (const k of Object.keys(R)) { const r = R[k](); const g = P.ruler(r.ownerMap(), 2, { step: 20 }); r.drawBones(g, 0, 0, {}, { scale: 2 }); it.push({ buf: g, label: k }); }
P.save(P.sheet(it, { cols: 4 }), "owners.png");
