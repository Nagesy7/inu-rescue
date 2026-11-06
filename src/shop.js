// Optional merch links (kibbleinu.com) + the once-per-session results nudge. Distinct from the in-game Cosmetics ($KIBBLE) button. Pure helpers (no DOM at import time), so the
// copy, links and analytics props are checked in Node tests. Nothing here touches the engine, scoring, Bones, prize or wallet code.
// $KIBBLE is never needed to play: these are plain outbound links (new tab) and the nudge only appears after a run has ended.
export const SITE = 'inu-rescue';
export const SHOP_TEXT = '🛍️ Merch ↗';
export const SHOP_TITLE = 'Optional merch at kibbleinu.com. $KIBBLE is never needed to play.';
export const SHOP_URL = 'https://kibbleinu.com/pay?utm_source=inu-rescue&utm_medium=menu#shop-h';
export const SHOP_RESULTS_URL = 'https://kibbleinu.com/pay?utm_source=inu-rescue&utm_medium=results#shop-h';
export const DEVS_TEXT = '🛠️ For devs'; // not placed: Inu Rescue has no about / more / footer / credits row of its own
export const DEVS_URL = 'https://kibbleinu.com/for-devs.html?utm_source=inu-rescue&utm_medium=menu';
export const NUDGE_TEXT = 'Like your look? Outfits, pets and cars for every Inu game are at kibbleinu.com. Optional, and never needed to play.';
export const NUDGE_VISIT = 'Merch ↗';
export const NUDGE_DISMISS = 'Not now';
export const NUDGE_KEY = 'inu.shopNudge';
export const FROM = Object.freeze({ menu: 'inu-rescue-menu', results: 'inu-rescue-results' });

/** Analytics props for a paid-link click: product + from + site only (never wallet, mint, name or score). */
export function paidLinkEvent(product, from) {
  return { name: 'paid_link_click', data: { product: product === 'for-devs' ? 'for-devs' : 'shop', from: from === FROM.results ? FROM.results : FROM.menu, site: SITE } };
}
/** Fire the event if Vercel Analytics is present; a missing or throwing `va` never breaks the click. */
export function trackPaidLink(win, product, from) {
  try { if (win && typeof win.va === 'function') win.va('event', paidLinkEvent(product, from)); } catch {}
}
/** The nudge shows on the run-end (GAME OVER) screen only, never on daily-challenge screens, and at most once per session. */
export function shouldNudge(session, scene, { daily = false } = {}) {
  if (scene !== 'over' || daily) return false;
  try { return !session?.getItem(NUDGE_KEY); } catch { return false; }
}
export function markNudged(session) { try { session?.setItem(NUDGE_KEY, '1'); } catch {} }
