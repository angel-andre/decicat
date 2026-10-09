import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
const URL0 = 'file://' + ROOT + '/dist/decicat.html';
const OUT = process.env.OUT || '/tmp/t3/'; // regression screenshots (the v3 deliverables in shots/ are kept as they were)
import { mkdirSync } from 'node:fs'; mkdirSync(OUT, { recursive: true });
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, ''); // repo root
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const b = await chromium.launch({ executablePath: CHROME });
const allErrs = []; let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
async function page(opts, q) {
  const ctx = await b.newContext(opts); const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') allErrs.push(q + ' ' + m.text()); });
  p.on('pageerror', e => allErrs.push(q + ' PAGEERR ' + e.message));
  await p.goto(URL0 + q); await p.waitForTimeout(300); return { p, ctx };
}
const sq = { viewport: { width: 480, height: 480 } };
const iph = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const uiPt = (p, k, dy = 0) => p.evaluate(([k, dy]) => { const u = __decicat.ui[k], c = document.querySelector('canvas').getBoundingClientRect(), s = c.width / __decicat.size[0]; return [c.left + (u.x + u.w / 2) * s, c.top + (u.y + u.h / 2 + dy) * s]; }, [k, dy]);
const audio = p => p.evaluate(() => __decicat.audio);

// 1. gate -> title (desktop 480), name editor
{ const { p, ctx } = await page(sq, '');
  await p.waitForTimeout(1000);
  ok(await p.evaluate(() => __decicat.state) === 'gate', 'fresh open shows the TAP TO START gate');
  ok((await audio(p)).song === null, 'no audio before the gesture');
  await p.waitForFunction(() => { const t = __decicat.stateT * 2.2; return Math.floor(t) % 2 === 0 && t % 1 < 0.3; }); await p.screenshot({ path: OUT + 'v3_gate.png' });
  await p.mouse.click(240, 300); await p.waitForTimeout(300);
  let a = await audio(p);
  ok(a.song === 'title' && a.ctx === 'running', 'after gate tap: title song playing (' + JSON.stringify(a) + ')');
  ok(await p.evaluate(() => __decicat.state) === 'title', 'gate tap goes to title (does not start a run)');
  await p.waitForTimeout(2600); await p.screenshot({ path: OUT + 'v3_title.png' });
  const np = await uiPt(p, 'name'); await p.mouse.click(np[0], np[1]); await p.waitForTimeout(300);
  ok(await p.isVisible('#namein'), 'EDIT NAME opens the name editor');
  await p.fill('#namein', 'Castro Fan'); await p.screenshot({ path: OUT + 'v3_name_editor.png' });
  await p.click('#namesave'); await p.waitForTimeout(500);
  ok((await audio(p)).song === 'title', 'title song still playing after the editor closes');
  await p.screenshot({ path: OUT + 'v3_title_named.png' });
  // bad word + length
  await p.mouse.click(np[0], np[1]); await p.waitForTimeout(300); await p.fill('#namein', 'shithead'); await p.click('#namesave');
  ok(/friendlier/.test(await p.textContent('#namemsg')), 'bad-word filter still rejects');
  await p.click('#nameskip'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => __decicat.sanitizeName('A'.repeat(30)).length) === 16, '16-char limit');
  // keyboard on gate (new page)
  const p2 = await ctx.newPage(); await p2.goto(URL0); await p2.waitForTimeout(600); await p2.keyboard.press('Space'); await p2.waitForTimeout(300);
  ok(await p2.evaluate(() => __decicat.state) === 'title' && (await audio(p2)).song === 'title', 'Space on the gate -> title + music (not a run)');
  // MENU -> title music
  await p2.keyboard.press('Space'); await p2.waitForTimeout(1500); await p2.evaluate(() => __decicat.kill()); await p2.waitForTimeout(2500);
  ok((await audio(p2)).song === 'gameover' || (await audio(p2)).song === 'results', 'game over music');
  const mp = await uiPt(p2, 'menu'); await p2.mouse.click(mp[0], mp[1]); await p2.waitForTimeout(400);
  ok(await p2.evaluate(() => __decicat.state) === 'title' && (await audio(p2)).song === 'title', 'MENU -> title with title music');
  await ctx.close(); }

