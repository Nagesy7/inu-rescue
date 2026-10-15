# Inu Rescue
Original single-screen Inu platform rescue: a Shiba Inu frees caged pups from a roaming grumpy cat across four stages, then reaches the rescue van.
- Stages: TREEHOUSE CLIMB (vertical branches, yarn balls that bounce and split), ROOFTOP CHASE (jump the gaps between roofs, falling dog-food tins with shadow warnings),
  DELIVERY RUN (ride moving delivery-van roofs, tins + yarn), DOG PARK finale (swinging ropes over a pond, open all 3 kennels, fleas). The cat hops between perches.
- Each stage: free the caged pup mid-stage (+1000), then the van unlocks; the park has no exit, just three kennels. Vanilla JS + canvas, no build step.
- Play: open `index.html` via any static server (`npm run serve`). `?stage=N` starts at stage N (1-4).
- Controls: Arrows/WASD move & climb, Space/Z jump, P/Esc pause, M mute, Enter start. Touch pad on phones.
- Tests: `npm test` (headless engine). Proof: `npm run proof` (Playwright, saves proof/rescue-*.png).
- Leaderboard model: `src/leaderboard.js` (ranked by stage, stage progress %, then fastest time; top 10 in localStorage key `inu-rescue.leaderboard.v2`).
