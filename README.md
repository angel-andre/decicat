# DECICAT — A Decibel Adventure

An endless, one-touch pixel runner based on Castro's (@doncastro) Decicat mockup.

**Play:** open `dist/decicat.html` (one self-contained file, works offline from disk) or `index.html`.

**Controls:** tap / click / Space = jump. Hold for a higher jump, tap again in the air to double-jump. Land on a bear from above to stomp it. M = mute, P = pause. The ♪ and speaker icons (top right) toggle music and sound effects separately; the setting is remembered.

**Zones (every 45 s, `ZONE_SECONDS` in game.js; gentle in-zone ramp, one 40x box per zone):** 1 Order Book · 2 Funding Storm (wind gusts, rain) · 3 Liquidation Rain (red candles drop from the sky) · 4 Bear Market (bears) · 5 Whale Waters (candle sea; ride breaching whales, jump off when they spout and dive) · 6 Short Squeeze (hydraulic bars slam down over pressure tunnels; stay low under them) · 7 Flash Crash (gravity flips for 2-4 s after a 1 s glitch + arrow warning; run on hanging candles) · then it loops from zone 1 ("II", "III"...), faster each time. The old To The Moon stage is retired as a regular zone (its art and music stay in the code for a future ending / Moon Mode). Each zone has its own original track.
Grab the gold **40x** box for a 4-second invincible rocket boost.
**Power-ups** (rare, at most one of each per zone): STOP-LOSS (blocks one hit or fall), LIQUIDITY MAGNET (6 s), LIMIT ORDER (slow-mo 0.6x for 4 s), DIAMOND PAWS (invincible 3 s). Active ones show under the score with a timer bar.
The BTC number in the HUD is just for fun. It isn't a real price.

## Files
- `index.html`, `config.js`, `sprites.js`, `audio.js`, `bg.js`, `game.js`: the game (no build step needed). `audio.js` synthesises all music and SFX live with WebAudio (no audio files; each song builds one persistent voice graph and plays notes by AudioParam automation, so it doesn't churn nodes); `bg.js` draws the parallax zone backgrounds and the pixel Decibel logo/moons (48 px mark traced from the official logo).
- `build.mjs`: `node build.mjs` writes `dist/decicat.html` (everything inlined)
- `server/`: Cloudflare Worker + SQLite Durable Object leaderboard and X player-card pages (`/play`, `/embed`, `/card.png`, `/api/top`, `/api/score`). Deploy: `node build.mjs && cd server && npx wrangler deploy`.

## Leaderboard
Hosted copies (the Worker's `/embed`, or any http(s) host other than localhost) use the online top 20; a `file://` or localhost copy keeps scores on the device. Scores live in one Durable Object (SQLite), so every score is stored and ranks are exact (`You placed #37`). The client queues each score in localStorage before sending, retries with backoff (8 s timeout), and resends anything left over on the next load or game over. Resends are idempotent (nonce). Runs under 2 s are stored but not ranked. Rate limit: 30 posts/min per IP.

## Contest protection (no sign-in)
The simulation is deterministic: fixed 60 Hz steps, one seeded RNG (run seed from `crypto.getRandomValues`), and inputs applied only at step boundaries. Every run records `{seed, size, delta-encoded press/release frames, resizes}` (a few hundred bytes) and submits it with the score. The Worker keeps the replay only while the run is in the top 50. A top-20 run gets a private claim code (`DCAT-XXXX-XX`, an HMAC of the entry id). The Worker stores only its SHA-256. The code is shown once ("Screenshot this!") and kept in the player's localStorage (`decicat_claims_v1`). Runs recorded with debug flags (`?bot`, `?god`, `?zt`...) are stored but not ranked. Older entries without a replay are listed as unverified.
`tools/verify.mjs` (needs the `ADMIN_KEY` secret, read from `.admin_key` in the repo root (git-ignored)): `list`, `entry <rank|id>` (fetches the replay, re-simulates it headlessly with `dist/decicat.html`, prints computed vs claimed), `all`, `claim <code> [rank|id]`, `file <replay.json>`. The admin API (`/api/admin/entries`, `/api/admin/entry`) needs the `x-admin-key` header.

## Debug URL params
`?zone=3` start in a zone · `?boost` start boosted · `?bot` autoplay · `?god` no deaths · `?seed=7` repeatable level · `?zt=6` seconds per zone · `?autostart` · `?poster` static title card · `?nogate` skip the TAP TO START gate · `?record` log audio events instead of playing them (used for video capture) · `?mem` memory/audio overlay (canvas count + area, cache sizes, live audio nodes, JS heap)

Decicat art & idea by @doncastro.
