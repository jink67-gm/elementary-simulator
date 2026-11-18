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
    this.accentWalls();
    this.ceiling(xc, zc, w, d);
    this.readingSteps();
    this.lowShelves();
    this.wallShelves();
    this.readingTables();
    this.desk();
    this.newBooks();
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

  /** 벽 아래 연두색 징두리 + 나무 띠 (도서관다운 따뜻한 벽) */
  private accentWalls() {
    const green = paint(0xcfe3c2, 0.85), rail = pbr('oak', { color: 0xd8b48a, roughness: 0.55 });
    // 북쪽 벽 (안쪽 면 z = Z1) · 동쪽 벽 (안쪽 면 x = X1)
    this.add(new THREE.PlaneGeometry(X1 - X0, 1.0), green, (X0 + X1) / 2, 0.6, Z1 - 0.001, { cast: false, ry: Math.PI });
    this.box(X1 - X0, 0.05, 0.03, rail, (X0 + X1) / 2, 1.08, Z1 - 0.015, false);
    this.add(new THREE.PlaneGeometry(Z1 - Z0, 1.0), green, X1 - 0.001, 0.6, (Z0 + Z1) / 2, { cast: false, ry: -Math.PI / 2 });
    this.box(0.03, 0.05, Z1 - Z0, rail, X1 - 0.015, 1.08, (Z0 + Z1) / 2, false);
  }

  /** 계단식 독서 공간 (북서쪽 구석): 나무 단 세 칸 + 방석 + 단 앞 둥근 러그 */
  private readingSteps() {
    const x0 = X0 + 0.1, z1 = Z1 - 0.1, W = 3.4;
    const oak = pbr('oak', { color: 0xf0d7b0, roughness: 0.55 });
    const cushions = [0xf4a6a6, 0xffd98e, 0xa8d8b9, 0x9cc9e8, 0xc7b3e6];
    for (let i = 0; i < 3; i++) {
      // 단: 북쪽 벽에서 남쪽으로 내려오는 계단 (뒤가 높다)
      const h = 0.4 * (i + 1), dep = 0.7, zc = z1 - 2.1 + dep / 2 + i * dep;
      this.box(W, h, dep, oak, x0 + W / 2, 0, zc, true, TILE.oak);
      this.box(W, 0.012, 0.03, paint(0xb08a62, 0.6), x0 + W / 2, h, zc - dep / 2 + 0.015, false); // 모서리 띠
      // 방석 (네모난 쿠션, 단마다 둘)
      for (let k = 0; k < 2; k++) this.rbox(0.55, 0.08, 0.5, paint(cushions[(i * 2 + k) % cushions.length], 0.9), x0 + 0.8 + k * 1.6 + (i % 2) * 0.3, h, zc, 0.03);
    }
    this.colliders.push({ ...aabb(x0 + W / 2, z1 - 1.05, W, 2.1), level: this.level });
    // 단 앞 러그 (둥근 모서리 사각, 테두리 무늬)
    const rt = new CanvasTex(256, 160);
    rt.draw((c, w, h) => {
      c.fillStyle = '#8ecae6';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#ffd166';
      c.lineWidth = 10;
      c.strokeRect(14, 14, w - 28, h - 28);
      c.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 6; i++) c.fillRect(40 + i * 32, 50, 14, 60);
    });
    const rug = this.add(new THREE.PlaneGeometry(3.0, 1.9), new THREE.MeshStandardMaterial({ map: rt.tex, roughness: 0.95 }), x0 + W / 2, 0.006, z1 - 2.1 - 1.05, { cast: false });
    rug.rotation.x = -Math.PI / 2;
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

  /** 벽 책장 (높이 2.1): 나무 틀 + 0.9m마다 칸막이 + 아래 받침 + 위 분류 표지 (한국십진분류) */
  private wallShelves() {
    const oak = pbr('oak', { color: 0xf0d7b0, roughness: 0.55 }), back = paint(0xf6f3ec, 0.7);
    const KDC = ['000 총류', '100 철학', '200 종교', '300 사회', '400 과학', '500 기술', '600 예술', '700 언어', '800 문학', '동화·그림책'];
    let label = 0;
    const unit = (x: number, z: number, alongZ: boolean, len: number) => {
      const Dp = 0.36, H = 2.1;
      const g = new THREE.Group();
      g.position.set(x, this.y, z);
      if (!alongZ) g.rotation.y = Math.PI / 2;
      // 자기 좌표: 길이 = z, 깊이 = x (앞면 = -x 쪽: 동쪽 벽은 서쪽을 봄)
      const facing = alongZ ? (x > 9 ? -1 : 1) : 1;
      const prev = this.root, prevY = this.y;
      this.root = g;
      this.y = 0;
      this.box(Dp, 0.08, len, paint(0x6f6a64, 0.7), 0, 0, 0); // 받침
      this.box(0.012, H, len, back, -facing * (Dp / 2 - 0.006), 0, 0, false); // 뒤판
      this.box(Dp, 0.03, len + 0.04, oak, 0, H, 0); // 위판
      const n = Math.max(1, Math.round(len / 0.9));
      for (let i = 0; i <= n; i++) this.box(Dp, H, 0.025, oak, 0, 0, -len / 2 + (i * len) / n); // 칸막이
      const shelves = [0.08, 0.5, 0.92, 1.34, 1.72];
      for (const y of shelves) this.box(Dp - 0.02, 0.022, len - 0.02, oak, 0, y - 0.022, 0, false);
      this.root = prev;
      this.y = prevY;
      prev.add(g);
      g.updateMatrix();
      for (const y of shelves.slice(0, 4)) {
        const tmp = new THREE.Group();
        bookRow(tmp, -len / 2 + 0.05, len / 2 - 0.05, y, 0.36, 0.26, facing * 0.03, Math.round(x * 7 + z * 5 + y * 13));
        for (const b of [...tmp.children]) {
          b.applyMatrix4(g.matrix);
          this.books.add(b);
        }
      }
      // 칸마다 위 분류 표지
      for (let i = 0; i < n; i++) {
        const t = new CanvasTex(192, 48);
        const txt = KDC[label++ % KDC.length];
        t.draw((c, w, h) => {
          c.fillStyle = '#2d6a4f';
          c.fillRect(0, 0, w, h);
          c.fillStyle = '#fff';
          c.font = font(24, true);
          c.textAlign = 'center';
          c.fillText(txt, w / 2, 33);
        });
        const lz = -len / 2 + ((i + 0.5) * len) / n;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.15), t.material());
        m.position.set(facing * (Dp / 2 + 0.004), 2.0, lz);
        m.rotation.y = facing > 0 ? Math.PI / 2 : -Math.PI / 2;
        g.add(m);
      }
      const w = alongZ ? Dp : len, d = alongZ ? len : Dp;
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
      this.rbox(2.0, 0.04, 1.0, this.wood, x, 0.66, z, 0.015);
      this.box(1.9, 0.08, 0.04, paint(0xb8bec4, 0.4, 0.5), x, 0.58, z, false); // 상판 아래 보
      for (const sx of [-0.9, 0.9]) for (const sz of [-0.4, 0.4]) this.box(0.05, 0.66, 0.05, this.chrome, x + sx, 0, z + sz);
      [[-0.5, -0.75], [0.5, -0.75], [-0.5, 0.75], [0.5, 0.75]].forEach(([dx, dz], i) => {
        const col = paint(chairCols[(i + Math.round(z)) % 4], 0.5);
        this.rbox(0.42, 0.045, 0.4, col, x + dx, 0.4, z + dz, 0.02);
        const backR = this.rbox(0.42, 0.26, 0.04, col, x + dx, 0.6, z + dz + Math.sign(dz) * 0.19, 0.02); // 등받이 (틈 위로)
        backR.rotation.x = Math.sign(dz) * 0.1;
        for (const ex of [-0.17, 0.17]) this.box(0.025, 0.22, 0.025, this.chrome, x + dx + ex, 0.43, z + dz + Math.sign(dz) * 0.19, false);
        for (const lx of [-0.16, 0.16]) for (const lz of [-0.16, 0.16]) this.box(0.025, 0.4, 0.025, this.chrome, x + dx + lx, 0, z + dz + lz, false);
      });
      this.colliders.push({ ...aabb(x, z, 2.1, 2.2), level: this.level });
    }
  }

  /** 대출 데스크 (입구 오른쪽): 앞판 + 상판 + PC·바코드 스캐너·도장 + 옆 반납함 + 매단 표지 */
  private desk() {
    const x = 12.6, z = 17.3;
    const oak = pbr('oak', { color: 0xf0d7b0, roughness: 0.55 });
    this.box(2.2, 0.92, 0.6, oak, x, 0, z, true, TILE.oak);
    this.box(2.2, 0.15, 0.02, paint(0x2d6a4f, 0.6), x, 0.62, z - 0.31, false); // 앞판 초록 띠
    this.rbox(2.3, 0.04, 0.72, this.laminateWhite, x, 0.92, z, 0.012);
    // 모니터 + 받침 + 키보드 + 바코드 스캐너 + 도장
    this.box(0.5, 0.32, 0.03, paint(0x1b1e22, 0.3), x - 0.4, 1.06, z + 0.12);
    this.box(0.06, 0.1, 0.06, paint(0x8a9096, 0.4, 0.5), x - 0.4, 0.96, z + 0.14, false);
    this.box(0.4, 0.02, 0.14, paint(0x2b2f33, 0.5), x - 0.4, 0.965, z - 0.08, false);
    this.box(0.07, 0.16, 0.07, paint(0x343a40, 0.5), x + 0.15, 0.96, z - 0.05, false);
    this.add(new THREE.CylinderGeometry(0.03, 0.035, 0.07, 12), paint(0xc0392b, 0.6), x + 0.35, 1.0, z - 0.1);
    // 반납함 (옆, 앞면 투입구)
    this.box(0.5, 0.85, 0.45, paint(0x4ea8de, 0.5), x + 1.45, 0, z);
    this.box(0.36, 0.05, 0.02, paint(0x1b1e22, 0.6), x + 1.45, 0.66, z - 0.23, false);
    const rt = new CanvasTex(128, 48);
    rt.draw((c, w, h) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#1d3557';
      c.font = font(26, true);
      c.textAlign = 'center';
      c.fillText('반납함', w / 2, 33);
    });
    this.add(new THREE.PlaneGeometry(0.32, 0.12), rt.material(), x + 1.45, 0.48, z - 0.231, { cast: false, ry: Math.PI });
    this.colliders.push({ ...aabb(x + 0.25, z, 2.8, 0.7), level: this.level });
    // 천장에 매단 「대출 · 반납」 표지
    const t = new CanvasTex(256, 64);
    t.draw((c, w, h) => {
      c.fillStyle = '#2d6a4f';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff';
      c.font = font(32, true);
      c.textAlign = 'center';
      c.fillText('대출 · 반납', w / 2, 44);
    });
    this.add(new THREE.PlaneGeometry(0.9, 0.22), t.material(), x, 2.25, z - 0.2, { cast: false, ry: Math.PI });
    this.add(new THREE.PlaneGeometry(0.9, 0.22), t.material(), x, 2.25, z - 0.199, { cast: false });
    for (const dx of [-0.38, 0.38]) this.add(new THREE.CylinderGeometry(0.005, 0.005, CEIL_H - 2.36, 6), this.chrome, x + dx, 2.36 + (CEIL_H - 2.36) / 2, z - 0.2, { cast: false });
  }

  /** 신간 도서 진열대 (표지가 앞을 보는 비스듬한 선반 3단) + 도서 검색 PC */
  private newBooks() {
    const x = 6.9, z = 17.0; // 입구(x 8~10) 왼쪽 벽 앞
    const oak = pbr('oak', { color: 0xf0d7b0, roughness: 0.55 });
    for (const sx of [-1, 1]) this.box(0.04, 1.3, 0.45, oak, x + sx * 0.6, 0, z);
    this.box(1.24, 0.04, 0.45, oak, x, 1.3, z);
    const cols = [0xe63946, 0x457b9d, 0xf4a261, 0x2a9d8f, 0xffd166, 0x9b5de5, 0x06d6a0, 0xef476f, 0x118ab2];
    for (let r = 0; r < 3; r++) {
      const y = 0.15 + r * 0.4;
      const shelf = this.box(1.16, 0.02, 0.3, oak, x, y, z + 0.04, false);
      shelf.rotation.x = 0.35;
      for (let k = 0; k < 3; k++) {
        const bk = this.box(0.26, 0.32, 0.02, paint(cols[(r * 3 + k) % cols.length], 0.6), x - 0.36 + k * 0.36, y + 0.04, z - 0.04, false);
        bk.rotation.x = -0.3;
      }
    }
    const t = new CanvasTex(256, 64);
    t.draw((c, w, h) => {
      c.fillStyle = '#e76f51';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff';
      c.font = font(30, true);
      c.textAlign = 'center';
      c.fillText('새로 들어온 책', w / 2, 43);
    });
    this.add(new THREE.PlaneGeometry(1.1, 0.26), t.material(), x, 1.5, z + 0.2, { cast: false, ry: Math.PI });
    this.colliders.push({ ...aabb(x, z, 1.3, 0.5), level: this.level });
    // 도서 검색 PC (높은 탁자)
    const px = 10.9, pz = 16.65; // 입구 오른쪽, 대출 데스크 앞
    this.box(0.5, 1.0, 0.45, this.laminateWhite, px, 0, pz);
    this.box(0.45, 0.3, 0.03, paint(0x1b1e22, 0.3), px, 1.08, pz + 0.12);
    const st = new CanvasTex(128, 48);
    st.draw((c, w, h) => {
      c.fillStyle = '#457b9d';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff';
      c.font = font(22, true);
      c.textAlign = 'center';
      c.fillText('도서 검색', w / 2, 32);
    });
    this.add(new THREE.PlaneGeometry(0.36, 0.14), st.material(), px, 0.75, pz - 0.231, { cast: false, ry: Math.PI });
    this.colliders.push({ ...aabb(px, pz, 0.5, 0.45), level: this.level });
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
    // 이달의 추천 도서 게시판 (동쪽 벽, 책장 사이)
    const rb = new CanvasTex(384, 256);
    rb.draw((c, w, h) => {
      c.fillStyle = '#c69c6d';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff8e7';
      c.fillRect(12, 12, w - 24, 46);
      c.fillStyle = '#e76f51';
      c.font = font(28, true);
      c.textAlign = 'center';
      c.fillText('이달의 추천 도서', w / 2, 46);
      const cols = ['#457b9d', '#2a9d8f', '#f4a261', '#9b5de5'];
      for (let i = 0; i < 4; i++) {
        c.fillStyle = cols[i];
        c.fillRect(24 + i * 88, 76, 72, 104);
        c.fillStyle = 'rgba(255,255,255,0.8)';
        c.fillRect(32 + i * 88, 90, 56, 10);
        c.fillStyle = '#fff8e7';
        c.fillRect(24 + i * 88, 190, 72, 40);
      }
    });
    this.box(0.03, 1.0, 1.08, this.alu, X1 - 0.015, 1.1, 21.6, false);
    this.add(new THREE.PlaneGeometry(1.02, 0.94), rb.material(), X1 - 0.032, 1.6, 21.6, { cast: false, ry: -Math.PI / 2 });
    // 화분 (잎 덩어리 여러 개)
    for (const [x, z] of [[14.5, 26.5], [3.5, 16.7]] as [number, number][]) {
      this.add(new THREE.CylinderGeometry(0.2, 0.16, 0.4, 14), paint(0xf3f1ea, 0.6), x, 0.2, z);
      for (let k = 0; k < 4; k++) {
        const l = this.add(new THREE.IcosahedronGeometry(0.2 + (k % 2) * 0.06, 1), paint([0x4f8a3c, 0x5f9e45, 0x3f7a35][k % 3], 0.85), x + Math.cos(k * 1.7) * 0.12, 0.6 + k * 0.12, z + Math.sin(k * 1.7) * 0.12, { cast: true });
        l.scale.y = 1.3;
      }
    }
  }
}
