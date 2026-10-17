// usage: node tools/preview.js outdir sub t1 t2 ...
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [outDir, subS, ...ts] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + path.resolve(__dirname, '../index.html'));
  await p.waitForFunction(() => window.ready !== undefined); const ok = await p.evaluate(() => window.ready); if (errs.length) console.log('ERR', errs);
  console.log('fonts ok:', ok);
  for (const t of ts) {
    const t0 = Date.now();
    const data = await p.evaluate(([t, sub]) => { FILM.renderFrame(Math.round(t * 60), sub); return FILM.grab('image/png'); }, [parseFloat(t), parseInt(subS)]);
    fs.writeFileSync(path.join(outDir, `t${parseFloat(t).toFixed(2)}.png`), Buffer.from(data.split(',')[1], 'base64'));
    console.log('t', t, Date.now() - t0, 'ms');
  }
  if (errs.length) console.log('ERRORS:\n' + errs.join('\n'));
  await b.close();
})();
