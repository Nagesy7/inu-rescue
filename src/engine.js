// Inu Rescue — pure game logic (no DOM). Runs in browser and in Node tests.
export const W = 256, H = 240, DT = 1 / 60;
export const PHYS = { walk: 54, climb: 38, jumpVy: -132, grav: 430, jumpVx: 54, maxDrop: 40, roll: 62, flea: 26 };

// Roller speed: slower than walking (54px/s) on stage 1, ramping per stage and loop.
export function rollSpeed(g) { return Math.min(PHYS.roll + 8 * g.loop, 40 + 7 * g.stage + 8 * g.loop); }
export function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- stage data ----------
// Original Inu layouts: flat timber/branch/roof platforms (no sloped zig-zag tower), a pup caged MID-stage that must be
// freed before the exit opens, a villain cat that roams between perches, and a final park stage with three kennels.
const P = (x1, y1, x2, y2, extra = {}) => ({ x1, y1, x2, y2, ...extra });
export const STAGES = [
  { name: 'TREEHOUSE CLIMB', theme: 'tree', hazards: ['yarn'], spawn: 2.4,
    plats: [P(0,232,256,232), P(16,196,128,196), P(150,196,240,196), P(40,160,216,160), P(0,124,100,124), P(124,124,240,124),
            P(30,88,200,88), P(70,52,186,52)],
    ladders: [{x:110,top:1,bot:0},{x:220,top:2,bot:0},{x:60,top:3,bot:1},{x:200,top:3,bot:2},{x:80,top:4,bot:3},{x:180,top:5,bot:3},
              {x:50,top:6,bot:4},{x:150,top:6,bot:5},{x:100,top:7,bot:6}],
    hammers: [{x:30,p:1},{x:226,p:5}], toys: [{x:230,p:2,k:'bow'},{x:16,p:4,k:'bag'}],
    start: {x:40,p:0}, checkpoint: {x:128,p:3}, pups: [{x:150,p:3}], exit: {x:176,p:7},
    perches: [{x:90,p:7},{x:186,p:6},{x:120,p:6},{x:150,p:7}], movers: [], fleaSpots: [] },
  { name: 'ROOFTOP CHASE', theme: 'roof', hazards: ['tin', 'yarn'], spawn: 1.9,
    plats: [P(0,232,70,232), P(86,220,170,220), P(186,208,256,208), P(150,172,256,172), P(70,160,134,160), P(0,146,50,146),
            P(20,108,120,108), P(136,96,212,96), P(150,56,250,56)],
    ladders: [{x:236,top:3,bot:2},{x:30,top:6,bot:5},{x:200,top:8,bot:7}],
    hammers: [{x:200,p:3}], toys: [{x:240,p:3,k:'bow'},{x:40,p:6,k:'bag'}],
    start: {x:20,p:0}, checkpoint: {x:110,p:4}, pups: [{x:84,p:4}], exit: {x:240,p:8},
    perches: [{x:170,p:8},{x:60,p:6},{x:230,p:8},{x:180,p:7}], movers: [], fleaSpots: [] },
  { name: 'DELIVERY RUN', theme: 'truck', hazards: ['tin', 'tin', 'yarn'], spawn: 2.8,
    plats: [P(0,232,60,232), P(200,200,256,200), P(150,150,256,150), P(0,148,40,148), P(0,100,90,100), P(196,76,256,76)],
    ladders: [{x:240,top:2,bot:1},{x:20,top:4,bot:3}],
    hammers: [{x:240,p:2}], toys: [{x:20,p:0,k:'bow'},{x:60,p:4,k:'bag'}],
    start: {x:20,p:0}, checkpoint: {x:220,p:2}, pups: [{x:180,p:2}], exit: {x:240,p:5},
    perches: [{x:230,p:5},{x:50,p:4},{x:220,p:5}], fleaSpots: [],
    movers: [{kind:'truck',y:216,min:52,max:160,w:48,speed:30},{kind:'truck',y:164,min:30,max:124,w:44,speed:26,phase:0.5},
             {kind:'truck',y:92,min:84,max:166,w:40,speed:28,phase:0.25}] },
  { name: 'DOG PARK', theme: 'park', hazards: ['yarn'], spawn: 2.8, final: true,
    plats: [P(0,220,92,220), P(164,220,256,220), P(0,160,70,160), P(186,160,256,160), P(104,136,152,136)],
    ladders: [{x:30,top:2,bot:0},{x:226,top:3,bot:1}],
    hammers: [{x:70,p:0}], toys: [{x:200,p:1,k:'bow'},{x:128,p:4,k:'bag'}],
    start: {x:20,p:0}, pups: [{x:14,p:2},{x:242,p:3},{x:128,p:4}], exit: null,
    perches: [{x:60,y:60},{x:196,y:60},{x:128,y:60}],
    movers: [{kind:'rope',px:128,py:190,L:40,amp:0.75,period:2.6,w:22},{kind:'rope',px:82,py:118,L:40,amp:0.7,period:2.4,w:22,phase:0.5},
             {kind:'rope',px:174,py:118,L:40,amp:0.7,period:2.4,w:22}],
    fleaSpots: [{x:40,p:0},{x:220,p:1}] },
];
export function surfaceY(pl, x) { return pl.x2 === pl.x1 ? pl.y1 : pl.y1 + (pl.y2 - pl.y1) * (x - pl.x1) / (pl.x2 - pl.x1); }
export function ladderEnds(g, L) { return { top: surfaceY(g.plats[L.top], L.x), bot: surfaceY(g.plats[L.bot], L.x) }; }

