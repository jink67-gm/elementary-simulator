// 최종 품질 점검용 측정: (1) 순간이동 없이 실제 키 입력으로 등교 동선 걷기(정문→현관→계단→2층 교실 내 자리, 다시 1층 급식실까지),
// (2) 걷는 동안 바닥 높이 연속성(계단·층 사이 틈/떨어짐), (3) 장면별 그리기 호출·삼각형·텍스처 수, (4) 주요 공간 화면 캡처, (5) 콘솔·404 오류.
// 사용: npm run build && node scripts/qa-audit.mjs   (결과: test-results/qa/)
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const { chromium } = await import('playwright').catch(() => createRequire(execSync('npm root -g').toString().trim() + '/')('playwright'));
const OUT = 'test-results/qa';
mkdirSync(OUT, { recursive: true });
const PORT = 4186;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--outDir', process.env.OUT_DIR ?? 'dist'], { stdio: 'pipe', detached: true });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
await page.addInitScript(() => localStorage.setItem('elementary-simulator.settings.v1', JSON.stringify({ quality: 'low', autoRes: false, controls: 'keyboard' })));
const errors = [], failed = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`));
const report = { walk: {}, perf: {}, errors, failed };
const t0 = Date.now();
await page.goto(`http://localhost:${PORT}/elementary-simulator/?debug`);
await page.waitForFunction(() => !!window.__sim, null, { timeout: 120000 });
report.loadMs = Date.now() - t0;
await page.getByText('새로 시작').click();
await page.getByText('학교 갈 준비 완료!').click();
await page.keyboard.press('KeyE');
await page.waitForFunction(() => !!window.__sim.game.save && window.__sim.game.running, null, { timeout: 60000 });
await page.addStyleTag({ content: 'body.shot-nohud .hud, body.shot-nohud .dialogue { display: none !important; }' });
const quiet = () => page.evaluate(() => window.__sim.game.dialogue.skipEverything());

/** 순간이동 없이 걷기: 길 찾기로 얻은 경유점을 향해 카메라를 돌리고(마우스 역할) W·Shift를 실제로 누른다 */
async function walkTo(name, tx, tz, ty, timeoutMs = 420000) {
  if (process.env.SKIP_WALK) return page.evaluate(([x, z, y]) => window.__sim.teleport(x, z, y), [tx, tz, ty]);
  const start = Date.now();
  const res = await page.evaluate(([tx, tz, ty]) => {
    const g = window.__sim.game, p = g.player.pos;
    const path = g.nav.findPath({ x: p.x, z: p.z, y: p.y }, { x: tx, z: tz, y: ty });
    window.__walk = { path: path ?? [], i: 0, minDrop: 0, maxStep: 0, lastY: p.y, stuck: 0, lastX: p.x, lastZ: p.z, samples: [] };
    return path ? path.length : -1;
  }, [tx, tz, ty]);
  if (res < 0) return (report.walk[name] = { ok: false, why: '길 없음' });
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ShiftLeft');
  let ok = false, why = '시간 초과';
  while (Date.now() - start < timeoutMs) {
    const st = await page.evaluate(() => {
      const g = window.__sim.game, p = g.player.pos, w = window.__walk;
      g.dialogue.skipEverything();
      while (w.i < w.path.length && Math.hypot(w.path[w.i].x - p.x, w.path[w.i].z - p.z) < 0.45) w.i++;
      const dy = p.y - w.lastY;
      w.maxStep = Math.max(w.maxStep, Math.abs(dy));
      w.minDrop = Math.min(w.minDrop, dy);
      w.lastY = p.y;
      const moved = Math.hypot(p.x - w.lastX, p.z - w.lastZ);
      w.stuck = moved < 0.01 ? w.stuck + 1 : 0;
      w.lastX = p.x;
      w.lastZ = p.z;
      if (w.i >= w.path.length) return { done: true, pos: [p.x, p.y, p.z], maxStep: w.maxStep };
      const t = w.path[w.i];
      // 가려는 방향 = 카메라가 보는 방향 (플레이어는 카메라 기준 앞으로 걷는다)
      g.tpc.yaw = Math.atan2(-(t.x - p.x), -(t.z - p.z));
      return { done: false, stuck: w.stuck, pos: [p.x, p.y, p.z], i: w.i, n: w.path.length, y: p.y };
    });
    if (st.done) {
      ok = true;
      why = '';
      break;
    }
    if (st.pos[1] < -6) {
      why = `맵 아래로 떨어짐 ${st.pos}`;
      break;
    }
    if (st.stuck > 40) {
      why = `끼임 ${st.pos.map((v) => v.toFixed(2))} (${st.i}/${st.n})`;
      break;
    }
    await page.waitForTimeout(150);
  }
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  const fin = await page.evaluate(() => ({ pos: window.__sim.game.player.pos.toArray(), maxStep: window.__walk.maxStep, minDrop: window.__walk.minDrop }));
  report.walk[name] = { ok, why, sec: Math.round((Date.now() - start) / 1000), end: fin.pos.map((v) => +v.toFixed(2)), maxStepPerFrame: +fin.maxStep.toFixed(3), biggestDropPerFrame: +fin.minDrop.toFixed(3) };
  console.log(' 걷기', name, JSON.stringify(report.walk[name]));
  return report.walk[name];
}

