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
// Effects + music (own key so the sound/joystick record keeps its shape). reduced: null = auto (low-end device or
// prefers-reduced-motion, or sustained slow frames), true/false = the player's choice in the gear panel. Cloud-synced via the prefix.
export const FX_KEY = 'inu-rescue.fx';
export const FX_DEFAULTS = Object.freeze({ reduced: null, music: true });
export function loadFx(storage) {
  try { const s = JSON.parse(storage?.getItem(FX_KEY) || '{}') || {}; return { reduced: typeof s.reduced === 'boolean' ? s.reduced : null, music: s.music !== false }; }
  catch { return { ...FX_DEFAULTS }; }
}
export function saveFx(storage, fx) { try { storage.setItem(FX_KEY, JSON.stringify({ reduced: typeof fx.reduced === 'boolean' ? fx.reduced : null, music: fx.music !== false })); } catch {} }
/** Low-end guess: few cores, little memory, data saver or reduced motion. */
export function lowEndDevice(nav = {}, reduceMotion = false) {
  return !!(reduceMotion || (nav.hardwareConcurrency && nav.hardwareConcurrency <= 2) || (nav.deviceMemory && nav.deviceMemory <= 2) || nav.connection?.saveData);
}
export const effectiveReduced = (fx, autoLow) => (typeof fx.reduced === 'boolean' ? fx.reduced : !!autoLow);