export function allPlats(g) { return g.plats.concat(g.lifts); }
export function findGround(g, x, y, up = 4, down = 4) {
  let best = null, bd = 1e9;
  for (const pl of allPlats(g)) {
    if (x < pl.x1 || x > pl.x2) continue;
    const sy = surfaceY(pl, x);
    if (sy >= y - up && sy <= y + down && Math.abs(sy - y) < bd) { bd = Math.abs(sy - y); best = { pl, sy }; }
  }
  return best;
}
function landCross(g, x, prevY, y) {
  let best = null;
  for (const pl of allPlats(g)) {
    if (x < pl.x1 || x > pl.x2) continue;
    const sy = surfaceY(pl, x);
    if (prevY <= sy + 0.5 && y >= sy && (!best || sy < best.sy)) best = { pl, sy };
  }
  return best;
}

// ---------- scoring ----------
export const POINTS = { jump: 100, multiJump: 300, toy: 300, pup: 1000, smash: [300, 500, 800], extraLifeAt: 10000 };
export function addScore(g, n, x, y) {
  const before = g.score; g.score += n;
  if (before < POINTS.extraLifeAt && g.score >= POINTS.extraLifeAt) { g.lives++; g.events.push('extralife'); }
  if (x !== undefined) g.popups.push({ x, y, text: String(n), t: 1 });
}
export function insertHighScore(table, name, score, max = 5) {
  const t = table.concat([{ name: String(name).slice(0, 8).toUpperCase(), score }]);
  t.sort((a, b) => b.score - a.score); return t.slice(0, max);
}
export function qualifies(table, score, max = 5) { return score > 0 && (table.length < max || score > table[table.length - 1].score); }

