// Game Over initials proof (playtest Nov 5): gameplay keys/buttons still held or arriving right at Game Over must not type
// into the initials prompt (tester got "IOU"). Desktop keyboard + phone touch pad.
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:8137/';
const browser = await chromium.launch(); let fail = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const name = p => p.evaluate(() => { const a = window.__inu; return a.entry ? a.entry.ch.map(i => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '[i]).join('').trim() + '@' + a.entry.i : a.scene; });
const toOver = async p => { for (let i = 0; i < 50 && (await p.evaluate(() => window.__inu.g?.mode)) !== 'play'; i++) await p.waitForTimeout(100);
  await p.evaluate(() => { const g = window.__inu.g; g.lives = 1; g.mode = 'over'; }); for (let i = 0; i < 20 && (await p.evaluate(() => window.__inu.scene)) !== 'entry'; i++) await p.waitForTimeout(16); };
{ const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage(); await p.goto(URL + '?stage=1'); await p.waitForTimeout(500);
  await p.keyboard.press('Enter'); await p.keyboard.down('ArrowUp'); await toOver(p);
  ok((await p.evaluate(() => window.__inu.scene)) === 'entry', 'keyboard: reached initials prompt');
  for (let i = 0; i < 6; i++) { await p.keyboard.down('ArrowUp'); await p.waitForTimeout(40); } // auto-repeat of the held gameplay key
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('KeyO'); // fresh presses inside the 400ms guard
  ok((await name(p)) === 'INU@0', `keyboard: held/guard-window keys ignored (${await name(p)})`);
  await p.waitForTimeout(450); for (let i = 0; i < 3; i++) await p.keyboard.down('ArrowUp');
  ok((await name(p)) === 'INU@0', `keyboard: still-held gameplay key ignored after the guard (${await name(p)})`);
  await p.keyboard.up('ArrowUp'); await p.keyboard.press('ArrowUp'); ok((await name(p)) === 'JNU@0', `keyboard: fresh Up after release edits the letter (${await name(p)})`);
  await p.keyboard.press('KeyZ'); ok((await name(p)) === 'ZNU@1', `keyboard: typing works (${await name(p)})`); await ctx.close(); }
{ const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, hasTouch: true, isMobile: true }); const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
  await p.goto(URL + '?stage=1'); await p.waitForTimeout(500);
  const c = async k => { const b = await p.locator(`[data-k="${k}"]`).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q.x, y: q.y, id: q.id ?? i })) });
  await touch('touchStart', [await c('start')]); await touch('touchEnd', []); await p.waitForTimeout(100);
  await touch('touchStart', [await c('up')]); await toOver(p);
  ok((await p.evaluate(() => [...document.querySelectorAll('#pad .on')].length)) === 0, 'touch: held pad button cleared at Game Over');
  await touch('touchEnd', []); await touch('touchStart', [await c('down')]); await touch('touchEnd', []); await touch('touchStart', [await c('start')]); await touch('touchEnd', []);
  ok((await name(p)) === 'INU@0', `touch: Down + START inside the guard ignored (${await name(p)})`);
  await p.waitForTimeout(450); await touch('touchStart', [await c('down')]); await touch('touchEnd', []);
  ok((await name(p)) === 'HNU@0', `touch: Down after the guard edits (${await name(p)})`); await ctx.close(); }
await browser.close(); console.log(fail ? `${fail} FAILED (${n} checks)` : `ALL PASS (${n} checks)`); process.exit(fail ? 1 : 0);
