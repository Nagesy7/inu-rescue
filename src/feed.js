// Real-activity feed for the title screen. Sources ONLY: the kibble-pay public daily board for inu-rescue@v2
// (GET /api/game?action=scores&game=inu-rescue&pool=daily) and this device's local leaderboard (inu-rescue.leaderboard.v2).
// No fake/placeholder rows: anything that isn't a well-formed real entry is dropped; empty -> 'BE THE FIRST TODAY'.
import { sydneyDate } from './daily.js';
export const GAME = 'inu-rescue', VERSION = 2, API = 'https://kibble-pay.vercel.app';
export const boardUrl = (api = API) => `${api}/api/game?action=scores&game=${GAME}&pool=daily`;
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
/** 'AbCd…wXyZ' (public board wallets only; never a full address). */
export const shortWallet = (w) => (typeof w === 'string' && B58.test(w) ? `${w.slice(0, 4)}…${w.slice(-4)}` : null);
// prize score = pups*10000 + min(9999, points) (kibble.runScore); shown as pups + points
export const splitScore = (s) => ({ pups: Math.floor(s / 10000), pts: s % 10000 });
/** Today's prize-board rows from a raw API response; [] unless it is the inu-rescue v2 daily board for `today` (Sydney). */
export function boardRows(resp, today = sydneyDate()) {
  if (!resp || resp.game !== GAME || Number(resp.version) !== VERSION || resp.pool !== 'daily' || resp.period !== today || !Array.isArray(resp.entries)) return [];
  return resp.entries.map(e => ({ who: shortWallet(e?.wallet), score: Number(e?.score) })).filter(e => e.who && Number.isFinite(e.score) && e.score > 0)
    .sort((a, b) => b.score - a.score).slice(0, 5).map((e, i) => ({ rank: i + 1, ...e, ...splitScore(e.score) }));
}
/** This device's runs from today (Sydney), newest first. Local entries carry an ISO `date`. */
export function recentLocal(lb = [], today = sydneyDate(), now = Date.now()) {
  return (Array.isArray(lb) ? lb : []).filter(e => e && typeof e.date === 'string' && !isNaN(Date.parse(e.date)) && sydneyDate(Date.parse(e.date)) === today && Date.parse(e.date) <= now + 60000)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 5)
    .map(e => ({ name: String(e.name || 'INU').slice(0, 8), stage: e.stage | 0, height: e.height | 0, ago: ago(now - Date.parse(e.date)) }));
}
export function ago(ms) { const m = Math.max(0, Math.floor(ms / 60000)); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`; }
/** Panels to rotate on the title: only those with real rows. Empty overall -> one 'BE THE FIRST TODAY' panel. */
export function buildFeed({ board = null, lb = [], today = sydneyDate(), now = Date.now() } = {}) {
  const top = boardRows(board, today), recent = recentLocal(lb, today, now), panels = [];
  if (top.length) panels.push({ id: 'top', title: 'TOP TODAY  PRIZE BOARD', rows: top.map(r => `${r.rank}. ${r.who}  ${r.pups} PUP${r.pups === 1 ? '' : 'S'}  ${r.pts}`) });
  if (recent.length) panels.push({ id: 'recent', title: 'RECENT RESCUES  THIS DEVICE', rows: recent.map(r => `${r.name.padEnd(8)} S${r.stage} H${String(r.height).padStart(3)}  ${r.ago}`) });
  if (!panels.length) panels.push({ id: 'empty', title: 'PRIZE BOARD TODAY', rows: [], empty: 'BE THE FIRST TODAY' });
  return panels;
}
/** Fetch the daily board (never throws; null on any error). */
export async function fetchBoard(fetchFn = globalThis.fetch, api = API) {
  try { const r = await fetchFn(boardUrl(api), { cache: 'no-store' }); if (!r.ok) return null; return await r.json(); } catch { return null; }
}