// 2. zones (480x480): the 10 stages
for (const z of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  const { p, ctx } = await page(sq, `?manual&autostart&bot&god&seed=11&zone=${z}`);
  await p.evaluate(() => __decicat.advance(330));
  await p.screenshot({ path: OUT + `v3_zone${z}.png` }); await ctx.close();
}
execSync(`cd ${OUT} && ffmpeg -y -loglevel error ${[1, 2, 3, 4, 5, 6, 7, 8].map(z => '-i v3_zone' + z + '.png').join(' ')} -filter_complex "[0][1][2][3]hstack=4[a];[4][5][6][7]hstack=4[b];[a][b]vstack" v3_zones_grid.png`);
{ const { p, ctx } = await page(sq, '?manual&nogate');
  const names = await p.evaluate(() => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(z => __decicat.zoneName(z)));
  ok(names.join('|') === 'ORDER BOOK|FUNDING STORM|LIQUIDATION RAIN|BEAR MARKET|WHALE WATERS|SHORT SQUEEZE|FLASH CRASH|FRONT-RUNNER ALLEY|BEAR KING|LAUNCH PAD|MOON MODE|MOON MODE 2', 'stages: ' + names.join(', '));
  await ctx.close(); }
// 2b. power-ups: shield absorbs one hit, magnet / slow-mo / diamond timers run out
{ const { p, ctx } = await page(sq, '?manual&autostart&seed=21&zone=1');
  await p.evaluate(() => { __decicat.advance(60); __decicat.pw('shield'); });
  ok((await p.evaluate(() => __decicat.pwState)).shield, 'STOP-LOSS picked up');
  await p.evaluate(() => __decicat.advance(900)); // no input -> runs into a gap / hazard; the shield bounces it back once
  const st = await p.evaluate(() => ({ s: __decicat.state, pw: __decicat.pwState }));
  ok(!st.pw.shield, 'STOP-LOSS consumed by a hit/fall (state ' + st.s + ')');
  await ctx.close(); }
{ const { p, ctx } = await page(sq, '?manual&autostart&god&seed=21&zone=1');
  await p.evaluate(() => { __decicat.advance(60); __decicat.pw('mag'); __decicat.pw('slow'); __decicat.pw('dia'); __decicat.advance(30); });
  const a = await p.evaluate(() => __decicat.pwState);
  ok(a.mag > 5 && a.slow > 3 && a.dia > 2, 'magnet/slow/diamond timers start (' + JSON.stringify(a) + ')');
  await p.evaluate(() => __decicat.advance(60 * 9)); // magnet time is sim time (slowed 0.6x while LIMIT ORDER runs)
  const b2 = await p.evaluate(() => __decicat.pwState);
  ok(b2.mag === 0 && b2.slow === 0 && b2.dia === 0, 'all timed power-ups expire');
  await ctx.close(); }
// 3. boost
{ const { p, ctx } = await page(sq, '?manual&autostart&bot&seed=5&zone=1');
  await p.evaluate(() => { __decicat.advance(150); __decicat.boost(); __decicat.advance(40); }); await p.screenshot({ path: OUT + 'v3_boost.png' });
  await p.evaluate(() => __decicat.advance(300)); ok(await p.evaluate(() => __decicat.state) !== 'title', 'boost lands fine'); await ctx.close(); }
// 4. top-20 game over (local board, 19 earlier scores)
{ const { p, ctx } = await page(sq, '?nogate&bot&seed=3');
  await p.evaluate(() => { const a = []; const N = ['NEON WHALE 101', 'LUNAR OTTER 377', 'TURBO FOX 512', 'PIXEL OWL 640', 'COSMIC YAK 233', 'LASER LYNX 908', 'GOLDEN BULL 118', 'ROCKET MOLE 450', 'HYPER CRAB 777', 'MELLOW FROG 321', 'SNEAKY GECKO 66', 'LUCKY MOTH 841', 'FUZZY PANDA 12', 'VELVET KOALA 9', 'RETRO RAVEN 404', 'COMET SHARK 303', 'SONIC LLAMA 202', 'DISCO TIGER 101', 'FUNKY BADGER 55']; N.forEach((n, i) => a.push({ id: 'x' + i, name: n, score: 4000 - i * 190, at: i })); localStorage.setItem('decicat_top10_v1', JSON.stringify(a)); localStorage.setItem('decicat_name', 'Castro Fan'); });
  await p.reload(); await p.waitForTimeout(500);
  await p.evaluate(() => __decicat.start()); await p.waitForTimeout(4000); await p.evaluate(() => { if (__decicat.state === 'play') __decicat.kill(); }); await p.waitForTimeout(2600);
  const r = await p.evaluate(() => ({ rank: __decicat.result.rank, n: __decicat.result.top.length, st: __decicat.result.status }));
  ok(r.n === 20 && r.rank > 0 && r.st === 'local', 'local top 20: 20 rows, placed #' + r.rank);
  await p.screenshot({ path: OUT + 'v3_gameover_top20.png' }); await ctx.close(); }
