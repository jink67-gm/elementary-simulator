// 소리 시스템 확인 (BGM 전환·효과음·환경음·발소리·음량 설정·일시정지·탭 숨김·파일 없을 때·모바일).
// 사용: npm run build && node scripts/audio-check.mjs
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
const { chromium, devices } = await import('playwright').catch(() => createRequire(execSync('npm root -g').toString().trim() + '/')('playwright'));
const PORT = 4210;
const URL = `http://localhost:${PORT}/elementary-simulator/?debug`;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fail = 0;
const check = (n, ok, info) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${info === undefined ? '' : ' ' + JSON.stringify(info)}`);
  if (!ok) fail++;
};

async function open(ctxOpts = {}, route) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, ...ctxOpts });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  if (route) await page.route('**/audio/**', (r) => r.abort());
  await page.addInitScript(() => localStorage.setItem('elementary-simulator.settings.v1', JSON.stringify({ quality: 'low', autoRes: false })));
  await page.goto(URL);
  await page.waitForFunction(() => !!window.__sim, null, { timeout: 120000 });
  await page.evaluate(() => localStorage.removeItem('elementary-simulator.save.v1'));
  return { page, errors, context };
}
const A = (page) => page.evaluate(() => window.__sim.audio());
const since = async (page, t0, id) => (await A(page)).log.filter((l) => l.t >= t0 && l.id.startsWith(id)).length;
const now = (page) => page.evaluate(() => Math.round(performance.now()));
const skip = (page) => page.evaluate(() => { const g = window.__sim.game; g.dialogue.skipEverything(); });

// ───────── PC ─────────
{
  const { page, errors } = await open();
  await page.getByText('새로 시작').click(); // 첫 클릭 = 소리 켜기
  await page.getByText('학교 갈 준비 완료!').click();
  await page.waitForTimeout(1500);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__sim.game.running && window.__sim.state().period === 'arrival', null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  let a = await A(page);
  check('1. 등교: 소리 켜짐', a.state === 'running', a.state);
  check('1. 등교(정문 밖): BGM 01 학교 탐험', a.bgmNow === 'explore' && a.tracks.explore?.playing && a.tracks.explore.gain > 0.5, a.tracks);
  check('효과음 미리 받음 (28개)', a.loaded >= 28, a.loaded);
  check('정문 밖은 환경음 없음', a.amb === null, a.amb);

  // 걷기 → 발소리 (실외 타일), 멈추면 끊김
  await skip(page);
  let t0 = await now(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(3500);
  await page.keyboard.up('KeyW');
  const walked = await since(page, t0, 'stepTile');
  await page.waitForTimeout(1000);
  const t1 = await now(page);
  await page.waitForTimeout(800);
  const after = await since(page, t1, 'step');
  check('4. 걸으면 발소리 (걸음마다)', walked >= 1 && walked <= 12, walked);
  check('4. 멈추면 발소리 멈춤', after === 0, after);

  // 교실 안: 나무 발소리 + 교실 환경음
  await page.evaluate(() => { const g = window.__sim.game; g.player.teleport(2, 0, Math.PI, 0); g.tpc.behind(g.player.yaw); });
  await page.waitForTimeout(1600);
  t0 = await now(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(3000);
  await page.keyboard.up('KeyW');
  check('4. 교실에서는 나무 마루 발소리', (await since(page, t0, 'stepWood')) >= 1);
  a = await A(page);
  check('교실 환경음', a.amb === 'classroom', a.amb);
  check('1~2. 등교 중 교실에 들어와도 BGM은 탐험곡 (장소보다 상태)', a.bgmNow === 'explore', a.bgmNow);
  await page.evaluate(() => { const g = window.__sim.game; g.player.teleport(9, -1, Math.PI, 0); });
  await page.waitForTimeout(1600);
  check('복도 환경음 (페이드 전환)', (await A(page)).amb === 'corridor');

  // 문: 6-1 앞문 E로 닫기 → 실제로 움직일 때 미닫이문 소리 1번
  await page.evaluate(() => { const g = window.__sim.game; g.player.teleport(8.0, -3.7, -Math.PI / 2, 0); g.tpc.behind(g.player.yaw); });
  await page.waitForTimeout(900);
  t0 = await now(page);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(1200);
  check('4. 문 닫힐 때 미닫이문 소리 1번', (await since(page, t0, 'slideDoor')) === 1);
  t0 = await now(page);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(1200);
  check('4. 문 열릴 때 미닫이문 소리 1번', (await since(page, t0, 'slideDoor')) === 1);

  // 가방 걸기 → 가방 소리 + 퀘스트 시작
  await page.evaluate(() => window.__sim.goto('seat', 0.7));
  await page.waitForTimeout(700);
  t0 = await now(page);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__sim.state().flags.bagOnDesk, null, { timeout: 10000 });
  await page.waitForTimeout(500);
  check('4. 가방 걸기 소리 1번', (await since(page, t0, 'bag')) === 1);
  check('새 할 일(사물함) → 퀘스트 시작음 1번', (await since(page, t0, 'questStart')) === 1);
  // 사물함 → 국어책 → 책상에 올리면 교과서 펼치기
  await page.evaluate(() => window.__sim.goto('locker', 0.7));
  await page.waitForTimeout(700);
  t0 = await now(page);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__sim.state().inventory.includes('koreanBook'), null, { timeout: 10000 });
  await page.waitForTimeout(300);
  check('16. 아이템 획득음', (await since(page, t0, 'pickup')) === 1);
  await page.evaluate(() => { const g = window.__sim.game; g.inventory.select(g.inventory.slots.indexOf('koreanBook')); window.__sim.goto('seat', 0.7); });
  await page.waitForTimeout(700);
  t0 = await now(page);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.__sim.state().flags.bookOnDesk, null, { timeout: 10000 });
  await page.waitForFunction(() => window.__sim.state().phase === 'free', null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(600);
  console.log('   (log)', (await A(page)).log.filter((l) => l.t >= t0).map((l) => l.id).join(','), (await page.evaluate(() => window.__sim.state().phase)));
  check('4. 교과서 펼치기 소리', (await since(page, t0, 'bookOpen')) === 1);
  check('15. 준비 끝 → 퀘스트 완료음 1번', (await since(page, t0, 'questDone')) === 1);

  // 대사 중 BGM 낮추기
  await page.evaluate(() => { void window.__sim.game.say([{ who: '선생님', text: '자리에 앉아요~' }]); });
  await page.waitForTimeout(900);
  check('대사 중 BGM 자동 낮춤', (await A(page)).duck < 0.6, (await A(page)).duck);
  await skip(page);
  await page.waitForTimeout(900);
  check('대사 끝나면 BGM 원래대로', (await A(page)).duck > 0.9, (await A(page)).duck);

  // 정답·오답·완료음 중복 방지
  t0 = await now(page);
  await page.evaluate(() => { const s = window.__sim.game.sfx; s.success(); s.success(); s.questDone(); s.questDone(); s.oops(); });
  await page.waitForTimeout(300);
  const lg = (await A(page)).log.filter((l) => l.t >= t0).map((l) => l.id);
  check('5. 정답·완료음 연타해도 각각 1번, 완료음이 이기고 오답은 생략', lg.filter((x) => x === 'correct').length === 1 && lg.filter((x) => x === 'questDone').length === 1 && !lg.includes('wrong'), lg);

  // 종 → 수업 시작: BGM 02
  t0 = await now(page);
  await page.evaluate(() => { void window.__sim.story.endPeriod(); });
  await page.waitForFunction(() => window.__sim.state().period === 'korean', null, { timeout: 20000 });
  check('종소리 (수업 시작) 1번', (await since(page, t0, 'bell')) === 1);
  await page.waitForTimeout(1800);
  a = await A(page);
  check('2. 수업 시작 → BGM 02 (크로스페이드, 이전 곡 멈춤)', a.bgmNow === 'class' && a.tracks.class.playing && a.tracks.class.gain > 0.5 && !a.tracks.explore.playing, a.tracks);

  const period = async (p, want, wait = 2200) => {
    await page.evaluate((x) => window.__sim.skipTo(x), p);
    await page.waitForFunction((x) => window.__sim.state().period === x, p, { timeout: 30000 });
    await page.waitForTimeout(wait);
    const s = await A(page);
    check(`BGM ${p} → ${want}`, s.bgmNow === want && s.tracks[want]?.playing && Object.entries(s.tracks).filter(([, t]) => t.playing && t.gain > 0.05).length === 1, { bgm: s.bgmNow, tracks: s.tracks });
    return s;
  };
  // 같은 곡이면 다시 시작하지 않는다 (국어 → 수학)
  const before = (await A(page)).tracks.class.time;
  await page.evaluate(() => window.__sim.skipTo('math'));
  await page.waitForTimeout(1500);
  const afterT = (await A(page)).tracks.class.time;
  check('같은 곡(국어→수학)은 처음부터 다시 틀지 않음', afterT > before, { before, afterT });
  await period('break', 'break');
  await period('group', 'group');
  await period('art', 'group');
  await period('lunch', 'break');
  // 급식실 사건: 거대 돈가스 등장 → BGM 05 + 등장음
  t0 = await now(page);
  await period('cutlet', 'cutlet');
  t0 = await now(page);
  await period('robot', 'robot', 1500);
  await page.evaluate(() => window.__sim.game.dialogue.skipEverything());
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__sim.game.dialogue.skipEverything());
  await page.waitForTimeout(800);
  const robotLog = (await A(page)).log.filter((l) => l.t >= t0).map((l) => l.id);
  check('6. 청소 로봇: AI 소원 실행음 + 로봇 작동음', robotLog.includes('wish') && robotLog.includes('robot'), robotLog);
  await period('dodgeball', 'robot');
  const hw = await period('hallway', 'hallway');
  check('무한 복도(시간 멈춤): 환경음 없음', hw.amb === null, hw.amb);
  // 무한 복도 끝 → 반대쪽 (순간이동 소리)
  await page.evaluate(() => window.__sim.game.dialogue.skipEverything());
  t0 = await now(page);
  await page.evaluate(() => { const g = window.__sim.game; g.player.teleport(9, 15.4, 0, 0); });
  await page.waitForTimeout(600);
  check('29. 무한 복도 순간이동 소리', (await since(page, t0, 'teleport')) === 1);
  await period('final', 'hallway');

  // 일시정지
  await page.evaluate(() => { window.__sim.menus.pause(); });
  await page.waitForTimeout(900);
  check('일시정지: BGM 낮춤', (await A(page)).duck < 0.5, (await A(page)).duck);
  await page.keyboard.press('Escape');
  await page.evaluate(() => { document.querySelectorAll('.panel-wrap').forEach(() => {}); });
  await page.evaluate(() => window.__sim.game.setPaused(false));
  // 탭 숨김 → 멈춤, 다시 보이면 이어서
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(500);
  a = await A(page);
  check('탭 숨김: 소리 멈춤', a.state === 'suspended' && !Object.values(a.tracks).some((t) => t.playing), { state: a.state });
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(800);
  a = await A(page);
  check('탭 돌아옴: 이어서 재생', a.state === 'running' && a.tracks[a.bgmNow]?.playing, { state: a.state, bgm: a.bgmNow });

  // 엔딩: 한 번만
  await page.evaluate(() => { const s = window.__sim; s.menus.ending(s.game.save, 'B', ['끝'], ['기록']); });
  await page.waitForTimeout(1800);
  a = await A(page);
  check('8. 엔딩 BGM 08', a.bgmNow === 'ending' && a.tracks.ending.playing, a.tracks.ending);
  await page.evaluate(() => { const t = [...document.querySelectorAll('audio')]; return t.length; });
  await page.evaluate(() => { const d = window.__sim.game.sfx; const tr = d['tracks'].get('ending'); tr.el.currentTime = tr.el.duration - 1.0; });
  await page.waitForTimeout(2500);
  a = await A(page);
  check('7. 엔딩곡은 반복 없이 끝남', !a.tracks.ending.playing && a.tracks.ending.time > 40, a.tracks.ending);
  await page.waitForTimeout(1500);
  check('7. 끝난 뒤 다시 시작하지 않음', !(await A(page)).tracks.ending.playing);

  // 설정: 음량·음소거 저장
  await page.locator('.title-screen button', { hasText: '처음 화면으로' }).click();
  await page.waitForTimeout(1600);
  a = await A(page);
  check('처음 화면: 음악 끔', a.bgm === null && !Object.values(a.tracks).some((t) => t.playing && t.gain > 0.05), a.tracks);
  await page.getByText('설정', { exact: true }).click();
  const labels = await page.$$eval('.set-row span', (s) => s.map((x) => x.textContent));
  check('설정 메뉴: 전체·BGM·효과음·환경음·음소거', ['전체 음량', '배경음악', '효과음', '환경음 (교실·복도 소리)', '전체 음소거'].every((l) => labels.includes(l)), labels);
  const setRange = (label, v) => page.evaluate(([l, val]) => {
    const row = [...document.querySelectorAll('.set-row')].find((r) => r.querySelector('span')?.textContent === l);
    const inp = row.querySelector('input');
    inp.value = String(val);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }, [label, v]);
  await setRange('배경음악', 0.2);
  await setRange('효과음', 0.5);
  await page.evaluate(() => { const row = [...document.querySelectorAll('.set-row')].find((r) => r.querySelector('span')?.textContent === '전체 음소거'); row.querySelector('input').click(); });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('elementary-simulator.settings.v1')));
  check('8. 음량·음소거 저장됨', stored.bgmVolume === 0.2 && stored.sfxVolume === 0.5 && stored.muted === true, stored);
  await page.reload();
  await page.waitForFunction(() => !!window.__sim, null, { timeout: 120000 });
  const re = await page.evaluate(() => { const s = window.__sim.game.settings; return { b: s.bgmVolume, f: s.sfxVolume, m: s.muted }; });
  check('새로고침 후에도 유지', re.b === 0.2 && re.f === 0.5 && re.m === true, re);
  check('9. PC: 페이지 오류 없음', errors.length === 0, errors.slice(0, 5));
}

// ───────── 음원 파일이 없을 때 (모두 차단) ─────────
{
  const { page, errors } = await open({}, true);
  await page.getByText('새로 시작').click();
  await page.getByText('학교 갈 준비 완료!').click();
  await page.waitForTimeout(1500);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__sim.game.running, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__sim.game.sfx.pickup());
  const a = await A(page);
  const pageErr = errors.filter((e) => !/Failed to load resource|ERR_FAILED|net::/.test(e));
  check('음원 없음: 게임 계속 (오류 없음)', pageErr.length === 0 && (await page.evaluate(() => window.__sim.game.running)), pageErr.slice(0, 3));
  check('음원 없음: 효과음은 직접 만든 소리로 대신', a.log.some((l) => l.id === 'pickup(대신)'), a.log.slice(-3));
}

// ───────── 모바일 (터치) ─────────
{
  const { page, errors } = await open({ ...devices['Pixel 7'] });
  await page.getByText('새로 시작').tap();
  await page.getByText('학교 갈 준비 완료!').tap();
  await page.waitForTimeout(1500);
  await page.getByText('[E] 일어나기').tap();
  await page.waitForFunction(() => window.__sim.game.running, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  const a = await A(page);
  check('9. 모바일(터치): 첫 터치 뒤 소리 켜짐 + BGM 01', a.state === 'running' && a.bgmNow === 'explore' && a.tracks.explore?.playing, { state: a.state, bgm: a.bgmNow });
  check('9. 모바일: 페이지 오류 없음', errors.length === 0, errors.slice(0, 5));
}

await browser.close();
try { process.kill(-server.pid); } catch { server.kill(); }
console.log(fail ? `\n실패 ${fail}개` : '\n모두 통과');
process.exit(fail ? 1 : 0);
