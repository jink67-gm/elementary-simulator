// CC0 소품 모델(Poly Haven) 불러오기와 배치. 같은 모델을 여러 개 둘 때는 InstancedMesh로 한 번에 그린다.
// 모델이 없거나 불러오기에 실패하면 null을 돌려주고, 맵은 원래의 상자 모양을 그대로 쓴다.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const props = new Map<string, GLTF>();
export const propErrors: string[] = [];

export const PROP_IDS = [
  'SchoolDesk_01', 'SchoolChair_01', 'metal_office_desk', 'painted_wooden_cabinet', 'Shelf_01',
  'metal_trash_can', 'plastic_broom', 'dustpan', 'dining_table', 'plastic_monobloc_chair_01',
  'pot_enamel_01', 'brass_pan_01', 'WetFloorSign_01', 'classic_laptop',
];

export async function preloadProps(ids = PROP_IDS) {
  const loader = new GLTFLoader();
  await Promise.all(
    ids.map(async (id) => {
      try {
        props.set(id, await loader.loadAsync(`${import.meta.env.BASE_URL}models/props/${id}.glb`));
      } catch (e) {
        const msg = `소품 모델을 불러오지 못했어요: ${id}.glb — 기본 모양으로 대신해요.`;
        propErrors.push(msg);
        console.error(msg, e);
      }
    }),
  );
}

export function hasProp(id: string) {
  return props.has(id);
}

export interface Placement {
  x: number;
  y?: number;
  z: number;
  ry?: number;
}

export interface Fit {
  /** 이 크기(미터)에 맞춘다. 하나만 주면 비율 유지 */
  w?: number;
  h?: number;
  d?: number;
  /** 모델의 높은 부분(의자 등받이 등)이 +Z 쪽을 향하게 돌린다 */
  backToPlusZ?: boolean;
  /** 모델을 Y축으로 추가 회전 */
  turn?: number;
}

/** 모델의 각 메시를 '바닥 중심 원점 + 크기 맞춤' 행렬과 함께 모아 둔다 */
function prepared(id: string, fit: Fit): { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; m: THREE.Matrix4 }[] | null {
  const g = props.get(id);
  if (!g) return null;
  const scene = g.scene;
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  let turn = fit.turn ?? 0;
  if (fit.backToPlusZ) {
    // 위쪽 30% 정점들의 평균 z가 어느 쪽인지로 등받이 방향을 판단
    let sz = 0, n = 0;
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const pos = mesh.geometry.getAttribute('position');
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i += 3) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        if (v.y > box.min.y + size.y * 0.7) {
          sz += v.z - center.z;
          n++;
        }
      }
    });
    if (n && sz / n < 0) turn += Math.PI;
  }
  const rotated = Math.abs(Math.sin(turn)) > 0.7;
  const sw = rotated ? size.z : size.x, sd = rotated ? size.x : size.z;
  const ks = [fit.w ? fit.w / sw : 0, fit.h ? fit.h / size.y : 0, fit.d ? fit.d / sd : 0].filter((k) => k > 0);
  const kx = fit.w ? fit.w / sw : Math.min(...ks);
  const ky = fit.h ? fit.h / size.y : Math.min(...ks);
  const kz = fit.d ? fit.d / sd : Math.min(...ks);
  const norm = new THREE.Matrix4()
    .makeScale(kx, ky, kz)
    .multiply(new THREE.Matrix4().makeRotationY(turn))
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z));
  const out: { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; m: THREE.Matrix4 }[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) out.push({ geo: mesh.geometry, mat: mesh.material, m: norm.clone().multiply(mesh.matrixWorld) });
  });
  return out;
}

/** 같은 모델을 여러 곳에 놓는다. 반환한 그룹을 장면에 추가하면 된다 */
export function placeInstances(id: string, places: Placement[], fit: Fit): THREE.Group | null {
  const parts = prepared(id, fit);
  if (!parts || !places.length) return null;
  const group = new THREE.Group();
  group.name = 'props:' + id;
  const tmp = new THREE.Matrix4();
  for (const { geo, mat, m } of parts) {
    const inst = new THREE.InstancedMesh(geo, mat, places.length);
    places.forEach((p, i) => {
      tmp.makeRotationY(p.ry ?? 0).setPosition(p.x, p.y ?? 0, p.z).multiply(m);
      inst.setMatrixAt(i, tmp);
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    group.add(inst);
  }
  return group;
}

/** 하나만 놓을 때 (움직이는 물건용: 일반 Mesh 복제) */
export function placeOne(id: string, fit: Fit): THREE.Group | null {
  const parts = prepared(id, fit);
  if (!parts) return null;
  const group = new THREE.Group();
  for (const { geo, mat, m } of parts) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.applyMatrix4(m);
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}
