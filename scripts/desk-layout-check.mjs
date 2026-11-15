// 책상 배치 전환(짝 ↔ 모둠) 검증 + 캡처. 사용: npm run build && node scripts/desk-layout-check.mjs  (결과: test-results/desks/)
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = await import('playwright').catch(() => createRequire(execSync('npm root -g').toString().trim() + '/')('playwright'));
const OUT = 'test-results/desks';
mkdirSync(OUT, { recursive: true });
const PORT = 4188;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
await page.addInitScript((q) => localStorage.setItem('elementary-simulator.settings.v1', JSON.stringify({ quality: q, autoRes: false, controls: 'keyboard' })), process.env.Q ?? 'low');
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const results = [];
const ok = (name, pass, info = '') => { results.push([pass ? '통과' : '실패', name, info]); console.log(pass ? '✓' : '✗', name, info); };
await page.goto(`http://localhost:${PORT}/elementary-simulator/?debug`);
await page.evaluate(() => localStorage.removeItem('elementary-simulator.save.v1'));
await page.waitForFunction(() => !!window.__sim, null, { timeout: 120000 });
await page.getByText('새로 시작').click();
await page.getByText('학교 갈 준비 완료!').click();
await page.keyboard.press('KeyE');
await page.waitForFunction(() => !!window.__sim.game.save && window.__sim.game.running, null, { timeout: 60000 });
await page.addStyleTag({ content: 'body.shot-nohud .hud, body.shot-nohud .dialogue { display: none !important; }' });
const IDS = ['player', 'seoa', 'minjae', 'filler2', 'junho', 'harin', 'filler0', 'filler1'];
const snap = () => page.evaluate((ids) => {
  const g = window.__sim.game, m = g.map;
  let sets = 0, chairs = 0;
  g.scene.traverse((o) => { if (o.name?.startsWith('deskSet:')) sets++; });
  const npc = (id) => (id.startsWith('filler') ? g.fillers[+id.slice(6)] : g.npcs[id]);
  const npcs = ids.filter((i) => i !== 'player').map((id) => { const n = npc(id), s = m.seats[id]; return { id, seated: !!n.seat, dist: Math.hypot(n.pos.x - s.x, n.pos.z - s.z), yaw: +n.yaw.toFixed(2), seatYaw: +s.yaw.toFixed(2), y: +n.pos.y.toFixed(2) }; });
  return { layout: m.deskLayout, sets, seats: ids.map((i) => m.seats[i] && { x: +m.seats[i].x.toFixed(2), z: +m.seats[i].z.toFixed(2), yaw: +m.seats[i].yaw.toFixed(2) }), npcs, flag: !!g.save.flags.deskPods, period: g.save.period, phase: window.__sim.story?.phase };
}, IDS);
const shot = async (name, pos, look) => {
  await page.evaluate(([p, l]) => {
    const g = window.__sim.game, T = g.tpc.cam.position.constructor;
    g.tpc.override = { pos: new T(...p), look: new T(...l) };
    g.tpc.first = true;
    document.body.classList.add('shot-nohud');
  }, [pos, look]);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.evaluate(() => { window.__sim.game.tpc.override = null; document.body.classList.remove('shot-nohud'); });
};
const quiet = () => page.evaluate(() => window.__sim.game.dialogue.skipEverything());
// 1. 등교
let s = await snap();
ok('등교: 짝 배치', s.layout === 'pairs', `책상 묶음 ${s.sets}개`);
ok('책상·의자 묶음 8개 (중복 없음)', s.sets === 8);
// 2. 국어
await page.evaluate(() => window.__sim.skipTo('korean'));
await page.waitForTimeout(4000);
await quiet();
await page.waitForTimeout(1500);
s = await snap();
ok('국어: 짝 배치 + 모두 칠판 쪽(yaw π)', s.layout === 'pairs' && s.seats.every((x) => Math.abs(x.yaw - 3.14) < 0.01), JSON.stringify(s.npcs.map((n) => n.yaw)));
await shot('1_korean_pairs_front', [0, 1.8, 5.6], [0, 0.9, -3]);
await shot('2_korean_pairs_back', [0, 1.9, -4.8], [0, 0.6, 2]);
// 3. 수학
await page.evaluate(() => window.__sim.skipTo('math'));
await page.waitForTimeout(3000);
s = await snap();
ok('수학: 짝 배치', s.layout === 'pairs');
// 4. 모둠 활동 시작: 선생님 지시 → 어두워짐 → 모둠 배치
await page.evaluate(() => {
  window.__maxFade = 0;
  window.__deskLog = [];
  const tick = () => { const el = document.querySelector('.screen-fade'); if (el) window.__maxFade = Math.max(window.__maxFade, +getComputedStyle(el).opacity); requestAnimationFrame(tick); };
  tick();
  window.__sim.skipTo('group');
});
let maxDark = 0, layoutWhenDark = null, cut = false;
const t0 = Date.now();
while (Date.now() - t0 < 60000) {
  const st = await page.evaluate(() => {
    const el = document.querySelector('.screen-fade');
    const g = window.__sim.game;
    const dlg = document.querySelector('.dialogue')?.textContent ?? '';
    return { op: el ? +getComputedStyle(el).opacity : 0, layout: g.map.deskLayout, cut: g.cutscene, dlg, phase: window.__sim.story?.phase };
  });
  if (st.dlg.includes('모둠 형태로 바꿔')) { await page.waitForTimeout(400); await page.keyboard.press('KeyE'); }
  else if (st.dlg && st.layout === 'pairs' && !st.dlg.includes('모둠 형태')) { await quiet(); }
  if (st.op > maxDark) { maxDark = st.op; layoutWhenDark = st.layout; }
  if (st.cut) cut = true;
  if (st.layout === 'pods' && st.op < 0.05 && !st.cut) break;
  await page.waitForTimeout(60);
}
maxDark = Math.max(maxDark, await page.evaluate(() => window.__maxFade));
ok('지시 후 화면이 어두워짐', maxDark > 0.9, `최대 불투명도 ${maxDark.toFixed(2)}`);
ok('전환 중 입력 막힘(cutscene)', cut);
s = await snap();
ok('모둠 배치로 바뀜', s.layout === 'pods' && s.flag);
ok('NPC가 자기 모둠 자리에 앉음', s.npcs.every((n) => n.seated && n.dist < 0.05 && Math.abs(n.yaw - n.seatYaw) < 0.05 && Math.abs(n.y) < 0.01), JSON.stringify(s.npcs.filter((n) => !(n.seated && n.dist < 0.05))));
ok('모둠 4명씩 2개 (서로 마주 봄)', s.seats.slice(0, 4).every((x) => x.x < 0) && s.seats.slice(4).every((x) => x.x > 0) && s.seats.every((x) => Math.abs(Math.abs(x.yaw) - 1.57) < 0.01));
s = await snap();
ok('책상 묶음 여전히 8개', s.sets === 8);
await quiet();
await shot('3_group_pods_top', [0, 2.75, -3.4], [0, 0.2, 0.6]);
await shot('4_group_pods_side', [0, 1.6, 4.2], [-1.6, 0.7, -0.6]);
// 5. 플레이어 이동
const before = await page.evaluate(() => window.__sim.game.player.pos.toArray());
await page.evaluate(() => { const g = window.__sim.game; g.tpc.yaw = Math.PI / 2 * -1; });
await page.keyboard.down('KeyW');
await page.waitForTimeout(3000);
await page.keyboard.up('KeyW');
const after = await page.evaluate(() => window.__sim.game.player.pos.toArray());
ok('전환 뒤 플레이어 이동', Math.hypot(after[0] - before[0], after[2] - before[2]) > 0.5 && Math.abs(after[1]) < 0.01, `${before.map((v) => v.toFixed(2))} → ${after.map((v) => v.toFixed(2))}`);
// 6. 저장 후 다시 접속 → 모둠 배치 유지
await page.reload();
await page.waitForFunction(() => !!window.__sim, null, { timeout: 120000 });
await page.waitForTimeout(1200);
await page.getByText(/^이어하기/).click();
await page.waitForFunction(() => window.__sim.game.running, null, { timeout: 60000 });
await page.waitForTimeout(1500);
s = await snap();
ok('새로고침 후 모둠 배치 유지', s.layout === 'pods' && s.period === 'group', `layout=${s.layout} period=${s.period}`);
ok('새로고침 후 NPC 모둠 자리', s.npcs.every((n) => n.dist < 0.6), JSON.stringify(s.npcs.map((n) => +n.dist.toFixed(2))));
// 7. 모둠 활동 끝 → 짝 배치 복귀
await page.evaluate(() => { const st = window.__sim.story; st.save.groupRole = 'speaker'; st.finishGroup(false); });
const t1 = Date.now();
let back = false;
while (Date.now() - t1 < 60000) {
  const st = await page.evaluate(() => ({ layout: window.__sim.game.map.deskLayout, cut: window.__sim.game.cutscene, dlg: document.querySelector('.dialogue')?.textContent ?? '' }));
  if (st.dlg) await page.keyboard.press('KeyE');
  if (st.layout === 'pairs' && !st.cut) { back = true; break; }
  await page.waitForTimeout(200);
}
await page.waitForTimeout(800);
s = await snap();
ok('활동 끝: 짝 배치 복귀 + 칠판 쪽', back && s.layout === 'pairs' && !s.flag && s.seats.every((x) => Math.abs(x.yaw - 3.14) < 0.01));
ok('복귀 후 NPC 짝 자리', s.npcs.every((n) => n.dist < 0.6), JSON.stringify(s.npcs.map((n) => +n.dist.toFixed(2))));
ok('복귀 후 책상 묶음 8개', s.sets === 8);
await page.evaluate(() => window.__sim.game.dialogue.skipEverything());
await shot('5_clean_cabinet', [5.0, 1.45, 4.6], [6.25, 0.6, 6.9]);
await shot('6_left_pillar', [0.5, 1.6, 0.9], [-7, 1.4, 0.9]);
console.log('콘솔 오류', errors.length, errors.slice(0, 3));
console.log(results.filter((r) => r[0] === '실패').length ? '결과: 실패 있음' : '결과: 모두 통과');
await browser.close();
try { process.kill(-server.pid); } catch {}
process.exit(0);
