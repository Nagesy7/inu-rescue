import test from 'node:test'; import assert from 'node:assert/strict';
import { gate, MAX_VOICES } from '../src/audio.js';
import { readFileSync } from 'node:fs';
test('SFX cooldown drops per-frame repeats', () => { let n = 0; for (let f = 0; f < 60; f++) if (gate('land', 100 + f / 60)) n++; assert.ok(n <= 13, `played ${n}`); });
test('concurrent voices capped', () => { let n = 0; for (let i = 0; i < 30; i++) if (gate('x' + i, 200, 0, 5)) n++; assert.equal(n, MAX_VOICES); });
// vsync snap, deterministic: a mocked rAF clock (seeded PRNG, no Math.random) so the result is the same every run.
// snapDt snaps a frame dt within 2 ms of a whole 60Hz frame, i.e. per-timestamp vsync jitter up to +/-1 ms (real rAF timestamps are
// vsync-aligned, typically well under 1 ms). The old test drew +/-1.5 ms per timestamp, so frame-to-frame dt varied by up to 3 ms, beyond
// the 2 ms window, and it failed ~46% of runs. Same 600-frame check, same >=590 bar, now across 25 seeds plus a worst-case pattern.
const snapSrc = () => { const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8'); const m = src.match(/export function snapDt\(dt\) \{([^\n]*)\}/); return new Function('dt', m[1]); };
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
function stepHist(snapDt, hz, jitterMs, frames = 600) { // jitterMs(i) -> offset of frame i's timestamp from the ideal vsync time
  let acc = 0, last = 0; const hist = {}; for (let i = 1; i <= frames; i++) { const now = i * 1000 / hz + jitterMs(i); const dt = snapDt((now - last) / 1000); last = now; acc += dt; let n = 0; while (acc >= 1 / 60 - 1e-6) { acc = Math.max(0, acc - 1 / 60); n++; } hist[n] = (hist[n] || 0) + 1; }
  return hist; }
test('vsync snap: jittery 60Hz timestamps give exactly one sim step per frame (mocked clock, deterministic)', () => {
  const snapDt = snapSrc();
  for (let seed = 1; seed <= 25; seed++) { const r = mulberry32(seed); const hist = stepHist(snapDt, 60, () => (r() - 0.5) * 1.9); assert.ok((hist[1] || 0) >= 590, `seed ${seed}: ${JSON.stringify(hist)}`); }
  const worst = stepHist(snapDt, 60, (i) => (i % 2 ? 0.95 : -0.95)); assert.ok((worst[1] || 0) >= 590, 'alternating worst case ' + JSON.stringify(worst)); // dt swings 15.77/17.57 ms every frame
  const r = mulberry32(7); const a = stepHist(snapDt, 60, () => (r() - 0.5) * 1.9), r2 = mulberry32(7); assert.deepEqual(stepHist(snapDt, 60, () => (r2() - 0.5) * 1.9), a, 'same seed, same result');
});
test('vsync snap does not change sim speed on 75/90/120Hz displays', () => {
  const snapDt = snapSrc();
  for (const hz of [75, 90, 120]) { const r = mulberry32(hz); const h = stepHist(snapDt, hz, () => (r() - 0.5) * 1.9), steps = Object.entries(h).reduce((s, [n, c]) => s + n * c, 0);
    assert.ok(Math.abs(steps - 600 * 60 / hz) <= 2, `${hz}Hz: ${steps} sim steps for ${600 / hz}s`); }
});
