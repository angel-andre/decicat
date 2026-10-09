import { chromium } from 'playwright-core';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, ''); // repo root
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const b = await chromium.launch({ executablePath: CHROME });
const p = await b.newPage({ viewport: { width: 1200, height: 1200 } });
await p.goto('file://' + ROOT + '/dist/decicat.html?poster&manual&seed=1');
await p.evaluate(() => __decicat.advance(30));
await p.screenshot({ path: ROOT + '/server/card.png' });
await b.close();
