// Simple stage-1 bot (used by tests/bot.test.mjs and scripts/clear.mjs). Pure: reads game state, returns inputs.
import { findGround } from './engine.js';
export const ROUTE1 = [110, 150, 180, 130, 190, 140]; // ladder to take from girder i
export function botInput(g) {
  const p = g.player, inp = { left: false, right: false, up: false, down: false, jump: false };
  if (g.mode !== 'play') return inp;
  if (p.state === 'climb') {
    // don't climb into a ball rolling down this ladder
    const danger = g.hazards.some(b => b.state === 'ladder' && b.lad === p.lad && b.y < p.y && p.y - b.y < 30);
    inp.up = !danger; return inp;
  }
  if (p.state !== 'walk') return inp;
  const gr = findGround(g, p.x, p.y, 2, 2); const i = gr ? g.plats.indexOf(gr.pl) : -1;
  const tx = i >= 0 && i < ROUTE1.length ? ROUTE1[i] : g.pup.x;
  const dir = Math.abs(tx - p.x) < 1.5 ? 0 : Math.sign(tx - p.x);
  if (dir > 0) inp.right = true; else if (dir < 0) inp.left = true; else inp.up = true;
  for (const b of g.hazards.concat(g.fleas)) {
    if (b.state === 'fall' || b.state === 'ladder') continue;
    if (Math.abs(b.y - p.y) > 8) continue;
    const dx = b.x - p.x, closing = (b.vx || 0) * -Math.sign(dx) + (dir * Math.sign(dx)) * 54;
    if (Math.abs(dx) < 20 && closing > 0) { inp.jump = true; inp.up = false; break; }
  }
  return inp;
}
