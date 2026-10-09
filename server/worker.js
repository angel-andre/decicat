// DECICAT leaderboard + share pages - Cloudflare Worker + SQLite-backed Durable Object.
// Routes:
//   GET  /api/top    -> { top: [{id,name,score}] (top 20), total }
//   POST /api/score  -> body {name, score, runMs, nonce} -> { ok, id, rank, ranked, total, top }
//   GET  /play       -> share page with X (Twitter) player-card meta tags
//   GET  /embed      -> the game itself (frameable by x.com / twitter.com), online leaderboard on
//   GET  /card.png   -> poster image for the card
// All scores live in ONE Durable Object instance (idFromName('global')), so writes are serialised and
// reads are strongly consistent (no KV read-modify-write races). KV is only read once, to import the
// v1/v2 'top' / 'top10' lists.
import { DurableObject } from 'cloudflare:workers';
import GAME_HTML from '../dist/decicat.html';
import PLAY_HTML from './play.html';
import CARD_PNG from './card.png';

const TOP_N = 20;
const MAX_PTS_PER_SEC = 600;   // sustained real play is ~100-280/s even with back-to-back 40x boosts; bursts are covered by MAX_BONUS
const MAX_BONUS = 5000;        // slack for short runs that catch a boost + coin trail
const MIN_RANKED_MS = 2000;    // shorter runs are stored but not ranked (never an error)
const MAX_RUN_MS = 2 * 60 * 60 * 1000;
const RATE_PER_MIN = 30;       // score posts per IP per minute (friends often share an IP)
const BAD = ['fuck', 'shit', 'cunt', 'bitch', 'nigg', 'fag', 'rape', 'nazi', 'hitler', 'whore', 'slut', 'dick', 'cock', 'pussy', 'asshole', 'retard', 'kike', 'spic', 'chink', 'twat', 'wank', 'porn', 'cum', 'tits'];

function sanitizeName(s) {
  s = String(s || '').replace(/[^A-Za-z0-9 _.\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16).trim();
  if (!s) return 'ANON CAT';
  const norm = s.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/[^a-z]/g, '');
  if (BAD.some(w => norm.includes(w))) return 'ANON CAT';
  return s;
}
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' };
const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS, ...extra }
});
const FRAME_CSP = "frame-ancestors 'self' https://x.com https://*.x.com https://twitter.com https://*.twitter.com";

