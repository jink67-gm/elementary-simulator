// 터치 기기 자동 테스트: 태블릿(터치만)으로 시작부터 등교 첫 퀘스트까지 손가락 입력만으로 진행하고,
// 여러 화면 크기(태블릿·크롬북·웨일북·노트북)에서 화면을 찍는다.
// 사용: npm run build && npm run e2e:touch
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

const OUT = 'test-results/devices';
mkdirSync(OUT, { recursive: true });
const PORT = 4181;
const URL = `http://localhost:${PORT}/elementary-simulator/?debug`;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const CROS_UA = 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let failed = false;
const log = (...a) => console.log('  ', ...a);

async function newPage(opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    if (!localStorage.getItem('elementary-simulator.settings.v1')) localStorage.setItem('elementary-simulator.settings.v1', JSON.stringify({ quality: 'low' }));
  });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return { ctx, page, errors };
}

/** 시작 화면 → 캐릭터 → 알람 → 등교 (손가락 톡만) */
async function startByTap(page) {
  await page.goto(URL);
  await page.waitForFunction(() => !!window.__sim, null, { timeout: 120000 });
  await page.waitForTimeout(800);
  await page.getByText('새로 시작').tap();
  await page.locator('.look-card').nth(1).tap();
  await page.getByText('학교 갈 준비 완료!').tap();
  await page.getByText('일어나기').tap();
  await page.waitForFunction(() => window.__sim.state().period === 'arrival', null, { timeout: 60000 });
}

const state = (page) => page.evaluate(() => window.__sim.state());
/** 대사가 끝날 때까지 대화창을 톡 */
async function tapThroughDialogue(page, timeout = 60000) {
  const t0 = Date.now();
  while ((await state(page)).dialogue) {
    if (Date.now() - t0 > timeout) throw new Error('대사가 안 끝남');
    if (await page.$('.dialogue:not(.hidden)')) await page.locator('.dialogue').tap({ force: true });
    await page.waitForTimeout(250);
  }
}
async function until(page, desc, fn, timeout = 30000) {
  const t0 = Date.now();
  for (;;) {
    const s = await state(page);
    if (fn(s)) return s;
    if (Date.now() - t0 > timeout) throw new Error(`시간 초과: ${desc} ${JSON.stringify(s).slice(0, 300)}`);
    await page.waitForTimeout(200);
  }
}

