// 1층 급식실 동: 학생 식사 공간 / 급식 조리실 / 식재료·조리 도구 창고 (실제 벽·문·배식창으로 나뉨).
// 모습(벽·바닥·천장·창·설비·가구)만 짓는다. 게임 물건(절단기·크기 조절기·식판 수레·자리 등)은 SchoolMap.buildCafeteria.
// 모든 좌표는 rooms.ts의 CAFE 기준값을 쓴다.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { aabb } from './Collision';
import { CanvasTex, font } from './canvasTex';
import { HQBuilder } from './hq';
import { TILE, aoMaterial, paint, pbr, worldUV } from './pbr';
import { CAFE, CEIL_H, STOREY } from './rooms';

export const STEEL = () => paint(0xc4c9ce, 0.34, 0.75);
export const STOOL_ORANGE = 0xf08a3c;

const D = CAFE.dining, K = CAFE.kitchen, S = CAFE.storage;
const WZ = CAFE.wallZ;

export class CafeteriaWingBuilder extends HQBuilder {
  private steel = STEEL();
  private tileWall = pbr('wallTile', { roughness: 0.55, envMapIntensity: 1.1 });
  private green = paint(0x4f9d69, 0.6);
  private plaster = pbr('plaster', { roughness: 0.9 });
  private yellow = paint(0xf2c230, 0.5);

  build() {
    this.y = CAFE.y;
    this.level = 0;
    this.floors();
    this.walls();
    this.ceilings();
    this.dining();
    this.servingLine();
    this.kitchen();
    this.safeZone();
    this.storage();
    this.exterior();
  }

  /** 층 전체 높이 벽 (콜라이더 + 카메라 막기) */
  private wall(w: number, d: number, x: number, z: number, h = STOREY, y = 0, collide = true) {
    const m = this.box(w, h, d, this.plaster, x, y, z, true, TILE.plaster);
    this.blockers.push(m);
    if (collide) this.colliders.push({ ...aabb(x, z, w, d), level: this.level });
    return m;
  }

  // ───────── 바닥 ─────────
  private floors() {
    const plane = (x0: number, x1: number, z0: number, z1: number, mat: THREE.Material, tile: number) => {
      const w = x1 - x0, d = z1 - z0;
      const f = this.add(worldUV(new THREE.PlaneGeometry(w, d), w, d, 0, tile), mat, (x0 + x1) / 2, 0.003, (z0 + z1) / 2, { cast: false });
      f.rotation.x = -Math.PI / 2;
    };
    plane(D.x0 - 0.1, D.x1 + 0.1, D.z0 - 0.1, WZ, pbr('floorTile', { roughness: 0.6, envMapIntensity: 0.9 }), TILE.floorTile);
    // 조리실: 미끄럼 방지 에폭시 (녹회색) / 창고: 회색 타일
    plane(K.x0 - 0.1, K.x1 + 0.1, WZ, K.z1 + 0.1, pbr('floorTile', { color: 0xbfd3c8, roughness: 0.8 }), TILE.floorTile * 0.5);
    plane(S.x0 - 0.1, S.x1, WZ, S.z1 + 0.1, pbr('floorTile', { color: 0xcfcbc2, roughness: 0.85 }), TILE.floorTile * 0.7);
  }

