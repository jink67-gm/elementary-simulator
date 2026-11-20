// 첫 번째 플레이어 외형(회색 맨투맨 남학생 GLB) 확인: 동작 전환, 발·엉덩이 높이, 책가방·손 부착점, 스크린샷.
// 사용: npm run build && node scripts/player-model-check.mjs  (BASE=https://… 를 주면 그 주소에서 GLB 로드만 확인)
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = await import('playwright').catch(() => createRequire(execSync('npm root -g').toString().trim() + '/')('playwright'));
const OUT = 'test-results/player-model';
mkdirSync(OUT, { recursive: true });
const PORT = 4220;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);
const errors = [];
const glb = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('response', (r) => r.url().endsWith('.glb') && glb.push(`${r.status()} ${new URL(r.url()).pathname}`));
await page.addInitScript(() => localStorage.setItem('elementary-simulator.settings.v1', JSON.stringify({ quality: 'mid', autoRes: false, controls: 'keyboard' })));
await page.goto(`http://localhost:${PORT}/elementary-simulator/?debug`);
await page.waitForFunction(() => !!window.__sim, null, { timeout: 180000 });
await page.evaluate(() => localStorage.removeItem('elementary-simulator.save.v1'));
let fail = 0;
const check = (n, ok, info) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${info === undefined ? '' : ' ' + JSON.stringify(info)}`);
  if (!ok) fail++;
};
await page.getByText('새로 시작').click();
await page.locator('.look-card').nth(0).click(); // 첫 번째 외형
await page.getByText('학교 갈 준비 완료!').click();
await page.waitForTimeout(1200);
await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__sim.game.running, null, { timeout: 90000 });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__sim.game.dialogue.skipEverything());
check('GLB 두 개 로드 (200)', glb.some((g) => g.startsWith('200') && g.endsWith('/elementary-simulator/models/characters/student_gray.glb')) && glb.some((g) => g.startsWith('200') && g.endsWith('/elementary-simulator/models/anims/school_anims.glb')), glb);

// 페이지 안 도우미: 스킨 변형된 메시의 실제 꼭짓점으로 높이 재기
await page.evaluate(() => {
  const s = window.__sim;
  window.__pm = {
    info() {
      const g = s.game, ch = g.player.char;
      return { glb: !!ch.model?.getObjectByName?.('pelvis'), pose: ch.pose, clip: ch.current?.getClip().name, bag: g.player.wearingBag, bagParent: g.player.backpack?.parent?.parent?.name ?? null, handParent: ch.hand.parent?.name ?? null };
    },
    /** 스킨 메시 꼭짓점 (월드). filter(x,y,z) 를 만족하는 것 중 가장 낮은 y */
    minY(filterR = null) {
      const g = s.game, ch = g.player.char;
      ch.root.updateMatrixWorld(true);
      let best = Infinity;
      const v = new g.player.pos.constructor();
      const pel = ch.model.getObjectByName('pelvis');
      const pp = new g.player.pos.constructor();
      pel?.getWorldPosition(pp);
      ch.model.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 2) {
          o.getVertexPosition(i, v);
          o.applyBoneTransform(i, v);
          v.applyMatrix4(o.matrixWorld);
          if (filterR !== null && Math.hypot(v.x - pp.x, v.z - pp.z) > filterR) continue;
          if (v.y < best) best = v.y;
        }
      });
      return best;
    },
    maxY() {
      const g = s.game, ch = g.player.char;
      ch.root.updateMatrixWorld(true);
      let best = -Infinity;
      const v = new g.player.pos.constructor();
      ch.model.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 3) { o.getVertexPosition(i, v); o.applyBoneTransform(i, v); v.applyMatrix4(o.matrixWorld); if (v.y > best) best = v.y; }
      });
      return best - g.player.pos.y;
    },
    ground() {
      const p = s.game.player.pos;
      return s.game.map.groundY(p.x, p.z, p.y);
    },
  };
});

// 교실 안, 넓은 통로에 세우기
const cam = (pos, look) => page.evaluate(([p, l]) => { const g = window.__sim.game; const V = g.player.pos.constructor; g.tpc.override = { pos: new V(...p), look: new V(...l) }; g.tpc.first = true; }, [pos, look]);
const shot = async (name) => {
  await page.waitForTimeout(700);
  await page.evaluate(() => (document.querySelector('.ui-layer').style.visibility = 'hidden'));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.evaluate(() => (document.querySelector('.ui-layer').style.visibility = ''));
};
await page.evaluate(() => { const g = window.__sim.game; g.player.teleport(1.0, 2.8, Math.PI, 0); g.tpc.behind(g.player.yaw); });
await page.waitForTimeout(1500);
let info = await page.evaluate(() => window.__pm.info());
check('첫 번째 외형 = GLB 캐릭터 (뼈대 모델)', info.glb, info);
check('대기 동작 Idle_Loop', info.clip === 'Idle_Loop', info.clip);
check('책가방이 등 척추 본에 붙음', info.bag && /spine/i.test(info.bagParent ?? ''), info.bagParent);
const standFoot = await page.evaluate(() => window.__pm.minY() - window.__pm.ground());
check('서 있을 때 발바닥이 바닥에 닿음 (±3cm)', Math.abs(standFoot) < 0.03, +standFoot.toFixed(3));
// 기본 3인칭 카메라 (뒤에서): 뒷모습 + 책가방
await page.evaluate(() => { const g = window.__sim.game; g.tpc.override = null; g.tpc.behind(g.player.yaw); });
await shot('1_back_idle_tpc');
await cam([2.6, 1.3, 4.6], [1.0, 0.75, 2.8]);
await shot('2_back_closeup');
await cam([1.0, 1.0, 0.9], [1.0, 0.75, 2.8]);
await shot('3_front_idle');

// 걷기·달리기: 발이 바닥에 닿는지 (가장 낮은 꼭짓점이 바닥과 ±3cm 안인 프레임 비율)
const gait = async (run) => {
  await page.evaluate(() => { const g = window.__sim.game; g.tpc.override = null; g.player.teleport(9.0, -14.0, 0, 0); g.tpc.behind(Math.PI); });
  await page.waitForTimeout(500);
  if (run) await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(900);
  const samples = [];
  let clip = '', gaitW = 0, runW = 0;
  for (let i = 0; i < 14; i++) {
    const r = await page.evaluate(() => ({ d: window.__pm.minY() - window.__pm.ground(), clip: window.__pm.info().clip, sp: window.__sim.game.player.speed, gaitW: window.__sim.game.player.char.gaitW, runW: window.__sim.game.player.char.runW }));
    samples.push(r.d);
    clip = r.clip; gaitW = r.gaitW; runW = r.runW;
    await page.waitForTimeout(120);
  }
  await cam([11.0, 1.4, (await page.evaluate(() => window.__sim.game.player.pos.z)) + 1.5], await page.evaluate(() => { const p = window.__sim.game.player.pos; return [p.x, 0.6, p.z]; }));
  await page.screenshot({ path: `${OUT}/${run ? '5_run' : '4_walk'}.png` });
  await page.keyboard.up('KeyS');
  if (run) await page.keyboard.up('ShiftLeft');
  const min = Math.min(...samples), max = Math.max(...samples);
  return { clip, gaitW: +gaitW.toFixed(2), runW: +runW.toFixed(2), min: +min.toFixed(3), max: +max.toFixed(3) };
};
const walk = await gait(false);
check('걷기: 서기 동작 위에 발 디디기·팔 흔들기', walk.clip === 'Idle_Loop' && walk.gaitW > 0.5, walk);
check('걷는 동안 발이 바닥 아래로 꺼지지 않고(≥-3cm) 바닥에 닿음(최저 ≤3cm)', walk.min > -0.03 && walk.min < 0.03, walk);
const run = await gait(true);
check('달리기: 서기 동작 위에 발 디디기·팔 흔들기 (팔꿈치 굽힘)', run.clip === 'Idle_Loop' && run.gaitW > 0.5 && run.runW > 0.5, run);
check('달리는 동안 발이 바닥 아래로 꺼지지 않음 (≥-3cm)', run.min > -0.03, run);

// 발 미끄러짐·계단 디디기: 게임을 멈추고 1/60초씩 정확히 움직이며 잰다 (느린 화면과 상관없이)
const sim = (args) => page.evaluate(([pose, speed, x0, z0, y0, yaw, secs]) => {
  const g = window.__sim.game, p = g.player, ch = p.char, V = p.pos.constructor;
  g.paused = true;
  p.teleport(x0, z0, yaw, y0);
  ch.setPose(pose);
  ch.gaitLog = { planted: [], steps: 0, forced: 0 };
  const bones = ['foot_l', 'foot_r'].map((n) => ch.model.getObjectByName(n));
  const G = ch.constructor.footGround;
  const dt = 1 / 60, fx = Math.sin(yaw), fz = Math.cos(yaw);
  let pen = 0, slip = 0;
  const prev = [null, null];
  for (let i = 0; i < secs * 60; i++) {
    p.pos.x += fx * speed * dt; p.pos.z += fz * speed * dt;
    p.pos.y = g.map.groundY(p.pos.x, p.pos.z, p.pos.y);
    p.speed = speed; p.sync();
    ch.update(dt, Math.min(1, speed / 3), speed);
    if (i < 15) continue; // 서 있다가 출발하는 첫 0.25초는 빼고
    bones.forEach((b, k) => {
      const f = b.getWorldPosition(new V());
      if (f.y < G(f.x, f.z, p.pos.y) + ch.ankleH - 0.03) pen++;
      const sw = ch.feet[k].swing;
      if (!sw && prev[k] && !prev[k].sw) slip = Math.max(slip, Math.hypot(f.x - prev[k].v.x, f.z - prev[k].v.z) / dt);
      prev[k] = { v: f, sw };
    });
  }
  const gl = ch.gaitLog; ch.gaitLog = null; g.paused = false;
  return { steps: gl.steps, perSec: +(gl.steps / secs).toFixed(1), slipMax: +slip.toFixed(2), pen };
}, args);
for (const [name, args] of [['걷기 (복도)', ['walk', 2.0, 9, -14, 0, 0, 4]], ['뛰기 (복도)', ['run', 4.6, 9, -14, 0, 0, 3]], ['계단 오르기', ['walk', 2.0, 7.4, -10.4, -3.6, -Math.PI / 2, 1.5]], ['계단 내려가기', ['walk', 2.0, 6.85, -7.9, 0, -Math.PI / 2, 1.4]]]) {
  const r = await sim(args);
  check(`${name}: 디딘 발이 바닥에서 미끄러지지 않음(초당 0.3m 미만) · 바닥·계단 속으로 3cm 넘게 묻히지 않음 · 두 발 번갈아`, r.slipMax < 0.3 && r.pen === 0 && r.steps >= 4, r);
}
await page.evaluate(() => { const g = window.__sim.game; g.player.teleport(1.0, 2.8, Math.PI, 0); g.tpc.behind(g.player.yaw); });
await page.waitForTimeout(800);
const height = await page.evaluate(() => window.__pm.maxY());
check('키: 1.25배로 키움 (약 1.55~1.65m)', height > 1.5 && height < 1.7, +height.toFixed(2));

// 앉기: 의자 좌판 높이 재고 엉덩이 높이와 비교
await page.evaluate(() => { window.__sim.game.tpc.override = null; window.__sim.game.player.teleport(1.0, 2.8, Math.PI, 0); });
await page.waitForTimeout(400);
const seatInfo = await page.evaluate(() => { const st = window.__sim.game.map.seats.player; return { x: st.x, z: st.z }; });
// 의자 좌판 윗면: 자리 둘레 ±20cm 안 의자 꼭짓점 중 0.3~0.5m에서 가장 높은 점 (좌판은 모서리에만 꼭짓점이 있는 판)
const chair = await page.evaluate(({ x, z }) => {
  const g = window.__sim.game, me = g.player.char.root;
  let top = null;
  const v = new (g.player.pos.constructor)();
  g.scene.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    for (let q = o; q; q = q.parent) if (q === me) return;
    const geo = o.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox.clone().applyMatrix4(o.matrixWorld);
    if (bb.max.x - bb.min.x > 1.5 || x < bb.min.x || x > bb.max.x || z < bb.min.z || z > bb.max.z) return;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (Math.abs(v.x - x) < 0.2 && Math.abs(v.z - z) < 0.2 && v.y > 0.3 && v.y < 0.5 && (top === null || v.y > top)) top = v.y;
    }
  });
  return top;
}, seatInfo);
// 게임 흐름처럼 가방을 고리에 건 뒤 앉는다 (메고 앉으면 가방이 의자 등받이와 겹친다)
await page.evaluate(() => { const g = window.__sim.game; window.__sim.story.hangBag(true); g.player.sitAt(g.map.seats.player); });
await page.waitForFunction(() => window.__sim.game.player.char.sitW > 0.995, null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);
info = await page.evaluate(() => window.__pm.info());
await page.waitForTimeout(800);
const hip = await page.evaluate(() => {
  // 허벅지 아래면: 자리에서 책상 쪽으로 13~19cm (엉덩이~허벅지가 좌판에 닿는 곳), 좌우 ±12cm 안 가장 낮은 꼭짓점
  const g = window.__sim.game, ch = g.player.char, st = g.map.seats.player;
  const fx = st.deskX - st.x, fz = st.deskZ - st.z, fl = Math.hypot(fx, fz) || 1;
  let best = Infinity;
  const v = new (g.player.pos.constructor)();
  ch.root.updateMatrixWorld(true);
  ch.model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      o.getVertexPosition(i, v); o.applyBoneTransform(i, v); v.applyMatrix4(o.matrixWorld);
      const dx = v.x - st.x, dz = v.z - st.z;
      const along = (dx * fx + dz * fz) / fl, side = Math.abs((dx * fz - dz * fx) / fl);
      if (along > 0.13 && along < 0.19 && side < 0.12 && v.y < best) best = v.y;
    }
  });
  return best;
});
check('앉기 동작 Sitting_Idle_Loop', info.clip === 'Sitting_Idle_Loop', info.clip);
const seatedFoot = await page.evaluate(() => window.__pm.minY() - window.__pm.ground());
check('앉았을 때 발이 바닥에 닿음 (0~3cm)', seatedFoot > -0.01 && seatedFoot < 0.03, +seatedFoot.toFixed(3));
check('앉았을 때 엉덩이·허벅지가 의자 좌판 위에 맞음 (좌판과 -2cm~+3cm)', chair !== null && hip - chair > -0.02 && hip - chair < 0.03, { 좌판: chair && +chair.toFixed(3), 엉덩이: +hip.toFixed(3) });
const p = await page.evaluate(() => { const s = window.__sim.game.map.seats.player; return [s.x, s.z, s.deskX, s.deskZ]; });
await page.evaluate(() => { for (const n of [...Object.values(window.__sim.game.npcs), ...window.__sim.game.fillers]) n.char.root.visible = false; });
await cam([p[0] + 1.5, 0.75, p[1] + 0.05], [p[0], 0.5, p[1] - 0.05]);
await shot('6_sit_side');
await cam([p[0] + (p[0] - p[2]) * 2.2 + 0.6, 1.5, p[1] + (p[1] - p[3]) * 2.2], [p[0], 0.6, p[1]]);
await shot('7_sit_back');
// 손들기 (앉아서)
await page.evaluate(() => window.__sim.game.player.char.setPose('raise'));
await page.waitForFunction(() => window.__sim.game.player.char.raiseW > 0.95, null, { timeout: 15000 }).catch(() => {});
const handUp = await page.evaluate(() => { const ch = window.__sim.game.player.char; const v = new (window.__sim.game.player.pos.constructor)(); ch.hand.getWorldPosition(v); const h = new (window.__sim.game.player.pos.constructor)(); ch.head.getWorldPosition(h); return { hand: +v.y.toFixed(2), head: +h.y.toFixed(2) }; });
check('손들기: 오른손이 머리보다 위', handUp.hand > handUp.head, handUp);
await cam([p[0] + 0.3, 1.2, p[1] - 1.8], [p[0], 0.9, p[1]]);
await shot('8_raise_hand');
await page.evaluate(() => window.__sim.game.player.char.setPose('sit'));
await page.evaluate(() => { for (const n of [...Object.values(window.__sim.game.npcs), ...window.__sim.game.fillers]) n.char.root.visible = true; });

// 오른손에 물건 들기 (서서)
await page.evaluate(() => { const g = window.__sim.game; g.player.standUp(); g.player.teleport(1.0, 2.8, Math.PI, 0); g.give('koreanBook'); g.inventory.select(g.inventory.slots.indexOf('koreanBook')); });
await page.waitForTimeout(1000);
info = await page.evaluate(() => window.__pm.info());
const held = await page.evaluate(() => { const g = window.__sim.game; const ch = g.player.char; const v = new (g.player.pos.constructor)(); const hb = ch.model.getObjectByName('hand_r'); const hp = new (g.player.pos.constructor)(); hb.getWorldPosition(hp); g.player.heldMesh?.getWorldPosition(v); return { has: !!g.player.heldMesh, dist: +v.distanceTo(hp).toFixed(3) }; });
check('오른손(hand_r)에 국어책이 붙음', info.handParent === 'hand_r' && held.has && held.dist < 0.25, { ...held, handParent: info.handParent });
await cam([0.2, 1.2, 1.4], [1.0, 0.8, 2.8]);
await shot('9_hold_book');

// 다른 학생 외형: 블록 캐릭터 그대로
const npcs = await page.evaluate(() => { const g = window.__sim.game; return [...Object.values(g.npcs), ...g.fillers].map((n) => !!n.char.model?.getObjectByName?.('pelvis')); });
check('반 친구들 외형은 그대로 (GLB로 바뀐 NPC 없음)', npcs.every((c) => !c), npcs.length);
await page.evaluate(() => { const g = window.__sim.game; g.player.teleport(4.5, 4.2, Math.PI, 0); });
await cam([5.6, 1.7, 5.4], [-0.5, 0.7, -1.5]);
await shot('10_classmates');
check('페이지 오류 없음', errors.length === 0, errors.slice(0, 5));
await browser.close();
try { process.kill(-server.pid); } catch { server.kill(); }
console.log(fail ? `\n실패 ${fail}개` : '\n모두 통과');
process.exit(fail ? 1 : 0);
