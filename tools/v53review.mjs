// v5.3 before/after crops: jump takeoff, landing, coin pickup, bear stomp (hit-stop frame), power-up flash, death.
// Same seed/viewport on the v5.2 build (/tmp/decicat_v52.html) and the v5.3 dist. Crops are logical canvas pixels.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = '/tmp/v53rev/'; mkdirSync(OUT, { recursive: true });
const builds = { before: '/tmp/decicat_v52.html', after: '/workspace/decicat/game/dist/decicat.html' };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const errs = [];
for (const [tag, html] of Object.entries(builds)) {
  const p = await b.newPage({ viewport: { width: 854, height: 480 } });
  p.on('pageerror', e => errs.push(tag + ': ' + e.message));
  await p.goto(`file://${html}?manual&nogate&bot&god&seed=11&zt=4&zone=3`);
  const res = await p.evaluate(() => {
    localStorage.setItem('decicat_hint_v1', '1');
    const D = __decicat, cv = document.querySelector('canvas'), out = {};
    const step = n => (D.advanceReal ? D.advanceReal(n) : D.advance(n));
    const crop = (name, dy) => {
      const c = D.dbgStage.cat, [W] = D.size, x0 = Math.round(W * 0.27) - 44, y0 = Math.round(c.y) - 62 + (dy || 0);
      const t = document.createElement('canvas'); t.width = 96; t.height = 80; t.getContext('2d').drawImage(cv, x0, y0, 96, 80, 0, 0, 96, 80);
      out[name] = t.toDataURL();
    };
    const full = name => { out[name] = cv.toDataURL(); };
    D.start(); step(30);
    let g = D.dbgStage.cat.g, st = D.stats, got = {};
    for (let f = 0; f < 60 * 40 && Object.keys(got).length < 4; f++) {
      step(1);
      const c = D.dbgStage.cat, s = D.stats, db = s.bonus - st.bonus;
      if (!got.jump && g && !c.g && c.vy < -100) { step(1); crop('jump'); got.jump = 1; }
      else if (!got.land && got.jump && !g && c.g) { crop('land', 0); got.land = 1; }
      else if (!got.coin && s.coinsN > st.coinsN) { crop('coin'); got.coin = 1; }
      else if (!got.stomp && db === 200) { crop('stomp'); full('stompFull'); got.stomp = 1; }
      g = D.dbgStage.cat.g; st = D.stats;
    }
    out.got = Object.keys(got).join(',');
    D.pw('slow'); step(1); full('pwFull');
    return out;
  });
  await p.goto(`file://${html}?manual&nogate&seed=11&zone=3`);
  Object.assign(res, await p.evaluate(() => {
    const D = __decicat, cv = document.querySelector('canvas'), out = {}; const step = n => (D.advanceReal ? D.advanceReal(n) : D.advance(n));
    D.start(); step(40); const c = D.dbgStage.cat, [W] = D.size; D.kill(); step(+(new URLSearchParams(location.search).get('k') || 9));
    const t = document.createElement('canvas'); t.width = 96; t.height = 80; t.getContext('2d').drawImage(cv, Math.round(W * 0.27) - 44, Math.round(c.y) - 62, 96, 80, 0, 0, 96, 80); out.death = t.toDataURL(); out.st = D.state; return out;
  }));
  for (const [k, v] of Object.entries(res)) if (typeof v === 'string' && v.startsWith('data:')) writeFileSync(OUT + `${tag}_${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
  console.log(tag, res.got);
  await p.close();
}
console.log('errors', errs); await b.close();
