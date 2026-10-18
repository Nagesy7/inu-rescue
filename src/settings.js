// Player settings (pure; no DOM). Stored in localStorage under 'inu-rescue.settings', which the kibble-pay wallet cloud save
// already syncs (mountWallet keys include the 'inu-rescue.' prefix), so it rides along as one extra key in the same save map.
export const SETTINGS_KEY = 'inu-rescue.settings';
// joystick OFF: the classic D-pad stays the default layout. Sound defaults match the old behaviour (on, full volume).
export const DEFAULTS = Object.freeze({ joystick: false, muted: false, volume: 100 });
const vol = v => (Number.isFinite(+v) && v !== null && v !== '' ? Math.max(0, Math.min(100, Math.round(+v))) : DEFAULTS.volume);
export function loadSettings(storage) {
  try { const s = JSON.parse(storage?.getItem(SETTINGS_KEY) || '{}'); return { ...DEFAULTS, joystick: s?.joystick === true, muted: s?.muted === true, volume: vol(s?.volume ?? DEFAULTS.volume) }; }
  catch { return { ...DEFAULTS }; }
}
export function saveSettings(storage, s) {
  let prev = {}; try { prev = JSON.parse(storage.getItem(SETTINGS_KEY) || '{}') || {}; } catch {}
  try { storage.setItem(SETTINGS_KEY, JSON.stringify({ ...prev, ...s, joystick: !!s.joystick, muted: !!s.muted, volume: vol(s.volume ?? DEFAULTS.volume) })); } catch {}
}
// Virtual stick -> directional keys. dx/dy = thumb offset from the stick centre (px, +y down), r = stick radius.
// Dead zone (fraction of r) ignores resting-thumb jitter. Left/right need a clear horizontal lean; up/down (ladders) need a
// clear vertical lean, and diagonals give both (e.g. up+right walks onto a ladder, then climbs).
export const STICK = { dead: 0.28, axis: 0.38 };
export function stickToKeys(dx, dy, r, o = STICK) {
  const k = { left: false, right: false, up: false, down: false };
  if (!(r > 0)) return k;
  const m = Math.hypot(dx, dy) / r; if (m < o.dead) return k;
  const nx = dx / Math.hypot(dx, dy), ny = dy / Math.hypot(dx, dy); // direction only: past the dead zone, distance doesn't matter
  if (nx > o.axis) k.right = true; else if (nx < -o.axis) k.left = true;
  if (ny < -o.axis) k.up = true; else if (ny > o.axis) k.down = true;
  return k;
}
// clamp the drawn knob to the ring
export function knobOffset(dx, dy, r) { const m = Math.hypot(dx, dy); return m <= r ? { x: dx, y: dy } : { x: dx / m * r, y: dy / m * r }; }
