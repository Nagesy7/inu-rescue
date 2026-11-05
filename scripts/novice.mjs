// Novice-player sim for stage 1 (TREEHOUSE CLIMB): the expert bot's inputs, delayed (slow reactions) and with
// random fumbles/missed jumps. Reports survival time to first death and how often a 3-life run clears stage 1.
import * as E from '../src/engine.js'; import { botInput } from '../src/bot.js';
const N = +(process.env.N || 200), DELAY = +(process.env.DELAY || 8), MISS = +(process.env.MISS || 0.25);
export function runNovice(seed, { delay = DELAY, miss = MISS } = {}) {
  const g = E.createGame({ seed, stage: 0, lives: 3 }), r = E.mulberry32(seed * 7919 + 1), q = [];
  let n = 0, firstDeath = null, last = '';
  while (g.stage === 0 && g.mode !== 'over' && n++ < 60 * 300) {
    q.push(botInput(g)); let inp = q.length > delay ? q.shift() : {};
    if (inp.jump && r() < miss) inp = { ...inp, jump: false };
    if (r() < 0.02) inp = {};
    E.step(g, inp);
    if (g.mode === 'dying' && last !== 'dying' && firstDeath === null) firstDeath = g.runTime / 1000;
    last = g.mode;
  }
  return { cleared: g.stage > 0, firstDeath: firstDeath ?? g.runTime / 1000 };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const rs = []; for (let s = 1; s <= N; s++) rs.push(runNovice(s));
  const fd = rs.map(x => x.firstDeath).sort((a, b) => a - b);
  console.log(JSON.stringify({ runs: N, delayFrames: DELAY, missJump: MISS, clearRate: +(rs.filter(x => x.cleared).length / N).toFixed(3),
    meanFirstDeathSec: +(fd.reduce((a, b) => a + b, 0) / N).toFixed(1), medianFirstDeathSec: +fd[N >> 1].toFixed(1) }));
}
