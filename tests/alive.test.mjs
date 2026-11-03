// Ambient life / daily event / activity feed / ambience audio. Pure Node, no browser.
import test from 'node:test'; import assert from 'node:assert/strict';
import { sydneyDate, eventFor, EVENTS, runConditions, bonesForRun, awardBones, loadBones, BONES_KEY, BONES_DAILY_CAP } from '../src/daily.js';
import { buildFeed, boardRows, shortWallet, recentLocal } from '../src/feed.js';
import { createAmbient, setScene, updateAmbient, counts, CAPS, roofWindows } from '../src/ambient.js';
import { createGame, step, progress, STAGES } from '../src/engine.js';
import { runScore, postRun, K, SCORE_VERSION } from '../src/kibble.js';
import * as A from '../src/audio.js';
import { loadFx, saveFx, FX_KEY, effectiveReduced, lowEndDevice } from '../src/settings.js';
const mem = (init = {}) => ({ s: { ...init }, getItem(k) { return this.s[k] ?? null; }, setItem(k, v) { this.s[k] = String(v); } });
const WALLET = 'BzLYTFAfUsjzQ5x8bx5BbPK4DFtaHrLCuferkvkxTNGJ';

test('daily event is deterministic by Sydney date and rotates through every event', () => {
  assert.equal(sydneyDate(Date.parse('2026-11-02T13:30:00Z')), '2026-11-03', '00:30 Sydney (UTC+11) is already the 3rd');
  assert.equal(sydneyDate(Date.parse('2026-11-03T12:59:00Z')), '2026-11-03'); assert.equal(sydneyDate(Date.parse('2026-11-03T13:00:00Z')), '2026-11-04');
  assert.equal(sydneyDate(Date.parse('2026-06-15T14:30:00Z')), '2026-06-16', 'AEST (UTC+10) in winter');
  const a = eventFor(Date.parse('2026-11-02T13:30:00Z')), b = eventFor(Date.parse('2026-11-03T12:00:00Z')), c = eventFor('2026-11-03');
  assert.equal(a.id, b.id); assert.equal(a.id, c.id); assert.equal(c.date, '2026-11-03');
  for (let i = 0; i < 5; i++) assert.equal(eventFor('2026-11-03').id, c.id, 'same date, same event every call');
  const week = new Set(); for (let d = 1; d <= 7; d++) week.add(eventFor(`2026-12-0${d}`).id); assert.equal(week.size, EVENTS.length, 'a week covers every event');
  assert.notEqual(eventFor('2026-11-03').id, eventFor('2026-11-04').id, 'rotates day to day');
});
test('event rewards are Bones only: no KIBBLE, wager or fee fields', () => {
  for (const e of EVENTS) { const flat = JSON.stringify(e).toLowerCase(); for (const bad of ['kibble', 'wager', 'fee', 'price', 'stake', 'bet']) assert.ok(!flat.includes(bad), `${e.id} mentions ${bad}`);
    assert.deepEqual(Object.keys(e.bones).filter(k => !['perPup', 'stage', 'first'].includes(k)), [], `${e.id} reward kinds`); }
});
test('daily bonuses never change the prize score sent to kp.submitScore', async () => {
  // same seed + same inputs => identical progress and runScore, whatever event / weather / ambient is active
  const run = (ev, cond) => { const g = createGame({ seed: 4242, stage: 0 }), amb = createAmbient(9); setScene(amb, 'tree', cond); const keys = ['right', 'up', 'left', 'right'];
    for (let i = 0; i < 2400; i++) { step(g, { [keys[Math.floor(i / 90) % 4]]: true, jump: i % 37 === 0 }); updateAmbient(amb, 1 / 60); if (g.mode === 'over') break; }
    bonesForRun([g.saved || 0, 0, 0, 0], ev, { firstToday: true }); return progress(g); };
  const base = run({}, runConditions(1, {}));
  for (const ev of EVENTS) { const p = run(ev, runConditions(77, ev, { time: 'night', weather: 'rain' })); assert.deepEqual(p, base, ev.id); assert.equal(runScore(p), runScore(base)); }
  const calls = []; Object.assign(K, { mode: 'live', kp: { session: { t: 1 }, submitScore: async (...a) => { calls.push(a); return { ok: true }; } } });
  const prog = { stage: 2, height: 40, timeMs: 61000, score: 5300, saved: 2 }, frozen = JSON.stringify(prog);
  for (const ev of EVENTS) { const st = mem(); awardBones(st, [1, 1, 0, 0], ev, '2026-11-03'); await postRun(prog); }
  assert.equal(JSON.stringify(prog), frozen, 'progress object untouched');
  assert.equal(calls.length, EVENTS.length); for (const c of calls) assert.deepEqual(c, ['inu-rescue', 25300, 61000, { v: SCORE_VERSION }]);
  Object.assign(K, { mode: 'loading', kp: null });
});
test('ambient never mutates the game, stays within caps, reduced mode is lighter', () => {
  for (let s = 0; s < 4; s++) { const g = createGame({ seed: 5, stage: s }); const before = JSON.stringify(g, (k, v) => (v instanceof Set ? [...v] : typeof v === 'function' ? 'fn' : v));
    for (const reduced of [false, true]) for (const weather of ['rain', 'leaves']) { const amb = createAmbient(3); setScene(amb, STAGES[s].theme, runConditions(3, { crowd: 9, birds: 9 }, { time: 'day', weather }), { reduced, plats: g.plats });
      for (let i = 0; i < 600; i++) updateAmbient(amb, 1 / 60); const n = counts(amb), cap = CAPS[reduced ? 'reduced' : 'full'];
      assert.ok(n.creatures <= cap.creatures && n.particles <= cap.particles, `${STAGES[s].theme} ${reduced} ${weather} ${JSON.stringify(n)}`); assert.ok(n.creatures > 0); }
    assert.equal(JSON.stringify(g, (k, v) => (v instanceof Set ? [...v] : typeof v === 'function' ? 'fn' : v)), before, `stage ${s} game state untouched`); }
  const g = createGame({ seed: 5, stage: 1 }), wins = roofWindows(g.plats); assert.ok(wins.length > 3, 'rooftop windows found for silhouettes');
});
test('Bones: 1 per pup + event bonus, saved under the cloud-synced key, capped per day', () => {
  assert.ok(BONES_KEY.startsWith('inu-rescue.'), 'synced by the wallet save prefix; kibble-pay reads numeric `bones`');
  const ev = (id) => EVENTS.find(e => e.id === id);
  assert.equal(bonesForRun([1, 1, 1, 3], {}), 6); assert.equal(bonesForRun([1, 1, 1, 3], ev('double-pup-bones')), 12);
  assert.equal(bonesForRun([1, 1, 0, 0], ev('rainy-rooftops')), 4); assert.equal(bonesForRun([0, 0, 0, 3], ev('park-parade')), 12);
  assert.equal(bonesForRun([1, 0, 0, 0], ev('night-shift'), { firstToday: true }), 6); assert.equal(bonesForRun([0, 0, 0, 0], ev('night-shift'), { firstToday: true }), 0, 'no pup, no bonus');
  const st = mem(); let r = awardBones(st, [1, 0, 0, 0], ev('night-shift'), '2026-11-03'); assert.equal(r.gained, 6);
  r = awardBones(st, [1, 0, 0, 0], ev('night-shift'), '2026-11-03'); assert.equal(r.gained, 1, 'first-rescue bonus once a day');
  assert.equal(JSON.parse(st.s[BONES_KEY]).bones, 7); assert.equal(loadBones(st, '2026-11-04').earnedToday, 0, 'new Sydney day resets the cap');
  const big = mem(); for (let i = 0; i < 40; i++) awardBones(big, [3, 3, 3, 3], ev('double-pup-bones'), '2026-11-03'); assert.equal(loadBones(big, '2026-11-03').bones, BONES_DAILY_CAP);
  assert.equal(loadBones(mem({ [BONES_KEY]: '{bad' }), 'x').bones, 0);
});
test('feed shows only real data; empty -> BE THE FIRST TODAY; wallets shortened', () => {
  const today = '2026-11-03';
  const empty = buildFeed({ board: { game: 'inu-rescue', version: 2, pool: 'daily', period: today, entries: [] }, lb: [], today });
  assert.deepEqual(empty.map(p => p.id), ['empty']); assert.equal(empty[0].empty, 'BE THE FIRST TODAY'); assert.deepEqual(empty[0].rows, []);
  assert.deepEqual(buildFeed({ board: null, lb: [], today }).map(p => p.id), ['empty'], 'API down -> no invented rows');
  const board = { game: 'inu-rescue', version: 2, pool: 'daily', period: today, entries: [{ rank: 1, wallet: WALLET, score: 30420 }, { wallet: 'not-a-wallet', score: 99999 }, { wallet: WALLET.replace('B', 'C'), score: 'x' }] };
  const rows = boardRows(board, today); assert.equal(rows.length, 1); assert.equal(rows[0].who, 'BzLY…TNGJ'); assert.equal(rows[0].pups, 3); assert.equal(rows[0].pts, 420);
  const txt = JSON.stringify(buildFeed({ board, lb: [], today })); assert.ok(!txt.includes(WALLET), 'full address never shown'); assert.ok(txt.includes('BzLY…TNGJ'));
  for (const bad of [{ ...board, version: 1 }, { ...board, game: 'inu-quest' }, { ...board, period: '2026-11-02' }, { ...board, pool: 'weekly' }]) assert.deepEqual(boardRows(bad, today), [], 'only the inu-rescue v2 board for today');
  assert.equal(shortWallet('short'), null);
  const now = Date.parse('2026-11-03T03:00:00Z');
  const lb = [{ name: 'ZAC', stage: 2, height: 40, timeMs: 1, score: 1, date: '2026-11-03T02:50:00Z' }, { name: 'OLD', stage: 4, height: 1, timeMs: 1, score: 1, date: '2026-11-01T02:00:00Z' }];
  const rec = recentLocal(lb, today, now); assert.deepEqual(rec.map(r => r.name), ['ZAC'], 'only today (Sydney) runs from this device'); assert.equal(rec[0].ago, '10m ago');
  assert.deepEqual(buildFeed({ board: null, lb, today, now }).map(p => p.id), ['recent']);
});
// minimal fake WebAudio graph: counts oscillators started on the ambience bus
function fakeCtx() { const n = { osc: 0 }; const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime(v) { this.value = v; }, cancelScheduledValues() {} });
  const node = () => ({ connect() {}, gain: param(), frequency: param(), start() {}, stop() {} });
  const ctx = { currentTime: 0, sampleRate: 8000, state: 'running', destination: {}, createGain: node, createBiquadFilter: () => ({ ...node(), type: '' }),
    createOscillator: () => ({ ...node(), type: '', start() { n.osc++; } }), createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len) }), createBufferSource: () => ({ ...node(), loop: false, buffer: null }) };
  return { ctx, n }; }
