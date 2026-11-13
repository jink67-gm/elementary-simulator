// 정문·현관 화면 캡처 (전·후 비교용). 사용: npm run build && node scripts/entrance-shots.mjs <접두어>
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = await import('playwright').catch(() => createRequire(execSync('npm root -g').toString().trim() + '/')('playwright'));
const tag = process.argv[2] ?? 'after';
const OUT = 'test-results/entrance';
mkdirSync(OUT, { recursive: true });
const PORT = 4183;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--outDir', process.env.OUT_DIR ?? 'dist'], { stdio: 'pipe', detached: true });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => localStorage.setItem('elementary-simulator.settings.v1', JSON.stringify({ quality: 'mid', autoRes: false })));
page.setDefaultTimeout(240000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`http://localhost:${PORT}/elementary-simulator/?debug`);
await page.waitForFunction(() => !!window.__sim, null, { timeout: 120000 });
await page.getByText('새로 시작').click();
await page.getByText('학교 갈 준비 완료!').click();
await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__sim.state().period === 'arrival', null, { timeout: 60000 });
await page.evaluate(() => window.__sim.game.dialogue.skipEverything());
await page.addStyleTag({ content: 'body.shot-nohud .hud, body.shot-nohud .dialogue { display: none !important; }' });
const Y = -3.6;
const shots = {
  front: [[26.2, Y + 1.9, -1.5], [16, Y + 2.0, -1.5]],
  front_wide: [[29.5, Y + 3.0, -1.5], [16, Y + 2.2, -1.5]],
  front_angle: [[24.2, Y + 1.8, 3.6], [17.2, Y + 1.9, -2.2]],
  play_view: null,
  lobby_west: [[17.7, Y + 1.6, -1.6], [11, Y + 1.35, -1.6]],
  lobby_boards: [[15.6, Y + 1.55, -3.3], [12.6, Y + 1.5, 1.0]],
  lobby_doors: [[11.9, Y + 1.6, -0.6], [18.5, Y + 1.3, -2.2]],
  lobby_slippers: [[16.3, Y + 1.75, -1.1], [16.6, Y + 1.0, 0.75]],
};
for (const [name, v] of Object.entries(shots)) {
  await page.evaluate((v) => {
    const g = window.__sim.game;
    g.dialogue.skipEverything();
    if (v) {
      const T = g.tpc.cam.position.constructor;
      g.tpc.override = { pos: new T(...v[0]), look: new T(...v[1]) };
      g.tpc.first = true;
      document.body.classList.add('shot-nohud');
    } else {
      g.tpc.override = null;
      g.tpc.first = true;
      document.body.classList.remove('shot-nohud');
      g.player.teleport(23.2, -1.5, -Math.PI / 2, -3.6);
      g.tpc.behind(-Math.PI / 2);
    }
  }, v);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${tag}_${name}.png` });
}
console.log(errors.length ? 'ERR ' + errors.join(' | ') : 'ok');
await browser.close();
try { process.kill(-server.pid); } catch {}
process.exit(0);
