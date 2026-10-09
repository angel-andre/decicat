// Inlines config.js, sprites.js and game.js into one self-contained file: dist/decicat.html
// Usage: node build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const dir = new URL('.', import.meta.url).pathname;
let html = readFileSync(dir + 'index.html', 'utf8');
for (const f of ['config.js', 'sprites.js', 'audio.js', 'bg.js', 'game.js']) {
  const js = readFileSync(dir + f, 'utf8').replace(/<\/script/gi, '<\\/script');
  html = html.replace(`<script src="${f}"></script>`, () => `<script>\n${js}\n</script>`);
}
mkdirSync(dir + 'dist', { recursive: true });
writeFileSync(dir + 'dist/decicat.html', html);
console.log('dist/decicat.html', html.length, 'bytes');
