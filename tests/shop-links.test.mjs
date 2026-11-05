import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
import * as S from '../src/shop.js';
const root = new URL('..', import.meta.url), read = f => readFileSync(new URL(f, root), 'utf8');
const html = read('index.html'), main = read('src/main.js');
const BANNED = /hurry|limited|last chance|don't miss|guarantee|moon|profit|prize/i;
const mem = (init = {}) => ({ s: { ...init }, getItem(k) { return this.s[k] ?? null; }, setItem(k, v) { this.s[k] = String(v); } });

test('Shop link: exact copy, tooltip and href, new tab with rel=noopener, last row of the settings panel', () => {
  assert.equal(S.SHOP_TEXT, '🛍️ Shop'); assert.equal(S.SHOP_TITLE, 'Optional cosmetics. $KIBBLE is never needed to play.');
  assert.equal(S.SHOP_URL, 'https://kibbleinu.com/pay?utm_source=inu-rescue&utm_medium=menu#shop-h');
  const a = /<a id="set-shop"([^>]*)>([^<]*)<\/a>/.exec(html); assert.ok(a, 'link in index.html');
  const attr = n => (new RegExp(`${n}="([^"]*)"`).exec(a[1]) || [])[1];
  assert.equal(attr('href').replace(/&amp;/g, '&'), S.SHOP_URL); assert.equal(attr('title'), S.SHOP_TITLE); assert.equal(a[2], S.SHOP_TEXT);
  assert.equal(attr('target'), '_blank'); assert.match(attr('rel'), /noopener/);
  const box = /<div id="settings"[\s\S]*?<\/div><\/div><\/div>/.exec(html)[0];
  assert.ok(box.indexOf('set-shop') > box.lastIndexOf('<small>'), 'after every other settings row'); assert.ok(box.includes('<button id="set-close">Done</button>'));
  assert.match(main, /getElementById\('set-shop'\)\.addEventListener\('click', \(\) => trackPaidLink\(window, 'shop', FROM\.menu\)\)/);
});
test('results nudge: exact copy, buttons, results utm, once per session, run-end only (not daily)', () => {
  assert.equal(S.NUDGE_TEXT, 'Like your look? Outfits, pets and cars for every Inu game are in the Kibble Pay shop. Optional, and never needed to play.');
  assert.equal(S.NUDGE_VISIT, 'Visit the shop →'); assert.equal(S.NUDGE_DISMISS, 'Not now');
  assert.equal(S.SHOP_RESULTS_URL, 'https://kibbleinu.com/pay?utm_source=inu-rescue&utm_medium=results#shop-h');
  assert.equal(S.NUDGE_KEY, 'inu.shopNudge');
  const ss = mem(); assert.equal(S.shouldNudge(ss, 'over'), true);
  for (const sc of ['title', 'game', 'entry']) assert.equal(S.shouldNudge(ss, sc), false, sc);
  assert.equal(S.shouldNudge(ss, 'over', { daily: true }), false, 'never on daily-challenge screens');
  S.markNudged(ss); assert.equal(ss.s['inu.shopNudge'], '1'); assert.equal(S.shouldNudge(ss, 'over'), false, 'once per session');
  assert.equal(S.shouldNudge(null, 'over'), true); assert.equal(S.shouldNudge({ getItem() { throw new Error('blocked'); } }, 'over'), false, 'storage blocked: stay quiet');
  assert.match(main, /trackPaidLink\(window, 'shop', FROM\.results\)/); assert.match(main, /shouldNudge\(sessionStorage, app\.scene\)/);
});
test('For devs: not placed (no about/more/footer/credits row in Inu Rescue); constants match the spec if added later', () => {
  assert.equal(S.DEVS_TEXT, '🛠️ For devs'); assert.equal(S.DEVS_URL, 'https://kibbleinu.com/for-devs.html?utm_source=inu-rescue&utm_medium=menu');
  assert.ok(!html.includes('for-devs'), 'no For devs link in the page');
});
test('new copy has no banned words (urgency / prize / price promises)', () => {
  for (const s of [S.SHOP_TEXT, S.SHOP_TITLE, S.DEVS_TEXT, S.NUDGE_TEXT, S.NUDGE_VISIT, S.NUDGE_DISMISS]) assert.doesNotMatch(s, BANNED, s);
  assert.match(S.SHOP_TITLE, /never needed to play/); assert.match(S.NUDGE_TEXT, /never needed to play/);
});
test('analytics: paid_link_click props are product/from/site only (wallet-free), and a missing or broken va never throws', () => {
  for (const [p, f] of [['shop', S.FROM.menu], ['shop', S.FROM.results], ['for-devs', S.FROM.menu]]) {
    const e = S.paidLinkEvent(p, f); assert.equal(e.name, 'paid_link_click'); assert.deepEqual(Object.keys(e).sort(), ['data', 'name']);
    assert.deepEqual(Object.keys(e.data).sort(), ['from', 'product', 'site']); assert.deepEqual(e.data, { product: p, from: f, site: 'inu-rescue' });
    assert.doesNotMatch(JSON.stringify(e.data), /wallet|mint|name|score|pubkey|address/i);
  }
  assert.deepEqual(S.FROM, { menu: 'inu-rescue-menu', results: 'inu-rescue-results' });
  const calls = []; S.trackPaidLink({ va: (...a) => calls.push(a) }, 'shop', S.FROM.results);
  assert.deepEqual(calls, [['event', { name: 'paid_link_click', data: { product: 'shop', from: 'inu-rescue-results', site: 'inu-rescue' } }]]);
  assert.doesNotThrow(() => S.trackPaidLink({}, 'shop', S.FROM.menu)); assert.doesNotThrow(() => S.trackPaidLink(undefined, 'shop', S.FROM.menu));
  assert.doesNotThrow(() => S.trackPaidLink({ va() { throw new Error('x'); } }, 'shop', S.FROM.menu));
});
