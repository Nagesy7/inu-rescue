// Bluetooth / USB controllers via the Gamepad API (PS5 DualSense, PS4, Xbox, generic). Pure logic, no DOM: main.js feeds it
// navigator.getGamepads() once per game-loop frame (rAF, so it stops while the tab is hidden) and the connect/disconnect events.
// Input only: it never touches scoring, the engine rules, wallet or payment code. Keyboard + touch keep working alongside it.
import { stickToKeys, STICK } from './settings.js';

export const DEAD = 0.3; // left-stick radial dead zone (worn sticks drift ~0.1-0.2)
export const REPEAT = { delay: 0.38, every: 0.14 }; // menu auto-repeat when a direction is held
const BTN = ['a', 'b', 'x', 'y', 'start', 'select', 'lb', 'rb'];

// brand from gamepad.id: e.g. "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)",
// "054c-0ce6-Wireless Controller", "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)", "045e-02fd-..."
export function brandOf(id = '') {
  const s = String(id).toLowerCase();
  if (/dualsense|dualshock|playstation|wireless controller|054c/.test(s) && !/xbox|045e|xinput/.test(s)) return 'ps';
  if (/xbox|045e|xinput/.test(s)) return 'xbox';
  return 'generic';
}
// Labels are plain shapes / letters drawn in code (no logos). ps: cross/circle/square/triangle; xbox + generic: A B X Y.
export const GLYPHS = {
  ps: { a: 'cross', b: 'circle', x: 'square', y: 'triangle', start: 'OPTIONS', select: 'CREATE', name: 'PS CONTROLLER' },
  xbox: { a: 'A', b: 'B', x: 'X', y: 'Y', start: 'MENU', select: 'VIEW', name: 'XBOX CONTROLLER' },
  generic: { a: 'A', b: 'B', x: 'X', y: 'Y', start: 'START', select: 'SELECT', name: 'CONTROLLER' },
};

const on = b => !!b && (b.pressed || (typeof b === 'number' ? b > 0.5 : b.value > 0.5));
export function stickDir(x, y, dead = DEAD) { return stickToKeys(+x || 0, +y || 0, 1, { dead, axis: STICK.axis }); } // same 8-way rule as the touch joystick
// 8-way hat on one axis (some non-standard Linux/Firefox drivers): -1 up, -0.43 right, 0.14 down, 0.71 left, steps of 2/7; >1 = centred
function hat(v) {
  const d = { left: false, right: false, up: false, down: false }; if (!(v >= -1.05 && v <= 1.05)) return d;
  const k = Math.round((v + 1) * 3.5) % 8; // 0 up,1 up-right,2 right,3 down-right,4 down,5 down-left,6 left,7 up-left
  d.up = k === 7 || k <= 1; d.right = k >= 1 && k <= 3; d.down = k >= 3 && k <= 5; d.left = k >= 5 && k <= 7; return d;
}
// one pad -> logical state. Standard mapping (W3C): 0 bottom,1 right,2 left,3 top,4 L1,5 R1,8 select/share/view,9 start/options/menu,12-15 d-pad.
export function readPad(gp, dead = DEAD) {
  const b = gp.buttons || [], ax = gp.axes || [], st = stickDir(ax[0], ax[1], dead), s = {};
  let dp;
  if (gp.mapping === 'standard') {
    Object.assign(s, { a: on(b[0]), b: on(b[1]), x: on(b[2]), y: on(b[3]), lb: on(b[4]), rb: on(b[5]), select: on(b[8]), start: on(b[9]) });
    dp = { up: on(b[12]), down: on(b[13]), left: on(b[14]), right: on(b[15]) };
  } else { // fallback: first four = face (0 confirm, 1 back), 4/5 shoulders, start = 9 (or 7 on short xinput-style layouts)
    const n = b.length, si = n > 9 ? 9 : 7, se = n > 9 ? 8 : 6;
    Object.assign(s, { a: on(b[0]), b: on(b[1]), x: on(b[2]), y: on(b[3]), lb: on(b[4]), rb: on(b[5]), select: on(b[se]), start: on(b[si]) });
    dp = n >= 16 ? { up: on(b[12]), down: on(b[13]), left: on(b[14]), right: on(b[15]) } : { up: false, down: false, left: false, right: false };
    if (ax.length >= 8 && (Math.abs(ax[6]) > 0.5 || Math.abs(ax[7]) > 0.5)) { dp.left ||= ax[6] < -0.5; dp.right ||= ax[6] > 0.5; dp.up ||= ax[7] < -0.5; dp.down ||= ax[7] > 0.5; }
    if (ax.length >= 10) { const h = hat(ax[9]); for (const k in h) dp[k] ||= h[k]; }
  }
  for (const k of ['left', 'right', 'up', 'down']) s[k] = st[k] || dp[k];
  return s;
}

