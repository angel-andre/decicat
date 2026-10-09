# DECICAT — A Decibel Adventure

A one-touch pixel runner: 10 stages, a rocket ending, then endless Moon Mode. Original Decicat concept by @doncastro. Game by @angelataptos.

**Live:** https://decicat.bitcade.xyz/play (canonical; https://decicat.decicat.workers.dev/play keeps working).

**Play:** open `dist/decicat.html` (one self-contained file, works offline from disk) or `index.html`.

**Controls:** tap / click / Space = jump. Hold for a higher jump, tap again in the air to double-jump. Land on a bear from above to stomp it. M = mute, P = pause. The ♪ and speaker icons (top right) toggle music and sound effects separately; the setting is remembered.

**Stages (45 s each, `ZONE_SECONDS` in game.js; gentle in-stage ramp, one 40x box per stage):** 1 Order Book · 2 Funding Storm (wind gusts, rain) · 3 Liquidation Rain (red candles drop from the sky) · 4 Bear Market (bears) · 5 Whale Waters (candle sea; ride breaching whales, jump off when they spout and dive) · 6 Short Squeeze (hydraulic bars slam down over pressure tunnels; stay low under them) · 7 Flash Crash (gravity flips for 2-4 s after a 1 s glitch + arrow warning; run on hanging candles) · 8 Front-Runner Alley (server-room data alley; dark bot Decicats replay your own path ~0.6-1.0 s late, then lock onto your lane, shown by a red dotted line, and cut past you. They only trip you while you're on the ground on their lane: be in the air as one passes (OUTRAN +50), or land on one to stomp it) · 9 Bear King (storm castle of red charts; boss with crown and red-candle sceptre. He throws red candles (raised sceptre + "!"), slams the floor (hop, then a shockwave runs at you), and lunges (red lane flash, then his head comes in low). Stomp his head 3 times while he lunges: health bar in the HUD, defeat = he flees + 5000; survive the stage = he retreats + 1000) · 10 Launch Pad (dawn facility, gantries, live countdown boards, bears; the last 7 s are a flat steel pad with the rocket waiting at the end).
**Ending:** finishing stage 10 plays a ~12.6 s rocket cutscene (board, 3-2-1, liftoff, flight through the To The Moon sky, landing on the big Decibel moon: TRADE LOUD. + fireworks; tap to skip). Then YOU MADE IT TO THE MOON! (run time, score, +10000 ending bonus), then **Moon Mode**: endless, the hardest, low gravity, meteors, a mix of every hazard, cycling remixes of the stage tracks. The cutscene is frozen sim time, so replays stay deterministic. Each stage has its own original track and SFX.
**Trophies & skins:** 14 achievements (stored on the device, toast on unlock, TROPHIES button on the title). Some unlock cosmetic skins (palette edits of the traced sprite): Night (Storm Chaser), Hoodie (Whale Rider), Gold (Full Send), Laser Eyes (Kingslayer), Astronaut (To The Moon). Pick with the arrows beside the cat on the title.
**Share:** SHARE ON X on the game-over screen opens x.com/intent/post with your time, stage (or Moon Mode), board rank and https://decicat.bitcade.xyz/play. Leaderboard rows that reached the moon get a small moon icon.
Grab the gold **40x** box for a 4-second invincible rocket boost.
**Power-ups** (rare, at most one of each per zone): STOP-LOSS (blocks one hit or fall), LIQUIDITY MAGNET (6 s), LIMIT ORDER (slow-mo 0.6x for 4 s), DIAMOND PAWS (invincible 3 s). Active ones show under the score with a timer bar.
The BTC number in the HUD is just for fun. It isn't a real price.

## v5.4 (anonymous player counter)
- **Privacy-first player count:** to know how many people enjoy the game, it keeps a simple anonymous count of players per day. Each browser gets a random ID (`decicat_pid_v1` in localStorage) that isn't linked to your name, device, X account or anything else about you. Once per visit the game sends just that random ID and whether a run started. No cookies, nothing slows down gameplay, and it's skipped in local copies and test modes (or add `?noping`).
- The server never stores the ID itself, only a salted one-way hash, so even the count can't be traced back to a browser. No IP addresses, names or device details are saved. Rate limiting uses a short-lived salted hash that's deleted after about 2 minutes. The counter is fully separate from the leaderboard, so it can never affect scores or gameplay.
- `GET /api/admin/stats?days=30` (x-admin-key) and `node tools/stats.mjs` print per-day unique players / loads / runs, all-time uniques and score totals. (The old sim-stats probe moved to `tools/simstats.mjs`.)
- VERSION v5.4 uses the v5.3 physics, so all v5.2/v5.3 replays still verify.

## v5.3 (game feel)
- Jump physics (sim, versioned): coyote time 80 ms, jump buffer 100 ms, fall gravity x1.18, gravity x0.6 near the apex (|vy| < 35). Max jump height and air time stay within ~1.5% of v5.2, so gap reach is unchanged.
- Replays are versioned: the sim picks its physics table from the replay's `v` (`PHYS.v52` for v5.2 and older, `PHYS.v53` for v5.3+), so v5.2 replays still verify exactly on this build. A v5.3 replay will NOT verify on a v5.2 build (expected).
- Juice (render-only; uses Math.random, never the seeded sim RNG; nothing spawns while re-simulating): squash/stretch on takeoff and landing, landing/takeoff dust, coin ring pop + sparkles, power-up screen flash, impact rings, screen shake on stomps, boss hits and death.
- Hit-stop: 60 ms on bear stomps, 70 ms on boss stomps, 80 ms on death. It lives in the real-time loop only (no sim steps run during the freeze; inputs are stamped with the sim frame they apply to), so replays are unaffected.
- `prefers-reduced-motion: reduce` scales shake to 30% and softens the flash.
- Test hook: `__decicat.advanceReal(n)` advances like the real loop (honours hit-stop); `__decicat.juice`, `__decicat.physFor(v)`.

## v5.2
Title wordmark: DECI yellow, CAT white. TAP TO START gate: the cratered Decibel logo-moon (stage moon renderer, 1:1 mark) top-right, below the sound toggles. First run only (`decicat_hint_v1` in localStorage): a ~3 s controls hint (jump / hold for higher / tap again in the air for a double jump), drawn only, never touches the sim. Decicat's raised paw redrawn as the thinking pose (curled paw, index finger bent to the chin), all frames and skins; `server/card.png` regenerated. Score-code popup: "THIS CODE PROVES YOUR HIGH SCORE", every line measured and wrapped to the box. Stage logo-moons ping-pong slowly inside the visible width (no more drifting off narrow portrait screens). Audio: SFX reverb/delay sends and the growl/roar chains are disconnected when they end, no SFX nodes are built while SFX is muted, and the silent looping `<audio>` keep-alive is only used on iOS/iPadOS.

## Files
- `index.html`, `config.js`, `sprites.js`, `audio.js`, `bg.js`, `game.js`: the game (no build step needed). `audio.js` synthesises all music and SFX live with WebAudio (no audio files; each song builds one persistent voice graph and plays notes by AudioParam automation, so it doesn't churn nodes); `bg.js` draws the parallax zone backgrounds and the pixel Decibel logo/moons (48 px mark traced from the official logo).
- `build.mjs`: `node build.mjs` writes `dist/decicat.html` (everything inlined)
- `server/`: Cloudflare Worker + SQLite Durable Object leaderboard and X player-card pages (`/play`, `/embed`, `/card.png`, `/api/top`, `/api/score`). Deploy: `node build.mjs && cd server && npx wrangler deploy`.

## Leaderboard
Hosted copies (the Worker's `/embed`, or any http(s) host other than localhost) use the online top 20; a `file://` or localhost copy keeps scores on the device. Scores live in one Durable Object (SQLite), so every score is stored and ranks are exact (`You placed #37`). The client queues each score in localStorage before sending, retries with backoff (8 s timeout), and resends anything left over on the next load or game over. Resends are idempotent (nonce). Runs under 2 s are stored but not ranked. Rate limit: 30 posts/min per IP.

## Contest protection (no sign-in)
The simulation is deterministic: fixed 60 Hz steps, one seeded RNG (run seed from `crypto.getRandomValues`), and inputs applied only at step boundaries. Every run records `{seed, size, delta-encoded press/release frames, resizes}` (a few hundred bytes) and submits it with the score. The Worker keeps the replay only while the run is in the top 50. A top-20 run gets a private claim code (`DCAT-XXXX-XX`, an HMAC of the entry id). The Worker stores only its SHA-256. The code is shown once ("Screenshot this!") and kept in the player's localStorage (`decicat_claims_v1`). Runs recorded with debug flags (`?bot`, `?god`, `?zt`...) are stored but not ranked. Older entries without a replay are listed as unverified.
`tools/verify.mjs` (needs the `ADMIN_KEY` secret, read from `/workspace/decicat/.admin_key`; default host decicat.bitcade.xyz): `list`, `entry <rank|id> [--save 1]` (fetches the replay, re-simulates it headlessly with `dist/decicat.html`, prints computed vs claimed and whether the replay reached the moon; `--save 1` stores verified + reachedMoon on the server), `all [--save 1]`, `claim <code> [rank|id]`, `file <replay.json>`. The admin API (`/api/admin/entries`, `/api/admin/entry`, `POST /api/admin/verify`) needs the `x-admin-key` header. The moon icon shows the client's claim (only accepted for runs of 7m20s+) until a verify replaces it with the replay-derived value.

## Debug URL params
`?zone=3` start in a stage (11+ = Moon Mode) · `?boost` start boosted · `?bot` autoplay · `?god` no deaths · `?seed=7` repeatable level · `?zt=6` seconds per zone · `?autostart` · `?poster` static title card · `?nogate` skip the TAP TO START gate · `?record` log audio events instead of playing them (used for video capture) · `?mem` memory/audio overlay (canvas count + area, cache sizes, live audio nodes, JS heap)

Original Decicat concept by @doncastro. Game by @angelataptos.

Tests (from `tools/`, Chrome via playwright-core): `test3.mjs` (UI/regression), `test5.mjs` (v5 features), `replaytest.mjs` (determinism: `ZT=8`, `Z0=8 ZT=8`, includes ending runs), `lbtest.mjs` / `e2e_online.mjs` / `contest_e2e.mjs` (against `wrangler dev --local --port 8787 --var DEV:1`), `mem2.mjs` (memory soak).
