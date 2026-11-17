// 1층 방 꾸미기: 넓은 현관(실내화 신발장), 교무실, 보건실. 벽·문 자리는 SchoolMap.buildFirstFloor.
// 좌표: 1층 바닥 y = FLOOR1_Y. 현관 x 11.1~18.0 (남쪽으로 옮김: LOBBY) → 복도 → 건너편 계단실(rooms STAIR) / 교무실·보건실은 복도 서쪽(운동장 쪽)
// 현관과 정문 바깥은 처음 만든 자리(LOBBY_SRC) 좌표로 짓고 통째로 ENTRANCE_DZ만큼 옮긴다.
// 교무실·보건실은 예전 자리(복도 동쪽, OFFICE_SRC·NURSE_SRC) 좌표로 짓고 통째로 180° 돌려 서쪽으로 옮긴다 (ROOM_MOVE)
import * as THREE from 'three';
import { aabb } from './Collision';
import { CanvasTex, font } from './canvasTex';
import { HQBuilder } from './hq';
import { TILE, aoMaterial, paint, pbr, worldUV } from './pbr';
import { CEIL_H, FLOOR1_Y } from './rooms';
import { SCHOOL_NAME } from '../data/school';
import { TILE_EXT, graniteMat } from './exteriorTex';
import { makeSlipperPair } from './slipper';

/** 현관 (처음 만든 자리 좌표 — 모습·정문 바깥은 이 좌표로 짓는다) */
export const LOBBY_SRC = { x0: 11.1, x1: 18.0, z0: -4.5, z1: 1.0, doorZ0: -2.6, doorZ1: -0.4 };
/** 현관을 남쪽으로 옮긴 거리: 정문 → 현관 → 복도 건너 계단 1단이 한 줄로 보이게 */
export const ENTRANCE_DZ = -8.875;
/** 교문·현관 출입문 가운데 z (현관 → 복도 → 계단 1단이 이 줄에 있다) */
export const GATE_Z = (LOBBY_SRC.doorZ0 + LOBBY_SRC.doorZ1) / 2 + ENTRANCE_DZ;
/** 실제(옮긴) 현관 */
export const LOBBY = { ...LOBBY_SRC, z0: LOBBY_SRC.z0 + ENTRANCE_DZ, z1: LOBBY_SRC.z1 + ENTRANCE_DZ, doorZ0: LOBBY_SRC.doorZ0 + ENTRANCE_DZ, doorZ1: LOBBY_SRC.doorZ1 + ENTRANCE_DZ };
const OFFICE_SRC = { x0: 11.2, x1: 14.8, z0: 1.1, z1: 7.9, doorZ: 3.0 };
const NURSE_SRC = { x0: 11.2, x1: 14.8, z0: 8.1, z1: 11.9, doorZ: 10.0 };
/** 예전 자리 → 새 자리: (x, z) → (dx - x, dz - z) (y축 180° 회전 + 이동) */
const ROOM_MOVE = { dx: 18.2, dz: 5.6 };
const moved = (r: { x0: number; x1: number; z0: number; z1: number; doorZ: number }) => ({ x0: ROOM_MOVE.dx - r.x1, x1: ROOM_MOVE.dx - r.x0, z0: ROOM_MOVE.dz - r.z1, z1: ROOM_MOVE.dz - r.z0, doorZ: ROOM_MOVE.dz - r.doorZ });
/** 복도 서쪽 교무실 (문: 복도 쪽 벽 x 7.1, 현관 정면) */
export const OFFICE = moved(OFFICE_SRC);
/** 복도 서쪽 보건실 (교무실 남쪽 옆) */
export const NURSE = moved(NURSE_SRC);

export class FirstFloorBuilder extends HQBuilder {
  private wood = pbr('oak', { color: 0xf3e2c8, roughness: 0.55 });

  build() {
    this.y = FLOOR1_Y;
    this.level = 0;
    // 현관: 처음 자리 좌표로 지어 남쪽으로 옮긴다 (충돌 상자도 같이)
    {
      const prev = this.root, grp = new THREE.Group();
      grp.position.z = ENTRANCE_DZ;
      prev.add(grp);
      this.root = grp;
      const c0 = this.colliders.length;
      this.lobby();
      this.root = prev;
      for (let i = c0; i < this.colliders.length; i++) {
        this.colliders[i].minZ += ENTRANCE_DZ;
        this.colliders[i].maxZ += ENTRANCE_DZ;
      }
    }
    // 교무실·보건실: 예전 좌표로 지은 뒤 180° 돌려 서쪽으로 (충돌 상자도 같이 옮긴다)
    const prev = this.root, grp = new THREE.Group();
    grp.position.set(ROOM_MOVE.dx, 0, ROOM_MOVE.dz);
    grp.rotation.y = Math.PI;
    prev.add(grp);
    this.root = grp;
    const c0 = this.colliders.length;
    this.office();
    this.nurse();
    this.root = prev;
    for (let i = c0; i < this.colliders.length; i++) {
      const c = this.colliders[i];
      Object.assign(c, { minX: ROOM_MOVE.dx - c.maxX, maxX: ROOM_MOVE.dx - c.minX, minZ: ROOM_MOVE.dz - c.maxZ, maxZ: ROOM_MOVE.dz - c.minZ });
    }
  }

