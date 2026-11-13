// Poly Haven(CC0) 모델을 받아 게임용 GLB로 바꾼다.
// 사용: node tools/assets/fetch_polyhaven.mjs   → public/models/props/<id>.glb + assets/SOURCES.md 표에 쓸 목록 출력
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, weld, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** 게임에서 쓰는 소품 (id → 쓰는 곳) */
export const PROPS = {
  SchoolDesk_01: '교실 학생 책상',
  SchoolChair_01: '교실 학생 의자',
  metal_office_desk: '교사용 책상',
  Shelf_01: '학급 문고 책장',
  plastic_broom: '청소 도구(빗자루)',
  dustpan: '청소 도구(쓰레받기)',
  pot_enamel_01: '급식 국통',
  brass_pan_01: '조리실 팬',
  WetFloorSign_01: '복도 미끄럼 주의 표지',
  classic_laptop: '방송실 컴퓨터',
};

/** 삼각형 목표 (학교 컴퓨터용). 여러 개 깔리는 책상·의자는 더 가볍게 */
const TARGET = { SchoolDesk_01: 900, SchoolChair_01: 900, plastic_monobloc_chair_01: 900, dining_table: 1048 };
const DEFAULT_TARGET = 1500;

const TMP = process.env.PH_TMP || '/tmp/polyhaven';
const OUT = 'public/models/props';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r;
}

mkdirSync(OUT, { recursive: true });
const rows = [];
for (const [id, use] of Object.entries(PROPS)) {
  const out = join(OUT, id + '.glb');
  try {
    const files = await (await get(`https://api.polyhaven.com/files/${id}`)).json();
    const g = files.gltf['1k'].gltf;
    const base = join(TMP, id);
    mkdirSync(base, { recursive: true });
    const main = join(base, id + '.gltf');
    if (!existsSync(main)) {
      writeFileSync(main, Buffer.from(await (await get(g.url)).arrayBuffer()));
      for (const [rel, f] of Object.entries(g.include ?? {})) {
        const p = join(base, rel);
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, Buffer.from(await (await get(f.url)).arrayBuffer()));
      }
    }
    // 텍스처 512px로 줄이기 (학교 노트북·학교 인터넷용)
    execFileSync('python3', ['-I', '-c', `
import sys,glob
from PIL import Image
for f in glob.glob(sys.argv[1]+'/textures/*.jpg'):
    im=Image.open(f)
    if max(im.size)>512:
        im.thumbnail((512,512)); im.save(f, quality=82)
`, base]);
    const doc = await io.read(main);
    const tris0 = doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
    await MeshoptSimplifier.ready;
    const ratio = Math.min(1, (TARGET[id] ?? DEFAULT_TARGET) / Math.max(1, tris0));
    await doc.transform(weld(), ...(ratio < 1 ? [simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01 })] : []), dedup(), quantize(), prune());
    await io.write(out, doc);
    const tris = doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
    rows.push(`| public/models/props/${id}.glb | https://polyhaven.com/a/${id} | Poly Haven | CC0 | 2026-11-12 | 1k 텍스처, 정점 압축 · ${use} · 삼각형 ${Math.round(tris)} |`);
    console.log('ok', id, Math.round(tris), 'tris');
  } catch (e) {
    console.log('FAIL', id, e.message);
  }
}
writeFileSync(join(TMP, 'sources_rows.md'), rows.join('\n') + '\n');
