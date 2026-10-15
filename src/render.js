import { has, frame, HERO } from './art.js';
import { W, H, surfaceY, ladderEnds, hammerZone, STAGES } from './engine.js';
import { SPR, PAL, drawSprite } from './sprites.js';
const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
export function text(c, s, x, y, col = '#fff', align = 'left', size = 8) {
  c.font = `bold ${size}px monospace`; c.textAlign = align; c.textBaseline = 'top';
  c.fillStyle = '#000'; c.fillText(s, x + 1, y + 1); c.fillStyle = col; c.fillText(s, x, y);
}
const THEMES = [ { beam:'#e05a6a', dark:'#8a2838', lad:'#5ad0d8' }, { beam:'#e09a3a', dark:'#7a4a18', lad:'#7ae07a' },
  { beam:'#9a6ae0', dark:'#4a2a80', lad:'#f0c840' }, { beam:'#4aa0e8', dark:'#1a4a80', lad:'#f08ab0' } ];

// per-stage original scenery: tree branches, rooftops, loading docks, park grass
function drawPlat(c, pl, th, t, ti = 0, theme = 'tree') {
  const x = Math.round(pl.x1), w = Math.round(pl.x2 - pl.x1), y = Math.round(pl.y1);
  if (theme === 'tree') {
    R(c, x, y, w, 5, '#7a4a22'); R(c, x, y, w, 1, '#a8703a'); R(c, x, y + 4, w, 1, '#4a2a12');
    for (let i = 4; i < w - 2; i += 13) { R(c, x + i, y - 2, 4, 2, '#3aa04a'); R(c, x + i + 1, y - 3, 2, 1, '#6ad06a'); }
  } else if (theme === 'roof') {
    if (ti === 'body') { R(c, x, y + 4, w, H - y, '#2a2238'); for (let yy = y + 10; yy < H; yy += 14) for (let xx = x + 4; xx < x + w - 6; xx += 12) R(c, xx, yy, 5, 6, (xx * 7 + yy) % 5 ? '#141020' : '#f0c860'); return; }
    R(c, x, y, w, 4, '#8a7a90'); R(c, x, y, w, 1, '#c8b8d0'); R(c, x - 1, y + 3, w + 2, 1, '#4a3a58');
  } else if (theme === 'truck') {
    R(c, x, y + 4, w, Math.min(H - y, 40), '#3a3a44'); R(c, x, y, w, 4, '#9a9aa8'); for (let i = 0; i < w; i += 8) R(c, x + i, y + 1, 4, 2, '#f0c840');
  } else {
    R(c, x, y + 3, w, Math.min(H - y, 20), '#6a4a2a'); R(c, x, y, w, 4, '#4ab04a'); for (let i = 1; i < w; i += 3) R(c, x + i, y - 1 - (i % 2), 1, 1 + (i % 2), '#7ae07a');
  }
}
function drawBackdrop(c, g, t) {
  const th = g.S.theme;
  if (th === 'roof' && frame(c, 'background', 0, W, H, 0, 0)) return;
  const sky = { tree: ['#1a2a4a', '#3a5a6a'], roof: ['#0c0c1e', '#1a1a3a'], truck: ['#140c24', '#3a1a3a'], park: ['#2a3a6a', '#e08a5a'] }[th];
  const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, sky[0]); gr.addColorStop(1, sky[1]); c.fillStyle = gr; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 24; i++) R(c, (i * 97) % W, 20 + (i * 53) % 90, 1, 1, '#ffffff44');
  if (th === 'tree') { R(c, 116, 40, 24, H, '#5a3418'); R(c, 120, 40, 3, H, '#7a4a22'); R(c, 132, 60, 2, H, '#3a2010');
    c.fillStyle = '#1e5a2a'; for (const [x, y, r] of [[128, 30, 46], [60, 40, 26], [200, 44, 28]]) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
    // treehouse hut round the top deck
    R(c, 74, 24, 108, 28, '#8a5a2a'); R(c, 70, 20, 116, 5, '#a83a2a'); R(c, 120, 30, 14, 10, '#f0d080'); }
  if (th === 'truck') { R(c, 0, 226, W, 14, '#22222a'); for (let x = (-t * 40) % 24; x < W; x += 24) R(c, x, 232, 12, 2, '#f0f0f0');
    for (let i = 0; i < 6; i++) R(c, 10 + i * 44, 30, 30, 70, '#24183a'); }
  if (th === 'park') { R(c, 92, 224, 72, 16, '#2a6ab0'); for (let i = 0; i < 6; i++) R(c, 96 + ((i * 13 + Math.floor(t * 6)) % 64), 228 + (i % 3) * 3, 5, 1, '#8ac8f0');
    R(c, 24, 58, 210, 4, '#5a3418'); R(c, 0, 50, 26, H, '#4a2a12'); R(c, 230, 50, 26, H, '#4a2a12');
    c.fillStyle = '#2a6a2a'; for (const x of [12, 244]) { c.beginPath(); c.arc(x, 40, 30, 0, 7); c.fill(); } }
}
function drawLift(c, l, t) {
  const x = Math.round(l.x1), w = Math.round(l.x2 - l.x1), y = Math.round(l.y1);
  if (l.mover === 'truck') { // delivery van: box body below the roof deck, cab on the travel side, spinning wheels
    const f = l.dx >= 0 ? 1 : -1; R(c, x, y, w, 14, '#e8e8f0'); R(c, x, y, w, 2, '#b0b0c0'); R(c, x + 4, y + 5, w - 8, 4, '#e05a6a');
    const cx = f > 0 ? x + w : x - 10; R(c, cx, y + 5, 10, 9, '#d0d0dc'); R(c, cx + (f > 0 ? 3 : 1), y + 6, 6, 4, '#8ad0f0');
    const sp = Math.floor(t * 10) % 2; for (const wx of [x + 6, x + w - 10, cx + 2]) { R(c, wx, y + 13, 6, 5, '#111'); R(c, wx + 2 + sp, y + 15, 1, 1, '#888'); }
  } else { const m = l.m, sx = (l.x1 + l.x2) / 2; c.strokeStyle = '#d8c08a'; c.lineWidth = 1; c.beginPath(); c.moveTo(m.px, m.py); c.lineTo(sx, y); c.stroke();
    R(c, m.px - 3, m.py - 2, 6, 3, '#5a3418'); R(c, x, y, w, 3, '#a8703a'); R(c, x, y + 3, w, 1, '#5a3418'); }
}
function drawPup(c, g, q, t, i) {
  const hop = q.freed ? Math.abs(Math.sin(t * 8 + i)) * 3 : 0;
  if (g.S.final) { R(c, q.x - 9, q.y - 14, 18, 14, '#c86a3a'); R(c, q.x - 11, q.y - 17, 22, 4, '#8a3a2a'); R(c, q.x - 4, q.y - 9, 8, 9, '#2a1a10'); }
  if (!frame(c, 'pup_sheet', q.freed && hop > 1 ? 1 : 0, 9, 10, q.x - 4, q.y - 10 - hop, g.player.x < q.x)) drawSprite(c, SPR.pup, q.x - 4, q.y - 10 - hop, g.player.x < q.x);
  if (!q.freed) { // cage bars / kennel gate
    for (let k = -6; k <= 6; k += 3) R(c, q.x + k, q.y - 13, 1, 13, '#c8c8d8'); R(c, q.x - 7, q.y - 14, 15, 1, '#e8e8f0');
    if (g.mode === 'play' && Math.floor(t * 2 + i) % 3 === 0) text(c, 'YIP YIP!', q.x + 6, q.y - 24, '#f8a0c0', 'left', 6);
  } else text(c, '\u2665', q.x - 3, q.y - 22 - hop, '#ff5a7a', 'left', 8);
}
function drawExit(c, g, t) {
  const e = g.exit; if (!e) return; const open = g.pups.every(q => q.freed);
  drawVan(c, e.x - 17, e.y, '#5ad0d8');
  if (!open) { R(c, e.x - 3, e.y - 30, 6, 5, '#f0c840'); R(c, e.x - 2, e.y - 33, 4, 3, '#000'); R(c, e.x - 1, e.y - 32, 2, 2, '#f0c840'); }
  else if (Math.floor(t * 3) % 2) text(c, 'GO!', e.x, e.y - 34, '#7ae07a', 'center', 8);
}
function drawCat(c, cat, throwing, t, fallen) {
  if (frame(c, 'cat_sheet', throwing ? 1 : 0, 36, 32, cat.x - 18, cat.y - 32 + (fallen ? 40 : 0))) return;
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
  if (b.state === 'warn') { if (Math.floor(b.warn * 12) % 2) { R(c, b.x - 1, 18, 2, 5, '#ff4a4a'); R(c, b.x - 1, 24, 2, 2, '#ff4a4a'); } for (let y = 30; y < H; y += 8) R(c, b.x, y, 1, 3, '#ff4a4a55'); return; }
  if (b.state === 'clank') { R(c, b.x - 6, b.y - 3, 12, 3, '#b0b8c8'); R(c, b.x - 8, b.y - 6, 2, 2, '#fff'); R(c, b.x + 6, b.y - 7, 2, 2, '#fff'); return; }
  if (b.r < 5) { const x = Math.round(b.x), y = Math.round(b.y - 4); R(c, x - 3, y - 3, 6, 7, '#e04a8a'); R(c, x - 4, y - 2, 8, 5, '#e04a8a'); R(c, x - 2, y - 1 + (Math.floor(Math.abs(b.rot)) % 3), 4, 1, '#901a50'); return; }
  if (frame(c, 'hazard_' + b.kind, Math.floor(Math.abs(b.rot)) % 4, 10, 10, b.x - 5, b.y - b.r - 5)) return;
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
  // death shake: short screen jolt so a hit reads clearly on a small phone screen
  const shk = g.mode === 'dying' && g.timer > 1.3 ? Math.round(Math.sin(g.timer * 90) * 2) : 0;
  c.save(); if (shk) c.translate(shk, 0);
  drawBackdrop(c, g, t);
  const theme = g.S.theme;
  if (theme === 'roof') for (const pl of [...g.plats].sort((a, b) => a.y1 - b.y1)) drawPlat(c, pl, th, t, 'body', theme);
  for (const pl of g.plats) drawPlat(c, pl, th, t, 0, theme);
  // rope ladders (original: knotted rope, not steel)
  for (const L of g.S.ladders) { const e = ladderEnds(g, L);
    R(c, L.x - 4, e.top, 1, e.bot - e.top, '#d8c08a'); R(c, L.x + 3, e.top, 1, e.bot - e.top, '#d8c08a');
    for (let y = e.top + 4; y < e.bot; y += 5) { R(c, L.x - 4, y, 8, 1, '#a8703a'); R(c, L.x - 4, y - 1, 1, 1, '#fff6'); } }
  for (const l of g.lifts) drawLift(c, l, t);
  if (g.S.perches.some(q => q.p === undefined)) { /* park: cat walks the high branch drawn in the backdrop */ }
  for (const h of g.hammers) if (!h.taken && !frame(c, 'bone', 0, 8, 8, h.x - 4, h.y)) drawSprite(c, SPR.bone, h.x - 4, h.y);
  for (const to of g.toys) if (!to.taken) { const s = SPR[to.k]; drawSprite(c, s, to.x - 3, to.y - s.length - 1); }
  // caged pups + exit van
  g.pups.forEach((q, i) => drawPup(c, g, q, t, i)); drawExit(c, g, t);
  drawCat(c, g.cat, g.cat.throwT > 0 || !!g.cat.hop, t, g.cat.fallen);
  for (const b of g.hazards) drawHazard(c, b);
  for (const f of g.fleas) { const hop = Math.floor(f.t * 8) % 2; drawSprite(c, SPR.flea, f.x - 3, f.y - 6 - hop);
    if (Math.floor(f.t * 12) % 2) R(c, f.x + (hop ? 3 : -4), f.y - 8, 1, 1, '#f0f070'); }
  // player
  const p = g.player; let spr = SPR.inuWalk1, flip = p.face < 0;
  if (p.state === 'dead') spr = SPR.inuDead;
  else if (p.state === 'climb') { spr = SPR.inuClimb; flip = Math.floor(p.anim * 6) % 2 === 1; }
  else if (p.state === 'air') spr = SPR.inuJump;
  else if (Math.floor(p.anim * 8) % 2) spr = SPR.inuWalk2;
  // art: 4-frame run (only while actually moving), win pose on stage clear, hurt on death
  if (p.anim !== lastAnim) stillFrames = 0; else stillFrames++; lastAnim = p.anim; const moving = stillFrames < 6;
  let hf = HERO.idle, hflip = p.face < 0;
  if (p.state === 'dead') hf = HERO.hurt; else if (g.mode === 'clear') hf = HERO.win;
  else if (p.state === 'climb') { hf = HERO.climb; hflip = Math.floor(p.anim * 6) % 2 === 1; }
  else if (p.state === 'air') hf = HERO.jump; else if (moving) hf = HERO.run[Math.floor(p.anim * 10) % 4];
  heroFrame = hf;
  const lk = opts.look || {};
  if (!(g.mode === 'intro' && Math.floor(g.timer * 8) % 2)) {
    if (lk.shiba) lk.shiba.draw(c, p.x, p.y, { scale: 0.5, shadow: false, face: p.state === 'climb' ? 'up' : p.face < 0 ? 'left' : 'right', frame: moving || p.state === 'climb' ? Math.floor(p.anim * 10) % 4 : 0 });
    else if (!frame(c, 'hero_sheet', hf, 12, 16, p.x - 6, p.y - 16, hflip)) drawSprite(c, spr, p.x - 6, p.y - 16, flip);
    drawGear(c, lk, p.x, p.y, p.face, !!lk.shiba, p.state === 'climb'); }
  if (p.hammer > 0) { const up = Math.floor(t * 8) % 2 === 0; const z = hammerZone(p);
    if (!(p.hammer < 2 && Math.floor(t * 10) % 2)) {
      // squeaky bone held in the mouth + bark shockwave rings (no mallet)
      R(c, p.x + p.face * 5 - 3, p.y - 13, 7, 2, '#f0e4cc'); R(c, p.x + p.face * 5 - 4, p.y - 14, 2, 4, '#f0e4cc'); R(c, p.x + p.face * 5 + 3, p.y - 14, 2, 4, '#f0e4cc');
      c.strokeStyle = up ? '#f0c840' : '#ffe9a0'; c.lineWidth = 1; for (const rr of up ? [4, 8] : [6, 10]) { c.beginPath(); c.arc(z.x, z.y, rr, -1.1, 1.1); if (p.face < 0) { c.beginPath(); c.arc(z.x, z.y, rr, Math.PI - 1.1, Math.PI + 1.1); } c.stroke(); } } }
  for (const pp of g.popups) text(c, pp.text, pp.x, pp.y - (1 - pp.t) * 8, '#f0f070', 'center', 7);
  c.restore();
  // HUD
  R(c, 0, 0, W, 14, '#000a');
  text(c, `P1 ${String(g.score).padStart(6, '0')}`, 3, 2, '#ff6a6a');
  text(c, `HI ${String(Math.max(opts.hi || 0, g.score)).padStart(6, '0')}`, 92, 2, '#fff');
  text(c, `TREATS ${g.bonus}`, 253, 2, '#5ad0d8', 'right');
  for (let i = 0; i < Math.max(0, g.lives - 1) && i < 5; i++) { R(c, 4 + i * 8, 16, 5, 4, '#d9893b'); R(c, 4 + i * 8, 15, 1, 1, '#d9893b'); R(c, 8 + i * 8, 15, 1, 1, '#d9893b'); }
  text(c, `L${g.loop + 1}-${g.stage + 1} ${STAGES[g.stage].name}`, 253, 15, '#aaa', 'right', 6);
  text(c, `PUPS ${g.pups.filter(q => q.freed).length}/${g.pups.length}`, 48, 15, '#f8a0c0', 'left', 6);
  if (g.mode === 'intro') { text(c, `STAGE ${g.loop * 4 + g.stage + 1}`, W / 2, 100, '#fff', 'center', 12); text(c, g.S.final ? 'OPEN ALL 3 KENNELS!' : 'FREE THE PUP, THEN REACH THE VAN!', W / 2, 116, '#f0c840', 'center', 7); }
  if (g.mode === 'clear') { text(c, 'STAGE CLEAR!', W / 2, 100, '#7ae07a', 'center', 14); text(c, `PUPS SAVED: ${g.saved || 1}`, W / 2, 118, '#ff8aa0', 'center', 8); }
  if (opts.paused) { R(c, 0, 0, W, H, '#0008'); R(c, 32, 84, W - 64, 56, '#000d'); text(c, 'PAUSED', W / 2, 92, '#fff', 'center', 16);
    text(c, opts.paused === 'blur' ? (opts.touch ? 'TAP OR PRESS ANY KEY TO RESUME' : 'CLICK OR PRESS ANY KEY TO RESUME') : (opts.touch ? 'TAP PAUSE TO RESUME' : 'P / ESC TO RESUME'), W / 2, 118, '#f0c840', 'center', 7); }
}
// cosmetic overlays (collar / gear) on the rescuer: pure pixels, no gameplay effect. Shared Shiba is 18x22, hero art 12x16.
export function drawGear(c, lk, x, y, face = 1, shiba = false, back = false) {
  const top = y - (shiba ? 20 : 16), neck = y - (shiba ? 11 : 10);
  if (lk.gear?.id === 'gear-cape') R(c, x - face * (shiba ? 6 : 5) - 1, neck, 2, 8, lk.gear.color);
  if (lk.gear?.id === 'gear-hivis') { R(c, x - 3, neck + 1, 6, 3, lk.gear.color); R(c, x - 3, neck + 2, 6, 1, '#c0c0c0'); }
  if (lk.collar && !back) R(c, x - 3, neck, 6, 1, lk.collar.color);
  if (lk.gear?.id === 'gear-helmet') { R(c, x - 4, top, 8, 2, lk.gear.color); R(c, x - 5, top + 2, 10, 1, lk.gear.color); }
}
export function drawVan(c, x, y, col) { // rescue van skin (title screen garage)
  R(c, x, y - 14, 34, 12, col); R(c, x + 22, y - 20, 12, 7, col); R(c, x + 24, y - 18, 8, 4, '#bfe8ff');
  R(c, x + 4, y - 11, 14, 2, '#fff'); R(c, x + 10, y - 13, 2, 6, '#fff'); R(c, x + 6, y - 2, 6, 4, '#222'); R(c, x + 24, y - 2, 6, 4, '#222');
  R(c, x + 20, y - 22, 3, 2, Math.floor(Date.now() / 300) % 2 ? '#ff3a3a' : '#3a7aff');
}
export function drawTitle(c, t, lb, describeFn, fmt, lk = {}, touch = false) {
  if (!frame(c, 'background', 0, W, H, 0, 0)) { R(c, 0, 0, W, H, '#0c0c1e');
  for (let i = 0; i < 40; i++) R(c, (i * 97) % W, (i * 53) % H, 1, 1, '#2a2a4a'); }
  const bob = Math.round(Math.sin(t * 3) * 2);
  text(c, 'INU', W / 2 + 2, 14 + bob, '#8a2838', 'center', 28); text(c, 'INU', W / 2, 12 + bob, '#f0c840', 'center', 28);
  text(c, 'RESCUE', W / 2 + 2, 42 + bob, '#8a2838', 'center', 24); text(c, 'RESCUE', W / 2, 40 + bob, '#e05a6a', 'center', 24);
  // vignette: cat + pup + inu
  R(c, 20, 104, 216, 5, '#7a4a22'); R(c, 20, 104, 216, 1, '#a8703a');
  drawCat(c, { x: 60, y: 104 }, Math.floor(t * 2) % 2, t, false);
  if (!frame(c, 'pup_sheet', Math.floor(t * 2) % 2, 9, 10, 110, 94)) drawSprite(c, SPR.pup, 110, 94);
  if (lk.shiba) lk.shiba.draw(c, 186, 104, { scale: 0.5, shadow: false, face: 'left', frame: Math.floor(t * 8) % 4 });
  else if (!frame(c, 'hero_sheet', HERO.run[Math.floor(t * 8) % 4], 12, 16, 180, 88, true)) drawSprite(c, SPR.inuWalk1, 180, 88, true);
  drawGear(c, lk, 186, 104, -1, !!lk.shiba);
  if (lk.van) drawVan(c, 200, 104, lk.van.color);
  if (lk.shiba) text(c, 'RESCUER: ' + String(lk.shiba.profile?.name || 'SHIBA').toUpperCase().slice(0, 12), W / 2, 70, '#7ae07a', 'center', 7);
  drawHazard(c, { kind: 'yarn', x: 140 + (t * 30) % 30, y: 104, r: 5, rot: t * 8 });
  text(c, 'A grumpy cat stole the pup!', W / 2, 118, '#ddd', 'center', 7);
  text(c, 'TOP RESCUERS', W / 2, 132, '#5ad0d8', 'center');
  if (!lb.length) text(c, 'no runs yet', W / 2, 146, '#777', 'center', 7);
  lb.slice(0, 5).forEach((e, i) => text(c, `${i + 1}. ${e.name} S${e.stage} H${String(e.height).padStart(3)} ${fmt(e.timeMs)}`, 34, 144 + i * 10, i ? '#ccc' : '#f0c840', 'left', 7));
  if (Math.floor(t * 2) % 2 === 0) text(c, 'PRESS ENTER / TAP START', W / 2, 202, '#fff', 'center');
  text(c, touch ? 'TAP JUMP TO START  D-PAD move  JUMP jump' : 'ARROWS/WASD move  SPACE jump  P pause', W / 2, 216, '#888', 'center', 6);
  text(c, 'an original Inu platform rescue', W / 2, 228, '#555', 'center', 6);
}

let lastAnim = null, stillFrames = 99; export let heroFrame = 0;
