// Ambient life: background creatures, NPC motion, time-of-day tint and weather. PURELY DECORATIVE.
// Never reads input, never writes to the game state `g`, never collides. Everything here is drawn BEFORE the platforms,
// ladders, pickups, cat, hazards (incl. tin warnings) and the player, so it can never hide or recolour a hazard.
// Capped (creatures + particles) and lighter still in reduced-effects mode; its clock only advances while frames render.
import { W, H, mulberry32 } from './engine.js';
export const CAPS = Object.freeze({ full: { creatures: 8, particles: 48 }, reduced: { creatures: 3, particles: 12 } });
const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
export function createAmbient(seed = 1) { return { t: 0, key: null, items: [], parts: [], rng: mulberry32(seed | 0 || 1), cond: { time: 'day', weather: {} }, reduced: false, theme: 'title', windows: null }; }
export const weatherOf = (A) => (A.theme === 'title' ? A.cond.titleWeather || 'clear' : A.cond.weather?.[A.theme] || 'clear');
// ---- spawn per stage ----
function plan(theme, time, crowd = 1, birds = 1) {
  const night = time === 'night', L = [];
  const add = (k, n) => { for (let i = 0; i < n; i++) L.push(k); };
  if (theme === 'tree') { if (night) add('firefly', 5); else { add('bird', 2 + birds); add('squirrel', 1); } }
  else if (theme === 'roof') { add('window', 3); add('pigeon', night ? 1 : 2 + birds); }
  else if (theme === 'truck') { add('ped', 3); add('car', 2); add('window', 2); }
  else if (theme === 'park') { add('walker', 1 + crowd); if (night) add('firefly', 3); else { add('bird', birds); add('butterfly', 1); } }
  else { add('pigeon', 2 + birds); }
  return L;
}
const SIDEWALK = 100, ROAD = 108, PATH = 210;
const PED_COLS = ['#6a5a8a', '#8a4a4a', '#4a6a8a', '#7a7a4a', '#5a7a5a'], CAR_COLS = ['#c84a4a', '#4a7ac8', '#d8c84a', '#8a8a9a'], DOG_COLS = ['#d9893b', '#f0e4cc', '#3a2a22', '#a86a3a'];
function spawn(A, k, i) {
  const r = A.rng, dir = r() < 0.5 ? -1 : 1, x = r() * W;
  switch (k) {
    case 'bird': case 'pigeon': return { k, x, y: 30 + r() * 60, vx: dir * (14 + r() * 12), ph: r() * 6, col: k === 'pigeon' ? '#9a9aaa' : '#2a2a3a' };
    case 'squirrel': return { k, x: 120 + r() * 10, y: 120 + r() * 80, vy: -18, wait: 0, ph: 0 };
    case 'firefly': return { k, x: 20 + r() * (W - 40), y: 40 + r() * 170, ph: r() * 6, sx: r() * 6, sy: r() * 6 };
    case 'butterfly': return { k, x, y: 150 + r() * 40, ph: r() * 6, vx: dir * 8 };
    case 'ped': return { k, x, vx: dir * (5 + r() * 5), col: PED_COLS[(r() * PED_COLS.length) | 0], ph: r() * 6, tall: r() < 0.3 ? 1 : 0 };
    case 'car': return { k, x, vx: dir * (26 + r() * 18), col: CAR_COLS[(r() * CAR_COLS.length) | 0] };
    case 'walker': return { k, x: 40 + r() * 170, vx: dir * (5 + r() * 3), col: PED_COLS[(r() * PED_COLS.length) | 0], dog: DOG_COLS[(r() * DOG_COLS.length) | 0], ph: r() * 6, sniff: 0 };
    case 'window': return { k, slot: i, w: null, x: 0, vx: (r() < 0.5 ? -1 : 1) * (1.5 + r()), wait: r() * 3, off: 0 };
  }
}
/** (Re)build the scene for a stage theme ('tree'|'roof'|'truck'|'park'|'title'). Cheap; call when the stage changes. */
export function setScene(A, theme, cond = A.cond, { reduced = A.reduced, plats = null } = {}) {
  A.theme = theme; A.cond = cond; A.reduced = reduced; const cap = CAPS[reduced ? 'reduced' : 'full'];
  A.items = plan(theme, theme === 'title' ? 'day' : cond.time, cond.crowd, cond.birds).slice(0, cap.creatures).map((k, i) => spawn(A, k, i));
  A.parts = []; A.windows = theme === 'roof' && plats ? roofWindows(plats) : theme === 'truck' ? truckWindows(cond.time) : null;
  A.key = theme + '|' + cond.time + '|' + weatherOf(A) + '|' + reduced;
}
// lit windows actually visible on the rooftop building fronts (same grid + draw order as render.js drawPlat 'body')
export function roofWindows(plats) {
  const order = [...plats].sort((a, b) => a.y1 - b.y1), out = [];
  order.forEach((pl, i) => { const x = Math.round(pl.x1), w = Math.round(pl.x2 - pl.x1), y = Math.round(pl.y1);
    for (let yy = y + 10; yy < H; yy += 14) for (let xx = x + 4; xx < x + w - 6; xx += 12) { if ((xx * 7 + yy) % 5) continue;
      const hidden = order.slice(i + 1).some(q => { const qx = Math.round(q.x1), qw = Math.round(q.x2 - q.x1), qy = Math.round(q.y1); return xx + 5 > qx && xx < qx + qw && yy + 6 > qy; });
      if (!hidden) out.push({ x: xx, y: yy, w: 5, h: 6 }); } });
  return out;
}
function truckWindows(time) { const out = [], lit = time === 'night' ? 3 : time === 'day' ? 7 : 4;
  for (let b = 0; b < 6; b++) for (let col = 0; col < 3; col++) for (let row = 0; row < 6; row++) if (((b * 31 + col * 7 + row * 13) % lit) === 0) out.push({ x: 14 + b * 44 + col * 8, y: 36 + row * 10, w: 5, h: 6 });
  return out; }
