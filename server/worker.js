// DECICAT leaderboard + share pages - Cloudflare Worker + SQLite-backed Durable Object.
// Routes:
//   GET  /api/top    -> { top: [{id,name,score}] (top 20), total }
//   POST /api/score  -> body {name, score, runMs, nonce, replay?, v?} -> { ok, id, rank, ranked, total, top, claim? }
//                       replay = {v, seed, w, h, zt, z0, ev, rs, f, dbg}: the run's seed + delta-encoded input log. The game's
//                       sim is deterministic (fixed 60 Hz step, seeded RNG), so tools/verify.mjs can re-simulate it headlessly
//                       and get the identical score. Replays are kept ONLY while the run is in the top 50.
//                       A top-20 run gets a private claim code (DCAT-XXXX-XX); only its SHA-256 is stored.
//   GET  /api/admin/entries?n=50, /api/admin/entry?id=|rank=   (header x-admin-key: ADMIN_KEY secret) -> entries + replays
//   POST /api/admin/verify {id, ok, moon}  (admin) -> stores the verify.mjs re-sim result; reachedMoon shown on the
//                       board = the verified flag when present, else the client's claim (display only)
//   POST /api/ping   -> body {id, ev}: anonymous unique-player counter (v5.4). id = the browser's random 128-bit id
//                       (32 hex), ev = 'load' | 'run'. Stores ONLY SHA-256(secret salt + id) per UTC day and all-time,
//                       plus per-day load/run counters. No IP, user agent or name is stored. Always answers 204.
//   GET  /api/admin/stats?days=30 (admin) -> per-day unique players / loads / runs, all-time uniques, score totals
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
const MAX_BONUS = 20000;       // slack for bonuses (40x, coins, Bear King +5000, rocket ending +10000)
const MOON_MIN_MS = 440000;    // the ending needs all 10 stages (10 x 45 s of sim time); shorter 'moon' claims are ignored
const MIN_RANKED_MS = 2000;    // shorter runs are stored but not ranked (never an error)
const MAX_RUN_MS = 2 * 60 * 60 * 1000;
const RATE_PER_MIN = 30;       // score posts per IP per minute (friends often share an IP)
const PING_PER_MIN = 60;       // anonymous counter pings per (hashed) IP per minute, separate bucket from scores
const REPLAY_TOP = 50;         // keep replays only for the top 50
const CLAIM_TOP = 5;           // score codes for the top 5
const CLAIM_ABC = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const BAD = ['fuck', 'shit', 'cunt', 'bitch', 'nigg', 'fag', 'rape', 'nazi', 'hitler', 'whore', 'slut', 'dick', 'cock', 'pussy', 'asshole', 'retard', 'kike', 'spic', 'chink', 'twat', 'wank', 'porn', 'cum', 'tits'];

