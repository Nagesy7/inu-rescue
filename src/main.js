import { createGame, step, progress, W, H } from './engine.js';
import { drawGame, drawTitle, text } from './render.js';
import { initAudio, play, setMuted, isMuted, setVolume } from './audio.js';
import * as KB from './kibble.js';
import { loadSettings, saveSettings, stickToKeys, knobOffset } from './settings.js';
import { loadLB, saveLB, addEntry, makeEntry, qualifiesLB, describe, formatTime } from './leaderboard.js';

const cv = document.getElementById('screen'), c = cv.getContext('2d');
cv.width = W; cv.height = H; c.imageSmoothingEnabled = false;
const params = new URLSearchParams(location.search);
const startStage = Math.max(0, Math.min(3, (parseInt(params.get('stage'), 10) || 1) - 1));
let lb = loadLB(localStorage);
const app = { scene: 'title', g: null, paused: false, t: 0, entry: null, lastEntry: null };
window.__inu = app; import("./render.js").then(m => Object.defineProperty(app, "heroFrame", { get: () => m.heroFrame }));

// touch pad only on real touch devices; a desktop mouse never reaches PAUSE/START
const root = document.documentElement;
const hasTouch = () => ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
root.classList.toggle('notouch', !hasTouch());
addEventListener('touchstart', () => root.classList.remove('notouch'), { once: true, passive: true });
const keys = {}; let jumpEdge = false, startEdge = false;
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
addEventListener('keydown', e => {
  initAudio();
  if (app.paused === 'blur' && app.scene === 'game') { app.paused = false; e.preventDefault(); return; } // any key resumes after focus loss
  if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === 'Space' || e.code === 'KeyZ' || e.code === 'KeyX') { if (!e.repeat) jumpEdge = true; e.preventDefault(); }
  if (e.code === 'Enter') startEdge = true;
  if ((e.code === 'KeyP' || e.code === 'Escape') && app.scene === 'game') app.paused = !app.paused;
  if (e.code === 'KeyM') setSound({ muted: !isMuted() });
  if (app.scene === 'entry') entryKey(e.code);
});
addEventListener('keyup', e => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
const autoPause = () => { if (app.scene === 'game' && !app.paused && app.g?.mode !== 'over') { app.paused = 'blur'; for (const k in keys) keys[k] = false; } };
addEventListener('blur', autoPause);
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
cv.addEventListener('pointerdown', () => { if (app.paused === 'blur') app.paused = false; });
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
  if (app.paused === 'blur') { app.paused = false; e.preventDefault(); return; } // first tap just resumes
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
// ---- optional virtual joystick (Settings > Joystick controls, OFF by default). Own pointer tracking, so the stick and the
// JUMP/START/PAUSE buttons work at the same time (multi-touch). The D-pad path above is untouched when it's off.
const stick = document.getElementById('stick'), knob = stick.querySelector('.knob');
let settings = loadSettings(localStorage), stickId = null; const stickKeys = { left: false, right: false, up: false, down: false };
function applySettings() { root.classList.toggle('joy', settings.joystick); const $ = id => document.getElementById(id);
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
  if (app.paused === 'blur') { app.paused = false; return; }
  stickId = e.pointerId; try { stick.setPointerCapture(e.pointerId); } catch {} stick.classList.add('on'); stickMove(e);
});
stick.addEventListener('pointermove', e => { if (e.pointerId !== stickId) return; e.preventDefault(); e.stopPropagation(); stickMove(e); });
for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(t, e => { if (e.pointerId === stickId) stickEnd(); });
addEventListener('blur', stickEnd); document.addEventListener('visibilitychange', () => { if (document.hidden) stickEnd(); });
// settings panel (gear button in the top-left bar)
const setBox = document.getElementById('settings'); let pausedBySettings = false;
document.getElementById('k-set').onclick = () => { if (app.scene === 'game' && !app.paused) { app.paused = true; pausedBySettings = true; } applySettings(); setBox.hidden = false; };
document.getElementById('set-joy').onchange = e => { settings = { ...settings, joystick: e.target.checked }; saveSettings(localStorage, settings); applySettings(); KB.K.walletUi?.save?.(); };
document.getElementById('set-mute').onchange = e => setSound({ muted: e.target.checked });
document.getElementById('set-vol').oninput = e => { setSound({ volume: +e.target.value, muted: false }); initAudio(); play('toy'); };
document.getElementById('set-close').onclick = () => { setBox.hidden = true; if (pausedBySettings) { app.paused = false; pausedBySettings = false; } };
for (const t of ['pointerdown', 'touchstart']) setBox.addEventListener(t, e => e.stopPropagation(), { passive: true });
applySettings(); app.settings = () => settings;
// block native touch gestures: selection, callout, double-tap zoom, scroll/bounce, pinch
for (const t of ['touchstart', 'touchmove', 'touchend']) document.addEventListener(t, e => { if (e.cancelable && (e.target.closest?.('#pad, canvas') || t === 'touchmove' || e.touches.length > 1)) e.preventDefault(); }, { passive: false });
for (const t of ['contextmenu', 'selectstart', 'dragstart', 'gesturestart', 'dblclick']) document.addEventListener(t, e => e.preventDefault());
addEventListener('blur', () => { for (const id of [...ptrs.keys()]) setPtr(id, undefined); });
document.addEventListener('visibilitychange', () => { if (document.hidden) for (const id of [...ptrs.keys()]) setPtr(id, undefined); });

