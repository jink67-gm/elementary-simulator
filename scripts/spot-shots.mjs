// 특정 지점 캡처. 사용: SHOTS='[["이름",[x,y,z],[lx,ly,lz],fov]]' OUT=test-results/spot node scripts/spot-shots.mjs
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = await import('playwright').catch(() => createRequire(execSync('npm root -g').toString().trim() + '/')('playwright'));
const OUT = process.env.OUT ?? 'test-results/spot';
const SHOTS = JSON.parse(process.env.SHOTS ?? '[]');
mkdirSync(OUT, { recursive: true });
const PORT = 4198;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => localStorage.setItem('elementary-simulator.settings.v1', JSON.stringify({ quality: 'high', autoRes: false, controls: 'keyboard' })));
await page.goto(`http://localhost:${PORT}/elementary-simulator/?debug`);
await page.waitForFunction(() => !!window.__sim, null, { timeout: 120000 });
await page.evaluate(() => localStorage.removeItem('elementary-simulator.save.v1'));
await page.getByText('새로 시작').click();
await page.getByText('학교 갈 준비 완료!').click();
await page.waitForTimeout(2500);
await page.keyboard.press('KeyE');
await page.waitForFunction(() => !!window.__sim.game.save && window.__sim.game.running, null, { timeout: 60000 });
await page.addStyleTag({ content: 'body.shot-nohud .hud, body.shot-nohud .dialogue, body.shot-nohud .ui-layer { display: none !important; }' });
for (const [name, pos, look, fov = 66, hud = false] of SHOTS) {
  await page.evaluate(([p, l, f, h]) => {
    const g = window.__sim.game, T = g.tpc.cam.position.constructor;
    g.dialogue.skipEverything();
    g.tpc.override = { pos: new T(...p), look: new T(...l) };
    g.tpc.first = true;
    g.camera.fov = f;
    g.camera.updateProjectionMatrix();
    document.body.classList.toggle('shot-nohud', !h);
  }, [pos, look, fov, hud]);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}
console.log('오류', errors.length, errors.slice(0, 3));
await browser.close();
try { process.kill(-server.pid); } catch {}
process.exit(0);
