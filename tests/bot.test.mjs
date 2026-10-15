import test from 'node:test'; import assert from 'node:assert/strict';
import * as E from '../src/engine.js'; import { botInput } from '../src/bot.js';
test('bot playthrough clears every stage (several seeds, normal hazards, 9 lives)', () => {
  const res = [];
  for (let stage = 0; stage < 4; stage++) for (const seed of [1, 2, 3, 4, 5, 6]) {
    const g = E.createGame({ seed, stage, lives: 9 }); let n = 0;
    while (g.stage === stage && g.mode !== 'over' && n++ < 60 * 300) E.step(g, botInput(g));
    res.push({ stage, seed, cleared: g.stage !== stage, lives: g.lives, secs: Math.round(n / 60) });
  }
  console.log(JSON.stringify(res));
  assert.ok(res.every(r => r.cleared), JSON.stringify(res));
});
