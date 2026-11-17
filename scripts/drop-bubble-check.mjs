// 물건 내려놓기(층·벽) + 대화창/말풍선 겹침 확인. 사용: npm run build && node scripts/drop-bubble-check.mjs (결과: test-results/dropcheck/)
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = await import('playwright').catch(() => createRequire(execSync('npm root -g').toString().trim() + '/')('playwright'));
const OUT = 'test-results/dropcheck';
mkdirSync(OUT, { recursive: true });
const PORT = 4195;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${PORT}/elementary-simulator/?debug`);
await page.waitForFunction(() => !!window.__sim, null, { timeout: 120000 });
await page.evaluate(() => localStorage.removeItem('elementary-simulator.save.v1'));
await page.getByText('새로 시작').click();
await page.getByText('학교 갈 준비 완료!').click();
await page.waitForTimeout(3000);
await page.keyboard.press('KeyE');
await page.waitForFunction(() => !!window.__sim.game.save && window.__sim.game.running, null, { timeout: 60000 });
await page.waitForTimeout(1500);
let fail = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'OK ' : 'FAIL'} ${name} ${JSON.stringify(info)}`); if (!ok) fail++; };
// 1) 1층 현관에서 내려놓기
const drop = async (x, y, z, yaw) => page.evaluate(([x, y, z, yaw]) => {
  const g = window.__sim.game;
  g.dialogue.skipEverything();
  g.player.pos.set(x, y, z);
  g.player.yaw = yaw;
  g.give('ruler');
  const i = g.inventory.slots.indexOf('ruler');
  g.inventory.select(i);
  const before = new Set(g.items.keys());
  g.dropHeld();
  const key = [...g.items.keys()].find((k) => !before.has(k));
  const it = g.items.get(key);
  const p = it.obj.position;
  const inScene = !!it.obj.parent;
  // 벽·가구 속인지
  const cols = g.map.collidersFor(g.map.levelOf(y));
  const inside = cols.some((c) => c.enabled !== false && p.x > c.minX && p.x < c.maxX && p.z > c.minZ && p.z < c.maxZ);
  return { key, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), inScene, inside, pickable: g.interactions.has?.('item:' + key) ?? true };
}, [x, y, z, yaw]);
const GZ = -10.375;
const a = await drop(14.0, -3.6, GZ, -Math.PI / 2);
check('1층 현관 바닥에 놓임', a.inScene && a.y >= -3.61 && a.y < -3.2 && !a.inside, a);
const b = await drop(9.1, -3.6, 1.0, Math.PI / 2 + Math.PI); // 1층 복도에서 동쪽 벽을 보고
check('1층 복도: 벽 보고 놓아도 벽 밖', b.inScene && b.y < -3.2 && !b.inside, b);
const c = await drop(7.45, -3.6, 9.0, Math.PI / 2); // 서쪽 벽(행정실 쪽)에 붙어 벽 보고
check('1층 서쪽 벽에 붙어 놓기', c.inScene && b.y < -3.2 && !c.inside, c);
const d = await drop(9.1, 0, 3.0, 0);
check('2층 복도 바닥', d.inScene && d.y >= -0.01 && d.y < 0.4 && !d.inside, d);
// 화면으로 확인: 현관 바닥의 자
await page.evaluate(([x, z]) => {
  const g = window.__sim.game, T = g.tpc.cam.position.constructor;
  g.tpc.override = { pos: new T(x + 1.6, -3.6 + 1.5, z + 1.2), look: new T(x, -3.6 + 0.05, z) };
  g.tpc.first = true;
}, [a.x, a.z]);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/drop_1f_lobby.png` });
// 줍기 다시 되는지
const re = await page.evaluate((key) => { const g = window.__sim.game; g.pickup(key); return { has: g.inventory.has('ruler'), stillWorld: g.items.has(key) }; }, a.key);
check('놓은 물건 다시 줍기', re.has && !re.stillWorld, re);
// 2) 대화창 + 주변 말풍선 겹침: 교실에서 민재와 대화 중에 다른 친구들이 말풍선
await page.evaluate(() => {
  const g = window.__sim.game, T = g.tpc.cam.position.constructor;
  g.tpc.override = null;
  g.tpc.first = false;
  g.player.pos.set(1.5, 0, 2.6);
  g.player.yaw = Math.PI;
  const ids = Object.keys(g.npcs);
  // 친구들을 플레이어 앞에 모은다 (말풍선이 대화창 근처로 오게)
  ids.slice(0, 5).forEach((id, i) => { const n = g.npcs[id]; n.pos?.set?.(0.6 + i * 0.45, 0, 1.0 + (i % 2) * 0.3); n.root && n.root.position.set(0.6 + i * 0.45, 0, 1.0 + (i % 2) * 0.3); });
  const n0 = g.npcs[ids[0]];
  g.say([{ who: n0.name, text: '이건 대화창 대사예요. 이름표 위로 다른 말풍선이 겹치면 안 돼요.' }]);
  ids.slice(0, 5).forEach((id) => g.bark(g.npcs[id], `${g.npcs[id].name} 혼잣말 테스트 문장이에요`, 20000));
});
await page.waitForTimeout(3000);
const ov = await page.evaluate(() => {
  const dlg = document.querySelector('.dialogue').getBoundingClientRect();
  const name = document.querySelector('.d-name').getBoundingClientRect();
  const bs = [...document.querySelectorAll('.bubble')].filter((b) => b.style.display !== 'none').map((b) => b.getBoundingClientRect());
  const hit = (r, o) => r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top;
  let pair = 0;
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (hit(bs[i], bs[j])) pair++;
  return { shown: bs.length, total: document.querySelectorAll('.bubble').length, overDialogue: bs.filter((r) => hit(r, dlg)).length, overName: bs.filter((r) => hit(r, name)).length, bubblePairsOverlap: pair };
});
check('말풍선이 대화창·이름표를 가리지 않음', ov.overDialogue === 0 && ov.overName === 0, ov);
check('말풍선끼리 겹치지 않음', ov.bubblePairsOverlap === 0, ov);
await page.screenshot({ path: `${OUT}/dialogue_bubbles.png` });
const pr = await page.evaluate(() => ({ promptHidden: document.querySelector('.prompt').classList.contains('hidden') }));
check('대화 중에는 E 안내 숨김', pr.promptHidden, pr);
// 대화를 닫은 뒤: 말풍선이 「E …」 안내를 가리지 않음
await page.evaluate(() => { const g = window.__sim.game; g.dialogue.skipEverything(); for (const id of Object.keys(g.npcs).slice(0, 5)) g.bark(g.npcs[id], `${g.npcs[id].name} 두 번째 혼잣말이에요`, 20000); });
await page.waitForTimeout(2500);
const ov2 = await page.evaluate(() => {
  const p = document.querySelector('.prompt');
  const hit = (r, o) => r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top;
  const bs = [...document.querySelectorAll('.bubble')].filter((b) => b.style.display !== 'none').map((b) => b.getBoundingClientRect());
  const pv = !p.classList.contains('hidden');
  return { promptVisible: pv, shown: bs.length, overPrompt: pv ? bs.filter((r) => hit(r, p.getBoundingClientRect())).length : 0 };
});
check('말풍선이 E 안내를 가리지 않음', ov2.overPrompt === 0, ov2);
await page.screenshot({ path: `${OUT}/prompt_bubbles.png` });
console.log('오류', errors.length, errors.slice(0, 3), fail ? `실패 ${fail}` : '모두 통과');
await browser.close();
try { process.kill(-server.pid); } catch {}
process.exit(0);
