// 6-1 문 열기/닫기·수업 중 나가기 막기·선생님 안내 확인. 사용: npm run build && node scripts/class-door-check.mjs
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = await import('playwright').catch(() => createRequire(execSync('npm root -g').toString().trim() + '/')('playwright'));
const OUT = 'test-results/classdoor';
mkdirSync(OUT, { recursive: true });
const PORT = 4200;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
const errors = [];
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
let fail = 0;
const check = (n, ok, info) => { console.log(`${ok ? 'OK ' : 'FAIL'} ${n} ${JSON.stringify(info ?? '')}`); if (!ok) fail++; };
const st = () => page.evaluate(() => { const g = window.__sim.game; return { doors: g.map.classDoors.map((d) => ({ want: d.want, open: +d.open.toFixed(2), col: d.collider.enabled, block: d.block.enabled })), p: [g.player.pos.x, g.player.pos.z].map((v) => +v.toFixed(2)), period: g.save.period }; });
// 1) 아침: 문이 열려 있다
await page.evaluate(() => window.__sim.game.dialogue.skipEverything());
let s = await st();
check('아침에는 문이 열려 있음', s.doors.every((d) => d.want && d.open > 0.9), s.doors);
// 2) 복도에서 앞문 E로 닫기
await page.evaluate(() => { const g = window.__sim.game; g.player.teleport(8.0, (-4.5 + -2.9) / 2, -Math.PI / 2, 0); g.tpc.behind(g.player.yaw); });
await page.waitForTimeout(800);
const prompt1 = await page.evaluate(() => document.querySelector('.prompt')?.textContent ?? '');
await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__sim.game.map.classDoors[0].open < 0.05, null, { timeout: 15000 }).catch(() => {});
s = await st();
check('E로 앞문 닫힘 (안내: ' + prompt1.trim() + ')', !s.doors[0].want && s.doors[0].open < 0.1 && s.doors[0].col, s.doors[0]);
await page.screenshot({ path: `${OUT}/door_closed.png` });
// 3) 닫힌 문으로 걸어 들어가기 → 막힘
await page.keyboard.down('KeyW');
await page.waitForTimeout(1500);
await page.keyboard.up('KeyW');
s = await st();
check('닫힌 문은 지나갈 수 없음', s.p[0] > 7.0, s.p);
// 4) 다시 열기
await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__sim.game.map.classDoors[0].open > 0.95, null, { timeout: 15000 }).catch(() => {});
s = await st();
check('E로 다시 열림', s.doors[0].want && s.doors[0].open > 0.9 && !s.doors[0].col, s.doors[0]);
await page.screenshot({ path: `${OUT}/door_open.png` });
// 5) 국어 시간: 문턱 막힘 + 선생님 안내
await page.evaluate(() => window.__sim.skipTo('korean'));
await page.waitForFunction(() => window.__sim.game.save.period === 'korean', null, { timeout: 60000 });
await page.evaluate(() => { const g = window.__sim.game; g.dialogue.skipEverything(); g.cutscene = false; });
await page.waitForTimeout(1500);
s = await st();
check('수업 중 문턱 막기 켜짐', s.doors.every((d) => d.block), s.doors);
// 열린 문 (앞문) → 선생님이 닫아 달라고
await page.evaluate(() => { const g = window.__sim.game; g.map.setClassDoor(0, true); g.player.teleport(4.5, -1.5, Math.PI / 2, 0); });
const said = await page.waitForFunction(() => [...document.querySelectorAll('.bubble')].some((b) => b.textContent.includes('닫아 줄래요')), null, { timeout: 30000 }).then(() => true).catch(() => false);
check('문이 열려 있으면 선생님이 닫아 달라고 함', said);
await page.screenshot({ path: `${OUT}/teacher_nag.png` });
// 교실 안에서 앞문 쪽으로 걸어 나가기 → 못 나감
await page.evaluate(() => { const g = window.__sim.game; g.player.teleport(6.0, (-4.5 + -2.9) / 2, Math.PI / 2, 0); g.tpc.behind(Math.PI / 2); });
await page.waitForTimeout(500);
await page.keyboard.down('KeyW');
await page.waitForTimeout(3000);
const warned0 = await page.evaluate(() => [...document.querySelectorAll('.bubble, .toast')].some((b) => b.textContent.includes('수업 시간')));
await page.keyboard.up('KeyW');
s = await st();
check('수업 중에는 교실 밖으로 못 나감', s.p[0] < 7.0, s.p);
check('나가려 하면 안내', warned0, s.p);
// 6) 쉬는 시간에는 나갈 수 있음
await page.evaluate(() => window.__sim.skipTo('break'));
await page.waitForFunction(() => window.__sim.game.save.period === 'break', null, { timeout: 60000 });
await page.waitForTimeout(800);
s = await st();
check('쉬는 시간에는 문턱 막기 꺼짐', s.doors.every((d) => !d.block), s.doors);
console.log('오류', errors.length, errors.slice(0, 3), fail ? `실패 ${fail}` : '모두 통과');
await browser.close();
try { process.kill(-server.pid); } catch {}
process.exit(0);
