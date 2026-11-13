// 고품질 복도 (2층): 실제 한국 초등학교 복도처럼.
// - 인조석 바닥(반사), 흰 페인트 벽 + 짙은 걸레받이, 흡음 텍스 천장 + 매립 LED
// - 창문 벽: 벽에 뚫린 창 + 두께 있는 초록 금속 창틀 + 미닫이 창 두 겹 + 유리 반사 + 쇠 손잡이
// - 색깔 기둥·보(모서리 둥근), 교실 쪽 나무틀 유리창, 미닫이 나무 문, 모서리 그림자, 비상구 등
// 모든 좌표는 SchoolMap과 같다 (복도 x 7.1~11.1, z -16.1~16.1, 천장 높이 3).
import * as THREE from 'three';
import { aabb } from './Collision';
import { TILE, aoMaterial, paint, pbr, worldUV } from './pbr';
import { HQBuilder } from './hq';

const H = 3; // 천장
const X_IN = 7.2; // 교실 쪽 벽 안쪽 면
const X_OUT = 11.0; // 창문 쪽 벽 안쪽 면

export interface CorridorSpec {
  baseY: number;
  level: 0 | 1;
  z0: number;
  z1: number;
  /** 창문 벽(동쪽) 구간 */
  windows: [number, number][];
  /** 교실 쪽 위 유리창 구간 (clear = 안이 보이는 투명 유리) */
  transoms: { z0: number; z1: number; clear: boolean }[];
  /** 색깔 아치 위치 */
  arches: number[];
  /** 열린 교실 문 (벽에 뚫린 자리) — 문틀 + 옆으로 밀어 둔 미닫이 문 */
  openDoors: { z0: number; z1: number }[];
}

