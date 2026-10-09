// DECICAT leaderboard + share pages - Cloudflare Worker (KV). NOT DEPLOYED.
// Routes:
//   GET  /api/top    -> { top: [{id,name,score}] }
//   POST /api/score  -> body {name, score, runMs, nonce} -> { ok, id, rank, top }
//   GET  /play       -> share page with X (Twitter) player-card meta tags
//   GET  /embed      -> the game itself (frameable by x.com / twitter.com)
//   GET  /card.png   -> poster image for the card
import GAME_HTML from '../dist/decicat.html';
import PLAY_HTML from './play.html';
import CARD_PNG from './card.png';

const MAX_PTS_PER_SEC = 450;   // distance ~45/s + coins/stomps/boost; generous ceiling
const MAX_BONUS = 1500;        // slack for short runs
const MIN_RUN_MS = 2000, MAX_RUN_MS = 2 * 60 * 60 * 1000;
const RATE_PER_MIN = 6;        // score posts per IP per minute
const BAD = ['fuck', 'shit', 'cunt', 'bitch', 'nigg', 'fag', 'rape', 'nazi', 'hitler', 'whore', 'slut', 'dick', 'cock', 'pussy', 'asshole', 'retard', 'kike', 'spic', 'chink', 'twat', 'wank', 'porn', 'cum', 'tits'];

function sanitizeName(s) {
  s = String(s || '').replace(/[^A-Za-z0-9 _.\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16).trim();
  if (!s) return 'ANON CAT';
  const norm = s.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/[^a-z]/g, '');
  if (BAD.some(w => norm.includes(w))) return 'ANON CAT';
  return s;
}
const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*', ...extra }
});
const FRAME_CSP = "frame-ancestors 'self' https://x.com https://*.x.com https://twitter.com https://*.twitter.com";

async function getTop(env) { return (await env.SCORES.get('top10', 'json')) || []; }

async function postScore(req, env) {
  const ip = req.headers.get('cf-connecting-ip') || 'unknown';
  // basic per-IP rate limit (KV is eventually consistent - good enough for a toy; use Durable Objects/D1 for strict)
  const rlKey = 'rl:' + ip + ':' + Math.floor(Date.now() / 60000);
  const count = parseInt((await env.SCORES.get(rlKey)) || '0', 10);
  if (count >= RATE_PER_MIN) return json({ ok: false, error: 'slow down' }, 429);
  await env.SCORES.put(rlKey, String(count + 1), { expirationTtl: 120 });

  let body; try { body = await req.json(); } catch { return json({ ok: false, error: 'bad json' }, 400); }
  const score = Math.floor(Number(body.score)), runMs = Math.floor(Number(body.runMs));
  const nonce = String(body.nonce || '');
  if (!Number.isFinite(score) || score < 0 || score > 5_000_000) return json({ ok: false, error: 'bad score' }, 400);
  if (!Number.isFinite(runMs) || runMs < MIN_RUN_MS || runMs > MAX_RUN_MS) return json({ ok: false, error: 'bad runMs' }, 400);
  if (score > (runMs / 1000) * MAX_PTS_PER_SEC + MAX_BONUS) return json({ ok: false, error: 'implausible' }, 422);
  if (!/^[a-zA-Z0-9]{8,64}$/.test(nonce)) return json({ ok: false, error: 'bad nonce' }, 400);
  const nKey = 'n:' + nonce;
  if (await env.SCORES.get(nKey)) return json({ ok: false, error: 'duplicate' }, 409);
  await env.SCORES.put(nKey, '1', { expirationTtl: 86400 });

  const name = sanitizeName(body.name);
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const top = await getTop(env);
  top.push({ id, name, score, at: Date.now() });
  top.sort((a, b) => b.score - a.score || a.at - b.at);
  const top10 = top.slice(0, 10);
  await env.SCORES.put('top10', JSON.stringify(top10));
  const rank = top10.findIndex(e => e.id === id) + 1;
  return json({ ok: true, id, rank, top: top10.map(({ id, name, score }) => ({ id, name, score })) });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const host = url.host;
    if (req.method === 'OPTIONS') return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' } });
    if (url.pathname === '/api/top' && req.method === 'GET') return json({ top: (await getTop(env)).map(({ id, name, score }) => ({ id, name, score })) });
    if (url.pathname === '/api/score' && req.method === 'POST') return postScore(req, env);
    if (url.pathname === '/embed') {
      // switch the game to the remote leaderboard (same origin)
      const html = GAME_HTML.replace("window.DECICAT_CONFIG = window.DECICAT_CONFIG || { scores: 'local', apiBase: '' };", "window.DECICAT_CONFIG = { scores: 'remote', apiBase: '' };");
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': FRAME_CSP, 'cache-control': 'public, max-age=300' } });
    }
    if (url.pathname === '/play' || url.pathname === '/') {
      return new Response(PLAY_HTML.replaceAll('{{HOST}}', host), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
    }
    if (url.pathname === '/card.png') return new Response(CARD_PNG, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
    return new Response('Not found', { status: 404 });
  }
};
