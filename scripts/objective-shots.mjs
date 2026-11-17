// 「지금 할 일」 표시 확인 캡처. 사용: npm run build && node scripts/objective-shots.mjs (결과: test-results/objective/)
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = await import('playwright').catch(() => createRequire(execSync('npm root -g').toString().trim() + '/')('playwright'));
const OUT = 'test-results/objective';
mkdirSync(OUT, { recursive: true });
const PORT = 4196;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
for (const [vw, vh, tag] of [[1280, 720, 'pc'], [900, 520, 'small']]) {
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  page.setDefaultTimeout(240000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('elementary-simulator.settings.v1', JSON.stringify({ quality: 'low', autoRes: false, controls: 'keyboard' })));
  await page.goto(`http://localhost:${PORT}/elementary-simulator/?debug`);
  await page.waitForFunction(() => !!window.__sim, null, { timeout: 120000 });
  await page.evaluate(() => localStorage.removeItem('elementary-simulator.save.v1'));
  await page.getByText('새로 시작').click();
  await page.getByText('학교 갈 준비 완료!').click();
  await page.waitForTimeout(2500);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => !!window.__sim.game.save && window.__sim.game.running, null, { timeout: 60000 });
  await page.evaluate(() => window.__sim.game.dialogue.skipEverything());
  await page.waitForTimeout(1500);
  const clip = { x: 0, y: 0, width: vw, height: 260 };
  await page.screenshot({ path: `${OUT}/${tag}_1_route.png`, clip });
  const samples = [
    ['2_pencil', (t) => t + ' · (선택) 준호 필통 찾아 주기'],
    ['3_list', () => '발표 준비: 교과서 단서 찾기(E) · 짝과 이야기하기(E) · 준비되면 F로 손 들기'],
    ['4_note', () => '조리실 작업대에 절단기 레일 걸기 (조리실 문 안 안전 구역에서 작업대 쪽으로 F)'],
  ];
  for (const [name, f] of samples) {
    await page.evaluate((src) => { const g = window.__sim.game; g.hud.setObjective(eval(src)(g.hud.objectiveText)); }, f.toString());
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${tag}_${name}.png`, clip });
  }
  const h = await page.evaluate(() => document.querySelector('.objective').getBoundingClientRect().height);
  console.log(tag, '할 일 상자 높이', Math.round(h));
  await page.close();
}
console.log('오류', errors.length, errors.slice(0, 3));
await browser.close();
try { process.kill(-server.pid); } catch {}
process.exit(0);
