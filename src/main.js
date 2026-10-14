import { createGame, step, progress, W, H } from './engine.js';
import { drawGame, drawTitle, text } from './render.js';
import { initAudio, play, setMuted, isMuted } from './audio.js';
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
  if (e.code === 'KeyM') setMuted(!isMuted());
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
function newGame() { app.g = createGame({ seed: (Date.now() & 0xffff) || 7, stage: startStage }); app.scene = 'game'; app.paused = false; }
function endGame() {
  const prog = progress(app.g); app.lastProg = prog;
  if (qualifiesLB(lb, prog)) { app.scene = 'entry'; app.entry = { ch: [8, 13, 20].concat(Array(NAME_MAX - 3).fill(BLANK)), i: 0, prog }; }
  else { app.scene = 'over'; app.overT = 0; app.lastEntry = null; }
}

let acc = 0, last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; app.t += dt;
  if (app.scene === 'title') { if (startEdge || jumpEdge) newGame(); }
  else if (app.scene === 'game' && !app.paused) {
    acc += dt;
    while (acc >= 1 / 60) { acc -= 1 / 60;
      step(app.g, { ...keys, jump: jumpEdge }); jumpEdge = false;
      for (const ev of app.g.events) play(ev);
      if (app.g.mode === 'over') { endGame(); break; } }
  } else if (app.scene === 'over') { app.overT += dt; if (app.overT > 1 && (startEdge || jumpEdge)) app.scene = 'title'; }
  else acc = 0;
  startEdge = false; if (app.scene !== 'game') jumpEdge = false;
  render(); requestAnimationFrame(frame);
}
function render() {
  const hi = lb.reduce((m, e) => Math.max(m, e.score), 0);
  if (app.scene === 'title') return drawTitle(c, app.t, lb, describe, formatTime);
  drawGame(c, app.g, { hi, paused: app.paused, touch: !root.classList.contains('notouch') });
  if (app.scene === 'entry' || app.scene === 'over') {
    c.fillStyle = '#000d'; c.fillRect(16, 48, W - 32, 150);
    text(c, 'GAME OVER', W / 2, 54, '#e05a6a', 'center', 16);
    const pr = app.lastProg; text(c, describe(pr), W / 2, 76, '#f0c840', 'center', 7);
    text(c, `score ${pr.score}`, W / 2, 86, '#ccc', 'center', 7);
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
const relayout = () => { scrollTo(0, 0); for (const id of [...ptrs.keys()]) setPtr(id, undefined); document.documentElement.dataset.orient = innerWidth > innerHeight ? 'landscape' : 'portrait'; };
addEventListener('resize', relayout); addEventListener('orientationchange', relayout); screen.orientation?.addEventListener?.('change', relayout); relayout();