test('ambience + music respect mute, volume 0 and the Music toggle (M key / gear panel)', () => {
  const { ctx, n } = fakeCtx(); A.__test.use(ctx); A.setVolume(0.6); A.setMusic(true);
  A.setMuted(true); A.setAmbience('tree'); for (let i = 0; i < 300; i++) { ctx.currentTime = i / 60; A.tickAmbience(); }
  assert.equal(n.osc, 0, 'muted: nothing scheduled'); assert.equal(A.__test.state().amb.bus.gain.value, 0, 'muted: bus silent');
  A.setMuted(false); for (let i = 300; i < 600; i++) { ctx.currentTime = i / 60; A.tickAmbience(); } assert.ok(n.osc > 5, `unmuted plays (${n.osc})`);
  A.setMuted(true); assert.equal(A.__test.state().amb.bus.gain.value, 0, 'M mutes the ambience bus immediately'); const k = n.osc;
  for (let i = 600; i < 900; i++) { ctx.currentTime = i / 60; A.tickAmbience(); } assert.equal(n.osc, k);
  A.setMuted(false); A.setVolume(0); for (let i = 900; i < 1200; i++) { ctx.currentTime = i / 60; A.tickAmbience(); } assert.equal(n.osc, k, 'volume 0: nothing scheduled');
  A.setVolume(1); A.setMusic(false); for (let i = 1200; i < 1500; i++) { ctx.currentTime = i / 60; A.tickAmbience(); } assert.equal(n.osc, k, 'Music off: nothing scheduled');
  A.setMusic(true); A.__test.use(null);
});
test('fx settings: reduced effects auto on low-end, overridable, synced key', () => {
  assert.ok(FX_KEY.startsWith('inu-rescue.')); assert.deepEqual(loadFx(mem()), { reduced: null, music: true }); assert.deepEqual(loadFx(mem({ [FX_KEY]: '{x' })), { reduced: null, music: true });
  assert.equal(effectiveReduced({ reduced: null }, lowEndDevice({ hardwareConcurrency: 2 })), true); assert.equal(effectiveReduced({ reduced: null }, lowEndDevice({ hardwareConcurrency: 8, deviceMemory: 8 })), false);
  assert.equal(effectiveReduced({ reduced: false }, true), false); assert.equal(lowEndDevice({}, true), true, 'prefers-reduced-motion');
  const st = mem(); saveFx(st, { reduced: true, music: false }); assert.deepEqual(loadFx(st), { reduced: true, music: false });
});
