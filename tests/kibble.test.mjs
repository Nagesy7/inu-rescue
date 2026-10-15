import test from 'node:test'; import assert from 'node:assert/strict';
import * as KB from '../src/kibble.js';
import { createGame, clearStage, progress } from '../src/engine.js';
test('run score: pups saved dominate, points break ties (capped)', () => {
  assert.equal(KB.runScore({ saved: 0, score: 5000 }), 5000); assert.equal(KB.runScore({ saved: 2, score: 123 }), 20123);
  assert.ok(KB.runScore({ saved: 1, score: 0 }) > KB.runScore({ saved: 0, score: 999999 }));
});
test('clearing a stage counts a saved pup in progress()', () => { const g = createGame({ seed: 3 }); g.mode = 'play'; clearStage(g); assert.equal(progress(g).saved, 1); });
test('not demo: nothing owned, look has no cosmetics, scores skipped without sign-in', async () => {
  assert.equal(KB.DEMO, false); KB.K.mode = 'soon'; KB.toggleEquip('collar-gold'); assert.equal(KB.look().collar, undefined, 'unowned item never shows');
  assert.deepEqual(await KB.postRun({ saved: 3, score: 10, timeMs: 60000 }), { ok: false, skipped: true });
});
test('demo wallet: buy deducts fake KIBBLE, owned item can be equipped', async () => {
  KB.K.mode = 'demo'; assert.equal((await KB.demoWallet.buy('collar-gold', 15)).ok, true); assert.equal(KB.demoWallet.balanceUi(), '185');
  assert.equal(KB.look().collar.id, 'collar-gold'); assert.equal((await KB.demoWallet.buy('van-gold', 999)).ok, false); KB.K.mode = 'soon';
});
test('signed-in real mode posts a wallet-signed score only when a pup was saved', async () => {
  const calls = []; Object.assign(KB.K, { mode: 'soon', kp: { session: 't', submitScore: async (...a) => { calls.push(a); return { ok: true }; } } });
  assert.equal((await KB.postRun({ saved: 0, score: 900, timeMs: 30000 })).skipped, true);
  assert.equal((await KB.postRun({ saved: 2, score: 900, timeMs: 61000 })).ok, true); assert.deepEqual(calls, [['inu-rescue', 20900, 61000, { v: 2 }]]); assert.equal(KB.SCORE_VERSION, 2); KB.K.kp = null;
});
test('every cosmetic is priced and typed', () => { for (const [id, c] of Object.entries(KB.COSMETICS)) { assert.ok(c.price > 0, id); assert.ok(['collar', 'gear', 'van'].includes(c.kind)); } });
