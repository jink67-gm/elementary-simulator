import { Group, Mesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { makeBackpack } from './backpack';

let loading: Promise<Group> | undefined;

function loadDaypack(): Promise<Group> {
  if (!loading) {
    const url = `${import.meta.env.BASE_URL}models/props/school_daypack.glb`;
    loading = new GLTFLoader().loadAsync(url).then(({ scene }) => {
      scene.traverse((node) => {
        if (node instanceof Mesh) node.castShadow = true;
      });
      return scene;
    }).catch((error) => {
      loading = undefined;
      console.warn('새 책가방을 불러오지 못해 기본 책가방을 표시합니다.', error);
      throw error;
    });
  }
  return loading;
}

/** 게임 시작 전에 미리 받아 둔다 (가방이 등에 늦게 나타나지 않게). 실패해도 게임은 계속 */
export function preloadSchoolDaypack(): Promise<void> {
  return loadDaypack().then(() => undefined, () => undefined);
}

// Player owns this group. Completing a pending load never re-equips a removed bag.
export function makeSchoolDaypack(): Group {
  const mount = new Group();
  mount.name = 'StudentDaypack';
  loadDaypack().then(
    (template) => mount.add(template.clone(true)),
    () => mount.add(makeBackpack()),
  );
  return mount;
}