const LET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ', NAME_MAX = 8, BLANK = LET.length - 1;
function entryKey(code) {
  const en = app.entry; if (!en) return;
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
// ---- $KIBBLE bar (wallet sign-in + shared shop). DOM, outside the canvas; phone-landscape safe (top-left corner) ----
const kbar = document.getElementById('kbar'), kwal = document.getElementById('k-wallet'), kmsg = document.getElementById('k-msg');
let lookNow = {};
const relook = () => { lookNow = KB.look(); app.look = lookNow; };
function kbarUi(msg) {
  const m = KB.K.mode; document.documentElement.dataset.kibble = m;
  kwal.textContent = m === 'demo' ? 'DEMO' : KB.K.address ? KB.K.address.slice(0, 4) + '…' + KB.K.address.slice(-4) : 'Sign in';
  if (msg !== undefined) { kmsg.textContent = msg; clearTimeout(kbarUi.t); kbarUi.t = setTimeout(() => (kmsg.textContent = ''), 5000); }
  relook();
}
kwal.onclick = async () => { if (KB.K.mode === 'demo') return kbarUi('Demo mode: fake KIBBLE. Remove ?demo=1 to use Phantom.');
  try { await KB.signIn(); kbarUi('Signed in: runs that save a pup post to the prize board.'); } catch (e) { kbarUi(e.message || 'Sign-in failed'); } };
document.getElementById('k-shop').onclick = () => { app.paused = app.scene === 'game' ? true : app.paused; KB.openShop(() => kbarUi()); };
for (const t of ['pointerdown', 'touchstart']) kbar.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
kbar.addEventListener('click', () => setTimeout(() => document.activeElement?.blur?.(), 0));
KB.initKibble({ onChange: () => kbarUi() }); kbarUi();
async function postRun(prog) { const r = await KB.postRun(prog); app.posted = r.skipped ? null : r.ok ? `POSTED ${KB.runScore(prog)} TO PRIZE BOARD` : 'SCORE NOT POSTED: ' + String(r.reason || r.error || '').slice(0, 28).toUpperCase(); }
function newGame() { app.g = createGame({ seed: (Date.now() & 0xffff) || 7, stage: startStage }); app.scene = 'game'; app.paused = false; }
function endGame() {
  const prog = progress(app.g); app.lastProg = prog; app.posted = null; postRun(prog);
  if (qualifiesLB(lb, prog)) { app.scene = 'entry'; app.entry = { ch: [8, 13, 20].concat(Array(NAME_MAX - 3).fill(BLANK)), i: 0, prog }; }
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
  if (app.scene === 'title') { if (startEdge || jumpEdge) newGame(); }
  else if (app.scene === 'game' && !app.paused) {
    acc += dt; let nSteps = 0;
    while (acc >= 1 / 60 - 1e-6) { acc = Math.max(0, acc - 1 / 60); nSteps++;
      step(app.g, { ...keys, jump: jumpEdge }); jumpEdge = false;
      for (const ev of app.g.events) { play(ev); buzz(ev); }
      if (app.g.mode === 'over') { endGame(); break; } }
    (window.__stepHist ||= {})[nSteps] = (window.__stepHist[nSteps] || 0) + 1; // jitter probe: sim steps per rendered frame
  } else if (app.scene === 'over') { app.overT += dt; if (app.overT > 1 && (startEdge || jumpEdge)) app.scene = 'title'; }
  else acc = 0;
  startEdge = false; if (app.scene !== 'game') jumpEdge = false;
  render(); requestAnimationFrame(frame);
}
function render() {
  const hi = lb.reduce((m, e) => Math.max(m, e.score), 0);
  if (app.scene === 'title') return drawTitle(c, app.t, lb, describe, formatTime, lookNow, !root.classList.contains('notouch') && (root.classList.contains('joy') ? 'joy' : true));
  drawGame(c, app.g, { hi, paused: app.paused, touch: !root.classList.contains('notouch'), look: lookNow });
  if (app.scene === 'entry' || app.scene === 'over') {
    c.fillStyle = '#000d'; c.fillRect(16, 48, W - 32, 150);
    text(c, 'GAME OVER', W / 2, 54, '#e05a6a', 'center', 16);
    const pr = app.lastProg; text(c, describe(pr), W / 2, 76, '#f0c840', 'center', 7);
    text(c, `score ${pr.score}  pups saved ${pr.saved || 0}`, W / 2, 86, '#ccc', 'center', 7);
    if (app.posted) text(c, app.posted, W / 2, 93, '#7ae07a', 'center', 6);
    if (app.scene === 'entry') {
      text(c, 'NEW BEST RUN! ENTER INITIALS', W / 2, 102, '#7ae07a', 'center', 7);
      app.entry.ch.forEach((ch, i) => { const x = W / 2 - 3.5 * 22 + i * 22; text(c, ch === BLANK ? '_' : LET[ch], x, 116, i === app.entry.i ? '#fff' : '#888', 'center', 16);
        if (i === app.entry.i) { c.fillStyle = '#fff'; c.fillRect(x - 5, 134, 10, 1); } });
      text(c, 'TYPE or UP/DOWN  ENTER next  ENTER on _ = done', W / 2, 142, '#888', 'center', 6);
    } else {
      text(c, 'LEADERBOARD (progress, then time)', W / 2, 100, '#5ad0d8', 'center', 7);
      lb.slice(0, 8).forEach((e, i) => text(c, `${String(i + 1).padStart(2)} ${e.name} S${e.stage} H${String(e.height).padStart(3)} ${formatTime(e.timeMs)}`, 40, 112 + i * 10, e === app.lastEntry ? '#f0c840' : '#ccc', 'left', 7));
      if (app.overT > 1) text(c, 'PRESS ENTER', W / 2, 186, '#fff', 'center', 7);
    }
  }
}
requestAnimationFrame(frame);
// live rotation/resize: reset scroll, drop stuck touches
const relayout = () => { scrollTo(0, 0); for (const id of [...ptrs.keys()]) setPtr(id, undefined); stickEnd(); document.documentElement.dataset.orient = innerWidth > innerHeight ? 'landscape' : 'portrait'; };
addEventListener('resize', relayout); addEventListener('orientationchange', relayout); screen.orientation?.addEventListener?.('change', relayout); relayout();
// 🏠 Back to Inu Verse hooks (kibble-pay mountHome): confirm mid-match, save first.
globalThis.__inuHome = { busy: () => app.scene === 'game' && app.g && app.g.mode !== 'over' ? 'Leave this run and go back to Inu Verse? The current run ends (your best score is kept).' : false };
