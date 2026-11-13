// 퀘스트 소품 화면 캡처: 소품 모음(가까이) + 교시별 실제 장면. 사용: npm run build && node scripts/props-shots.mjs <접두어>
// OUT_DIR=dist-shots 처럼 다른 빌드 폴더를 줄 수 있다.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = await import('playwright').catch(() => createRequire(execSync('npm root -g').toString().trim() + '/')('playwright'));
const tag = process.argv[2] ?? 'props';
const only = process.env.ONLY;
const OUT = 'test-results/props';
mkdirSync(OUT, { recursive: true });
const PORT = 4184;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--outDir', process.env.OUT_DIR ?? 'dist'], { stdio: 'pipe', detached: true });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
await page.addInitScript(() => localStorage.setItem('elementary-simulator.settings.v1', JSON.stringify({ quality: 'mid', autoRes: false })));
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

const cam = (pos, look) =>
  page.evaluate(([p, l]) => {
    const g = window.__sim.game;
    const T = g.tpc.cam.position.constructor;
    g.tpc.override = { pos: new T(...p), look: new T(...l) };
    g.tpc.first = true;
    document.body.classList.add('shot-nohud');
  }, [pos, look]);
const quiet = () => page.evaluate(() => window.__sim.game.dialogue.skipEverything());
async function shot(name, setup, pos, look, wait = 2500) {
  if (only && !only.split(',').includes(name)) return;
  await page.evaluate(setup);
  await quiet();
  await cam(pos, look);
  await page.waitForTimeout(wait);
  await quiet();
  await page.screenshot({ path: `${OUT}/${tag}_${name}.png` });
  console.log('  ✓', name);
}
const skip = (p) => `(() => { const s = window.__sim; s.skipTo('${p}'); })()`;

// 1. 소품 모음 — 모둠 책상 위 (핵심 소품: 가까이서)
await page.evaluate(() => window.__sim.skipTo('group'));
await page.waitForTimeout(1500);
await quiet();
const gallery1 = ['tablet', 'koreanBook', 'pencilCase', 'roleSpeaker', 'roleMaker', 'roleResearcher', 'roleOrganizer', 'miniPoster'];
await shot('gallery_core', `(() => {
  const g = window.__sim.game;
  for (const k of [...g.items.keys()]) g.removeItem(k);
  const ids = ${JSON.stringify(gallery1)};
  ids.forEach((id, i) => g.spawnItem('gal_' + id, id, -1.05 + i * 0.3, 0.68, 4.55 + (i % 2) * 0.12, (i % 3 - 1) * 0.15));
  g.spawnItem('gal_bag', 'bag', 1.6, 0, 3.75, -0.4);
  g.player.teleport(0, 6.2, Math.PI, 0);
})()`, [0.1, 1.45, 3.55], [0.05, 0.68, 4.62]);
await shot('gallery_cards', `(() => {})()`, [-0.05, 1.05, 4.05], [0.1, 0.68, 4.62]);
await shot('gallery_bag', `(() => {})()`, [1.05, 0.62, 3.05], [1.6, 0.25, 3.75]);
// 2. 수업·생활 소품 모음
const gallery2 = ['scissors', 'ruler', 'glueStick', 'glue', 'tape', 'colorPaperPack', 'markers', 'colorPaper', 'drawingPaper', 'charger', 'sizeRemote'];
await shot('gallery_art', `(() => {
  const g = window.__sim.game;
  for (const k of [...g.items.keys()]) g.removeItem(k);
  const ids = ${JSON.stringify(gallery2)};
  ids.forEach((id, i) => g.spawnItem('gal_' + id, id, -1.15 + (i % 6) * 0.42, 0.68, 4.45 + Math.floor(i / 6) * 0.35, (i % 3 - 1) * 0.3));
})()`, [0.0, 1.5, 3.5], [0.0, 0.68, 4.6]);
const gallery3 = ['trayStack', 'ladle', 'cutterUnit', 'cutletPiece', 'gymClothes', 'festPoster', 'zoneCone', 'dodgeball', 'foldTable', 'standPart', 'rampPart', 'padPart', 'scraps'];
await shot('gallery_misc', `(() => {
  const g = window.__sim.game;
  for (const k of [...g.items.keys()]) g.removeItem(k);
  const ids = ${JSON.stringify(gallery3)};
  ids.forEach((id, i) => g.spawnItem('gal_' + id, id, -2.4 + (i % 7) * 0.7, 0, -3.3 + Math.floor(i / 7) * 0.8, 0.3));
  g.player.teleport(0, 2.5, Math.PI, 0);
})()`, [-0.3, 1.9, -0.9], [-0.3, 0.0, -3.0]);

