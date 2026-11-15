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
  ['1_front', [0.5, 1.75, 5.0], [0.5, 1.25, -5], 66],
  ['2_back', [0.5, 1.75, -3.9], [0.5, 1.1, 6], 66],
  ['3_left_window', [6.4, 1.75, 0.5], [-6, 1.05, 0.5], 66],
  ['4_right_doors', [-5.2, 1.75, 0.4], [7, 1.1, 0.4], 66],
  ['5_pods', [0.5, 2.7, -4.2], [0.5, 0.3, 0.4], 60],
  ['6_back_right', [1.2, 1.5, 2.2], [-2.6, 0.5, 5.7], 55],
  ['7_back_left_clean', [4.2, 1.5, 2.4], [6.0, 0.5, 5.7], 50],
  ['8_teacher', [-1.6, 1.6, -1.0], [-4.5, 0.8, -3.9], 55],
  ['8b_teacher_wide', [0.2, 1.7, 0.6], [-4.3, 0.8, -4.0], 60],
  ['8c_teacher_desk_top', [-3.4, 1.9, -1.9], [-4.3, 0.95, -3.7], 50],
  ['8d_teacher_shelf', [-3.9, 1.35, -2.2], [-5.8, 0.45, -4.0], 55],
  ['8e_teacher_behind', [-2.3, 1.6, -4.7], [-5.0, 0.7, -3.3], 62],
  ['9_door_from_hall', [10.4, 1.6, 0.5], [7, 1.2, 0.5], 70],
];
for (const [n, p, l, f] of shots) if (!only || only.some((o) => n.includes(o))) await shot(n, p, l, f);
if (!only || only.includes('clean')) {
  await page.evaluate(() => window.__sim.game.map.toggleCleanCabinet());
  await shot('7b_clean_open', [5.2, 1.35, 3.4], [6.0, 0.6, 5.7], 45);
}
const check = await page.evaluate(() => {
  const g = window.__sim.game, m = g.map, s = m.seats.player;
  const seats = ['player', 'seoa', 'minjae', 'filler2', 'junho', 'harin', 'filler0', 'filler1'].filter((k) => m.seats[k]);
  const from = { x: s.x, z: s.z, y: 0 };
  const to = { 앞문_복도: [9, -3.7], 뒷문_복도: [9, 4.4], 사물함17: [3.035, 4.0], 태블릿충전함: [-1.515, 4.6], 청소도구함: [6.04, 4.55], 분리수거함: [-3.675, 4.8], 교사용책상: [-4.45, -2.7], 칠판앞: [0, -4.1] };
  const paths = Object.fromEntries(Object.entries(to).map(([k, [x, z]]) => [k, (g.nav.findPath(from, { x, z, y: 0 }) ?? []).length]));
  return { seats: seats.length, paths, groupTableChildren: m.objs.groupTable.children.length };
});
console.log(JSON.stringify(check));
console.log('오류', errors.length, errors.slice(0, 5));
await browser.close();
try { process.kill(-server.pid); } catch {}
process.exit(0);
