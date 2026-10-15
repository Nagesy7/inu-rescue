// Tiny WebAudio sfx synth (no assets).
let ac = null, muted = false;
export function initAudio() { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch { ac = null; } }
export function setMuted(m) { muted = m; } export function isMuted() { return muted; }
function tone(f0, f1, dur, type = 'square', vol = 0.08, delay = 0) {
  if (!ac || muted) return; const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
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
export function play(ev) { const f = SFX[ev]; if (f) f(); }