  // ───────── 벽: 바깥벽 + 식사·조리 사이 벽(배식창·반납창·문) + 창고 벽 ─────────
  private walls() {
    const T = 0.2;
    // 남쪽 (복도 쪽): 문 자리 비움 + 문 위 벽
    const dx0 = CAFE.door.x - CAFE.door.w / 2, dx1 = CAFE.door.x + CAFE.door.w / 2;
    this.wall(dx0 - (D.x0 - 0.1), T, (D.x0 - 0.1 + dx0) / 2, CAFE.door.z);
    this.wall(D.x1 + 0.1 - dx1, T, (dx1 + D.x1 + 0.1) / 2, CAFE.door.z);
    this.wall(CAFE.door.w, T, CAFE.door.x, CAFE.door.z, STOREY - 2.3, 2.3, false);
    // 북쪽·동쪽 바깥벽
    this.wall(K.x1 - S.x0 + 0.4, T, (S.x0 + K.x1) / 2, K.z1 + 0.1);
    this.wall(T, K.z1 - WZ, K.x1 + 0.1, (WZ + K.z1) / 2);
    this.wall(T, S.z1 - WZ, S.x0 - 0.1, (WZ + S.z1) / 2);
    // 식사 공간 서쪽·동쪽: 큰 창 (운동장 쪽은 햇빛)
    this.slidingWindowWall(D.x0 - 0.1, D.z0 - 0.1, WZ - 0.1, 1, { bays: 3, sillY: 0.95 });
    this.slidingWindowWall(D.x1 + 0.1, D.z0 - 0.1, WZ - 0.1, -1, { bays: 3, sillY: 0.95 });
    for (const x of [D.x0 - 0.1, D.x1 + 0.1]) this.wall(T, STOREY - CEIL_H, x, (D.z0 + WZ) / 2 - 0.05, STOREY - CEIL_H, CEIL_H, false); // 창 위 천장 속
    // 식사 ↔ 조리실·창고 벽: 구멍(창고 문, 배식창, 반납창, 조리실 문) 사이를 채운다
    const holes: { x0: number; x1: number; y0: number; y1: number }[] = [
      { x0: CAFE.storageDoor.x - CAFE.storageDoor.w / 2, x1: CAFE.storageDoor.x + CAFE.storageDoor.w / 2, y0: 0, y1: 2.1 },
      { x0: CAFE.serveWindow.x0, x1: CAFE.serveWindow.x1, y0: CAFE.serveWindow.sill, y1: CAFE.serveWindow.top },
      { x0: CAFE.returnWindow.x0, x1: CAFE.returnWindow.x1, y0: CAFE.returnWindow.sill, y1: CAFE.returnWindow.top },
      { x0: CAFE.kitchenDoor.x - CAFE.kitchenDoor.w / 2, x1: CAFE.kitchenDoor.x + CAFE.kitchenDoor.w / 2, y0: 0, y1: 2.1 },
    ];
    let x = S.x0 - 0.1;
    for (const h of holes) {
      if (h.x0 > x) this.wall(h.x0 - x, T, (x + h.x0) / 2, WZ);
      const w = h.x1 - h.x0, cx = (h.x0 + h.x1) / 2;
      if (h.y0 > 0) this.wall(w, T, cx, WZ, h.y0, 0, false); // 창 아래 (배식대가 충돌)
      this.wall(w, T, cx, WZ, STOREY - h.y1, h.y1, false);
      // 문틀·창틀 (스테인리스)
      this.box(w + 0.1, 0.05, T + 0.04, this.steel, cx, h.y1 - 0.05, WZ, false);
      if (h.y0 > 0) this.box(w + 0.1, 0.04, T + 0.12, this.steel, cx, h.y0 - 0.04, WZ, false);
      x = h.x1;
    }
    if (D.x1 + 0.1 > x) this.wall(D.x1 + 0.1 - x, T, (x + D.x1 + 0.1) / 2, WZ);
    // 창고 ↔ 조리실 벽 (닫힌 문 장식)
    this.wall(T, K.z1 - WZ, S.x1 + 0.1, (WZ + K.z1) / 2);
    this.box(0.06, 2.05, 0.95, paint(0xb9c3c9, 0.4, 0.5), S.x1 + 0.22, 0, 27.6, false);
    this.box(0.06, 2.05, 0.95, paint(0xb9c3c9, 0.4, 0.5), S.x1 - 0.02, 0, 27.6, false);
    // 열린 문짝: 조리실 문(안쪽으로 열림), 창고 문
    for (const [dx, hinge] of [[CAFE.kitchenDoor.x, 1], [CAFE.storageDoor.x, -1]] as [number, number][]) {
      const w = 1.12;
      const door = this.box(0.045, 2.04, w, paint(0xc9d1d6, 0.35, 0.5), 0, 0, 0);
      door.position.set(dx + hinge * (0.58 - 0.03), CAFE.y + 1.02, WZ + 0.1 + w / 2);
      const win = this.add(new THREE.PlaneGeometry(0.35, 0.5), this.glass, 0, 0, 0, { cast: false });
      win.position.set(door.position.x - 0.03, CAFE.y + 1.5, door.position.z);
      win.rotation.y = -Math.PI / 2;
    }
    // 문 위 이름표
    this.label('조리실', CAFE.kitchenDoor.x, 2.3, WZ - 0.11, '#2a9d8f');
    this.label('식재료 창고', CAFE.storageDoor.x, 2.3, WZ - 0.11, '#577590');
    this.label('식판 반납', (CAFE.returnWindow.x0 + CAFE.returnWindow.x1) / 2, 1.85, WZ - 0.11, '#e76f51');
    this.label('배식대', (CAFE.serveWindow.x0 + CAFE.serveWindow.x1) / 2, 2.3, WZ - 0.11, '#e76f51', 1.0);
  }

