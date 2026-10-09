# Changelog

All dates are 2026, Eastern Time. Version numbers match the git tags and GitHub releases.

## v5.4 (Oct 9, ~10:25)
- Privacy-first player count: an anonymous daily count of players so we know how many people are enjoying the game. It uses only a random per-browser ID, stored on the server as a salted one-way hash. No IPs, names, cookies or device details; fully separate from the leaderboard. Admin view: `GET /api/admin/stats` / `tools/stats.mjs`.
- Gameplay and replays unchanged (v5.4 uses the v5.3 physics).

## v5.3 (Oct 9, ~07:10)
- Game feel: coyote time and jump buffer, faster fall with a short hang at the apex (same max height), squash and stretch, landing dust, coin pops, power-up flash, screen shake and hit-stop on stomps and death (reduced-motion aware).
- Replays carry their version; v5.2 replays still verify with v5.2 physics.
- X card image refreshed (new paw, no trailing period) with a cache-busting link.

## v5.2 (Oct 9, ~06:45)
- Title: the final T in DECICAT is now white, so CAT matches. Credit line reads "Original Decicat concept by @doncastro" (no trailing period).
- Tap-to-start screen: pixel Decibel-logo moon in the top-right corner.
- Decicat sprite: redrawn chin paw (curled thinking pose) on every skin and frame.
- First-run hint: how to jump, hold for a higher jump, and double jump (shown once, display only, replays unaffected).
- Score Code popup: "This code proves your high score", with every line fitted to the box on narrow phones.
- Stage moons stay fully on screen on portrait phones while keeping the slow drift.
- Audio cleanup: sound-effect nodes disconnect when they finish; silent unlock audio only on iPhone/iPad.
- Server: admin leaderboard reset endpoint (`POST /api/admin/reset`).

## v5.1 (Oct 9, ~05:40)
- Score Codes now go to the **top 5** only (were top 20) and are called "Score Codes": "Top 5! #3 · Your Score Code · Keep it to prove this score is yours."
- Repository published: README, changelog, docs screenshots and music previews; test tools find files relative to the repo.
- Note: the in-game `VERSION` string is still `v5.0` (replays recorded by v5.0 and v5.1 are identical in format and outcome).

## v5.0 (Oct 9, ~05:38)
- **Credits** on the title, game-over/leaderboard screens and the X card: "Original Decicat concept by @doncastro." / "Game by @angelataptos". Readable at 480x480 and on phones (wraps on narrow screens).
- **Stage 8, Front-Runner Alley:** server-room data alley. Shadow bot Decicats replay your own path 0.6-1.0 s late, lock onto your lane (red dotted line) and cut past you. They only trip you while you're on the ground on their lane; jump as they pass (OUTRAN +50) or land on one (STOMP +100).
- **Stage 9, Bear King:** a boss with a crown and a red-candle sceptre in a storm castle of red charts. Telegraphed attacks: thrown red candles, floor slams with shockwaves, lunges. Stomp his head 3 times while he lunges (health bar). Beat him: he flees, +5000. Survive the stage: he retreats, +1000.
- **Stage 10, Launch Pad:** dawn rocket facility with gantries and live countdown boards, bears, and the rocket waiting on the pad at the end.
- **Rocket ending:** a ~12.6 s skippable cutscene (board, 3-2-1, liftoff, flight, landing on the big Decibel moon: TRADE LOUD. + fireworks), then "You made it to the Moon!" with run time, score and a +10000 bonus.
- **Moon Mode:** endless and hardest, low gravity, meteors, mixed hazards, cycling remixes.
- Leaderboard rows that reached the moon get a moon icon; the server derives `reachedMoon` from the replay when an entry is verified (`verify.mjs --save 1`, `POST /api/admin/verify`).
- **Share on X** button (x.com intent with your time, stage and rank).
- **14 trophies** with unlock toasts and a Trophies screen; **6 skins** unlocked by trophies (Classic, Night, Hoodie, Gold, Laser Eyes, Astronaut).
- New original tracks for stages 8-10, Moon Mode and the ending; new SFX.
- Canonical link is now https://decicat.bitcade.xyz/play (custom domain route in `wrangler.toml`; workers.dev keeps working).
- Fixes: game-over screen keeps the credits visible on short screens; narrow-phone name row; Moon Mode starts on clean moon scenery.

## v4.0 (Oct 9, ~04:29)
- Stages are now 45 s. New **stage 5 Whale Waters** (ride breaching whales), **stage 6 Short Squeeze** (hydraulic bars slam down) and **stage 7 Flash Crash** (gravity flips with a warning). To The Moon retired as a regular stage.
- **Power-ups:** Stop-Loss (blocks one hit), Liquidity Magnet, Limit Order (slow-mo), Diamond Paws (invincible).
- **Deterministic replays:** fixed 60 Hz steps, one seeded RNG, input logs of a few hundred bytes submitted with each score. The worker keeps replays for the top 50.
- **Claim codes** for top-20 runs (HMAC of the entry id; only the hash is stored) and the `tools/verify.mjs` admin verifier.
- Memory work: bounded background caches, one persistent audio voice graph per song.
- New Decibel mark traced from the official logo (48 px), tinted stage moons, new tracks.

## v3.0 (Oct 9, ~01:53) - includes v3.1
- Leaderboard moved from KV to a **SQLite Durable Object**: every score stored, exact ranks ("You placed #37"), top 20, rate limiting.
- Offline-safe score queue with retries and idempotent resends.
- TAP TO START gate (audio starts on the first gesture), stages every 25 s.
- Parallax backgrounds split into `bg.js`; `build.mjs` inlines everything into `dist/decicat.html`.
- v3.1 (a polish pass on the same day) is folded into this release: the v3 backup is the live v3.1 state.

## v2.0 (Oct 9, ~01:22)
- Online leaderboard on a Cloudflare Worker (KV), X player card (`/play`), frameable `/embed`, card image.
- Player names, five stages (Order Book, Funding Storm, Liquidation Rain, Bear Market, To The Moon), original WebAudio music and SFX.
- The backup of this version has no build output; `dist/decicat.html` in this commit was produced by inlining the backed-up sources exactly as the later `build.mjs` does.

## v1.0 (Oct 8)
- First playable single-file build of the one-touch Decicat runner.
- Not included in this repository (no copy of that build was kept); the history starts at v2.0.