// ---------- game ----------
export function createGame(opts = {}) {
  const g = { rng: mulberry32(opts.seed ?? 1234), score: 0, lives: opts.lives ?? 3, stage: opts.stage ?? 0, loop: 0, saved: 0,
    mode: 'intro', timer: 1.5, events: [], popups: [], t: 0, runTime: 0, height: 0 };
  loadStage(g); return g;
}
const at = (g, o) => ({ x: o.x, y: o.p !== undefined ? surfaceY(g.plats[o.p], o.x) : o.y });
export function loadStage(g, respawn = false) {
  const S = STAGES[g.stage];
  if (!respawn) { g.cp = false; g.height = 0; g.freed = S.pups.map(() => false); }
  g.S = S; g.plats = S.plats.map(p => ({ ...p })); g.lifts = []; g.t = 0;
  g.bonus = 5000 + 1000 * Math.min(g.loop, 3); g.bonusClock = 0;
  const st = g.cp && S.checkpoint ? S.checkpoint : S.start, pl = g.plats[st.p];
  g.player = { x: st.x, y: surfaceY(pl, st.x), vx: 0, vy: 0, state: 'walk', face: 1, anim: 0, jumpId: 0, takeoffY: 0, lad: null, hammer: 0, ride: null };
  g.hazards = []; g.fleas = []; g.spawnT = 1.4; g.fleaT = 4; g.convT = 0;
  g.hammers = S.hammers.map(h => ({ x: h.x, y: surfaceY(g.plats[h.p], h.x) - 14, taken: false }));
  g.toys = S.toys.map(t => ({ x: t.x, y: surfaceY(g.plats[t.p], t.x), k: t.k, taken: false }));
  g.pups = S.pups.map((q, i) => ({ ...at(g, q), freed: g.freed[i] }));
  g.pup = g.pups[0]; // first caged pup (render/tests)
  g.exit = S.exit ? at(g, S.exit) : null;
  g.perch = 0; const c0 = at(g, S.perches[0]);
  g.cat = { x: c0.x, y: c0.y, throwT: 0, fallen: false, hop: null, dir: 1, nextHop: 5 };
  updateLifts(g);
}
// moving platforms: delivery-truck roofs (back and forth) and swinging rope seats (pendulum)
export function moverPos(m, t) {
  if (m.kind === 'truck') { const span = m.max - m.min, per = 2 * span / m.speed; let u = ((t / per + (m.phase || 0)) % 1 + 1) % 1;
    const x1 = m.min + span * (u < 0.5 ? u * 2 : 2 - u * 2); return { x1, x2: x1 + m.w, y: m.y }; }
  const th = m.amp * Math.sin(2 * Math.PI * (t / m.period + (m.phase || 0))), sx = m.px + m.L * Math.sin(th), sy = m.py + m.L * Math.cos(th);
  return { x1: sx - m.w / 2, x2: sx + m.w / 2, y: sy };
}
function updateLifts(g) {
  g.lifts = g.S.movers.map(m => { const a = moverPos(m, g.t), b = moverPos(m, g.t - DT);
    return { x1: a.x1, x2: a.x2, y1: a.y, y2: a.y, mover: m.kind, m, dx: a.x1 - b.x1, dy: a.y - b.y }; });
}

export function ladderUp(g, x, y) {
  for (const L of g.S.ladders) { const e = ladderEnds(g, L); if (Math.abs(L.x - x) < 5 && y >= e.top + 1 && y <= e.bot + 3) return L; }
  return null;
}
export function ladderDown(g, x, y) {
  for (const L of g.S.ladders) { const e = ladderEnds(g, L); if (Math.abs(L.x - x) < 5 && Math.abs(e.top - y) <= 3) return L; }
  return null;
}

export function killPlayer(g, why) {
  if (g.mode !== 'play') return;
  g.mode = 'dying'; g.timer = 1.6; g.deathCause = why; g.player.state = 'dead'; g.events.push('die');
}