function sanitizeName(s) {
  s = String(s || '').replace(/[^A-Za-z0-9 _.\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16).trim();
  if (!s) return 'ANON CAT';
  const norm = s.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/[^a-z]/g, '');
  if (BAD.some(w => norm.includes(w))) return 'ANON CAT';
  return s;
}
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' };
const enc = new TextEncoder();
const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
async function sha256hex(s) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
// claim code = HMAC(secret derived from ADMIN_KEY, entry id) -> deterministic, so an idempotent resend shows the same code
async function claimCode(adminKey, id) {
  const k = await crypto.subtle.importKey('raw', enc.encode('decicat-claim:' + adminKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(String(id))));
  let c = ''; for (let i = 0; i < 6; i++) c += CLAIM_ABC[((mac[2 * i] << 8) | mac[2 * i + 1]) % CLAIM_ABC.length];
  return 'DCAT-' + c.slice(0, 4) + '-' + c.slice(4);
}
function timingSafeEq(a, b) {
  a = enc.encode(String(a)); b = enc.encode(String(b));
  let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a[i] || 0) ^ (b[i] || 0);
  return d === 0;
}
// shape check only (the real check is the headless re-simulation in tools/verify.mjs)
function cleanReplay(r) {
  if (!r || typeof r !== 'object') return null;
  const int = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
  if (!int(r.seed, -2147483648, 2147483647) || !int(r.w, 50, 4000) || !int(r.h, 50, 4000)) return null;
  if (typeof r.ev !== 'string' || r.ev.length > 60000 || !/^[0-9a-z.]*$/.test(r.ev)) return null;
  const rs = Array.isArray(r.rs) ? r.rs.slice(0, 200).filter(x => Array.isArray(x) && x.length === 3 && x.every(n => Number.isInteger(n) && n >= 0 && n < 1e8)) : [];
  return { v: String(r.v || '').slice(0, 16), seed: r.seed, w: r.w, h: r.h, zt: Number(r.zt) > 0 && Number(r.zt) < 1000 ? Number(r.zt) : 45, z0: int(r.z0, 1, 999) ? r.z0 : 1, ev: r.ev, rs, f: int(r.f, 0, 1e8) ? r.f : 0, dbg: r.dbg ? 1 : 0 };
}
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
      // v4 columns (idempotent migration of the live table): replay JSON (top 50 only), claim-code hash, client version, had-replay flag
      const cols = new Set(this.sql.exec(`PRAGMA table_info(scores)`).toArray().map(c => c.name));
      for (const [c, t] of [['replay', 'TEXT'], ['claim_hash', 'TEXT'], ['ver', 'TEXT'], ['rp', 'INTEGER NOT NULL DEFAULT 0'], ['note', 'TEXT'], ['moon', 'INTEGER NOT NULL DEFAULT 0'], ['v_ok', 'INTEGER'], ['v_moon', 'INTEGER'], ['v_at', 'INTEGER']]) if (!cols.has(c)) this.sql.exec(`ALTER TABLE scores ADD COLUMN ${c} ${t}`);
      await this.importLegacy();
      try { this.pingSchema(); } catch (e) { this.pingOk = false; } // v5.4 player counter: never allowed to break the board
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
  // ---- v5.4 anonymous player counter (separate tables; never reads or writes scores/nonces) ----
  pingSchema() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS ping_day (day TEXT NOT NULL, h TEXT NOT NULL, PRIMARY KEY (day, h))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS ping_all (h TEXT PRIMARY KEY, first_day TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS ping_count (day TEXT PRIMARY KEY, loads INTEGER NOT NULL DEFAULT 0, runs INTEGER NOT NULL DEFAULT 0)`);
    let salt = (this.sql.exec(`SELECT v FROM meta WHERE k = 'ping_salt'`).toArray()[0] || {}).v;
    if (!salt) { salt = hex(crypto.getRandomValues(new Uint8Array(32))); this.sql.exec(`INSERT OR IGNORE INTO meta (k, v) VALUES ('ping_salt', ?)`, salt); salt = this.sql.exec(`SELECT v FROM meta WHERE k = 'ping_salt'`).one().v; }
    this.pingSalt = salt; this.pingOk = true;
  }
  async ping(id, ev, ip) {
    if (!this.pingOk) this.pingSchema();
    if (!/^[0-9a-f]{32}$/.test(String(id || '')) || (ev !== 'load' && ev !== 'run')) return { ok: false, error: 'bad ping' };
    const now = Date.now(), minute = Math.floor(now / 60000), day = new Date(now).toISOString().slice(0, 10);
    // same per-minute limiter as scores (rl table), but its own bucket so pings can never use up an IP's score budget,
    // and keyed by a salted hash of the IP (the IP itself is never written; rows are purged after ~2 minutes)
    const rk = 'p:' + (await sha256hex(this.pingSalt + ':ip:' + ip)).slice(0, 24);
    const n = (this.sql.exec(`SELECT n FROM rl WHERE ip = ? AND minute = ?`, rk, minute).toArray()[0] || { n: 0 }).n;
    if (n >= PING_PER_MIN) return { ok: false, error: 'slow down' };
    this.sql.exec(`INSERT INTO rl (ip, minute, n) VALUES (?, ?, 1) ON CONFLICT (ip, minute) DO UPDATE SET n = n + 1`, rk, minute);
    if (Math.random() < 0.05) this.sql.exec(`DELETE FROM rl WHERE ip LIKE 'p:%' AND minute < ?`, minute - 2);
    const h = await sha256hex(this.pingSalt + ':' + id);
    this.sql.exec(`INSERT OR IGNORE INTO ping_day (day, h) VALUES (?, ?)`, day, h);
    this.sql.exec(`INSERT OR IGNORE INTO ping_all (h, first_day) VALUES (?, ?)`, h, day);
    this.sql.exec(`INSERT INTO ping_count (day, loads, runs) VALUES (?, ?, ?) ON CONFLICT (day) DO UPDATE SET loads = loads + excluded.loads, runs = runs + excluded.runs`, day, ev === 'load' ? 1 : 0, ev === 'run' ? 1 : 0);
    return { ok: true };
  }
  async adminStats(days) {
    if (!this.pingOk) this.pingSchema();
    days = Math.max(1, Math.min(366, days || 30));
    const rows = this.sql.exec(`SELECT c.day AS day, c.loads AS loads, c.runs AS runs, (SELECT COUNT(*) FROM ping_day d WHERE d.day = c.day) AS uniq FROM ping_count c ORDER BY c.day DESC LIMIT ?`, days).toArray();
    return {
      days: rows.map(r => ({ day: r.day, uniquePlayers: r.uniq, loads: r.loads, runs: r.runs })),
      allTimeUniquePlayers: this.sql.exec(`SELECT COUNT(*) AS c FROM ping_all`).one().c,
      scores: { ranked: this.total(), stored: this.sql.exec(`SELECT COUNT(*) AS c FROM scores`).one().c },
      note: 'days are UTC; runs = page loads that started at least one run'
    };
  }
  topList() { return this.sql.exec(`SELECT id, name, score, rp AS vf, COALESCE(v_moon, moon) AS moon FROM scores WHERE ranked = 1 ORDER BY score DESC, at ASC LIMIT ?`, TOP_N).toArray(); }
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
    if (seen) return { status: 200, body: await this.answer(seen.id, true) };
    const n = (this.sql.exec(`SELECT n FROM rl WHERE ip = ? AND minute = ?`, ip, minute).toArray()[0] || { n: 0 }).n;
    if (n >= RATE_PER_MIN) return { status: 429, body: { ok: false, error: 'slow down', retryAfter: 60 - Math.floor((now / 1000) % 60) } };
    this.sql.exec(`INSERT INTO rl (ip, minute, n) VALUES (?, ?, 1) ON CONFLICT (ip, minute) DO UPDATE SET n = n + 1`, ip, minute);
    if (Math.random() < 0.05) { this.sql.exec(`DELETE FROM rl WHERE minute < ?`, minute - 2); this.sql.exec(`DELETE FROM nonces WHERE at < ?`, now - 7 * 86400000); }
    const score = Math.floor(Number(body.score)), runMs = Math.floor(Number(body.runMs));
    if (!Number.isFinite(score) || score < 0 || score > 5_000_000) return { status: 400, body: { ok: false, error: 'bad score' } };
    if (!Number.isFinite(runMs) || runMs < 0 || runMs > MAX_RUN_MS) return { status: 400, body: { ok: false, error: 'bad runMs' } };
    if (score > (runMs / 1000) * MAX_PTS_PER_SEC + MAX_BONUS) return { status: 422, body: { ok: false, error: 'implausible' } };
    const rp = cleanReplay(body.replay);
    // debug runs (?bot / ?god / custom zone length...) are stored but never ranked on the real board
    const debugRun = !!(rp && rp.dbg) && this.env.DEV !== '1';
    const ranked = runMs >= MIN_RANKED_MS && !debugRun ? 1 : 0;
    const id = now.toString(36) + Math.random().toString(36).slice(2, 8);
    this.sql.exec(`INSERT INTO scores (id, name, score, run_ms, at, ranked, ver, note, moon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, sanitizeName(body.name), score, runMs, now, ranked, String(body.v || (rp && rp.v) || '').slice(0, 16), debugRun ? 'debug' : null, body.moon && runMs >= MOON_MIN_MS ? 1 : 0);
    this.sql.exec(`INSERT INTO nonces (nonce, id, at) VALUES (?, ?, ?)`, nonce, id, now);
    const rank = this.rankOf(id);
    if (rp && rank > 0 && rank <= REPLAY_TOP) {
      this.sql.exec(`UPDATE scores SET replay = ?, rp = 1 WHERE id = ?`, JSON.stringify(rp), id);
      // drop replays of runs that have fallen out of the top 50 (rp stays 1 = it was submitted with a replay)
      this.sql.exec(`UPDATE scores SET replay = NULL WHERE replay IS NOT NULL AND id NOT IN (SELECT id FROM scores WHERE ranked = 1 ORDER BY score DESC, at ASC LIMIT ?)`, REPLAY_TOP);
    }
    return { status: 200, body: await this.answer(id, false, debugRun) };
  }
  async answer(id, dup, debugRun) {
    const row = this.sql.exec(`SELECT ranked, claim_hash, note FROM scores WHERE id = ?`, id).toArray()[0];
    const rank = this.rankOf(id), out = { ok: true, id, rank, ranked: !!(row && row.ranked), total: this.total(), top: this.topList(), dup };
    if (row && row.note === 'debug') out.why = 'debug';
    const key = this.env.ADMIN_KEY;
    // claim code only in the response to the submit itself (or its idempotent resend), and only while it is in the top 20
    if (key && rank > 0 && rank <= CLAIM_TOP && (!dup || row.claim_hash)) {
      const code = await claimCode(key, id);
      if (!row.claim_hash) this.sql.exec(`UPDATE scores SET claim_hash = ? WHERE id = ?`, await sha256hex(code), id);
      out.claim = code;
    }
    return out;
  }
  // ---- admin (secret-protected in the fetch handler) ----
  adminRows(where, args) {
    return this.sql.exec(`SELECT id, name, score, run_ms, at, ranked, ver, rp, note, claim_hash, replay, moon, v_ok, v_moon, v_at FROM scores ${where}`, ...args).toArray();
  }
  async adminEntries(n) {
    const rows = this.adminRows(`WHERE ranked = 1 ORDER BY score DESC, at ASC LIMIT ?`, [Math.max(1, Math.min(500, n || 50))]);
    return { entries: rows.map((r, i) => ({ rank: i + 1, id: r.id, name: r.name, score: r.score, runMs: r.run_ms, at: r.at, ver: r.ver, hasReplay: !!r.replay, verifiable: !!r.replay, unverified: !r.rp, claimHash: r.claim_hash || null, moon: !!r.moon, verified: r.v_ok === null ? null : !!r.v_ok, reachedMoon: r.v_moon === null ? null : !!r.v_moon })), total: this.total() };
  }
  // verify.mjs posts its re-sim result: v_moon (derived from the replay) overrides the client's moon claim on the board
  async adminVerify(id, ok, moon) {
    const r = this.sql.exec(`SELECT id FROM scores WHERE id = ?`, String(id || '')).toArray()[0];
    if (!r) return null;
    this.sql.exec(`UPDATE scores SET v_ok = ?, v_moon = ?, v_at = ? WHERE id = ?`, ok ? 1 : 0, moon ? 1 : 0, Date.now(), r.id);
    return { ok: true, id: r.id, verified: !!ok, reachedMoon: !!moon };
  }
  // archive every score into a dated table, then clear the live board (scores + nonces); the legacy import flag stays set
  async adminReset() {
    const before = this.sql.exec(`SELECT COUNT(*) AS c FROM scores`).one().c;
    this.sql.exec(`DELETE FROM scores`); this.sql.exec(`DELETE FROM nonces`);
    return { ok: true, cleared: before, total: this.total() };
  }
  async adminEntry(id, rank) {
    let r;
    if (id) r = this.adminRows(`WHERE id = ?`, [String(id)])[0];
    else if (rank) r = this.adminRows(`WHERE ranked = 1 ORDER BY score DESC, at ASC LIMIT 1 OFFSET ?`, [Math.max(0, (rank | 0) - 1)])[0];
    if (!r) return null;
    return { rank: this.rankOf(r.id), id: r.id, name: r.name, score: r.score, runMs: r.run_ms, at: r.at, ranked: !!r.ranked, ver: r.ver, note: r.note, unverified: !r.rp, claimHash: r.claim_hash || null, moon: !!r.moon, verified: r.v_ok === null ? null : !!r.v_ok, reachedMoon: r.v_moon === null ? null : !!r.v_moon, verifiedAt: r.v_at || null, replay: r.replay ? JSON.parse(r.replay) : null };
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
    if (url.pathname === '/api/ping' && req.method === 'POST') {
      // fire-and-forget counter: isolated try/catch, always 204, never touches the score endpoints
      try {
        const txt = await req.text();
        if (txt.length <= 200) {
          const b = JSON.parse(txt);
          let ip = req.headers.get('cf-connecting-ip') || 'unknown';
          if (env.DEV === '1' && req.headers.get('x-test-ip')) ip = req.headers.get('x-test-ip');
          if (env.DEV === '1' && req.headers.get('x-test-fail')) throw new Error('test failure');
          await board(env).ping(b && b.id, b && b.ev, ip);
        }
      } catch (e) { }
      return new Response(null, { status: 204, headers: { 'cache-control': 'no-store', ...CORS } });
    }
    if (url.pathname.startsWith('/api/admin/') && (req.method === 'GET' || req.method === 'POST')) {
      if (!env.ADMIN_KEY) return json({ ok: false, error: 'admin disabled' }, 503);
      if (!timingSafeEq(req.headers.get('x-admin-key') || '', env.ADMIN_KEY)) return json({ ok: false, error: 'forbidden' }, 403);
      try {
        if (url.pathname === '/api/admin/verify' && req.method === 'POST') {
          let b; try { b = await req.json(); } catch { return json({ ok: false, error: 'bad json' }, 400); }
          const v = await board(env).adminVerify(b && b.id, !!(b && b.ok), !!(b && b.moon));
          return v ? json(v) : json({ ok: false, error: 'not found' }, 404);
        }
        if (url.pathname === '/api/admin/reset' && req.method === 'POST') return json(await board(env).adminReset());
        if (url.pathname === '/api/admin/stats') return json(await board(env).adminStats(parseInt(url.searchParams.get('days') || '30', 10)));
        if (url.pathname === '/api/admin/entries') return json(await board(env).adminEntries(parseInt(url.searchParams.get('n') || '50', 10)));
        if (url.pathname === '/api/admin/entry') {
          const e = await board(env).adminEntry(url.searchParams.get('id'), parseInt(url.searchParams.get('rank') || '0', 10));
          return e ? json(e) : json({ ok: false, error: 'not found' }, 404);
        }
      } catch (e) { return json({ ok: false, error: 'unavailable', detail: String(e && e.message || e).slice(0, 200) }, 503); }
      return json({ ok: false, error: 'not found' }, 404);
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
