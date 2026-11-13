import * as THREE from 'three';
import { itemDef, type ItemId } from '../data/items';
import { buildBackpack } from './props/backpack';
import { ITEM_BUILDERS, type ModelState } from './props/items';

/**
 * 물건의 3D 모델. 실제 소품 모델(props/items.ts)을 쓰고, 없는 것만 기본 도형으로 만든다.
 * state: 'world' 놓여 있음 / 'held' 손에 듦 / 'pick' 고를 수 있는 상태(역할 카드: 빛·떠오름)
 */
export function makeItemMesh(id: ItemId, state: ModelState = 'world'): THREE.Object3D {
  const d = itemDef(id);
  const [w, h, l] = d.size;
  let obj: THREE.Object3D;
  if (id === 'bag') {
    obj = new THREE.Group();
    const bag = buildBackpack('floor');
    bag.scale.setScalar(1.1);
    obj.add(bag);
  } else if (ITEM_BUILDERS[id]) {
    obj = ITEM_BUILDERS[id](state);
  } else if (d.shape === 'plane') {
    // 종이비행기: 접힌 날개 두 장 + 가운데 접힌 몸통
    const g = new THREE.BufferGeometry();
    const v = new Float32Array([
      0, 0, l / 2, -w / 2, 0, -l / 2, 0, -h, -l / 2,
      0, 0, l / 2, 0, -h, -l / 2, w / 2, 0, -l / 2,
    ]);
    g.setAttribute('position', new THREE.BufferAttribute(v, 3));
    g.computeVertexNormals();
    obj = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: d.color, side: THREE.DoubleSide, roughness: 0.85 }));
  } else {
    const mat = new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.6 });
    obj = new THREE.Mesh(d.shape === 'cylinder' ? new THREE.CylinderGeometry(w, w, h, 12) : new THREE.BoxGeometry(w, h, l), mat);
  }
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  obj.userData.itemId = id;
  return obj;
}

/** 놓였을 때 바닥 위로 띄울 높이 */
export function itemHalfHeight(id: ItemId): number {
  const d = itemDef(id);
  return d.shape === 'plane' ? 0.06 : d.size[1] / 2;
}