// Pad manager: hot-plug (events + diffing each poll, so browsers without events still work), merged state, press edges, menu repeat.
export function createPads(getPads = () => [], o = {}) {
  const dead = o.dead ?? DEAD, known = new Map(), queue = []; let prev = {}, held = { up: 0, down: 0, left: 0, right: 0 }, last = 'generic';
  const list = () => { let a = []; try { a = [...(getPads() || [])]; } catch {} return a.filter(p => p && p.connected !== false); };
  const add = gp => { if (known.has(gp.index) && known.get(gp.index).id === gp.id) return; const brand = brandOf(gp.id); known.set(gp.index, { id: gp.id, brand }); last = brand; queue.push({ type: 'connected', brand, id: gp.id, index: gp.index }); };
  const drop = (index) => { const k = known.get(index); if (!k) return; known.delete(index); queue.push({ type: 'disconnected', brand: k.brand, id: k.id, index }); };
  return {
    connected: e => e?.gamepad && add(e.gamepad), disconnected: e => e?.gamepad && drop(e.gamepad.index),
    get count() { return known.size; }, get brand() { return last; },
    poll(dt = 1 / 60) {
      const pads = list(), seen = new Set();
      for (const gp of pads) { seen.add(gp.index); add(gp); }
      for (const i of [...known.keys()]) if (!seen.has(i)) drop(i);
      const cur = { left: false, right: false, up: false, down: false }; for (const k of BTN) cur[k] = false;
      for (const gp of pads) { const s = readPad(gp, dead); let any = false; for (const k in cur) if (s[k]) { cur[k] = true; any = true; } if (any) last = known.get(gp.index)?.brand || last; }
      const pressed = {}; let anyPress = false; for (const k of BTN) { pressed[k] = cur[k] && !prev[k]; anyPress ||= pressed[k]; }
      const nav = {};
      for (const d of ['up', 'down', 'left', 'right']) {
        if (!cur[d]) { held[d] = 0; nav[d] = false; continue; }
        const t0 = held[d]; held[d] += dt;
        nav[d] = t0 === 0 || (t0 >= REPEAT.delay && Math.floor((held[d] - REPEAT.delay) / REPEAT.every) > Math.floor((t0 - REPEAT.delay) / REPEAT.every)) || (t0 < REPEAT.delay && held[d] >= REPEAT.delay);
        anyPress ||= t0 === 0;
      }
      prev = cur;
      return { count: known.size, brand: last, held: cur, pressed, nav, anyPress, events: queue.splice(0) };
    },
  };
}

// Menus driven by the pad. Mutates app (scene/paused/padMenuI) and calls act.* for DOM work; returns { jump } for the engine step.
export const TITLE_MENU = ['START', 'SETTINGS'], PAUSE_MENU = ['RESUME', 'SETTINGS'];
const soft = p => p === 'blur' || p === 'pad';
export function applyPad(app, r, act = {}) {
  const out = { jump: false }, P = r.pressed, N = r.nav, call = (f, ...a) => act[f]?.(...a);
  for (const ev of r.events) {
    call('toast', ev);
    if (ev.type === 'disconnected' && app.scene === 'game' && app.g?.mode !== 'over' && !app.paused) { app.paused = 'pad'; app.padMenuI = 0; call('releaseAll'); }
  }
  if (!r.count) return out;
  if (P.select) call('toggleMute');
  if (app.settingsOpen) {
    if (N.up) call('settingsMove', -1); if (N.down) call('settingsMove', 1);
    if (N.left) call('settingsAdjust', -1); if (N.right) call('settingsAdjust', 1);
    if (P.a) call('settingsActivate'); else if (P.b || P.start || P.y) call('closeSettings');
    return out;
  }
  const move = (n, len) => { app.padMenuI = ((app.padMenuI || 0) + n + len) % len; call('menuMove'); };
  if (app.scene === 'title') {
    if (N.up || N.left) move(-1, TITLE_MENU.length); if (N.down || N.right) move(1, TITLE_MENU.length);
    if (P.y) call('openSettings');
    else if (P.a || P.start) { if ((app.padMenuI || 0) === 1 && !P.start) call('openSettings'); else { app.padMenuI = 0; call('startGame'); } }
  } else if (app.scene === 'game') {
    if (soft(app.paused) && (r.anyPress)) { app.paused = false; return out; } // auto-paused (focus loss / pad unplugged): any button resumes
    if (app.paused) {
      if (N.up || N.left) move(-1, PAUSE_MENU.length); if (N.down || N.right) move(1, PAUSE_MENU.length);
      if (P.b || P.start) app.paused = false;
      else if (P.a) { if ((app.padMenuI || 0) === 1) call('openSettings'); else app.paused = false; }
    } else if (P.start) { app.paused = true; app.padMenuI = 0; }
    else if (P.y) call('openSettings');
    else if (P.a || P.x) out.jump = true;
  } else if (app.scene === 'entry') {
    for (const [d, code] of [['up', 'ArrowUp'], ['down', 'ArrowDown'], ['left', 'ArrowLeft'], ['right', 'ArrowRight']]) if (N[d]) call('entryKey', code);
    if (P.lb) call('entryKey', 'ArrowLeft'); if (P.rb) call('entryKey', 'ArrowRight');
    if (P.a || P.start) call('entryKey', 'Enter'); else if (P.b) call('entryKey', 'Backspace');
  } else if (app.scene === 'over') { if ((P.a || P.start) && app.overT > 1) call('toTitle'); }
  return out;
}