function stepPlayer(g, inp) {
  const p = g.player, dt = DT;
  if (p.hammer > 0) { p.hammer -= dt; if (p.hammer <= 0) { p.hammer = 0; g.events.push('hammerend'); } }
  // ride a truck roof / rope seat: carried by its motion
  if (p.state === 'walk' && p.ride) { const l = g.lifts.find(q => q.m === p.ride);
    if (l && p.x >= l.x1 - 1 - Math.abs(l.dx) && p.x <= l.x2 + 1 + Math.abs(l.dx)) { p.x = Math.max(6, Math.min(W - 6, p.x + l.dx)); p.y = l.y1; } }
  const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  if (p.state === 'walk') {
    if (dir) p.face = dir;
    if (!p.hammer && inp.up) { const L = ladderUp(g, p.x, p.y); if (L) { p.state = 'climb'; p.lad = L; p.x = L.x; p.ride = null; return; } }
    if (!p.hammer && inp.down) { const L = ladderDown(g, p.x, p.y); if (L) { p.state = 'climb'; p.lad = L; p.x = L.x; p.y += 1; p.ride = null; return; } }
    if (!p.hammer && inp.jump) {
      const rl = p.ride && g.lifts.find(q => q.m === p.ride); // keep the truck/rope momentum when jumping off it
      p.state = 'air'; p.vy = PHYS.jumpVy + (rl ? Math.min(0, rl.dy / DT) : 0); p.vx = dir * PHYS.jumpVx + (rl ? rl.dx / DT : 0); p.takeoffY = p.y; p.jumpId++; p.jumpCount = 0; p.ride = null; g.events.push('jump'); return;
    }
    p.x = Math.max(6, Math.min(W - 6, p.x + dir * PHYS.walk * dt));
    if (dir) p.anim += dt;
    const gr = findGround(g, p.x, p.y, 4, 4);
    if (gr) { p.y = gr.sy; p.ride = gr.pl.mover ? gr.pl.m : null; } else { p.state = 'air'; p.vy = 0; p.vx = 0; p.takeoffY = p.y; p.ride = null; }
  } else if (p.state === 'air') {
    p.vy += PHYS.grav * dt; const py = p.y;
    p.x += p.vx * dt; if (p.x < 6 || p.x > W - 6) { p.x = Math.max(6, Math.min(W - 6, p.x)); p.vx = -p.vx; }
    p.y += p.vy * dt;
    if (p.vy > 0) {
      const l = landCross(g, p.x, py, p.y);
      if (l) { p.y = l.sy; p.state = 'walk'; p.ride = l.pl.mover ? l.pl.m : null; if (p.y - p.takeoffY > PHYS.maxDrop) killPlayer(g, 'fall'); else g.events.push('land'); }
    }
    if (p.y > H + 20) killPlayer(g, 'fall');
  } else if (p.state === 'climb') {
    const e = ladderEnds(g, p.lad);
    if (inp.up) { p.y -= PHYS.climb * dt; p.anim += dt; }
    else if (inp.down) { p.y += PHYS.climb * dt; p.anim += dt; }
    if (p.y <= e.top) { p.y = e.top; p.state = 'walk'; p.lad = null; }
    else if (p.y >= e.bot) { p.y = e.bot; p.state = 'walk'; p.lad = null; }
  }
}

