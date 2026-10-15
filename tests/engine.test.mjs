import test from 'node:test'; import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import * as LB from '../src/leaderboard.js';
const play = (o = {}) => { const g = E.createGame({ seed: 5, ...o }); while (g.mode === 'intro') E.step(g, {}); g.spawnT = 999; g.fleaT = 999; return g; };
const run = (g, inp, n) => { for (let i = 0; i < n; i++) E.step(g, inp); };

test('jump arcs and lands back on same girder alive', () => {
  const g = play(); const p = g.player, y0 = p.y;
  E.step(g, { jump: true }); assert.equal(p.state, 'air'); let minY = p.y;
  for (let i = 0; i < 60 && p.state === 'air'; i++) { E.step(g, {}); minY = Math.min(minY, p.y); }
  assert.equal(p.state, 'walk'); assert.equal(g.mode, 'play'); assert.ok(y0 - minY > 16 && y0 - minY < 26, `height ${y0 - minY}`);
});
test('walking off a branch edge (one step down) is survivable', () => {
  const g = play(); const p = g.player; p.x = 236; p.y = E.surfaceY(g.plats[2], 236);
  run(g, { right: true }, 60); assert.equal(g.mode, 'play'); assert.equal(p.state, 'walk'); assert.ok(Math.abs(p.y - E.surfaceY(g.plats[0], p.x)) < 0.5);
});
test('falling further than max drop (about two girders) kills', () => {
  const g = play(); const p = g.player; p.x = 248; p.y = E.surfaceY(g.plats[0], 248) - 60; p.state = 'air'; p.vy = 0; p.vx = 0; p.takeoffY = p.y;
  run(g, {}, 60); assert.equal(g.mode, 'dying'); assert.equal(g.deathCause, 'fall');
});
test('original layouts: every platform is flat (no sloped zig-zag tower)', () => {
  for (const S of E.STAGES) for (const pl of S.plats) assert.equal(pl.y1, pl.y2, S.name);
});
test('ladder climb up reaches next girder, down returns', () => {
  const g = play(); const p = g.player; p.x = 110; p.y = E.surfaceY(g.plats[0], 110);
  E.step(g, { up: true }); assert.equal(p.state, 'climb');
  run(g, { up: true }, 120); assert.equal(p.state, 'walk'); assert.ok(Math.abs(p.y - E.surfaceY(g.plats[1], 110)) < 0.01);
  E.step(g, { down: true }); assert.equal(p.state, 'climb'); run(g, { down: true }, 120);
  assert.ok(Math.abs(p.y - E.surfaceY(g.plats[0], 110)) < 0.01);
});
test('no ladder means up does nothing; hammer blocks climbing', () => {
  const g = play(); g.player.x = 80; E.step(g, { up: true }); assert.equal(g.player.state, 'walk');
  g.player.x = 110; g.player.hammer = 5; E.step(g, { up: true }); assert.equal(g.player.state, 'walk');
});
test('yarn is lobbed by the cat, bounces once and splits into two small rollers', () => {
  const g = play(); g.player.x = 240; g.player.y = E.surfaceY(g.plats[0], 240); g.spawnT = 0; E.step(g, {}); g.spawnT = 999;
  const y = g.hazards.find(h => h.kind === 'yarn'); assert.ok(y && y.big && y.state === 'fall');
  let split = false; for (let i = 0; i < 300 && !split; i++) { E.step(g, {}); split = g.events.includes('split'); }
  assert.ok(split, 'split'); const small = g.hazards.filter(h => h.r === 4); assert.equal(small.length, 2); assert.ok(small[0].vx * small[1].vx < 0);
});
test('tins: shadow warning first (harmless), then drop and clank', () => {
  const g = play({ stage: 1 }); const p = g.player; p.x = 180; p.y = E.surfaceY(g.plats[8], 180); // open roof, nothing above
  g.hazards.push({ kind: 'tin', x: p.x, y: 16, vx: 0, vy: 0, state: 'warn', warn: 0.5, r: 5, rot: 0, jumpId: -1, tried: new Set() });
  E.step(g, {}); assert.equal(g.mode, 'play');
  let st = []; for (let i = 0; i < 120 && g.mode === 'play'; i++) { E.step(g, {}); st.push(g.hazards[0]?.state); }
  assert.ok(st.includes('drop')); assert.equal(g.deathCause, 'tin');
});
test('villain cat roams: hops between perches', () => {
  const g = play(); const x0 = g.cat.x; let hopped = false; for (let i = 0; i < 60 * 9; i++) { E.step(g, {}); if (g.cat.hop) hopped = true; g.hazards = []; if (g.mode !== 'play') break; }
  assert.ok(hopped); assert.notEqual(g.perch, 0); assert.ok(Math.abs(g.cat.x - x0) > 20);
});
test('hazard contact kills; circle-box collision math', () => {
  assert.ok(E.hitCircleBox(0, 0, 5, 3, -1, 8, 1)); assert.ok(!E.hitCircleBox(0, 0, 5, 6, -1, 8, 1));
  const g = play(); const p = g.player;
  g.hazards.push({ kind: 'yarn', x: p.x, y: p.y, vx: 0, vy: 0, state: 'roll', r: 5, rot: 0, jumpId: -1, tried: new Set() });
  E.step(g, {}); assert.equal(g.mode, 'dying');
});
test('jumping over a yarn ball scores 100', () => {
  const g = play(); const p = g.player; E.step(g, { jump: true }); run(g, {}, 12);
  g.hazards.push({ kind: 'yarn', x: p.x, y: p.takeoffY, vx: 0, vy: 0, state: 'ladder', lad: { x: p.x, top: 0, bot: 0 }, r: 5, rot: 0, jumpId: -1, tried: new Set() });
  const s = g.score; E.step(g, {}); assert.equal(g.score - s, 100);
});
test('squeaky bone pickup and smash scores', () => {
  const g = play(); const p = g.player; const h = g.hammers[0]; p.x = h.x; p.y = h.y + 14;
  E.step(g, {}); assert.ok(p.hammer > 8); p.face = 1;
  g.hazards.push({ kind: 'yarn', x: p.x + 10, y: p.y, vx: 0, vy: 0, state: 'ladder', lad: { x: p.x + 10, top: 0, bot: 0 }, r: 5, rot: 0, jumpId: -1, tried: new Set() });
  const s = g.score; E.step(g, {}); assert.equal(g.hazards.length, 0); assert.ok([300, 500, 800].includes(g.score - s)); assert.equal(g.mode, 'play');
});
test('pup is freed mid-stage (+1000, saved), exit van is locked until then, reaching it clears and advances', () => {
  const g = play(); const p = g.player; p.x = g.exit.x; p.y = g.exit.y; E.step(g, {}); assert.equal(g.mode, 'play', 'exit locked');
  p.x = g.pup.x + 8; p.y = g.pup.y; const s = g.score; E.step(g, {}); assert.equal(g.mode, 'play'); assert.ok(g.pup.freed); assert.equal(g.saved, 1); assert.equal(g.score - s, 1000);
  p.x = g.exit.x; p.y = g.exit.y; const b = g.bonus, s2 = g.score; E.step(g, {}); assert.equal(g.mode, 'clear'); assert.equal(g.score - s2, b); assert.equal(g.saved, 1);
  run(g, {}, 200); assert.equal(g.stage, 1); assert.equal(g.S.name, 'ROOFTOP CHASE');
});
test('final DOG PARK: opening all three kennels saves 3 pups and clears (no exit)', () => {
  const g = play({ stage: 3 }); const p = g.player; assert.equal(g.pups.length, 3); assert.equal(g.exit, null);
  g.pups.forEach((q, i) => { p.x = q.x; p.y = q.y; p.state = 'walk'; E.step(g, {}); assert.equal(g.mode, i < 2 ? 'play' : 'clear'); });
  assert.equal(g.saved, 3); assert.ok(g.cat.fallen);
});
test('delivery truck carries the rescuer; jumping off keeps its momentum', () => {
  const g = play({ stage: 2 }); const l = g.lifts[0], p = g.player; p.x = l.x1 + 20; p.y = l.y1; p.ride = l.m; const off = p.x - l.x1;
  run(g, {}, 40); const l2 = g.lifts[0]; assert.ok(Math.abs(p.x - l2.x1 - off) < 1, `${p.x} ${l2.x1}`); assert.equal(p.state, 'walk');
  E.step(g, { jump: true }); assert.equal(p.state, 'air'); assert.ok(Math.abs(p.vx - g.lifts[0].dx * 60) < 1e-6);
});
test('swinging rope seat carries the rescuer across the pond', () => {
  const g = play({ stage: 3 }); const p = g.player; const l = g.lifts[0]; p.x = (l.x1 + l.x2) / 2; p.y = l.y1; p.ride = l.m; const xs = [];
  for (let i = 0; i < 160; i++) { E.step(g, {}); xs.push(p.x); g.hazards = []; g.fleas = []; }
  assert.equal(g.mode, 'play'); assert.ok(Math.max(...xs) - Math.min(...xs) > 30);
});
test('bonus timer runs out -> death; lives decrement; game over', () => {
  const g = play({ lives: 1 }); g.bonus = 100; run(g, {}, 130); assert.equal(g.mode, 'dying'); run(g, {}, 200); assert.equal(g.mode, 'over');
});
test('extra life at 10000 and high score table', () => {
  const g = play(); const l = g.lives; E.addScore(g, 10000); assert.equal(g.lives, l + 1);
  const t = E.insertHighScore([{ name: 'AAA', score: 50 }], 'bob', 90); assert.equal(t[0].name, 'BOB');
});
test('leaderboard ranks by stage, then height, then fastest time', () => {
  const mk = (n, stage, height, timeMs) => LB.makeEntry(n, { stage, height, timeMs, score: 0 });
  const list = LB.rankEntries([mk('A', 2, 50, 9000), mk('B', 3, 10, 99000), mk('C', 2, 50, 8000), mk('D', 2, 80, 120000), mk('E', 1, 100, 1000)]);
  assert.deepEqual(list.map(e => e.name), ['B', 'D', 'C', 'A', 'E']);
  assert.equal(LB.formatTime(83456), '01:23.456');
  assert.equal(LB.describe(list[0]), 'Reached Stage 3, height 10, time 01:39.000');
  let big = []; for (let i = 0; i < 12; i++) big = LB.addEntry(big, mk('X', 1, i, 1000));
  assert.equal(big.length, 10); assert.equal(big[9].height, 2);
  assert.ok(!LB.qualifiesLB(big, { stage: 1, height: 1, timeMs: 1 })); assert.ok(LB.qualifiesLB(big, { stage: 1, height: 2, timeMs: 999 }));
  const mem = { s: {}, getItem(k) { return this.s[k] ?? null; }, setItem(k, v) { this.s[k] = v; } };
  LB.saveLB(mem, big); assert.equal(LB.loadLB(mem).length, 10);
});
test('progress tracks stage progress % and run time', () => {
  const g = play(); const p = g.player; p.x = 110; p.y = E.surfaceY(g.plats[0], 110); E.step(g, { up: true }); run(g, { up: true }, 120);
  const pr = E.progress(g); assert.equal(pr.stage, 1); assert.ok(pr.height > 3 && pr.height < 60, String(pr.height)); assert.ok(pr.timeMs > 2000);
});

