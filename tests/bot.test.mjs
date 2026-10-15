import test from 'node:test'; import assert from 'node:assert/strict';
import * as E from '../src/engine.js'; import { botInput } from '../src/bot.js';
test('bot playthrough clears every stage (several seeds, normal hazards, 9 lives)', () => {
  const res = [];
  for (let stage = 0; stage < 4; stage++) for (const seed of [1, 2, 3, 4, 5, 6]) {
    const g = E.createGame({ seed, stage, lives: 9 }); let n = 0;
    while (g.stage === stage && g.mode !== 'over' && n++ < 60 * 300) E.step(g, botInput(g));
    res.push({ stage, seed, cleared: g.stage !== stage, deaths: 9 - g.lives, lives: g.lives, secs: Math.round(n / 60) });
  }
  console.log(JSON.stringify(res));
  assert.ok(res.every(r => r.cleared), JSON.stringify(res));
});
test('difficulty curve: DELIVERY RUN bot deaths in line with stages 1-2 (no spike)', () => {
  const avg = stage => { let d = 0; for (let seed = 1; seed <= 10; seed++) { const g = E.createGame({ seed, stage, lives: 9 }); let n = 0, last = '';
    while (g.stage === stage && g.mode !== 'over' && n++ < 60 * 300) { E.step(g, botInput(g)); if (g.mode === 'dying' && last !== 'dying') d++; last = g.mode; } } return d / 10; };
  const a = [0, 1, 2].map(avg); console.log('avg deaths', a);
  assert.ok(a[2] <= Math.max(a[0], a[1]) + 0.5, JSON.stringify(a));
});
