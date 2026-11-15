// 밸런스 테스트 봇: 한 판을 자동으로 플레이하며 기록을 남긴다
// 사용: node tools/balance/bot.cjs <이름> <new|vet> <스크린샷 0/1> [포트=4180] [smart 0/1=1] [god 0/1=1] [출력 폴더=.]
//  - new: 빈 저장 · 카드 무작위 / vet: 개조·무기 보유 · 무기·등급 우선
//  - smart=1: 블랙 실드 요원 우선 공격(해커 > 저격 > 근접 > 탱커) + 예고선 회피(돌진·저격·터렛·보스 돌진·해킹 빔)
//  - god=1: 무적 (성장 곡선 측정용). 난이도 판단은 god=0 판으로
const { chromium } = require('playwright');
const fs = require('fs');
const [name, mode, shots, port = '4180', smartArg = '1', godArg = '1', outDir = '.'] = process.argv.slice(2);
const OUT = outDir;
const SMART = smartArg === '1';
const GOD = godArg === '1';
const SPEED = 10;
const SAVE = mode === 'vet'
  ? JSON.stringify({ version: 1, credits: 0, clinic: { hp: 3, dmg: 3, spd: 2, pick: 2, regen: 2 }, specials: ['neural'], runner: 'zero', market: ['monowire', 'shotgun'], introDone: true, tut: 3, tutGo: true, stats: { runs: 5, totalKills: 0, droneKills: 0, meleeKills: 0, trooperKills: 0, midbossKills: 0, bossKills: 0, hexKills: 0, coreKills: 0, marketBuys: 2, totalTime: 0, bestTime: 0, bestLevel: 0 } })
  : null;
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; pg.on('pageerror', e => errs.push(String(e.stack || e).slice(0, 300)));
  await pg.addInitScript((j) => { try { localStorage.clear(); if (j) localStorage.setItem('ztl-save-v1', j); localStorage.setItem('ztl-lang', 'ko'); } catch {} }, SAVE);
  await pg.goto(`http://localhost:${port}/?debug`);
  await pg.waitForTimeout(4000);
  if (shots === '1') await pg.screenshot({ path: `${OUT}/${name}_title.png` });
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(1200);
  if (shots === '1') await pg.screenshot({ path: `${OUT}/${name}_hideout.png` });
  for (let i = 0; i < 40; i++) { if (await pg.evaluate(() => window.game.scene.isActive('Game'))) break; await pg.keyboard.press('Enter'); await pg.waitForTimeout(350); }
  await pg.waitForTimeout(1200);
  await pg.evaluate(() => {
    // 예고선 길이 계산용 수치 (게임 데이터 그대로)
    window.__melee = { psycho: { lungeSpeed: 230, lungeTime: 0.35 }, trooper_melee: { lungeSpeed: 260, lungeTime: 0.6 } };
    window.__sniper = { lock: 0.3 };
    window.__turret = {};
  });
  await pg.evaluate(({ SPEED, mode, shots, SMART, GOD }) => {
    const g = window.game; g.sound.mute = true;
    const s = g.scene.getScene('Game');
    s.god = GOD; const T = window.__tele = { snaps: [], carryN: 0, samples: [], hits: [], hitSrc: {}, events: [], cards: {}, picks: [], end: null, dialogLines: 0, shot: null, shotsDone: {}, squadClear: [] };
    // 피해 출처 기록 (어떤 공격에 많이 맞는지)
    const hp0 = s.hurtPlayer.bind(s);
    s.hurtPlayer = (dmg, src) => { const before = s.player.hp; hp0(dmg, src); if (s.player.hp < before || GOD) { const k = src ? src.id + ':' + src.kind : '?'; T.hitSrc[k] = (T.hitSrc[k] || 0) + 1; } };
    // 블랙 실드 요원 우선순위 (해커가 살아 있으면 CC 면역이라 먼저)
    const PRIO = { trooper_hacker: 4, trooper_sniper: 3, trooper_melee: 2, trooper_tank: 1 };
    // 선분(ax,ay)→(bx,by)에서 점까지 거리와 수직 방향
    const segAway = (px, py, ax, ay, bx, by) => {
      const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
      const k = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2));
      const cx = ax + vx * k, cy = ay + vy * k, ox = px - cx, oy = py - cy;
      const dist = Math.hypot(ox, oy);
      // 선 위에 정확히 있으면 선의 왼쪽 수직으로
      return dist > 0.5 ? { dist, nx: ox / dist, ny: oy / dist } : { dist, nx: -vy / Math.sqrt(L2), ny: vx / Math.sqrt(L2) };
    };
    const want = shots === '1' ? { t30: 30, t180: 180, t300: 300, t480: 480 } : {};
    let lastSample = -1, lastHp = s.player.hp, hadBoss = null, zone = s.zoneIdx, levelShot = false;
    s.controls.update = function () {
      const p = s.player; let fx = 0, fy = 0, close = false;
      for (const e of s.enemyPool.items) {
        if (!e.active) continue;
        const dx = p.x - e.x, dy = p.y - e.y, d2 = dx * dx + dy * dy, R = e.isBoss ? 220 : 110;
        if (d2 < R * R) { const w = (e.isBoss ? 4 : 1) / (d2 + 30); fx += dx * w; fy += dy * w; }
        if (d2 < (e.radius + 16) ** 2) close = true;
      }
      for (const bl of s.enemyBullets.items) {
        if (!bl.active) continue;
        const dx = p.x - bl.x, dy = p.y - bl.y, d2 = dx * dx + dy * dy;
        if (d2 < 70 * 70) { fx += dx * 3 / (d2 + 10); fy += dy * 3 / (d2 + 10); if (d2 < 22 * 22) close = true; }
      }
      if (SMART) {
        // ① 예고선 회피: 예고선 폭 안에 있으면 수직으로 빠지고, 곧 터지면 대시
        const threat = (ax, ay, dirX, dirY, len, width, soon) => {
          const r = segAway(p.x, p.y, ax, ay, ax + dirX * len, ay + dirY * len);
          if (r.dist > width) return;
          const w = soon ? 6 : 2;
          fx += r.nx * w; fy += r.ny * w;
          if (soon) close = true;
        };
        const M = window.__melee, SN = window.__sniper, TU = window.__turret;
        for (const e of s.enemyPool.items) {
          if (!e.active || e.state !== 'wind') continue;
          if (M[e.id]) threat(e.x, e.y, e.dirX, e.dirY, M[e.id].lungeSpeed * M[e.id].lungeTime + 20, 26, e.t < 0.3);
          else if (e.id === 'trooper_sniper') threat(e.x, e.y, e.dirX, e.dirY, 420, 22, e.t < SN.lock + 0.15);
          else if (e.id === 'sniper_turret') threat(e.x, e.y, e.dirX, e.dirY, 300, 22, e.t < 0.3);
          else if (e.id === 'trooper_hacker') {
            // 해킹 빔: 시전이 끝날 때 사거리(230×1.2) 밖이면 안 걸림
            const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
            if (d < 300) { fx += (dx / d) * 4; fy += (dy / d) * 4; if (e.t < 0.25 && d < 280) close = true; }
          }
        }
        const b = s.boss;
        if (b && (s.bossPhase === 'aim' || s.bossPhase === 'charge')) {
          const soon = s.bossPhase === 'charge' || s.bossTimer < 0.35;
          threat(b.x, b.y, s.bossDir.x, s.bossDir.y, 380, b.radius + 18, soon);
        }
        // ② 요원 우선 공격: 가장 높은 우선순위 요원과 90~130px 거리를 유지 (자동 조준 무기가 그 요원을 노리게)
        let tgt = null, tp = 0;
        for (const e of s.enemyPool.items) if (e.active && PRIO[e.id] && e.dropT <= 0 && e.landT <= 0 && PRIO[e.id] > tp) { tp = PRIO[e.id]; tgt = e; }
        if (tgt) {
          const dx = tgt.x - p.x, dy = tgt.y - p.y, d = Math.hypot(dx, dy) || 1;
          const pull = d > 130 ? 0.03 : d < 90 ? -0.03 : 0;
          fx += (dx / d) * pull; fy += (dy / d) * pull;
        }
      }
      let best = null, bd = 260 * 260;
      for (const k of s.pickups.items) { if (!k.active) continue; const d2 = (k.x - p.x) ** 2 + (k.y - p.y) ** 2; if (d2 < bd) { bd = d2; best = k; } }
      if (best) { const d = Math.sqrt(bd) || 1; fx += (best.x - p.x) / d * 0.012; fy += (best.y - p.y) / d * 0.012; }
      if (Math.hypot(fx, fy) < 1e-4) { const a = s.elapsed * 0.6; fx = Math.cos(a); fy = Math.sin(a); }
      const m = Math.hypot(fx, fy) || 1;
      this.moveX = fx / m; this.moveY = fy / m;
      if (close && p.dashCd <= 0) this.dashQueued = true;
    };
    const rar = { common: 0, rare: 0.5, epic: 1.5, legendary: 3, mythic: 4 };
    const origUpdate = s.sys.sceneUpdate;
    s.sys.sceneUpdate = function (time) {
      if (T.shot) return; // 스크린샷 대기
      for (let k = 0; k < SPEED; k++) {
        if (s.state === 'levelup') {
          for (const c of s.choices) T.cards[c.id] = (T.cards[c.id] || 0) + 1;
          if (shots === '1' && !levelShot && s.elapsed > 60) { levelShot = true; T.shot = 'levelup'; return; }
          let bi;
          if (mode === 'new') bi = Math.floor(Math.random() * s.choices.length);
          else { let bs = -1; bi = 0; s.choices.forEach((c, i) => { let v = (c.kind === 'weapon' ? 5 : 2.5) + (rar[c.rarity.id] || 0) + Math.random(); if (c.maxed) v = -0.5; if (v > bs) { bs = v; bi = i; } }); }
          T.picks.push([Math.round(s.elapsed), s.choices[bi].id, s.choices[bi].rarity.id]);
          s.pick(bi);
        }
        if (s.state === 'carry') { s.chooseCarry(T.carryN++ % 2); T.events.push([Math.round(s.elapsed), 'carry']); continue; }
        if (s.state === 'dialog') { T.dialogLines++; s.advanceDialog(); s.advanceDialog(); continue; }
        if (s.state !== 'play') break;
        origUpdate.call(s, time, 50);
        const p = s.player;
        if (p.hp < lastHp) T.hits.push([Math.round(s.elapsed), Math.round(lastHp - p.hp)]);
        lastHp = p.hp;
        if (s.boss && !hadBoss) { hadBoss = { id: s.boss.id, t: s.elapsed }; T.events.push([Math.round(s.elapsed), 'boss+', s.boss.id]); if (shots === '1' && !T.shotsDone['boss_' + s.boss.id]) { T.shotsDone['boss_' + s.boss.id] = 1; T.shotLater = { at: s.elapsed + 4, name: 'boss_' + s.boss.id }; } }
        if (!s.boss && hadBoss) { T.events.push([Math.round(s.elapsed), 'boss-', hadBoss.id, Math.round(s.elapsed - hadBoss.t)]); hadBoss = null; }
        if (s.raid && !T.shotsDone.raid && shots === '1') { T.shotsDone.raid = 1; T.shotLater = { at: s.elapsed + 2.5, name: 'raid' }; }
        if (s.raid && !T._r) { T._r = 1; T.events.push([Math.round(s.elapsed), 'raid']); } if (!s.raid) T._r = 0;
        if (s.raidSpec && s.raidSpec !== T._spec) { T._spec = s.raidSpec; T.squadClear.push([Math.round(s.elapsed), Math.round(s.raidSpec.clear), +s.raidSpec.score.toFixed(2)]); }
        if (s.zoneIdx !== zone) { zone = s.zoneIdx; T.events.push([Math.round(s.elapsed), 'zone', zone + 1]); if (shots === '1') T.shotLater = { at: s.elapsed + 20, name: 'zone' + (zone + 1) }; }
        if (T.shotLater && s.elapsed >= T.shotLater.at) { T.shot = T.shotLater.name; T.shotLater = null; return; }
        for (const [n, at] of Object.entries(want)) if (!T.shotsDone[n] && s.elapsed >= at) { T.shotsDone[n] = 1; T.shot = n; return; }
        const sec = Math.floor(s.elapsed);
        if (sec !== T._snapSec && sec % 30 === 0) { T._snapSec = sec;
          T.snaps.push({ t: sec, zone: s.zoneIdx, zt: Math.round(s.elapsed - s.zoneStart), lvl: s.level,
            weapons: s.weapons.map(w => ({ id: w.id, level: w.level, ab: [...w.abilities] })),
            passives: [...s.passives.entries()].map(([id, p]) => ({ id, ...p, abilities: p.abilities ? [...p.abilities] : [] })),
            overflow: { ...s.overflow }, dmg: s.stats.damageMul, cd: s.stats.cooldownMul, en: s.enemyPool.countActive() }); }
        if (sec !== lastSample && sec % 10 === 0) {
          lastSample = sec;
          T.samples.push({ t: sec, hp: Math.round(p.hp), max: p.maxHp, lvl: s.level, kills: s.kills, en: s.enemyPool.countActive(), w: s.weapons.map(w => w.id + w.level).join(','), zone: s.zoneIdx + 1, od: Math.round(s.odGauge) });
        }
      }
      if (s.state === 'over' && !T.end) T.end = { last: s.lastHit ? s.lastHit.id + ':' + s.lastHit.kind : null, boss: s.boss ? s.boss.id : null, zt: Math.round(s.elapsed - s.zoneStart), t: Math.round(s.elapsed), kills: s.kills, lvl: s.level, zone: s.zoneIdx + 1, weapons: s.weapons.map(w => w.id + w.level + '[' + [...w.abilities].join('/') + ']') };
    };
  }, { SPEED, mode, shots, SMART, GOD });
  const t0 = Date.now();
  while (Date.now() - t0 < 30 * 60 * 1000) {
    await pg.waitForTimeout(400);
    const st = await pg.evaluate(() => ({ over: !!window.__tele.end, res: window.game.scene.isActive('Result'), shot: window.__tele.shot }));
    if (st.shot) {
      await pg.waitForTimeout(150);
      await pg.screenshot({ path: `${OUT}/${name}_${st.shot}.png` });
      await pg.evaluate(() => { window.__tele.shot = null; });
    }
    if (st.over || st.res) break;
  }
  await pg.waitForTimeout(2500);
  if (shots === '1') await pg.screenshot({ path: `${OUT}/${name}_result.png` });
  const tele = await pg.evaluate(() => { const t = window.__tele; t.creditsAfter = JSON.parse(localStorage.getItem('ztl-save-v1') || '{}').credits; return t; });
  tele.errors = errs.slice(0, 5); tele.meta = { mode, smart: SMART, god: GOD };
  fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(tele));
  console.log(name, JSON.stringify(tele.end), 'credits', tele.creditsAfter, 'hits', JSON.stringify(tele.hitSrc), 'squad', JSON.stringify(tele.squadClear), 'errors', errs.length);
  await b.close();
})();
