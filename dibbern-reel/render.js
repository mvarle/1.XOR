// Headless renderer for the reel.
//   node render.js stills out/ 0.5 1.2 3.0      → PNG stills at given times (no motion blur)
//   node render.js video out/reel_silent.mp4     → full 60 fps render, motion-blurred, piped to ffmpeg
// Env: FPS (60), SUB (sub-samples per frame, 5), SHUTTER (0.5 = 180°), FROM/TO (frame range).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = __dirname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

(async () => {
  const [mode, outPath, ...rest] = process.argv.slice(2);
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch({ args: ['--disable-gpu', '--force-color-profile=srgb'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('console', m => console.log('[page]', m.text()));
  page.on('pageerror', e => { console.error('[pageerror]', e.message); process.exitCode = 1; });
  await page.goto(url);
  await page.evaluate(() => window.__ready);
  const clip = { x: 0, y: 0, width: 1920, height: 1080 };

  if (mode === 'stills') {
    fs.mkdirSync(outPath, { recursive: true });
    for (const ts of rest) {
      const t = parseFloat(ts);
      await page.evaluate(t => window.renderAt(t), t);
      await page.screenshot({ path: path.join(outPath, `t${t.toFixed(3)}.png`), clip });
    }
  } else if (mode === 'video') {
    const fps = +(process.env.FPS || 60), sub = +(process.env.SUB || 6), shutter = +(process.env.SHUTTER || 0.5);
    const from = +(process.env.FROM || 0), to = +(process.env.TO || fps * 15);
    // LOSSLESS=1 writes an intermediate chunk (concatenated + encoded by build.sh)
    const enc = process.env.LOSSLESS
      ? ['-c:v', 'libx264rgb', '-preset', 'ultrafast', '-qp', '0']
      : ['-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart'];
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-', ...enc, outPath],
      { stdio: ['pipe', 'inherit', 'inherit'] });
    const t0 = Date.now();
    for (let f = from; f < to; f++) {
      await page.evaluate(([f, fps, sub, sh]) => window.renderFrame(f, fps, sub, sh), [f, fps, sub, shutter]);
      const buf = await page.screenshot({ clip, type: 'png' });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (f % 30 === 0) console.log(`frame ${f}/${to}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
    console.log('done', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }
  await browser.close();
  srv.close();
})();
