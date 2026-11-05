// Touch pad release proof (playtest Nov 5): 852x393 phone landscape, real CDP touch events.
// Repro from the report: hold Right ~1.5s, hold Up at the first ladder (grabbed with an overshoot), press Left ~0.3s and release.
// After every release no pad button may stay highlighted, no direction may stay held and the hero must stop. Also covers
// touchCancel, a finger released after sliding off the pad, and a multi-touch release.
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:8137/';
const browser = await chromium.launch(); let fail = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p); const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto(URL + '?stage=1'); await p.waitForTimeout(600);
const c = async k => { const b = await p.locator(`[data-k="${k}"]`).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q.x, y: q.y, id: q.id ?? i })) });
const st = () => p.evaluate(() => { const g = window.__inu.g, p = g?.player; return { mode: g?.mode, x: p?.x, y: p?.y, ps: p?.state, on: [...document.querySelectorAll('#pad .on')].map(e => e.dataset.k) }; });
const still = async (label) => { await p.waitForTimeout(120); for (let i = 0; i < 100 && (await st()).ps === 'air'; i++) await p.waitForTimeout(20); const a = await st(); await p.waitForTimeout(400); const b = await st();
  ok(a.on.length === 0 && b.on.length === 0, `${label}: no pad button left highlighted (${b.on})`);
  ok(b.ps === 'climb' ? Math.abs(b.y - a.y) < 0.5 : Math.abs(b.x - a.x) < 0.5, `${label}: hero stopped (x ${a.x.toFixed(1)} -> ${b.x.toFixed(1)}, y ${a.y.toFixed(0)} -> ${b.y.toFixed(0)})`); };
await touch('touchStart', [await c('start')]); await p.waitForTimeout(80); await touch('touchEnd', []);
for (let i = 0; i < 40 && (await st()).mode !== 'play'; i++) await p.waitForTimeout(100);
await p.evaluate(() => { window.__inu.g.spawnT = 999; }); // no yarn: this is an input test, not a dodge test
// 1) hold Right until the hero is ~5px past the first ladder (x=110): a typical overshoot
const R = await c('right'); const a = await st(); await touch('touchStart', [R]);
for (let i = 0; i < 200 && (await st()).x < 114.5; i++) await p.waitForTimeout(10);
await touch('touchEnd', []); const b = await st(); ok(b.x > a.x + 50, `hold Right ~1.5s walks ${a.x.toFixed(1)} -> ${b.x.toFixed(1)}`); await still('release Right');
// 2) hold Up just past the ladder: grabs, snaps onto the rope and climbs
const s0 = await st(); await touch('touchStart', [await c('up')]); await p.waitForTimeout(500); const s1 = await st();
ok(s1.ps === 'climb' && s1.x === 110 && s1.y < s0.y - 8, `hold Up ${(s0.x - 110).toFixed(1)}px past the ladder climbs + snaps (${s1.ps}, x ${s1.x}, y ${s0.y.toFixed(0)} -> ${s1.y.toFixed(0)})`);
await touch('touchEnd', []); await still('release Up mid-ladder');
await touch('touchStart', [await c('up')]); for (let i = 0; i < 100 && (await st()).ps === 'climb'; i++) await p.waitForTimeout(20); await touch('touchEnd', []);
// 3) press Left ~0.3s and release
const l0 = await st(); await touch('touchStart', [await c('left')]); await p.waitForTimeout(300); await touch('touchEnd', []); const l1 = await st();
ok(l1.x < l0.x - 5, `Left 0.3s moves ${l0.x.toFixed(1)} -> ${l1.x.toFixed(1)}`); await still('release Left');
// 4) touchCancel (e.g. OS gesture / notification) while holding Right
await touch('touchStart', [await c('right')]); await p.waitForTimeout(200); await touch('touchCancel', []); await still('touchCancel while holding Right');
// 5) slide off the pad onto the canvas, then lift
const L = await c('left'); await touch('touchStart', [L]); await p.waitForTimeout(150); await touch('touchMove', [{ x: 426, y: 200 }]); await p.waitForTimeout(80);
await touch('touchEnd', []); await still('slide Left off the pad, lift on the canvas');
// 6) two fingers: Right + Jump, lift Jump then Right
await touch('touchStart', [await c('right')]); await p.waitForTimeout(150); await touch('touchMove', [await c('right'), { ...(await c('jump')), id: 1 }]);
await p.waitForTimeout(150); await touch('touchEnd', [await c('right')]); await p.waitForTimeout(150); await touch('touchEnd', []); await still('multi-touch Right+Jump release');
const keys = await p.evaluate(() => document.querySelectorAll('#pad .on').length); ok(keys === 0, 'no held pad state at the end');
ok(errs.length === 0, `no page errors ${errs}`);
await browser.close(); console.log(fail ? `${fail} FAILED (${n} checks)` : `ALL PASS (${n} checks)`); process.exit(fail ? 1 : 0);