// ---------- villain: the cat roams between perches (hops in an arc), paces on its perch, and lobs hazards ----------
function stepCat(g) {
  const c = g.cat, S = g.S, dt = DT;
  c.throwT = Math.max(0, c.throwT - dt);
  if (c.hop) { c.hop.t += dt / c.hop.dur; const u = Math.min(1, c.hop.t);
    c.x = c.hop.x0 + (c.hop.x1 - c.hop.x0) * u; c.y = c.hop.y0 + (c.hop.y1 - c.hop.y0) * u - Math.sin(u * Math.PI) * 26;
    if (u >= 1) { c.hop = null; g.events.push('land'); } return; }
  c.nextHop -= dt;
  if (c.nextHop <= 0 && S.perches.length > 1) {
    g.perch = (g.perch + 1) % S.perches.length; const d = at(g, S.perches[g.perch]);
    c.hop = { x0: c.x, y0: c.y, x1: d.x, y1: d.y, t: 0, dur: 0.9 }; c.nextHop = Math.max(3.5, 7 - g.loop) + g.rng() * 2; g.events.push('cathop'); return; }
  // pace a little around the perch
  const home = at(g, S.perches[g.perch]); c.x += c.dir * 14 * dt; if (Math.abs(c.x - home.x) > 12) c.dir = -Math.sign(c.x - home.x);
  const pl = S.perches[g.perch].p; if (pl !== undefined) { const p = g.plats[pl]; c.x = Math.max(p.x1 + 6, Math.min(p.x2 - 6, c.x)); c.y = surfaceY(p, c.x); }
}
function spawnHazard(g) {
  const S = g.S, c = g.cat, lv = g.loop, p = g.player;
  const kind = S.hazards[Math.floor(g.rng() * S.hazards.length)];
  if (kind === 'yarn') {
    if (c.hop) return;
    const d = Math.sign(p.x - c.x) || 1;
    g.hazards.push({ kind: 'yarn', big: true, x: c.x + d * 10, y: c.y - 14, vx: d * (rollSpeed(g) * 0.8), vy: -60, state: 'fall', r: 5, rot: 0, jumpId: -1, tried: new Set(), fromPl: null });
    c.throwT = 0.5; g.events.push('throw');
  } else if (kind === 'tin') {
    // a tin of dog food tipped off the roof edge above: shadow warning first, then it drops straight down
    const x = Math.max(10, Math.min(W - 10, p.x + (g.rng() * 2 - 1) * (36 - Math.min(20, lv * 6))));
    g.hazards.push({ kind: 'tin', x, y: 16, vx: 0, vy: 0, state: 'warn', warn: Math.max(0.55, 0.9 - 0.1 * lv), r: 5, rot: 0, jumpId: -1, tried: new Set() });
  }
}
export function stepHazard(g, b) {
  const dt = DT;
  b.rot += (b.vx || 2) * dt / 5;
  if (b.state === 'warn') { b.warn -= dt; if (b.warn <= 0) { b.state = 'drop'; g.events.push('tin'); } return; }
  if (b.state === 'drop') { const py = b.y; b.vy += PHYS.grav * 0.8 * dt; b.y += b.vy * dt;
    const l = landCross(g, b.x, py, b.y); if (l && l.sy > 30) { b.y = l.sy; b.state = 'clank'; b.t = 0.35; g.events.push('clank'); } return; }
  if (b.state === 'clank') { b.t -= dt; if (b.t <= 0) b.dead = true; return; }
  if (b.state === 'roll') {
    const gr = findGround(g, b.x, b.y, 3, 3);
    if (!gr) { b.state = 'fall'; b.vy = 0; return; }
    const pl = gr.pl;
    if (pl.mover) b.x += pl.dx;
    for (const L of g.S.ladders) {
      if (g.plats[L.top] !== pl || b.tried.has(L) || Math.abs(L.x - b.x) > 1.6) continue;
      b.tried.add(L);
      const chase = g.player.y > b.y ? 0.15 : 0;
      if (g.rng() < 0.2 + 0.06 * g.loop + chase) { b.state = 'ladder'; b.lad = L; b.x = L.x; g.events.push('ladderroll'); return; }
    }
    b.x += b.vx * dt;
    if (b.x < pl.x1 || b.x > pl.x2) { b.state = 'fall'; b.vy = 0; b.fromPl = pl; }
    else b.y = surfaceY(pl, b.x);
  } else if (b.state === 'ladder') {
    const e = ladderEnds(g, b.lad); b.y += 44 * dt;
    if (b.y >= e.bot) { b.y = e.bot; b.state = 'roll'; b.vx = -b.vx || rollSpeed(g); b.tried.clear(); }
  } else { // fall
    const py = b.y; b.vy += PHYS.grav * dt; b.y += b.vy * dt; b.x += b.vx * 0.5 * dt;
    if (b.vy > 0) {
      const l = landCross(g, b.x, py, b.y);
      if (l && l.pl !== b.fromPl) {
        b.y = l.sy; b.fromPl = null; b.tried.clear();
        // big yarn balls bounce once and split into two small balls rolling apart
        if (b.big && b.vy > 90) { b.big = false; b.split = true; b.vy = -70; g.events.push('bounce'); return; }
        if (b.split) { b.split = false; b.state = 'roll'; b.r = 4; b.vy = 0; const sp = rollSpeed(g);
          b.vx = sp; g.hazards.push({ ...b, tried: new Set(), vx: -sp, jumpId: -1 }); g.events.push('split'); return; }
        b.state = 'roll'; b.vy = 0; if (!b.vx) b.vx = rollSpeed(g);
      }
    }
  }
}

function spawnFlea(g, x, y) {
  if (g.fleas.length >= g.S.fleaSpots.length + g.loop) return;
  g.fleas.push({ x, y: y, vx: g.rng() < 0.5 ? -PHYS.flea : PHYS.flea, state: 'walk', lad: null, t: g.rng() * 9, r: 4 });
  g.events.push('flea');
}
export function stepFlea(g, f) {
  const dt = DT, p = g.player; f.t += dt;
  if (f.state === 'climb') {
    const e = ladderEnds(g, f.lad); f.y += f.cdir * 20 * dt;
    if (f.y <= e.top || f.y >= e.bot) { f.y = f.cdir < 0 ? e.top : e.bot; f.state = 'walk'; f.cool = 1; }
    return;
  }
  f.cool = Math.max(0, (f.cool || 0) - dt);
  const gr = findGround(g, f.x, f.y, 4, 4);
  if (!gr) { f.y += 60 * dt; if (f.y > H + 10) f.dead = true; return; }
  f.y = gr.sy;
  if (!f.cool) for (const L of g.S.ladders) {
    if (Math.abs(L.x - f.x) > 1) continue;
    const e = ladderEnds(g, L);
    const wantUp = p.y < f.y - 4, onBot = Math.abs(e.bot - f.y) < 3, onTop = Math.abs(e.top - f.y) < 3;
    if (onBot && (wantUp ? g.rng() < 0.6 : g.rng() < 0.1)) { f.state = 'climb'; f.lad = L; f.cdir = -1; f.x = L.x; return; }
    if (onTop && (!wantUp ? g.rng() < 0.5 : g.rng() < 0.08)) { f.state = 'climb'; f.lad = L; f.cdir = 1; f.x = L.x; return; }
    f.cool = 0.3;
  }
  if (Math.abs(p.y - f.y) < 4 && g.rng() < 0.02) f.vx = Math.sign(p.x - f.x || 1) * PHYS.flea;
  const nx = f.x + f.vx * dt;
  if (nx < gr.pl.x1 + 2 || nx > gr.pl.x2 - 2 || nx < 4 || nx > W - 4) f.vx = -f.vx; else f.x = nx;
}

