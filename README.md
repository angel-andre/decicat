# DECICAT — A Decibel Adventure

An endless, one-touch pixel runner based on Castro's (@doncastro) Decicat mockup.

**Play:** open `dist/decicat.html` (one self-contained file, works offline from disk) or `index.html`.

**Controls:** tap / click / Space = jump. Hold for a higher jump, tap again in the air to double-jump. Land on a bear from above to stomp it. M = mute, P = pause. The ♪ and speaker icons (top right) toggle music and sound effects separately; the setting is remembered.

**Zones (every 25s):** 1 Order Book · 2 Funding Storm (wind gusts, rain) · 3 Liquidation Rain (red candles drop from the sky) · 4 Bear Market (bears) · 5 To The Moon (space, moon landing) · then it loops, faster each time.
Grab the gold **40x** box for a 4-second invincible rocket boost.
The BTC number in the HUD is just for fun. It isn't a real price.

## Files
- `index.html`, `config.js`, `sprites.js`, `audio.js`, `bg.js`, `game.js`: the game (no build step needed). `audio.js` synthesises all music and SFX live with WebAudio (no audio files); `bg.js` draws the parallax zone backgrounds and the pixel Decibel logo (rasterised from the official SVG paths).
- `build.mjs`: `node build.mjs` writes `dist/decicat.html` (everything inlined)
- `server/`: Cloudflare Worker + SQLite Durable Object leaderboard and X player-card pages (`/play`, `/embed`, `/card.png`, `/api/top`, `/api/score`). Deploy: `node build.mjs && cd server && npx wrangler deploy`.

## Leaderboard
Hosted copies (the Worker's `/embed`, or any http(s) host other than localhost) use the online top 20; a `file://` or localhost copy keeps scores on the device. Scores live in one Durable Object (SQLite), so every score is stored and ranks are exact (`You placed #37`). The client queues each score in localStorage before sending, retries with backoff (8 s timeout), and resends anything left over on the next load or game over. Resends are idempotent (nonce). Runs under 2 s are stored but not ranked. Rate limit: 30 posts/min per IP.

## Debug URL params
`?zone=3` start in a zone · `?boost` start boosted · `?bot` autoplay · `?god` no deaths · `?seed=7` repeatable level · `?zt=6` seconds per zone · `?autostart` · `?poster` static title card · `?nogate` skip the TAP TO START gate · `?record` log audio events instead of playing them (used for video capture)

Decicat art & idea by @doncastro.
