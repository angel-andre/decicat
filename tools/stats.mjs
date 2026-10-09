// Anonymous player counter (v5.4): prints per-day unique players, page loads and run sessions, all-time uniques and
// the score totals from GET /api/admin/stats (read-only).
// Usage: node tools/stats.mjs [--days 30] [--base https://decicat.bitcade.xyz] [--key-file /workspace/decicat/.admin_key] [--json]
//        (env DECICAT_BASE / ADMIN_KEY work too; local: --base http://127.0.0.1:8787 --key-file ../game/server/.dev.vars)
import { readFileSync } from 'node:fs';
const args = process.argv.slice(2), opt = {};
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) { const k = args[i].slice(2); opt[k] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true; }
const BASE = (opt.base || process.env.DECICAT_BASE || 'https://decicat.bitcade.xyz').replace(/\/$/, '');
const keyFile = opt['key-file'] || '/workspace/decicat/.admin_key';
const key = () => { if (process.env.ADMIN_KEY) return process.env.ADMIN_KEY.trim(); const k = readFileSync(keyFile, 'utf8').trim(); const m = k.match(/^ADMIN_KEY=(.*)$/m); return m ? m[1].trim() : k; };
const res = await fetch(`${BASE}/api/admin/stats?days=${parseInt(opt.days || '30', 10) || 30}`, { headers: { 'x-admin-key': key() } });
const j = await res.json().catch(() => null);
if (!res.ok || !j) { console.error('stats request failed:', res.status, j); process.exit(1); }
if (opt.json) { console.log(JSON.stringify(j, null, 2)); process.exit(0); }
console.log(`Decicat player stats  (${BASE})`);
console.log('day (UTC)    unique  loads   runs');
for (const d of j.days) console.log(`${d.day}  ${String(d.uniquePlayers).padStart(6)} ${String(d.loads).padStart(6)} ${String(d.runs).padStart(6)}`);
if (!j.days.length) console.log('(no pings recorded yet)');
console.log(`all-time unique players: ${j.allTimeUniquePlayers}`);
console.log(`scores: ${j.scores.ranked} ranked on the board, ${j.scores.stored} stored`);
console.log('note: runs = page loads that started at least one run');