const perf = async (name) => {
  await page.waitForTimeout(1200);
  report.perf[name] = await page.evaluate(() => {
    const g = window.__sim.game, i = g.renderer.info;
    let meshes = 0;
    g.scene.traverse((o) => o.isMesh && o.visible && meshes++);
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, meshes, fpsSoftware: g.fps };
  });
  console.log(' 성능', name, JSON.stringify(report.perf[name]));
};
const shot = async (name, pos, look) => {
  if (process.env.NO_SHOTS) return;
  await page.evaluate(([p, l]) => {
    const g = window.__sim.game, T = g.tpc.cam.position.constructor;
    g.tpc.override = { pos: new T(...p), look: new T(...l) };
    g.tpc.first = true;
    document.body.classList.add('shot-nohud');
  }, [pos, look]);
  await page.waitForTimeout(2200);
  await quiet();
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.evaluate(() => {
    window.__sim.game.tpc.override = null;
    document.body.classList.remove('shot-nohud');
  });
};
const Y1 = -3.6;

// ── 1. 등교 동선 (순간이동 없음) ──
await quiet();
await perf('정문 앞');
await shot('01_school_front', [29.5, Y1 + 3.0, -1.5], [16, Y1 + 2.2, -1.5]);
await walkTo('정문→현관 안', 13.5, -1.75, Y1);
await perf('현관');
await walkTo('현관→계단 아래', 12.4, -5.25, Y1);
await shot('03_stairs_bottom', [12.4, Y1 + 1.7, -4.2], [12.4, Y1 + 2.2, -10]);
await walkTo('계단 오르기(1층→2층)', 12.4, -15.0, 0);
await shot('04_stairs_top_gap_check', [12.4, 1.7, -16.3], [12.4, -0.6, -11]);
await shot('04b_stairs_side', [9.4, 0.9, -12.5], [12.4, -1.0, -10]);
await perf('2층 계단참');
const seat = await page.evaluate(() => {
  const s = window.__sim.game.map.seats.player;
  return [s.x, s.z + 0.55];
});
await walkTo('2층 복도→6-1 내 자리', seat[0], seat[1], 0);
await perf('6-1 교실');
// 계단 왕복 한 번 더 (내려가기) + 1층 급식실까지
await walkTo('교실→계단 위', 12.4, -15.0, 0);
await walkTo('계단 내려가기(2층→1층)', 12.4, -5.25, Y1);
await walkTo('1층 복도→급식실 문 앞', 9, 14.6, Y1);
await perf('1층 복도 끝');
await shot('05_corridor_1f', [9, Y1 + 1.6, -3], [9, Y1 + 1.4, 14]);

// ── 2. 장면별 성능·화면 (상태를 직접 설정) ──
const scenes = [
  ['lunch', '급식실 식사 공간', [9, 18, Y1], '06_cafeteria_dining', [3.0, Y1 + 2.2, 17.2], [11, Y1 + 0.9, 23.5]],
  ['cutlet', '조리실(거대 돈가스)', [13.6, 24.8, Y1], '07_kitchen', [14.3, Y1 + 2.3, 24.3], [8.4, Y1 + 0.8, 27.4]],
  ['math', '2교시 교실', [0, 3.5, 0], '08_classroom_math', [3.6, 2.2, 5.6], [-1, 0.9, -1.5]],
  ['dodgeball', '강당', null, '09_gym', null, null],
  ['final', '최종 사건', null, '10_final', null, null],
];
for (const [period, label, tp, file, cpos, clook] of scenes) {
  await page.evaluate((p) => window.__sim.skipTo(p), period);
  await page.waitForTimeout(2500);
  await quiet();
  if (tp) await page.evaluate(([x, z, y]) => window.__sim.teleport(x, z, y), tp);
  await perf(label);
  if (cpos) await shot(file, cpos, clook);
  else {
    await page.evaluate(() => document.body.classList.add('shot-nohud'));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${file}.png` });
    await page.evaluate(() => document.body.classList.remove('shot-nohud'));
  }
}
await page.evaluate(() => window.__sim.skipTo('break'));
await page.waitForTimeout(1500);
await shot('11_corridor_2f', [9, 1.6, -13], [9, 1.3, 10]);
await shot('12_lockers', [0.5, 1.5, 3.4], [0.5, 0.9, 6.5]);
await shot('13_group_table', [-2.2, 1.7, 2.9], [0, 0.6, 4.8]);

// ── 3. 품질 단계별 그리기 비용 (교실) ──
for (const q of ['low', 'mid', 'high']) {
  await page.evaluate((q) => {
    const g = window.__sim.game;
    g.settings.quality = q;
    g.applySettings();
    g.player.teleport(0, 3.5, Math.PI, 0);
  }, q);
  await perf(`교실·품질 ${q}`);
}
report.jsHeapMB = await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576));
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log('오류', errors.length, '404', failed.length, '로딩', report.loadMs, 'ms', '힙', report.jsHeapMB, 'MB');
await browser.close();
try { process.kill(-server.pid); } catch {}
process.exit(0);