  private room(x0: number, x1: number, z0: number, z1: number, floorMat: THREE.Material, tile: number, lamps: [number, number][], hole?: { x0: number; x1: number; z0: number; z1: number }) {
    const w = x1 - x0, d = z1 - z0, xc = (x0 + x1) / 2, zc = (z0 + z1) / 2;
    const f = this.add(worldUV(new THREE.PlaneGeometry(w, d), w, d, 0, tile), floorMat, xc, 0.004, zc, { cast: false });
    f.rotation.x = -Math.PI / 2;
    // 천장 (hole이 있으면 그 둘레만: 계단이 뚫고 지나가는 자리)
    const ceilRects: [number, number, number, number][] = hole
      ? [[hole.x1, x1, z0, z1], [x0, hole.x1, z0, hole.z0], [x0, hole.x1, hole.z1, z1]]
      : [[x0, x1, z0, z1]];
    for (const [a0, a1, b0, b1] of ceilRects) {
      const cw = a1 - a0, cd = b1 - b0;
      if (cw <= 0.01 || cd <= 0.01) continue;
      const c = this.add(worldUV(new THREE.PlaneGeometry(cw, cd), cw, cd, 0, TILE.ceiling), pbr('ceiling', { roughness: 0.95 }), (a0 + a1) / 2, CEIL_H - 0.002, (b0 + b1) / 2, { cast: true });
      c.rotation.x = Math.PI / 2;
      this.blockers.push(c);
    }
    if (hole) {
      // 뚫린 천장 가장자리 (천장 속 두께가 보이는 띠)
      const band = paint(0xf1efe8, 0.9);
      for (const z of [hole.z0, hole.z1]) this.box(hole.x1 - hole.x0, 0.6, 0.04, band, (hole.x0 + hole.x1) / 2, CEIL_H, z, false);
      this.box(0.04, 0.6, hole.z1 - hole.z0, band, hole.x1, CEIL_H, (hole.z0 + hole.z1) / 2, false);
    }
    const led = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfffbf2, emissiveIntensity: 1.3, roughness: 0.5 });
    led.userData.pbr = true; // 천장 등은 한 덩어리로 합쳐 그린다
    for (const [lx, lz] of lamps) {
      this.box(0.66, 0.03, 0.66, this.alu, lx, CEIL_H - 0.032, lz, false);
      this.box(0.6, 0.012, 0.6, led, lx, CEIL_H - 0.042, lz, false);
    }
    for (const [x, z, len, nx, nz] of [
      [x0, zc, d, 1, 0], [x1, zc, d, -1, 0], [xc, z0, w, 0, 1], [xc, z1, w, 0, -1],
    ] as [number, number, number, number, number][]) {
      const m = this.add(new THREE.PlaneGeometry(len, 0.4), aoMaterial(), x + nx * 0.2, 0.009, z + nz * 0.2, { cast: false, receive: false });
      m.rotation.order = 'YXZ';
      m.rotation.set(-Math.PI / 2, Math.atan2(nx, nz), 0);
    }
  }

  private solid(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
    const m = this.box(w, h, d, mat, x, y, z);
    this.colliders.push({ ...aabb(x, z, w, d), level: this.level });
    return m;
  }

  private poster(text: string[], w: number, h: number, x: number, y: number, z: number, ry: number, head = '#264653') {
    const t = new CanvasTex(512, Math.round((512 * h) / w));
    t.draw((c, cw, ch) => {
      c.fillStyle = '#fffdf6';
      c.fillRect(0, 0, cw, ch);
      c.fillStyle = head;
      c.fillRect(0, 0, cw, 62);
      c.fillStyle = '#fff';
      c.font = font(36, true);
      c.textAlign = 'center';
      c.fillText(text[0], cw / 2, 44);
      c.fillStyle = '#333';
      c.font = font(26);
      text.slice(1).forEach((l, i) => c.fillText(l, cw / 2, 110 + i * 40));
    });
    this.add(new THREE.PlaneGeometry(w, h), t.material(), x, y, z, { cast: false, ry });
  }

  // ───────── 현관: 바깥 신발 구역(화강석) | 실내화 구역(테라조), 학년별 신발장, 안내도·소식 게시판, 방향 표지판 ─────────
  private lobby() {
    const L = LOBBY_SRC;
    this.room(L.x0, L.x1, L.z0, L.z1, pbr('terrazzo', { color: 0xc9c2b4, roughness: 0.7 }), TILE.terrazzo, [[12.6, -1.75], [15.2, -1.75], [17.0, -1.75]]);
    // 바깥 신발 구역 (문 쪽 짙은 화강석) + 노란 경계선 + 바닥 글씨
    const zoneX = 16.3;
    const outer = this.add(worldUV(new THREE.PlaneGeometry(L.x1 - zoneX, L.z1 - L.z0), L.x1 - zoneX, L.z1 - L.z0, 0, TILE_EXT.granite), graniteMat('dark'), (zoneX + L.x1) / 2, 0.007, (L.z0 + L.z1) / 2, { cast: false });
    outer.rotation.x = -Math.PI / 2;
    const line = this.add(new THREE.PlaneGeometry(0.07, L.z1 - L.z0), paint(0xf2b632, 0.5), zoneX, 0.009, (L.z0 + L.z1) / 2, { cast: false });
    line.rotation.x = -Math.PI / 2;
    const ft = new CanvasTex(512, 112);
    ft.draw((c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = 'rgba(46, 125, 90, 0.92)';
      c.font = font(56, true);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('여기서부터 실내화', w / 2, h / 2);
    });
    const decal = this.add(new THREE.PlaneGeometry(1.7, 0.37), new THREE.MeshStandardMaterial({ map: ft.tex, transparent: true, roughness: 0.6, depthWrite: false }), zoneX - 0.45, 0.01, (L.doorZ0 + L.doorZ1) / 2, { cast: false, receive: true });
    decal.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    // 안쪽 발판 (문 앞)
    const mat = this.add(new THREE.PlaneGeometry(1.4, 2.3), paint(0x3d4b5c, 0.98), 17.15, 0.012, (L.doorZ0 + L.doorZ1) / 2, { cast: false });
    mat.rotation.x = -Math.PI / 2;

    // 벽: 아래 1.1m 나무 판 징두리(걸레받이 위) + 위 흰 벽 + 나무 띠 (실제 학교 현관처럼 차분하게)
    const panelM = pbr('oak', { color: 0xe8d6bb, roughness: 0.6 }), railM = pbr('oak', { color: 0xb08a62, roughness: 0.55 });
    const nZ = L.z1 - 0.101, sZ = L.z0 + 0.101;
    for (const [z, ry, dz] of [[nZ, Math.PI, -1], [sZ, 0, 1]] as [number, number, number][]) {
      const len = L.x1 - 0.2 - L.x0;
      this.add(worldUV(new THREE.PlaneGeometry(len, 1.0), len, 1.0, 0, TILE.oak), panelM, L.x0 + len / 2, 0.12 + 0.5, z + dz * 0.002, { cast: false, ry });
      this.box(len, 0.05, 0.03, railM, L.x0 + len / 2, 1.12, z + dz * 0.015, false);
    }

    // 신발장 (사물함처럼 문이 닫힌 칸): 내빈용(북쪽, 위에 검정 슬리퍼 두 켤레) · 교직원(남쪽)
    const inner = paint(0xe7dcc8, 0.8), base = paint(0x5c5f63, 0.6);
    const unit = (x: number, z: number, facing: 1 | -1, label: string, W: number, kind: 'guest' | 'staff') => {
      const H = kind === 'guest' ? 1.2 : 1.8, D = 0.4, t = 0.022;
      this.colliders.push({ ...aabb(x, z, W, D), level: this.level });
      const front = z + (facing * D) / 2, back = z - (facing * D) / 2;
      this.box(W, 0.07, D, base, x, 0, z, false);
      this.box(W, t, D, this.wood, x, H - t, z, false, TILE.oak);
      for (const sx of [-1, 1]) this.box(t, H - 0.07, D, this.wood, x + sx * (W / 2 - t / 2), 0.07, z, false, TILE.oak);
      this.box(W - 2 * t, H - 0.07 - t, 0.012, inner, x, 0.07, back + facing * 0.006, false);
      const rows = kind === 'guest' ? 4 : 6, cols = 5, rowH = (H - 0.07 - t) / rows, colW = (W - 2 * t) / cols;
      for (let r = 1; r < rows; r++) this.box(W - 2 * t, 0.016, D - 0.03, this.wood, x, 0.07 + r * rowH - 0.008, z + facing * 0.012, false);
      for (let c = 1; c < cols; c++) this.box(0.016, H - 0.07 - t, D - 0.03, this.wood, x - W / 2 + t + c * colW, 0.07, z + facing * 0.012, false);
      const ry = facing > 0 ? 0 : Math.PI;
      // 칸마다 닫힌 문 (사물함처럼): 아이보리 철판 문 + 손잡이 + 번호표 + 환기 구멍
      const doorM = paint(0xece8dd, 0.45, 0.25), handleM = paint(0x3a3f45, 0.4, 0.6), slotM = paint(0x8f948f, 0.6);
      let n = 1;
      for (let r = rows - 1; r >= 0; r--)
        for (let c = 0; c < cols; c++, n++) {
          const cx = x - W / 2 + t + (c + 0.5) * colW, cy = 0.07 + r * rowH;
          this.box(colW - 0.014, rowH - 0.014, 0.016, doorM, cx, cy + 0.007, front - facing * 0.004, false);
          this.box(0.012, 0.07, 0.018, handleM, cx + colW / 2 - 0.045, cy + rowH / 2 - 0.035, front + facing * 0.01, false);
          for (let v = 0; v < 3; v++) this.box(colW * 0.5, 0.008, 0.004, slotM, cx - 0.01, cy + rowH - 0.07 - v * 0.018, front + facing * 0.006, false);
        }
      if (kind === 'guest' && x < 16.5)
        // 위에 꺼내 둔 내빈용 검정 슬리퍼 두 켤레 (손님이 바로 신을 수 있게)
        for (const dx of [-W / 2 + 0.15, -W / 2 + 0.4]) {
          const pair = makeSlipperPair(0x1d1e21, 0x2c2d30);
          pair.position.set(x + dx, this.y + H, z - facing * 0.01);
          pair.rotation.y = ry;
          this.root.add(pair);
        }
      // 이름표
      const tag = new CanvasTex(256, 64);
      tag.draw((c, w, h) => {
        c.fillStyle = '#2c4a6b';
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#fff';
        c.font = font(36, true);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(label, w / 2, h / 2 + 2);
      });
      const tx = kind === 'guest' ? x + 0.12 : x;
      const tagY = kind === 'guest' ? H + 0.07 : H - 0.12;
      this.add(new THREE.PlaneGeometry(0.4, 0.1), tag.material(), tx, tagY, front + facing * 0.012, { cast: false, ry });
    };
    for (let i = 0; i < 2; i++) unit(15.9 + i * 1.25, L.z1 - 0.31, -1, '내빈용', 1.2, 'guest');
    for (let i = 0; i < 3; i++) unit(14.6 + i * 1.15, L.z0 + 0.31, 1, '교직원', 1.15, 'staff');
    // 우산꽂이 (문 옆)
    this.add(new THREE.CylinderGeometry(0.16, 0.14, 0.5, 14), paint(0x8d99ae, 0.4, 0.6), 17.72, 0.25, -3.75);
    for (let i = 0; i < 3; i++) this.add(new THREE.CylinderGeometry(0.012, 0.012, 0.75, 6), paint([0x1d3557, 0xe63946, 0xffc300][i], 0.5), 17.68 + i * 0.04, 0.45, -3.78 + i * 0.03);

    // 북쪽 벽: 학교 안내도 + 알림 게시판(코르크) + 나무 벤치
    const wallZ = L.z1 - 0.1;
    this.framed(this.guideMap(), 1.5, 0.95, 12.0, 1.62, wallZ);
    this.noticeBoard(14.1, 1.62, wallZ, -1);
    this.bench(14.1, wallZ - 0.25, 1.6);
    // 남쪽 벽: 낮은 복도용 책장(학급 문고) + 위 게시판, 교직원 신발장 위 안내문
    this.lowShelf(12.55, L.z0 + 0.1 + 0.18, 2.4, 1);
    this.noticeBoard(12.55, 1.75, L.z0 + 0.1, 1);
    this.poster(['실내화로 갈아 신어요', '바깥 신발은 신발장에', '복도에서는 천천히 걸어요'], 0.8, 0.5, 15.75, 2.2, L.z0 + 0.11, 0, '#2c4a6b');
    // 천장에 매단 방향 표지판 (들어오는 쪽에서 보이게: 왼쪽 = 북쪽, 오른쪽 = 남쪽)
    this.directionSign(11.55, 2.28, (L.z0 + L.z1) / 2);
  }

  /** 알루미늄 액자에 넣은 판 (북쪽 벽, 남쪽을 바라봄) */
  private framed(tex: CanvasTex, w: number, h: number, x: number, yc: number, z: number) {
    this.box(w + 0.08, h + 0.08, 0.03, this.alu, x, yc - (h + 0.08) / 2, z - 0.015, false);
    this.add(new THREE.PlaneGeometry(w, h), tex.material(), x, yc, z - 0.032, { cast: false, ry: Math.PI });
  }

  private guideMap(): CanvasTex {
    const t = new CanvasTex(768, 486);
    t.draw((c, w, h) => {
      c.fillStyle = '#fbf8ef';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#24476b';
      c.fillRect(0, 0, w, 70);
      c.fillStyle = '#fff';
      c.font = font(38, true);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(`${SCHOOL_NAME} 안내도`, w / 2, 37);
      const floor = (label: string, y: number, rooms: [string, string, number][]) => {
        c.fillStyle = '#e76f51';
        c.font = font(30, true);
        c.textAlign = 'left';
        c.fillText(label, 24, y + 46);
        let x = 92;
        for (const [name, col, rw] of rooms) {
          c.fillStyle = col;
          c.fillRect(x, y + 10, rw, 72);
          c.strokeStyle = '#ffffff';
          c.lineWidth = 3;
          c.strokeRect(x, y + 10, rw, 72);
          c.fillStyle = '#1f2d3d';
          c.font = font(name.length > 3 ? 19 : 22, true);
          c.textAlign = 'center';
          c.fillText(name, x + rw / 2, y + 47);
          x += rw;
        }
      };
      floor('2층', 92, [['강당', '#cdb4db', 90], ['5-1', '#fdffb6', 72], ['계단', '#e9ecef', 60], ['6-1', '#ffd6a5', 82], ['4-1', '#caffbf', 72], ['방송실', '#bdb2ff', 86], ['도서관', '#9bf6ff', 86], ['3층↑', '#dee2e6', 76]]);
      floor('1층', 200, [['교장실', '#bde0fe', 76], ['계단', '#e9ecef', 60], ['보건실', '#ffb3c1', 76], ['교무실', '#a0c4ff', 84], ['행정실', '#a0c4ff', 76], ['자치실', '#caffbf', 70], ['Wee', '#fdffb6', 60], ['급식실', '#ffc6ff', 98]]);
      // 현재 위치
      c.fillStyle = '#e63946';
      c.beginPath();
      c.arc(92 + 76 + 30, 316, 13, 0, Math.PI * 2);
      c.fill();
      c.font = font(22, true);
      c.textAlign = 'left';
      c.fillText('지금 여기 (현관 → 복도 건너 계단)', 92 + 76 + 48, 318);
      c.fillStyle = '#243447';
      c.font = font(24, true);
      c.fillText('▶ 계단: 현관을 지나 복도 건너편 정면 (3층은 방화문 닫힘)', 28, 380);
      c.fillText('▶ 6학년 교실: 계단으로 2층 → 복도 가운데', 28, 420);
      c.fillStyle = '#6c757d';
      c.font = font(20);
      c.fillText('1층은 교무실·행정실 층 · 화장실·엘리베이터는 현관 쪽', 28, 458);
    });
    return t;
  }

  /** 코르크 알림 게시판 (알루미늄 테, 안내문 몇 장). dir: 방 쪽 = +z면 1 */
  private noticeBoard(x: number, yc: number, wallZ: number, dir: 1 | -1) {
    const W = 1.6, H = 0.95, ry = dir > 0 ? 0 : Math.PI;
    this.box(W + 0.06, H + 0.06, 0.03, this.alu, x, yc - (H + 0.06) / 2, wallZ + dir * 0.015, false);
    const t = new CanvasTex(512, 304);
    t.draw((c, w, h) => {
      c.fillStyle = '#c69c6d';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        c.fillStyle = `rgba(${90 + Math.random() * 60},${60 + Math.random() * 40},30,0.25)`;
        c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      const notes: [number, number, number, number, string, string[]][] = [
        [18, 20, 150, 200, '#ffffff', ['가정통신문', '현장 체험 학습', '동의서 제출 안내']],
        [184, 34, 140, 120, '#fff3bf', ['도서관 이용', '평일 8:40~16:30']],
        [184, 168, 140, 112, '#e7f5ff', ['우유 급식', '신청 안내']],
        [340, 18, 152, 236, '#ffffff', ['학교 폭력 예방', '117', '혼자 고민하지 말고', '선생님께 말해요']],
      ];
      for (const [nx, ny, nw, nh, bg, lines] of notes) {
        c.fillStyle = 'rgba(0,0,0,0.18)';
        c.fillRect(nx + 3, ny + 3, nw, nh);
        c.fillStyle = bg;
        c.fillRect(nx, ny, nw, nh);
        c.fillStyle = '#495057';
        c.beginPath();
        c.arc(nx + nw / 2, ny + 8, 4, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#212529';
        c.textAlign = 'center';
        lines.forEach((l, i) => {
          c.font = font(i === 0 ? 20 : 16, i === 0);
          c.fillText(l, nx + nw / 2, ny + 40 + i * 28);
        });
        c.fillStyle = 'rgba(73,80,87,0.35)';
        for (let k = 0; k < 4; k++) c.fillRect(nx + 14, ny + nh - 60 + k * 12, nw - 28, 4);
      }
    });
    this.add(new THREE.PlaneGeometry(W, H), t.material(), x, yc, wallZ + dir * 0.032, { cast: false, ry });
  }

  /** 단정한 나무 벤치 (등받이 없음, 회색 철제 다리). 벽을 따라 x 방향 */
  private bench(x: number, z: number, len: number) {
    const D = 0.4, seat = pbr('oak', { color: 0xd9bf98, roughness: 0.55 }), leg = paint(0x6c737a, 0.45, 0.5);
    for (let i = 0; i < 3; i++) this.box(len, 0.035, D / 3 - 0.012, seat, x, 0.42, z - D / 2 + (i + 0.5) * (D / 3), true, TILE.oak);
    for (const s2 of [-1, 1]) {
      this.box(0.05, 0.42, D - 0.04, leg, x + s2 * (len / 2 - 0.12), 0, z);
    }
    this.box(len - 0.24, 0.04, 0.04, leg, x, 0.15, z);
    this.colliders.push({ ...aabb(x, z, len, D), level: this.level });
  }

  /** 낮은 복도용 책장 (높이 0.9, 깊이 0.35, 두 단 + 위판, 학급 문고 책). dir: 앞(열린 쪽) = +z면 1 */
  private lowShelf(x: number, z: number, len: number, dir: 1 | -1) {
    const H = 0.9, D = 0.35, t = 0.022, wood = pbr('oak', { color: 0xe6d2b3, roughness: 0.6 });
    this.box(len, t, D, wood, x, H - t, z, true, TILE.oak);
    this.box(len, 0.06, D - 0.02, paint(0x8d8f91, 0.6), x, 0, z);
    this.box(len, t, D, wood, x, 0.06, z, true, TILE.oak);
    this.box(len, t, D, wood, x, 0.47, z, true, TILE.oak);
    const back = z - dir * (D / 2 - 0.006);
    this.box(len, H, 0.012, wood, x, 0, back);
    const n = Math.max(2, Math.round(len / 0.8));
    for (let i = 0; i <= n; i++) this.box(t, H - t, D, wood, x - len / 2 + t / 2 + (i * (len - t)) / n, 0, z, true, TILE.oak);
    const cols = [0x1d3557, 0xa61e4d, 0x2b8a3e, 0xe67700, 0x5f3dc4, 0x868e96, 0x0b7285, 0xf1f3f5];
    let k = 0;
    for (const sy of [0.06 + t, 0.47 + t]) {
      for (let bx = x - len / 2 + 0.05; bx < x + len / 2 - 0.08; ) {
        const bw = 0.025 + ((k * 7) % 3) * 0.008, bh = 0.2 + ((k * 5) % 4) * 0.03;
        if ((k * 11) % 9 === 0) bx += 0.06; // 빈틈
        if (Math.abs(((bx - (x - len / 2)) % ((len - t) / n))) < 0.035) bx += 0.035; // 칸막이 피함
        this.box(bw, bh, 0.2 + ((k * 3) % 3) * 0.02, paint(cols[k % cols.length], 0.7), bx + bw / 2, sy, z + dir * 0.03, false);
        bx += bw + 0.003;
        k++;
      }
    }
    this.colliders.push({ ...aabb(x, z, len, D), level: this.level });
  }

  /** 천장에 매단 방향 표지판 (현관에서 복도 쪽을 볼 때 읽힘) */
  private directionSign(x: number, y: number, z: number) {
    const W = 2.6, H = 0.34;
    this.box(0.05, H, W, paint(0xb8bec4, 0.4, 0.5), x, y, z, false);
    for (const dz of [-W / 2 + 0.2, W / 2 - 0.2]) this.add(new THREE.CylinderGeometry(0.008, 0.008, CEIL_H - y - H, 6), this.chrome, x, y + H + (CEIL_H - y - H) / 2, z + dz, { cast: false });
    const t = new CanvasTex(1024, 134);
    t.draw((c, w, h) => {
      c.fillStyle = '#f7f8f8';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#2c4a6b';
      c.fillRect(0, 0, w, 9);
      c.fillRect(0, h - 9, w, 9);
      c.fillStyle = 'rgba(44,74,107,0.4)';
      c.fillRect(w / 2 - 2, 26, 4, h - 52);
      c.fillStyle = '#1f2d3d';
      c.textBaseline = 'middle';
      c.font = font(40, true);
      c.textAlign = 'left';
      c.fillText('◀ 교무실 · 행정실 · 보건실', 30, h / 2 + 2);
      c.textAlign = 'right';
      c.fillText('▲ 계단 · 교장실 ▶', w - 30, h / 2 + 2);
    });
    this.add(new THREE.PlaneGeometry(W - 0.04, H - 0.02), t.material(), x + 0.027, y + H / 2, z, { cast: false, ry: Math.PI / 2 });
  }

  // ───────── 교무실: 선생님 책상 네 개(마주 보기), 서류함, 일정 칠판, 복사기 ─────────
  private office() {
    const O = OFFICE_SRC;
    this.room(O.x0 - 0.1, O.x1 + 0.1, O.z0 - 0.1, O.z1 + 0.1, pbr('laminate', { color: 0xe8e0d4, roughness: 0.6 }), TILE.laminate, [[13.0, 2.6], [13.0, 6.2]]);
    const grey = paint(0x9aa1a8, 0.5, 0.3), legM = paint(0x5c6168, 0.45, 0.5), black = paint(0x23262b, 0.6);
    const screenMat = paint(0x1b1e22, 0.3);
    // 마주 보는 교사 책상 4개 (철제 다리 + 서랍장 + 가운데 칸막이) + 바퀴 의자
    for (const [x, z, face] of [[12.6, 4.6, 1], [13.8, 4.6, 1], [12.6, 5.6, -1], [13.8, 5.6, -1]] as [number, number, number][]) {
      this.box(1.14, 0.03, 0.72, this.wood, x, 0.71, z, true, TILE.oak);
      this.box(0.4, 0.68, 0.6, grey, x + 0.33, 0.02, z); // 서랍장
      for (let k = 0; k < 3; k++) this.box(0.2, 0.02, 0.01, this.chrome, x + 0.33, 0.2 + k * 0.2, z - face * 0.305, false);
      this.box(0.04, 0.7, 0.6, legM, x - 0.53, 0.01, z);
      this.box(1.0, 0.25, 0.02, legM, x, 0.42, z + face * 0.33); // 앞 가림판
      // 모니터 + 받침, 키보드, 서류
      this.box(0.52, 0.32, 0.03, screenMat, x - 0.05, 0.88, z + face * 0.2);
      this.box(0.06, 0.15, 0.06, grey, x - 0.05, 0.74, z + face * 0.22, false);
      this.box(0.42, 0.02, 0.14, black, x - 0.05, 0.745, z - face * 0.05, false);
      this.box(0.3, 0.05, 0.22, paint(0xf8f9fa, 0.9), x + 0.35, 0.745, z - face * 0.12, false);
      this.box(0.1, 0.24, 0.24, paint([0x1c7ed6, 0xe8590c, 0x2b8a3e, 0x5f3dc4][Math.round(x * 3 + z) % 4], 0.6), x - 0.45, 0.74, z + face * 0.2, false); // 서류철
      // 바퀴 의자: 다섯 발 받침 + 기둥 + 방석 + 등받이
      const cz = z - face * 0.62;
      for (let i = 0; i < 5; i++) {
        const leg = this.box(0.26, 0.03, 0.04, black, x + Math.cos((i * Math.PI * 2) / 5) * 0.13, 0.05, cz + Math.sin((i * Math.PI * 2) / 5) * 0.13, false);
        leg.rotation.y = -(i * Math.PI * 2) / 5;
      }
      this.box(0.05, 0.38, 0.05, this.chrome, x, 0.06, cz, false);
      this.rbox(0.48, 0.07, 0.46, black, x, 0.44, cz, 0.03);
      this.rbox(0.44, 0.5, 0.06, black, x, 0.58, cz - face * 0.24, 0.03);
    }
    // 가운데 칸막이 (반투명 아크릴 + 알루미늄 테)
    this.box(2.4, 0.35, 0.03, this.alu, 13.2, 0.74, 5.1, false);
    const ac = this.add(new THREE.PlaneGeometry(2.3, 0.3), this.frost, 13.2, 0.92, 5.1, { cast: false });
    void ac;
    this.colliders.push({ ...aabb(13.2, 5.1, 2.4, 1.4), level: this.level });
    // 서류함 (북쪽 벽): 회색 철제 높은 문서 보관함 3개 (위 유리문 + 아래 철문) + 바인더
    for (let i = 0; i < 3; i++) {
      const fx = 12.0 + i * 0.95, fz = O.z1 - 0.26;
      this.solid(0.9, 1.8, 0.45, paint(0xd5d9dd, 0.45, 0.35), fx, 0, fz);
      for (let k = 0; k < 7; k++) this.box(0.07, 0.3, 0.26, paint([0x1c7ed6, 0x2b8a3e, 0xe8590c, 0x495057, 0x5f3dc4][(k + i) % 5], 0.6), fx - 0.3 + k * 0.1, 1.05, fz - 0.03, false);
      const gl = this.add(new THREE.PlaneGeometry(0.84, 0.66), this.glass, fx, 1.38, fz - 0.226, { cast: false, ry: Math.PI });
      gl.renderOrder = 2;
      this.box(0.86, 0.015, 0.02, this.chrome, fx, 1.03, fz - 0.235, false);
      for (const dx of [-0.21, 0.21]) this.box(0.42, 0.9, 0.012, paint(0xe3e6e9, 0.4, 0.3), fx + dx, 0.05, fz - 0.23, false);
      this.box(0.02, 0.12, 0.02, this.chrome, fx + 0.03, 0.55, fz - 0.245, false);
    }
    // 복사기 (문 옆)
    this.solid(0.7, 1.05, 0.6, paint(0xeceff1, 0.4), 14.3, 0, 1.6);
    this.box(0.5, 0.04, 0.4, paint(0x495057, 0.5), 14.3, 1.05, 1.6, false);
    // 일정 칠판 (동쪽 벽)
    this.box(0.04, 1.0, 2.4, this.alu, O.x1 + 0.08, 1.0, 4.6, false);
    this.poster(['이번 주 학교 일정', '월: 교직원 회의', '화: 6학년 체험 학습 안내', '수: AI 도우미 점검 (!)', '금: 학부모 상담 주간'], 2.3, 0.92, O.x1 + 0.05, 1.5, 4.6, -Math.PI / 2, '#457b9d');
    // 화분·정수기
    this.add(new THREE.CylinderGeometry(0.2, 0.16, 0.4, 14), paint(0xd9805f, 0.8), 14.4, 0.2, 7.4);
    const l = this.add(new THREE.IcosahedronGeometry(0.36, 1), paint(0x4f8a3c, 0.85), 14.4, 0.75, 7.4);
    l.scale.y = 1.2;
  }

  // ───────── 보건실 (예전 좌표: 복도 쪽 = x 11.2, 운동장 쪽 = x 14.8, 문 z 10.0) ─────────
  // 침대 둘(천장 커튼 레일 + 주름 커튼), 가운데 철제 유리 약장, 보건 선생님 책상·PC·의자, 세면대·거울·종이타월, 시력표·키 재기, 휴지통
  private nurse() {
    const N = NURSE_SRC;
    this.room(N.x0 - 0.1, N.x1 + 0.1, N.z0 - 0.1, N.z1 + 0.1, pbr('floorTile', { color: 0xe9eef0, roughness: 0.55 }), TILE.floorTile, [[12.4, 10.0], [13.8, 10.0]]);
    const white = paint(0xf6f7f5, 0.5), steel = paint(0xe9ebea, 0.4, 0.3), grey = paint(0x9aa1a8, 0.45, 0.5);
    const sheet = paint(0xf4f6f8, 0.85), blanket = paint(0x9cc3d5, 0.9), pillow = paint(0xffffff, 0.8);
    // 주름 커튼 무늬 (세로 그늘 줄)
    const pleat = new CanvasTex(128, 32);
    pleat.draw((c, w, h) => {
      for (let x = 0; x < w; x++) {
        const v = 0.86 + 0.14 * Math.sin((x / w) * Math.PI * 8);
        c.fillStyle = `rgb(${Math.round(196 * v)},${Math.round(226 * v)},${Math.round(219 * v)})`;
        c.fillRect(x, 0, 1, h);
      }
    });
    pleat.tex.wrapS = THREE.RepeatWrapping;
    const curtainM = (len: number) => {
      const t = pleat.tex.clone();
      t.needsUpdate = true;
      t.repeat.set(len / 0.6, 1);
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, side: THREE.DoubleSide });
    };
    const railY = CEIL_H - 0.08;
    const bed = (z: number, curtain: 'open' | 'half') => {
      const x0 = 12.85, x1 = 14.72, xc = (x0 + x1) / 2, L = x1 - x0, W = 0.92;
      // 철제 침대 틀 + 바퀴 + 머리판
      this.box(L, 0.08, W, steel, xc, 0.36, z);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        this.box(0.04, 0.36, 0.04, grey, xc + sx * (L / 2 - 0.05), 0, z + sz * (W / 2 - 0.05), false);
        this.add(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 10), paint(0x2b2f33, 0.6), xc + sx * (L / 2 - 0.05), 0.04, z + sz * (W / 2 - 0.05), { cast: false }).rotation.x = Math.PI / 2;
      }
      this.box(0.04, 0.55, W, steel, x1 - 0.02, 0.36, z);
      this.box(0.04, 0.3, W, steel, x0 + 0.02, 0.36, z);
      // 매트리스·시트·베개·접은 이불
      this.rbox(L - 0.08, 0.14, W - 0.06, sheet, xc, 0.44, z, 0.04);
      this.rbox(0.42, 0.1, 0.62, pillow, x1 - 0.3, 0.58, z, 0.04);
      this.rbox(0.62, 0.07, W - 0.04, blanket, x0 + 0.42, 0.58, z, 0.03);
      this.colliders.push({ ...aabb(xc, z, L, W), level: this.level });
      // 천장 커튼 레일 (침대 둘레 ㄷ자) + 커튼
      const zA = z - W / 2 - 0.12, zB = z + W / 2 + 0.12, xA = x0 - 0.15;
      this.box(x1 - xA, 0.03, 0.04, this.alu, (xA + x1) / 2, railY, zA, false);
      this.box(x1 - xA, 0.03, 0.04, this.alu, (xA + x1) / 2, railY, zB, false);
      this.box(0.04, 0.03, zB - zA, this.alu, xA, railY, z, false);
      const hang = (len: number, x: number, zz: number, alongZ: boolean) => {
        const c2 = this.add(new THREE.PlaneGeometry(len, railY - 0.35), curtainM(len), x, 0.35 + (railY - 0.35) / 2, zz, { cast: true, ry: alongZ ? Math.PI / 2 : 0 });
        void c2;
      };
      if (curtain === 'half') {
        hang(1.1, x1 - 0.55, zA, false); // 바깥 옆쪽은 쳐 있음
        hang(0.5, xA, zA + 0.25, true); // 앞쪽은 걷어서 모아 둠
      } else {
        hang(0.45, x1 - 0.25, zB, false);
        hang(0.4, xA, zB - 0.2, true);
      }
    };
    bed(8.78, 'half');
    bed(11.22, 'open');
    // 가운데: 흰 철제 약장 (위 유리문 + 아래 철문), 위에 구급상자
    const cx = N.x1 - 0.22, cz = 10.0;
    this.solid(0.42, 1.85, 1.1, white, cx, 0, cz);
    for (let k = 0; k < 3; k++) {
      this.box(0.36, 0.015, 1.02, paint(0xdee2e6, 0.5), cx - 0.02, 0.95 + k * 0.3, cz, false);
      for (let i = 0; i < 6; i++) this.box(0.08, 0.14 + (i % 2) * 0.05, 0.1, paint([0xf8f9fa, 0x74c0fc, 0xffc9c9, 0xffffff, 0xb2f2bb, 0xffe066][(i + k) % 6], 0.5), cx - 0.04, 0.965 + k * 0.3, cz - 0.42 + i * 0.17, false);
    }
    for (const s2 of [-1, 1]) {
      const g2 = this.add(new THREE.PlaneGeometry(0.5, 0.86), this.glass, cx - 0.215, 1.38, cz + s2 * 0.27, { cast: false, ry: -Math.PI / 2 });
      g2.renderOrder = 2;
      this.box(0.02, 0.88, 0.02, steel, cx - 0.215, 0.94, cz + s2 * 0.535, false);
      this.box(0.02, 0.02, 0.54, steel, cx - 0.215, 1.81, cz + s2 * 0.27, false);
      this.box(0.02, 0.02, 0.54, steel, cx - 0.215, 0.94, cz + s2 * 0.27, false);
      this.box(0.012, 0.72, 0.5, paint(0xeef0ef, 0.45, 0.2), cx - 0.216, 0.12, cz + s2 * 0.27, false); // 아래 철문
      this.box(0.02, 0.1, 0.02, this.chrome, cx - 0.23, 0.6, cz + s2 * 0.05, false);
    }
    this.box(0.3, 0.2, 0.4, paint(0xffffff, 0.5), cx - 0.02, 1.85, cz, false);
    this.box(0.005, 0.1, 0.1, paint(0xe03131, 0.5), cx - 0.175, 1.9, cz, false);
    // 보건 선생님 책상 (남쪽 벽, 문 가까이): 흰 철제 책상 + 모니터 + 키보드 + 바퀴 의자 + 서류 꽂이
    const dx = 11.95, dz = N.z0 + 0.36;
    this.box(1.3, 0.72, 0.62, paint(0xdfe3e6, 0.45, 0.3), dx, 0, dz);
    this.box(1.34, 0.03, 0.66, paint(0xeee6d8, 0.55), dx, 0.72, dz);
    this.colliders.push({ ...aabb(dx, dz, 1.34, 0.66), level: this.level });
    this.box(0.54, 0.33, 0.03, paint(0x1b1e22, 0.3), dx + 0.15, 0.88, dz - 0.18);
    this.box(0.06, 0.13, 0.06, grey, dx + 0.15, 0.75, dz - 0.2, false);
    this.box(0.44, 0.02, 0.15, paint(0x2b2f33, 0.5), dx + 0.15, 0.755, dz + 0.08, false);
    this.box(0.25, 0.22, 0.2, paint(0x4dabf7, 0.6), dx - 0.45, 0.75, dz - 0.15, false);
    this.rbox(0.46, 0.07, 0.46, paint(0x343a40, 0.7), dx + 0.1, 0.46, dz + 0.62, 0.03);
    this.rbox(0.44, 0.48, 0.07, paint(0x343a40, 0.7), dx + 0.1, 0.52, dz + 0.86, 0.03);
    this.box(0.05, 0.42, 0.05, this.chrome, dx + 0.1, 0.04, dz + 0.62, false);
    this.box(0.5, 0.03, 0.05, grey, dx + 0.1, 0.02, dz + 0.62, false);
    this.box(0.05, 0.03, 0.5, grey, dx + 0.1, 0.02, dz + 0.62, false);
    // 세면대 (북쪽 벽, 문 옆): 흰 도기 + 수전 + 거울 + 종이타월 + 물비누
    const sx = 11.75, sz = N.z1 - 0.26;
    this.box(0.52, 0.12, 0.42, paint(0xffffff, 0.25), sx, 0.78, sz);
    this.box(0.12, 0.78, 0.12, paint(0xf1f3f5, 0.4), sx, 0, sz + 0.1);
    this.add(new THREE.CylinderGeometry(0.015, 0.015, 0.18, 8), this.chrome, sx, 0.98, sz + 0.14, { cast: false });
    this.box(0.03, 0.03, 0.12, this.chrome, sx, 1.06, sz + 0.09, false);
    this.add(new THREE.PlaneGeometry(0.46, 0.6), paint(0xdfe6ea, 0.04, 1.0), sx, 1.45, N.z1 - 0.012, { cast: false, ry: Math.PI });
    this.box(0.3, 0.38, 0.13, paint(0xf8f9fa, 0.4), sx + 0.5, 1.15, N.z1 - 0.07);
    this.box(0.08, 0.16, 0.08, paint(0xe9ecef, 0.4), sx - 0.38, 1.05, N.z1 - 0.05, false);
    this.colliders.push({ ...aabb(sx, sz, 0.55, 0.45), level: this.level });
    // 키·몸무게 재기 (세면대와 침대 사이)
    this.box(0.36, 0.06, 0.36, white, 12.42, 0, N.z1 - 0.25);
    this.box(0.05, 1.9, 0.05, this.alu, 12.42, 0.06, N.z1 - 0.08);
    this.box(0.18, 0.02, 0.12, this.alu, 12.42, 1.55, N.z1 - 0.15, false);
    // 휴지통 (페달)
    this.add(new THREE.CylinderGeometry(0.14, 0.13, 0.4, 16), paint(0xdee2e6, 0.35, 0.6), 12.5, 0.2, N.z0 + 0.28);
    // 벽: 시력표, 손 씻기 안내, 보건 소식
    this.poster(['시력 검사표', 'ㅁ ㅇ ㅅ ㄱ', 'ㄴ ㄷ ㄹ ㅂ ㅈ', 'ㅊ ㅋ ㅌ ㅍ ㅎ ㅇ'], 0.5, 0.8, 11.25, 1.5, 10.95, Math.PI / 2, '#495057');
    this.poster(['올바른 손 씻기', '비누로 30초', '손등·손가락 사이까지'], 0.5, 0.42, sx, 1.95, N.z1 - 0.012, Math.PI, '#1c7ed6');
    this.poster(['보건 소식', '감기 예방: 손 씻기·환기', '아프면 선생님께 말해요'], 0.9, 0.6, dx, 1.55, N.z0 + 0.012, 0, '#2b8a3e');
  }
}
