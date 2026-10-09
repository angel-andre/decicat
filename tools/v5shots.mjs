// v5 screenshots: title/credits, game over, stages 8-10, boss fight, rocket ending frames, Moon Mode, trophies, skins, 10-zone grid
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, ''); // repo root
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const URL0 = 'file://' + ROOT + '/dist/decicat.html';
const OUT = ROOT + '/shots/', T = '/tmp/v5s/';
const b = await chromium.launch({ executablePath: CHROME });
const errs = [];
async function page(q, vp) { const ctx = await b.newContext({ viewport: vp || { width: 854, height: 480 } }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); await p.goto(URL0 + q); await p.waitForTimeout(250); return p; }
const ui = (p, k) => p.evaluate(k => { const r = __decicat.ui[k]; return r && [r.x + r.w / 2, r.y + r.h / 2]; }, k);
const tap = async (p, k) => { const c = await ui(p, k); await p.evaluate(c => { __decicat.press(c[0], c[1]); __decicat.release && __decicat.release(); __decicat.advance(2); }, c); };
async function hunt(q, cond, file, seeds, maxF = 50 * 60, minF = 240) {
  for (const seed of seeds) {
    const p = await page(`?manual&autostart&bot&god&seed=${seed}&${q}`);
    for (let f = 0; f < maxF; f += 2) {
      await p.evaluate(() => __decicat.advance(2));
      if (f > minF && await p.evaluate(cond)) { await p.evaluate(() => __decicat.advance(1)); await p.screenshot({ path: file }); console.log('shot', file, 'seed', seed, 'frame', f); await p.context().close(); return true; }
    }
    await p.context().close();
  }
  console.log('NOT FOUND', file); return false;
}
// title (desktop, 480x480 embed, phone) - credits readable everywhere
for (const [vp, f] of [[{ width: 854, height: 480 }, OUT + 'v5_title.png'], [{ width: 480, height: 480 }, OUT + 'v5_title_480.png'], [{ width: 390, height: 844 }, OUT + 'v5_title_phone.png']]) {
  const p = await page('?manual&nogate', vp); await p.evaluate(() => __decicat.advance(130)); await p.screenshot({ path: f }); await p.context().close();
}
// game over / leaderboard (local board seeded with a few runs, one of them reached the moon)
for (const [vp, f] of [[{ width: 854, height: 480 }, OUT + 'v5_gameover.png'], [{ width: 480, height: 480 }, OUT + 'v5_gameover_480.png'], [{ width: 390, height: 844 }, OUT + 'v5_gameover_phone.png']]) {
  const p = await page('?manual&nogate&offline&seed=4&zone=7', vp);
  await p.evaluate(async () => { const L = new __decicat.LocalScores(); for (const r of [{ name: 'MOONCAT', score: 41250, runMs: 512000, moon: true }, { name: 'DEGEN', score: 18400, runMs: 241000 }, { name: 'HODLR', score: 9100, runMs: 150000 }]) await L.submit(r); });
  await p.evaluate(() => { __decicat.start(); __decicat.advance(600); __decicat.kill(); });
  for (let i = 0; i < 20; i++) { await p.evaluate(() => __decicat.advance(10)); await p.waitForTimeout(50); }
  await p.evaluate(() => __decicat.advance(60)); await p.screenshot({ path: f }); await p.context().close();
}
// stages 8, 9 (boss), 10 (launch pad with the rocket)
await hunt('zone=8', () => __decicat.dbgStage.cat.g && __decicat.dbgShadows.some(q => q.w <= 0 && q.x > -60 && q.x < -14 && Math.abs(q.y - __decicat.dbgStage.cat.y) < 4), OUT + 'v5_zone8.png', [3, 5, 8, 13]);
await hunt('zone=9', () => { const B = __decicat.v5.boss; return B && B.ph === 'throw'; }, OUT + 'v5_zone9.png', [3, 5, 8]);
await hunt('zone=9', () => { const B = __decicat.v5.boss; return B && B.ph === 'charge' && B.hp < 3 && B.sx < __decicat.size[0] * 0.75; }, OUT + 'v5_bossfight.png', [3, 5, 8, 13], 60 * 60);
await hunt('zone=10&zt=20', () => __decicat.v5.launchPad && __decicat.stats.runT > 18.7, OUT + 'v5_zone10.png', [3, 5, 8]);
// the rocket ending cutscene (frames) + YOU MADE IT TO THE MOON + Moon Mode
{
  const p = await page('?manual&autostart&bot&god&seed=5&zone=10&zt=6');
  for (let i = 0; i < 200 && await p.evaluate(() => __decicat.state) === 'play'; i++) await p.evaluate(() => __decicat.advance(10));
  const shotsAt = [[0.8, 'a_board'], [2.6, 'b_countdown'], [5.4, 'c_liftoff'], [8.4, 'd_flight'], [12.3, 'e_landing']];
  let t = 0;
  for (const [ts, nm] of shotsAt) { const n = Math.round((ts - t) * 60); await p.evaluate(n => __decicat.advance(n), n); t = ts; await p.screenshot({ path: OUT + `v5_ending_${nm}.png` }); console.log('ending', nm, await p.evaluate(() => __decicat.state)); }
  await p.evaluate(() => __decicat.advance(Math.round(1.6 * 60))); console.log('state', await p.evaluate(() => __decicat.state));
  await p.evaluate(() => __decicat.advance(90)); await p.screenshot({ path: OUT + 'v5_ending_f_madeit.png' });
  await p.context().close();
}
await hunt('zone=11', () => __decicat.stats.runT > 9 && __decicat.dbgStage.cat.g && __decicat.dbgStage.cat.y > 120, OUT + 'v5_moonmode.png', [5], 20 * 60, 500);
// trophies view (a few unlocked) + skins sheet
{
  const p = await page('?manual&nogate');
  await p.evaluate(() => { __decicat.achReset(); __decicat.advance(20); });
  await p.evaluate(() => { const ks = ['hop', 'stomp10', 'storm', 'whale', 'bots', 'king', 'moon']; localStorage.setItem('decicat_ach_v1', JSON.stringify(Object.fromEntries(ks.map(k => [k, 1])))); });
  await p.reload(); await p.waitForTimeout(250); await p.evaluate(() => __decicat.advance(130));
  await p.waitForTimeout(400); await tap(p, 'ach'); await p.evaluate(() => __decicat.advance(20)); console.log('ach state', await p.evaluate(() => __decicat.state));
  await p.screenshot({ path: OUT + 'v5_achievements.png' }); await p.evaluate(() => __decicat.achReset()); await p.context().close();
}
{
  const ids = ['classic', 'night', 'hoodie', 'gold', 'laser', 'astro'];
  const fs = [];
  for (const id of ids) {
    const p = await page('?manual&autostart&bot&god&seed=7&zone=1', { width: 420, height: 300 });
    await p.evaluate(() => __decicat.unlockAll()); await p.evaluate(id => __decicat.setSkin(id), id); await p.evaluate(() => __decicat.advance(150));
    for (let i = 0; i < 400 && !(await p.evaluate(() => __decicat.dbgStage.cat.g)); i++) await p.evaluate(() => __decicat.advance(1));
    const clip = await p.evaluate(() => { const c = document.querySelector('canvas').getBoundingClientRect(), [W] = __decicat.size, k = c.width / W, s = __decicat.dbgStage.cat, sx = s.x - (__decicat.dbgStage.camX || 0); return { k, y: c.top + (s.y - 62) * k, h: 70 * k, x0: c.left, w: c.width }; });
    const cx = await p.evaluate(() => Math.round(__decicat.size[0] * 0.27));
    await p.screenshot({ path: T + 'sk_' + id + '.png', clip: { x: clip.x0 + (cx - 34) * clip.k, y: Math.max(0, clip.y), width: 80 * clip.k, height: clip.h } }); fs.push(T + 'sk_' + id + '.png'); await p.evaluate(() => __decicat.achReset()); await p.context().close();
  }
  const p = await page('?manual&nogate'); await p.evaluate(() => __decicat.unlockAll()); await p.evaluate(() => __decicat.setSkin('astro')); await p.evaluate(() => __decicat.advance(130));
  await p.screenshot({ path: T + 'sk_title.png' }); await p.evaluate(() => __decicat.achReset()); await p.context().close();
  execSync(`cd ${T} && ffmpeg -y -loglevel error ${fs.map(f => '-i ' + f).join(' ')} -filter_complex "[0][1][2][3][4][5]hstack=6,scale=854:-1:flags=neighbor[g]" -map "[g]" sk_grid.png && ffmpeg -y -loglevel error -i sk_title.png -i sk_grid.png -filter_complex "[0][1]vstack" ${OUT}v5_skins.png`);
}
// all 10 stages grid
for (let z = 1; z <= 10; z++) { const p = await page(`?manual&autostart&bot&god&seed=11&zone=${z}`); await p.evaluate(() => __decicat.advance(420)); await p.screenshot({ path: `${T}grid_${z}.png` }); await p.context().close(); }
execSync(`cd ${T} && ffmpeg -y -loglevel error ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(z => '-i grid_' + z + '.png').join(' ')} -filter_complex "[0][1][2][3][4]hstack=5[a];[5][6][7][8][9]hstack=5[b];[a][b]vstack,scale=iw/2:ih/2:flags=neighbor" ${OUT}v5_zones_grid.png`);
console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors');
await b.close();
