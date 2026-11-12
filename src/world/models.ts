// 캐릭터 GLB와 공용 동작 모음 미리 불러오기. 실패하면 기본 도형 캐릭터로 대신하고, 어떤 파일이 왜 실패했는지 알린다.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loaded = new Map<string, GLTF>();
export const modelErrors: string[] = [];

/** 공용 동작 (Quaternius Universal Animation Library 일부) */
export const sharedAnims: { clips: THREE.AnimationClip[]; pelvisRest: THREE.Vector3 | null } = { clips: [], pelvisRest: null };

export function getModel(id: string): GLTF | undefined {
  return sharedAnims.clips.length ? loaded.get(id) : undefined;
}

export async function preloadCharacterModels(ids: string[], onProgress?: (done: number, total: number) => void): Promise<void> {
  if (!ids.length) return;
  const loader = new GLTFLoader();
  const base = `${import.meta.env.BASE_URL}models/`;
  let done = 0;
  const total = ids.length + 1;
  const report = (name: string, e: unknown) => {
    const msg = `3D 파일을 불러오지 못했어요: ${name} (${(e as Error)?.message ?? e}) — 기본 모양으로 대신 보여 줄게요.`;
    modelErrors.push(msg);
    console.error(msg);
  };
  await Promise.all([
    (async () => {
      try {
        const g = await loader.loadAsync(base + 'anims/school_anims.glb');
        sharedAnims.clips = g.animations;
        const pelvis = g.scene.getObjectByName('pelvis');
        sharedAnims.pelvisRest = pelvis ? pelvis.position.clone() : null;
      } catch (e) {
        report('anims/school_anims.glb', e);
      } finally {
        onProgress?.(++done, total);
      }
    })(),
    ...ids.map(async (id) => {
      try {
        loaded.set(id, await loader.loadAsync(`${base}characters/${id}.glb`));
      } catch (e) {
        report(`characters/${id}.glb`, e);
      } finally {
        onProgress?.(++done, total);
      }
    }),
  ]);
}