export function hitCircleBox(cx, cy, r, bx1, by1, bx2, by2) {
  const nx = Math.max(bx1, Math.min(cx, bx2)), ny = Math.max(by1, Math.min(cy, by2));
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}
export function playerBox(p) { return [p.x - 4, p.y - 14, p.x + 4, p.y - 1]; }
export function hammerZone(p) { return { x: p.x + p.face * 9, y: p.y - 10, r: 11 }; }
const deadly = b => b.state !== 'warn' && b.state !== 'clank';

export function freePup(g, i) {
  const q = g.pups[i]; if (!q || q.freed || g.mode !== 'play') return;
  q.freed = true; g.freed[i] = true; g.saved = (g.saved || 0) + 1; addScore(g, POINTS.pup, q.x, q.y - 20);
  g.popups.push({ x: q.x, y: q.y - 30, text: 'PUP SAVED!', t: 1.6 }); g.events.push('pup');
  if (g.S.final && g.pups.every(r => r.freed)) clearStage(g);
}
function collisions(g) {
  const p = g.player, box = playerBox(p);
  for (const h of g.hammers) if (!h.taken && Math.abs(h.x - p.x) < 8 && Math.abs(h.y + 4 - (p.y - 8)) < 12 && p.state !== 'climb') {
    h.taken = true; p.hammer = 9; g.events.push('hammer');
  }
  for (const t of g.toys) if (!t.taken && Math.abs(t.x - p.x) < 8 && Math.abs(t.y - p.y) < 8) { t.taken = true; addScore(g, POINTS.toy, t.x, t.y - 12); g.events.push('toy'); }
  if (p.hammer > 0) {
    const z = hammerZone(p);
    for (const list of [g.hazards, g.fleas]) for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i], ey = e.y - e.r; if (!deadly(e)) continue;
      if ((e.x - z.x) ** 2 + (ey - z.y) ** 2 < (z.r + e.r) ** 2) {
        list.splice(i, 1); const pts = POINTS.smash[Math.floor(g.rng() * 3)];
        addScore(g, pts, e.x, ey - 8); g.events.push('smash');
      }
    }
  }
  for (const e of g.hazards.concat(g.fleas)) if (deadly(e) && hitCircleBox(e.x, e.y - e.r, e.r - 1, ...box)) { killPlayer(g, e.kind || 'flea'); return; }
  if (p.state === 'air') {
    let n = 0;
    for (const e of g.hazards.concat(g.fleas)) {
      if (e.state !== 'roll' && e.state !== 'walk' && e.state !== 'ladder' && e.kind !== 'flea' && e.state !== undefined) continue;
      if (e.jumpId !== p.jumpId && Math.abs(e.x - p.x) < 7 && e.y > p.y && e.y - p.y < 28) { e.jumpId = p.jumpId; n++; }
    }
    if (n) { addScore(g, n > 1 ? POINTS.multiJump : POINTS.jump, p.x, p.y - 20); g.events.push('score'); }
  }
  const cp = g.S.checkpoint;
  if (cp && !g.cp && p.state === 'walk') { const gr = findGround(g, p.x, p.y, 2, 2); if (gr && gr.pl === g.plats[cp.p]) { g.cp = true; g.events.push('checkpoint'); g.popups.push({ x: p.x, y: p.y - 22, text: 'CHECKPOINT', t: 1.5 }); } }
  if (p.state === 'dead') return;
  g.pups.forEach((q, i) => { if (!q.freed && Math.abs(p.x - q.x) < 14 && Math.abs(p.y - q.y) < 10) freePup(g, i); });
  if (g.exit && g.pups.every(q => q.freed) && Math.abs(p.x - g.exit.x) < 12 && Math.abs(p.y - g.exit.y) < 10) clearStage(g);
}
export function clearStage(g) {
  if (g.mode !== 'play') return;
  g.pups.forEach((q, i) => { if (!q.freed) { q.freed = true; g.freed[i] = true; g.saved = (g.saved || 0) + 1; } });
  addScore(g, g.bonus, g.player.x, g.player.y - 24); g.height = 100; g.mode = 'clear'; g.timer = 2.5; g.cat.fallen = !!g.S.final; g.events.push('clear');
}

