// 고품질 공간을 짓는 공통 도구 (복도·교실 등): 재질·상자·둥근 상자.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { aabb, type Aabb } from './Collision';
import { TILE, paint, pbr, worldUV } from './pbr';

export class HQBuilder {
  protected glass = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.04, metalness: 0, envMapIntensity: 1.6, depthWrite: false });
  protected frost = paint(0xdde6ea, 0.35);
  protected frame = paint(0x2f6b4f, 0.45, 0.25);
  protected chrome = paint(0xc9ced3, 0.28, 0.85);
  protected dark = paint(0x2f3337, 0.55);
  protected alu = paint(0xe6e9ec, 0.32, 0.55);
  protected laminateWhite = paint(0xf2eee6, 0.55);
  protected fabric = paint(0xece3cf, 0.98);

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

  /**
   * 큰 창이 있는 바깥 벽 (x 벽, z0~z1): 창 아래 벽·인방, 창턱, 알루미늄 미닫이(아래 두 장) + 위 고정창,
   * 롤 블라인드(선택). dir = 방 안쪽 방향(+1: +x 쪽이 방)
   */
  protected slidingWindowWall(x: number, z0: number, z1: number, dir: 1 | -1, o: { blinds?: boolean; bays?: number; sillY?: number } = {}) {
    const H = 3;
    const len = z1 - z0, zc = (z0 + z1) / 2;
    const plaster = pbr('plaster', { roughness: 0.9 });
    const sillY = o.sillY ?? 0.86, topY = 2.64;
    const ry = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    const sill = this.box(0.2, sillY, len + 0.2, plaster, x, 0, zc, true, TILE.plaster);
    const header = this.box(0.2, H - topY, len + 0.2, plaster, x, topY, zc, true, TILE.plaster);
    this.blockers.push(sill, header);
    this.colliders.push({ ...aabb(x, zc, 0.2, len), level: this.level });
    // 창 양끝 기둥(벽)
    for (const [za, zb] of [[z0, z0 + 0.15], [z1 - 0.15, z1]]) this.box(0.2, topY - sillY, zb - za, plaster, x, sillY, (za + zb) / 2, true, TILE.plaster);
    // 안쪽 창턱 (인조 대리석)
    this.box(0.3, 0.035, len - 0.3, paint(0xe9e6df, 0.4), x + dir * 0.12, sillY, zc);
    // 바깥 창턱
    this.box(0.12, 0.04, len - 0.3, paint(0xbfc1bc, 0.6), x - dir * 0.14, sillY - 0.04, zc, false);
    // 창틀: 5칸, 칸마다 아래 미닫이 두 장 + 위 고정창
    const wz0 = z0 + 0.15, wz1 = z1 - 0.15, wl = wz1 - wz0;
    const bays = o.bays ?? Math.max(1, Math.round(wl / 2.5)), bw = wl / bays;
    const midY = 2.2;
    this.box(0.1, 0.05, wl, this.alu, x, sillY, (wz0 + wz1) / 2);
    this.box(0.1, 0.05, wl, this.alu, x, topY - 0.05, (wz0 + wz1) / 2);
    this.box(0.1, 0.06, wl, this.alu, x, midY - 0.03, (wz0 + wz1) / 2);
    for (let i = 0; i <= bays; i++) this.box(0.12, topY - sillY, 0.06, this.alu, x, sillY, wz0 + i * bw);
    const paneH = midY - 0.03 - sillY - 0.05;
    for (let i = 0; i < bays; i++) {
      const bz = wz0 + i * bw;
      // 위 고정창
      const up = this.add(new THREE.PlaneGeometry(bw - 0.06, topY - 0.05 - (midY + 0.03)), this.glass, x, (midY + 0.03 + topY - 0.05) / 2, bz + bw / 2, { cast: false, receive: false, ry });
      up.renderOrder = 2;
      this.blockers.push(up);
      // 아래 미닫이 두 장 (안쪽·바깥쪽 레일)
      for (const k of [0, 1]) {
        const sx = x + (k ? 0.028 : -0.028);
        const sw = bw * 0.52;
        const cz = k ? bz + bw - sw / 2 : bz + sw / 2;
        const y0 = sillY + 0.05;
        this.box(0.035, 0.04, sw, this.alu, sx, y0, cz);
        this.box(0.035, 0.04, sw, this.alu, sx, y0 + paneH - 0.04, cz);
        this.box(0.035, paneH, 0.04, this.alu, sx, y0, cz - sw / 2 + 0.02);
        this.box(0.035, paneH, 0.04, this.alu, sx, y0, cz + sw / 2 - 0.02);
        const p = this.add(new THREE.PlaneGeometry(sw - 0.06, paneH - 0.07), this.glass, sx, y0 + paneH / 2, cz, { cast: false, receive: false, ry });
        p.renderOrder = 2;
        this.blockers.push(p);
        // 잠금 손잡이
        this.box(0.03, 0.09, 0.025, this.chrome, sx + dir * 0.03, y0 + paneH * 0.45, k ? cz - sw / 2 + 0.06 : cz + sw / 2 - 0.06, false);
      }
      // 롤 블라인드: 칸마다 내려온 길이가 다름
      if (!o.blinds) continue;
      const drop = [0.42, 0.95, 0.3, 0.7, 0.18][i % 5];
      const bx = x + dir * 0.2;
      const roll = this.add(new THREE.CylinderGeometry(0.04, 0.04, bw - 0.08, 10), this.laminateWhite, bx, topY + 0.1, bz + bw / 2);
      roll.rotation.x = Math.PI / 2;
      this.box(0.012, drop, bw - 0.14, this.fabric, bx, topY + 0.06 - drop, bz + bw / 2);
      this.box(0.02, 0.025, bw - 0.12, this.alu, bx, topY + 0.05 - drop, bz + bw / 2, false); // 아래 무게 막대
      // 줄
      this.box(0.006, 0.9, 0.006, paint(0xd8d2c4, 0.9), bx + dir * 0.01, topY - 0.9, bz + bw - 0.12, false);
    }
    // 블라인드 박스 (천장 아래 길게)
    if (o.blinds) this.box(0.14, 0.12, len - 0.1, this.laminateWhite, x + dir * 0.2, topY + 0.04, zc, false);
  }
}
