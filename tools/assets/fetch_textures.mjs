// Poly Haven(CC0) PBR 텍스처를 받아 학교 PC용 크기로 줄인다.
// 사용: node tools/assets/fetch_textures.mjs  → public/textures/<id>/{diff,nor,rough}.jpg + 출처 표 줄 출력
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** id → [쓰는 곳, 최대 크기(px)] */
export const TEXTURES = {
  terrazzo_tiles: ['복도 인조석 바닥', 1024],
  painted_plaster_wall: ['페인트 칠한 벽', 512],
  oak_veneer_01: ['나무 문·창틀·게시판 틀', 512],
  laminate_floor_02: ['교실 마루', 1024],
};
/** 색 보정 방식 */
const TINT = { terrazzo_tiles: 'grey', painted_plaster_wall: 'white' };
const MAPS = { diff: 'Diffuse', nor: 'nor_gl', rough: 'Rough' };
const OUT = 'public/textures';
const TMP = process.env.PH_TMP || '/tmp/polyhaven_tex';

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

const rows = [];
for (const [id, [use, size]] of Object.entries(TEXTURES)) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  mkdirSync(join(OUT, id), { recursive: true });
  mkdirSync(join(TMP, id), { recursive: true });
  for (const [short, key] of Object.entries(MAPS)) {
    const src = files[key]?.['1k']?.jpg?.url ?? files[key]?.['1k']?.png?.url;
    if (!src) {
      console.log('없음', id, key);
      continue;
    }
    const raw = join(TMP, id, short + (src.endsWith('.png') ? '.png' : '.jpg'));
    if (!existsSync(raw)) writeFileSync(raw, await get(src));
    const out = join(OUT, id, short + '.jpg');
    execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
s = int(sys.argv[3])
if max(im.size) > s: im = im.resize((s, s), Image.LANCZOS)
# 색 보정: 한국 학교 느낌 (인조석은 회색, 벽은 흰색)
mode = sys.argv[4]
if mode == 'grey' and sys.argv[5] == 'diff':
    from PIL import ImageEnhance
    im = ImageEnhance.Color(im).enhance(0.12)
    im = ImageEnhance.Brightness(im).enhance(1.55)
    im = ImageEnhance.Contrast(im).enhance(1.15)
if mode == 'white' and sys.argv[5] == 'diff':
    from PIL import ImageEnhance
    im = ImageEnhance.Brightness(im).enhance(1.32)
    im = ImageEnhance.Contrast(im).enhance(0.55)
im.save(sys.argv[2], quality=84)
`, raw, out, String(size), TINT[id] ?? 'none', short]);
  }
  rows.push(`| public/textures/${id}/ | https://polyhaven.com/a/${id} | Poly Haven | CC0 | 2026-11-13 | ${use} · ${size}px로 줄임 (색·노멀·거칠기) |`);
  console.log('ok', id);
}
writeFileSync(join(TMP, 'sources_rows.md'), rows.join('\n') + '\n');
