// 6-1 교실 네 방향(앞·뒤·창가·출입문) + 세부 캡처. 사용: npm run build && node scripts/classroom-shots.mjs  (결과: test-results/classroom/)
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = await import('playwright').catch(() => createRequire(execSync('npm root -g').toString().trim() + '/')('playwright'));
const OUT = 'test-results/classroom';
mkdirSync(OUT, { recursive: true });
const PORT = 4187;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
await page.addInitScript(() => localStorage.setItem('elementary-simulator.settings.v1', JSON.stringify({ quality: 'high', autoRes: false, controls: 'keyboard' })));
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`http://localhost:${PORT}/elementary-simulator/?debug`);
await page.waitForFunction(() => !!window.__sim, null, { timeout: 120000 });
await page.getByText('새로 시작').click();
await page.getByText('학교 갈 준비 완료!').click();
await page.keyboard.press('KeyE');
await page.waitForFunction(() => !!window.__sim.game.save && window.__sim.game.running, null, { timeout: 60000 });
await page.addStyleTag({ content: 'body.shot-nohud .hud, body.shot-nohud .dialogue { display: none !important; }' });
const period = process.env.PERIOD ?? 'korean';
await page.evaluate((p) => window.__sim.skipTo(p), period);
await page.waitForTimeout(3000);
const shot = async (name, pos, look, fov) => {
  await page.evaluate(([p, l, f]) => {
    const g = window.__sim.game, T = g.tpc.cam.position.constructor;
    g.dialogue.skipEverything();
    g.tpc.override = { pos: new T(...p), look: new T(...l) };
    g.tpc.first = true;
    if (f) { g.camera.fov = f; g.camera.updateProjectionMatrix(); }
    document.body.classList.add('shot-nohud');
  }, [pos, look, fov]);
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__sim.game.dialogue.skipEverything());
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${name}.png` });
};
const only = process.env.ONLY?.split(',');
const shots = [
  ['1_front', [0, 1.75, 5.9], [0, 1.25, -6], 62],
  ['2_back', [0, 1.75, -4.6], [0, 1.1, 7], 62],
  ['3_left_window', [5.6, 1.75, 0.6], [-7, 1.05, 0.5], 66],
  ['4_right_doors', [-5.9, 1.75, 0.5], [7, 1.1, 0.5], 66],
  ['5_pods', [0, 3.4, -3.2], [0, 0.3, 0.6], 55],
  ['6_back_right', [1.2, 1.5, 3.4], [-2.6, 0.5, 6.9], 55],
  ['7_back_left_clean', [4.2, 1.5, 3.6], [6.1, 0.5, 6.9], 50],
  ['8_teacher', [-2.2, 1.6, -2.4], [-4.8, 0.8, -5.2], 50],
  ['9_door_from_hall', [10.4, 1.6, 0.5], [7, 1.2, 0.5], 70],
];
for (const [n, p, l, f] of shots) if (!only || only.some((o) => n.includes(o))) await shot(n, p, l, f);
if (!only || only.includes('clean')) {
  await page.evaluate(() => window.__sim.game.map.toggleCleanCabinet());
  await shot('7b_clean_open', [5.4, 1.35, 4.6], [6.25, 0.5, 6.9], 45);
}
const check = await page.evaluate(() => {
  const g = window.__sim.game, m = g.map, s = m.seats.player;
  const seats = ['player', 'seoa', 'minjae', 'filler2', 'junho', 'harin', 'filler0', 'filler1'].filter((k) => m.seats[k]);
  const from = { x: s.x, z: s.z, y: 0 };
  const to = { 앞문_복도: [9, -4.6], 뒷문_복도: [9, 5.4], 사물함17: [3.35, 5.8], 태블릿충전함: [-1.25, 5.8], 청소도구함: [6.25, 6.1], 분리수거함: [-3.5, 6.0] };
  const paths = Object.fromEntries(Object.entries(to).map(([k, [x, z]]) => [k, (g.nav.findPath(from, { x, z, y: 0 }) ?? []).length]));
  return { seats: seats.length, paths, groupTableChildren: m.objs.groupTable.children.length };
});
console.log(JSON.stringify(check));
console.log('오류', errors.length, errors.slice(0, 5));
await browser.close();
try { process.kill(-server.pid); } catch {}
process.exit(0);
