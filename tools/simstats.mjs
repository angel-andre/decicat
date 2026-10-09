import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const p = await b.newPage({ viewport: { width: 480, height: 480 } });
for (const s of [1,2,3,4,5,6]) {
await p.goto(`file:///workspace/decicat/game/dist/decicat.html?manual&autostart&bot&god&seed=${s}`);
const r = await p.evaluate(() => { const out=[]; for (let k=0;k<6;k++){ __decicat.advance(600); out.push(JSON.stringify(__decicat.stats)); } return out; });
console.log(s, r.join(' | '));
}
await b.close();
