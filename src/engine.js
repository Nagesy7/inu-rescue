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
const P = (x1, y1, x2, y2, extra = {}) => ({ x1, y1, x2, y2, ...extra });
export const STAGES = [
  { name: 'SCAFFOLD', hazard: 'yarn',
    plats: [P(0,232,256,226), P(0,196,240,204), P(16,170,256,162), P(0,128,240,136), P(16,104,256,96), P(0,68,208,72), P(88,42,152,42)],
    ladders: [{x:200,top:1,bot:0},{x:110,top:1,bot:0},{x:60,top:2,bot:1},{x:150,top:2,bot:1},{x:180,top:3,bot:2},{x:100,top:3,bot:2},
              {x:40,top:4,bot:3},{x:130,top:4,bot:3},{x:190,top:5,bot:4},{x:140,top:6,bot:5}],
    hammers: [{x:30,p:1},{x:216,p:3}], toys: [{x:230,p:2,k:'bow'},{x:70,p:4,k:'bag'}],
    start: {x:40,p:0}, checkpoint: {x:200,p:3}, pup: {x:112,p:6}, cat: {x:24,p:5}, bowl: {x:14,p:0}, fleaMax: 4, rivets: [], shafts: [] },
  { name: 'KIBBLE WORKS', hazard: 'tin',
    plats: [P(0,232,256,232), P(8,196,248,196,{conv:1}), P(0,160,120,160,{conv:-1}), P(136,160,256,160,{conv:1}),
            P(8,124,248,124,{conv:-1}), P(0,88,256,88), P(96,52,160,52)],
    ladders: [{x:30,top:1,bot:0},{x:226,top:1,bot:0},{x:60,top:2,bot:1},{x:200,top:3,bot:1},{x:100,top:4,bot:2},{x:160,top:4,bot:3},
              {x:40,top:5,bot:4},{x:220,top:5,bot:4},{x:140,top:6,bot:5}],
    hammers: [{x:20,p:2},{x:236,p:3}], toys: [{x:128,p:5,k:'bow'},{x:236,p:0,k:'bag'}],
    start: {x:120,p:0}, checkpoint: {x:128,p:4}, pup: {x:112,p:6}, cat: {x:40,p:5}, bowl: {x:128,p:0}, fleaMax: 3, rivets: [], shafts: [] },
  { name: 'DUMBWAITERS', hazard: 'ball',
    plats: [P(0,232,256,232), P(0,196,40,196), P(68,112,146,112), P(180,140,256,140), P(180,98,256,98), P(72,56,256,56), P(0,56,40,56)],
    ladders: [{x:20,top:1,bot:0},{x:236,top:3,bot:0},{x:236,top:4,bot:3},{x:196,top:5,bot:4},{x:110,top:2,bot:0}],
    hammers: [{x:120,p:0}], toys: [{x:96,p:2,k:'bow'},{x:220,p:3,k:'bag'}],
    start: {x:60,p:0}, checkpoint: {x:200,p:3}, pup: {x:132,p:5}, cat: {x:20,p:6}, bowl: {x:170,p:0}, fleaMax: 3, rivets: [],
    shafts: [{x1:40,x2:68,top:60,bot:236,dir:-1,speed:26,n:3},{x1:146,x2:178,top:60,bot:236,dir:1,speed:26,n:3}] },
  { name: 'PEG TOWER', hazard: 'none',
    plats: [P(0,232,256,232), P(16,196,240,196), P(24,160,232,160), P(32,124,224,124), P(40,88,216,88), P(56,52,200,52)],
    ladders: [{x:30,top:1,bot:0},{x:128,top:1,bot:0},{x:226,top:1,bot:0},{x:40,top:2,bot:1},{x:216,top:2,bot:1},
              {x:48,top:3,bot:2},{x:128,top:3,bot:2},{x:208,top:3,bot:2},{x:56,top:4,bot:3},{x:200,top:4,bot:3},{x:80,top:5,bot:4},{x:176,top:5,bot:4}],
    hammers: [{x:120,p:1},{x:150,p:3}], toys: [{x:100,p:2,k:'bow'},{x:160,p:4,k:'bag'}],
    start: {x:90,p:0}, pup: {x:100,p:5}, cat: {x:128,p:5}, bowl: {x:20,p:0}, fleaMax: 5,
    rivets: [1,2,3,4].flatMap(p => [{x:72,p},{x:184,p}]), shafts: [] },
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
export const POINTS = { jump: 100, multiJump: 300, toy: 300, rivet: 100, smash: [300, 500, 800], extraLifeAt: 10000 };
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
  const g = { rng: mulberry32(opts.seed ?? 1234), score: 0, lives: opts.lives ?? 3, stage: opts.stage ?? 0, loop: 0,
    mode: 'intro', timer: 1.5, events: [], popups: [], t: 0, runTime: 0, height: 0 };
  loadStage(g); return g;
}
export function loadStage(g, respawn = false) {
  const S = STAGES[g.stage];
  if (!respawn) g.cp = false;
  if (!respawn) g.height = 0;
  g.S = S; g.plats = S.plats.map(p => ({ ...p })); g.lifts = []; g.t = 0;
  g.bonus = 5000 + 1000 * Math.min(g.loop, 3); g.bonusClock = 0;
  const st = g.cp && S.checkpoint ? S.checkpoint : S.start, pl = g.plats[st.p];
  g.player = { x: st.x, y: surfaceY(pl, st.x), vx: 0, vy: 0, state: 'walk', face: 1, anim: 0, jumpId: 0, takeoffY: 0, lad: null, hammer: 0 };
  g.hazards = []; g.fleas = []; g.spawnT = 1.2; g.fleaT = 3; g.convT = 0;
  g.hammers = S.hammers.map(h => ({ x: h.x, y: surfaceY(g.plats[h.p], h.x) - 14, taken: false }));
  g.toys = S.toys.map(t => ({ x: t.x, y: surfaceY(g.plats[t.p], t.x), k: t.k, taken: false }));
  g.rivets = S.rivets.map(r => ({ ...r, y: g.plats[r.p].y1, gone: false }));
  g.pup = { x: S.pup.x, y: surfaceY(g.plats[S.pup.p], S.pup.x) };
  g.cat = { x: S.cat.x, y: surfaceY(g.plats[S.cat.p], S.cat.x), throwT: 0, fallen: false };
  g.bowl = { x: S.bowl.x, y: surfaceY(g.plats[S.bowl.p], S.bowl.x) };
  updateLifts(g);
}
function updateLifts(g) {
  g.lifts = [];
  for (const s of g.S.shafts) {
    const span = s.bot - s.top, gap = span / s.n;
    for (let i = 0; i < s.n; i++) {
      let off = ((g.t * s.speed + i * gap) % span + span) % span;
      const y = s.dir > 0 ? s.top + off : s.bot - off;
      g.lifts.push({ x1: s.x1, x2: s.x2, y1: y, y2: y, lift: true, vy: s.dir * s.speed });
    }
  }
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
  const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  if (p.state === 'walk') {
    if (dir) p.face = dir;
    if (!p.hammer && inp.up) { const L = ladderUp(g, p.x, p.y); if (L) { p.state = 'climb'; p.lad = L; p.x = L.x; return; } }
    if (!p.hammer && inp.down) { const L = ladderDown(g, p.x, p.y); if (L) { p.state = 'climb'; p.lad = L; p.x = L.x; p.y += 1; return; } }
    if (!p.hammer && inp.jump) {
      p.state = 'air'; p.vy = PHYS.jumpVy; p.vx = dir * PHYS.jumpVx; p.takeoffY = p.y; p.jumpId++; p.jumpCount = 0; g.events.push('jump'); return;
    }
    let vx = dir * PHYS.walk;
    const gr0 = findGround(g, p.x, p.y, 3, 3);
    if (gr0 && gr0.pl.conv) vx += gr0.pl.conv * 22;
    p.x = Math.max(6, Math.min(W - 6, p.x + vx * dt));
    if (dir) p.anim += dt;
    const gr = findGround(g, p.x, p.y, 4, 4);
    if (gr) p.y = gr.sy; else { p.state = 'air'; p.vy = 0; p.vx = 0; p.takeoffY = p.y; }
  } else if (p.state === 'air') {
    p.vy += PHYS.grav * dt; const py = p.y;
    p.x += p.vx * dt; if (p.x < 6 || p.x > W - 6) { p.x = Math.max(6, Math.min(W - 6, p.x)); p.vx = -p.vx; }
    p.y += p.vy * dt;
    if (p.vy > 0) {
      const l = landCross(g, p.x, py, p.y);
      if (l) { p.y = l.sy; p.state = 'walk'; if (p.y - p.takeoffY > PHYS.maxDrop) killPlayer(g, 'fall'); else g.events.push('land'); }
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

function spawnHazard(g) {
  const S = g.S, c = g.cat, lv = g.loop;
  if (S.hazard === 'yarn') {
    const kind = g.rng() < 0.3 ? 'kibble' : 'yarn';
    g.hazards.push({ kind, x: c.x + 22, y: c.y, vx: rollSpeed(g), vy: 0, state: 'roll', r: 5, rot: 0, jumpId: -1, tried: new Set() });
    c.throwT = 0.5; g.events.push('throw');
  } else if (S.hazard === 'tin') {
    const convs = g.plats.map((p, i) => i).filter(i => g.plats[i].conv);
    const i = convs[Math.floor(g.rng() * convs.length)], pl = g.plats[i];
    const x = pl.conv > 0 ? pl.x1 + 4 : pl.x2 - 4;
    g.hazards.push({ kind: 'tin', x, y: surfaceY(pl, x), vx: 0, vy: 0, state: 'roll', r: 5, rot: 0, jumpId: -1, tried: new Set() });
  } else if (S.hazard === 'ball') {
    g.hazards.push({ kind: 'ball', x: c.x + 14, y: c.y - 2, vx: 66 + lv * 6, vy: -150, state: 'fall', bounce: true, r: 5, rot: 0, jumpId: -1, tried: new Set() });
    c.throwT = 0.5; g.events.push('throw');
  }
}

export function stepHazard(g, b) {
  const dt = DT;
  b.rot += b.vx * dt / 5;
  if (b.state === 'roll') {
    const gr = findGround(g, b.x, b.y, 2, 2);
    if (!gr) { b.state = 'fall'; b.vy = 0; return; }
    const pl = gr.pl;
    if (pl.conv) b.vx = pl.conv * 34;
    else if (pl.y2 > pl.y1) b.vx = Math.abs(b.vx) || rollSpeed(g); else if (pl.y2 < pl.y1) b.vx = -(Math.abs(b.vx) || rollSpeed(g));
    // maybe take a ladder down
    if (b.kind !== 'tin') for (const L of g.S.ladders) {
      if (g.plats[L.top] !== pl || b.tried.has(L) || Math.abs(L.x - b.x) > 1.6) continue;
      b.tried.add(L);
      const chase = g.player.y > b.y ? 0.15 : 0;
      if (g.rng() < 0.22 + 0.06 * g.loop + chase) { b.state = 'ladder'; b.lad = L; b.x = L.x; g.events.push('ladderroll'); return; }
    }
    b.x += b.vx * dt;
    if (b.x < pl.x1 || b.x > pl.x2) { b.state = 'fall'; b.vy = 0; b.fromPl = pl; }
    else b.y = surfaceY(pl, b.x);
  } else if (b.state === 'ladder') {
    const e = ladderEnds(g, b.lad); b.y += 44 * dt;
    if (b.y >= e.bot) { b.y = e.bot; b.state = 'roll'; b.vx = -b.vx; b.tried.clear(); }
  } else {
    const py = b.y; b.vy += PHYS.grav * dt; b.y += b.vy * dt; b.x += b.vx * (b.bounce ? 1 : 0.35) * dt;
    if (b.vy > 0) {
      const l = landCross(g, b.x, py, b.y);
      if (l && l.pl !== b.fromPl) {
        b.y = l.sy; b.fromPl = null;
        if (b.bounce) { b.vy = -120; g.events.push('bounce'); }
        else { b.state = 'roll'; b.vy = 0; if (l.pl.y1 === l.pl.y2 && !l.pl.conv) b.vx = -b.vx; b.tried.clear(); }
      }
    }
  }
}

function spawnFlea(g, x, y) {
  if (g.fleas.length >= g.S.fleaMax + g.loop) return;
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
  if (!gr) { f.y += 60 * dt; return; }
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

function collisions(g) {
  const p = g.player, box = playerBox(p);
  // pickups
  for (const h of g.hammers) if (!h.taken && Math.abs(h.x - p.x) < 8 && Math.abs(h.y + 4 - (p.y - 8)) < 12 && p.state !== 'climb') {
    h.taken = true; p.hammer = 9; g.events.push('hammer');
  }
  for (const t of g.toys) if (!t.taken && Math.abs(t.x - p.x) < 8 && Math.abs(t.y - p.y) < 8) { t.taken = true; addScore(g, POINTS.toy, t.x, t.y - 12); g.events.push('toy'); }
  for (const r of g.rivets) if (!r.gone && p.state === 'walk' && Math.abs(r.x - p.x) < 5 && Math.abs(r.y - p.y) < 2) {
    r.gone = true; addScore(g, POINTS.rivet, r.x, r.y - 14); g.events.push('rivet');
  }
  // hammer smashes
  if (p.hammer > 0) {
    const z = hammerZone(p);
    for (const list of [g.hazards, g.fleas]) for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i], ey = e.y - e.r;
      if ((e.x - z.x) ** 2 + (ey - z.y) ** 2 < (z.r + e.r) ** 2) {
        list.splice(i, 1); const pts = POINTS.smash[Math.floor(g.rng() * 3)];
        addScore(g, pts, e.x, ey - 8); g.events.push('smash');
      }
    }
  }
  // deadly contact
  for (const e of g.hazards.concat(g.fleas)) if (hitCircleBox(e.x, e.y - e.r, e.r - 1, ...box)) { killPlayer(g, e.kind || 'flea'); return; }
  // jump-over scoring
  if (p.state === 'air') {
    let n = 0;
    for (const e of g.hazards.concat(g.fleas)) {
      if (e.jumpId !== p.jumpId && Math.abs(e.x - p.x) < 7 && e.y > p.y && e.y - p.y < 28) { e.jumpId = p.jumpId; n++; }
    }
    if (n) { addScore(g, n > 1 ? POINTS.multiJump : POINTS.jump, p.x, p.y - 20); g.events.push('score'); }
  }
  // mid-tower checkpoint: standing on the checkpoint girder saves the respawn point
  const cp = g.S.checkpoint;
  if (cp && !g.cp && p.state === 'walk') { const gr = findGround(g, p.x, p.y, 2, 2); if (gr && gr.pl === g.plats[cp.p]) { g.cp = true; g.events.push('checkpoint'); g.popups.push({ x: p.x, y: p.y - 22, text: 'CHECKPOINT', t: 1.5 }); } }
  // stage clear
  if (g.S.rivets.length) { if (g.rivets.every(r => r.gone)) clearStage(g); }
  else if (Math.abs(p.x - g.pup.x) < 20 && Math.abs(p.y - g.pup.y) < 10 && p.state !== 'dead') clearStage(g);
}
export function clearStage(g) {
  if (g.mode !== 'play') return;
  addScore(g, g.bonus, g.player.x, g.player.y - 24); g.saved = (g.saved || 0) + 1; g.height = 100; g.mode = 'clear'; g.timer = 2.5; g.cat.fallen = !!g.S.rivets.length; g.events.push('clear');
}

export function progress(g) {
  return { stage: g.loop * STAGES.length + g.stage + 1, height: Math.floor(g.height), timeMs: Math.round(g.runTime), score: g.score, saved: g.saved || 0 };
}
function trackHeight(g) {
  const sy = surfaceY(g.plats[g.S.start.p], g.S.start.x), gy = g.pup.y;
  const h = Math.max(0, Math.min(100, (sy - g.player.y) / (sy - gy) * 100));
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
  // conveyors reverse periodically
  g.convT += DT; if (g.convT > 6) { g.convT = 0; for (const pl of g.plats) if (pl.conv && g.rng() < 0.5) pl.conv = -pl.conv; }
  g.cat.throwT = Math.max(0, g.cat.throwT - DT);
  g.spawnT -= DT;
  if (g.spawnT <= 0) { spawnHazard(g); const base = g.S.hazard === 'tin' ? 1.6 : 2.2; g.spawnT = Math.max(0.9, base - 0.25 * g.loop) + g.rng() * 1.0; }
  if (g.S.hazard !== 'yarn') { g.fleaT -= DT; if (g.fleaT <= 0) { g.fleaT = 5 - Math.min(2, g.loop); spawnFlea(g, g.bowl.x + 10, g.bowl.y); } }
  stepPlayer(g, inp); trackHeight(g);
  if (g.mode !== 'play') return;
  for (const b of g.hazards) stepHazard(g, b);
  g.hazards = g.hazards.filter(b => {
    if (b.x < -12 || b.x > W + 12 || b.y > H + 12) return false;
    if (g.S.hazard === 'yarn' && b.state === 'roll' && Math.abs(b.x - g.bowl.x) < 6 && Math.abs(b.y - g.bowl.y) < 4) { spawnFlea(g, g.bowl.x + 12, g.bowl.y); return false; }
    return true;
  });
  for (const f of g.fleas) stepFlea(g, f);
  collisions(g);
}
