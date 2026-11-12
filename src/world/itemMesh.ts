import * as THREE from 'three';
import { itemDef, type ItemId } from '../data/items';

/** 물건의 임시 3D 모델(기본 도형). 정식 모델이 생기면 여기서 GLB로 바꾼다. */
export function makeItemMesh(id: ItemId): THREE.Object3D {
  const d = itemDef(id);
  const mat = new THREE.MeshLambertMaterial({ color: d.color });
  const [w, h, l] = d.size;
  let obj: THREE.Object3D;
  switch (d.shape) {
    case 'cylinder': {
      obj = new THREE.Mesh(new THREE.CylinderGeometry(w, w, h, 12), mat);
      break;
    }
    case 'plane': {
      // 종이비행기: 납작한 삼각 날개 두 장
      const g = new THREE.BufferGeometry();
      const v = new Float32Array([
        0, 0, l / 2, -w / 2, 0, -l / 2, 0, -h, -l / 2,
        0, 0, l / 2, 0, -h, -l / 2, w / 2, 0, -l / 2,
      ]);
      g.setAttribute('position', new THREE.BufferAttribute(v, 3));
      g.computeVertexNormals();
      obj = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: d.color, side: THREE.DoubleSide }));
      break;
    }
    default:
      obj = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat);
  }
  if (id === 'bag') {
    const g = new THREE.Group();
    g.add(obj);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, h * 0.45, 0.04), new THREE.MeshLambertMaterial({ color: 0xffc845 }));
    flap.position.set(0, h * 0.2, l / 2);
    g.add(flap);
    obj = g;
  }
  if (id === 'tablet') {
    const g = new THREE.Group();
    g.add(obj);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.88, l * 0.82), new THREE.MeshBasicMaterial({ color: 0x0d1b2a }));
    scr.rotation.x = -Math.PI / 2;
    scr.position.y = h / 2 + 0.002;
    g.add(scr);
    obj = g;
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
