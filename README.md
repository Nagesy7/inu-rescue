# Inu Rescue
Original single-screen climbing arcade game: a Shiba Inu climbs scaffold planks and rope ladders to rescue a pup from a grumpy cat. Vanilla JS + canvas, no build step.
- Play: open `index.html` via any static server (`npm run serve`). `?stage=N` starts at stage N (1-4).
- Controls: Arrows/WASD move & climb, Space/Z jump, P/Esc pause, M mute, Enter start. Touch pad on phones.
- Tests: `npm test` (headless engine). Proof: `npm run proof` (Playwright, saves proof/rescue-*.png).
- Leaderboard model: `src/leaderboard.js` (ranked by stage, height %, then fastest time; top 10 in localStorage key `inu-rescue.leaderboard.v1`).