export function progress(g) {
  return { stage: g.loop * STAGES.length + g.stage + 1, height: Math.floor(g.height), timeMs: Math.round(g.runTime), score: g.score, saved: g.saved || 0 };
}
// stage progress 0-100: share of caged pups freed, plus how far the rescuer has climbed toward the next goal
function trackHeight(g) {
  const st = at(g, g.S.start), n = g.pups.length + (g.exit ? 1 : 0), done = g.pups.filter(q => q.freed).length;
  const goal = g.pups.find(q => !q.freed) || g.exit; if (!goal) return;
  const prev = done === 0 ? st : (g.pups.filter(q => q.freed).slice(-1)[0]);
  const dd = Math.hypot(goal.x - prev.x, goal.y - prev.y) || 1, left = Math.hypot(goal.x - g.player.x, goal.y - g.player.y);
  const h = Math.max(0, Math.min(99, (done + Math.max(0, Math.min(1, 1 - left / dd))) / n * 100));
  if (h > g.height) g.height = h;
}
export function step(g, inp = {}) {
  g.events.length = 0;
  if (g.mode !== 'over') g.runTime += DT * 1000;
  for (const pp of g.popups) pp.t -= DT; g.popups = g.popups.filter(pp => pp.t > 0);
  if (g.mode === 'intro') { g.timer -= DT; if (g.timer <= 0) { g.mode = 'play'; g.events.push('start'); } return; }
  if (g.mode === 'dying') {
    g.timer -= DT; if (g.timer <= 0) { g.lives--; if (g.lives <= 0) { g.mode = 'over'; g.events.push('gameover'); } else { loadStage(g, true); g.mode = 'intro'; g.timer = 1.2; } }
    return;
  }
  if (g.mode === 'clear') {
    g.timer -= DT; if (g.timer <= 0) { g.stage++; if (g.stage >= STAGES.length) { g.stage = 0; g.loop++; } loadStage(g); g.mode = 'intro'; g.timer = 1.5; }
    return;
  }
  if (g.mode !== 'play') return;
  g.t += DT; updateLifts(g);
  g.bonusClock += DT; if (g.bonusClock >= 2) { g.bonusClock -= 2; g.bonus = Math.max(0, g.bonus - 100); if (g.bonus === 0) { killPlayer(g, 'time'); return; } }
  stepCat(g);
  g.spawnT -= DT;
  if (g.spawnT <= 0) { spawnHazard(g); g.spawnT = Math.max(1.0, g.S.spawn - 0.3 * g.loop) + g.rng() * 1.0; }
  if (g.S.fleaSpots.length) { g.fleaT -= DT; if (g.fleaT <= 0) { g.fleaT = 6 - Math.min(2, g.loop); const s = g.S.fleaSpots[Math.floor(g.rng() * g.S.fleaSpots.length)]; const q = at(g, s); spawnFlea(g, q.x, q.y); } }
  stepPlayer(g, inp); trackHeight(g);
  if (g.mode !== 'play') return;
  for (const b of g.hazards) stepHazard(g, b);
  g.hazards = g.hazards.filter(b => !b.dead && b.x > -12 && b.x < W + 12 && b.y < H + 12);
  for (const f of g.fleas) stepFlea(g, f); g.fleas = g.fleas.filter(f => !f.dead);
  collisions(g);
}
