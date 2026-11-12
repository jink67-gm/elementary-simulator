// 캐릭터 GLB 미리 불러오기. 실패하면 기본 도형 캐릭터로 대신하고, 어떤 파일이 왜 실패했는지 알린다.
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loaded = new Map<string, GLTF>();
export const modelErrors: string[] = [];

export function getModel(id: string): GLTF | undefined {
  return loaded.get(id);
}

export async function preloadCharacterModels(ids: string[], onProgress?: (done: number, total: number) => void): Promise<void> {
  const loader = new GLTFLoader();
  let done = 0;
  await Promise.all(
    ids.map(async (id) => {
      const url = `${import.meta.env.BASE_URL}models/characters/${id}.glb`;
      try {
        const g = await loader.loadAsync(url);
        loaded.set(id, g);
      } catch (e) {
        const msg = `캐릭터 모델을 불러오지 못했어요: ${id}.glb (${(e as Error)?.message ?? e}) — 기본 모양으로 대신 보여 줄게요.`;
        modelErrors.push(msg);
        console.error(msg);
      } finally {
        onProgress?.(++done, ids.length);
      }
    }),
  );
}
