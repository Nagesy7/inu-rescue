import { createGame, step, progress, W, H } from './engine.js';
import { drawGame, drawTitle, text, padHint } from './render.js';
import { createPads, applyPad, PAUSE_MENU, GLYPHS } from './gamepad.js';
import { initAudio, play, setMuted, isMuted, setVolume, setMusic, setAmbience, tickAmbience } from './audio.js';
import { createAmbient, setScene, updateAmbient, counts } from './ambient.js';
import { eventFor, sydneyDate, runConditions, awardBones, loadBones } from './daily.js';
import { buildFeed, fetchBoard } from './feed.js';
import * as KB from './kibble.js';
import { loadSettings, saveSettings, stickToKeys, knobOffset, loadFx, saveFx, lowEndDevice, effectiveReduced } from './settings.js';
import { loadLB, saveLB, addEntry, makeEntry, qualifiesLB, describe, formatTime } from './leaderboard.js';

const cv = document.getElementById('screen'), c = cv.getContext('2d');
cv.width = W; cv.height = H; c.imageSmoothingEnabled = false;
const params = new URLSearchParams(location.search);
const startStage = Math.max(0, Math.min(3, (parseInt(params.get('stage'), 10) || 1) - 1));
let lb = loadLB(localStorage);
const app = { scene: 'title', g: null, paused: false, t: 0, entry: null, lastEntry: null };
// ambient life / daily event / activity feed (visual + Bones only; never touches the engine or the prize score)
app.event = eventFor(Date.now()); app.amb = createAmbient((Date.now() & 0xffff) || 3); app.feed = []; app.board = null; app.bones = 0;
const OVER = { time: params.get('time'), weather: params.get('weather') }; // ?time=dawn|day|dusk|night ?weather=clear|rain|leaves (visual preview)
app.feedPage = params.get('feed'); app.titleCond = () => ({ time: 'night', weather: {}, titleWeather: OVER.weather || Object.values(app.event.weather || {})[0] || 'clear', birds: app.event.birds || 1 });
window.__inu = app; import("./render.js").then(m => Object.defineProperty(app, "heroFrame", { get: () => m.heroFrame }));

