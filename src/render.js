import { W, H, surfaceY, ladderEnds, hammerZone, STAGES } from './engine.js';
import { SPR, PAL, drawSprite } from './sprites.js';
const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
export function text(c, s, x, y, col = '#fff', align = 'left', size = 8) {
  c.font = `bold ${size}px monospace`; c.textAlign = align; c.textBaseline = 'top';
  c.fillStyle = '#000'; c.fillText(s, x + 1, y + 1); c.fillStyle = col; c.fillText(s, x, y);
}
const THEMES = [ { beam:'#e05a6a', dark:'#8a2838', lad:'#5ad0d8' }, { beam:'#e09a3a', dark:'#7a4a18', lad:'#7ae07a' },
  { beam:'#9a6ae0', dark:'#4a2a80', lad:'#f0c840' }, { beam:'#4aa0e8', dark:'#1a4a80', lad:'#f08ab0' } ];

function drawPlat(c, pl, th, t) {
  const n = Math.ceil((pl.x2 - pl.x1) / 8);
  for (let i = 0; i < n; i++) {
    const x = pl.x1 + i * 8, w = Math.min(8, pl.x2 - x), y = surfaceY(pl, x + 4);
    if (pl.conv) {
      R(c, x, y, w, 6, '#7a7f8e'); R(c, x, y + 1, w, 4, '#3a3e4a');
      const o = ((t * 22 * pl.conv) % 8 + 8) % 8; R(c, x + ((i * 8 + o) % 8) * w / 8, y + 2, 2, 2, '#f0c840');
    } else {
      R(c, x, y, w, 7, th.beam); R(c, x, y + 1, w, 1, th.dark); R(c, x, y + 5, w, 1, th.dark);
      R(c, x + 2, y + 2, 1, 3, th.dark); R(c, x + 5, y + 2, 1, 3, th.dark); R(c, x + 3, y + 3, 2, 1, th.dark);
    }
  }
  if (pl.conv) { R(c, pl.x1 - 2, surfaceY(pl, pl.x1), 4, 6, '#f0c840'); R(c, pl.x2 - 2, surfaceY(pl, pl.x2), 4, 6, '#f0c840'); }
}
function drawCat(c, cat, throwing, t, fallen) {
  const x = Math.round(cat.x) - 16, y = Math.round(cat.y) - 30 + (fallen ? 40 : 0);
  const g = '#8a8f9e', G = '#5f6474', l = '#c8cdd8';
  // body
  R(c, x + 4, y + 14, 24, 16, g); R(c, x + 8, y + 18, 16, 10, l);
  for (let i = 0; i < 4; i++) R(c, x + 5 + i * 6, y + 14, 2, 3, G);
  // tail
  const tw = Math.round(Math.sin(t * 3) * 2); R(c, x + 28, y + 18 + tw, 3, 10, g); R(c, x + 30, y + 14 + tw, 3, 6, G);
  // head
  R(c, x + 2, y + 2, 28, 14, g); R(c, x + 2, y - 2, 6, 5, g); R(c, x + 24, y - 2, 6, 5, g); R(c, x + 4, y, 2, 3, '#e8a0b8'); R(c, x + 26, y, 2, 3, '#e8a0b8');
  // grumpy brows + eyes
  R(c, x + 7, y + 5, 6, 1, '#201818'); R(c, x + 19, y + 5, 6, 1, '#201818'); R(c, x + 11, y + 6, 2, 1, '#201818'); R(c, x + 19, y + 6, 2, 1, '#201818');
  R(c, x + 8, y + 7, 5, 3, '#f0c840'); R(c, x + 19, y + 7, 5, 3, '#f0c840'); R(c, x + 10, y + 8, 2, 2, '#201818'); R(c, x + 20, y + 8, 2, 2, '#201818');
  R(c, x + 15, y + 10, 2, 1, '#e86a7a'); R(c, x + 12, y + 13, 8, 1, '#201818'); R(c, x + 11, y + 14, 1, 1, '#201818'); R(c, x + 20, y + 14, 1, 1, '#201818');
  R(c, x - 2, y + 10, 6, 1, l); R(c, x + 28, y + 10, 6, 1, l);
  // arms
  if (throwing) { R(c, x, y + 8, 4, 10, g); R(c, x + 28, y + 8, 4, 10, g); R(c, x - 1, y + 6, 6, 3, l); R(c, x + 27, y + 6, 6, 3, l); }
  else { R(c, x + 2, y + 18, 4, 10, g); R(c, x + 26, y + 18, 4, 10, g); }
}
function drawHazard(c, b) {
  const x = Math.round(b.x), y = Math.round(b.y - b.r), f = Math.floor(Math.abs(b.rot)) % 4;
  if (b.kind === 'yarn' || b.kind === 'ball') {
    const col = b.kind === 'yarn' ? '#e04a8a' : '#c8f040', dk = b.kind === 'yarn' ? '#901a50' : '#6a9020';
    R(c, x - 4, y - 3, 8, 7, col); R(c, x - 3, y - 4, 6, 9, col); R(c, x - 5, y - 2, 10, 5, col);
    if (b.kind === 'yarn') { for (let i = 0; i < 3; i++) R(c, x - 4 + ((i * 3 + f) % 8), y - 3 + i * 2, 3, 1, dk); }
    else R(c, x - 5, y + (f % 2 ? -1 : 0), 10, 1, '#fff');
  } else if (b.kind === 'kibble') {
    R(c, x - 5, y - 4, 10, 9, '#8a5a2a'); R(c, x - 5, y - 4 + (f % 3) * 3, 10, 2, '#c8963a'); R(c, x - 2, y - 1, 4, 3, '#f0c840');
  } else { // tin
    R(c, x - 5, y - 3, 10, 8, '#b0b8c8'); R(c, x - 5, y - 1, 10, 3, '#e05a3a'); R(c, x - 2, y - 1, 2, 2, '#fff');
  }
}
export function drawGame(c, g, opts = {}) {
  const t = g.t, th = THEMES[g.stage % 4];
  R(c, 0, 0, W, H, '#0c0c1e');
  for (let i = 0; i < 30; i++) R(c, (i * 97) % W, 20 + (i * 53) % 200, 1, 1, '#2a2a4a');
  // ladders
  for (const L of g.S.ladders) { const e = ladderEnds(g, L);
    R(c, L.x - 5, e.top, 1, e.bot - e.top + 6, th.lad); R(c, L.x + 4, e.top, 1, e.bot - e.top + 6, th.lad);
    for (let y = e.top + 3; y < e.bot + 6; y += 4) R(c, L.x - 5, y, 10, 1, th.lad); }
  // elevator shafts
  for (const s of g.S.shafts) { R(c, s.x1 + 3, s.top - 4, 1, s.bot - s.top, '#555'); R(c, s.x2 - 4, s.top - 4, 1, s.bot - s.top, '#555');
    R(c, s.x1, s.top - 6, s.x2 - s.x1, 3, '#888'); R(c, s.x1, s.bot, s.x2 - s.x1, 3, '#888'); }
  for (const pl of g.plats) drawPlat(c, pl, th, t);
  for (const l of g.lifts) { R(c, l.x1, l.y1, l.x2 - l.x1, 5, '#f09a3a'); R(c, l.x1, l.y1 + 4, l.x2 - l.x1, 1, '#7a4a18'); }
  for (const r of g.rivets) if (!r.gone) { R(c, r.x - 3, r.y - 2, 6, 9, '#f0c840'); R(c, r.x - 1, r.y, 2, 2, '#7a5a10'); }
  // bowl (flea pot)
  const bw = g.bowl; R(c, bw.x - 8, bw.y - 8, 16, 8, '#3a70d0'); R(c, bw.x - 10, bw.y - 9, 20, 2, '#6aa0f0');
  for (let i = 0; i < 3; i++) R(c, bw.x - 6 + i * 5, bw.y - 11 - ((Math.floor(t * 8) + i) % 3), 1, 1, '#f0c840');
  text(c, 'FLEA', bw.x - 8, bw.y - 7, '#fff', 'left', 5);
  for (const h of g.hammers) if (!h.taken) drawSprite(c, SPR.bone, h.x - 4, h.y);
  for (const to of g.toys) if (!to.taken) { const s = SPR[to.k]; drawSprite(c, s, to.x - 3, to.y - s.length - 1); }
  // pup + cat
  const pupHop = g.mode === 'clear' ? Math.abs(Math.sin(g.timer * 10)) * 4 : 0;
  drawSprite(c, SPR.pup, g.pup.x - 4, g.pup.y - 10 - pupHop, g.player.x < g.pup.x);
  if (g.mode === 'play' && Math.floor(t * 2) % 3 === 0) text(c, 'HELP!', g.pup.x + 6, g.pup.y - 20, '#f8a0c0', 'left', 6);
  if (g.mode === 'clear') text(c, '\u2665', g.pup.x - 3, g.pup.y - 24, '#ff5a7a', 'left', 10);
  drawCat(c, g.cat, g.cat.throwT > 0, t, g.cat.fallen);
  for (const b of g.hazards) drawHazard(c, b);
  for (const f of g.fleas) { const hop = Math.floor(f.t * 8) % 2; drawSprite(c, SPR.flea, f.x - 3, f.y - 6 - hop);
    if (Math.floor(f.t * 12) % 2) R(c, f.x + (hop ? 3 : -4), f.y - 8, 1, 1, '#f0f070'); }
  // player
  const p = g.player; let spr = SPR.inuWalk1, flip = p.face < 0;
  if (p.state === 'dead') spr = SPR.inuDead;
  else if (p.state === 'climb') { spr = SPR.inuClimb; flip = Math.floor(p.anim * 6) % 2 === 1; }
  else if (p.state === 'air') spr = SPR.inuJump;
  else if (Math.floor(p.anim * 8) % 2) spr = SPR.inuWalk2;
  if (!(g.mode === 'intro' && Math.floor(g.timer * 8) % 2)) drawSprite(c, spr, p.x - 6, p.y - 16, flip);
  if (p.hammer > 0) { const up = Math.floor(t * 8) % 2 === 0; const z = hammerZone(p);
    if (!(p.hammer < 2 && Math.floor(t * 10) % 2)) {
      if (up) { R(c, p.x + p.face * 3, p.y - 22, 2, 9, '#5a3a22'); R(c, p.x + p.face * 3 - 3, p.y - 26, 8, 5, '#e8dcc8'); }
      else { R(c, p.x + p.face * 4, p.y - 11, p.face * 9, 2, '#5a3a22'); R(c, z.x - 2, z.y - 4, 5, 9, '#e8dcc8'); } } }
  for (const pp of g.popups) text(c, pp.text, pp.x, pp.y - (1 - pp.t) * 8, '#f0f070', 'center', 7);
  // HUD
  R(c, 0, 0, W, 14, '#000a');
  text(c, `1UP ${String(g.score).padStart(6, '0')}`, 3, 2, '#ff6a6a');
  text(c, `HI ${String(Math.max(opts.hi || 0, g.score)).padStart(6, '0')}`, 92, 2, '#fff');
  text(c, `BONUS ${g.bonus}`, 253, 2, '#5ad0d8', 'right');
  for (let i = 0; i < Math.max(0, g.lives - 1) && i < 5; i++) { R(c, 4 + i * 8, 16, 5, 4, '#d9893b'); R(c, 4 + i * 8, 15, 1, 1, '#d9893b'); R(c, 8 + i * 8, 15, 1, 1, '#d9893b'); }
  text(c, `L${g.loop + 1}-${g.stage + 1} ${STAGES[g.stage].name}`, 253, 15, '#aaa', 'right', 6);
  if (g.mode === 'intro') { text(c, `STAGE ${g.loop * 4 + g.stage + 1}`, W / 2, 100, '#fff', 'center', 12); text(c, 'RESCUE THE PUP!', W / 2, 116, '#f0c840', 'center'); }
  if (g.mode === 'clear') text(c, 'STAGE CLEAR!', W / 2, 100, '#7ae07a', 'center', 14);
  if (opts.paused) { R(c, 60, 92, 136, 40, '#000c'); text(c, 'PAUSED', W / 2, 98, '#fff', 'center', 14); text(c, 'P / ESC TO RESUME', W / 2, 116, '#aaa', 'center'); }
}
export function drawTitle(c, t, lb, describeFn, fmt) {
  R(c, 0, 0, W, H, '#0c0c1e');
  for (let i = 0; i < 40; i++) R(c, (i * 97) % W, (i * 53) % H, 1, 1, '#2a2a4a');
  const bob = Math.round(Math.sin(t * 3) * 2);
  text(c, 'INU', W / 2 + 2, 14 + bob, '#8a2838', 'center', 28); text(c, 'INU', W / 2, 12 + bob, '#f0c840', 'center', 28);
  text(c, 'RESCUE', W / 2 + 2, 42 + bob, '#8a2838', 'center', 24); text(c, 'RESCUE', W / 2, 40 + bob, '#e05a6a', 'center', 24);
  // vignette: cat + pup + inu
  R(c, 20, 104, 216, 7, '#e05a6a'); R(c, 20, 105, 216, 1, '#8a2838');
  drawCat(c, { x: 60, y: 104 }, Math.floor(t * 2) % 2, t, false);
  drawSprite(c, SPR.pup, 110, 94); drawSprite(c, SPR.inuWalk1, 180, 88, true);
  drawHazard(c, { kind: 'yarn', x: 140 + (t * 30) % 30, y: 104, r: 5, rot: t * 8 });
  text(c, 'A grumpy cat stole the pup!', W / 2, 118, '#ddd', 'center', 7);
  text(c, 'TOP RESCUERS', W / 2, 132, '#5ad0d8', 'center');
  if (!lb.length) text(c, 'no runs yet', W / 2, 146, '#777', 'center', 7);
  lb.slice(0, 5).forEach((e, i) => text(c, `${i + 1}. ${e.name} S${e.stage} H${String(e.height).padStart(3)} ${fmt(e.timeMs)}`, 34, 144 + i * 10, i ? '#ccc' : '#f0c840', 'left', 7));
  if (Math.floor(t * 2) % 2 === 0) text(c, 'PRESS ENTER / TAP START', W / 2, 202, '#fff', 'center');
  text(c, 'ARROWS/WASD move  SPACE jump  P pause', W / 2, 216, '#888', 'center', 6);
  text(c, 'original fan-made arcade homage', W / 2, 228, '#555', 'center', 6);
}
