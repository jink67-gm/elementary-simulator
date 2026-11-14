// 캐릭터 GLB 미리보기 캡처 (개발용). 사용: node scripts/model-preview.mjs <glb 경로> <출력.png> [쿼리 key=value ...]
// 여러 장: node scripts/model-preview.mjs --batch <json 파일>  ([{model,out,params}])
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { chromium } = await import('playwright').catch(() => createRequire(execSync('npm root -g').toString().trim() + '/')('playwright'));
const jobs = process.argv[2] === '--batch' ? JSON.parse(readFileSync(process.argv[3], 'utf8')) : [{ model: process.argv[2], out: process.argv[3], params: Object.fromEntries(process.argv.slice(4).map((a) => a.split('='))) }];
const PORT = 5197;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((r) => setTimeout(r, 3000));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 800 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
for (const j of jobs) {
  const p = new URLSearchParams({ model: '/elementary-simulator/' + j.model, ...(j.params ?? {}) });
  if (j.width) await page.setViewportSize({ width: j.width, height: j.height ?? 800 });
  await page.goto(`http://localhost:${PORT}/elementary-simulator/tools/character/preview.html?${p}`);
  await page.waitForFunction(() => document.title === 'READY' || document.title === 'NOCLIP', null, { timeout: 120000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: j.out });
  console.log(j.out, await page.title(), JSON.stringify(await page.evaluate(() => window.__info)));
}
await browser.close();
try { process.kill(-server.pid); } catch {}
process.exit(0);
