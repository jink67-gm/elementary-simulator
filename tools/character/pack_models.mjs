// 게임용 GLB 정리: 정점 압축(KHR_mesh_quantization)·불필요 데이터 제거, 동작 모음에서 필요한 클립만 추출
// 사용: node tools/character/pack_models.mjs chars <입력폴더> <출력폴더>
//       node tools/character/pack_models.mjs anims <UAL1_Standard.glb> <출력.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, quantize, dedup, resample, weld, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { readdirSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [mode, src, dst] = process.argv.slice(2);

/** 게임에서 쓰는 동작 (Quaternius Universal Animation Library) */
const CLIPS = ['Idle_Loop', 'Idle_Talking_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Sitting_Enter', 'Sitting_Idle_Loop',
  'Sitting_Talking_Loop', 'Sitting_Exit', 'Interact', 'PickUp_Table', 'Dance_Loop', 'Push_Loop', 'Crouch_Idle_Loop', 'Hit_Head', 'Jump_Start', 'Jump_Loop', 'Jump_Land'];

if (mode === 'chars') {
  mkdirSync(dst, { recursive: true });
  for (const f of readdirSync(src).filter((f) => f.endsWith('.glb'))) {
    // Blender가 이미지 없이 내보낸 텍스처(머리·눈 노멀맵)를 참조에서 뺀다
    const jd = await io.readAsJSON(join(src, f));
    const bad = new Set((jd.json.textures ?? []).map((t, i) => (t.source === undefined && !t.extensions?.EXT_texture_webp ? i : -1)).filter((i) => i >= 0));
    for (const m of jd.json.materials ?? []) {
      if (m.normalTexture && bad.has(m.normalTexture.index)) delete m.normalTexture;
    }
    const doc = await io.readJSON(jd);
    // 학교 컴퓨터용: 몸 삼각형을 약 절반으로 (얼굴·손 모양은 유지되는 정도)
    await MeshoptSimplifier.ready;
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: Number(process.env.CHAR_RATIO ?? 0.45), error: 0.002 }));
    await doc.transform(dedup(), quantize({ quantizeNormal: 10, quantizePosition: 14 }), prune());
    await io.write(join(dst, f), doc);
    console.log('packed', f);
  }
} else if (mode === 'anims') {
  const doc = await io.read(src);
  const root = doc.getRoot();
  for (const a of root.listAnimations()) {
    if (!CLIPS.includes(a.getName())) {
      a.dispose();
      continue;
    }
    // 회전만 남기고(뼈 길이는 캐릭터마다 다름), 위치는 골반만
    for (const ch of a.listChannels()) {
      const node = ch.getTargetNode();
      const path = ch.getTargetPath();
      if (path === 'scale' || (path === 'translation' && node?.getName() !== 'pelvis')) {
        ch.getSampler()?.dispose();
        ch.dispose();
      }
    }
  }
  // 동작만 남기고 사람 모형 메시는 지운다
  for (const n of root.listNodes()) if (n.getMesh()) n.setMesh(null);
  for (const m of root.listMeshes()) m.dispose();
  await doc.transform(resample(), prune({ keepLeaves: true }), dedup());
  await io.write(dst, doc);
  console.log('anims', basename(dst), root.listAnimations().map((a) => a.getName()).join(', '));
}
