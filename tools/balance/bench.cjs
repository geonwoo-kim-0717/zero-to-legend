// 빌드 스냅샷마다 허수아비 DPS 측정: 단일(보스용)·무리 20마리(일반 몹용), 10초씩
const { chromium } = require('playwright'); const fs = require('fs');
const [port, inFile, outFile, mode] = process.argv.slice(2);
const snaps = JSON.parse(fs.readFileSync(inFile)).snaps;
const SAVE = mode === 'vet' ? JSON.stringify({ version: 1, credits: 0, clinic: { hp: 3, dmg: 3, spd: 2, pick: 2, regen: 2 }, specials: ['neural'], runner: 'zero', market: ['monowire', 'shotgun'], introDone: true, tut: 3, tutGo: true }) : JSON.stringify({ introDone: true, tut: 3, tutGo: true });
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript((j) => { try { localStorage.clear(); localStorage.setItem('ztl-save-v1', j); } catch {} }, SAVE);
  await p.goto(`http://localhost:${port}/?debug`); await p.waitForTimeout(2500);
  await p.evaluate(() => { const g = window.game; g.scene.getScenes(true).forEach(s => s.scene.stop()); g.scene.start('Game'); }); await p.waitForTimeout(1500);
  const res = await p.evaluate((snaps) => {
    const g = window.game; const s = g.scene.getScene('Game');
    for (let i = 0; i < 40 && s.state === 'dialog'; i++) s.advanceDialog();
    g.loop.sleep(); let T = performance.now();
    const step = (n) => { for (let i = 0; i < n; i++) { T += 33.33; g.headlessStep(T, 33.33); } };
    s.god = true; s.phoneText = () => {}; s.openLevelUp = () => {}; s.spawner.update = () => {}; s.activateSpecial = () => {}; s.nextRaid = 1e12; s.bossesSpawned = 99; s.updateCounters = () => {};
    s.controls.update = function () { this.moveX = 0; this.moveY = 0; };
    const out = [];
    for (const sn of snaps) {
      const r = { t: sn.t, zone: sn.zone, zt: sn.zt, lvl: sn.lvl };
      for (const scen of ['single', 'crowd']) {
        for (const e of s.enemyPool.items) if (e.active) e.kill();
        s.weapons.forEach(w => w.destroy()); s.weapons = [];
        s.passives = new Map(sn.passives.map(x => [x.id, { ...x, abilities: x.abilities }]));
        s.overflow = { ...sn.overflow };
        for (const w0 of sn.weapons) { const w = s.addWeapon(w0.id); for (let i = 1; i < w0.level; i++) w.levelUp(); for (const a of w0.ab) w.abilities.add(a); }
        s.recalcStats();
        const pl = s.player; pl.dirX = 1; pl.dirY = 0; pl.hp = pl.maxHp;
        const dummies = [];
        const put = (dx, dy) => { const e = s.spawnEnemy('thug', pl.x + dx, pl.y + dy, 1); if (!e) return; e.hp = e.maxHp = 1e8; e.speed = 0; e.__x = e.x; e.__y = e.y; dummies.push(e); };
        if (scen === 'single') put(45, 0);
        else for (let i = 0; i < 20; i++) { const a = i * 2.4, rr = 35 + (i % 5) * 28; put(Math.cos(a) * rr, Math.sin(a) * rr * 0.7); }
        step(30);
        const h0 = dummies.reduce((t, e) => t + e.hp, 0);
        for (let k = 0; k < 300; k++) { s.odGauge = 0; for (const e of dummies) { if (!e.active) continue; e.hp = Math.max(e.hp, 1e7); e.x = e.__x; e.y = e.__y; } step(1); }
        r[scen] = Math.round((h0 - dummies.reduce((t, e) => t + e.hp, 0)) / 10);
      }
      r.dmg = +s.stats.damageMul.toFixed(2); r.cd = +s.stats.cooldownMul.toFixed(2);
      out.push(r);
    }
    return out;
  }, snaps);
  fs.writeFileSync(outFile, JSON.stringify(res)); console.log(outFile, res.length, 'errs', errs.slice(0, 3)); await b.close();
})();