// touch pad only on real touch devices; a desktop mouse never reaches PAUSE/START
const root = document.documentElement;
const hasTouch = () => ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
root.classList.toggle('notouch', !hasTouch());
addEventListener('touchstart', () => root.classList.remove('notouch'), { once: true, passive: true });
const keys = {}; let jumpEdge = false, startEdge = false;
const softPaused = () => app.paused === 'blur' || app.paused === 'pad'; // auto-pauses: any key / tap / button resumes
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
const downCodes = new Set(); // codes physically held right now (keys held from gameplay are ignored by the initials prompt)
let staleCodes = new Set();
addEventListener('keydown', e => {
  initAudio(); downCodes.add(e.code);
  if (softPaused() && app.scene === 'game') { app.paused = false; e.preventDefault(); return; } // any key resumes after focus loss / pad unplugged
  if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === 'Space' || e.code === 'KeyZ' || e.code === 'KeyX') { if (!e.repeat) jumpEdge = true; e.preventDefault(); }
  if (e.code === 'Enter') startEdge = true;
  if ((e.code === 'KeyP' || e.code === 'Escape') && app.scene === 'game') app.paused = !app.paused;
  if (e.code === 'KeyM') setSound({ muted: !isMuted() });
  if (app.scene === 'entry' && !staleCodes.has(e.code)) entryKey(e.code);
});
addEventListener('keyup', e => { downCodes.delete(e.code); staleCodes.delete(e.code); if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
addEventListener('blur', () => { downCodes.clear(); for (const k in keys) keys[k] = false; });
const autoPause = () => { if (app.scene === 'game' && !app.paused && app.g?.mode !== 'over') { app.paused = 'blur'; for (const k in keys) keys[k] = false; } };
addEventListener('blur', autoPause);
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
cv.addEventListener('pointerdown', () => { if (softPaused()) app.paused = false; });
// touch buttons: pad-level pointer tracking (multi-touch + sliding between buttons)
const pad = document.getElementById('pad');
const ptrs = new Map(); // pointerId -> key
const held = k => [...ptrs.values()].includes(k); // value null = finger down but between buttons
const btnOf = k => pad.querySelector(`[data-k="${k}"]`);
function press(k) {
  initAudio(); btnOf(k)?.classList.add('on');
  if (k === 'jump') { jumpEdge = true; if (app.scene !== 'game') startEdge = true; }
  else if (k === 'start') { startEdge = true; if (app.scene === 'entry') entryKey('Enter'); }
  else if (k === 'pause') { if (app.scene === 'game') app.paused = !app.paused; }
  else { keys[k] = true; if (app.scene === 'entry') entryKey({ left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' }[k]); }
}
function release(k) { if (held(k)) return; btnOf(k)?.classList.remove('on'); if (k in keys) keys[k] = false; }
function keyAt(x, y) { const el = document.elementFromPoint(x, y); return el?.closest?.('#pad [data-k]')?.dataset.k; }
function setPtr(id, k) {
  const prev = ptrs.get(id); if (prev === k) return;
  if (k === undefined) ptrs.delete(id); else ptrs.set(id, k);
  if (prev) release(prev);
  if (k) press(k);
}
pad.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') return; // mouse clicks never press pad buttons
  if (softPaused()) { app.paused = false; e.preventDefault(); return; } // first tap just resumes
  const k = keyAt(e.clientX, e.clientY); if (!k) return;
  e.preventDefault(); try { pad.setPointerCapture(e.pointerId); } catch {}
  setPtr(e.pointerId, k);
});
pad.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return; e.preventDefault();
  const k = keyAt(e.clientX, e.clientY);
  if (k && !['start', 'pause'].includes(k) && k !== ptrs.get(e.pointerId)) setPtr(e.pointerId, k);
  else if (!k) setPtr(e.pointerId, null); // keep tracking so sliding onto another button works
});
const up = e => { if (ptrs.has(e.pointerId)) { e.preventDefault(); setPtr(e.pointerId, undefined); } };
for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(t, up);
pad.addEventListener('pointerleave', e => { if (!pad.hasPointerCapture?.(e.pointerId)) up(e); });
// belt and braces: a pointerup/cancel that lands outside the pad (capture failed or was lost), or a touchend/touchcancel with no
// fingers left on the screen, always clears every held pad key, so a direction can never stay highlighted / keep walking.
function releasePad() { for (const id of [...ptrs.keys()]) setPtr(id, undefined); for (const el of pad.querySelectorAll('.btn.on')) el.classList.remove('on');
  for (const k of ['left', 'right', 'up', 'down']) if (!stickKeys[k]) keys[k] = false; }
for (const t of ['pointerup', 'pointercancel']) addEventListener(t, e => { if (ptrs.has(e.pointerId)) setPtr(e.pointerId, undefined); }, true);
for (const t of ['touchend', 'touchcancel']) addEventListener(t, e => { if (!e.touches || e.touches.length === 0) releasePad(); }, true);
app.releasePad = () => releasePad();
// ---- optional virtual joystick (Settings > Joystick controls, OFF by default). Own pointer tracking, so the stick and the
// JUMP/START/PAUSE buttons work at the same time (multi-touch). The D-pad path above is untouched when it's off.
const stick = document.getElementById('stick'), knob = stick.querySelector('.knob');
let settings = loadSettings(localStorage), stickId = null; const stickKeys = { left: false, right: false, up: false, down: false };
let fx = loadFx(localStorage); const autoLow = lowEndDevice(navigator, matchMedia?.('(prefers-reduced-motion: reduce)').matches); app.autoLow = autoLow;
app.reduced = () => effectiveReduced(fx, app.autoLow);
function applyFx() { const $ = id => document.getElementById(id); $('set-music').checked = fx.music; $('set-fx').checked = app.reduced();
  $('set-fx-auto').textContent = fx.reduced === null ? (app.reduced() ? 'Auto: on (low-end device or slow frames).' : 'Auto: off on this device.') : 'Your choice.'; setMusic(fx.music); }
function setFx(ch) { fx = { ...fx, ...ch }; saveFx(localStorage, fx); applyFx(); KB.K.walletUi?.save?.(); }
function applySettings() { root.classList.toggle('joy', settings.joystick); const $ = id => document.getElementById(id); applyFx();
  $('set-joy').checked = settings.joystick; $('set-mute').checked = settings.muted; $('set-vol').value = settings.volume; $('set-vol-v').textContent = settings.volume + '%';
  setMuted(settings.muted); setVolume(settings.volume / 100); stickEnd(); }
function setSound(ch) { settings = { ...settings, ...ch }; saveSettings(localStorage, settings); applySettings(); KB.K.walletUi?.save?.(); }
function stickSet(k) {
  for (const d of ['left', 'right', 'up', 'down']) { if (k[d] === stickKeys[d]) continue; stickKeys[d] = k[d]; keys[d] = k[d];
    if (k[d] && app.scene === 'entry') entryKey({ left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' }[d]); }
}
function stickMove(e) { const b = stick.getBoundingClientRect(), r = b.width / 2, dx = e.clientX - (b.left + r), dy = e.clientY - (b.top + r);
  const o = knobOffset(dx, dy, r * 0.62); knob.style.transform = `translate(${o.x}px,${o.y}px)`; stickSet(stickToKeys(dx, dy, r)); }
function stickEnd() { stickId = null; stick.classList.remove('on'); knob.style.transform = ''; stickSet({ left: false, right: false, up: false, down: false }); }
stick.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' || !settings.joystick) return; e.stopPropagation(); e.preventDefault(); initAudio();
  if (softPaused()) { app.paused = false; return; }
  stickId = e.pointerId; try { stick.setPointerCapture(e.pointerId); } catch {} stick.classList.add('on'); stickMove(e);
});
stick.addEventListener('pointermove', e => { if (e.pointerId !== stickId) return; e.preventDefault(); e.stopPropagation(); stickMove(e); });
for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(t, e => { if (e.pointerId === stickId) stickEnd(); });
addEventListener('blur', stickEnd);
for (const t of ['touchend', 'touchcancel']) addEventListener(t, e => { if (stickId !== null && (!e.touches || e.touches.length === 0)) stickEnd(); }, true); document.addEventListener('visibilitychange', () => { if (document.hidden) stickEnd(); });
// settings panel (gear button in the top-left bar)
const setBox = document.getElementById('settings'); let pausedBySettings = false;
document.getElementById('k-set').onclick = () => { if (app.scene === 'game' && !app.paused) { app.paused = true; pausedBySettings = true; } applySettings(); setBox.hidden = false; app.settingsOpen = true; };
document.getElementById('set-joy').onchange = e => { settings = { ...settings, joystick: e.target.checked }; saveSettings(localStorage, settings); applySettings(); KB.K.walletUi?.save?.(); };
document.getElementById('set-mute').onchange = e => setSound({ muted: e.target.checked });
document.getElementById('set-vol').oninput = e => { setSound({ volume: +e.target.value, muted: false }); initAudio(); play('toy'); };
document.getElementById('set-music').onchange = e => setFx({ music: e.target.checked });
document.getElementById('set-fx').onchange = e => setFx({ reduced: e.target.checked });
document.getElementById('set-close').onclick = () => { setBox.hidden = true; app.settingsOpen = false; padFocus(-1); if (pausedBySettings) { app.paused = false; pausedBySettings = false; } };
for (const t of ['pointerdown', 'touchstart']) setBox.addEventListener(t, e => e.stopPropagation(), { passive: true });
applySettings(); app.settings = () => settings;
// ---- game controllers (Gamepad API): polled once per frame in the game loop; hot-plug via events + polling diff
const pads = createPads(() => navigator.getGamepads?.() || []); app.pads = pads; app.padMenuI = 0; app.padToast = null;
addEventListener('gamepadconnected', e => pads.connected(e)); addEventListener('gamepaddisconnected', e => pads.disconnected(e));
let padHeld = {}, padI = -1;
const focusables = () => [...setBox.querySelectorAll('input, button')].filter(el => el.offsetParent !== null && !el.disabled);
function padFocus(i) { const els = focusables(); setBox.querySelectorAll('.padfocus').forEach(el => el.classList.remove('padfocus'));
  padI = i < 0 ? -1 : (i + els.length) % els.length; const el = els[padI]; if (!el) return;
  const box = el.closest('label') || el; box.classList.add('padfocus'); el.focus({ preventScroll: true }); box.scrollIntoView?.({ block: 'nearest' }); }
const padAct = {
  toast: ev => { app.padToast = { ...ev, t: app.t }; showPadToast(ev); },
  releaseAll: () => { for (const k in keys) keys[k] = false; padHeld = {}; },
  toggleMute: () => setSound({ muted: !isMuted() }),
  startGame: () => { initAudio(); newGame(); },
  openSettings: () => { document.getElementById('k-set').click(); padFocus(0); },
  closeSettings: () => document.getElementById('set-close').click(),
  settingsMove: d => padFocus(padI < 0 ? 0 : padI + d),
  settingsAdjust: d => { const el = focusables()[padI]; if (el?.type !== 'range') return; el.value = Math.max(+el.min, Math.min(+el.max, +el.value + d * (+el.step || 5))); el.dispatchEvent(new Event('input', { bubbles: true })); },
  settingsActivate: () => { const el = focusables()[padI]; if (el && el.type !== 'range') el.click(); if (padI >= 0 && !setBox.hidden) padFocus(padI); },
  entryKey: code => entryKey(code),
  toTitle: () => { app.scene = 'title'; recalcFeed(); refreshFeed(true); },
};
// Connect / disconnect toast: a small DOM pill parked in free page space (side gutter / bottom-left), never over the canvas,
// HUD, touch controls, wallet chrome or the profile badge. ~2.8s with a fade-out. Glyphs are plain characters / letters.
const toastEl = document.createElement('div'); toastEl.id = 'pad-toast'; toastEl.setAttribute('role', 'status'); toastEl.hidden = true; document.body.appendChild(toastEl);
const GCH = { cross: '✕', circle: '○', square: '□', triangle: '△' };
const glyph = (brand, k) => { const v = (GLYPHS[brand] || GLYPHS.generic)[k]; return k === 'start' ? `<i class="gl st">${v}</i>` : `<i class="gl">${GCH[v] || v}</i>`; };
function placeToast() {
  const gap = 6, w = toastEl.offsetWidth, h = toastEl.offsetHeight, vw = innerWidth, vh = innerHeight;
  const cr = cv.getBoundingClientRect(), bg = el => !el || el === toastEl || toastEl.contains(el) || el === document.body || el === root || el === pad || el.contains(cv);
  const clearAt = (x, y) => document.elementsFromPoint(x, y).filter(el => el !== toastEl && !toastEl.contains(el)).slice(0, 1).every(bg); // shadow-DOM chrome (wallet, legal, badge) shows up as its host
  const free = (x, y) => { if (x < 0 || y < 0 || x + w > vw || y + h > vh) return false;
    if (x < cr.right + gap && x + w > cr.left - gap && y < cr.bottom + gap && y + h > cr.top - gap) return false;
    for (let px = x - gap; px <= x + w + gap; px += Math.min(8, (w + 2 * gap) / 2)) for (let py = y - gap; py <= y + h + gap; py += Math.min(8, (h + 2 * gap) / 2)) if (!clearAt(Math.min(vw - 1, Math.max(0, px)), Math.min(vh - 1, Math.max(0, py)))) return false;
    return true; };
  const cands = [[8, vh - h - 28], [8, vh - h - 8]]; // bottom-left (desktop: above the legal footer)
  for (let y = 8; y + h <= vh; y += 6) { cands.push([Math.max(8, (cr.left - w) / 2), y]); cands.push([Math.min(vw - w - 8, cr.right + (vw - cr.right - w) / 2), y]); } // side gutters, top to bottom
  for (let y = cr.bottom + 4; y + h <= vh; y += 6) cands.push([(vw - w) / 2, y]); // portrait: below the canvas
  const hit = cands.find(([x, y]) => free(x, y));
  if (!hit) { toastEl.hidden = true; return false; } // no free space: skip the toast rather than cover the game
  toastEl.style.left = Math.round(hit[0]) + 'px'; toastEl.style.top = Math.round(hit[1]) + 'px'; return true;
}
function showPadToast(ev) {
  const G = GLYPHS[ev.brand] || GLYPHS.generic, onl = ev.type === 'connected';
  toastEl.className = onl ? 'on' : 'off';
  toastEl.innerHTML = `<b>${onl ? '🎮' : '⚠'} ${G.name} ${onl ? 'connected' : 'disconnected'}</b>` + (onl ? `<span>${glyph(ev.brand, 'a')} jump ${glyph(ev.brand, 'b')} back ${glyph(ev.brand, 'start')} pause</span>` : '<span>Game paused</span>');
  toastEl.hidden = false; toastEl.style.left = '-999px'; toastEl.style.top = '0px'; toastEl.classList.remove('fade'); clearTimeout(showPadToast.t); clearTimeout(showPadToast.h);
  if (!placeToast()) return;
  showPadToast.t = setTimeout(() => toastEl.classList.add('fade'), 2300); showPadToast.h = setTimeout(() => { toastEl.hidden = true; }, 2800);
}
function padFrame(dt) {
  if (document.hidden) { padHeld = {}; return; }
  const r = pads.poll(dt); if (!r.count && !r.events.length) { padHeld = {}; return; }
  if (r.anyPress) initAudio();
  const res = applyPad(app, r, padAct); if (res.jump) jumpEdge = true;
  padHeld = app.settingsOpen || app.scene !== 'game' ? {} : r.held;
}
// block native touch gestures: selection, callout, double-tap zoom, scroll/bounce, pinch
for (const t of ['touchstart', 'touchmove', 'touchend']) document.addEventListener(t, e => { if (e.cancelable && (e.target.closest?.('#pad, canvas') || t === 'touchmove' || e.touches.length > 1)) e.preventDefault(); }, { passive: false });
for (const t of ['contextmenu', 'selectstart', 'dragstart', 'gesturestart', 'dblclick']) document.addEventListener(t, e => e.preventDefault());
addEventListener('blur', () => { for (const id of [...ptrs.keys()]) setPtr(id, undefined); });
document.addEventListener('visibilitychange', () => { if (document.hidden) for (const id of [...ptrs.keys()]) setPtr(id, undefined); });

const LET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ', NAME_MAX = 8, BLANK = LET.length - 1;
const ENTRY_GUARD_MS = 400; // gameplay input still in flight when Game Over appears must not type initials
function entryKey(code) {
  const en = app.entry; if (!en || performance.now() - en.at < ENTRY_GUARD_MS) return;
  const typed = /^Key([A-Z])$|^Digit([0-9])$/.exec(code);
  if (typed) { en.ch[en.i] = LET.indexOf(typed[1] || typed[2]); en.i = Math.min(NAME_MAX - 1, en.i + 1); return; }
  if (code === 'Backspace') { en.ch[en.i] = BLANK; en.i = Math.max(0, en.i - 1); return; }
  if (code === 'ArrowUp') en.ch[en.i] = (en.ch[en.i] + 1) % LET.length;
  else if (code === 'ArrowDown') en.ch[en.i] = (en.ch[en.i] + LET.length - 1) % LET.length;
  else if (code === 'ArrowLeft') en.i = Math.max(0, en.i - 1);
  else if (code === 'ArrowRight') en.i = Math.min(NAME_MAX - 1, en.i + 1);
  else if (code === 'Enter' || code === 'Space') {
    if (en.i < NAME_MAX - 1 && en.ch[en.i] !== BLANK) { en.i++; return; } // ENTER on a blank slot (or the 8th) finishes
    const e = makeEntry(en.ch.map(i => LET[i]).join('').trim(), en.prog); lb = addEntry(lb, e); saveLB(localStorage, lb);
    app.lastEntry = e; app.entry = null; app.scene = 'over'; app.overT = 0;
  }
}
// ---- $KIBBLE bar: Shop + Settings (Connect Wallet = shared #inu-wallet pill only; no duplicate Sign in) ----
const kbar = document.getElementById('kbar'), kstat = document.getElementById('k-status'), kmsg = document.getElementById('k-msg');
let lookNow = {};
const relook = () => { lookNow = KB.look(); app.look = lookNow; };
function kbarUi(msg) {
  const m = KB.K.mode; document.documentElement.dataset.kibble = m;
  // Status chip only for demo / loading / offline. Live signed-in chrome = #inu-wallet pill (replaces Connect Wallet immediately).
  if (kstat) {
    let label = '';
    if (m === 'demo') label = 'DEMO';
    else if (m === 'loading') label = 'Wallet…';
    else if (m === 'offline' || m === 'soon') label = 'Wallet offline';
    kstat.hidden = !label; kstat.textContent = label; kstat.dataset.mode = m || '';
  }
  if (msg !== undefined) { kmsg.textContent = msg; clearTimeout(kbarUi.t); kbarUi.t = setTimeout(() => (kmsg.textContent = ''), 5000); }
  relook();
}
document.getElementById('k-shop').onclick = async () => { const was = app.paused; app.paused = app.scene === 'game' ? true : app.paused;
  await KB.openShop(() => kbarUi()).catch(() => null);
  if (!KB.K.glue) { app.paused = was; kbarUi(KB.SOON_MSG); } }; // wallet service unreachable: say so and resume, never a silent paused game
for (const t of ['pointerdown', 'touchstart']) kbar.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
kbar.addEventListener('click', () => setTimeout(() => document.activeElement?.blur?.(), 0));
KB.initKibble({ onChange: () => kbarUi() }); kbarUi();
async function postRun(prog) { const r = await KB.postRun(prog); app.posted = r.skipped ? null : r.ok ? `POSTED ${KB.runScore(prog)} TO PRIZE BOARD` : 'SCORE NOT POSTED: ' + String(r.reason || r.error || '').slice(0, 28).toUpperCase(); }
function newGame() { const seed = (Date.now() & 0xffff) || 7; app.g = createGame({ seed, stage: startStage }); app.scene = 'game'; app.paused = false;
  app.event = eventFor(Date.now()); app.runEvent = app.event; app.cond = runConditions(seed, app.runEvent, OVER); app.runPups = [0, 0, 0, 0]; app.lastSaved = 0; app.bonesGained = 0; }
// Bones for the run: pups saved per stage x today's event bonus. Separate from the prize score (runScore) and the engine score.
function grantBones() { const r = awardBones(localStorage, app.runPups || [0, 0, 0, 0], app.runEvent || app.event, sydneyDate()); app.bonesGained = r.gained; app.bones = r.state.bones; if (r.gained) KB.K.walletUi?.save?.(); }
// clear all held gameplay input (keyboard, touch pad, stick, controller) so nothing carries into the initials prompt
function clearInput() { for (const k in keys) keys[k] = false; jumpEdge = false; startEdge = false; padHeld = {}; staleCodes = new Set(downCodes);
  releasePad(); stickEnd(); }
function endGame() {
  const prog = progress(app.g); app.lastProg = prog; app.posted = null; postRun(prog); grantBones();
  if (qualifiesLB(lb, prog)) { app.scene = 'entry'; app.entry = { ch: [8, 13, 20].concat(Array(NAME_MAX - 3).fill(BLANK)), i: 0, prog, at: performance.now() }; clearInput(); }
  else { app.scene = 'over'; app.overT = 0; app.lastEntry = null; }
}

// haptics on touch phones (no-op elsewhere)
const BUZZ = { die: [60, 40, 90], pup: [20, 30, 20], clear: [30, 30, 30, 30, 60], hammer: 25, extralife: [20, 20, 20] };
function buzz(ev) { if (BUZZ[ev] && !isMuted() && !root.classList.contains('notouch')) try { navigator.vibrate?.(BUZZ[ev]); } catch {} }
// vsync snap: rAF timestamps wobble +-1-2ms, so a raw 1/60 accumulator ran 0 or 2 sim steps on ~40% of frames (visible stutter).
// Snap dt to the nearest whole 60Hz frame when it is within 2ms of one; a residual drift guard keeps acc from flip-flopping at the edge.
export function snapDt(dt) { const k = Math.round(dt * 60); return k >= 1 && Math.abs(dt - k / 60) < 0.002 ? k / 60 : dt; }
let acc = 0, last = performance.now();
function frame(now) {
  const dt = snapDt(Math.min(0.1, (now - last) / 1000)); last = now; app.t += dt;
  padFrame(dt);
  if (app.scene === 'title') { if (startEdge || jumpEdge) newGame(); }
  else if (app.scene === 'game' && !app.paused) {
    acc += dt; let nSteps = 0;
    while (acc >= 1 / 60 - 1e-6) { acc = Math.max(0, acc - 1 / 60); nSteps++;
      step(app.g, { left: keys.left || !!padHeld.left, right: keys.right || !!padHeld.right, up: keys.up || !!padHeld.up, down: keys.down || !!padHeld.down, jump: jumpEdge }); jumpEdge = false;
      for (const ev of app.g.events) { play(ev); buzz(ev); }
      if ((app.g.saved || 0) > app.lastSaved) { app.runPups[app.g.stage % 4] += app.g.saved - app.lastSaved; app.lastSaved = app.g.saved; }
      if (app.g.mode === 'over') { endGame(); break; } }
    (window.__stepHist ||= {})[nSteps] = (window.__stepHist[nSteps] || 0) + 1; // jitter probe: sim steps per rendered frame
  } else if (app.scene === 'over') { app.overT += dt; if (app.overT > 1 && (startEdge || jumpEdge)) { app.scene = 'title'; recalcFeed(); refreshFeed(true); } }
  else acc = 0;
  startEdge = false; if (app.scene !== 'game') jumpEdge = false;
  ambientFrame(dt); render(); requestAnimationFrame(frame);
}
// ---- ambient: scene per stage, frozen while paused; frames only run while the tab is visible (rAF), audio context suspended when hidden
let ema = 1 / 60, slowFor = 0;
function ambientFrame(dt) {
  if (dt > 0 && dt < 0.25) { ema += (dt - ema) * 0.05; slowFor = ema > 1 / 40 ? slowFor + dt : 0; if (slowFor > 3 && fx.reduced === null && !app.autoLow) { app.autoLow = true; applyFx(); } }
  const inGame = app.scene !== 'title' && app.g, theme = inGame ? app.g.S.theme : 'title', cond = inGame ? app.cond : app.titleCond(), red = app.reduced();
  const sig = theme + '|' + red + '|' + JSON.stringify(cond) + '|' + (inGame ? app.g.stage + ':' + app.g.loop : '');
  if (sig !== app.ambSig) { app.ambSig = sig; setScene(app.amb, theme, cond, { reduced: red, plats: inGame ? app.g.plats : null }); }
  if (!app.paused) updateAmbient(app.amb, dt);
  setAmbience(theme, { rain: (theme === 'title' ? cond.titleWeather : cond.weather?.[theme]) === 'rain', night: inGame && cond.time === 'night', paused: !!app.paused || app.scene === 'over' || app.scene === 'entry' }); tickAmbience();
}
// ---- real-activity feed: kibble-pay daily board for inu-rescue@v2 + this device's runs today. Refreshed on the title only.
let feedAt = -1e9;
function refreshFeed(force) {
  const now = Date.now(); if (document.hidden || (!force && now - feedAt < 90000)) return; feedAt = now;
  fetchBoard().then(b => { app.board = b; recalcFeed(); });
}
function recalcFeed() { const today = sydneyDate(); app.event = app.scene === 'game' ? app.event : eventFor(Date.now()); app.feed = buildFeed({ board: app.board, lb, today }); app.bones = loadBones(localStorage, today).bones; }
setInterval(() => { if (app.scene === 'title' && !document.hidden) { recalcFeed(); refreshFeed(); } }, 5000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && app.scene === 'title') refreshFeed(); });
recalcFeed(); refreshFeed(true); app.counts = () => counts(app.amb);
function render() { draw(); }
function draw() {
  const hi = lb.reduce((m, e) => Math.max(m, e.score), 0);
  if (app.scene === 'title') return drawTitle(c, app.t, lb, describe, formatTime, lookNow, !root.classList.contains('notouch') && (root.classList.contains('joy') ? 'joy' : true), { amb: app.amb, event: app.event, feed: app.feed, feedPage: app.feedPage, bones: app.bones, pad: pads.count ? { i: app.padMenuI || 0, brand: pads.brand } : null });
  drawGame(c, app.g, { hi, paused: app.paused, touch: !root.classList.contains('notouch'), look: lookNow, amb: app.amb, pad: pads.count ? { items: PAUSE_MENU, i: app.padMenuI || 0, brand: pads.brand } : null });
  if (app.scene === 'entry' || app.scene === 'over') {
    c.fillStyle = '#000d'; c.fillRect(16, 48, W - 32, 150);
    text(c, 'GAME OVER', W / 2, 54, '#e05a6a', 'center', 16);
    const pr = app.lastProg; text(c, describe(pr), W / 2, 76, '#f0c840', 'center', 7);
    text(c, `score ${pr.score}  pups saved ${pr.saved || 0}${app.bonesGained ? `  +${app.bonesGained} BONES` : ''}`, W / 2, 86, '#ccc', 'center', 7);
    if (app.posted) text(c, app.posted, W / 2, 93, '#7ae07a', 'center', 6);
    if (app.scene === 'entry') {
      text(c, 'NEW BEST RUN! ENTER INITIALS', W / 2, 102, '#7ae07a', 'center', 7);
      app.entry.ch.forEach((ch, i) => { const x = W / 2 - 3.5 * 22 + i * 22; text(c, ch === BLANK ? '_' : LET[ch], x, 116, i === app.entry.i ? '#fff' : '#888', 'center', 16);
        if (i === app.entry.i) { c.fillStyle = '#fff'; c.fillRect(x - 5, 134, 10, 1); } });
      if (pads.count) padHint(c, pads.brand, [['a', 'NEXT'], ['b', 'DELETE']], 142); else text(c, 'TYPE or UP/DOWN  ENTER next  ENTER on _ = done', W / 2, 142, '#888', 'center', 6);
    } else {
      text(c, 'LEADERBOARD (progress, then time)', W / 2, 100, '#5ad0d8', 'center', 7);
      lb.slice(0, 8).forEach((e, i) => text(c, `${String(i + 1).padStart(2)} ${e.name} S${e.stage} H${String(e.height).padStart(3)} ${formatTime(e.timeMs)}`, 40, 112 + i * 10, e === app.lastEntry ? '#f0c840' : '#ccc', 'left', 7));
      if (app.overT > 1) { if (pads.count) padHint(c, pads.brand, [['a', 'CONTINUE']], 186); else text(c, 'PRESS ENTER', W / 2, 186, '#fff', 'center', 7); }
    }
  }
}
requestAnimationFrame(frame);
// live rotation/resize: reset scroll, drop stuck touches
const relayout = () => { scrollTo(0, 0); for (const id of [...ptrs.keys()]) setPtr(id, undefined); stickEnd(); document.documentElement.dataset.orient = innerWidth > innerHeight ? 'landscape' : 'portrait'; };
addEventListener('resize', relayout); addEventListener('orientationchange', relayout); screen.orientation?.addEventListener?.('change', relayout); relayout();
// 🏠 Back to Inu Verse hooks (kibble-pay mountHome): confirm mid-match, save first.
globalThis.__inuHome = { busy: () => app.scene === 'game' && app.g && app.g.mode !== 'over' ? 'Leave this run and go back to Inu Verse? The current run ends (your best score is kept).' : false };
