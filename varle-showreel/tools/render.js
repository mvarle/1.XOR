// usage: node tools/render.js outDir [workers=4] [sub=8] [from=0] [to=900] [fmt=png]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [outDir, nw = '4', sub = '8', from = '0', to = '900', fmt = 'png'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const N = +nw, F0 = +from, F1 = +to;
async function worker(k) {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', e => console.error('[w' + k + '] ' + e.message));
  await p.goto('file://' + path.resolve(__dirname, '../index.html'));
  await p.waitForFunction(() => window.ready !== undefined);
  if (!(await p.evaluate(() => window.ready))) throw new Error('fonts failed');
  let n = 0; const t0 = Date.now();
  for (let f = F0 + k; f < F1; f += N) {
    const file = path.join(outDir, `f${String(f).padStart(4, '0')}.${fmt === 'png' ? 'png' : 'jpg'}`);
    if (fs.existsSync(file)) continue;
    const data = await p.evaluate(([f, sub, fmt]) => { FILM.renderFrame(f, sub); return fmt === 'png' ? FILM.grab('image/png') : FILM.grab('image/jpeg', 0.96); }, [f, +sub, fmt]);
    fs.writeFileSync(file, Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'));
    if (++n % 50 === 0) console.log(`[w${k}] ${n} frames, ${((Date.now() - t0) / n).toFixed(0)} ms/frame`);
  }
  await b.close();
}
(async () => { const t0 = Date.now(); await Promise.all([...Array(N).keys()].map(worker)); console.log('done in', ((Date.now() - t0) / 1000).toFixed(1), 's'); })();
