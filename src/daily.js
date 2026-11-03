// Daily event + per-run weather/time + Bones (free in-game currency). Pure: no DOM, runs in Node tests.
// The event rotates by the Australia/Sydney calendar date (same rule as the kibble-pay daily boards). Rewards are Bones only,
// never $KIBBLE, no wagers or fees. Nothing here touches the engine or the prize score: kp.submitScore still gets runScore(prog).
import { mulberry32 } from './engine.js';
export const TZ = 'Australia/Sydney';
const fmt = typeof Intl !== 'undefined' ? new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }) : null;
/** 'YYYY-MM-DD' for the Sydney calendar day containing `now` (ms or Date). */
export function sydneyDate(now = Date.now()) {
  const d = new Date(now); if (!fmt) return d.toISOString().slice(0, 10);
  const p = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}`;
}
export const dayIndex = (date) => { const [y, m, d] = date.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); };
// themes by stage index: 0 tree, 1 roof, 2 truck, 3 park
export const EVENTS = Object.freeze([
  { id: 'rainy-rooftops', name: 'RAINY ROOFTOPS', blurb: 'Rain on the roofs. +2 Bones per Rooftop pup', weather: { roof: 'rain', truck: 'rain' }, bones: { stage: { 1: 2 } } },
  { id: 'double-pup-bones', name: 'DOUBLE PUP BONES', blurb: 'Every pup saved is worth 2 Bones', bones: { perPup: 2 } },
  { id: 'night-shift', name: 'NIGHT SHIFT', blurb: 'All stages at night. +5 Bones first rescue today', time: 'night', bones: { first: 5 } },
  { id: 'golden-hour', name: 'GOLDEN HOUR', blurb: 'Sunset skies on every stage', time: 'dusk', bones: {} },
  { id: 'leaf-fall', name: 'LEAF FALL', blurb: 'Autumn leaves. +2 Bones per Treehouse pup', weather: { tree: 'leaves', park: 'leaves' }, bones: { stage: { 0: 2 } } },
  { id: 'park-parade', name: 'PARK PARADE', blurb: 'More dogs out walking. +3 Bones per park kennel', crowd: 2, bones: { stage: { 3: 3 } } },
  { id: 'early-bird', name: 'EARLY BIRD', blurb: 'Dawn chorus. +3 Bones first rescue today', time: 'dawn', birds: 2, bones: { first: 3 } },
]);
/** The event for a Sydney date ('YYYY-MM-DD') or a timestamp. Deterministic: same date -> same event, rotating daily. */
export function eventFor(dateOrNow = Date.now()) {
  const date = typeof dateOrNow === 'string' ? dateOrNow : sydneyDate(dateOrNow);
  const i = ((dayIndex(date) % EVENTS.length) + EVENTS.length) % EVENTS.length; return { ...EVENTS[i], date };
}
export const TIMES = ['dawn', 'day', 'dusk', 'night'];
const THEMES = ['tree', 'roof', 'truck', 'park'];
const WEATHER = { tree: ['clear', 'clear', 'leaves'], roof: ['clear', 'clear', 'rain'], truck: ['clear', 'clear', 'rain'], park: ['clear', 'leaves', 'clear'] };
/** Per-run look: time of day + weather for each stage theme. Chosen from the run seed; the daily event can pin either. Visual only. */
export function runConditions(seed, event = {}, over = {}) {
  const r = mulberry32((seed | 0) ^ 0x5eed);
  const time = TIMES.includes(over.time) ? over.time : event.time || TIMES[Math.floor(r() * TIMES.length)];
  const weather = {}; for (const th of THEMES) { const pick = WEATHER[th][Math.floor(r() * 3)]; weather[th] = over.weather && ['clear', 'rain', 'leaves'].includes(over.weather) ? over.weather : event.weather?.[th] || pick; }
  return { time, weather, crowd: event.crowd || 1, birds: event.birds || 1 };
}
// ---- Bones: 1 per pup saved, plus today's event bonus. Saved in localStorage 'inu-rescue.bones' as {"bones":n,...}, which the
// wallet cloud save syncs (key prefix 'inu-rescue.') and kibble-pay's public profile reads as this game's Bones (largest numeric `bones`).
export const BONES_KEY = 'inu-rescue.bones';
export const BONES_DAILY_CAP = 300;
/** Bones for one finished run. pupsByStage[i] = pups saved on stage i (0 tree .. 3 park, any loop). Pure; never reads the score. */
export function bonesForRun(pupsByStage, event = {}, { firstToday = false } = {}) {
  const b = event.bones || {}, per = b.perPup || 1; let n = 0;
  pupsByStage.forEach((k, i) => { k = Math.max(0, k | 0); n += k * per + k * (b.stage?.[i] || 0); });
  if (n > 0 && firstToday && b.first) n += b.first;
  return n;
}
export function loadBones(storage, today) {
  let s = {}; try { s = JSON.parse(storage?.getItem(BONES_KEY) || '{}') || {}; } catch {}
  const bones = Number.isFinite(s.bones) && s.bones >= 0 ? Math.floor(s.bones) : 0;
  const same = s.day === today; return { bones, day: today, earnedToday: same ? Math.max(0, s.earnedToday | 0) : 0, runsToday: same ? Math.max(0, s.runsToday | 0) : 0 };
}
/** Award a run's Bones (capped per Sydney day). Returns { gained, state }. */
export function awardBones(storage, pupsByStage, event, today = event?.date) {
  const st = loadBones(storage, today);
  const raw = bonesForRun(pupsByStage, event, { firstToday: st.earnedToday === 0 });
  const gained = Math.max(0, Math.min(raw, BONES_DAILY_CAP - st.earnedToday));
  const state = { bones: st.bones + gained, day: today, earnedToday: st.earnedToday + gained, runsToday: st.runsToday + 1, event: event?.id || null };
  try { storage.setItem(BONES_KEY, JSON.stringify(state)); } catch {}
  return { gained, state };
}
