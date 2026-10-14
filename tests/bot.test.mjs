import test from 'node:test'; import assert from 'node:assert/strict';
import * as E from '../src/engine.js'; import { botInput } from '../src/bot.js';
test('bot playthrough clears stage 1 (several seeds, normal hazards)', () => {
  const res = [];
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const g = E.createGame({ seed }); let n = 0;
    while (g.stage === 0 && g.mode !== 'over' && n++ < 60 * 300) E.step(g, botInput(g));
    res.push({ seed, cleared: g.stage === 1 || g.mode === 'clear', lives: g.lives, secs: Math.round(n / 60) });
  }
  console.log(JSON.stringify(res));
  assert.ok(res.every(r => r.cleared), JSON.stringify(res));
});
