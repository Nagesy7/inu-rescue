// Playwright proof: drives the real game with keyboard/touch input and saves proof/rescue-*.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const URL = process.env.URL || 'http://localhost:8137/';
mkdirSync('proof', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 768, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
const shot = n => page.screenshot({ path: `proof/rescue-${n}.png` });
const st = () => page.evaluate(() => { const a = window.__inu, g = a.g; return { scene: a.scene, mode: g?.mode, stage: g?.stage, x: g?.player.x, y: g?.player.y, ps: g?.player.state, lives: g?.lives, score: g?.score, haz: g?.hazards.length }; });
const hold = async (k, ms) => { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); };
const waitMode = async m => { for (let i = 0; i < 100; i++) { if ((await st()).mode === m) return; await page.waitForTimeout(100); } };
const log = [];

await page.goto(URL); await page.waitForTimeout(800); await shot('01-title');
await page.keyboard.press('Enter'); await page.waitForTimeout(300); await shot('02-intro');
await waitMode('play');
// walk right to ladder at x=110 and climb
const walkTo = async x => { for (let i = 0; i < 80; i++) { const s = await st(); if (Math.abs(s.x - x) < 2.5 || s.mode !== 'play') return; const k = s.x < x ? 'ArrowRight' : 'ArrowLeft'; await hold(k, Math.min(120, Math.abs(s.x - x) / 54 * 1000)); } };
await walkTo(110); log.push(['at ladder', await st()]);
await page.keyboard.down('ArrowUp'); await page.waitForTimeout(500); await shot('03-climbing'); await page.waitForTimeout(900); await page.keyboard.up('ArrowUp');
log.push(['after climb', await st()]);
await page.keyboard.press('Space'); await page.waitForTimeout(150); await shot('04-jump'); await page.waitForTimeout(600);
await page.waitForTimeout(2500); await shot('05-yarn-rolling'); log.push(['stage1 play', await st()]);
await page.keyboard.press('KeyP'); await page.waitForTimeout(200); await shot('06-paused'); await page.keyboard.press('KeyP');

for (const n of [2, 3, 4]) {
  await page.goto(URL + '?stage=' + n); await page.waitForTimeout(400); await page.keyboard.press('Enter'); await waitMode('play');
  await hold('ArrowRight', 600); await page.waitForTimeout(3500); await shot(`0${5 + n}-stage${n}`); log.push(['stage' + n, await st()]);
}
// DOG PARK: open the first kennel with real input (ladder x=30 -> kennel x=14)
await walkTo(30); await hold('ArrowUp', 1900); await walkTo(14); await shot('10-kennel-opened'); log.push(['kennel', await st(), await page.evaluate(() => window.__inu.g.saved)]);

// game over flow: on the rooftops, walk off roof 1 into the street gap 3 times
await page.goto(URL + '?stage=2'); await page.waitForTimeout(400); await page.keyboard.press('Enter');
for (let life = 0; life < 3; life++) {
  await waitMode('play'); await hold('ArrowRight', 2600);
  await page.waitForTimeout(1900); log.push(['death ' + life, await st()]);
}
await page.waitForTimeout(500); await shot('11-initials');
await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
await shot('12-gameover-leaderboard');
log.push(['lb', await page.evaluate(() => localStorage.getItem('inu-rescue.leaderboard.v2'))]);

// touch controls on a phone viewport
const m = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await m.goto(URL); await m.waitForTimeout(400); await m.tap('[data-k="start"]'); await m.waitForTimeout(1800);
const rb = await m.$('[data-k="right"]'); const bx = await rb.boundingBox();
await m.mouse.move(bx.x + 20, bx.y + 20); await m.mouse.down(); await m.waitForTimeout(700); await m.mouse.up();
await m.tap('[data-k="jump"]'); await m.waitForTimeout(150);
await m.screenshot({ path: 'proof/rescue-13-touch.png' });
log.push(['touch', await m.evaluate(() => { const g = window.__inu.g; return { x: g.player.x, state: g.player.state }; })]);
console.log(JSON.stringify(log, null, 1)); console.log('errors', errors);
await browser.close();
