// 고품질 공간을 짓는 공통 도구 (복도·교실 등): 재질·상자·둥근 상자.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Aabb } from './Collision';
import { paint, worldUV } from './pbr';

export class HQBuilder {
  protected glass = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.04, metalness: 0, envMapIntensity: 1.6, depthWrite: false });
  protected frost = paint(0xdde6ea, 0.35);
  protected frame = paint(0x2f6b4f, 0.45, 0.25);
  protected chrome = paint(0xc9ced3, 0.28, 0.85);
  protected dark = paint(0x2f3337, 0.55);

  constructor(
    protected root: THREE.Object3D,
    protected colliders: Aabb[],
    protected blockers: THREE.Object3D[],
  ) {}

  protected y = 0;
  protected level: 0 | 1 = 1;

  protected add(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, o: { cast?: boolean; receive?: boolean; ry?: number } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, this.y + y, z);
    if (o.ry) m.rotation.y = o.ry;
    m.castShadow = o.cast ?? true;
    m.receiveShadow = o.receive ?? true;
    this.root.add(m);
    return m;
  }

  /** 상자 (밑면 높이 y) */
  protected box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, cast = true, tile = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (tile) worldUV(g, w, h, d, tile);
    return this.add(g, mat, x, y + h / 2, z, { cast });
  }

  /** 모서리 둥근 상자 */
  protected rbox(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, r = 0.035) {
    return this.add(new RoundedBoxGeometry(w, h, d, 2, r), mat, x, y + h / 2, z);
  }
}
