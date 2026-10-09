// leaderboard API test against `wrangler dev` (DEV=1 enables the x-test-ip header)
const B = process.argv[2] || 'http://127.0.0.1:8787';
const nonce = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const post = (body, ip) => fetch(B + '/api/score', { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-ip': ip || 'ip-' + Math.random() }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, j: await r.json() }));
const top = () => fetch(B + '/api/top').then(r => r.json());
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const t0 = await top(); const base = t0.total, baseScores = t0.top.map(e => e.score);
console.log('start total', base);
// 1. 60 concurrent posts, unique scores, from 60 IPs
const N = 60, scores = Array.from({ length: N }, (_, i) => 1000 + ((i * 23) % N) * 37);
const uniq = [...new Set(scores)]; ok(uniq.length === N, 'unique test scores');
const res = await Promise.all(scores.map((s, i) => post({ name: 'Par ' + i, score: s, runMs: 60000, nonce: nonce() }, 'par-' + i)));
ok(res.every(r => r.status === 200 && r.j.ok), 'all 60 concurrent posts accepted');
const totals = res.map(r => r.j.total).sort((a, b) => a - b);
ok(totals.every((t, i) => t === base + i + 1), 'writes serialised (totals ' + totals[0] + '..' + totals[N - 1] + ', no gaps/dupes)');
// exact rank at insert time: 1 + #(already-present scores higher)
const present = []; const legacyAll = []; // legacy scores beyond top20 are unknown, so only check when base <= 20
let rankOk = true;
const order = res.map((r, i) => ({ r, s: scores[i] })).sort((a, b) => a.r.j.total - b.r.j.total);
for (const o of order) { const exp = 1 + baseScores.filter(x => x > o.s).length + present.filter(x => x >= o.s).length; if (base <= 20 && o.r.j.rank !== exp) { rankOk = false; console.log('rank mismatch', o.s, o.r.j.rank, exp); } present.push(o.s); }
ok(rankOk, 'every response rank exact for its insert order');
const t1 = await top();
ok(t1.total === base + N, 'total after = ' + t1.total);
const expTop = baseScores.concat(scores).sort((a, b) => b - a).slice(0, 20);
ok(JSON.stringify(t1.top.map(e => e.score)) === JSON.stringify(expTop), 'top 20 exactly the 20 highest (no lost score)');
ok(t1.top.length === 20, 'top returns 20 rows');
// 2. rate limit: 30/min per IP
const rl = []; for (let i = 0; i < 33; i++) rl.push(await post({ name: 'Rl', score: 10 + i, runMs: 30000, nonce: nonce() }, 'same-ip'));
ok(rl.slice(0, 30).every(r => r.status === 200) && rl.slice(30).every(r => r.status === 429), '30 posts/min per IP ok, 31st -> 429 (client retries/queues)');
// 3. nonce replay is idempotent
const n1 = nonce(); const a = await post({ name: 'Replay', score: 777, runMs: 30000, nonce: n1 }, 'r1'); const b = await post({ name: 'Replay', score: 777, runMs: 30000, nonce: n1 }, 'r2');
ok(a.j.id === b.j.id && b.j.dup === true && b.j.total === a.j.total, 'resend with same nonce returns the same stored score (no dupes)');
// 4. short run accepted, unranked
const sh = await post({ name: 'Quick', score: 40, runMs: 1200, nonce: nonce() }, 'q1');
ok(sh.status === 200 && sh.j.ok && sh.j.ranked === false && sh.j.rank === 0, 'run < 2 s accepted but unranked');
// 5. implausible
const im = await post({ name: 'Cheat', score: 900000, runMs: 10000, nonce: nonce() }, 'c1');
ok(im.status === 422, 'implausible score -> 422');
const big = await post({ name: 'Boosty', score: 19063, runMs: 95000, nonce: nonce() }, 'b1');
ok(big.status === 200, 'real-looking 19063 in 95 s accepted');
// 6. rank outside top 20
const low = await post({ name: 'Lowly', score: 1, runMs: 30000, nonce: nonce() }, 'l1');
ok(low.j.rank > 20 && low.j.rank === low.j.total, 'low score gets true rank #' + low.j.rank + ' of ' + low.j.total);