test('stage-1 rollers are slower than walking; later stages ramp up', () => {
  const g = play(); assert.ok(E.rollSpeed(g) <= 40 && E.rollSpeed(g) < E.PHYS.walk);
  const s = [0, 1, 2, 3].map(stage => E.rollSpeed({ stage, loop: 0 })); for (let i = 1; i < 4; i++) assert.ok(s[i] > s[i - 1]);
  assert.ok(E.rollSpeed({ stage: 0, loop: 1 }) > s[0]);
});
test('3 lives; mid-tower checkpoint is the respawn point and keeps height', () => {
  const g = play(); assert.equal(g.lives, 3); const cp = g.S.checkpoint, p = g.player;
  p.x = cp.x; p.y = E.surfaceY(g.plats[cp.p], cp.x); E.step(g, {}); assert.equal(g.cp, true);
  const h = g.height; E.killPlayer(g, 'yarn'); run(g, {}, 100); assert.equal(g.lives, 2);
  assert.equal(g.player.x, cp.x); assert.ok(Math.abs(g.player.y - E.surfaceY(g.plats[cp.p], cp.x)) < 0.01); assert.ok(g.height >= h);
});
test('pup trigger is forgiving', () => {
  const g = play(); const p = g.player; p.x = g.pup.x + 12; p.y = g.pup.y + 8; g.hazards = []; E.step(g, {}); assert.ok(g.pup.freed);
});
test('leaderboard names up to 8 characters', async () => {
  const L = await import('../src/leaderboard.js');
  assert.equal(L.makeEntry('playtester', { stage: 1, height: 0, timeMs: 0, score: 0 }).name, 'PLAYTEST');
  assert.equal(L.makeEntry('zac  ', { stage: 1, height: 0, timeMs: 0, score: 0 }).name, 'ZAC');
});

test('IP: original stage names and structure (no classic arcade stages/rivets/girders)', () => {
  const names = E.STAGES.map(s => s.name);
  for (const b of ['GIRDERS', 'CONVEYORS', 'ELEVATORS', 'RIVETS', 'SCAFFOLD', 'KIBBLE WORKS', 'DUMBWAITERS', 'PEG TOWER']) assert.ok(!names.includes(b), b);
  assert.deepEqual(names, ['TREEHOUSE CLIMB', 'ROOFTOP CHASE', 'DELIVERY RUN', 'DOG PARK']);
  for (const S of E.STAGES) { assert.ok(!('rivets' in S) && !('bowl' in S)); assert.ok(S.perches.length >= 3, 'roaming villain'); }
  assert.equal(LB.LB_KEY, 'inu-rescue.leaderboard.v2');
});