export class CorridorBuilder extends HQBuilder {
  build(s: CorridorSpec) {
    this.y = s.baseY;
    this.level = s.level;
    const len = s.z1 - s.z0, zc = (s.z0 + s.z1) / 2;
    const w = X_OUT - X_IN;
    // 바닥: 인조석 (살짝 반사)
    const floorGeo = worldUV(new THREE.PlaneGeometry(w, len), w, len, 0, TILE.terrazzo);
    const floor = this.add(floorGeo, pbr('terrazzo', { roughness: 0.75, envMapIntensity: 0.9, normalScale: 0.5 }), 9.1, 0.004, zc, { cast: false });
    floor.rotation.x = -Math.PI / 2;
    // 마름모 무늬 (짙은 인조석)
    const inlay = pbr('terrazzo', { color: 0xa9a59c, roughness: 0.7 });
    for (let z = s.z0 + 4; z < s.z1 - 2; z += 6) {
      const d = this.add(worldUV(new THREE.PlaneGeometry(0.62, 0.62), 0.62, 0.62, 0, TILE.terrazzo), inlay, 9.1, 0.006, z, { cast: false });
      d.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
    }
    // 천장: 흡음 텍스 + 매립 LED (알루미늄 테두리)
    const ceil = this.add(worldUV(new THREE.PlaneGeometry(w, len), w, len, 0, TILE.ceiling), pbr('ceiling', { roughness: 0.95 }), 9.1, H - 0.002, zc, { cast: true });
    ceil.rotation.x = Math.PI / 2;
    this.blockers.push(ceil);
    const led = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfffbf0, emissiveIntensity: 1.25, roughness: 0.4 });
    led.userData.pbr = true; // 천장 등은 한 덩어리로 합쳐 그린다
    for (let z = s.z0 + 1.6; z < s.z1 - 0.5; z += 3.2) {
      this.box(1.24, 0.03, 0.34, this.chrome, 9.1, H - 0.035, z, false);
      this.box(1.16, 0.02, 0.26, led, 9.1, H - 0.045, z, false);
    }
    // 걸레받이 + 모서리 그림자 (바닥·천장 쪽)
    for (const [x, dir] of [[X_IN, 1], [X_OUT, -1]] as [number, number][]) {
      this.box(0.025, 0.12, len, this.dark, x + dir * 0.0125, 0, zc, false);
      this.aoStrip(x, dir, zc, len);
    }
    for (const win of s.windows) this.windowWall(win[0], win[1]);
    for (const t of s.transoms) this.transom(t.z0, t.z1, t.clear);
    s.arches.forEach((z, i) => this.arch(z, [0xf3b6c9, 0xa8dcc0, 0xcdbdf3, 0xffd9ae][(i + s.level) % 4]));
    for (const d of s.openDoors) this.openDoor(d.z0, d.z1);
  }

  /** 벽 쪽이 어둡고 복도 가운데로 갈수록 투명한 띠 (바닥·천장) */
  private aoStrip(x: number, dir: number, zc: number, len: number) {
    for (const [y, flip] of [[0.009, false], [H - 0.004, true]] as [number, boolean][]) {
      const g = new THREE.PlaneGeometry(len, flip ? 0.35 : 0.5);
      const m = this.add(g, aoMaterial(), x + dir * (flip ? 0.175 : 0.25), y, zc, { cast: false, receive: false });
      // 텍스처 위쪽(v=1)이 어두움 → 벽 쪽이 위가 되도록 돌린다
      m.rotation.order = 'YXZ';
      m.rotation.set(flip ? Math.PI / 2 : -Math.PI / 2, dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      if (flip) m.rotation.y += Math.PI;
    }
  }

  /** 창문 벽 한 구간 (x = 11.1 벽, 바깥은 하늘) */
  private windowWall(z0: number, z1: number) {
    const len = z1 - z0, zc = (z0 + z1) / 2;
    const plaster = pbr('plaster', { roughness: 0.9 });
    // 창 아래 벽, 창 위 벽(인방)
    this.box(0.24, 0.9, len, plaster, 11.1, 0, zc, true, TILE.plaster);
    this.box(0.24, 0.42, len, plaster, 11.1, H - 0.42, zc, true, TILE.plaster);
    // 창턱 (돌판)
    this.box(0.34, 0.04, len, paint(0xb8b9b4, 0.5), 11.04, 0.9, zc);
    this.colliders.push({ ...aabb(11.1, zc, 0.24, len), level: this.level });
    // 창틀: 칸마다 미닫이 두 장
    const top = H - 0.42, bot = 0.94, hgt = top - bot;
    const bays = Math.max(1, Math.round(len / 1.7));
    const bw = len / bays;
    this.box(0.12, 0.06, len, this.frame, 11.1, bot, zc);
    this.box(0.12, 0.06, len, this.frame, 11.1, top - 0.06, zc);
    for (let i = 0; i <= bays; i++) this.box(0.14, hgt, 0.07, this.frame, 11.1, bot, z0 + i * bw);
    for (let i = 0; i < bays; i++) {
      for (const k of [0, 1]) {
        const sx = 11.1 + (k ? 0.035 : -0.035);
        const swid = bw * 0.52;
        const cz = k ? z0 + i * bw + bw - swid / 2 : z0 + i * bw + swid / 2;
        // 창짝 테두리
        this.box(0.04, 0.045, swid, this.frame, sx, bot + 0.06, cz);
        this.box(0.04, 0.045, swid, this.frame, sx, top - 0.105, cz);
        this.box(0.04, hgt - 0.12, 0.045, this.frame, sx, bot + 0.06, cz - swid / 2 + 0.0225);
        this.box(0.04, hgt - 0.12, 0.045, this.frame, sx, bot + 0.06, cz + swid / 2 - 0.0225);
        this.box(0.03, 0.035, swid, this.frame, sx, bot + 0.06 + (hgt - 0.12) * 0.55, cz); // 가로살
        const pane = this.add(new THREE.PlaneGeometry(swid - 0.05, hgt - 0.17), this.glass, sx, bot + 0.06 + (hgt - 0.12) / 2, cz, { cast: false, receive: false, ry: -Math.PI / 2 });
        pane.renderOrder = 2;
      }
    }
    // 쇠 손잡이 두 줄 + 받침
    for (const y of [1.08, 1.4]) {
      const rail = this.add(new THREE.CylinderGeometry(0.019, 0.019, len - 0.2, 10), this.chrome, X_OUT - 0.11, y, zc, { receive: false });
      rail.rotation.x = Math.PI / 2;
    }
    for (let z = z0 + 0.3; z < z1; z += 1.8) {
      this.box(0.11, 0.035, 0.035, this.chrome, X_OUT - 0.06, 1.08, z);
      this.box(0.11, 0.035, 0.035, this.chrome, X_OUT - 0.06, 1.4, z);
    }
  }

  /** 교실 쪽 벽 위 나무틀 유리창 */
  private transom(z0: number, z1: number, clear: boolean) {
    const len = z1 - z0, zc = (z0 + z1) / 2;
    const oak = pbr('oak', { roughness: 0.7 });
    const y0 = 2.0, h = 0.72;
    this.box(0.1, 0.06, len, oak, 7.16, y0, zc, true, TILE.oak);
    this.box(0.1, 0.06, len, oak, 7.16, y0 + h - 0.06, zc, true, TILE.oak);
    const n = Math.max(1, Math.round(len / 1.1));
    for (let i = 0; i <= n; i++) this.box(0.1, h, 0.06, oak, 7.16, y0, z0 + (i * len) / n, true, TILE.oak);
    for (let i = 0; i < n; i++) {
      const p = this.add(new THREE.PlaneGeometry(len / n - 0.07, h - 0.12), clear ? this.glass : this.frost, 7.22, y0 + h / 2, z0 + ((i + 0.5) * len) / n, { cast: false, ry: Math.PI / 2 });
      p.renderOrder = 2;
    }
  }

  /** 색깔 기둥 두 개 + 보 (모서리 둥근 도장) */
  private arch(z: number, color: number) {
    const m = paint(color, 0.72);
    this.rbox(0.3, H, 0.44, m, X_IN + 0.15, 0, z);
    this.rbox(0.3, H, 0.44, m, X_OUT - 0.15, 0, z);
    this.rbox(X_OUT - X_IN, 0.46, 0.44, m, (X_IN + X_OUT) / 2, H - 0.46, z);
    this.colliders.push({ ...aabb(X_IN + 0.15, z, 0.3, 0.44), level: this.level }, { ...aabb(X_OUT - 0.15, z, 0.3, 0.44), level: this.level });
  }

  /** 열린 교실 문: 나무 문틀 + 옆 벽에 밀어 둔 미닫이 문 */
  private openDoor(z0: number, z1: number) {
    const oak = pbr('oak', { roughness: 0.65 });
    const zc = (z0 + z1) / 2, w = z1 - z0;
    this.box(0.12, 0.08, w + 0.16, oak, 7.17, 2.1, zc, true, TILE.oak);
    this.box(0.12, 2.1, 0.08, oak, 7.17, 0, z0 - 0.04, true, TILE.oak);
    this.box(0.12, 2.1, 0.08, oak, 7.17, 0, z1 + 0.04, true, TILE.oak);
    // 미닫이 문짝 (반쯤 열려 벽 앞에 겹쳐 있음)
    const dz = z0 - w * 0.55;
    this.door(7.27, dz, w, oak);
  }

  /** 나무 미닫이 문짝 (유리창·손잡이) — x: 벽 앞면 위치 */
  door(x: number, z: number, w: number, oak = pbr('oak', { roughness: 0.65 })) {
    const g = new THREE.Group();
    g.position.set(x, this.y, z);
    this.root.add(g);
    const panel = new THREE.Mesh(worldUV(new THREE.BoxGeometry(0.045, 2.04, w), 0.045, 2.04, w, TILE.oak), oak);
    panel.position.y = 1.02;
    panel.castShadow = panel.receiveShadow = true;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.55, 0.62), this.glass);
    win.position.set(0.026, 1.5, 0);
    win.rotation.y = Math.PI / 2;
    win.renderOrder = 2;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.05), this.chrome);
    handle.position.set(0.04, 1.0, w / 2 - 0.12);
    g.add(panel, win, handle);
    return g;
  }
}
