import test from 'node:test'; import assert from 'node:assert/strict';
import * as E from '../src/engine.js'; import { runNovice } from '../scripts/novice.mjs';
const at = (stage, loop, t) => { const g = E.createGame({ seed: 1, stage }); g.loop = loop; g.t = t; return g; };
test('stage-1 warm-up: throw gap starts longer and ramps linearly to the normal 2.4s by 25s', () => {
  assert.equal(E.spawnInterval(at(0, 0, 0)), 2.4 + E.EASE.extra);
  assert.ok(Math.abs(E.spawnInterval(at(0, 0, 12.5)) - (2.4 + E.EASE.extra / 2)) < 1e-9);
  assert.equal(E.spawnInterval(at(0, 0, 25)), 2.4); assert.equal(E.spawnInterval(at(0, 0, 90)), 2.4);
  let prev = Infinity; for (let t = 0; t <= 30; t++) { const v = E.spawnInterval(at(0, 0, t)); assert.ok(v <= prev); prev = v; }
});
test('warm-up only on stage 1 of the first loop; later stages/loops unchanged', () => {
  for (const [s, l] of [[1, 0], [2, 0], [3, 0], [0, 1], [1, 2]]) {
    const g = at(s, l, 0); assert.equal(E.spawnInterval(g), Math.max(1.0, E.STAGES[s].spawn - 0.3 * l));
    E.loadStage(g); assert.equal(g.spawnT, 1.4);
  }
  assert.equal(E.createGame({ seed: 1 }).spawnT, E.EASE.firstThrow);
});
test('early stage-1 yarn rolls on without splitting; after warm-up it splits as before', () => {
  const run = t0 => { const g = E.createGame({ seed: 3 }); g.mode = 'play'; g.t = t0; g.spawnT = 0; let n = 0, split = 0;
    while (n++ < 60 * 6 && g.mode === 'play') { g.player.x = 4; E.step(g, {}); split += g.events.filter(e => e === 'split').length; g.events = []; } return split; };
  assert.equal(run(0), 0); assert.ok(run(30) > 0);
});
test('novice sim: warm-up keeps a slow-reaction player alive longer on stage 1 (vs. no warm-up), and novices can clear it', () => {
  // Before the ladder grab window was widened (<5px -> 7px) the delayed novice kept overshooting ladders, so it lingered on the
  // bottom floors (mean first death >30s, but only ~5% cleared stage 1). Now it climbs and actually progresses into the busier
  // upper floors, so absolute survival time is no longer a fair warm-up signal: compare against the same sim with warm-up off.
  const sim = () => { const r = []; for (let s = 1; s <= 60; s++) r.push(runNovice(s, { delay: 8, miss: 0.25 }));
    return { mean: r.reduce((a, x) => a + x.firstDeath, 0) / r.length, clear: r.filter(x => x.cleared).length / r.length }; };
  const on = sim(), saved = { ...E.EASE }; E.EASE.extra = 0; E.EASE.firstThrow = 1.4;
  let off; try { off = sim(); } finally { Object.assign(E.EASE, saved); }
  console.log('novice mean first death', on.mean.toFixed(1), 'vs no warm-up', off.mean.toFixed(1), 'clear rate', on.clear.toFixed(2));
  assert.ok(on.mean > off.mean, `${on.mean} > ${off.mean}`); assert.ok(on.clear >= 0.9, String(on.clear));
});
