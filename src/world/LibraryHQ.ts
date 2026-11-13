// 2층 도서관 (예전 급식실 자리): 참고 사진처럼 낮은 책장, 알록달록한 의자·쿠션, 큰 창, 대출 데스크.
// 범위: x 3.0~15.0, z 16.2~27.0 (벽 안쪽), 바닥 y 0. 남쪽 벽(복도 쪽)과 문 자리는 SchoolMap.buildHallway.
import { SCHOOL_SHORT } from '../data/school';
import * as THREE from 'three';
import { aabb } from './Collision';
import { CanvasTex, font } from './canvasTex';
import { bookRow } from './classroomFurniture';
import { HQBuilder } from './hq';
import { mergeChildrenByColor } from './merge';
import { TILE, aoMaterial, paint, pbr, worldUV } from './pbr';
import { CEIL_H } from './rooms';

const X0 = 3.0, X1 = 15.0, Z0 = 16.2, Z1 = 27.0;

export class LibraryBuilder extends HQBuilder {
  private wood = pbr('oak', { color: 0xf3e2c8, roughness: 0.55 });
  private plaster = pbr('plaster', { roughness: 0.9 });
  private books = new THREE.Group();

  build() {
    this.y = 0;
    this.level = 1;
    this.root.add(this.books);
    const w = X1 - X0 + 0.2, d = Z1 - Z0 + 0.2, xc = (X0 + X1) / 2, zc = (Z0 + Z1) / 2;
    const f = this.add(worldUV(new THREE.PlaneGeometry(w, d), w, d, 0, TILE.laminate), pbr('laminate', { roughness: 0.6, envMapIntensity: 0.8 }), xc, 0.003, zc, { cast: false });
    f.rotation.x = -Math.PI / 2;
    this.walls();
    this.ceiling(xc, zc, w, d);
    this.rug();
    this.lowShelves();
    this.wallShelves();
    this.readingTables();
    this.desk();
    this.decor();
    mergeChildrenByColor(this.books, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
  }

  private wall(wd: number, dd: number, x: number, z: number) {
    const m = this.box(wd, CEIL_H, dd, this.plaster, x, 0, z, true, TILE.plaster);
    this.blockers.push(m);
    this.colliders.push({ ...aabb(x, z, wd, dd), level: this.level });
  }

  private walls() {
    // 서쪽(운동장 쪽): 큰 창 + 블라인드
    this.slidingWindowWall(X0 - 0.1, Z0 - 0.1, Z1 + 0.1, 1, { blinds: true, bays: 4 });
    this.wall(0.2, Z1 - Z0 + 0.4, X1 + 0.1, (Z0 + Z1) / 2);
    this.wall(X1 - X0 + 0.4, 0.2, (X0 + X1) / 2, Z1 + 0.1);
  }

  private ceiling(xc: number, zc: number, w: number, d: number) {
    const c = this.add(worldUV(new THREE.PlaneGeometry(w, d), w, d, 0, TILE.ceiling), pbr('ceiling', { roughness: 0.95 }), xc, CEIL_H - 0.002, zc, { cast: true });
    c.rotation.x = Math.PI / 2;
    this.blockers.push(c);
    const led = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e8, emissiveIntensity: 1.2, roughness: 0.5 });
    led.userData.pbr = true; // 천장 등은 한 덩어리로 합쳐 그린다
    for (const x of [5.4, 9.0, 12.6])
      for (const z of [18.2, 21.6, 25.0]) {
        this.box(0.66, 0.03, 0.66, this.alu, x, CEIL_H - 0.032, z, false);
        this.box(0.6, 0.012, 0.6, led, x, CEIL_H - 0.042, z, false);
      }
    for (const [x, z, len, nx, nz] of [
      [X0, zc, Z1 - Z0, 1, 0], [X1, zc, Z1 - Z0, -1, 0], [xc, Z0, X1 - X0, 0, 1], [xc, Z1, X1 - X0, 0, -1],
    ] as [number, number, number, number, number][]) {
      const m = this.add(new THREE.PlaneGeometry(len, 0.45), aoMaterial(), x + nx * 0.225, 0.008, z + nz * 0.225, { cast: false, receive: false });
      m.rotation.order = 'YXZ';
      m.rotation.set(-Math.PI / 2, Math.atan2(nx, nz), 0);
    }
  }

  /** 둥근 러그 + 빈백·방석 (책 읽는 마당) */
  private rug() {
    const rug = this.add(new THREE.CircleGeometry(1.9, 40), paint(0x8ecae6, 0.95), 6.2, 0.006, 24.4, { cast: false });
    rug.rotation.x = -Math.PI / 2;
    const ring = this.add(new THREE.RingGeometry(1.5, 1.7, 40), paint(0xffd166, 0.95), 6.2, 0.007, 24.4, { cast: false });
    ring.rotation.x = -Math.PI / 2;
    const cushions = [0xef476f, 0xffd166, 0x06d6a0, 0x118ab2, 0x9b5de5, 0xf78c6b];
    cushions.forEach((c, i) => {
      const a = (i / cushions.length) * Math.PI * 2;
      const bag = this.add(new THREE.SphereGeometry(0.34, 14, 10), paint(c, 0.9), 6.2 + Math.cos(a) * 1.25, 0.2, 24.4 + Math.sin(a) * 1.25);
      bag.scale.set(1, 0.6, 1);
    });
    this.colliders.push({ ...aabb(6.2, 24.4, 2.9, 2.9), level: this.level });
  }

  /** 낮은 책장 (높이 0.95, 양면) 두 줄 — 참고 사진. 책은 z 방향으로 만든 뒤 돌려서 x 방향 책장에 꽂는다 */
  private lowShelves() {
    const L = 3.2, Dp = 0.6, H = 0.95;
    for (const [x, z] of [[10.6, 19.4], [10.6, 22.0]] as [number, number][]) {
      this.box(L, 0.06, Dp, this.dark, x, 0, z);
      // 열린 양면 책장: 가운데 판 + 양 끝 판 + 가운데 선반 (책이 양쪽에서 보인다)
      this.box(L, H - 0.06, 0.04, this.laminateWhite, x, 0.06, z);
      for (const e of [-1, 1]) this.box(0.04, H - 0.06, Dp, this.laminateWhite, x + e * (L / 2 - 0.02), 0.06, z);
      for (const sd of [-1, 1]) {
        this.box(L - 0.08, 0.025, Dp / 2 - 0.02, this.laminateWhite, x, 0.065, z + sd * (Dp / 4));
        this.box(L - 0.08, 0.025, Dp / 2 - 0.02, this.laminateWhite, x, 0.47, z + sd * (Dp / 4));
      }
      this.box(L + 0.04, 0.03, Dp + 0.04, this.wood, x, H, z, true, TILE.oak);
      for (const side of [-1, 1]) {
        const m = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(x, 0, z + side * 0.15);
        for (const y of [0.09, 0.5]) {
          const tmp = new THREE.Group();
          bookRow(tmp, -L / 2 + 0.08, L / 2 - 0.08, y, 0.33, 0.2, 0, Math.round(x * 10 + z * 3 + y * 10 + side + 5));
          for (const b of [...tmp.children]) {
            b.applyMatrix4(m);
            this.books.add(b);
          }
        }
      }
      this.colliders.push({ ...aabb(x, z, L, Dp), level: this.level });
    }
  }

  /** 벽 책장 (높이 1.9): 동쪽·북쪽 */
  private wallShelves() {
    const unit = (x: number, z: number, alongZ: boolean, len: number) => {
      const Dp = 0.35, H = 1.9;
      const w = alongZ ? Dp : len, d = alongZ ? len : Dp;
      this.box(w, H, d, this.laminateWhite, x, 0, z);
      for (const y of [0.08, 0.5, 0.92, 1.34]) {
        const g = new THREE.Group();
        g.position.set(x, 0, z);
        if (!alongZ) g.rotation.y = Math.PI / 2;
        g.updateMatrix();
        const tmp = new THREE.Group();
        bookRow(tmp, -len / 2 + 0.05, len / 2 - 0.05, y, 0.36, 0.26, alongZ ? (x > 9 ? -0.06 : 0.06) : 0.06, Math.round(x * 7 + z * 5 + y * 13));
        for (const b of [...tmp.children]) {
          b.applyMatrix4(g.matrix);
          this.books.add(b);
        }
      }
      this.colliders.push({ ...aabb(x, z, w, d), level: this.level });
    };
    unit(X1 - 0.2, 19.2, true, 3.6);
    unit(X1 - 0.2, 24.0, true, 3.6);
    unit(10.6, Z1 - 0.2, false, 4.0);
  }

  /** 읽기 책상 + 알록달록 의자 */
  private readingTables() {
    const chairCols = [0xef476f, 0xffd166, 0x06d6a0, 0x118ab2];
    for (const [x, z] of [[5.6, 18.6], [5.6, 21.2]] as [number, number][]) {
      const top = this.box(2.0, 0.04, 1.0, this.wood, x, 0.66, z, true, TILE.oak);
      void top;
      for (const sx of [-0.9, 0.9]) for (const sz of [-0.4, 0.4]) this.box(0.05, 0.66, 0.05, this.chrome, x + sx, 0, z + sz);
      [[-0.5, -0.75], [0.5, -0.75], [-0.5, 0.75], [0.5, 0.75]].forEach(([dx, dz], i) => {
        const col = paint(chairCols[(i + Math.round(z)) % 4], 0.5);
        this.rbox(0.4, 0.05, 0.4, col, x + dx, 0.4, z + dz, 0.02);
        this.rbox(0.4, 0.38, 0.05, col, x + dx, 0.45, z + dz + Math.sign(dz) * 0.18, 0.02);
        for (const lx of [-0.16, 0.16]) for (const lz of [-0.16, 0.16]) this.box(0.025, 0.4, 0.025, this.chrome, x + dx + lx, 0, z + dz + lz, false);
      });
      this.colliders.push({ ...aabb(x, z, 2.1, 2.2), level: this.level });
    }
  }

  /** 대출 데스크 (입구 오른쪽) */
  private desk() {
    const x = 12.6, z = 17.3;
    this.box(2.2, 0.95, 0.6, this.wood, x, 0, z, true, TILE.oak);
    this.box(2.3, 0.04, 0.7, this.laminateWhite, x, 0.95, z);
    this.box(0.5, 0.32, 0.03, paint(0x1b1e22, 0.3), x - 0.4, 0.99, z + 0.12);
    this.box(0.45, 0.4, 0.4, paint(0x4ea8de, 0.5), x + 0.8, 0.99, z);
    this.colliders.push({ ...aabb(x, z, 2.3, 0.7), level: this.level });
    const t = new CanvasTex(256, 64);
    t.draw((c, w, h) => {
      c.fillStyle = '#2d6a4f';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff';
      c.font = font(32, true);
      c.textAlign = 'center';
      c.fillText('대출 · 반납', w / 2, 44);
    });
    this.add(new THREE.PlaneGeometry(0.8, 0.2), t.material(), x, 0.7, z - 0.31, { cast: false, ry: Math.PI });
  }

  private decor() {
    const t = new CanvasTex(512, 160);
    t.draw((c, w, h) => {
      c.fillStyle = '#fff8e7';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#e76f51';
      c.font = font(56, true);
      c.textAlign = 'center';
      c.fillText(`책 읽는 ${SCHOOL_SHORT}`, w / 2, 80);
      c.fillStyle = '#457b9d';
      c.font = font(28);
      c.fillText('한 달에 한 권 더! 도서관에서 만나요', w / 2, 130);
    });
    this.add(new THREE.PlaneGeometry(2.4, 0.75), t.material(), 10.6, 2.35, Z1 - 0.39, { cast: false, ry: Math.PI });
    // 화분
    for (const [x, z] of [[14.5, 26.5], [3.5, 16.7]] as [number, number][]) {
      this.add(new THREE.CylinderGeometry(0.2, 0.16, 0.4, 14), paint(0xd9805f, 0.8), x, 0.2, z);
      const l = this.add(new THREE.IcosahedronGeometry(0.38, 1), paint(0x4f8a3c, 0.85), x, 0.75, z);
      l.scale.y = 1.2;
    }
  }
}