// 5. mobile portrait 390x844 touch
{ const { p, ctx } = await page(iph, '');
  await p.waitForTimeout(900); await p.screenshot({ path: OUT + 'v3_mobile_gate.png' });
  await p.touchscreen.tap(195, 500); await p.waitForTimeout(300);
  const a = await audio(p); ok(a.song === 'title' && a.ctx === 'running', 'mobile: gate tap starts title song');
  await p.waitForTimeout(2500); await p.screenshot({ path: OUT + 'v3_mobile_title.png' });
  const mt = await uiPt(p, 'music'); await p.touchscreen.tap(mt[0], mt[1]); await p.waitForTimeout(200);
  ok((await audio(p)).music === false && await p.evaluate(() => __decicat.state) === 'title', 'mobile: music toggle works on title');
  await p.touchscreen.tap(mt[0], mt[1]); await p.waitForTimeout(200);
  await p.touchscreen.tap(195, 760); await p.waitForTimeout(300);
  ok(await p.evaluate(() => __decicat.state) === 'play' && (await audio(p)).song === 'z1', 'mobile: tap starts run with zone music');
  for (let i = 0; i < 8; i++) { await p.touchscreen.tap(195, 600); await p.waitForTimeout(450); }
  await p.screenshot({ path: OUT + 'v3_mobile_play.png' });
  for (let k = 0; k < 80; k++) { if (await p.evaluate(() => __decicat.state) === 'over') break; await p.waitForTimeout(250); }
  await p.waitForTimeout(1500); await p.screenshot({ path: OUT + 'v3_mobile_gameover.png' });
  ok(await p.evaluate(() => __decicat.state) === 'over', 'mobile: run ends in game over');
  await ctx.close(); }
for (const z of [2, 5, 6, 7]) { const { p, ctx } = await page(iph, `?manual&autostart&bot&god&seed=4&zone=${z}`); await p.evaluate(() => __decicat.advance(400)); await p.screenshot({ path: OUT + `v3_mobile_zone${z}.png` }); await ctx.close(); }
// 6. pause
{ const { p, ctx } = await page(sq, '?autostart&bot');
  await p.waitForTimeout(1200); await p.evaluate(() => window.dispatchEvent(new Event('blur'))); await p.waitForTimeout(300);
  ok(await p.evaluate(() => __decicat.paused), 'pause on blur');
  await p.mouse.click(240, 240); await p.waitForTimeout(300); ok(!(await p.evaluate(() => __decicat.paused)), 'tap resumes'); await ctx.close(); }
// 7. landscape + desktop
{ const { p, ctx } = await page({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, '?manual&autostart&bot&god&seed=3&zone=4'); await p.evaluate(() => __decicat.advance(400)); await p.screenshot({ path: OUT + 'v3_mobile_landscape_zone4.png' }); await ctx.close(); }
{ const { p, ctx } = await page({ viewport: { width: 1280, height: 720 } }, '?manual&autostart&bot&god&seed=3&zone=3'); await p.evaluate(() => __decicat.advance(400)); await p.screenshot({ path: OUT + 'v3_desktop_zone3.png' }); await ctx.close(); }
{ const { p, ctx } = await page({ viewport: { width: 1280, height: 720 } }, '?nogate&manual'); await p.evaluate(() => __decicat.advance(200)); await p.screenshot({ path: OUT + 'v3_desktop_title.png' }); await ctx.close(); }
ok(allErrs.length === 0, 'console errors: ' + (allErrs.length ? JSON.stringify(allErrs) : 'none'));
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
await b.close();