export class Leaderboard extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS scores (id TEXT PRIMARY KEY, name TEXT NOT NULL, score INTEGER NOT NULL, run_ms INTEGER NOT NULL, at INTEGER NOT NULL, ranked INTEGER NOT NULL DEFAULT 1)`);
      this.sql.exec(`CREATE INDEX IF NOT EXISTS scores_rank ON scores (ranked, score DESC, at ASC)`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS nonces (nonce TEXT PRIMARY KEY, id TEXT NOT NULL, at INTEGER NOT NULL)`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS rl (ip TEXT NOT NULL, minute INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (ip, minute))`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`);
      await this.importLegacy();
    });
  }
  // one-time, idempotent import of the old KV lists (keyed by id, INSERT OR IGNORE)
  async importLegacy() {
    if (this.sql.exec(`SELECT v FROM meta WHERE k = 'kv_imported'`).toArray().length) return;
    let n = 0;
    if (this.env.SCORES) {
      for (const key of ['top', 'top10']) {
        let list = null; try { list = await this.env.SCORES.get(key, 'json'); } catch (e) { list = null; }
        if (!Array.isArray(list)) continue;
        for (const e of list) {
          if (!e || !e.id || !Number.isFinite(Number(e.score))) continue;
          this.sql.exec(`INSERT OR IGNORE INTO scores (id, name, score, run_ms, at, ranked) VALUES (?, ?, ?, ?, ?, 1)`, String(e.id), sanitizeName(e.name), Math.floor(Number(e.score)), Math.floor(Number(e.runMs) || 0), Math.floor(Number(e.at) || 0));
          n++;
        }
      }
    }
    this.sql.exec(`INSERT OR REPLACE INTO meta (k, v) VALUES ('kv_imported', ?)`, JSON.stringify({ at: Date.now(), n }));
  }
  topList() { return this.sql.exec(`SELECT id, name, score FROM scores WHERE ranked = 1 ORDER BY score DESC, at ASC LIMIT ?`, TOP_N).toArray(); }
  total() { return this.sql.exec(`SELECT COUNT(*) AS c FROM scores WHERE ranked = 1`).one().c; }
  rankOf(id) {
    const r = this.sql.exec(`SELECT score, at, ranked FROM scores WHERE id = ?`, id).toArray()[0];
    if (!r || !r.ranked) return 0;
    return this.sql.exec(`SELECT COUNT(*) AS c FROM scores WHERE ranked = 1 AND (score > ? OR (score = ? AND at < ?) OR (score = ? AND at = ? AND id < ?))`, r.score, r.score, r.at, r.score, r.at, id).one().c + 1;
  }
  async top() { return { top: this.topList(), total: this.total() }; }
  async submit(body, ip) {
    const now = Date.now(), minute = Math.floor(now / 60000);
    const nonce = String((body && body.nonce) || '');
    if (!/^[a-zA-Z0-9]{8,64}$/.test(nonce)) return { status: 400, body: { ok: false, error: 'bad nonce' } };
    // idempotent retries: same nonce -> same stored score, same answer (a lost response never duplicates or loses a score)
    const seen = this.sql.exec(`SELECT id FROM nonces WHERE nonce = ?`, nonce).toArray()[0];
    if (seen) return { status: 200, body: this.answer(seen.id, true) };
    const n = (this.sql.exec(`SELECT n FROM rl WHERE ip = ? AND minute = ?`, ip, minute).toArray()[0] || { n: 0 }).n;
    if (n >= RATE_PER_MIN) return { status: 429, body: { ok: false, error: 'slow down', retryAfter: 60 - Math.floor((now / 1000) % 60) } };
    this.sql.exec(`INSERT INTO rl (ip, minute, n) VALUES (?, ?, 1) ON CONFLICT (ip, minute) DO UPDATE SET n = n + 1`, ip, minute);
    if (Math.random() < 0.05) { this.sql.exec(`DELETE FROM rl WHERE minute < ?`, minute - 2); this.sql.exec(`DELETE FROM nonces WHERE at < ?`, now - 7 * 86400000); }
    const score = Math.floor(Number(body.score)), runMs = Math.floor(Number(body.runMs));
    if (!Number.isFinite(score) || score < 0 || score > 5_000_000) return { status: 400, body: { ok: false, error: 'bad score' } };
    if (!Number.isFinite(runMs) || runMs < 0 || runMs > MAX_RUN_MS) return { status: 400, body: { ok: false, error: 'bad runMs' } };
    if (score > (runMs / 1000) * MAX_PTS_PER_SEC + MAX_BONUS) return { status: 422, body: { ok: false, error: 'implausible' } };
    const ranked = runMs >= MIN_RANKED_MS ? 1 : 0;
    const id = now.toString(36) + Math.random().toString(36).slice(2, 8);
    this.sql.exec(`INSERT INTO scores (id, name, score, run_ms, at, ranked) VALUES (?, ?, ?, ?, ?, ?)`, id, sanitizeName(body.name), score, runMs, now, ranked);
    this.sql.exec(`INSERT INTO nonces (nonce, id, at) VALUES (?, ?, ?)`, nonce, id, now);
    return { status: 200, body: this.answer(id, false) };
  }
  answer(id, replay) {
    const row = this.sql.exec(`SELECT ranked FROM scores WHERE id = ?`, id).toArray()[0];
    return { ok: true, id, rank: this.rankOf(id), ranked: !!(row && row.ranked), total: this.total(), top: this.topList(), replay };
  }
}

const board = env => env.LB.get(env.LB.idFromName('global'));

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const host = url.host;
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname === '/api/top' && req.method === 'GET') {
      try { return json(await board(env).top()); } catch (e) { return json({ ok: false, error: 'unavailable' }, 503, { 'retry-after': '2' }); }
    }
    if (url.pathname === '/api/score' && req.method === 'POST') {
      let body; try { body = await req.json(); } catch { return json({ ok: false, error: 'bad json' }, 400); }
      let ip = req.headers.get('cf-connecting-ip') || 'unknown';
      if (env.DEV === '1' && req.headers.get('x-test-ip')) ip = req.headers.get('x-test-ip'); // local `wrangler dev` testing only
      try {
        const r = await board(env).submit(body, ip);
        return json(r.body, r.status, r.status === 429 ? { 'retry-after': String(r.body.retryAfter || 5) } : {});
      } catch (e) { return json({ ok: false, error: 'unavailable' }, 503, { 'retry-after': '2' }); }
    }
    if (url.pathname === '/embed') {
      // online leaderboard on (config.js keeps a pre-set DECICAT_CONFIG)
      const html = GAME_HTML.replace('<head>', "<head><script>window.DECICAT_CONFIG = { scores: 'remote', apiBase: '' };</script>");
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': FRAME_CSP, 'cache-control': 'public, max-age=300' } });
    }
    if (url.pathname === '/play' || url.pathname === '/') {
      return new Response(PLAY_HTML.replaceAll('{{HOST}}', host), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
    }
    if (url.pathname === '/card.png') return new Response(CARD_PNG, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
    return new Response('Not found', { status: 404 });
  }
};