async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    console.log(`✓ ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    failed = true;
    console.log(`✗ ${name}: ${e.message}`);
  }
}

// ───────── 1. 태블릿 (터치만): 손가락으로 실제 플레이 ─────────
{
  const { page, errors, ctx } = await newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true, userAgent: IPAD_UA, deviceScaleFactor: 1 });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });

  await step('태블릿: 톡으로 시작', async () => {
    await startByTap(page);
    if (!(await page.evaluate(() => document.body.classList.contains('touch')))) throw new Error('터치 모드가 아님');
    await page.waitForSelector('.touch-ui:not(.hidden)', { timeout: 20000 });
    await page.screenshot({ path: `${OUT}/tablet_start.png` });
  });

  await step('태블릿: 조이스틱으로 걷기', async () => {
    await tapThroughDialogue(page);
    const a = (await state(page)).pos;
    await touch('touchStart', [[110, 700]]);
    for (let i = 0; i < 12; i++) {
      await touch('touchMove', [[110, 700 - Math.min(70, 10 + i * 10)]]);
      await page.waitForTimeout(150);
    }
    await page.screenshot({ path: `${OUT}/tablet_joystick.png` });
    await touch('touchEnd', []);
    const b = (await state(page)).pos;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    log(`조이스틱 이동 거리 ${d.toFixed(2)}m`);
    if (d < 0.8) throw new Error('조이스틱으로 안 움직임');
    const stick = await page.evaluate(() => [window.__sim.game.input.stickX, window.__sim.game.input.stickY]);
    if (stick[0] || stick[1]) throw new Error('손을 뗐는데 조이스틱 값이 남음');
  });

  await step('태블릿: 오른쪽 끌어 둘러보기 + 두 손가락 확대', async () => {
    const y0 = await page.evaluate(() => window.__sim.game.tpc.yaw);
    await touch('touchStart', [[800, 400]]);
    for (let i = 1; i <= 6; i++) {
      await touch('touchMove', [[800 + i * 30, 400]]);
      await page.waitForTimeout(80);
    }
    await touch('touchEnd', []);
    await page.waitForTimeout(400);
    const y1 = await page.evaluate(() => window.__sim.game.tpc.yaw);
    log(`둘러보기 yaw ${y0.toFixed(2)} → ${y1.toFixed(2)}`);
    if (Math.abs(y1 - y0) < 0.2) throw new Error('끌어도 카메라가 안 돎');
    const d0 = await page.evaluate(() => window.__sim.game.tpc.dist);
    await touch('touchStart', [[700, 400], [760, 400]]);
    for (let i = 1; i <= 6; i++) {
      await touch('touchMove', [[700 - i * 25, 400], [760 + i * 25, 400]]);
      await page.waitForTimeout(80);
    }
    await touch('touchEnd', []);
    await page.waitForTimeout(400);
    const d1 = await page.evaluate(() => window.__sim.game.tpc.dist);
    log(`두 손가락 벌리기: 카메라 거리 ${d0.toFixed(1)} → ${d1.toFixed(1)}`);
    if (!(d1 < d0)) throw new Error('벌려도 가까워지지 않음');
  });

  await step('태블릿: E 버튼으로 줍기, 소지품 톡, F 버튼으로 돌려주기', async () => {
    await page.evaluate(() => window.__sim.goto('item:pencil', 0.7));
    await until(page, '필통 포커스', (s) => s.focus?.e?.includes('줍기'));
    await page.waitForTimeout(300);
    const label = await page.locator('.tb-e .tb-label').textContent();
    log(`E 버튼 이름: "${label}"`);
    if (!label.includes('줍기')) throw new Error('E 버튼 이름이 상황을 안 따라감');
    await page.screenshot({ path: `${OUT}/tablet_prompt.png` });
    await page.locator('.tb-e').tap();
    await until(page, '필통 주움', (s) => s.inventory.includes('pencilCase'));
    await tapThroughDialogue(page);
    // 소지품 칸 톡으로 고르기
    const idx = (await state(page)).inventory.indexOf('pencilCase');
    await page.locator('.inventory .slot').nth(idx).tap();
    await until(page, '필통 듦', (s) => s.held === 'pencilCase');
    await page.evaluate(() => window.__sim.goto('npc:junho', 0.7));
    await until(page, '준호 F 포커스', (s) => s.focus?.f?.includes('필통'));
    await page.waitForTimeout(300);
    if ((await page.locator('.tb-f').getAttribute('class')).includes('hidden')) throw new Error('F 버튼이 안 보임');
    await page.locator('.tb-f').tap();
    await until(page, '필통 돌려줌', (s) => s.flags.pencilReturned);
    await page.screenshot({ path: `${OUT}/tablet_dialogue.png` });
    await tapThroughDialogue(page);
  });

  await step('태블릿: 점프 버튼', async () => {
    const y0 = await page.evaluate(() => window.__sim.game.player.pos.y);
    await page.locator('.tb-space').tap();
    let top = y0;
    for (let i = 0; i < 10; i++) {
      top = Math.max(top, await page.evaluate(() => window.__sim.game.player.pos.y));
      await page.waitForTimeout(60);
    }
    log(`점프 높이 ${(top - y0).toFixed(2)}m`);
    if (top - y0 < 0.05) throw new Error('점프 안 됨');
  });

  await step('태블릿: 메뉴 버튼 → 터치 도움말 → 계속하기', async () => {
    await page.locator('.tb-menu').tap();
    await page.waitForSelector('.panel-wrap', { timeout: 10000 });
    if (!(await page.locator('.touch-help').isVisible())) throw new Error('터치 도움말이 안 보임');
    if (await page.locator('.kb-help').isVisible()) throw new Error('키보드 도움말이 터치에서 보임');
    if (await page.locator('.tb-e').isVisible()) throw new Error('창이 열렸는데 터치 버튼이 그대로');
    await page.screenshot({ path: `${OUT}/tablet_menu.png` });
    await page.getByText('계속하기').tap();
    await page.waitForSelector('.panel-wrap', { state: 'detached', timeout: 10000 });
  });

  await step('태블릿: 세로로 돌리면 안내', async () => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.waitForTimeout(500);
    if (!(await page.locator('.rotate-hint').isVisible())) throw new Error('세로 안내가 안 보임');
    await page.screenshot({ path: `${OUT}/tablet_portrait.png` });
    await page.setViewportSize({ width: 1180, height: 820 });
  });

  await step('태블릿: 키보드를 연결해 누르면 키보드 모드로', async () => {
    await page.keyboard.press('KeyW');
    await page.waitForTimeout(300);
    if (await page.evaluate(() => document.body.classList.contains('touch'))) throw new Error('키보드로 안 바뀜');
    await page.locator('canvas').tap({ position: { x: 600, y: 300 } });
    await page.waitForTimeout(300);
    if (!(await page.evaluate(() => document.body.classList.contains('touch')))) throw new Error('다시 터치로 안 바뀜');
  });
  if (errors.length) {
    failed = true;
    console.log('✗ 콘솔 오류:', errors.slice(0, 5));
  }
  await ctx.close();
}

// ───────── 2. 화면 크기별 모습 ─────────
const SHOTS = [
  { name: 'galaxytab_1280x800_touch', viewport: { width: 1280, height: 800 }, touch: true, ua: 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
  { name: 'small_tablet_1024x600_touch', viewport: { width: 1024, height: 600 }, touch: true, ua: IPAD_UA },
  { name: 'chromebook_1366x768', viewport: { width: 1366, height: 768 }, touch: false, ua: CROS_UA },
  { name: 'whalebook_1280x720', viewport: { width: 1280, height: 720 }, touch: false, ua: CROS_UA },
  { name: 'laptop_1920x1080', viewport: { width: 1920, height: 1080 }, touch: false },
];
for (const d of process.env.ONLY_TABLET ? [] : SHOTS) {
  await step(`화면: ${d.name}`, async () => {
    const { page, errors, ctx } = await newPage({ viewport: d.viewport, hasTouch: d.touch, isMobile: d.touch, userAgent: d.ua, deviceScaleFactor: 1 });
    await page.goto(URL);
    await page.waitForFunction(() => !!window.__sim, null, { timeout: 120000 });
    await page.waitForTimeout(500);
    const click = (loc) => (d.touch ? loc.tap() : loc.click());
    await page.screenshot({ path: `${OUT}/${d.name}_title.png` });
    await click(page.getByText('새로 시작'));
    await click(page.getByText('학교 갈 준비 완료!'));
    await click(page.getByText('일어나기'));
    await page.waitForFunction(() => window.__sim.state().period === 'arrival', null, { timeout: 60000 });
    await page.waitForFunction(() => !!window.__sim.state().dialogue, null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${d.name}_play.png` });
    // 겹침 검사: 목표 카드·시계·대화창·소지품·터치 버튼이 화면 안에 있고 서로 겹치지 않는지
    const boxes = await page.evaluate(() => {
      const r = (s) => {
        const e = document.querySelector(s);
        if (!e || e.closest('.hidden') || getComputedStyle(e).display === 'none') return null;
        const b = e.getBoundingClientRect();
        return b.width ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
      };
      return { objective: r('.objective'), clock: r('.clock'), dialogue: r('.dialogue'), inventory: r('.inventory'), pad: r('.touch-pad'), menu: r('.tb-menu'), ghost: r('.stick-ghost'), W: innerWidth, H: innerHeight };
    });
    const names = ['objective', 'clock', 'dialogue', 'inventory', 'pad', 'menu', 'ghost'];
    const probs = [];
    for (const n of names) {
      const b = boxes[n];
      if (!b) continue;
      if (b.x < -1 || b.y < -1 || b.x + b.w > boxes.W + 1 || b.y + b.h > boxes.H + 1) probs.push(`${n} 화면 밖`);
    }
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++) {
        const a = boxes[names[i]], b = boxes[names[j]];
        if (a && b && a.x < b.x + b.w - 2 && b.x < a.x + a.w - 2 && a.y < b.y + b.h - 2 && b.y < a.y + a.h - 2) probs.push(`${names[i]}↔${names[j]} 겹침`);
      }
    log(`${d.name}: ${Object.entries(boxes).filter(([, v]) => v && typeof v === 'object').map(([k]) => k).join(', ')}`);
    if (probs.length) throw new Error(probs.join(' / '));
    if (errors.length) throw new Error('콘솔 오류: ' + errors.slice(0, 3).join(' | '));
    await ctx.close();
  });
}

await browser.close();
server.kill();
console.log(failed ? '\n결과: 실패 있음' : '\n결과: 모두 통과');
process.exit(failed ? 1 : 0);
