// Inu Rescue leaderboard data model. Ranked by furthest progress (stage, then height %),
// tie-broken by fastest run time. Shared shape so Inu Verse can render it later.
export const LB_KEY = 'inu-rescue.leaderboard.v1';
export const LB_MAX = 10;
/** @typedef {{name:string, stage:number, height:number, timeMs:number, score:number, date:string}} LeaderboardEntry */

export function compareEntries(a, b) {
  return (b.stage - a.stage) || (b.height - a.height) || (a.timeMs - b.timeMs) || (b.score - a.score);
}
export function makeEntry(name, prog, date = new Date().toISOString()) {
  return { name: (String(name || '').trim().slice(0, 8).toUpperCase() || 'INU'), stage: prog.stage | 0, height: Math.max(0, Math.min(100, prog.height | 0)),
    timeMs: Math.max(0, Math.round(prog.timeMs)), score: prog.score | 0, date };
}
export function rankEntries(list, max = LB_MAX) { return list.slice().sort(compareEntries).slice(0, max); }
export function addEntry(list, entry, max = LB_MAX) { return rankEntries(list.concat([entry]), max); }
export function qualifiesLB(list, prog, max = LB_MAX) {
  if (list.length < max) return true;
  return compareEntries(makeEntry('X', prog), rankEntries(list, max)[max - 1]) < 0;
}
export function formatTime(ms) {
  ms = Math.max(0, Math.round(ms)); const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, r = ms % 1000;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(r).padStart(3, '0')}`;
}
export function describe(e) { return `Reached Stage ${e.stage}, height ${e.height}, time ${formatTime(e.timeMs)}`; }
export function loadLB(storage) {
  try { const v = JSON.parse(storage.getItem(LB_KEY) || '[]'); return Array.isArray(v) ? rankEntries(v.filter(e => e && typeof e.stage === 'number')) : []; }
  catch { return []; }
}
export function saveLB(storage, list) { try { storage.setItem(LB_KEY, JSON.stringify(rankEntries(list))); } catch {} }
