import test from 'node:test'; import assert from 'node:assert/strict';
import { gate, MAX_VOICES } from '../src/audio.js';
import { readFileSync } from 'node:fs';
test('SFX cooldown drops per-frame repeats', () => { let n = 0; for (let f = 0; f < 60; f++) if (gate('land', 100 + f / 60)) n++; assert.ok(n <= 13, `played ${n}`); });
test('concurrent voices capped', () => { let n = 0; for (let i = 0; i < 30; i++) if (gate('x' + i, 200, 0, 5)) n++; assert.equal(n, MAX_VOICES); });
test('vsync snap: jittery 60Hz timestamps give exactly one sim step per frame', () => {
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8'); const m = src.match(/export function snapDt\(dt\) \{([^\n]*)\}/); const snapDt = new Function('dt', m[1]);
  let acc = 0, t = 0, last = 0; const hist = {}; for (let i = 0; i < 600; i++) { t += 1000 / 60; const now = t + (Math.random() - 0.5) * 3; const dt = snapDt((now - last) / 1000); last = now; acc += dt; let n = 0; while (acc >= 1 / 60 - 1e-6) { acc = Math.max(0, acc - 1 / 60); n++; } hist[n] = (hist[n] || 0) + 1; }
  assert.ok((hist[1] || 0) >= 590, JSON.stringify(hist)); });
