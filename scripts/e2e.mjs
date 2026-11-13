// 브라우저 자동 플레이 테스트: 등교부터 급식실 전환까지 실제 키 입력(E/F/Space/숫자)으로 진행한다.
// 사용: npm run build && npm run e2e   (Playwright + Chromium 필요)
// 이동은 디버그 API(?debug)의 순간이동을 쓰지만, 상호작용·미니게임은 모두 진짜 키보드 입력이다.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const root = execSync('npm root -g').toString().trim();
    return createRequire(root + '/')('playwright');
  }
}

const OUT = 'test-results';
mkdirSync(OUT, { recursive: true });
const PORT = 4179;
const URL = `http://localhost:${PORT}/elementary-simulator/?debug`;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
// 소프트웨어 렌더링(CI)에서는 아주 느리므로 작은 화면 + 「낮음」 품질로 시작한다
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.addInitScript(() => {
  if (!localStorage.getItem('elementary-simulator.settings.v1')) localStorage.setItem('elementary-simulator.settings.v1', JSON.stringify({ quality: 'low' }));
});
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));

let failed = false;
const log = (...a) => console.log('  ', ...a);
const state = () => page.evaluate(() => window.__sim.state());
const sleep = (ms) => page.waitForTimeout(ms);

async function waitFor(desc, fn, timeout = 30000) {
  const t0 = Date.now();
  for (;;) {
    const s = await state();
    if (fn(s)) return s;
    if (Date.now() - t0 > timeout) throw new Error(`시간 초과: ${desc}\n상태: ${JSON.stringify(s)}`);
    // 대사는 Enter로 넘긴다 (패널이 없을 때만)
    if (s.dialogue && !(await page.$('.panel-wrap'))) await page.keyboard.press('Enter');
    await sleep(200);
  }
}
const noDialogue = () => waitFor('대사 끝', (s) => !s.dialogue, 60000);
const panelOpen = async () => !!(await page.$('.panel-wrap'));
async function waitPanel(open = true) {
  for (let i = 0; i < 60; i++) {
    if ((await panelOpen()) === open) return;
    await sleep(100);
  }
  throw new Error(open ? '창이 안 열림' : '창이 안 닫힘');
}
/** 대상 앞으로 이동해서 키 누르기 (E/F). 포커스가 기대한 대상인지 확인 */
async function act(id, key, expect, { stay = false, from, dist = 0.7 } = {}) {
  await noDialogue();
  if (id.startsWith('npc:')) await npcIdle(id.slice(4));
  for (let i = 0; i < 50 && !(await page.evaluate((x) => !!window.__sim.game.interactions.get(x), id)); i++) await sleep(100);
  if (!stay) await page.evaluate(([i, f, d]) => window.__sim.goto(i, d, f), [id, from, dist]);
  else
    await page.evaluate((i) => {
      const g = window.__sim.game;
      const p = g.interactions.position(g.interactions.get(i));
      g.tpc.yaw = Math.atan2(-(p.x - g.player.pos.x), -(p.z - g.player.pos.z));
    }, id);
  // 느린 소프트웨어 렌더링에서는 순간이동 후 포커스 계산이 한두 프레임 늦을 수 있다
  let s, label;
  for (let i = 0; i < 15; i++) {
    await sleep(200);
    s = await state();
    label = key === 'KeyE' ? s.focus?.e : s.focus?.f;
    if (label && (!expect || label.includes(expect))) break;
  }
  if (!label) throw new Error(`${id}: ${key} 동작 없음 (focus=${JSON.stringify(s.focus)})`);
  if (expect && !label.includes(expect)) throw new Error(`${id}: 예상 「${expect}」, 실제 「${label}」`);
  // 누르기 직전에 이야기 대사가 떴으면 먼저 넘긴다 (대화창이 떠 있으면 E는 「다음 대사」로 쓰이므로)
  if ((await state()).dialogue) {
    await noDialogue();
    if (!stay) await page.evaluate(([i, f, d]) => window.__sim.goto(i, d, f), [id, from, dist]);
    await sleep(300);
  }
  await page.keyboard.press(key);
  await frames(3);
  log(`${key === 'KeyE' ? 'E' : 'F'} → ${label}`);
}
async function npcIdle(id) {
  for (let i = 0; i < 100; i++) {
    if (await page.evaluate((n) => window.__sim.game.npcs[n].path.length === 0, id)) return;
    await sleep(100);
  }
}
/** 게임이 n프레임을 더 그릴 때까지 기다린다 (느린 렌더링에서도 키 입력이 처리되도록) */
async function frames(n = 3) {
  const f0 = await page.evaluate(() => window.__sim.game.renderer.info.render.frame);
  await page.waitForFunction(([f, k]) => window.__sim.game.renderer.info.render.frame >= f + k, [f0, n], { timeout: 15000 });
}
async function selectItem(item) {
  // 느린 렌더링(초당 5프레임)에서는 줍기가 다음 프레임에 처리되므로 잠깐 기다린다
  let idx = -1;
  for (let i = 0; i < 15 && idx < 0; i++) {
    idx = await page.evaluate((it) => window.__sim.game.inventory.slots.indexOf(it), item);
    if (idx < 0) await sleep(200);
  }
  const s = await state();
  if (idx < 0) throw new Error(`소지품에 ${item} 없음: ${s.inventory}`);
  await page.keyboard.press(`Digit${idx + 1}`);
  await sleep(80);
}
// E2E_ONLY=사건1 처럼 주면 그 이름이 들어간 단계만 (타이틀은 항상) 실행
const ONLY = process.env.E2E_ONLY;
async function step(name, fn) {
  if (ONLY && !name.includes(ONLY) && !name.startsWith('타이틀')) return;
  console.log('▶', name);
  try {
    await fn();
    await page.screenshot({ path: `${OUT}/${name.replace(/[^\w가-힣]+/g, '_')}.png` });
  } catch (e) {
    failed = true;
    console.log('  ✗', e.message);
    await page.screenshot({ path: `${OUT}/FAIL_${name.replace(/[^\w가-힣]+/g, '_')}.png` });
    throw e;
  }
}

