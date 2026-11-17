// End-to-end smoke test with the offline Demo provider.
// Usage: npm run smoke   (needs Playwright + Chromium: require('playwright') must work)
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const PORT = 8790 + Math.floor(Math.random() * 9);
const root = path.resolve(__dirname, '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'zsi-smoke-'));

function startServer() {
  const proc = spawn('npx', ['tsx', '--no-warnings', 'src/index.ts'], {
    cwd: path.join(root, 'server'),
    env: { ...process.env, PORT: String(PORT), ZSI_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Server did not start')), 30_000);
    proc.stdout.on('data', (d) => {
      if (String(d).includes('zsicreative server')) {
        clearTimeout(t);
        resolve(proc);
      }
    });
    proc.stderr.on('data', (d) => process.stderr.write(d));
  });
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  const errors = [];
  let ok = false;
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    p.on('pageerror', (e) => errors.push(String(e)));
    p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    await p.goto(`http://127.0.0.1:${PORT}/`);
    await p.getByRole('button', { name: 'Blank canvas' }).click();
    await p.getByTestId('start-template').waitFor();

    await p.getByTestId('dock-templates').click();
    await p.locator('.menu-item', { hasText: 'UGC Hook Ad' }).click();
    await p.waitForTimeout(800);
    const nodes = await p.locator('.react-flow__node').count();
    if (nodes < 8) throw new Error(`Template added ${nodes} nodes, expected 8+`);

    await p.getByTestId('run-all').click();
    await p.getByTestId('confirm-ok').click();
    const needVideo = await hasFfmpeg();
    if (needVideo) await p.waitForFunction(() => document.querySelectorAll('.react-flow__node video').length >= 3, null, { timeout: 90_000 });
    else await p.waitForFunction(() => document.querySelectorAll('.react-flow__node-imageGen img').length >= 3, null, { timeout: 60_000 });

    await p.waitForTimeout(1200); // let autosave finish
    await p.reload();
    await p.waitForTimeout(1500);
    const after = await p.locator('.react-flow__node').count();
    if (after !== nodes) throw new Error(`After reload: ${after} nodes, expected ${nodes}`);

    if (errors.length) throw new Error(`Console errors:\n${errors.join('\n')}`);
    ok = true;
    console.log(`smoke OK · ${nodes} nodes · video ${needVideo ? 'checked' : 'skipped (no ffmpeg)'}`);
  } catch (e) {
    console.error('smoke FAILED:', e.message);
  } finally {
    await browser.close();
    server.kill();
    rmSync(dataDir, { recursive: true, force: true });
    process.exit(ok ? 0 : 1);
  }
})();

function hasFfmpeg() {
  return new Promise((resolve) => {
    const c = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
    c.on('error', () => resolve(false));
    c.on('exit', (code) => resolve(code === 0));
  });
}