/** Advance the ambient clock (seconds). Never touches the game. */
export function updateAmbient(A, dt) {
  dt = Math.max(0, Math.min(0.1, dt || 0)); A.t += dt; const r = A.rng;
  for (const o of A.items) {
    if (o.k === 'bird' || o.k === 'pigeon') { o.x += o.vx * dt; o.ph += dt * 10; o.y += Math.sin(A.t * 1.3 + o.ph) * dt * 4;
      if (o.x < -12 || o.x > W + 12) { o.vx = -o.vx; o.x = o.vx > 0 ? -10 : W + 10; o.y = 30 + r() * 60; } }
    else if (o.k === 'squirrel') { if (o.wait > 0) { o.wait -= dt; continue; } o.y += o.vy * dt; o.ph += dt * 12;
      if (o.y < 70 || o.y > 225 || r() < dt * 0.4) { o.vy = o.y < 70 ? 18 : o.y > 225 ? -18 : -o.vy; o.wait = 0.6 + r() * 1.5; } }
    else if (o.k === 'firefly') { o.ph += dt; o.x += Math.sin(o.ph * 0.7 + o.sx) * dt * 6; o.y += Math.cos(o.ph * 0.5 + o.sy) * dt * 4; }
    else if (o.k === 'butterfly') { o.ph += dt * 14; o.x += o.vx * dt; o.y += Math.sin(A.t * 2 + o.ph * 0.1) * dt * 8; if (o.x < -6 || o.x > W + 6) o.vx = -o.vx; }
    else if (o.k === 'ped' || o.k === 'car') { o.x += o.vx * dt; if (o.ph !== undefined) o.ph += dt * 8; if (o.x < -16) o.x = W + 14; else if (o.x > W + 16) o.x = -14; }
    else if (o.k === 'walker') { if (o.sniff > 0) { o.sniff -= dt; continue; } o.x += o.vx * dt; o.ph += dt * 7;
      if (o.x < 30 || o.x > 226) o.vx = -o.vx; if (r() < dt * 0.15) o.sniff = 1 + r() * 1.5; }
    else if (o.k === 'window' && A.windows?.length) { if (!o.w || o.wait > 0) { o.wait -= dt; if (o.wait <= 0 || !o.w) { o.w = A.windows[(r() * A.windows.length) | 0]; o.off = o.vx > 0 ? -3 : o.w.w + 1; o.wait = 0; } }
      else { o.off += o.vx * dt; if (o.off > o.w.w + 2 || o.off < -4) { o.w = null; o.wait = 1 + r() * 3; } } }
  }
  // weather particles (capped)
  const wx = weatherOf(A), cap = CAPS[A.reduced ? 'reduced' : 'full'].particles;
  for (const p of A.parts) { p.y += p.vy * dt; p.x += p.vx * dt + (p.sway ? Math.sin(A.t * 2 + p.sway) * dt * 10 : 0); }
  A.parts = A.parts.filter(p => p.y < H + 4 && p.x > -6 && p.x < W + 6);
  const want = wx === 'rain' ? cap : wx === 'leaves' ? Math.min(14, cap) : 0;
  while (A.parts.length < want) A.parts.push(wx === 'rain' ? { k: 'rain', x: r() * (W + 40), y: -r() * H, vx: -24, vy: 170 + r() * 40 }
    : { k: 'leaf', x: r() * W, y: -r() * H * 0.5 - 4, vx: -4 + r() * 4, vy: 10 + r() * 10, sway: r() * 6, col: ['#d8822a', '#c8a030', '#a84a2a', '#6aa040'][(r() * 4) | 0] });
}
// ---- drawing (all behind the playfield) ----
const disc = (c, x, y, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); };
const SKY = { dawn: ['#3a3a6a', '#e09a7a'], day: ['#5a9ad8', '#b8dcf0'], dusk: ['#2a2a5a', '#e0703a'] };
/** Behind-the-playfield creatures + sky pieces. Call right after the stage backdrop. */
export function drawBack(c, A) {
  const th = A.theme, time = A.cond.time, t = A.t;
  if (th === 'roof' && time !== 'night') { // the rooftop art is a night sky: paint a sky for the run's time of day + far skyline
    const s = SKY[time], gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, s[0]); gr.addColorStop(1, s[1]); c.fillStyle = gr; c.fillRect(0, 0, W, H);
    disc(c, 216, 32, 9, time === 'day' ? '#fff3b0' : '#ffb070');
    for (let i = 0; i < 9; i++) R(c, i * 30 - 4, 150 + ((i * 37) % 30), 26, H, '#3a3a5a'); }
  if (th === 'tree') { disc(c, 242, 98, 5, time === 'night' ? '#f0f0d0' : time === 'day' ? '#fff3b0' : '#ffb070'); if (time === 'night') disc(c, 245, 96, 4, '#1a2a4a'); }
  if (th === 'truck') { R(c, 0, SIDEWALK, W, 3, '#2a2238'); R(c, 0, ROAD, W, 6, '#24182e'); for (let x = (-t * 12) % 16; x < W; x += 16) R(c, x, ROAD + 3, 6, 1, '#3a3048'); }
  if (th === 'park') { c.fillStyle = '#356a3a'; c.beginPath(); c.ellipse(128, PATH + 26, 150, 30, 0, Math.PI, 0); c.fill(); R(c, 20, PATH, 216, 1, '#4a7a4a'); }
  for (const o of A.items) {
    const x = Math.round(o.x);
    if (o.k === 'bird' || o.k === 'pigeon') { const y = Math.round(o.y), up = Math.floor(o.ph) % 2;
      R(c, x - 1, y, 3, 1, o.col); R(c, x - 3, y - (up ? 1 : -1), 2, 1, o.col); R(c, x + 2, y - (up ? 1 : -1), 2, 1, o.col);
      if (o.k === 'pigeon') R(c, x + (o.vx > 0 ? 2 : -2), y - 1, 1, 1, '#c8c8d8'); }
    else if (o.k === 'squirrel') { const y = Math.round(o.y), f = o.vy < 0 ? -1 : 1; R(c, x, y, 3, 5, '#b06a3a'); R(c, x, y + (f < 0 ? -2 : 5), 3, 2, '#c87a4a');
      R(c, x + 3, y + (f < 0 ? 3 : -2), 2, 4, '#d08a5a'); if (Math.floor(o.ph) % 2) R(c, x - 1, y + 2, 1, 1, '#b06a3a'); }
    else if (o.k === 'butterfly') { const y = Math.round(o.y), op = Math.floor(o.ph) % 2; R(c, x, y, 1, 2, '#3a2a2a'); R(c, x - (op ? 2 : 1), y, op ? 2 : 1, 2, '#f0a0d0'); R(c, x + 1, y, op ? 2 : 1, 2, '#f0a0d0'); }
    else if (o.k === 'ped') { const y = SIDEWALK, s = Math.floor(o.ph) % 2, h = 5 + o.tall;
      R(c, x, y - h - 2, 2, 2, '#e0b090'); R(c, x, y - h, 2, h - 2, o.col); R(c, x - (s ? 0 : 1), y - 2, 1, 2, '#2a2a3a'); R(c, x + 1 + (s ? 1 : 0), y - 2, 1, 2, '#2a2a3a');
      if (weatherOf(A) === 'rain') { R(c, x - 2, y - h - 4, 6, 1, o.col); R(c, x + 1, y - h - 3, 1, 2, '#888'); } }
    else if (o.k === 'car') { const y = ROAD, f = o.vx > 0 ? 1 : -1; R(c, x - 6, y - 4, 12, 3, o.col); R(c, x - 3, y - 6, 6, 2, o.col); R(c, x - 2, y - 6, 4, 1, '#8ad0f0');
      R(c, x - 5, y - 1, 2, 1, '#111'); R(c, x + 3, y - 1, 2, 1, '#111'); }
    else if (o.k === 'walker') { const y = PATH, f = o.vx > 0 ? 1 : -1, s = o.sniff > 0 ? 0 : Math.floor(o.ph) % 2, dx = x + f * 9;
      R(c, x, y - 9, 2, 2, '#e0b090'); R(c, x, y - 7, 2, 5, o.col); R(c, x - (s ? 0 : 1), y - 2, 1, 2, '#2a2a3a'); R(c, x + 1 + s, y - 2, 1, 2, '#2a2a3a');
      c.strokeStyle = '#c8c8c8'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 1 + f, y - 5.5); c.lineTo(dx, y - 3.5); c.stroke();
      R(c, dx - 2, y - 4, 5, 2, o.dog); R(c, dx + (f > 0 ? 2 : -3), y - 5 - (o.sniff > 0 ? -2 : 0), 2, 2, o.dog); R(c, dx - 2 + (s ? 1 : 0), y - 2, 1, 2, o.dog); R(c, dx + 1 - (s ? 1 : 0), y - 2, 1, 2, o.dog);
      R(c, dx + (f > 0 ? -3 : 3), y - 5 + (Math.floor(A.t * 6) % 2), 1, 2, o.dog); }
  }
}
// time-of-day tint over the BACKDROP only (drawn before the playfield, so hazards and platforms keep their colours)
export const TINTS = { dawn: [['source-over', '#ff9a7a', 0.12]], day: [['screen', '#18304a', 1]], dusk: [['source-over', '#ff6a2a', 0.12], ['source-over', '#3a1060', 0.14]], night: [['source-over', '#02041a', 0.45]] };
export function drawTint(c, A) {
  if (A.theme === 'title') return;
  for (const [op, col, a] of TINTS[A.cond.time] || []) { c.save(); c.globalCompositeOperation = op; c.globalAlpha = a; c.fillStyle = col; c.fillRect(0, 0, W, H); c.restore(); }
}
/** Lights + glows that read through the tint (truck windows/headlights, fireflies), then weather. Still behind the playfield. */
export function drawGlow(c, A) {
  const night = A.cond.time === 'night' || A.cond.time === 'dusk', t = A.t;
  if (A.theme === 'truck' && A.windows) { for (const w of A.windows) R(c, w.x, w.y, w.w, w.h, night ? '#f0c860' : '#c8b070'); drawSilhouettes(c, A); }
  for (const o of A.items) {
    if (o.k === 'car' && night) { const f = o.vx > 0 ? 1 : -1; R(c, o.x + f * 6 - (f < 0 ? 1 : 0), ROAD - 4, 1, 1, '#fff6c0'); R(c, o.x - f * 6 - (f > 0 ? 1 : 0), ROAD - 4, 1, 1, '#ff3a3a'); }
    if (o.k === 'firefly' && Math.sin(t * 3 + o.ph * 5) > 0.2) { R(c, o.x, o.y, 1, 1, '#f0f070'); if (!A.reduced) { c.globalAlpha = 0.3; R(c, o.x - 1, o.y - 1, 3, 3, '#f0f070'); c.globalAlpha = 1; } }
  }
  for (const p of A.parts) { if (p.k === 'rain') { c.globalAlpha = 0.5; R(c, p.x, p.y, 1, 4, '#b8d0f0'); c.globalAlpha = 1; } else R(c, p.x, p.y, 2, 1 + (Math.floor(t * 3 + p.sway) % 2), p.col); }
}
function drawSilhouettes(c, A) {
  for (const o of A.items) if (o.k === 'window' && o.w && o.wait <= 0) { const w = o.w, x = Math.round(w.x + o.off);
    c.save(); c.beginPath(); c.rect(w.x, w.y, w.w, w.h); c.clip(); R(c, x, w.y + 3, 3, 3, '#2a1a20'); R(c, x + 1, w.y + 1, 2, 2, '#2a1a20'); c.restore(); }
}
/** Rooftop building fronts: people passing lit windows. Drawn after the building bodies, before the roof edges. */
export function drawMid(c, A) { if (A.theme === 'roof' && A.windows) drawSilhouettes(c, A); }
export const counts = (A) => ({ creatures: A.items.length, particles: A.parts.length });