  private label(text: string, x: number, y: number, z: number, bg: string, w = 0.9) {
    const t = new CanvasTex(256, 72);
    t.draw((c, cw, ch) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, cw, ch);
      c.fillStyle = '#fff';
      c.font = font(40, true);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text, cw / 2, ch / 2 + 2);
    });
    this.add(new THREE.PlaneGeometry(w, (w * 72) / 256), t.material(), x, y, z, { cast: false, ry: Math.PI });
  }

  // ───────── 천장 (방마다, 바닥에서 3m) + LED ─────────
  private ceilings() {
    const led = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfffbf2, emissiveIntensity: 1.3, roughness: 0.5 });
    led.userData.pbr = true; // 천장 등은 한 덩어리로 합쳐 그린다
    const room = (x0: number, x1: number, z0: number, z1: number, lamps: [number, number][]) => {
      const w = x1 - x0, d = z1 - z0;
      const c = this.add(worldUV(new THREE.PlaneGeometry(w, d), w, d, 0, TILE.ceiling), pbr('ceiling', { roughness: 0.95 }), (x0 + x1) / 2, CEIL_H - 0.002, (z0 + z1) / 2, { cast: true });
      c.rotation.x = Math.PI / 2;
      this.blockers.push(c);
      for (const [lx, lz] of lamps) {
        this.box(0.66, 0.03, 0.66, this.alu, lx, CEIL_H - 0.032, lz, false);
        this.box(0.6, 0.012, 0.6, led, lx, CEIL_H - 0.042, lz, false);
      }
    };
    const dl: [number, number][] = [];
    for (const x of [2.8, 6.2, 9.6, 13.0]) for (const z of [17.8, 20.6]) dl.push([x, z]);
    room(D.x0 - 0.1, D.x1 + 0.1, D.z0 - 0.1, WZ, dl);
    room(K.x0 - 0.1, K.x1 + 0.1, WZ, K.z1 + 0.1, [[6.4, 25.0], [10.4, 25.0], [6.4, 28.4], [10.4, 28.4], [13.6, 27.8]]);
    room(S.x0 - 0.1, S.x1 + 0.1, WZ, S.z1 + 0.1, [[2.5, 25.4], [2.5, 28.4]]);
    // 모서리 그림자
    for (const [x, z, len, nx, nz] of [
      [D.x0, (D.z0 + WZ) / 2, WZ - D.z0, 1, 0], [D.x1, (D.z0 + WZ) / 2, WZ - D.z0, -1, 0],
      [(D.x0 + D.x1) / 2, D.z0 - 0.1, D.x1 - D.x0, 0, 1], [(D.x0 + D.x1) / 2, WZ - 0.1, D.x1 - D.x0, 0, -1],
    ] as [number, number, number, number, number][]) {
      const m = this.add(new THREE.PlaneGeometry(len, 0.45), aoMaterial(), x + nx * 0.225, 0.008, z + nz * 0.225, { cast: false, receive: false });
      m.rotation.order = 'YXZ';
      m.rotation.set(-Math.PI / 2, Math.atan2(nx, nz), 0);
    }
  }

  // ───────── 식사 공간 ─────────
  private dining() {
    // 흰 벽 타일 징두리 + 초록 띠 (남쪽 벽·식사 쪽 벽)
    const h = 1.2, t = 0.012;
    const dx0 = CAFE.door.x - CAFE.door.w / 2, dx1 = CAFE.door.x + CAFE.door.w / 2;
    for (const [x0, x1] of [[D.x0, dx0], [dx1, D.x1]]) {
      this.box(x1 - x0, h, t, this.tileWall, (x0 + x1) / 2, 0.1, D.z0 + 0.006, false, TILE.wallTile);
      this.box(x1 - x0, 0.04, 0.03, this.green, (x0 + x1) / 2, 0.1 + h, D.z0 + 0.016, false);
      this.box(x1 - x0, 0.1, 0.02, this.dark, (x0 + x1) / 2, 0, D.z0 + 0.01, false);
    }
    // 초록 기둥 (참고 사진) — 창 사이 동쪽 벽에
    for (const z of [18.75, 21.2]) {
      this.rbox(0.34, CEIL_H - 0.02, 0.56, this.green, D.x1 - 0.17, 0, z, 0.04);
      this.colliders.push({ ...aabb(D.x1 - 0.17, z, 0.34, 0.56), level: this.level });
    }
    // 식탁 6개 (2줄 × 3칸) + 주황 둥근 의자. 친구들 식탁 두 개(CAFE.dinerTables)도 같은 모양
    const cols = [2.6, CAFE.dinerTables[0].x, CAFE.dinerTables[1].x];
    for (const z of [17.7, CAFE.dinerTables[0].z])
      for (const x of cols) {
        cafeteriaTable(this.root, x, z, 2.4, 0.8, this.steel, 0.74, CAFE.y);
        for (const side of [-1, 1]) for (const dx of [-0.8, 0, 0.8]) cafeteriaStool(this.root, x + dx, z + side * 0.62, this.steel, CAFE.y);
        this.colliders.push({ ...aabb(x, z, 2.5, 0.85), level: this.level });
      }
    // 배식 대기 줄: 바닥 발자국 + 줄 기둥(로프)
    const foot = new THREE.MeshBasicMaterial({ color: 0xf2b134 });
    for (let x = CAFE.queue.x0; x >= CAFE.queue.x1; x -= 0.9) {
      for (const dz of [-0.09, 0.09]) {
        const f = this.add(new THREE.CircleGeometry(0.06, 10), foot, x + (dz > 0 ? 0.08 : 0), 0.006, CAFE.queue.z + dz, { cast: false, receive: false });
        f.rotation.x = -Math.PI / 2;
        f.scale.set(1.6, 1, 1);
      }
    }
    const postZ = CAFE.queue.z - 0.62;
    const red = paint(0xc0392b, 0.6);
    for (let x = 6.0; x <= 11.9; x += 1.95) {
      this.add(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 10), this.chrome, x, 0.45, postZ);
      this.add(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 16), this.chrome, x, 0.02, postZ);
      if (x + 1.95 <= 11.95) {
        const rope = this.add(new THREE.CylinderGeometry(0.018, 0.018, 1.95, 8), red, x + 0.975, 0.84, postZ, { cast: false });
        rope.rotation.z = Math.PI / 2;
      }
    }
    this.colliders.push({ ...aabb(8.95, postZ, 5.95, 0.1), level: this.level });
    // 식판 보관대 (입구 오른쪽): 칸칸이 쌓인 식판 + 수저통
    const rack = CAFE.trayRack;
    this.box(1.3, 1.1, 0.42, this.steel, rack.x, 0, rack.z);
    for (let k = 0; k < 4; k++) for (let i = 0; i < 6; i++) this.box(0.42, 0.018, 0.3, paint(0xd5dbe0, 0.3, 0.6), rack.x - 0.32 + (k % 2) * 0.64, 0.12 + Math.floor(k / 2) * 0.5 + i * 0.022, rack.z + 0.02, false);
    for (const dx of [-0.35, 0, 0.35]) this.add(new THREE.CylinderGeometry(0.07, 0.06, 0.18, 12), paint(0xe9ecef, 0.3, 0.6), rack.x + dx, 1.19, rack.z);
    this.colliders.push({ ...aabb(rack.x, rack.z, 1.3, 0.42), level: this.level });
    // 손 씻는 곳 (입구 왼쪽 서쪽 모서리)
    this.handWash(2.9, D.z0);
    // 급식실 안내 게시판
    this.noticeBoard(6.2, D.z0 + 0.03);
    // 정수기
    this.rbox(0.42, 1.25, 0.46, paint(0xf4f5f2, 0.35), D.x1 - 0.3, 0, 16.75, 0.05);
    this.colliders.push({ ...aabb(D.x1 - 0.3, 16.75, 0.42, 0.46), level: this.level });
  }

  private handWash(x: number, z: number) {
    const len = 1.8;
    this.box(len, 0.08, 0.5, this.steel, x, 0.78, z + 0.25);
    this.box(len, 0.78, 0.04, this.steel, x, 0, z + 0.48, false);
    for (const dx of [-0.45, 0.45]) {
      this.box(0.4, 0.01, 0.3, paint(0x8f969c, 0.25, 0.8), x + dx, 0.861, z + 0.25, false);
      this.add(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 8), this.chrome, x + dx, 0.97, z + 0.06, { cast: false });
      this.add(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10), paint(dx < 0 ? 0x7cc6a4 : 0xf2b5c4, 0.4), x + dx + 0.25, 0.92, z + 0.1);
    }
    this.add(new THREE.PlaneGeometry(len - 0.1, 0.6), paint(0xdfe6ea, 0.04, 1.0), x, 1.55, z + 0.02, { cast: false });
    this.box(len - 0.04, 0.64, 0.015, this.alu, x, 1.23, z + 0.008, false);
    this.colliders.push({ ...aabb(x, z + 0.25, len, 0.5), level: this.level });
    const t = new CanvasTex(256, 96);
    t.draw((c, w) => {
      c.fillStyle = '#e9f5ff';
      c.fillRect(0, 0, w, 96);
      c.fillStyle = '#1d6fa5';
      c.font = font(34, true);
      c.textAlign = 'center';
      c.fillText('손 씻고 먹어요!', w / 2, 46);
      c.font = font(20);
      c.fillText('비누로 30초 쓱싹쓱싹', w / 2, 80);
    });
    this.add(new THREE.PlaneGeometry(0.75, 0.28), t.material(), x, 2.05, z + 0.02, { cast: false });
  }

  private noticeBoard(x: number, z: number) {
    const t = new CanvasTex(640, 384);
    t.draw((c, w, h) => {
      c.fillStyle = '#fffaf0';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#2a9d8f';
      c.fillRect(0, 0, w, 64);
      c.fillStyle = '#fff';
      c.font = font(38, true);
      c.textAlign = 'center';
      c.fillText('급식실 안내', w / 2, 46);
      c.textAlign = 'left';
      c.fillStyle = '#e76f51';
      c.font = font(28, true);
      c.fillText('오늘의 식단', 28, 108);
      c.fillStyle = '#333';
      c.font = font(24);
      ['잡곡밥 · 미역국', '돈가스 ★ · 양배추 샐러드', '배추김치 · 우유'].forEach((m, i) => c.fillText(m, 28, 148 + i * 34));
      c.fillStyle = '#e76f51';
      c.font = font(28, true);
      c.fillText('급식 예절', 340, 108);
      c.fillStyle = '#333';
      c.font = font(22);
      ['① 손 씻고 줄 서기', '② 먹을 만큼 받기', '③ 남기지 않기', '④ 식판은 반납대로'].forEach((m, i) => c.fillText(m, 340, 148 + i * 34));
      c.fillStyle = '#888';
      c.font = font(18);
      c.fillText('알레르기 유발 식품: 1.난류 2.우유 5.대두 6.밀 10.돼지고기', 28, h - 24);
    });
    this.box(1.7, 1.04, 0.03, pbr('oak', { color: 0xf3e2c8, roughness: 0.55 }), x, 1.15, z, false, TILE.oak);
    this.add(new THREE.PlaneGeometry(1.6, 0.96), t.material(), x, 1.67, z + 0.018, { cast: false });
  }

  // ───────── 배식대 둘레: 침 가림 유리, 반납창 컨베이어 ─────────
  private servingLine() {
    const c = CAFE.counter, xc = (c.x0 + c.x1) / 2;
    const zFront = c.z - c.d / 2; // 식사 쪽 앞면
    // 앞판 이음 줄
    for (let x = c.x0 + 0.75; x < c.x1; x += 1.5) this.box(0.015, 0.8, 0.01, paint(0x9aa1a8, 0.4, 0.8), x, 0.05, zFront - 0.005, false);
    // 식판 미끄럼 봉
    const rail = this.add(new THREE.CylinderGeometry(0.025, 0.025, c.x1 - c.x0 + 0.2, 10), this.chrome, xc, 0.84, zFront - 0.15);
    rail.rotation.z = Math.PI / 2;
    for (let x = c.x0; x <= c.x1; x += 1.5) this.box(0.03, 0.04, 0.16, this.chrome, x, 0.82, zFront - 0.08, false);
    // 보온 칸 (조리실 쪽)
    for (const x of [6.6, 8.2, 9.8, 11.0]) this.box(0.62, 0.006, 0.5, paint(0x3a3f44, 0.3, 0.6), x, c.top + 0.001, c.z + 0.25, false);
    // 침 가림 유리 (배식창 안에서 기울어짐)
    for (let i = 0; i <= 3; i++) this.add(new THREE.CylinderGeometry(0.016, 0.016, 0.45, 8), this.chrome, c.x0 + 0.15 + (i * (c.x1 - c.x0 - 0.3)) / 3, c.top + 0.22, c.z - 0.05);
    for (const s of [1, -1]) {
      const g = this.add(new THREE.PlaneGeometry(c.x1 - c.x0 - 0.15, 0.38), this.glass, xc, c.top + 0.42, c.z - 0.12, { cast: false, receive: false });
      g.rotation.x = -0.45 * s;
      if (s < 0) g.rotation.y = Math.PI;
      g.renderOrder = 2;
    }
    // 반납창: 컨베이어 + 「식판 반납」 받침
    const r = CAFE.returnWindow, rx = (r.x0 + r.x1) / 2;
    this.box(r.x1 - r.x0 + 0.2, 0.9, 0.6, this.steel, rx, 0, WZ - 0.32);
    this.colliders.push({ ...aabb(rx, WZ - 0.32, r.x1 - r.x0 + 0.2, 0.6), level: this.level });
    this.box(r.x1 - r.x0, 0.02, 1.2, paint(0x2b2d31, 0.7), rx, r.sill + 0.0, WZ + 0.2, false);
    for (let k = 0; k < 3; k++) this.box(0.42, 0.02, 0.3, paint(0xd5dbe0, 0.3, 0.6), rx - 0.3 + k * 0.3, r.sill + 0.02 + k * 0.02, WZ + 0.1 + k * 0.15, false);
  }

  // ───────── 조리실 ─────────
  private kitchen() {
    // 벽 타일 (사방 2.2m)
    const t = 0.012;
    this.box(K.x1 - K.x0, 2.2, t, this.tileWall, (K.x0 + K.x1) / 2, 0, K.z1 - 0.006, false, TILE.wallTile);
    this.box(t, 2.2, K.z1 - WZ, this.tileWall, K.x1 - 0.006, 0, (WZ + K.z1) / 2, false, TILE.wallTile);
    this.box(t, 2.2, K.z1 - WZ, this.tileWall, K.x0 + 0.006, 0, (WZ + K.z1) / 2, false, TILE.wallTile);
    this.box(K.x1 - K.x0, 0.85, t, this.tileWall, (K.x0 + K.x1) / 2, 0, WZ + 0.11, false, TILE.wallTile);
    // 대형 국솥 3개 (북쪽 벽) + 후드
    const kettle = paint(0xd3d7db, 0.25, 0.85);
    for (const x of [6.0, 7.8, 9.6]) {
      this.add(new THREE.CylinderGeometry(0.55, 0.5, 0.75, 24), kettle, x, 0.75, 29.25);
      this.add(new THREE.CylinderGeometry(0.58, 0.58, 0.04, 24), kettle, x, 1.14, 29.25);
      this.box(1.2, 0.38, 1.2, this.steel, x, 0, 29.25);
      this.add(new THREE.CylinderGeometry(0.04, 0.04, 0.25, 8), this.chrome, x + 0.62, 0.9, 29.25, { cast: false });
    }
    this.colliders.push({ ...aabb(7.8, 29.25, 5.0, 1.3), level: this.level });
    this.box(5.4, 0.55, 1.3, this.steel, 7.8, CEIL_H - 0.7, 29.4);
    // 밥솥 캐비닛 (가스 취반기)
    this.box(1.3, 1.6, 0.8, this.steel, 11.6, 0, 29.5);
    for (let i = 0; i < 3; i++) this.box(1.2, 0.02, 0.02, paint(0x2b2d31, 0.6), 11.6, 0.4 + i * 0.5, 29.09, false);
    this.colliders.push({ ...aabb(11.6, 29.5, 1.3, 0.8), level: this.level });
    // 세척 싱크 (동쪽 벽)
    this.box(0.75, 0.9, 2.8, this.steel, K.x1 - 0.4, 0, 27.9);
    for (const z of [27.2, 28.6]) this.box(0.55, 0.02, 1.1, paint(0x8f969c, 0.2, 0.85), K.x1 - 0.4, 0.89, z, false);
    this.add(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8), this.chrome, K.x1 - 0.12, 1.1, 27.9, { cast: false });
    this.colliders.push({ ...aabb(K.x1 - 0.4, 27.9, 0.75, 2.8), level: this.level });
    // 냉장고 2대 (서쪽 벽)
    for (const z of [24.6, 25.65]) {
      this.box(0.8, 2.0, 1.0, paint(0xe2e5e8, 0.3, 0.6), K.x0 + 0.45, 0, z);
      this.box(0.02, 0.5, 0.04, this.chrome, K.x0 + 0.86, 1.0, z + 0.35, false);
    }
    this.colliders.push({ ...aabb(K.x0 + 0.45, 25.12, 0.8, 2.1), level: this.level });
    // 작업대 둘레 바닥 배수구
    this.box(4.0, 0.006, 0.12, paint(0x6c757d, 0.6, 0.5), 8.4, 0.0, 29.0 - 0.75 - 0.6, false);
    // 칼·국자 걸이 (서쪽 벽 위)
    this.box(1.6, 0.04, 0.04, this.chrome, K.x0 + 0.05, 1.6, 27.7, false).rotation.y = Math.PI / 2;
    // 위생 안내
    const sign = new CanvasTex(256, 128);
    sign.draw((c, w, h) => {
      c.fillStyle = '#fff3bf';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#c92a2a';
      c.font = font(30, true);
      c.textAlign = 'center';
      c.fillText('조리실 위생 수칙', w / 2, 44);
      c.fillStyle = '#333';
      c.font = font(20);
      c.fillText('위생모·앞치마 착용', w / 2, 80);
      c.fillText('학생 출입은 안전 구역까지', w / 2, 110);
      void h;
    });
    this.add(new THREE.PlaneGeometry(0.75, 0.38), sign.material(), K.x1 - 0.02, 1.7, 25.0, { cast: false, ry: -Math.PI / 2 });
  }

  /** 안전 작업 구역: 노란 빗금 바닥 + 노란 난간(학생은 여기까지) + 배식 이송대 */
  private safeZone() {
    const z = CAFE.safeZone;
    const hatch = new CanvasTex(128, 128);
    hatch.draw((c, w, h) => {
      c.fillStyle = '#2b2d31';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#f2c230';
      c.lineWidth = 18;
      for (let k = -2; k < 4; k++) {
        c.beginPath();
        c.moveTo(k * 48, 0);
        c.lineTo(k * 48 + h, h);
        c.stroke();
      }
    });
    hatch.tex.wrapS = hatch.tex.wrapT = THREE.RepeatWrapping;
    // 테두리 띠만 빗금, 안쪽은 노란 테두리
    const band = (x: number, zz: number, w: number, d: number) => {
      const t = hatch.tex.clone();
      t.needsUpdate = true;
      t.repeat.set(w / 0.5, d / 0.5);
      const m = this.add(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: t }), x, 0.006, zz, { cast: false, receive: false });
      m.rotation.x = -Math.PI / 2;
    };
    band((z.x0 + z.x1) / 2, z.z1 - 0.12, z.x1 - z.x0, 0.24);
    band(z.x0 + 0.12, (z.z0 + z.z1) / 2, 0.24, z.z1 - z.z0);
    // 난간: 서쪽(x0)·북쪽(z1)
    const rail = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      for (const y of [0.55, 1.05]) this.box(along ? len : 0.05, 0.05, along ? 0.05 : len, this.yellow, cx, y, cz);
      const n = Math.max(2, Math.round(len / 0.9));
      for (let i = 0; i <= n; i++) this.box(0.05, 1.1, 0.05, this.yellow, x0 + ((x1 - x0) * i) / n, 0, z0 + ((z1 - z0) * i) / n);
      this.colliders.push({ ...aabb(cx, cz, along ? len : 0.12, along ? 0.12 : len), level: this.level });
    };
    rail(z.x0, z.z0 + 0.15, z.x0, z.z1);
    rail(z.x0, z.z1, z.x1, z.z1);
    // 안내판
    const t = new CanvasTex(256, 96);
    t.draw((c, w) => {
      c.fillStyle = '#f2c230';
      c.fillRect(0, 0, w, 96);
      c.fillStyle = '#2b2d31';
      c.font = font(32, true);
      c.textAlign = 'center';
      c.fillText('⚠ 안전 작업 구역', w / 2, 42);
      c.font = font(20);
      c.fillText('난간 밖으로 나가지 않아요', w / 2, 78);
    });
    this.add(new THREE.PlaneGeometry(0.7, 0.26), t.material(), z.x0 + 0.04, 1.35, (z.z0 + z.z1) / 2 + 0.3, { cast: false, ry: Math.PI / 2 });
    // 배식 이송대: 자른 조각을 올려 두는 스테인리스 선반 (난간 안쪽)
    const p = CAFE.passTable;
    this.box(p.w, 0.03, p.d, this.steel, p.x, p.top - 0.03, p.z);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(0.04, p.top - 0.03, 0.04, this.steel, p.x + sx * (p.w / 2 - 0.05), 0, p.z + sz * (p.d / 2 - 0.05));
    this.box(p.w - 0.1, 0.02, p.d - 0.06, this.steel, p.x, 0.25, p.z, false);
    this.colliders.push({ ...aabb(p.x, p.z, p.w, p.d), level: this.level });
  }

  // ───────── 식재료·조리 도구 창고 ─────────
  private storage() {
    // 쌀 포대·상자·통조림 더미 (선반·기계는 SchoolMap 물건)
    const sack = paint(0xe8dcc4, 0.95);
    for (let i = 0; i < 4; i++) {
      const s = this.add(new RoundedBoxGeometry(0.62, 0.22, 0.42, 2, 0.08), sack, 3.45, 0.11 + i * 0.21, 24.45 + (i % 2) * 0.05);
      s.rotation.y = (i % 2 ? 0.08 : -0.06);
    }
    this.colliders.push({ ...aabb(3.45, 24.45, 0.7, 0.5), level: this.level });
    const boxCol = [0xc8a165, 0xb98d55, 0xd4b07a];
    for (let i = 0; i < 6; i++) this.box(0.45, 0.32, 0.38, paint(boxCol[i % 3], 0.85), 3.5 - (i % 2) * 0.5, Math.floor(i / 2) * 0.32, 27.9 + (i % 2) * 0.02);
    this.colliders.push({ ...aabb(3.25, 27.9, 1.0, 0.45), level: this.level });
    // 조리 도구 걸이 + 창고 안내
    this.box(0.04, 0.04, 1.5, this.chrome, S.x0 + 0.03, 1.75, 28.3, false);
    for (let i = 0; i < 5; i++) this.add(new THREE.CylinderGeometry(0.12 - i * 0.012, 0.1 - i * 0.01, 0.12, 14), this.steel, S.x0 + 0.16, 1.55, 27.7 + i * 0.3, { cast: false });
  }

  // ───────── 바깥 (1층만 있는 부분의 지붕·외벽) ─────────
  private exterior() {
    const ext = paint(0xe9e2d4, 0.85);
    const roof = paint(0x9c9d98, 0.95);
    // 2층 도서관이 덮지 않는 곳 (서쪽 띠 x 0.9~2.9, 북쪽 띠 z 27.1~30.1) 지붕
    this.box(2.1, 0.3, 14.2, roof, 1.9, STOREY - 0.3, 23.1, false);
    this.box(12.4, 0.3, 3.2, roof, 9.0, STOREY - 0.3, 28.75, false);
    // 바깥벽 겉면 (동·북·서), 지붕 난간
    this.box(0.08, STOREY + 0.5, K.z1 - 27.0 + 0.3, ext, K.x1 + 0.24, 0, (27.0 + K.z1 + 0.3) / 2, false);
    this.box(K.x1 - S.x0 + 0.6, STOREY + 0.5, 0.08, ext, (S.x0 + K.x1) / 2, 0, K.z1 + 0.24, false);
    this.box(0.08, STOREY + 0.5, S.z1 - WZ + 0.3, ext, S.x0 - 0.24, 0, (WZ + S.z1 + 0.3) / 2, false);
    this.box(0.08, 0.5, D.z1 - D.z0 + 0.4, ext, D.x0 - 0.24, STOREY, (D.z0 + WZ) / 2, false);
    this.box(0.08, 0.5, D.z1 - D.z0 + 0.4, ext, D.x1 + 0.24, STOREY, (D.z0 + WZ) / 2, false);
  }
}