try {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await sleep(1200);

  await step('타이틀_캐릭터_알람', async () => {
    await page.getByText('새로 시작').click();
    await page.locator('.look-card').nth(2).click();
    await page.getByText('콩떡', { exact: true }).click();
    await page.getByText('학교 갈 준비 완료!').click();
    await page.keyboard.press('Space'); // 5분만 더
    await page.keyboard.press('KeyE');
    await waitFor('등교 시작', (s) => s.period === 'arrival' && s.phase === 'bag');
    const s = await state();
    if (!s.flags.overslept) throw new Error('늦잠 플래그 없음');
  });

  await step('등교', async () => {
    await act('item:pencil', 'KeyE', '줍기');
    await waitFor('필통 주움', (s) => s.inventory.includes('pencilCase'));
    await act('npc:junho', 'KeyF', '필통');
    await waitFor('필통 돌려줌', (s) => s.flags.pencilReturned);
    await selectItem('bag');
    await act('seat', 'KeyF', '가방');
    await waitFor('가방 놓음', (s) => s.flags.bagOnDesk);
    await act('locker', 'KeyE', '사물함');
    await waitFor('국어책 챙김', (s) => s.inventory.includes('koreanBook'));
    await selectItem('koreanBook');
    await act('seat', 'KeyF', '국어책');
    await waitFor('국어책 올림', (s) => s.flags.bookOnDesk);
    // 대화는 E로 넘기고 마지막 줄에서 E로 닫는다 (저절로 넘어가지 않고, 닫은 E로 다시 말 걸지 않는다)
    await act('npc:seoa', 'KeyE', '서아', { from: [0, 1], dist: 0.8 });
    await page.waitForFunction(() => !!window.__sim.state().dialogue, null, { timeout: 5000 });
    const before = await page.evaluate(() => window.__sim.game.npcs.seoa.talkCount);
    await sleep(6000);
    if (!(await state()).dialogue) throw new Error('대사가 저절로 넘어감');
    for (let i = 0; i < 12 && (await state()).dialogue; i++) {
      await page.keyboard.press('KeyE');
      await sleep(300);
    }
    if ((await state()).dialogue) throw new Error('E로 대화가 안 닫힘');
    await sleep(800);
    const after = await page.evaluate(() => window.__sim.game.npcs.seoa.talkCount);
    if ((await state()).dialogue || after !== before) throw new Error('닫은 E로 다시 말을 걸었음');
    log('E로 대화 넘기기·닫기 확인');
    for (let i = 0; i < 3; i++) {
      await act('lunchMenu', 'KeyE', '급식표');
      await waitPanel(true);
      await page.keyboard.press('Enter');
      await waitPanel(false);
    }
    await waitFor('급식 전문가', (s) => s.flags.lunchExpert);
    await waitFor('1교시 시작', (s) => s.period === 'korean', 90000);
  });

  await step('1교시_국어', async () => {
    await act('seat', 'KeyE', '앉기');
    await waitFor('86쪽 찾기 단계', (s) => s.phase === 'find');
    await act('deskBook', 'KeyE', '86쪽', { stay: true });
    await waitPanel(true);
    for (let i = 0; i < 40 && (await panelOpen()); i++) {
      const left = Number(await page.locator('.page.left .page-num').textContent());
      const d = 86 - left;
      if (d === 0 || d === -1) { await sleep(300); continue; }
      const key = d > 0 ? 'KeyD' : 'KeyA';
      await page.keyboard.press(Math.abs(d) > 20 ? `Shift+${key}` : key);
      await sleep(120);
    }
    await waitPanel(false);
    await waitFor('86쪽 찾음', (s) => s.flags.found86);
    await act('npc:seoa', 'KeyE', '서아', { stay: true });
    await waitFor('쪽수 알려 줌', (s) => s.flags.helpedPageFriend);
    await waitFor('질문 단계', (s) => s.phase === 'question', 60000);
    await act('deskBook', 'KeyE', '단서', { stay: true });
    await waitPanel(true);
    await page.keyboard.press('Digit1'); // 일부러 틀리기
    await sleep(200);
    await page.keyboard.press('Digit2');
    await waitPanel(false);
    await act('npc:seoa', 'KeyE', '서아', { stay: true });
    await waitFor('짝과 의견', (s) => s.flags.consultedPartner);
    await act('seat', 'KeyF', '손 들기', { stay: true });
    await waitFor('발표 완료', (s) => s.flags.spokeInClass, 60000);
    await waitFor('쉬는 시간', (s) => s.period === 'break', 60000);
  });

  await step('쉬는_시간', async () => {
    await act('npc:junho', 'KeyE', '준호');
    await waitFor('종이비행기 받음', (s) => s.inventory.includes('paperPlane'));
    await noDialogue();
    await selectItem('paperPlane');
    await page.evaluate(() => { window.__sim.teleport(9, -10); window.__sim.game.tpc.yaw = Math.PI; });
    await sleep(200);
    await page.keyboard.down('Space');
    await sleep(900);
    await page.keyboard.up('Space');
    // 착지할 때까지 기다린다 (느린 PC에서는 비행이 더 오래 걸림)
    await page.waitForFunction(() => !!window.__sim.game.save.stats.planeBest, null, { timeout: 20000 }).catch(() => {});
    const best = await page.evaluate(() => window.__sim.game.save.stats.planeBest);
    if (!best) throw new Error('비행 기록 없음');
    log(`종이비행기 ${best}m`);
    await act('npc:minjae', 'KeyE', '민재');
    await waitPanel(true);
    await page.keyboard.press('Digit2');
    await waitPanel(false);
    await waitFor('2교시', (s) => s.period === 'math', 90000);
  });

  await step('2교시_수학', async () => {
    await waitFor('태블릿 단계', (s) => s.phase === 'tablet', 60000);
    await act('tabletCart', 'KeyE', '태블릿');
    await selectItem('tablet');
    await act('seat', 'KeyF', '태블릿');
    await waitFor('서아 3%', (s) => s.flags.seoaLow, 20000);
    await act('teacherDrawer', 'KeyE', '충전기');
    await selectItem('charger');
    await act('npc:seoa', 'KeyF', '충전기');
    await waitFor('충전기 도움', (s) => s.flags.helpedDevice_charger);
    await act('seat', 'KeyE', '앉기');
    await act('deskTablet', 'KeyE', '태블릿 켜기', { stay: true });
    await waitPanel(true);
    for (let q = 0; q < 3; q++) {
      await page.waitForSelector('.keypad', { timeout: 8000 });
      const text = await page.locator('.question').textContent();
      const ans = { '48 ÷ 6 = ?': '8', '3/4 을 소수로 나타내면?': '0.75', '2.5 × 4 = ?': '10', '3/4 ÷ 3 = ? (분수로)': '1/4', '7.2 ÷ 0.9 = ?': '8', '2 : 5 = 6 : □ 에서 □는?': '15' }[text] ?? '0';
      await page.keyboard.type(ans);
      await page.keyboard.press('Enter');
      await page.waitForSelector('.feedback.good, .feedback.bad', { timeout: 4000 });
      await page.waitForFunction((t) => document.querySelector('.question')?.textContent !== t, text, { timeout: 8000 });
    }
    await page.waitForSelector('.wish-grid', { timeout: 10000 });
    await page.keyboard.press('Digit2');
    await waitPanel(false);
    await waitFor('퀴즈 끝', (s) => s.flags.quizDone && s.wish === 'break');
    log('퀴즈 점수', await page.evaluate(() => window.__sim.game.save.quizScore));
    await waitFor('3교시', (s) => s.period === 'group', 60000);
  });

  await step('3교시_모둠_제작', async () => {
    await waitFor('모이기', (s) => s.phase === 'gather', 30000);
    await page.evaluate(() => window.__sim.teleport(1.2, 3.3));
    await waitFor('역할 고르기', (s) => s.phase === 'pickRole', 30000);
    await act('item:role_maker', 'KeyE', '제작', { from: [0, -1] });
    await waitFor('역할', (s) => s.role === 'maker');
    await act('groupTable', 'KeyE', '포스터');
    await waitPanel(true);
    for (const k of ['Digit1', 'Digit1', 'Digit2', 'Digit3', 'ArrowRight', 'KeyB']) await page.keyboard.press(k);
    await page.keyboard.press('Enter');
    await waitPanel(false);
    await waitFor('모둠 끝', (s) => s.flags.groupDone);
    await waitFor('4교시', (s) => s.period === 'art', 60000);
  });

  await step('4교시_미술', async () => {
    await waitFor('만들기 단계', (s) => s.phase === 'craft', 30000);
    await act('item:stack2', 'KeyE', '도화지');
    await act('seat', 'KeyF', '포스터');
    await waitFor('풀 필요 안내', (s) => s.objective.includes('하린'));
    await act('npc:harin', 'KeyE', '하린');
    await waitFor('풀 빌림', (s) => s.inventory.includes('glue'));
    await selectItem('drawingPaper');
    await act('seat', 'KeyF', '포스터');
    await waitPanel(true);
    for (const k of ['Digit3', 'Digit4']) await page.keyboard.press(k);
    await page.keyboard.press('Enter');
    await waitPanel(false);
    await waitFor('작품 완성', (s) => s.flags.crafted && s.inventory.includes('miniPoster'));
    await selectItem('glue');
    await act('npc:harin', 'KeyF', '풀 돌려주기');
    await waitFor('풀 돌려줌', (s) => s.flags.returnedGlue);
    await selectItem('miniPoster');
    await act('exhibit', 'KeyF', '전시');
    await waitFor('전시', (s) => s.flags.exhibited);
    await waitFor('정리', (s) => s.objective.includes('종이 조각'), 60000);
    await act('item:scraps', 'KeyE', '종이 조각');
    await selectItem('scraps');
    await act('trash', 'KeyF', '분리수거');
    await waitFor('점심', (s) => s.period === 'lunch', 60000);
  });

  await step('새로고침_이어하기', async () => {
    await page.reload();
    await sleep(1200);
    const cont = page.getByText(/^이어하기/);
    if (!(await cont.isVisible())) throw new Error('이어하기 버튼 없음');
    await cont.click();
    await waitFor('점심부터 이어서', (s) => s.period === 'lunch' && s.flags.exhibited && s.role === 'maker');
  });

  await step('급식실_전환', async () => {
    await page.evaluate(() => window.__sim.teleport(9, 11));
    await sleep(500);
    await page.evaluate(() => window.__sim.teleport(9, 12));
    await waitFor('사건 1 시작', (s) => s.period === 'cutlet', 90000);
    await noDialogue();
  });

  // ───── 사건 1: 거대 돈가스 — 세 가지 해결 경로 ─────
  const cutletSt = () =>
    page.evaluate(() => {
      const st = window.__sim.story.cutlet.st;
      return { carried: st.carried, pieces: [...st.pieceArea.entries()], trays: st.trays, cut: st.cut };
    });
  /** 게이지 바늘이 초록 칸일 때까지 Space */
  async function gaugeHit(done) {
    for (let i = 0; i < 80; i++) {
      if (await done()) return;
      await page.keyboard.press('Space');
      await sleep(260);
    }
    throw new Error('게이지 성공 못 함');
  }
  async function waitRecap(sol) {
    await waitFor('해결', (s) => s.cafeteria === sol && s.period === 'robot', 120000);
    await noDialogue();
    log('사건 1 → ' + sol + ', 사건 2로 넘어감');
  }
  async function restartCutlet() {
    await page.evaluate(() => {
      const g = window.__sim.game;
      g.running = true;
      g.hud.show(true);
      const scr = document.querySelector('.screen');
      if (scr) scr.parentNode.removeChild(scr);
      g.save.cafeteriaSolution = null;
      window.__sim.skipTo('cutlet');
    });
    await sleep(800);
    await noDialogue();
  }

  await step('사건1_A_잘라서_나누기', async () => {
    if (ONLY) await restartCutlet();
    await act('npc:cook', 'KeyE', '조리사');
    await noDialogue();
    await act('cutletTable', 'KeyE', '살펴보기', { dist: 2.4, from: [0, -1] });
    await noDialogue();
    await act('item:cut_unit', 'KeyE', '절단기');
    await selectItem('cutterUnit');
    await act('cutletTable', 'KeyF', '레일', { dist: 2.4, from: [0, -1] });
    await noDialogue();
    await act('cutterPanel', 'KeyE', '패널');
    await waitPanel(true);
    // 가운데 가로로 반 → 4칸, 8칸 자리 세로로 → 크기 4 조각 6개
    await page.keyboard.press('KeyH');
    await gaugeHit(() => page.$('.cut-line-h.done'));
    await page.keyboard.press('KeyA');
    await page.keyboard.press('KeyA');
    await gaugeHit(async () => (await page.$$('.cut-line.done')).length >= 1);
    for (let i = 0; i < 4; i++) await page.keyboard.press('KeyD');
    await gaugeHit(async () => (await page.$$('.cut-line.done')).length >= 2);
    await page.keyboard.press('Enter');
    await waitPanel(false);
    await noDialogue();
    let cs = await cutletSt();
    if (cs.pieces.length !== 6 || !cs.pieces.every(([, a]) => a === 4)) throw new Error('조각 이상: ' + JSON.stringify(cs.pieces));
    await page.evaluate(() => window.__sim.teleport(9, 18.6));
    await sleep(600);
    await page.screenshot({ path: `${OUT}/사건1_A_자른_조각.png` });
    await act('trayCart', 'KeyE', '식판');
    await selectItem('trayStack');
    await act('dinerTable0', 'KeyF', '식판', { dist: 1.6, from: [0, 1] });
    await act('dinerTable1', 'KeyF', '식판', { dist: 1.6, from: [0, 1] });
    const diners = [['npc:minjae', [0, 1]], ['npc:seoa', [0, 1]], ['filler:0', [-1, 0]], ['npc:junho', [0, 1]], ['npc:harin', [0, 1]], ['filler:1', [1, 0]]];
    for (const [who, from] of diners) {
      cs = await cutletSt();
      const [key] = cs.pieces[0];
      const z = await page.evaluate((k) => window.__sim.game.items.get(k).obj.position.z, key);
      await act('item:' + key, 'KeyE', '조각', { dist: 1.3, from: [0, z < 21 ? -1 : 1] });
      await selectItem('cutletPiece');
      await act(who, 'KeyF', '식판에 담기', { from, dist: 0.8 });
    }
    await waitRecap('cut_and_share');
    if (!(await state()).flags.sharedFairly) throw new Error('공평 배식 플래그 없음');
  });

  await step('사건1_B_크기_조절기', async () => {
    await restartCutlet();
    await act('sizeMachine', 'KeyE', '조절기', { from: [1, -1], dist: 1.0 });
    await waitPanel(true);
    // 일부러 틀리게 꽂기 → 안 켜짐
    for (const k of ['1', 'a', '2', 'c', '3', 'b']) {
      await page.keyboard.press(k);
      await sleep(120);
    }
    await sleep(900);
    if (await page.$('.machine-screen')) throw new Error('틀린 전선인데 켜짐');
    for (const k of ['1', 'c', '2', 'a', '3', 'b']) {
      await page.keyboard.press(k);
      await sleep(120);
    }
    await page.waitForSelector('.machine-screen', { timeout: 5000 });
    await page.keyboard.press('2');
    await sleep(150);
    await page.keyboard.press('2'); // 1000 ÷5 ÷5 = 40% → 너무 작음
    await sleep(300);
    if ((await page.locator('.machine-value').textContent()) !== '40%') throw new Error('기계 계산 이상');
    await page.keyboard.press('KeyR');
    await sleep(150);
    await page.keyboard.press('1');
    await sleep(150);
    await page.keyboard.press('2'); // ÷2 ÷5 = 100%
    await waitPanel(false);
    await waitRecap('shrink_machine');
  });

  await step('사건1_C_축제', async () => {
    await restartCutlet();
    await act('mic', 'KeyE', '마이크', { from: [-1, 0], dist: 0.9 });
    await noDialogue();
    await act('npc:cook', 'KeyE', '조리사');
    await noDialogue();
    if (!(await state()).flags.cookAgreedFestival) throw new Error('조리사 허락 없음');
    for (let i = 0; i < 3; i++) {
      await act('foldStack', 'KeyE', '테이블', { from: [0, -1], dist: 1.0 });
      await selectItem('foldTable');
      await act('festSpot' + i, 'KeyF', '펼치기', { from: [-1, 0], dist: 0.8 });
    }
    for (const [id, name] of [['minjae', '민재'], ['seoa', '서아'], ['junho', '준호']]) {
      await act('npc:' + id, 'KeyE', name, { from: [0, 1], dist: 0.8 });
      await noDialogue();
    }
    await page.evaluate(() => window.__sim.teleport(8.6, 9.0));
    await sleep(600);
    await page.screenshot({ path: `${OUT}/사건1_C_축제_준비.png` });
    await act('mic', 'KeyE', '축제', { from: [-1, 0], dist: 0.9 });
    await waitPanel(true);
    for (const k of ['3', '1', '2']) {
      await page.keyboard.press(k);
      await sleep(150);
    }
    await waitPanel(false);
    await waitRecap('festival');
    if (!(await state()).flags.festivalAnnouncedWell) throw new Error('방송 순서 플래그 없음');
  });

  await step('사건1_새로고침_이어하기', async () => {
    // 축제로 끝난 뒤 사건 2(청소 로봇)로 넘어가 체크포인트가 남았다 → 새로고침해도 사건 2부터
    await page.reload();
    await page.waitForFunction(() => window.__sim, null, { timeout: 120000 });
    const label = await page.getByText(/이어하기/).textContent();
    if (!label.includes('사건 2')) throw new Error('이어하기 버튼 이름 이상: ' + label);
    await page.getByText(/이어하기/).click();
    await sleep(1500);
    const s = await state();
    if (s.period !== 'robot' || s.cafeteria !== 'festival') throw new Error('이어하기 상태 이상: ' + JSON.stringify(s));
    await noDialogue();
  });

  // ───── 사건 2: 청소 로봇 — 세 가지 경로 ─────
  const robotSt = () =>
    page.evaluate(() => {
      const st = window.__sim.story.robot.st;
      const r = window.__sim.game.robot;
      return { bin: st.bin.map((b) => b.id), claw: st.clawItem && { id: st.clawItem.id, cat: st.clawItem.cat }, hand: st.hand.map((h) => ({ id: h.id, owner: h.owner })), mode: r.mode, pos: [r.pos.x, r.pos.z], remote: !!window.__sim.game.remote };
    });
  async function restartRobot() {
    await page.evaluate(() => {
      const g = window.__sim.game;
      g.running = true;
      g.hud.show(true);
      const scr = document.querySelector('.screen');
      if (scr) scr.parentNode.removeChild(scr);
      window.__sim.skipTo('robot');
    });
    await sleep(800);
    await noDialogue();
  }
  async function waitRobot(sol) {
    // 로봇이 스스로 물건을 옮기는 시간은 게임 시간 기준이라, 소프트웨어 렌더링(초당 5~7프레임)에서는 실제로 오래 걸린다
    const t0 = Date.now();
    await waitFor('사건 2 해결 ' + sol, (s) => s.results?.robot === sol && s.period === 'dodgeball', 300000);
    await noDialogue();
    log('사건 2 → ' + sol + `, 사건 3으로 넘어감 (${Math.round((Date.now() - t0) / 1000)}초)`);
  }
  const COMP_Z = { books: -4.0, tools: -3.4, paper: -2.8 };

  await step('사건2_A_원격_조종', async () => {
    await restartRobot();
    await act('robotPad', 'KeyE', '조종', { from: [-1, 0], dist: 0.9 });
    let rs = await robotSt();
    if (!rs.remote || rs.mode !== 'remote') throw new Error('조종 모드 아님');
    // 실제 키로 조금 움직여 보기
    const p0 = rs.pos;
    await page.keyboard.down('KeyW');
    await sleep(700);
    await page.keyboard.up('KeyW');
    rs = await robotSt();
    if (Math.hypot(rs.pos[0] - p0[0], rs.pos[1] - p0[1]) < 0.2) throw new Error('W로 로봇이 안 움직임');
    // 나르기: 수거함 앞 ↔ 보관함 칸 앞 (이동은 순간이동, 집게는 실제 Space)
    for (let n = 0; n < 12; n++) {
      rs = await robotSt();
      if (!rs.bin.length && !rs.claw) break;
      await page.evaluate(() => window.__sim.game.robot.place(5.3, 4.85, 0));
      await frames(2);
      await page.keyboard.press('Space');
      await frames(3);
      rs = await robotSt();
      if (!rs.claw) throw new Error('수거함에서 못 집음: ' + JSON.stringify(rs));
      // 일부러 한 번은 틀린 칸
      if (n === 0) {
        const wrong = rs.claw.cat === 'books' ? 'tools' : 'books';
        await page.evaluate((z) => window.__sim.game.robot.place(5.95, z, Math.PI / 2), COMP_Z[wrong]);
        await frames(2);
        await page.keyboard.press('Space');
        await frames(3);
        if (!(await robotSt()).claw) throw new Error('틀린 칸인데 놓아짐');
      }
      await page.evaluate((z) => window.__sim.game.robot.place(5.95, z, Math.PI / 2), COMP_Z[rs.claw.cat]);
      await frames(2);
      await page.keyboard.press('Space');
      await frames(3);
      if ((await robotSt()).claw) throw new Error('맞는 칸인데 안 놓아짐');
    }
    await waitRobot('remote');
  });

  await step('사건2_B_청소_금지_구역', async () => {
    await restartRobot();
    for (const z of ['desk', 'board', 'locker']) {
      await act('coneBox', 'KeyE', '고깔', { from: [-1, -1], dist: 0.9 });
      await selectItem('zoneCone');
      await act('zone_' + z, 'KeyF', '고깔 놓기', { from: [1, -1], dist: 0.6 });
    }
    await act('robotPad', 'KeyE', '저장', { from: [-1, 0], dist: 0.9 });
    await waitRobot('zones');
    if (!(await state()).flags.robotReprogrammed) throw new Error('robotReprogrammed 없음');
  });

  await step('사건2_C_비상정지', async () => {
    await restartRobot();
    for (const [id, name] of [['seoa', '서아'], ['junho', '준호'], ['harin', '하린']]) {
      await act('npc:' + id, 'KeyE', name, { from: [0, 1], dist: 0.8 });
      await noDialogue();
    }
    await act('robotBody', 'KeyE', '숫자판', { from: [-1, -1], dist: 1.0 });
    await waitPanel(true);
    for (const k of ['9', '9', '9']) await page.keyboard.press(k); // 틀린 코드
    await sleep(1200);
    for (const k of ['4', '1', '7']) {
      await page.keyboard.press(k);
      await sleep(120);
    }
    await waitPanel(false);
    await noDialogue();
    if ((await robotSt()).mode !== 'stopped') throw new Error('로봇이 안 멈춤');
    const target = { seoa: 'npc:seoa', junho: 'npc:junho', harin: 'npc:harin', minjae: 'npc:minjae', filler0: 'filler:0', filler1: 'filler:1' };
    for (let n = 0; n < 12; n++) {
      let rs = await robotSt();
      if (!rs.bin.length && !rs.hand.length) break;
      if (rs.bin.length) {
        await act('robotBin', 'KeyE', '꺼내기', { from: [1, -1], dist: 0.9 });
        rs = await robotSt();
      }
      for (const h of rs.hand) {
        await selectItem(h.id);
        await act(target[h.owner], 'KeyF', '돌려주기', { from: [0, 1], dist: 0.8 });
      }
    }
    await waitRobot('stopcode');
  });

  // ───── 사건 3: 초대형 피구공 — 세 가지 경로 ─────
  const dodgeSt = () =>
    page.evaluate(() => {
      const ev = window.__sim.story.dodge;
      return { parts: ev.st.parts, launches: ev.st.launches, rolling: !!ev.st.rolling, goals: ev.st.goals, ball: [ev.ball.x, ev.ball.z], rules: ev.st.rules };
    });
  async function restartDodge(fixed = false) {
    await page.evaluate((fx) => {
      const g = window.__sim.game;
      g.running = true;
      g.hud.show(true);
      const scr = document.querySelector('.screen');
      if (scr) scr.parentNode.removeChild(scr);
      if (fx) g.save.flags.fixedMachine = true;
      else delete g.save.flags.fixedMachine;
      window.__sim.skipTo('dodgeball');
    }, fixed);
    await sleep(800);
    await noDialogue();
  }
  async function waitDodge(sol) {
    await waitFor('사건 3 해결 ' + sol, (s) => s.results?.dodgeball === sol && s.period === 'hallway', 150000);
    await noDialogue();
    log('사건 3 → ' + sol + ', 사건 4로 넘어감');
  }

  await step('사건3_A_발사_실험', async () => {
    await restartDodge();
    if ((await state()).inventory.includes('sizeRemote')) throw new Error('기계를 안 고쳤는데 리모컨이 생김');
    for (const part of ['standPart', 'rampPart', 'padPart']) {
      await act('gymParts', 'KeyE', '꺼내기', { from: [-1, 0], dist: 1.0 });
      await selectItem(part);
      await act('launcher', 'KeyF', '설치', { from: [1, 0], dist: 0.9 });
    }
    if ((await dodgeSt()).parts !== 3) throw new Error('발사대 조립 안 됨');
    // 1차: 똑바로 → 뜀틀에 걸려 실패, 공이 돌아온다
    await act('launcher', 'KeyE', '발사대', { from: [1, 0], dist: 0.9 });
    await waitPanel(true);
    await page.keyboard.press('Space');
    await waitPanel(false);
    await waitFor('공 돌아옴', () => true, 1000);
    for (let i = 0; i < 80; i++) {
      const d = await dodgeSt();
      if (!d.rolling && Math.abs(d.ball[0] - 9) < 0.01 && d.launches === 1) break;
      await sleep(250);
    }
    // 2차: 북쪽 30° · 힘 8
    await act('launcher', 'KeyE', '발사대', { from: [1, 0], dist: 0.9 });
    await waitPanel(true);
    for (let i = 0; i < 6; i++) await page.keyboard.press('KeyA');
    for (let i = 0; i < 3; i++) await page.keyboard.press('KeyW');
    await page.keyboard.press('Space');
    await waitPanel(false);
    await waitDodge('physics');
  });

  await step('사건3_B_크기_조절_리모컨', async () => {
    await restartDodge(true);
    if (!(await state()).inventory.includes('sizeRemote')) throw new Error('리모컨을 못 받음');
    await selectItem('sizeRemote');
    await act('giantBall', 'KeyF', '리모컨', { from: [0, 1], dist: 2.0 });
    await waitPanel(true);
    await page.keyboard.press('1');
    await sleep(150);
    await page.keyboard.press('2');
    await waitPanel(false);
    for (let i = 0; i < 40 && !(await page.evaluate(() => window.__sim.game.items.has('dball'))); i++) await sleep(200);
    await act('item:dball', 'KeyE', '피구공', { from: [0, 1], dist: 0.8 });
    await selectItem('dodgeball');
    await act('ballCart', 'KeyF', '넣기', { from: [1, 0], dist: 0.9 });
    await waitDodge('shrink');
  });

  await step('사건3_C_새_경기', async () => {
    await restartDodge();
    await act('ruleBoard', 'KeyE', '규칙', { from: [0, 1], dist: 0.3 });
    await waitPanel(true);
    for (const k of ['5', '1', '3']) await page.keyboard.press(k); // 「친구 맞히기」는 거절된다
    await page.keyboard.press('Enter');
    await sleep(400);
    if (!(await panelOpen())) throw new Error('위험한 규칙이 통과됨');
    await page.keyboard.press('5');
    await page.keyboard.press('2');
    await page.keyboard.press('Enter');
    await waitPanel(false);
    await noDialogue();
    if ((await dodgeSt()).rules.length !== 3) throw new Error('규칙 저장 안 됨');
    // 실제 W 키로 공을 밀기: 북쪽 골, 그다음 동쪽 골
    const pushes = [
      { goals: 1, from: [9, -21.0], yaw: 0 },
      { goals: 2, from: [6.9, -23], yaw: -Math.PI / 2 },
    ];
    for (const p of pushes) {
      await page.evaluate(([x, z, yaw]) => {
        const g = window.__sim.game;
        g.player.teleport(x, z, yaw + Math.PI);
        g.tpc.yaw = yaw;
      }, [...p.from, p.yaw]);
      await page.keyboard.down('KeyW');
      for (let i = 0; i < 120 && (await dodgeSt()).goals < p.goals; i++) {
        await page.evaluate((yaw) => (window.__sim.game.tpc.yaw = yaw), p.yaw);
        await sleep(250);
      }
      await page.keyboard.up('KeyW');
      if ((await dodgeSt()).goals < p.goals) throw new Error('골 실패: ' + JSON.stringify(await dodgeSt()));
      await sleep(600);
    }
    await waitDodge('sport');
    if (!(await state()).flags.newSportInvented) throw new Error('newSportInvented 없음');
  });

  // ───── 사건 4: 끝나지 않는 쉬는 시간 ─────
  await step('사건4_무한_복도', async () => {
    await page.evaluate(() => {
      const g = window.__sim.game;
      g.running = true;
      g.hud.show(true);
      const scr = document.querySelector('.screen');
      if (scr) scr.parentNode.removeChild(scr);
      window.__sim.skipTo('hallway');
    });
    await sleep(800);
    await noDialogue();
    const hs = () => page.evaluate(() => { const st = window.__sim.story.hallway.st; return { cards: st.cards.size, tapes: st.tapes.size, loops: st.loops, tries: st.tries }; });
    // 방송 테이프 하나
    await act('tape0', 'KeyE', '테이프', { from: [-1, 0], dist: 0.8 });
    await waitPanel(true);
    await page.keyboard.press('Enter');
    await waitPanel(false);
    // 카드 없이 복원판 → 안내만
    await act('timeBoard', 'KeyE', '복원판', { from: [1, 0], dist: 0.6 });
    if (await panelOpen()) throw new Error('카드 없이 복원판이 열림');
    // 시간 문 여섯 개
    for (const id of ['group', 'lunch', 'korean', 'art', 'math', 'break']) {
      await act('timeDoor_' + id, 'KeyE', '문', { from: [0, 1], dist: 0.6 });
      await waitPanel(true);
      await page.keyboard.press('Enter');
      await waitPanel(false);
    }
    if ((await hs()).cards !== 6) throw new Error('카드 6장이 안 모임');
    // 무한 복도: 북쪽 끝까지 걸어가면 남쪽 끝으로
    await page.evaluate(() => {
      const g = window.__sim.game;
      g.player.teleport(9, 14.2, 0);
      g.tpc.yaw = Math.PI;
    });
    await page.keyboard.down('KeyW');
    for (let i = 0; i < 40 && (await hs()).loops < 1; i++) await sleep(150);
    await page.keyboard.up('KeyW');
    if ((await hs()).loops < 1) throw new Error('무한 복도 안 됨');
    const z = (await state()).pos[1];
    if (z > 0) throw new Error('반대쪽 끝으로 안 옮겨짐: ' + z);
    // 1차: 문 순서 그대로(틀림) → 복도 처음으로
    await act('timeBoard', 'KeyE', '복원판', { from: [1, 0], dist: 0.6 });
    await waitPanel(true);
    for (const k of ['1', '2', '3', '4', '5', '6']) await page.keyboard.press(k);
    await page.keyboard.press('Enter');
    await waitPanel(false);
    await noDialogue();
    if ((await hs()).tries !== 1) throw new Error('틀린 시도 기록 안 됨');
    // 2차: 국어(3) 쉬는(6) 수학(5) 모둠(1) 미술(4) 점심(2)
    await act('timeBoard', 'KeyE', '복원판', { from: [1, 0], dist: 0.6 });
    await waitPanel(true);
    for (const k of ['3', '6', '5', '1', '4', '2']) await page.keyboard.press(k);
    await page.keyboard.press('Enter');
    await waitPanel(false);
    await waitFor('시간 복원 → 최종 사건', (s) => s.flags.timeRestored && s.period === 'final', 90000);
    await noDialogue();
    log('사건 4 해결 → 최종 사건으로 넘어감');
  });

  // ───── 최종 사건 + 엔딩 3종 ─────
  async function restartFinal(flags) {
    await page.evaluate((fl) => {
      const g = window.__sim.game;
      g.running = true;
      g.hud.show(true);
      const scr = document.querySelector('.screen');
      if (scr) scr.parentNode.removeChild(scr);
      for (const k of ['pencilReturned', 'helpedDevice', 'returnedGlue', 'sharedFairly', 'festivalHeld', 'foundBroadcastLog']) delete g.save.flags[k];
      for (const k of fl) g.save.flags[k] = true;
      window.__sim.skipTo('final');
    }, flags);
    await sleep(800);
    await noDialogue();
  }
  async function collectRecords() {
    for (const [id, from] of [['teacherLaptop', [0, 1]], ['kiosk', [-1, 0]], ['broadcastLaptop', [-1, 0]]]) {
      await act(id, 'KeyE', '컴퓨터', { from, dist: 0.5 });
      await waitPanel(true);
      await page.keyboard.press('Enter');
      await waitPanel(false);
    }
  }
  async function fixMatch(wrongFirst) {
    if (wrongFirst) {
      await act('aiConsole', 'KeyE', '해석', { from: [0, -1], dist: 0.4 });
      await waitPanel(true);
      for (const k of ['1', 'B', '2', 'B', '3', 'B', '4', 'B']) await page.keyboard.press(k);
      await page.keyboard.press('Enter');
      await waitPanel(false);
      await noDialogue();
      if ((await state()).flags.aiCorrected) throw new Error('틀린 짝인데 통과');
    }
    await act('aiConsole', 'KeyE', '해석', { from: [0, -1], dist: 0.4 });
    await waitPanel(true);
    for (const k of ['1', 'C', '2', 'E', '3', 'D', '4', 'A']) await page.keyboard.press(k);
    await page.keyboard.press('Enter');
    await waitPanel(false);
    await noDialogue();
    if (!(await state()).flags.aiCorrected) throw new Error('짝짓기 통과 못 함');
  }
  async function setCriteria(wrongFirst) {
    if (wrongFirst) {
      await act('aiConsole', 'KeyE', '기준', { from: [0, -1], dist: 0.4 });
      await waitPanel(true);
      await page.keyboard.press('Enter'); // 학교 삭제 계획 그대로 → AI가 되묻는다
      await waitPanel(false);
      await noDialogue();
    }
    await act('aiConsole', 'KeyE', '기준', { from: [0, -1], dist: 0.4 });
    await waitPanel(true);
    for (const k of ['1', '2', '2', '3']) await page.keyboard.press(k); // 공간 유지 · 15분 · 안전하고 즐거운 수업
    await page.keyboard.press('Enter');
    await waitPanel(false);
  }
  async function waitEnding(letter, must) {
    for (let i = 0; i < 60 && !(await page.$('.ending-epilogue')); i++) {
      if ((await state()).dialogue) await page.keyboard.press('Enter');
      await sleep(400);
    }
    await page.waitForSelector('.ending-epilogue', { timeout: 5000 });
    const title = await page.locator('.title-main').textContent();
    const epi = await page.locator('.ending-epilogue').textContent();
    if (!title.includes('엔딩 ' + letter)) throw new Error('엔딩 이상: ' + title);
    if (!epi.includes(must)) throw new Error(`엔딩 ${letter} 뒤 이야기에 「${must}」 없음: ${epi}`);
    log(title + ' — ' + epi.slice(0, 60) + '…');
  }

  await step('최종_엔딩B_조금_나아진_학교', async () => {
    await restartFinal(['pencilReturned']);
    await act('aiConsole', 'KeyE', '패널', { from: [0, -1], dist: 0.4 });
    if (await panelOpen()) throw new Error('기록 없이 패널이 열림');
    await collectRecords();
    await fixMatch(true);
    await setCriteria(true);
    await waitEnding('B', '15분');
  });

  await step('최종_엔딩C_전설의_학교', async () => {
    await restartFinal(['pencilReturned', 'helpedDevice', 'returnedGlue', 'sharedFairly', 'foundBroadcastLog']);
    await collectRecords();
    await fixMatch(false);
    await setCriteria(false);
    await waitEnding('C', '비밀 놀이 공간');
  });

  await step('최종_엔딩A_평범한_학교', async () => {
    await restartFinal([]);
    await collectRecords();
    await fixMatch(false);
    await act('resetButton', 'KeyE', '초기화', { from: [-1, 0], dist: 0.6 });
    await noDialogue();
    if ((await state()).results?.ending) throw new Error('한 번 눌렀는데 바로 초기화됨');
    await act('resetButton', 'KeyE', '정말', { from: [-1, 0], dist: 0.6 });
    await waitEnding('A', '08:25');
  });

  await step('엔딩_후_이어하기', async () => {
    await page.reload();
    await page.waitForFunction(() => window.__sim, null, { timeout: 120000 });
    const label = await page.getByText(/이어하기/).textContent();
    if (!label.includes('엔딩 A')) throw new Error('이어하기 버튼 이름 이상: ' + label);
    await page.getByText(/이어하기/).click();
    await sleep(1500);
    const s = await state();
    if (s.period !== 'final' || s.results?.ending) throw new Error('최종 사건 다시 하기 상태 이상: ' + JSON.stringify(s));
    await noDialogue();
  });

  await step('다른_역할_자료조사', async () => {
    await page.evaluate(() => { window.__sim.game.running = true; window.__sim.game.hud.show(true); document.querySelector('.screen')?.remove(); window.__sim.game.save.groupRole = null; window.__sim.game.save.flags.groupDone = false; window.__sim.skipTo('group'); });
    await waitFor('모이기', (s) => s.phase === 'gather', 30000);
    await page.evaluate(() => window.__sim.teleport(1.2, 3.3));
    await waitFor('역할 고르기', (s) => s.phase === 'pickRole', 30000);
    await act('item:role_researcher', 'KeyE', '자료', { from: [0, -1] });
    await waitFor('역할', (s) => s.role === 'researcher');
    for (const id of ['bulletin', 'board', 'bookshelf']) {
      await act(id, 'KeyE', '조사');
      await waitPanel(true);
      await page.keyboard.press('Enter');
      await waitPanel(false);
    }
    await act('groupTable', 'KeyE', '알려 주기', { from: [0, -1] });
    await waitFor('모둠 끝', (s) => s.flags.groupDone && s.flags.foundAIManual, 60000);
  });

  await step('다른_역할_정리', async () => {
    await page.evaluate(() => { window.__sim.game.save.groupRole = null; window.__sim.game.save.flags.groupDone = false; window.__sim.skipTo('group'); });
    await page.evaluate(() => window.__sim.teleport(1.2, 3.3));
    await waitFor('역할 고르기', (s) => s.phase === 'pickRole', 30000);
    await act('item:role_organizer', 'KeyE', '정리', { from: [0, -1] });
    await waitFor('역할', (s) => s.role === 'organizer');
    const bins = { scissors: 'binCut', ruler: 'binCut', glueStick: 'binStick', tape: 'binStick', colorPaperPack: 'binPaper', markers: 'binPaper' };
    // 일부러 틀린 바구니에 한 번
    await act('item:org_scissors', 'KeyE', '가위', { from: [-1, 0] });
    await selectItem('scissors');
    await act('binPaper', 'KeyF', '넣기');
    let s = await state();
    if (!s.inventory.includes('scissors')) throw new Error('틀린 바구니에 들어감');
    for (const [item, bin] of Object.entries(bins)) {
      if (item !== 'scissors') await act('item:org_' + item, 'KeyE', '줍기', { from: [-1, 0] });
      await selectItem(item);
      await act(bin, 'KeyF', '넣기');
    }
    await waitFor('모둠 끝', (s) => s.flags.groupDone);
  });

  await step('다른_역할_발표', async () => {
    await page.evaluate(() => { window.__sim.game.save.groupRole = null; window.__sim.game.save.flags.groupDone = false; window.__sim.skipTo('group'); });
    await page.evaluate(() => window.__sim.teleport(1.2, 3.3));
    await waitFor('역할 고르기', (s) => s.phase === 'pickRole', 30000);
    await act('item:role_speaker', 'KeyE', '발표', { from: [0, -1] });
    await waitFor('역할', (s) => s.role === 'speaker');
    await act('groupTable', 'KeyE', '발표');
    await waitPanel(true);
    for (const k of ['Digit2', 'Digit3', 'Digit1']) await page.keyboard.press(k);
    await waitPanel(false);
    await waitFor('모둠 끝', (s) => s.flags.groupDone, 60000);
  });

  await step('미술_종이비행기_경로', async () => {
    await page.evaluate(() => { const f = window.__sim.game.save.flags; for (const k of ['pickedArt', 'crafted', 'exhibited', 'artPoster', 'artPlane']) delete f[k]; window.__sim.skipTo('art'); });
    await waitFor('만들기 단계', (s) => s.phase === 'craft', 30000);
    await act('item:stack', 'KeyE', '색종이');
    await selectItem('colorPaper');
    await act('seat', 'KeyF', '종이비행기');
    await waitPanel(true);
    for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp']) { await page.keyboard.press(k); await sleep(80); }
    await waitPanel(false);
    await waitFor('비행기 완성', (s) => s.inventory.includes('paperPlane') && s.flags.artPlane);
  });

  await step('메뉴_복구_설정', async () => {
    await page.evaluate(() => {
      const f = window.__sim.game.save.flags;
      for (const k of Object.keys(f)) delete f[k];
      window.__sim.game.inventory.load([]);
      window.__sim.skipTo('math');
    });
    await waitFor('태블릿 단계', (s) => s.phase === 'tablet', 30000);
    await act('tabletCart', 'KeyE', '태블릿');
    await selectItem('tablet');
    await page.keyboard.press('KeyF'); // 아무 데나 내려놓기
    await sleep(300);
    let s = await state();
    if (s.inventory.includes('tablet')) throw new Error('F로 내려놓지 못함');
    await page.keyboard.press('Escape');
    await page.getByText('잠깐 멈춤').waitFor({ timeout: 3000 });
    await page.getByText('필요한 물건 다시 챙기기').click();
    s = await state();
    if (!s.inventory.includes('tablet')) throw new Error('물건 복구 안 됨');
    await page.keyboard.press('Escape');
    await page.getByText('자리로 돌아가기 (길을 잃었을 때)').click();
    s = await state();
    if (!s.seated) throw new Error('자리로 돌아가기 안 됨');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '설정' }).click();
    await page.locator('select').first().selectOption('mid');
    await page.getByRole('button', { name: '확인' }).click();
    await page.getByRole('button', { name: '계속하기' }).click();
    const q = await page.evaluate(() => window.__sim.game.settings.quality);
    if (q !== 'mid') throw new Error('설정 반영 안 됨');
    await page.evaluate(() => {
      window.__sim.game.settings.quality = 'low';
      window.__sim.game.applySettings();
    });
  });

  await step('아무것도_안_해도_진행', async () => {
    // 교시마다 시간 제한이 지나면 선생님·친구가 정리해 주고 다음으로 넘어가야 한다
    for (const [from, to] of [['arrival', 'korean'], ['korean', 'break'], ['math', 'group'], ['group', 'art'], ['art', 'lunch']]) {
      await page.evaluate((p) => {
        const s = window.__sim.game.save;
        for (const k of Object.keys(s.flags)) delete s.flags[k];
        s.groupRole = null;
        s.inventory = ['bag'];
        window.__sim.game.inventory.load(['bag']);
        window.__sim.skipTo(p);
        window.__sim.teleport(9, -11);
      }, from);
      const t0 = Date.now();
      for (;;) {
        const s = await state();
        if (s.period === to) break;
        if (Date.now() - t0 > 120000) throw new Error(`${from}에서 멈춤: ${JSON.stringify(s)}`);
        await page.evaluate(() => (window.__sim.story.t += 20));
        if (s.dialogue) await page.keyboard.press('Enter');
        await sleep(300);
      }
      log(`${from} → ${to} 자동 진행`);
    }
  });

  const fps = (await state()).fps;
  log('FPS(소프트웨어 렌더링 기준)', fps);
} catch (e) {
  failed = true;
  console.log(e.stack || e);
} finally {
  if (errors.length) {
    failed = true;
    console.log('콘솔 오류:', errors);
  } else console.log('콘솔 오류 0개');
  await browser.close();
  server.kill();
  console.log(failed ? '\n결과: 실패' : '\n결과: 모두 통과');
  process.exit(failed ? 1 : 0);
}
