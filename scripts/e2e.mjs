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
  await page.keyboard.press(key);
  await sleep(250);
  log(`${key === 'KeyE' ? 'E' : 'F'} → ${label}`);
}
async function npcIdle(id) {
  for (let i = 0; i < 100; i++) {
    if (await page.evaluate((n) => window.__sim.game.npcs[n].path.length === 0, id)) return;
    await sleep(100);
  }
}
async function selectItem(item) {
  const s = await state();
  const idx = await page.evaluate((it) => window.__sim.game.inventory.slots.indexOf(it), item);
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
    await waitFor('비행기 착지', () => true, 100);
    await sleep(4000);
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
    await waitFor('해결', (s) => s.cafeteria === sol, 90000);
    for (let i = 0; i < 60 && !(await page.$('.recap')); i++) {
      if ((await state()).dialogue) await page.keyboard.press('Enter');
      await sleep(400);
    }
    await page.waitForSelector('.recap', { timeout: 5000 });
    log((await page.locator('.recap li').allTextContents()).join(' | '));
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
    await page.reload();
    await page.waitForFunction(() => window.__sim, null, { timeout: 120000 });
    // 저장에는 축제 결과가 남아 있고, 이어하기는 「사건 1 끝 · 다시 해 보기」로 사건을 처음부터 다시 연다
    const label = await page.getByText(/이어하기/).textContent();
    if (!label.includes('사건 1 끝')) throw new Error('이어하기 버튼 이름 이상: ' + label);
    await page.getByText(/이어하기/).click();
    await sleep(1500);
    const s = await state();
    if (s.period !== 'cutlet' || s.cafeteria !== null || !s.flags.chapter1Done) throw new Error('다시 하기 상태 이상: ' + JSON.stringify(s));
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
