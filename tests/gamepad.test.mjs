// Controller support: mapping, dead zone, glyph/brand detection, hot-plug, menu navigation, disconnect auto-pause.
// navigator.getGamepads is mocked; no browser needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { brandOf, readPad, stickDir, createPads, applyPad, GLYPHS, DEAD, REPEAT, TITLE_MENU, PAUSE_MENU } from '../src/gamepad.js';

const fakePads = []; Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => fakePads }, configurable: true, writable: true });
const mk = (o = {}) => ({ index: 0, id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', mapping: 'standard', connected: true,
  axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), ...o });
const press = (gp, i, v = true) => { gp.buttons[i] = { pressed: v, value: v ? 1 : 0 }; return gp; };
const mgr = () => createPads(() => navigator.getGamepads());
const reset = () => { fakePads.length = 0; };

test('brand + glyphs from gamepad.id', () => {
  for (const id of ['DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', '054c-0ce6-Wireless Controller', 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', 'Sony PLAYSTATION(R)3 Controller'])
    assert.equal(brandOf(id), 'ps', id);
  for (const id of ['Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', '045e-02fd-Xbox Wireless Controller', 'xinput', 'Microsoft X-Box 360 pad 045e'])
    assert.equal(brandOf(id), 'xbox', id);
  for (const id of ['8BitDo Pro 2 (Vendor: 2dc8 Product: 6006)', 'USB Gamepad', '', undefined]) assert.equal(brandOf(id), 'generic', String(id));
  assert.deepEqual([GLYPHS.ps.a, GLYPHS.ps.b, GLYPHS.ps.x, GLYPHS.ps.y], ['cross', 'circle', 'square', 'triangle']);
  assert.deepEqual([GLYPHS.xbox.a, GLYPHS.xbox.b, GLYPHS.xbox.x, GLYPHS.xbox.y], ['A', 'B', 'X', 'Y']);
});

test('standard mapping: face buttons, start/select, d-pad', () => {
  const gp = mk(); assert.deepEqual(Object.entries(readPad(gp)).filter(([, v]) => v), []);
  const names = { 0: 'a', 1: 'b', 2: 'x', 3: 'y', 4: 'lb', 5: 'rb', 8: 'select', 9: 'start', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
  for (const [i, k] of Object.entries(names)) { const s = readPad(press(mk(), +i)); assert.equal(s[k], true, k); assert.equal(Object.values(s).filter(Boolean).length, 1, `${k} alone`); }
  assert.equal(readPad(press(mk(), 6)).a, false); // L2 is not jump
  const half = mk(); half.buttons[0] = { pressed: false, value: 0.7 }; assert.equal(readPad(half).a, true); // analog value past halfway
});

test('left stick dead zone + 8-way, same rule as the touch joystick (up/down climb)', () => {
  const at = (x, y) => readPad(mk({ axes: [x, y, 0, 0] }));
  assert.deepEqual(stickDir(0.2, -0.15), { left: false, right: false, up: false, down: false }, 'drift inside dead zone');
  assert.equal(at(DEAD - 0.01, 0).right, false); assert.equal(at(DEAD + 0.05, 0).right, true);
  assert.equal(at(0, -0.9).up, true); assert.equal(at(0, 0.9).down, true); assert.equal(at(-0.9, 0).left, true);
  const diag = at(0.7, -0.7); assert.equal(diag.right && diag.up, true);
  const mostlyX = at(0.95, -0.2); assert.equal(mostlyX.right, true); assert.equal(mostlyX.up, false, 'small vertical wobble does not climb');
  assert.equal(readPad(mk({ axes: [0, 0, 0.9, -0.9] })).up, false, 'right stick ignored');
});

test('non-standard fallback: face 0/1, start 9 or 7, d-pad on axes 6/7 or hat axis 9', () => {
  const ns = o => mk({ mapping: '', id: 'USB Gamepad', ...o });
  assert.equal(readPad(press(ns(), 0)).a, true); assert.equal(readPad(press(ns(), 1)).b, true); assert.equal(readPad(press(ns(), 9)).start, true);
  const short = ns({ buttons: Array.from({ length: 11 }, () => ({ pressed: false, value: 0 })) }); short.buttons.length = 8;
  assert.equal(readPad(press(short, 7)).start, true, 'xinput-style start on 7');
  assert.equal(readPad(ns({ axes: [0, 0, 0, 0, 0, 0, -1, 0] })).left, true); assert.equal(readPad(ns({ axes: [0, 0, 0, 0, 0, 0, 0, 1] })).down, true);
  assert.equal(readPad(ns({ axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, -1] })).up, true, 'hat up');
  assert.equal(readPad(ns({ axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0.714] })).left, true, 'hat left');
  const centred = readPad(ns({ axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1.286] })); assert.equal(centred.up || centred.down || centred.left || centred.right, false, 'hat centred');
});