// 3. 등교: 등에 멘 가방
await shot('arrival_worn', `(() => {
  const s = window.__sim; s.skipTo('arrival');
})()`, [24.6, -3.6 + 1.45, -0.6], [23.2, -3.6 + 0.95, -1.5], 3500);
// 4. 책상 옆에 건 가방 + 책상 위 국어책 (닫힘)
await shot('desk_bag_book', `(() => {
  const s = window.__sim; s.skipTo('break');
  const f = s.game.save.flags; f.bagOnDesk = true; f.bagHung = true; f.bookOnDesk = true;
  s.story.syncProps();
  s.game.player.teleport(-1.0, 3.2, Math.PI, 0);
})()`, [-3.45, 1.15, 2.15], [-2.6, 0.45, 1.2], 3000);
// 5. 1교시: 펼친 국어책
await shot('korean_book', `(() => {
  const s = window.__sim; s.skipTo('korean');
  const f = s.game.save.flags; f.bookOnDesk = true; f.bagOnDesk = true; f.bagHung = true;
  s.story.syncProps();
})()`, [-2.3, 1.35, 1.75], [-2.45, 0.66, 1.15], 3500);
// 6. 2교시: 태블릿 충전함
await shot('math_cart', `(() => {
  const s = window.__sim; s.skipTo('math');
  s.game.player.teleport(4.0, 2.5, Math.PI, 0);
})()`, [5.05, 1.55, -0.25], [6.3, 0.95, -1.2], 1500);
// 7. 2교시: 친구들 책상 위 태블릿 (퀴즈 화면) + 내 태블릿
await shot('math_desks', `(() => {
  const s = window.__sim; const f = s.game.save.flags;
  f.tabletsHandedOut = true; f.gotTablet = true; f.tabletOnDesk = true; f.quizDone = true;
  s.story.syncProps();
})()`, [-1.9, 1.5, 2.6], [-1.2, 0.66, 0.3], 3000);
// 8. 손에 든 태블릿
await shot('held_tablet', `(() => {
  const g = window.__sim.game; g.give('tablet');
  const i = g.inventory.list().indexOf('tablet'); g.inventory.select(i);
  g.player.teleport(0, 2.4, Math.PI, 0);
})()`, [0.75, 1.3, 1.6], [0.0, 0.85, 2.4], 2500);
// 9. 3교시: 역할 카드 고르기 + 포스터 종이
await shot('group_cards', `(() => {
  const s = window.__sim; s.skipTo('group');
  const g = s.game;
  for (const k of [...g.items.keys()]) g.removeItem(k);
  ['roleSpeaker', 'roleMaker', 'roleResearcher', 'roleOrganizer'].forEach((id, i) => g.spawnItem('role_' + i, id, -0.75 + i * 0.5, 0.682, 4.25, 0.1 * (i - 1.5)));
  s.story.syncProps();
  g.player.teleport(0, 3.2, Math.PI, 0);
})()`, [0.0, 1.45, 3.35], [0.0, 0.68, 4.55], 3000);
await shot('group_poster_making', `(() => {
  const s = window.__sim; s.game.save.groupRole = 'maker'; s.story.syncProps();
})()`, [0.0, 1.55, 3.6], [0.0, 0.68, 4.7], 2500);
// 10. 4교시: 미술 준비물 (친구들 책상)
await shot('art_desks', `(() => {
  const s = window.__sim; s.skipTo('art');
  for (const k of [...s.game.items.keys()]) s.game.removeItem(k);
  s.story.syncProps();
})()`, [1.2, 1.35, 2.3], [2.1, 0.66, 0.6], 3000);
// 11. 점심: 식판 수레·배식대 식판·수저통
await shot('lunch_trays', `(() => {
  const s = window.__sim; s.skipTo('lunch');
  s.game.player.teleport(9, 18.2, 0, -3.6);
})()`, [12.6, -3.6 + 1.55, 21.0], [12.6, -3.6 + 0.75, 22.6], 3500);
await shot('lunch_cart', `(() => {})()`, [13.4, -3.6 + 1.35, 19.6], [14.35, -3.6 + 0.8, 20.4], 2000);

console.log(errors.length ? 'ERR ' + errors.slice(0, 5).join(' | ') : 'ok');
await browser.close();
try { process.kill(-server.pid); } catch {}
process.exit(0);