/** 주황 둥근 급식실 의자 (앉는 면 높이 0.45) — parent 좌표, y0 = 바닥 높이 */
export function cafeteriaStool(parent: THREE.Object3D, x: number, z: number, steel: THREE.Material, y0 = 0) {
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.16, 0.045, 18), stoolMat());
  seat.position.set(x, y0 + 0.45, z);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.43, 8), steel);
  leg.position.set(x, y0 + 0.215, z);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.02, 14), steel);
  foot.position.set(x, y0 + 0.01, z);
  for (const m of [seat, leg, foot]) {
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
  }
}
let stoolM: THREE.Material | null = null;
function stoolMat() {
  return (stoolM ??= paint(STOOL_ORANGE, 0.45));
}

/** 급식실 식탁: 흰 상판 + 나무 테두리 + 스테인리스 다리 — parent 좌표, topY = 윗면 높이, y0 = 바닥 높이 */
export function cafeteriaTable(parent: THREE.Object3D, x: number, z: number, w: number, d: number, steel: THREE.Material, topY = 0.74, y0 = 0) {
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, y0 + py, pz);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  // 상판(위 3cm) 아래에 나무 테두리 판(3cm) — 높이를 나눠 면이 겹치지 않게
  add(new THREE.BoxGeometry(w, 0.03, d), paint(0xf4f1ea, 0.4), x, topY - 0.015, z);
  add(worldUV(new THREE.BoxGeometry(w + 0.02, 0.03, d + 0.02), w + 0.02, 0.03, d + 0.02, TILE.oak), pbr('oak', { color: 0xf3e2c8, roughness: 0.5 }), x, topY - 0.045, z);
  const legH = topY - 0.06;
  const nx = Math.max(1, Math.round((w - 0.24) / 1.4));
  for (let i = 0; i <= nx; i++)
    for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.05, legH, 0.05), steel, x - (w / 2 - 0.12) + (i * (w - 0.24)) / nx, legH / 2, z + sz * (d / 2 - 0.12));
  for (const sz of [-1, 1]) add(new THREE.BoxGeometry(w - 0.24, 0.035, 0.035), steel, x, legH - 0.05, z + sz * (d / 2 - 0.12));
}
