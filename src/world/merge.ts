// 그리기 호출(draw call) 줄이기: 움직이지 않는 상자들을 재질별로 하나로 합친다. 학교 노트북 성능용.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * root 아래에서 keep에 속하지 않은 정적 메시를 재질별로 합친다.
 * mergeable(material)이 true인 재질만 합치고, 합쳐진 원본 중 rayTargets에 있는 것은
 * 장면에서 빠져도 카메라 충돌 검사에 쓸 수 있게 월드 행렬을 고정해 둔다.
 */
export function mergeStatic(root: THREE.Object3D, keep: Set<THREE.Object3D>, mergeable: (m: THREE.Material) => boolean) {
  root.updateMatrixWorld(true);
  const groups = new Map<THREE.Material, THREE.Mesh[]>();
  const visit = (o: THREE.Object3D) => {
    if (keep.has(o)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !Array.isArray(m.material) && mergeable(m.material)) {
      const list = groups.get(m.material) ?? [];
      list.push(m);
      groups.set(m.material, list);
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  let removed = 0;
  for (const [mat, meshes] of groups) {
    if (meshes.length < 2) continue;
    const geoms = meshes.map((m) => {
      const g = m.geometry.index ? m.geometry.clone() : m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      return g;
    });
    const merged = mergeGeometries(geoms, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = meshes.some((m) => m.castShadow);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    for (const m of meshes) {
      m.parent?.remove(m);
      removed++;
    }
  }
  return removed;
}

/** 한 그룹의 직속 메시들을 정점 색으로 칠해 하나로 합친다 (캐릭터 팔·다리·머리) */
export function mergeChildrenByColor(group: THREE.Object3D, material: THREE.Material) {
  const meshes = group.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[];
  if (meshes.length < 2) return;
  const geoms = meshes.map((m) => {
    m.updateMatrix();
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone());
    g.applyMatrix4(m.matrix);
    const c = ((m.material as THREE.MeshBasicMaterial).color ?? new THREE.Color(0xffffff)).clone();
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.deleteAttribute('uv');
    return g;
  });
  const merged = mergeGeometries(geoms, false);
  if (!merged) return;
  for (const m of meshes) group.remove(m);
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = true;
  group.add(mesh);
}
