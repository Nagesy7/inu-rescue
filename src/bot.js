// Route bot for all four stages (used by tests/bot.test.mjs and scripts/clear.mjs). Pure: reads game state, returns inputs.
// A route step for the platform the rescuer stands on: walk to x, then 'up' a ladder, 'jump' (dir), 'drop' off an edge,
// or wait for a moving platform (when(g) true) before acting.
import { findGround, ladderEnds } from './engine.js';
const L = (g, i) => g.lifts[i];
const freed = (g, i = 0) => g.pups[i].freed;
export const ROUTES = [
  { 0: g => ({ x: 110, act: 'up' }), 1: g => ({ x: 60, act: 'up' }), 3: g => freed(g) ? { x: 80, act: 'up' } : { x: 150 },
    4: g => ({ x: 50, act: 'up' }), 6: g => ({ x: 100, act: 'up' }), 7: g => ({ x: g.exit.x }) },
  { 0: g => ({ x: 68, act: 'jump', dir: 1 }), 1: g => ({ x: 168, act: 'jump', dir: 1 }), 2: g => ({ x: 236, act: 'up' }),
    3: g => ({ x: 152, act: 'jump', dir: -1 }), 4: g => freed(g) ? { x: 72, act: 'jump', dir: -1 } : { x: 84 }, 5: g => ({ x: 30, act: 'up' }),
    6: g => ({ x: 118, act: 'jump', dir: 1 }), 7: g => ({ x: 200, act: 'up' }), 8: g => ({ x: g.exit.x }) },
  { 0: g => ({ x: 56, act: 'jump', dir: 1, when: g => L(g, 0).x1 < 56 && L(g, 0).dx > 0 }),
    lift0: g => ({ x: L(g, 0).x2 - 6, act: 'jump', dir: 1, when: g => L(g, 0).x2 > 204 }),
    1: g => ({ x: 240, act: 'up' }), 2: g => freed(g) ? { x: 151, act: 'drop', dir: -1, when: g => L(g, 1).x2 > 158 && L(g, 1).dx > 0 } : { x: 180 },
    lift1: g => ({ x: L(g, 1).x1 + 6, act: 'jump', dir: -1, when: g => L(g, 1).x1 < 33 }),
    3: g => ({ x: 20, act: 'up' }), 4: g => ({ x: 86, act: 'jump', dir: 1, when: g => L(g, 2).x1 < 88 && L(g, 2).dx > 0 }),
    lift2: g => ({ x: L(g, 2).x2 - 6, act: 'jump', dir: 1, when: g => L(g, 2).x2 > 204 }), 5: g => ({ x: g.exit.x }) },
  { 0: g => ({ x: 30, act: 'up' }), 2: g => freed(g, 0) ? { x: 68, act: 'drop', dir: 1, when: g => L(g, 1).x1 > 58 && L(g, 1).x1 < 68 } : { x: 14 },
    lift1: g => ({ x: L(g, 1).x1 + 11, act: 'jump', dir: 1, when: g => L(g, 1).x1 + 11 > 100 && L(g, 1).dx > 0 }),
    4: g => freed(g, 2) ? { x: 150, act: 'drop', dir: 1, when: g => L(g, 2).x1 < 148 } : { x: 128 },
    lift2: g => ({ x: L(g, 2).x1 + 11, act: 'drop', dir: 1, when: g => L(g, 2).x1 + 11 > 194 }), 3: g => ({ x: 242 }),
    1: g => ({ x: 226, act: 'up' }) },
];
export function botInput(g) {
  const p = g.player, inp = { left: false, right: false, up: false, down: false, jump: false };
  if (g.mode !== 'play') return inp;
  if (p.state === 'climb') {
    const top = ladderEnds(g, p.lad).top;
    const danger = g.hazards.some(b => (b.state === 'ladder' && b.lad === p.lad && b.y < p.y && p.y - b.y < 30) ||
      (p.y - top < 26 && b.state === 'roll' && Math.abs(b.y - top) < 3 && Math.abs(b.x - p.lad.x) < 26));
    if (danger) inp.down = true; else inp.up = true; return inp;
  }
  if (p.state !== 'walk') return inp;
  const gr = findGround(g, p.x, p.y, 2, 2); if (!gr) return inp;
  const key = gr.pl.mover ? 'lift' + g.lifts.indexOf(gr.pl) : g.plats.indexOf(gr.pl);
  const r = ROUTES[g.stage % ROUTES.length][key]?.(g); if (!r) return inp;
  const dx = r.x - p.x, near = Math.abs(dx) < 1.5;
  // dodge: jump rollers/fleas closing in on the same level
  for (const b of g.hazards.concat(g.fleas)) {
    if (b.state && b.state !== 'roll' && b.state !== 'walk') continue;
    if (Math.abs(b.y - p.y) > 8) continue;
    const ex = b.x - p.x, closing = (b.vx || 0) * -Math.sign(ex) + (near ? 0 : Math.sign(dx) * Math.sign(ex) * 54);
    if (Math.abs(ex) < 22 && closing > 0 && p.hammer) { inp[ex > 0 ? 'right' : 'left'] = true; return inp; }
    if (Math.abs(ex) < 22 && closing > 0 && !p.hammer) { inp.jump = true; const nx = p.x + Math.sign(ex) * 30; if (nx > gr.pl.x1 + 2 && nx < gr.pl.x2 - 2 && !gr.pl.mover) inp[ex > 0 ? 'right' : 'left'] = true; return inp; }
  }
  // dodge a tin about to drop on our spot
  const tin = g.hazards.find(b => b.kind === 'tin' && b.state === 'warn' && Math.abs(b.x - p.x) < 12);
  const away = tin && (tin.x > p.x ? -12 : 12); if (tin && !gr.pl.mover && p.x + away > gr.pl.x1 + 4 && p.x + away < gr.pl.x2 - 4) { if (tin.x > p.x) inp.left = true; else inp.right = true; return inp; }
  const ready = r.act && (!r.when || r.when(g)) && Math.abs(dx) < (r.act === 'drop' ? 4 : 1.5);
  if (!ready && !near && !(gr.pl.mover && r.when && !r.when(g) && Math.abs(dx) < 10)) { if (dx > 0) inp.right = true; else inp.left = true; return inp; }
  if (r.when && !r.when(g)) return inp;
  if (p.hammer && (r.act === 'up' || r.act === 'jump')) return inp; // can't jump/climb holding the squeaky bone: wait it out
  if (r.act === 'up') inp.up = true;
  else if (r.act === 'jump') { inp.jump = true; if (r.dir > 0) inp.right = true; else inp.left = true; }
  else if (r.act === 'drop') { if (r.dir > 0) inp.right = true; else inp.left = true; }
  return inp;
}