test('hot-plug: connect/disconnect by polling and by events, no duplicate toasts', () => {
  reset(); const m = mgr();
  assert.equal(m.poll().events.length, 0);
  const ps = mk({ id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)' }); fakePads.push(ps);
  m.connected({ gamepad: ps }); let r = m.poll();
  assert.deepEqual(r.events.map(e => [e.type, e.brand]), [['connected', 'ps']], 'event + poll = one toast'); assert.equal(r.count, 1);
  const xb = mk({ index: 1 }); fakePads[1] = xb; r = m.poll(); assert.deepEqual(r.events.map(e => [e.type, e.brand]), [['connected', 'xbox']], 'poll alone finds a pad (no event)');
  fakePads[1] = null; r = m.poll(); assert.deepEqual(r.events.map(e => [e.type, e.brand]), [['disconnected', 'xbox']]); assert.equal(r.count, 1);
  m.disconnected({ gamepad: ps }); fakePads.length = 0; r = m.poll(); assert.deepEqual(r.events.map(e => e.type), ['disconnected']); assert.equal(r.count, 0);
  assert.equal(m.poll().events.length, 0);
  fakePads.push({ ...ps, connected: false }); assert.equal(m.poll().count, 0, 'connected:false ignored');
  reset(); const bad = createPads(() => { throw new Error('SecurityError'); }); assert.doesNotThrow(() => bad.poll());
});

test('press edges + held + menu repeat timing', () => {
  reset(); const m = mgr(), gp = mk(); fakePads.push(gp); m.poll();
  press(gp, 0); let r = m.poll(); assert.equal(r.pressed.a, true); assert.equal(r.held.a, true);
  r = m.poll(); assert.equal(r.pressed.a, false, 'held = no new edge'); press(gp, 0, false); m.poll();
  press(gp, 13); const fires = []; for (let i = 0; i < 60; i++) fires.push(m.poll(1 / 60).nav.down);
  const n = fires.filter(Boolean).length, expect = 1 + 1 + Math.floor((1 - REPEAT.delay) / REPEAT.every);
  assert.equal(fires[0], true); assert.equal(fires.slice(1, Math.floor(REPEAT.delay * 60) - 1).some(Boolean), false, 'no repeat before delay');
  assert.ok(Math.abs(n - expect) <= 1, `repeat count ${n} ~ ${expect}`);
  assert.equal(m.poll().held.down, true, 'held direction feeds movement');
});

const run = (app, r) => { const calls = []; const act = new Proxy({}, { get: (_, k) => (...a) => calls.push([k, ...a]) }); const out = applyPad(app, r, act); return { out, calls }; };
const R = (o = {}) => ({ count: 1, brand: 'ps', held: {}, pressed: {}, nav: {}, anyPress: false, events: [], ...o });

test('menu navigation: title, pause, settings, entry, over', () => {
  let app = { scene: 'title', padMenuI: 0 };
  run(app, R({ nav: { right: true } })); assert.equal(app.padMenuI, 1); run(app, R({ nav: { down: true } })); assert.equal(app.padMenuI, 0, 'wraps');
  assert.deepEqual(run(app, R({ pressed: { a: true } })).calls.map(c => c[0]), ['startGame']);
  app.padMenuI = 1; assert.deepEqual(run(app, R({ pressed: { a: true } })).calls.map(c => c[0]), ['openSettings']);
  assert.deepEqual(run(app, R({ pressed: { start: true } })).calls.map(c => c[0]), ['startGame'], 'OPTIONS/MENU always starts');
  assert.equal(TITLE_MENU.length, 2);
  app = { scene: 'game', paused: false, g: { mode: 'play' } };
  assert.equal(run(app, R({ pressed: { a: true } })).out.jump, true); assert.equal(run(app, R({ pressed: { x: true } })).out.jump, true, 'square/X also jumps');
  assert.equal(run(app, R({ pressed: { b: true } })).out.jump, false, 'circle/B does not jump');
  run(app, R({ pressed: { start: true } })); assert.equal(app.paused, true); assert.equal(app.padMenuI, 0);
  assert.equal(run(app, R({ pressed: { a: true } })).out.jump, false, 'no jump while paused'); assert.equal(app.paused, false, 'A on RESUME');
  app.paused = true; run(app, R({ nav: { down: true } })); assert.equal(app.padMenuI, 1); assert.equal(PAUSE_MENU[1], 'SETTINGS');
  assert.deepEqual(run(app, R({ pressed: { a: true } })).calls.map(c => c[0]), ['openSettings']); assert.equal(app.paused, true);
  run(app, R({ pressed: { b: true } })); assert.equal(app.paused, false, 'B resumes');
  app.paused = true; run(app, R({ pressed: { start: true } })); assert.equal(app.paused, false, 'OPTIONS toggles pause');
  app = { scene: 'game', settingsOpen: true, paused: true };
  assert.deepEqual(run(app, R({ nav: { down: true, right: true } })).calls, [['settingsMove', 1], ['settingsAdjust', 1]]);
  assert.deepEqual(run(app, R({ nav: { up: true, left: true } })).calls, [['settingsMove', -1], ['settingsAdjust', -1]]);
  assert.deepEqual(run(app, R({ pressed: { a: true } })).calls, [['settingsActivate']]);
  for (const b of ['b', 'start', 'y']) assert.deepEqual(run(app, R({ pressed: { [b]: true } })).calls, [['closeSettings']], b);
  app = { scene: 'entry' };
  assert.deepEqual(run(app, R({ nav: { up: true, right: true } })).calls, [['entryKey', 'ArrowUp'], ['entryKey', 'ArrowRight']]);
  assert.deepEqual(run(app, R({ pressed: { a: true } })).calls, [['entryKey', 'Enter']]); assert.deepEqual(run(app, R({ pressed: { b: true } })).calls, [['entryKey', 'Backspace']]);
  app = { scene: 'over', overT: 0.5 }; assert.deepEqual(run(app, R({ pressed: { a: true } })).calls, [], 'ignores presses for the first second');
  app.overT = 2; assert.deepEqual(run(app, R({ pressed: { a: true } })).calls, [['toTitle']]);
  assert.deepEqual(run({ scene: 'title' }, R({ pressed: { select: true } })).calls[0], ['toggleMute']);
  assert.deepEqual(run({ scene: 'title' }, R({ count: 0, pressed: { a: true } })).calls, [], 'no pads = no actions');
});

test('disconnect mid-run auto-pauses; any button (or key/tap) resumes; not on title/over/already paused', () => {
  reset(); const m = mgr(), gp = mk(); fakePads.push(gp); const app = { scene: 'game', paused: false, g: { mode: 'play' } };
  let res = run(app, m.poll()); assert.equal(res.calls[0][0], 'toast'); assert.equal(res.calls[0][1].type, 'connected'); assert.equal(app.paused, false);
  fakePads.length = 0; res = run(app, m.poll());
  assert.equal(app.paused, 'pad'); assert.deepEqual(res.calls.map(c => c[0]), ['toast', 'releaseAll']); assert.equal(res.calls[0][1].type, 'disconnected');
  fakePads.push(gp); res = run(app, m.poll()); assert.equal(app.paused, 'pad', 'reconnecting alone does not unpause');
  press(gp, 1); run(app, m.poll()); assert.equal(app.paused, false, 'any button resumes');
  for (const a of [{ scene: 'title', paused: false }, { scene: 'over', paused: false, g: { mode: 'over' } }, { scene: 'game', paused: true, g: { mode: 'play' } }]) {
    const before = a.paused; applyPad(a, R({ count: 0, events: [{ type: 'disconnected', brand: 'ps' }] }), {}); assert.equal(a.paused, before, a.scene);
  }
});
