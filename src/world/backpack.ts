// 메는 책가방 (등 부착점에 붙는 모양): 몸통·앞주머니·덮개·어깨끈 두 줄. 단위는 블록 캐릭터 몸통 기준.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export function makeBackpack(color = 0x3a6ea5): THREE.Group {
  const g = new THREE.Group();
  g.name = 'backpack';
  const main = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.7) });
  const strap = new THREE.MeshLambertMaterial({ color: 0x2b2d42 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  // 등에 붙는 몸통 (등 쪽이 -z)
  add(new RoundedBoxGeometry(0.34, 0.4, 0.16, 2, 0.04), main, 0, -0.01, -0.09);
  add(new RoundedBoxGeometry(0.26, 0.17, 0.06, 2, 0.025), dark, 0, -0.1, -0.19); // 앞주머니
  add(new RoundedBoxGeometry(0.34, 0.1, 0.17, 2, 0.03), dark, 0, 0.17, -0.095); // 덮개
  add(new THREE.BoxGeometry(0.12, 0.025, 0.02), strap, 0, 0.22, -0.05); // 손잡이
  // 어깨끈: 등 → 어깨 위 → 가슴 앞으로 내려온다
  for (const x of [-0.11, 0.11]) {
    add(new THREE.BoxGeometry(0.045, 0.03, 0.26), strap, x, 0.255, 0.04); // 어깨 위
    add(new THREE.BoxGeometry(0.045, 0.34, 0.025), strap, x, 0.08, 0.235); // 가슴 앞
    add(new THREE.BoxGeometry(0.05, 0.03, 0.03), new THREE.MeshLambertMaterial({ color: 0xadb5bd }), x, -0.06, 0.24); // 고리
  }
  return g;
}
