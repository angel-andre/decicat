// cross-version replay check: record runs on build A (scripted taps, natural deaths), re-simulate on build B
// node xver.mjs <recordHtml> <simHtml> [runs=4]
import { chromium } from 'playwright-core';
const [A, B, N = 4] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
let fails = 0;
for (let r = 0; r < +N; r++) {
  const p = await b.newPage(); await p.goto('file://' + A + '?manual&nogate'); 
  const live = await p.evaluate(async (r) => {
    let s = 1234 + r * 77; const rn = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    __decicat.start();
    for (let i = 0; i < 20000 && __decicat.state === 'play'; i++) {
      __decicat.advance(Math.floor(8 + rn() * 30));
      if (__decicat.state !== 'play') break;
      __decicat.press(); __decicat.advance(Math.floor(1 + rn() * 20)); __decicat.release();
      if (rn() < 0.35) { __decicat.advance(Math.floor(6 + rn() * 14)); __decicat.press(); __decicat.advance(Math.floor(1 + rn() * 10)); __decicat.release(); }
    }
    return { score: __decicat.score, zone: __decicat.zone, death: __decicat.death, replay: __decicat.replay, v: __decicat.version };
  }, r);
  await p.close();
  const q = await b.newPage(); await q.goto('file://' + B + '?manual&nogate');
  const sim = await q.evaluate(rp => { const o = __decicat.simulate(rp); return { score: o.score, zone: o.zone, death: o.death, v: __decicat.version }; }, live.replay);
  await q.close();
  const ok = sim.score === live.score && sim.death === live.death;
  if (!ok) fails++;
  console.log((ok ? 'PASS ' : 'FAIL ') + `recorded on ${live.v}: ${live.score} (zone ${live.zone}, ${live.death}) -> re-sim on ${sim.v}: ${sim.score} (zone ${sim.zone}, ${sim.death})`);
}
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
