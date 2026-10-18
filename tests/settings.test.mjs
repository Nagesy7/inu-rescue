import test from 'node:test'; import assert from 'node:assert/strict';
import { SETTINGS_KEY, DEFAULTS, loadSettings, saveSettings, stickToKeys, knobOffset } from '../src/settings.js';
const mem = (init = {}) => ({ s: { ...init }, getItem(k) { return this.s[k] ?? null; }, setItem(k, v) { this.s[k] = String(v); } });
test('joystick setting is OFF by default (missing, empty, corrupt or non-boolean storage)', () => {
  assert.equal(DEFAULTS.joystick, false);
  for (const st of [mem(), mem({ [SETTINGS_KEY]: '' }), mem({ [SETTINGS_KEY]: '{oops' }), mem({ [SETTINGS_KEY]: '{"joystick":"yes"}' }), null]) assert.equal(loadSettings(st).joystick, false);
});
test('joystick setting persists in the cloud-synced key and keeps other fields', () => {
  assert.ok(SETTINGS_KEY.startsWith('inu-rescue.'), 'covered by the wallet cloud-save key prefix');
  const st = mem({ [SETTINGS_KEY]: '{"other":7}' }); saveSettings(st, { joystick: true });
  assert.deepEqual(JSON.parse(st.s[SETTINGS_KEY]), { other: 7, joystick: true }); assert.equal(loadSettings(st).joystick, true);
  saveSettings(st, { joystick: false }); assert.equal(loadSettings(st).joystick, false); assert.equal(JSON.parse(st.s[SETTINGS_KEY]).other, 7);
});
test('stick mapping: dead zone, 8 directions, ladders via up/down', () => {
  const r = 60, on = k => Object.keys(k).filter(d => k[d]).sort().join('+') || 'none';
  assert.equal(on(stickToKeys(0, 0, r)), 'none'); assert.equal(on(stickToKeys(10, 8, r)), 'none', 'inside dead zone');
  assert.equal(on(stickToKeys(40, 0, r)), 'right'); assert.equal(on(stickToKeys(-40, 3, r)), 'left');
  assert.equal(on(stickToKeys(0, -40, r)), 'up'); assert.equal(on(stickToKeys(2, 45, r)), 'down');
  assert.equal(on(stickToKeys(30, -30, r)), 'right+up'); assert.equal(on(stickToKeys(-30, 30, r)), 'down+left');
  assert.equal(on(stickToKeys(40, -10, r)), 'right', 'slight upward lean while running does not grab ladders');
  assert.equal(on(stickToKeys(500, 0, r)), 'right', 'beyond the ring still counts');
  assert.equal(on(stickToKeys(5, 5, 0)), 'none');
  const o = knobOffset(300, 400, 50); assert.ok(Math.abs(Math.hypot(o.x, o.y) - 50) < 1e-9); assert.deepEqual(knobOffset(3, 4, 50), { x: 3, y: 4 });
});
