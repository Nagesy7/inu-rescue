// Tiny WebAudio sfx synth (no assets).
let ac = null, muted = false, master = null, volume = 1; // master gain = settings volume (0..1)
export function initAudio() { try { if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = volume; master.connect(ac.destination); } if (ac.state === 'suspended' && !document.hidden) ac.resume(); } catch { ac = null; } } // one context, resumed on gesture
if (typeof document !== 'undefined') { document.addEventListener('visibilitychange', () => { if (!ac) return; if (document.hidden) ac.suspend?.(); else ac.resume?.(); }); addEventListener('pagehide', () => ac?.suspend?.()); }
// one-shot limiter: per-SFX cooldown + max concurrent voices (events fire per sim step; bursts of the same event must not stack)
const CD = { land: 0.08, bounce: 0.06, tin: 0.06, flea: 0.08, ladderroll: 0.1, cathop: 0.08, score: 0.05 }, lastAt = {}; let ends = [];
export const MAX_VOICES = 8;
export function gate(name, now, cd = CD[name] ?? 0.04, dur = 0.3) { ends = ends.filter((t) => t > now); if (ends.length >= MAX_VOICES || now - (lastAt[name] ?? -1e9) < cd) return false; lastAt[name] = now; ends.push(now + dur); return true; }
export function setMuted(m) { muted = !!m; syncBus(); } export function isMuted() { return muted; }
export function setVolume(v) { volume = Math.max(0, Math.min(1, +v || 0)); if (master) master.gain.value = volume; syncBus(); } export function getVolume() { return volume; }
function tone(f0, f1, dur, type = 'square', vol = 0.08, delay = 0) {
  if (!ac || muted) return; const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(master || ac.destination); o.start(t); o.stop(t + dur + 0.02);
}
const seq = (notes, step = 0.1, type = 'square') => notes.forEach((n, i) => tone(n, n, step * 0.9, type, 0.07, i * step));
const SFX = {
  jump: () => tone(300, 700, 0.15), land: () => tone(120, 80, 0.05, 'triangle', 0.05), score: () => seq([880, 1320], 0.06),
  hammer: () => seq([523, 659, 784, 1046], 0.07), smash: () => tone(900, 60, 0.18, 'sawtooth', 0.09), die: () => seq([600, 500, 400, 300, 200, 120], 0.12, 'triangle'),
  clear: () => seq([523, 659, 784, 1046, 784, 1046, 1318], 0.11), throw: () => tone(200, 90, 0.12, 'sawtooth', 0.05), flea: () => tone(1200, 1800, 0.08, 'square', 0.03),
  toy: () => seq([1046, 1318, 1568], 0.06), bounce: () => tone(400, 200, 0.06, 'triangle', 0.04),
  start: () => seq([392, 523, 659, 784], 0.09), gameover: () => seq([392, 349, 311, 262], 0.22, 'triangle'), extralife: () => seq([784, 988, 1175, 1568], 0.08),
  pup: () => seq([988, 1318, 1568, 1976], 0.07), cathop: () => tone(500, 900, 0.12, 'triangle', 0.04), tin: () => tone(1400, 900, 0.06, 'square', 0.03),
  clank: () => tone(700, 140, 0.14, 'sawtooth', 0.07), split: () => seq([660, 440], 0.05),
  hammerend: () => tone(400, 200, 0.1), checkpoint: () => seq([659, 988], 0.07), ladderroll: () => tone(160, 110, 0.08, 'triangle', 0.04),
};
export function play(ev) { const f = SFX[ev]; if (f && ac && !muted && volume > 0 && gate(ev, ac.currentTime)) f(); }
// ---- ambience + light music per stage (all generated here; no recorded or copyrighted audio) ----
// Routed through its own bus into the same master gain, so the settings volume applies; nothing is scheduled while muted,
// at volume 0, with Music off, or while the tab is hidden (the context is suspended above), and the bus is silenced at once.
let amb = null, scene = null, music = true, nextNote = 0, nextFx = 0, stepI = 0, arng = 1;
export function setMusic(on) { music = !!on; syncBus(); } export function isMusicOn() { return music; }
export const __test = { use(ctx) { ac = ctx; master = ctx ? ctx.createGain() : null; if (master) { master.gain.value = volume; master.connect(ctx.destination); } amb = null; scene = null; }, state: () => ({ amb, scene, music, muted, volume }) };
const audible = () => !!ac && !muted && volume > 0 && music && !(typeof document !== 'undefined' && document.hidden);
const MUSIC = { // scale (Hz), seconds per step, voice, ambience bed [filter type, freq, level], incidental sfx
  title: { scale: [262, 294, 330, 392, 440, 523], step: 0.3, wave: 'triangle', bed: ['lowpass', 500, 0.006], fx: [] },
  tree:  { scale: [262, 294, 330, 392, 440, 523, 587], step: 0.26, wave: 'triangle', bed: ['bandpass', 700, 0.01], fx: ['chirp'] },
  roof:  { scale: [220, 262, 294, 330, 392, 440], step: 0.3, wave: 'sine', bed: ['lowpass', 380, 0.016], fx: ['coo'] },
  truck: { scale: [294, 330, 370, 392, 440, 494, 523], step: 0.22, wave: 'triangle', bed: ['lowpass', 180, 0.03], fx: ['horn'] },
  park:  { scale: [196, 220, 247, 294, 330, 392], step: 0.25, wave: 'triangle', bed: ['bandpass', 900, 0.008], fx: ['chirp', 'bark'] },
};
const rnd = () => { arng = (arng * 1664525 + 1013904223) >>> 0; return arng / 4294967296; };
function busTone(f0, f1, dur, type, vol, at) { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
  g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(vol, at + Math.min(0.03, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, at + dur); o.connect(g); g.connect(amb.bus); o.start(at); o.stop(at + dur + 0.05); }
const FX = { chirp: (t) => { for (let i = 0; i < 3; i++) busTone(2200 + rnd() * 600, 3200, 0.06, 'sine', 0.012, t + i * 0.09); },
  coo: (t) => { busTone(330, 260, 0.25, 'sine', 0.02, t); busTone(320, 250, 0.3, 'sine', 0.018, t + 0.32); },
  horn: (t) => { busTone(440, 440, 0.14, 'square', 0.008, t); busTone(554, 554, 0.14, 'square', 0.006, t); },
  bark: (t) => { busTone(520, 300, 0.07, 'square', 0.01, t); busTone(500, 280, 0.07, 'square', 0.01, t + 0.14); },
  crickets: (t) => { for (let i = 0; i < 4; i++) busTone(4400, 4300, 0.03, 'sine', 0.004, t + i * 0.05); } };
function ensureBus() {
  if (amb || !ac) return amb;
  const bus = ac.createGain(); bus.gain.value = 0; bus.connect(master || ac.destination);
  let src = null, filt = null, bed = null;
  try { const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    src = ac.createBufferSource(); src.buffer = buf; src.loop = true; filt = ac.createBiquadFilter(); bed = ac.createGain(); bed.gain.value = 0; src.connect(filt); filt.connect(bed); bed.connect(bus); src.start(); } catch {}
  amb = { bus, src, filt, bed }; return amb;
}
function syncBus() { if (!amb || !ac) return; const on = audible(); if (on === amb.on) return; amb.on = on; const g = amb.bus.gain, t = ac.currentTime;
  g.cancelScheduledValues?.(t); if (on) { g.setValueAtTime?.(0, t); g.setTargetAtTime ? g.setTargetAtTime(1, t, 0.08) : (g.value = 1); } else { g.value = 0; g.setValueAtTime?.(0, t); } }
/** Pick the soundscape: key = 'title' | stage theme; opts { rain, night, paused }. Cheap to call every frame. */
export function setAmbience(key, opts = {}) {
  const sig = key + (opts.rain ? '+rain' : '') + (opts.night ? '+night' : '');
  if (scene?.sig !== sig) { scene = { sig, key, ...opts }; stepI = 0; arng = [...sig].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
    if (ensureBus() && amb.filt) { const m = MUSIC[key] || MUSIC.title, [type, f, lv] = opts.rain ? ['highpass', 2500, 0.02] : m.bed;
      amb.filt.type = type; amb.filt.frequency.value = f; amb.bed.gain.value = lv; } }
  scene.paused = !!opts.paused;
}
/** Schedule the next ~0.4 s of music/ambience (call every frame). Schedules nothing when not audible. Returns notes scheduled. */
export function tickAmbience() {
  if (!ac || !scene) return 0; ensureBus(); syncBus(); if (!audible()) return 0;
  const now = ac.currentTime, m = MUSIC[scene.key] || MUSIC.title, step = m.step * (scene.night ? 1.25 : 1), oct = scene.night ? 0.5 : 1;
  if (nextNote < now) nextNote = now + 0.05; if (nextFx < now) nextFx = now + 1 + rnd() * 3; let n = 0;
  while (nextNote < now + 0.4) { const i = stepI++ % 16, bar = Math.floor(stepI / 16) % 4;
    if (!scene.paused) { // melody from a fixed per-scene seed: pentatonic-ish steps with rests, a root/fifth bass every 4 steps
      const h = (Math.imul(i + 1, 2654435761) ^ (arng + bar * 977)) >>> 0;
      if (h % 100 < 58) { busTone(m.scale[h % m.scale.length] * oct, m.scale[h % m.scale.length] * oct, step * 0.9, m.wave, 0.022, nextNote); n++; }
      if (i % 4 === 0) { busTone(m.scale[i % 8 ? 3 : 0] * oct / 2, m.scale[i % 8 ? 3 : 0] * oct / 2, step * 3, 'sine', 0.03, nextNote); n++; } }
    nextNote += step; }
  if (nextFx < now + 0.4) { const list = scene.night && (scene.key === 'tree' || scene.key === 'park') ? ['crickets'] : m.fx; if (list.length) { FX[list[(rnd() * list.length) | 0]](nextFx); n++; } nextFx += 2 + rnd() * 4; }
  return n;
}
