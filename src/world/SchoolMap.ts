// 학교 맵: 2층 건물. 2층(y=0) = 6-1 교실·복도·급식실·강당·방송실(사건 무대), 1층(y=-3.6) = 현관·저학년 교실·교무실.
// 책상·의자·가구는 Poly Haven(CC0) 모델을 쓰고, 모델을 못 불러오면 기본 도형으로 대신한다.
import * as THREE from 'three';
import { aabb, type Aabb } from './Collision';
import { CanvasTex, font, wrapText } from './canvasTex';
import { mergeStatic } from './merge';
import type { PosterTheme } from '../core/SaveData';
import { hasProp, placeInstances, placeOne, type Fit, type Placement } from './props';
import { CorridorBuilder } from './CorridorHQ';
import { ClassroomBuilder } from './ClassroomHQ';
import { LibraryBuilder } from './LibraryHQ';
import { FirstFloorBuilder, LOBBY, NURSE, OFFICE } from './FirstFloorHQ';
import { EntranceBuilder } from './EntranceHQ';
import { buildTabletCart } from './props/tabletCart';
import { buildCutleryBin, buildTray } from './props/items';
import { drawKidPoster } from './props/posterArt';
import { TILE_EXT, plinthMat, stuccoMat } from './exteriorTex';
import { ART_CAB, BOOKSHELF, CLASS_DOORS, CLASS_SEATING, BACK_BOARD, CLEAN_CABINET, CLOCK_POS, DESK, EAST_PILLAR, WEST_PILLAR, GROUP_TABLE, HALL_WINDOWS, HALL_WIN_Y, LOCKERS, LOCKER_COLS, LOCKER_COUNT, LOCKER_DOOR, LOCKER_FRONT_Z, MY_LOCKER, PODS, POSTER_BOARD, RECYCLE, TABLET_CART, TRASH, WINDOW_CAB, classSeat, lockerCell } from './classroomLayout';
import { buildCleaningCabinet, buildFabricRecycling, buildLockerCarcass, buildOfficeChair, buildStudentChair, buildStudentDesk, buildTeacherPC, buildTrashBin, lockerDoorGeo, lockerHandle, mdf } from './classroomSet';
import { compact } from './props/kit';
import { GymBuilder } from './GymHQ';
import { CafeteriaWingBuilder, STEEL, cafeteriaTable } from './CafeteriaWing';
import { CAFE, FLOOR1_Y, SLAB, STAIR, STOREY } from './rooms';
import { buildArtCabinet, buildBin, buildBookshelf } from './classroomFurniture';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { TILE, isPbrMaterial, paint, pbr, worldUV } from './pbr';

export interface Seat {
  x: number;
  z: number;
  /** 바닥 높이 (없으면 2층 0) */
  y?: number;
  yaw: number;
  deskX: number;
  deskZ: number;
  /** 책상 모델 회전 (없으면 0: 의자가 +z 쪽) */
  rot?: number;
  /** 책상 바깥 옆면 방향(z)과 그 옆에 서는 곳 (교실 모둠 책상) */
  side?: number;
  standX?: number;
  standZ?: number;
}

const WALL_H = 3;
/** 1층 바닥 높이 (우리 반이 있는 2층이 y = 0) */
export { FLOOR1_Y, STAIR } from './rooms';
/** 계단: x 범위, 아래(1층) z, 위(2층) z */
/** 거대 돈가스 판 크기 (미터) */
export const CUTLET_W = 5.2;
export const CUTLET_D = 2.8;
export const CUTLET_H = 0.2;


const C = {
  floorWood: 0xd9b382,
  floorHall: 0xd8d5cc,
  wall: 0xf4efe4,
  wallTrim: 0x3a3f44, // 짙은 걸레받이
  desk: 0xe8c592,
  deskLeg: 0x8a8f99,
  chair: 0x6ca0dc,
  locker: 0xa7c7e7,
  board: 0x1d2b2a,
};

export class SchoolMap {
  root = new THREE.Group();
  colliders: Aabb[] = [];
  /** 카메라가 뚫고 지나가지 않도록 하는 벽 */
  cameraBlockers: THREE.Object3D[] = [];
  seats: Record<string, Seat> = {};
  objs: Record<string, THREE.Object3D> = {};
  cafeteriaDoor!: { mesh: THREE.Object3D; collider: Aabb; open: number };
  boardTex = new CanvasTex(1024, 448);
  clockTex = new CanvasTex(256, 256);
  posterTex = new CanvasTex(512, 384);
  private matCache = new Map<number, THREE.MeshLambertMaterial>();
  /** 지금 짓고 있는 층의 바닥 높이 (2층 = 0, 1층 = FLOOR1_Y) */
  private baseY = 0;
  /** 지금 짓고 있는 층 (충돌 상자에 붙는다) */
  private curLevel: 0 | 1 | 'both' = 1;
  private ceilMat: THREE.MeshLambertMaterial | undefined;
  private lampMat: THREE.MeshBasicMaterial | undefined;
  private levelCache: [Aabb[], Aabb[]] = [[], []];
  private levelCacheLen = -1;
  private crumbMat: THREE.MeshLambertMaterial | null = null;
  private machineScreen!: CanvasTex;
  private ruleBoardTex!: CanvasTex;
  broadcastDoor!: Aabb;
  gymDoor!: Aabb;
  /** 사건 2 동안만 켜는 충돌 상자 (로봇 수거함·분실물 보관함) */
  robotColliders: Aabb[] = [];

  /** 소품 모델 여러 개 놓기. 모델이 없으면 false */
  protected props(id: string, places: Placement[], fit: Fit): boolean {
    const g = placeInstances(id, places, fit);
    if (!g) return false;
    this.root.add(g);
    return true;
  }
  /** 소품 모델 하나를 parent 안에 놓기. 모델이 없으면 false */
  private prop(id: string, parent: THREE.Object3D, fit: Fit, x = 0, y = 0, z = 0, ry = 0): boolean {
    const g = placeOne(id, fit);
    if (!g) return false;
    g.position.set(x, y, z);
    g.rotation.y = ry;
    parent.add(g);
    return true;
  }

  constructor() {
    this.buildClassroom();
    this.buildHallway();
    this.buildCafeteria();
    this.buildBroadcastRoom();
    this.buildRobotCorner();
    this.buildGym();
    // 여기까지 지은 것은 모두 2층 (충돌 상자에 층 표시)
    for (const c of this.colliders) if (c.level === undefined) c.level = 1;
    this.finishSecondFloor();
    this.buildStairs();
    this.buildFirstFloor();
    // 복도 꾸미기: (창문 벽 구간, 교실 쪽 위 유리창 구간, 색깔 아치 위치)
    new ClassroomBuilder(this.root, this.colliders, this.cameraBlockers).build();
    new CafeteriaWingBuilder(this.root, this.colliders, this.cameraBlockers).build();
    new LibraryBuilder(this.root, this.colliders, this.cameraBlockers).build();
    new GymBuilder(this.root, this.colliders, this.cameraBlockers).build();
    new CorridorBuilder(this.root, this.colliders, this.cameraBlockers).build({
      baseY: 0,
      level: 1,
      z0: -16.1,
      z1: 16.1,
      windows: [[-4.2, 2.2], [6.9, 15.8]],
      transoms: [
        { z0: -15.6, z1: -11.8, clear: false },
        { z0: -10.2, z1: -6.4, clear: false },
                { z0: 9.6, z1: 15.6, clear: false },
      ],
      arches: [-9.6, -0.2, 7.0, 15.4],
      openDoors: [], // 6-1 문은 SchoolMap.buildSlidingDoor (열리고 닫히는 미닫이)
    });
    new CorridorBuilder(this.root, this.colliders, this.cameraBlockers).build({
      baseY: FLOOR1_Y,
      level: 0,
      z0: -16.1,
      z1: 16.1,
      windows: [],
      transoms: [
        { z0: -15.6, z1: -11.8, clear: false },
        { z0: -10.2, z1: -6.4, clear: false },
        { z0: -5.6, z1: -2.3, clear: false },
        { z0: -0.7, z1: 6.6, clear: false },
        { z0: 9.8, z1: 13.4, clear: false },
      ],
      arches: [-12.0, 2.0, 11.8],
      openDoors: [],
    });
    new FirstFloorBuilder(this.root, this.colliders, this.cameraBlockers).build();
    this.buildExterior();
    new EntranceBuilder(this.root, this.colliders, this.cameraBlockers).build();
    this.setBoard(['6-1', '오늘도 무사히!']);
    this.setClock(8 * 60 + 40);
    this.optimize();
  }

  /** 상호작용·애니메이션이 없는 상자들을 재질별로 합친다 (그리기 호출 수백 개 → 수십 개) */
  private optimize() {
    const keep = new Set<THREE.Object3D>();
    for (const [k, o] of Object.entries(this.objs)) if (!k.startsWith('desk_') || o === this.objs.playerDesk) keep.add(o);
    const cached = new Set<THREE.Material>(this.matCache.values());
    mergeStatic(this.root, keep, (m) => cached.has(m) || isPbrMaterial(m));
  }

  private mat(color: number): THREE.MeshLambertMaterial {
    let m = this.matCache.get(color);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color });
      this.matCache.set(color, m);
    }
    return m;
  }

  /** 상자 하나 추가. collide면 XZ 충돌 상자도 등록 */
  box(
    w: number, h: number, d: number, color: number, x: number, y: number, z: number,
    o: { collide?: boolean; wall?: boolean; parent?: THREE.Object3D; ownMat?: boolean; shadow?: boolean } = {},
  ): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d);
    let material: THREE.Material;
    if (color === C.wall && !o.ownMat) material = pbr('plaster', { roughness: 0.92 }), worldUV(geo, w, h, d, TILE.plaster);
    else if (color === C.wallTrim && !o.ownMat) material = paint(C.wallTrim, 0.45);
    else material = o.ownMat ? new THREE.MeshLambertMaterial({ color }) : this.mat(color);
    const m = new THREE.Mesh(geo, material);
    // parent가 있으면 부모 기준 좌표, 없으면 지금 짓는 층의 바닥 높이(baseY)를 더한다
    m.position.set(x, y + h / 2 + (o.parent ? 0 : this.baseY), z);
    m.receiveShadow = true;
    m.castShadow = o.shadow ?? !o.wall;
    (o.parent ?? this.root).add(m);
    if (o.collide) this.colliders.push({ ...aabb(x, z, w, d), level: this.curLevel });
    if (o.wall) this.cameraBlockers.push(m);
    return m;
  }

  /** 이 층 벽 높이: 1층은 위층 바닥 밑면까지(한 층 전체), 2층은 천장까지 */
  private get wallH() {
    return this.curLevel === 0 ? STOREY : WALL_H;
  }
  private wallX(x: number, z0: number, z1: number) {
    this.box(0.2, this.wallH, z1 - z0, C.wall, x, 0, (z0 + z1) / 2, { collide: true, wall: true });
    this.box(0.22, 0.12, z1 - z0, C.wallTrim, x, 0, (z0 + z1) / 2, { wall: false, shadow: false });
  }
  private wallZ(z: number, x0: number, x1: number) {
    this.box(x1 - x0, this.wallH, 0.2, C.wall, (x0 + x1) / 2, 0, z, { collide: true, wall: true });
    this.box(x1 - x0, 0.12, 0.22, C.wallTrim, (x0 + x1) / 2, 0, z, { shadow: false });
  }

  private plane(w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y + this.baseY, z);
    m.rotation.y = ry;
    this.root.add(m);
    return m;
  }

  /** 바닥 (지금 층) */
  private floorPlane(w: number, d: number, x: number, z: number, mat: THREE.Material) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, this.baseY + 0.001, z);
    m.receiveShadow = true;
    this.root.add(m);
    return m;
  }

  /** 천장 (아래를 보는 판) + 천장 등. 카메라가 천장을 뚫고 올라가지 않게 막는다 */
  private ceiling(w: number, d: number, x: number, z: number, lights = true, h = WALL_H) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.ceilMat ??= new THREE.MeshLambertMaterial({ color: 0xf4f2ea }));
    m.rotation.x = Math.PI / 2;
    m.position.set(x, this.baseY + h, z);
    m.castShadow = true; // 지붕 역할: 해가 천장을 뚫고 들어오지 않게
    this.root.add(m);
    this.cameraBlockers.push(m);
    if (!lights) return;
    const lamp = (this.lampMat ??= new THREE.MeshBasicMaterial({ color: 0xfffdf2 }));
    const nx = Math.max(1, Math.round(w / 3.5)), nz = Math.max(1, Math.round(d / 3.5));
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(w > d ? 1.2 : 0.3, 0.04, w > d ? 0.3 : 1.2), lamp);
        l.position.set(x - w / 2 + ((i + 0.5) * w) / nx, this.baseY + h - 0.03, z - d / 2 + ((j + 0.5) * d) / nz);
        this.root.add(l);
      }
  }

  /**
   * 벽에서 복도 쪽으로 튀어나온 실 명패 (양면, 사진의 「제2과학실」처럼).
   * wallX: 벽 x, z: 명패 위치, dir: 복도 쪽 (+1 = +x로 튀어나옴)
   */
  private flagSign(text: string, wallX: number, z: number, dir: 1 | -1, bg = '#ffffff', fg = '#1d3557') {
    const t = new CanvasTex(256, 96);
    t.draw((c, w, h) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#adb5bd';
      c.lineWidth = 6;
      c.strokeRect(3, 3, w - 6, h - 6);
      c.fillStyle = fg;
      c.font = font(text.length <= 3 ? 60 : text.length > 5 ? 34 : 42, true);
      c.textAlign = 'center';
      c.fillText(text, w / 2, text.length <= 3 ? 70 : 64);
    });
    const g = new THREE.Group();
    g.position.set(wallX + dir * 0.42, this.baseY + 2.5, z);
    this.root.add(g);
    for (const s of [1, -1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.25), t.material());
      m.rotation.y = s === 1 ? 0 : Math.PI;
      m.position.z = s * 0.012;
      g.add(m);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.29, 0.02), this.mat(0xced4da));
    g.add(bar);
    // 벽에 붙는 받침
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.06), this.mat(0x868e96));
    arm.position.x = -dir * 0.37;
    g.add(arm);
    return g;
  }

  /** 닫힌 문 + 이름표 (들어갈 필요 없는 방) */
  private door(name: string, label: string, x: number, z: number, ry: number, color = 0xc7a27a, signBg = '#2d6a4f') {
    const g = new THREE.Group();
    g.position.set(x, this.baseY, z);
    g.rotation.y = ry;
    this.root.add(g);
    const panel = this.box(1.2, 2.1, 0.06, color, 0, 0, 0, { parent: g, ownMat: true, shadow: false });
    this.cameraBlockers.push(panel); // 닫힌 문 너머로 카메라가 빠지지 않게
    const win = this.box(0.4, 0.5, 0.07, 0x9ad0ec, -0.25, 1.35, 0, { parent: g, shadow: false });
    void win;
    const t = new CanvasTex(256, 64);
    t.draw((c, w, h) => {
      c.fillStyle = signBg;
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff';
      c.font = font(label.length > 5 ? 28 : 32, true);
      c.textAlign = 'center';
      c.fillText(label, w / 2, 44);
    });
    if (Math.abs(Math.abs(ry) - Math.PI / 2) < 0.01) {
      // 복도 벽의 문: 문 옆 위에 튀어나온 실 명패
      const west = ry > 0;
      this.flagSign(label, west ? 7.1 : 11.1, z + 0.8, west ? 1 : -1);
    } else {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), t.material());
      sign.position.set(0, 2.35, 0.04);
      g.add(sign);
    }
    this.objs[name] = g;
    return g;
  }

  private buildClassroom() {
    // 바닥·천장·창문 벽·판벽·붙박이 가구 모습은 ClassroomHQ가 짓는다. 여기서는 벽·충돌·게임이 쓰는 물건.
    // 벽: 앞(칠판) z=-6, 뒤(사물함·게시판, 문 없음) z=7, 창문 x=-7, 복도 쪽 x=7 (앞문·뒷문 모두 여기)
    this.wallZ(-6.1, -7.2, 7.2);
    this.wallZ(7.1, -7.2, 7.2);
    this.wallX(7.1, -6, CLASS_DOORS[0].z0);
    this.wallX(7.1, CLASS_DOORS[1].z1, 7);
    // 두 문 사이: 기둥 벽 + 복도가 보이는 유리창 두 칸 (창 아래·위만 벽)
    let zPrev = CLASS_DOORS[0].z1;
    for (const [a, b] of HALL_WINDOWS) {
      this.wallX(7.1, zPrev, a);
      this.box(0.2, HALL_WIN_Y.sill, b - a, C.wall, 7.1, 0, (a + b) / 2, { collide: true, wall: true });
      this.box(0.22, 0.12, b - a, C.wallTrim, 7.1, 0, (a + b) / 2, { shadow: false });
      this.box(0.2, WALL_H - HALL_WIN_Y.top, b - a, C.wall, 7.1, HALL_WIN_Y.top, (a + b) / 2, { wall: true });
      zPrev = b;
    }
    this.wallX(7.1, zPrev, CLASS_DOORS[1].z0);
    // 문 위 벽 + 미닫이 문 (가까이 가면 좌우로 열린다)
    CLASS_DOORS.forEach((d, i) => {
      this.box(0.2, 0.8, d.z1 - d.z0, C.wall, 7.1, 2.2, (d.z0 + d.z1) / 2);
      this.buildSlidingDoor(i, d.z0, d.z1);
    });

    for (const P of [WEST_PILLAR, EAST_PILLAR]) this.colliders.push(aabb(P.x, P.z, P.w, P.d));
    // 전자칠판 + 시계
    const boardFrame = this.box(3.8, 1.8, 0.08, 0x30343b, 0, 0.75, -5.96, { shadow: false });
    boardFrame.material = paint(0x1c1f23, 0.35, 0.2).clone(); // 강조 효과용 자기 재질
    boardFrame.name = 'board';
    this.objs.board = boardFrame;
    this.plane(3.6, 1.575, this.boardTex.material(), 0, 1.65, -5.91);
    // 벽시계: 복도 쪽 가운데 기둥 (게임 시간과 연동 — setClock)
    const clock = new THREE.Mesh(new THREE.CircleGeometry(0.27, 40), this.clockTex.material());
    clock.position.set(CLOCK_POS.x - 0.012, CLOCK_POS.y, CLOCK_POS.z);
    clock.rotation.y = -Math.PI / 2;
    this.root.add(clock);
    const clockRim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.022, 10, 40), paint(0x2f3337, 0.45));
    clockRim.position.set(CLOCK_POS.x - 0.006, CLOCK_POS.y, CLOCK_POS.z);
    clockRim.rotation.y = -Math.PI / 2;
    this.root.add(clockRim);
    this.objs.clock = clock;

    // 선생님 책상 (앞 왼쪽, 창가): 책상 + 컴퓨터(모니터·키보드·필기구) + 의자
    const tdesk = new THREE.Group();
    tdesk.position.set(-4.6, 0, -4.7);
    this.root.add(tdesk);
    if (!this.prop('metal_office_desk', tdesk, { w: 1.5, h: 0.78, d: 0.75 }, 0, 0, 0, Math.PI)) {
      this.box(1.5, 0.08, 0.75, 0xb98b5e, 0, 0.72, 0, { parent: tdesk });
      this.box(0.5, 0.72, 0.7, 0xa57a50, -0.45, 0, 0, { parent: tdesk });
    }
    const drawer = this.box(0.44, 0.18, 0.04, 0xd0a674, -0.45, 0.45, 0.37, { parent: tdesk, ownMat: true });
    this.objs.teacherDrawer = drawer;
    if (!this.prop('classic_laptop', tdesk, { w: 0.36 }, 0.42, 0.78, -0.05)) this.box(0.25, 0.3, 0.02, 0x222222, 0.42, 0.8, -0.2, { parent: tdesk });
    const pc = buildTeacherPC();
    pc.scale.setScalar(0.8);
    pc.position.set(-0.26, 0.78, -0.02);
    pc.rotation.y = Math.PI; // 화면이 선생님(칠판 쪽)을 본다
    tdesk.add(pc);
    const tchair = buildOfficeChair();
    tchair.position.set(0.62, 0, -0.72);
    tchair.rotation.y = Math.PI - 0.5;
    tdesk.add(tchair);
    this.colliders.push(aabb(-4.6, -4.7, 1.5, 0.75));
    this.objs.teacherDesk = tdesk;

    // 급식표 (앞 벽 오른쪽)
    const menu = new CanvasTex(400, 520);
    menu.draw((c, w, h) => {
      c.fillStyle = '#fff8e7';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#ff7b54';
      c.fillRect(0, 0, w, 70);
      c.fillStyle = '#fff';
      c.font = font(36, true);
      c.textAlign = 'center';
      c.fillText('이번 주 급식', w / 2, 48);
      c.textAlign = 'left';
      const days = [['월', '돈가스★, 양배추샐러드'], ['화', '카레라이스, 깍두기'], ['수', '짜장밥, 탕수육(소)'], ['목', '비빔밥, 미역국'], ['금', '스파게티, 마늘빵']];
      days.forEach(([d, m], i) => {
        const y = 110 + i * 82;
        c.fillStyle = i === 0 ? '#ffe3a3' : '#f1ece0';
        c.fillRect(16, y - 34, w - 32, 70);
        c.fillStyle = '#333';
        c.font = font(30, true);
        c.fillText(d, 30, y + 10);
        c.font = font(24);
        c.fillText(m, 80, y + 10);
      });
    });
    const menuMesh = this.plane(0.9, 1.17, menu.material(), 4.6, 1.6, -5.9);
    this.objs.lunchMenu = menuMesh;

    // 학생 책상 8개 + 의자 8개 = 학생 8명 (플레이어 + NPC 7명). 일반 책상 4개를 맞붙인 모둠 둘 (CLASS_SEATING)
    // 밝은 나무 상판 + 회색 금속 틀 + 회색 계열 의자 (classroomSet) — 8벌을 재질별로 한 덩어리로 합친다
    const desks = new THREE.Group();
    this.root.add(desks);
    for (const [pod, sx, row, who] of CLASS_SEATING) {
      const s = classSeat(pod, sx, row);
      const g = new THREE.Group();
      g.position.set(s.deskX, 0, s.deskZ);
      g.rotation.y = s.rot;
      desks.add(g);
      g.add(buildStudentDesk(DESK.w, DESK.d, DESK.top));
      const ch = buildStudentChair();
      ch.position.z = DESK.d / 2 + 0.25;
      g.add(ch);
      this.seats[who] = s;
      const anchor = new THREE.Group();
      anchor.position.set(s.deskX, 0, s.deskZ);
      this.root.add(anchor);
      this.objs['desk_' + who] = anchor;
    }
    compact(desks);
    for (const p of PODS) this.colliders.push(aabb(p.x, p.z, DESK.d * 2, DESK.w * 2, 'desk'));
    this.objs.playerDesk = this.objs.desk_player;
    // 모둠 활동 자리 = 1모둠 책상 가운데 (별도 모둠 책상 없음). 상호작용 기준점만 둔다
    const gt = new THREE.Group();
    gt.position.set(GROUP_TABLE.x, GROUP_TABLE.top, GROUP_TABLE.z);
    this.root.add(gt);
    this.objs.groupTable = gt;

    // ── 뒤 벽: (복도 쪽) 청소도구함 → 사물함 → 태블릿 충전함 → 쓰레기통 → 분리수거함 (창가 쪽) ──
    // 태블릿 충전함 (props/tabletCart.ts). 위 거치대에 세워 꽂힌 태블릿 8대: objs.tabletSlots
    const { cart, slots } = buildTabletCart();
    cart.position.set(TABLET_CART.x, 0, TABLET_CART.z);
    cart.rotation.y = -Math.PI / 2; // 앞면이 교실 쪽(-z)
    this.root.add(cart);
    this.objs.tabletSlots = slots;
    this.colliders.push(aabb(TABLET_CART.x, TABLET_CART.z, 1.1, 0.6));
    this.objs.tabletCart = cart;

    // 사물함 (12칸 × 2단, 연한 우드 MDF, 원형 매립 손잡이, 번호 없음) — 17번이 내 것
    const lockers = new THREE.Group();
    this.root.add(lockers);
    this.objs.lockers = lockers;
    const carcass = buildLockerCarcass(LOCKERS.w, LOCKERS.d, LOCKERS.top, LOCKER_COLS);
    carcass.position.set(LOCKERS.x, 0, LOCKERS.z);
    lockers.add(carcass);
    const doorMat = mdf();
    const doorsG = new THREE.Group();
    lockers.add(doorsG);
    const doorGeo = lockerDoorGeo(LOCKER_DOOR.w, LOCKER_DOOR.h);
    for (let num = 1; num <= LOCKER_COUNT; num++) {
      if (num === MY_LOCKER) continue; // 내 사물함 문은 아래에서 따로 (열리는 문)
      const c = lockerCell(num);
      const d = new THREE.Mesh(doorGeo, doorMat);
      d.position.set(c.x, c.y + 0.04 + LOCKER_DOOR.h / 2, LOCKER_FRONT_Z);
      d.castShadow = d.receiveShadow = true;
      doorsG.add(d);
      lockerHandle(doorsG, c.x - LOCKER_DOOR.w / 2 + 0.07, c.y + 0.04 + LOCKER_DOOR.h / 2, LOCKER_FRONT_Z);
    }
    compact(doorsG);
    // 번호표: 기본은 숨김 — 필요할 때만 보인다 (setLockerNumbers)
    const numbers = new THREE.Group();
    numbers.visible = false;
    lockers.add(numbers);
    this.objs.lockerNumbers = numbers;
    for (let row = 0; row < 2; row++) {
      const lab = new CanvasTex(1536, 40);
      lab.draw((c, w, h) => {
        c.clearRect(0, 0, w, h);
        c.font = font(26, true);
        c.textAlign = 'center';
        for (let col = 0; col < LOCKER_COLS; col++) {
          const num = row * LOCKER_COLS + col + 1;
          // 번호판은 뒤집혀(π) 붙으므로 텍스처 u=(col+0.5)/12 가 월드 x = lockerCell(num).x
          const cx = ((col + 0.5) * w) / LOCKER_COLS;
          c.fillStyle = num === MY_LOCKER ? '#ffd43b' : '#ffffff';
          c.beginPath();
          c.roundRect(cx - 34, 3, 68, 34, 8);
          c.fill();
          c.fillStyle = '#333';
          c.fillText(String(num), cx, 30);
        }
      });
      const lm = lab.material();
      lm.transparent = true;
      lm.alphaTest = 0.5;
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(LOCKERS.w, (LOCKERS.w * 40) / 1536), lm);
      plate.position.set(LOCKERS.x, lockerCell(row * LOCKER_COLS + 1).y + 0.04 + LOCKER_DOOR.h - 0.09, LOCKER_FRONT_Z - 0.03);
      plate.rotation.y = Math.PI;
      numbers.add(plate);
    }
    // 내 사물함 문 (경첩 축): 경첩은 문의 -x 쪽 모서리 (교실에서 보면 오른쪽), 문 아래 모서리 높이
    const hinge = new THREE.Group();
    const mine = lockerCell(MY_LOCKER);
    hinge.position.set(mine.x - LOCKER_DOOR.w / 2, mine.y + 0.04, LOCKER_FRONT_Z);
    this.root.add(hinge);
    const door = new THREE.Mesh(doorGeo, doorMat.clone());
    door.material.userData = {};
    door.position.set(LOCKER_DOOR.w / 2, LOCKER_DOOR.h / 2, 0);
    door.castShadow = true;
    hinge.add(door);
    lockerHandle(hinge, 0.07, LOCKER_DOOR.h / 2, 0);
    this.objs.lockerDoor = hinge;
    this.objs.locker17 = door;
    this.colliders.push(aabb(LOCKERS.x, LOCKERS.z, LOCKERS.w, LOCKERS.d));

    // 청소도구함 (뒷문 가까이, 낮은 양문형). 문은 E로 여닫는다
    const cc = CLEAN_CABINET;
    const hasBroom = hasProp('plastic_broom');
    const { cabinet, doors: cleanDoors } = buildCleaningCabinet(cc.w, cc.h, cc.d, !hasBroom);
    cabinet.position.set(cc.x, 0, cc.z);
    this.root.add(cabinet);
    // 빗자루(모델)는 안 오른쪽 칸에 세워 둔다 — 자루가 윗면 수납구 위로 올라온다
    if (hasBroom) this.prop('plastic_broom', cabinet, { h: 1.12 }, -cc.w / 4 - 0.1, 0.09, 0.07, 0.4);
    this.colliders.push(aabb(cc.x, cc.z, cc.w, cc.d));
    this.objs.cleanCabinet = cabinet;
    this.cleanDoors = cleanDoors;

    // 파란 쓰레기통(흰 스윙 뚜껑) + 천 3칸 분리수거함(캔·종이·플라스틱)
    const bin = buildTrashBin();
    bin.position.set(TRASH.x, 0, TRASH.z);
    this.root.add(bin);
    this.objs.trashBin = bin;
    this.colliders.push(aabb(TRASH.x, TRASH.z, 0.42, 0.36));
    const trash = buildFabricRecycling();
    trash.position.set(RECYCLE.x, 0, RECYCLE.z);
    this.root.add(trash);
    this.colliders.push(aabb(RECYCLE.x, RECYCLE.z, RECYCLE.w, 0.38));
    this.objs.trash = trash;

    // ── 창가(서): 긴 수납장 줄 속의 학급 문고(열린 책장)와 미술 재료함 + 정리 바구니 3개 ──
    const shelf = new THREE.Group();
    shelf.position.set(BOOKSHELF.x, 0, BOOKSHELF.z);
    this.root.add(shelf);
    buildBookshelf(shelf);
    this.objs.bookshelf = shelf;
    const cab = new THREE.Group();
    cab.position.set(ART_CAB.x, 0, ART_CAB.z);
    this.root.add(cab);
    buildArtCabinet(cab);
    const binColors = [0xef6f7f, 0xf2c94c, 0x5bb8e8];
    const binNames = ['자르기·재기', '붙이기', '종이·펜']; // Morning BIN_NAMES와 같게
    ['binCut', 'binStick', 'binPaper'].forEach((name, i) => {
      const b = new THREE.Group();
      b.position.set(WINDOW_CAB.x, WINDOW_CAB.h + 0.03, ART_CAB.z - 0.6 + i * 0.6);
      b.scale.setScalar(0.92);
      this.root.add(b);
      buildBin(b, binColors[i], binNames[i]);
      this.objs[name] = b;
    });
    this.objs.artCabinet = cab;
    this.colliders.push(aabb(WINDOW_CAB.x, (WINDOW_CAB.z0 + WINDOW_CAB.z1) / 2, WINDOW_CAB.d, WINDOW_CAB.z1 - WINDOW_CAB.z0));

    // 뒤 게시판 (작품 전시 + 모둠 포스터)
    const B = BACK_BOARD;
    const exhibit = this.box(B.w - 0.16, B.h - 0.16, 0.04, 0x1f6b4a, B.x, B.y + 0.08, 6.96, { shadow: false, ownMat: true });
    exhibit.material = paint(0x1f7a52, 0.95).clone();
    this.objs.exhibitBoard = exhibit;
    // 모둠 포스터: 살짝 들뜬 종이 + 압정 네 개
    const pg = new THREE.PlaneGeometry(1.6, 1.2, 8, 6);
    const pp = pg.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pp.count; i++) {
      const u = Math.abs(pp.getX(i)) / 0.8, v = Math.abs(pp.getY(i)) / 0.6;
      pp.setZ(i, Math.pow(Math.max(0, Math.max(u, v) - 0.7) / 0.3, 2) * 0.015 + u * u * 0.006);
    }
    pg.computeVertexNormals();
    const poster = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: this.posterTex.tex, roughness: 0.85, side: THREE.DoubleSide }));
    poster.scale.setScalar(0.82);
    poster.position.set(POSTER_BOARD.x, 2.06, 6.9);
    poster.rotation.y = Math.PI;
    this.root.add(poster);
    const pinM = new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.4 });
    for (const [px, py] of [[-0.74, 0.54], [0.74, 0.54], [-0.74, -0.54], [0.74, -0.54]]) {
      const pin = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), pinM);
      pin.position.set(px, py, 0.015);
      poster.add(pin);
    }
    poster.visible = false;
    this.objs.groupPoster = poster;
  }

  /** 청소도구함 문 (E로 여닫기) */
  private cleanDoors: THREE.Group[] = [];
  cleanOpen = false;
  toggleCleanCabinet() {
    this.cleanOpen = !this.cleanOpen;
  }
  /** 사물함 번호표 보이기/숨기기 (기본 모델에는 번호가 없다) */
  setLockerNumbers(v: boolean) {
    this.objs.lockerNumbers.visible = v;
  }

  /** 6-1 미닫이 문: 나무 틀 + 유리 + 레일. 문짝 두 장이 벽 앞(복도 쪽)에서 좌우로 밀린다 */
  private classDoors: { leaves: THREE.Group[]; zc: number; w: number; open: number }[] = [];
  private buildSlidingDoor(i: number, z0: number, z1: number) {
    const oak = pbr('oak', { roughness: 0.65 });
    const w = z1 - z0, zc = (z0 + z1) / 2, lw = w / 2 + 0.02, H = 2.08, x = 7.235;
    const glass = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, roughness: 0.05, depthWrite: false });
    const leaves: THREE.Group[] = [];
    for (const s of [-1, 1]) {
      const leaf = new THREE.Group();
      leaf.position.set(x, 0, zc + (s * lw) / 2);
      const part = (h: number, d: number, y: number, z: number, mat: THREE.Material = oak, t = 0.04) => {
        const m = new THREE.Mesh(worldUV(new THREE.BoxGeometry(t, h, d), t, h, d, TILE.oak), mat);
        m.position.set(0, y + h / 2, z);
        m.castShadow = m.receiveShadow = true;
        leaf.add(m);
        return m;
      };
      // 울거미 (세로 틀 둘 + 가로 틀 셋) + 아래 나무 판 + 위 유리
      part(H, 0.09, 0.01, -lw / 2 + 0.045);
      part(H, 0.09, 0.01, lw / 2 - 0.045);
      part(0.1, lw - 0.18, 0.01, 0);
      part(0.09, lw - 0.18, 0.95, 0);
      part(0.09, lw - 0.18, H - 0.08, 0);
      part(0.84, lw - 0.18, 0.11, 0, oak, 0.022);
      const gp = part(H - 0.08 - 1.04, lw - 0.18, 1.04, 0, glass, 0.008);
      gp.castShadow = false;
      gp.renderOrder = 2;
      // 세로 매립 손잡이 (문 맞닿는 쪽), 양면
      for (const sx of [-1, 1]) part(0.22, 0.03, 0.92, -s * (lw / 2 - 0.045), paint(0x8a8f96, 0.35, 0.7), 0.05).position.x = sx * 0.002;
      this.root.add(leaf);
      this.objs[`classDoor${i}${s > 0 ? 'b' : 'a'}`] = leaf;
      leaves.push(leaf);
    }
    // 문틀(복도 쪽) + 위 레일 덮개 + 바닥 레일
    const fx = 7.215;
    const frame = (wd: number, h: number, d: number, y: number, z: number, mat: THREE.Material = oak, px = fx) => {
      const m = new THREE.Mesh(worldUV(new THREE.BoxGeometry(wd, h, d), wd, h, d, TILE.oak), mat);
      m.position.set(px, y + h / 2, z);
      m.castShadow = m.receiveShadow = true;
      this.root.add(m);
    };
    frame(0.03, 2.1, 0.09, 0, z0 - 0.045);
    frame(0.03, 2.1, 0.09, 0, z1 + 0.045);
    frame(0.13, 0.1, w * 2 + 0.2, 2.1, zc, oak, 7.265); // 위 레일 덮개 (문이 밀려 들어가는 길이까지)
    frame(0.1, 0.008, w * 2 + 0.1, 0.002, zc, paint(0x9aa0a6, 0.35, 0.8), 7.26); // 바닥 레일
    this.classDoors.push({ leaves, zc, w: lw, open: 0 });
  }

  /** 미닫이 문·청소도구함 문 움직임. pts = 사람들 위치 (문 가까이 오면 열린다) */
  updateClassroom(dt: number, pts: { x: number; y: number; z: number }[]) {
    for (const d of this.classDoors) {
      const near = pts.some((p) => Math.abs(p.y) < 1 && Math.abs(p.x - 7.1) < 1.7 && Math.abs(p.z - d.zc) < 1.5);
      const target = near ? 1 : 0;
      if (d.open === target) continue;
      d.open = Math.max(0, Math.min(1, d.open + Math.sign(target - d.open) * dt * 2.4));
      const k = d.open * d.open * (3 - 2 * d.open);
      d.leaves[0].position.z = d.zc - d.w / 2 - k * (d.w - 0.1);
      d.leaves[1].position.z = d.zc + d.w / 2 + k * (d.w - 0.1);
    }
    const ct = this.cleanOpen ? 1.75 : 0;
    this.cleanDoors.forEach((h, i) => {
      const target = i === 0 ? -ct : ct;
      h.rotation.y += (target - h.rotation.y) * Math.min(1, dt * 6);
    });
  }

  private buildHallway() {
    // 복도 바닥·창문·기둥은 decorateCorridor에서

    // z -16~-14: 계단 위 입구 / 창문 구간(-4.2~2.2, 6.9~15.8)은 CorridorHQ가 창문 벽으로 짓는다
    this.wallX(11.1, -14, -4.2);
    this.wallX(11.1, 2.2, 3.9);
    this.wallX(11.1, 5.1, 6.9);
    this.wallX(11.1, 15.8, 16);
    this.wallX(7.1, -16, -6.2);
    this.wallX(7.1, 7.2, 16);
    this.wallZ(-16.1, 7, 8.4);
    this.wallZ(-16.1, 9.6, 11);
    this.box(1.2, 0.8, 0.2, C.wall, 9, 2.2, -16.1);
    this.wallZ(16.1, 2.9, 8);
    this.wallZ(16.1, 10, 15.1);
    this.box(2, 0.8, 0.2, C.wall, 9, 2.2, 16.1);
    // 도서관 입구 (예전 급식실 자리): 나무 문틀 + 옆으로 밀어 둔 유리 미닫이 + 명패
    for (const x of [7.96, 10.04]) this.box(0.08, 2.2, 0.26, 0x9c6644, x, 0, 16.1).material = pbr('oak', { roughness: 0.65 });
    this.box(2.16, 0.08, 0.26, 0x9c6644, 9, 2.2, 16.1).material = pbr('oak', { roughness: 0.65 });
    this.sign('도서관', 9, 2.45, 15.98, Math.PI, '#2d6a4f');

    // 문 장식 (잠긴 문들)
    this.door('doorBroadcast', '방송실', 10.97, 4.5, -Math.PI / 2, 0x9b8bb4);
    this.door('doorClass1', '5-1', 7.23, -11, Math.PI / 2);
    this.door('doorClass4', '4-1', 7.23, 8.4, Math.PI / 2);
    this.door('doorGym', '강당 ▲', 9, -15.97, 0, 0x7a9cc6);
    this.flagSign('계단 ▶ 1층', 11.1, -13.8, -1, '#457b9d', '#ffffff');

    // 우리 반 명패 (앞문·뒷문 옆에 튀어나온 판)
    this.flagSign('6-1', 7.1, -3.4, 1, '#ffe8d6', '#d62828');
    this.flagSign('6-1', 7.1, 6.55, 1, '#ffe8d6', '#d62828');

    // 게시판 (자료 조사)
    const bb = new CanvasTex(512, 300);
    bb.draw((c, w, h) => {
      c.fillStyle = '#d4a373';
      c.fillRect(0, 0, w, h);
      const notes: [string, string, string][] = [
        ['#fefae0', '학교 소식', '도서관 새 책 30권 도착!'],
        ['#e9f5db', '학생 의견함', '"쉬는 시간이 너무 짧아요"'],
        ['#ffe5ec', '안내', 'AI 학교생활 도우미 시범 운영 중'],
      ];
      notes.forEach(([bg, title, body], i) => {
        const x = 18 + i * 164;
        c.fillStyle = bg;
        c.fillRect(x, 30, 150, 230);
        c.fillStyle = '#c1121f';
        c.beginPath();
        c.arc(x + 75, 40, 7, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#333';
        c.font = font(24, true);
        c.fillText(title, x + 10, 80);
        c.font = font(20);
        wrapText(c, body, x + 10, 116, 132, 28);
      });
    });
    const bframe = this.box(0.06, 1.35, 2.2, 0x9c6644, 10.97, 0.92, -10.5, { shadow: false });
    bframe.material = pbr('oak', { roughness: 0.7 });
    const cork = this.plane(2.06, 1.22, pbr('cork', { roughness: 0.95 }), 10.935, 1.595, -10.5, -Math.PI / 2);
    worldUV(cork.geometry, 2.06, 1.22, 0, TILE.cork);
    const bulletin = this.plane(1.9, 1.11, bb.material(), 10.93, 1.6, -10.5, -Math.PI / 2);
    this.objs.bulletin = bulletin;

    // 정수기
    {
      // 흰 몸통(모서리 둥근) + 스테인리스 앞판 + 물 받는 곳 + 꼭지 두 개
      const body = new THREE.Mesh(new RoundedBoxGeometry(0.42, 1.25, 0.46, 3, 0.05), paint(0xf4f5f2, 0.35));
      body.position.set(7.5, 0.625, 10.5);
      body.castShadow = body.receiveShadow = true;
      const front = new THREE.Mesh(new RoundedBoxGeometry(0.02, 0.62, 0.36, 2, 0.008), paint(0xc8cdd2, 0.25, 0.85));
      front.position.set(7.72, 0.62, 10.5);
      const recess = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.3), paint(0x2b2f33, 0.6));
      recess.position.set(7.72, 1.0, 10.5);
      const tray = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.3), paint(0x8d939a, 0.4, 0.6));
      tray.position.set(7.76, 0.86, 10.5);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.22), paint(0x4ea8de, 0.3));
      panel.position.set(7.725, 1.2, 10.5);
      this.root.add(body, front, recess, tray, panel);
      for (const z of [10.43, 10.57]) {
        const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 8), paint(0xdee2e6, 0.25, 0.9));
        tap.position.set(7.74, 1.1, z);
        this.root.add(tap);
      }
      this.colliders.push(aabb(7.5, 10.5, 0.42, 0.46));
    }
  }

  /**
   * 1층 급식실 동의 게임 물건 (모습은 CafeteriaWing): 창고 선반·크기 조절기·접이식 테이블 더미,
   * 배식대·국통, 조리실 작업대 위 거대 돈가스·안전 절단기·조작 패널, 식판 수레, 친구들 식탁 자리, 급식실 문.
   * 좌표는 모두 rooms.ts의 CAFE 기준값.
   */
  private buildCafeteria() {
    const prevY = this.baseY, prevLevel = this.curLevel;
    this.baseY = CAFE.y;
    this.curLevel = 0;
    const Y = CAFE.y;
    const lv0 = (b: Aabb) => ({ ...b, level: 0 as const });
    const steel = STEEL();
    const group = (x: number, z: number) => {
      const g = new THREE.Group();
      g.position.set(x, Y, z);
      this.root.add(g);
      return g;
    };

    // ── 식재료·조리 도구 창고 ──
    const sh = CAFE.storageShelf;
    const shelf = group(sh.x, sh.z);
    if (!this.prop('Shelf_01', shelf, { w: 1.6, h: 1.6, d: 0.45 }, 0, 0, 0, Math.PI / 2)) this.box(0.45, 1.6, 1.6, 0xa0a8b0, 0, 0, 0, { parent: shelf });
    this.colliders.push(lv0(aabb(sh.x, sh.z, 0.5, 1.6)));
    this.objs.storageShelf = shelf;
    // 음식 크기 조절기 (창고 구석 단말기)
    const sm = CAFE.sizeMachine;
    const mach = group(sm.x, sm.z);
    const machBody = new THREE.Mesh(new RoundedBoxGeometry(0.9, 1.35, 0.5, 2, 0.04), paint(0x8d99ae, 0.45, 0.4).clone());
    machBody.position.y = 0.675;
    machBody.castShadow = true;
    mach.add(machBody);
    const screen = new CanvasTex(256, 160);
    screen.draw((c, w) => {
      c.fillStyle = '#10261c';
      c.fillRect(0, 0, w, 160);
      c.fillStyle = '#7cfc8a';
      c.font = font(30, true);
      c.textAlign = 'center';
      c.fillText('크기 조절기', w / 2, 60);
      c.font = font(40, true);
      c.fillText('1000%', w / 2, 120);
    });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.375), screen.material());
    scr.position.set(0, 1.05, -0.26);
    scr.rotation.y = Math.PI;
    mach.add(scr);
    for (const [i, col] of [0xe63946, 0x1d71d2, 0xffc300].entries()) this.box(0.06, 0.4, 0.04, col, -0.2 + i * 0.2, 0.3, -0.27, { parent: mach, shadow: false });
    this.colliders.push(lv0(aabb(sm.x, sm.z, 0.9, 0.5)));
    this.objs.sizeMachine = mach;
    this.machineScreen = screen;
    // 접이식 테이블 더미 (축제용)
    const fs = CAFE.foldStack;
    const fold = group(fs.x, fs.z);
    for (let i = 0; i < 4; i++) {
      const t = this.box(1.2, 0.05, 0.6, 0xe9e4d4, 0, 0.05 + i * 0.07, 0, { parent: fold, shadow: false });
      t.rotation.y = Math.PI / 2 + 0.04 * (i % 2 ? 1 : -1);
    }
    this.colliders.push(lv0(aabb(fs.x, fs.z, 0.6, 1.2)));
    this.objs.foldStack = fold;

    // ── 배식대 (식사 공간 ↔ 조리실 벽의 배식창을 가로지름) + 국통 ──
    const ct = CAFE.counter, cx = (ct.x0 + ct.x1) / 2;
    this.box(ct.x1 - ct.x0, ct.top - 0.04, ct.d, 0xbfc5cc, cx, 0, ct.z, { collide: true }).material = steel;
    this.box(ct.x1 - ct.x0 + 0.04, 0.04, ct.d + 0.04, 0xdfe3e8, cx, ct.top - 0.04, ct.z, { shadow: false }).material = paint(0xd5d9dd, 0.25, 0.8);
    const pots = group(0, 0);
    const potSteel = paint(0xd3d7db, 0.25, 0.85);
    [6.6, 8.2, 9.8].forEach((px, i) => {
      const r0 = i === 1 ? 0.24 : 0.28, pz = ct.z + 0.25;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0 * 0.95, 0.34, 24), potSteel);
      body.position.set(px, ct.top + 0.17, pz);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(r0 + 0.01, r0 + 0.01, 0.02, 24), potSteel);
      lid.position.set(px, ct.top + 0.35, pz);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 6), this.mat(0x222222));
      knob.position.set(px, ct.top + 0.38, pz);
      for (const m of [body, lid, knob]) (m.castShadow = true), pots.add(m);
    });
    // 배식대 끝: 칸 나뉜 스테인리스 식판 더미 + 수저통
    for (let k = 0; k < 8; k++) {
      const tray = buildTray();
      tray.position.set(11.0, ct.top + k * 0.013, ct.z + 0.25);
      tray.rotation.y = k % 2 ? 0.02 : -0.015;
      pots.add(tray);
    }
    const cutlery = buildCutleryBin();
    cutlery.position.set(10.55, ct.top, ct.z + 0.25);
    pots.add(cutlery);
    // 크기 조절기로 원래 크기가 된 돈가스 더미 (배식대 식사 쪽)
    const stack = new THREE.Group();
    stack.position.set(8.2, Y + ct.top, ct.z - 0.3);
    const crumbMat = this.crumbMaterial();
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.035, 12).scale(1.3, 1, 0.9), crumbMat);
      c.position.set(((i * 37) % 7) * 0.12 - 0.36, 0.02 + Math.floor(i / 7) * 0.04, ((i * 11) % 3) * 0.08 - 0.08);
      c.rotation.y = i;
      stack.add(c);
    }
    stack.visible = false;
    this.root.add(stack);
    this.objs.cutletStack = stack;
    // 식판 수레 (식사 공간 동쪽 벽)
    const cart = group(14.35, 20.4); // 동쪽 벽 초록 기둥 사이 (조리실 문 앞을 막지 않게)
    const cartSteel = steel.clone();
    // 스테인리스 수레: 선반 두 단 + 기둥 + 바퀴, 위에 식판 더미
    for (const y of [0.1, 0.74]) this.box(0.7, 0.025, 0.6, 0x9aa3ad, 0, y, 0, { parent: cart }).material = cartSteel;
    for (const [lx, lz] of [[-0.33, -0.28], [0.33, -0.28], [-0.33, 0.28], [0.33, 0.28]]) {
      this.box(0.03, 0.68, 0.03, 0x9aa3ad, lx, 0.08, lz, { parent: cart }).material = cartSteel;
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.025, 12), paint(0x2b2f36, 0.6));
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(lx, 0.04, lz);
      cart.add(wheel);
    }
    for (let i = 0; i < 9; i++) {
      const tray = buildTray();
      tray.position.set(0, 0.765 + i * 0.013, 0);
      tray.rotation.y = i % 2 ? 0.02 : -0.02;
      cart.add(tray);
    }
    this.colliders.push(lv0(aabb(14.35, 20.4, 0.7, 0.6)));
    this.objs.trayCart = cart;

    // ── 조리실 작업대 + 거대 돈가스 + 안전 절단기 ──
    const wt = CAFE.workTable;
    const tableTop = wt.top - 0.05; // 접시 두께 0.05 아래가 작업대 윗면
    cafeteriaTable(this.root, wt.x, wt.z, wt.w, wt.d, steel, tableTop, Y);
    this.colliders.push(lv0(aabb(wt.x, wt.z, wt.w, wt.d)));
    const cutlet = new THREE.Group();
    cutlet.position.set(wt.x, Y + tableTop, wt.z);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(wt.w - 0.1, 0.05, wt.d - 0.15), paint(0xd8dde2, 0.3, 0.7));
    plate.position.y = 0.025;
    plate.receiveShadow = true;
    cutlet.add(plate);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(CUTLET_W, CUTLET_H, CUTLET_D), crumbMat);
    slab.position.y = 0.05 + CUTLET_H / 2;
    slab.castShadow = true;
    slab.name = 'slab';
    cutlet.add(slab);
    cutlet.visible = false;
    this.root.add(cutlet);
    this.objs.giantCutlet = cutlet;
    const gantry = new THREE.Group();
    gantry.position.set(wt.x, Y + tableTop, wt.z);
    const yel = 0xffc300;
    this.box(0.12, 0.9, 0.12, yel, 0, 0, -1.75, { parent: gantry, ownMat: true });
    this.box(0.12, 0.9, 0.12, yel, 0, 0, 1.75, { parent: gantry });
    this.box(0.2, 0.14, 3.6, yel, 0, 0.9, 0, { parent: gantry });
    this.box(0.3, 0.3, 0.4, 0x495057, 0, 0.62, 0, { parent: gantry });
    gantry.visible = false;
    this.root.add(gantry);
    this.objs.cutterGantry = gantry;
    // 절단기 조작 패널: 안전 작업 구역 안 (학생은 여기서만 조작)
    const cp = CAFE.cutterPanel;
    const panel = group(cp.x, cp.z);
    this.box(0.35, 1.0, 0.35, 0x495057, 0, 0, 0, { parent: panel });
    this.box(0.5, 0.06, 0.4, 0xffc300, 0, 1.0, 0, { parent: panel, ownMat: true });
    this.box(0.12, 0.04, 0.12, 0xe63946, 0.1, 1.06, 0, { parent: panel, shadow: false });
    panel.visible = false;
    this.objs.cutterPanel = panel;

    // ── 친구들 식탁 (모습은 CafeteriaWing): 식판을 올리는 기준점 + 자리 6개 ──
    CAFE.dinerTables.forEach(({ x, z }, i) => {
      const anchor = new THREE.Object3D();
      anchor.position.set(x, Y + 0.74, z);
      this.root.add(anchor);
      this.objs['dinerTable' + i] = anchor;
      // 북쪽(배식대 쪽) 의자 셋에 앉아 남쪽을 본다. 식판은 앞 식탁 위
      [-0.8, 0, 0.8].forEach((dx, k) => {
        this.seats['diner' + (i * 3 + k)] = { x: x + dx, z: z + 0.62, y: Y, yaw: Math.PI, deskX: x + dx, deskZ: z + 0.18 };
      });
    });
    // 미끄럼 주의 (반납창 앞)
    this.prop('WetFloorSign_01', this.root, { h: 0.6 }, 12.0, Y, 22.3, 0.5);

    // ── 급식실 문 (1층 복도 북쪽 끝, 미닫이) ──
    const d = CAFE.door;
    const doorMesh = this.box(d.w, 2.2, 0.08, 0xd9d9d9, d.x, 0, d.z - 0.05, { ownMat: true });
    doorMesh.material = paint(0xb9c3c9, 0.4, 0.5).clone();
    this.cameraBlockers.push(doorMesh);
    const window = this.box(1.2, 0.5, 0.09, 0x9ad0ec, d.x, 1.4, d.z - 0.05, { ownMat: true, shadow: false });
    const g = new THREE.Group();
    this.root.remove(doorMesh, window);
    g.add(doorMesh, window);
    this.root.add(g);
    this.sign('급식실', d.x, 2.45, d.z - 0.12, Math.PI, '#e76f51');
    const collider = { ...aabb(d.x, d.z, d.w, 0.3), level: 0 as const };
    this.colliders.push(collider);
    this.cafeteriaDoor = { mesh: g, collider, open: 0 };
    this.objs.cafeteriaDoor = g;
    this.baseY = prevY;
    this.curLevel = prevLevel;
  }

  /** 사건 2 청소 로봇 관련: 로봇 수거함·분실물 보관함·고깔 상자·제어 패드·청소 금지 표시 (사건 전에는 숨김) */
  private buildRobotCorner() {
    const corner = new THREE.Group();
    corner.visible = false;
    this.root.add(corner);
    this.objs.robotCorner = corner;
    // 로봇 수거함 (교실 뒤 오른쪽)
    const bin = new THREE.Group();
    bin.position.set(5.3, 0, 5.7);
    corner.add(bin);
    this.box(0.8, 0.55, 0.6, 0x4ea8de, 0, 0, 0, { parent: bin, ownMat: true });
    this.box(0.84, 0.05, 0.64, 0x1d71d2, 0, 0.55, 0, { parent: bin, ownMat: true });
    const label = new CanvasTex(256, 64);
    label.draw((c, w, h) => {
      c.fillStyle = '#fff';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#1d71d2';
      c.font = font(30, true);
      c.textAlign = 'center';
      c.fillText('로봇 수거함', w / 2, 44);
    });
    const lm = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.15), label.material());
    lm.position.set(0, 0.35, -0.305);
    lm.rotation.y = Math.PI;
    bin.add(lm);
    const binItems = new THREE.Group();
    binItems.position.y = 0.58;
    bin.add(binItems);
    this.objs.robotBin = bin;
    this.objs.robotBinItems = binItems;
    this.robotColliders.push(aabb(5.3, 5.7, 0.8, 0.6));
    // 분실물 보관함 (앞 오른쪽, 칸 3개)
    const shelf = new THREE.Group();
    shelf.position.set(6.1, 0, -2.0);
    corner.add(shelf);
    this.box(0.5, 0.06, 1.8, 0xb08968, 0, 0.5, 0, { parent: shelf });
    this.box(0.5, 0.5, 0.05, 0xb08968, 0, 0, -0.9, { parent: shelf });
    this.box(0.5, 0.5, 0.05, 0xb08968, 0, 0, 0.9, { parent: shelf });
    const cats: [string, string, string][] = [['lostBooks', '책·기기', '#2a9d8f'], ['lostTools', '학용품', '#e76f51'], ['lostPaper', '종이·옷', '#8338ec']];
    cats.forEach(([key, name, col], i) => {
      const z = -0.6 + i * 0.6;
      const tray = this.box(0.42, 0.12, 0.52, new THREE.Color(col).getHex(), -0.02, 0.56, z, { parent: shelf, ownMat: true });
      const t = new CanvasTex(192, 64);
      t.draw((c, w, h) => {
        c.fillStyle = col;
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#fff';
        c.font = font(30, true);
        c.textAlign = 'center';
        c.fillText(name, w / 2, 44);
      });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.15), t.material());
      sign.position.set(-0.26, 0.38, z);
      sign.rotation.y = -Math.PI / 2;
      shelf.add(sign);
      const anchor = new THREE.Group();
      anchor.position.set(-0.02, 0.68, z);
      shelf.add(anchor);
      this.objs[key] = anchor;
      void tray;
    });
    this.objs.lostShelf = shelf;
    this.robotColliders.push(aabb(6.1, -2.0, 0.5, 1.8));
    // 고깔 상자
    const cones = new THREE.Group();
    cones.position.set(4.4, 0, 5.9);
    corner.add(cones);
    this.box(0.5, 0.3, 0.4, 0xdee2e6, 0, 0, 0, { parent: cones });
    const coneMat = new THREE.MeshLambertMaterial({ color: 0xff6b35 });
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 10), coneMat);
      c.position.set(-0.13 + i * 0.13, 0.4, 0);
      cones.add(c);
    }
    this.objs.coneBox = cones;
    // 원격 제어 패드 (태블릿 충전함 위)
    const pad = new THREE.Group();
    pad.position.set(6.25, 1.0, -0.75);
    corner.add(pad);
    this.box(0.32, 0.03, 0.22, 0x212529, 0, 0, 0, { parent: pad, ownMat: true });
    const scr = this.box(0.26, 0.01, 0.16, 0x4ea8de, 0, 0.03, 0, { parent: pad, ownMat: true, shadow: false });
    void scr;
    this.objs.robotPad = pad;
    // 청소 금지 구역 표시 (바닥 원)
    const spots: [string, number, number][] = [['zone_desk', -1.05, 0.4], ['zone_board', -3.6, 5.85], ['zone_locker', 1.5, 5.85]];
    const ring = new THREE.MeshBasicMaterial({ color: 0xff6b35, transparent: true, opacity: 0.7 });
    for (const [key, x, z] of spots) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.33, 24), ring);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.006, z);
      corner.add(m);
      this.objs[key] = m;
    }
    for (const c of this.robotColliders) {
      c.enabled = false;
      this.colliders.push(c);
    }
  }

  /** 사건 2 물건 보이기·숨기기 (충돌 포함) */
  setRobotCorner(on: boolean) {
    this.objs.robotCorner.visible = on;
    for (const c of this.robotColliders) c.enabled = on;
  }

  /** 체육관 (복도 북쪽, x 1~17, z -30~-16.1). 사건 3에서 열린다. 공 위치·발사대·골대는 dodgeLogic.ts와 맞춘다 */
  private buildGym() {
    // 마루·높은 창·무대·천장 등 모습은 GymHQ (북쪽 벽 대신 무대)
    this.wallX(17.1, -30.1, -16.1);
    this.wallZ(-16.1, 0.9, 7);
    this.wallZ(-16.1, 11, 17.1);
    // 서쪽 벽: 공 창고 입구 (z -28 ~ -24)
    this.wallX(0.9, -30.1, -28);
    this.wallX(0.9, -24, -16.1);
    this.box(0.2, 0.6, 4, C.wall, 0.9, 2.4, -26);
    const storeFloor = new THREE.Mesh(new THREE.PlaneGeometry(3, 5), new THREE.MeshLambertMaterial({ color: 0x9c8466 }));
    storeFloor.rotation.x = -Math.PI / 2;
    storeFloor.position.set(-0.6, 0.002, -26);
    this.root.add(storeFloor);
    this.wallX(-2.1, -28.6, -23.4);
    this.wallZ(-28.6, -2.1, 0.9);
    this.wallZ(-23.4, -2.1, 0.9);
    this.sign('공 창고', 0.75, 2.55, -26, Math.PI / 2, '#3a86ff');
    // 창고 입구 바닥 표시
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 4), new THREE.MeshBasicMaterial({ color: 0x3a86ff, transparent: true, opacity: 0.35 }));
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(1.6, 0.004, -26);
    this.root.add(mark);
    // 뜀틀 (장애물)
    const vault = new THREE.Group();
    vault.position.set(5.4, 0, -22.2);
    this.root.add(vault);
    const vaultWood = pbr('oak', { color: 0xf0d2a8, roughness: 0.55 });
    for (let i = 0; i < 4; i++) {
      const tier = new THREE.Mesh(new RoundedBoxGeometry(0.86 - i * 0.05, 0.235, 1.24 - i * 0.05, 2, i === 3 ? 0.06 : 0.02), i === 3 ? paint(0xf4efe4, 0.7) : vaultWood);
      tier.position.y = i * 0.245 + 0.1175;
      tier.castShadow = tier.receiveShadow = true;
      vault.add(tier);
      if (i < 3) {
        const hole = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.36), paint(0x5b3a24, 0.8));
        hole.position.set(0.43 - i * 0.025 + 0.005, i * 0.245 + 0.12, 0);
        vault.add(hole);
      }
    }
    this.colliders.push(aabb(5.4, -22.2, 0.8, 1.2));
    // 골대 두 개 (새 경기)
    const goalMat = 0xff006e;
    for (const x of [7, 11]) this.box(0.12, 2.2, 0.12, goalMat, x, 0, -29.9, { ownMat: false });
    this.box(4.1, 0.12, 0.12, goalMat, 9, 2.2, -29.9);
    for (const z of [-25, -21]) this.box(0.12, 2.2, 0.12, goalMat, 16.9, 0, z);
    this.box(0.12, 0.12, 4.1, goalMat, 16.9, 2.2, -23);
    const goalA = new THREE.Group();
    const goalB = new THREE.Group();
    this.root.add(goalA, goalB);
    this.objs.goalNorth = goalA;
    this.objs.goalEast = goalB;
    goalA.position.set(9, 0, -29.5);
    goalB.position.set(16.5, 0, -23);
    // 부품 선반 (남동쪽 구석)
    const parts = new THREE.Group();
    parts.position.set(16.3, 0, -17.4);
    this.root.add(parts);
    this.box(0.9, 1.2, 1.4, 0x8d99ae, 0, 0, 0, { parent: parts });
    this.box(0.5, 0.1, 0.9, 0xffbe0b, -0.1, 1.2, 0, { parent: parts, ownMat: true });
    this.colliders.push(aabb(16.3, -17.4, 0.9, 1.4));
    this.objs.gymParts = parts;
    // 발사대 자리 + 발사대 모양 (부품마다 보임)
    const launcher = new THREE.Group();
    launcher.position.set(11.3, 0, -23);
    this.root.add(launcher);
    const spot = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 24), new THREE.MeshBasicMaterial({ color: 0xffbe0b }));
    spot.rotation.x = -Math.PI / 2;
    spot.position.y = 0.005;
    launcher.add(spot);
    const stand = new THREE.Group();
    this.box(0.7, 0.35, 0.7, 0x6c757d, 0, 0, 0, { parent: stand, ownMat: true });
    const ramp = new THREE.Group();
    const rampBoard = this.box(1.2, 0.08, 0.6, 0xffbe0b, 0, 0, 0, { parent: ramp, ownMat: true });
    rampBoard.position.set(-0.3, 0.55, 0);
    rampBoard.rotation.z = -0.35;
    const pad = new THREE.Group();
    this.box(0.25, 0.5, 0.5, 0xe63946, 0.3, 0.35, 0, { parent: pad, ownMat: true });
    launcher.add(stand, ramp, pad);
    stand.visible = ramp.visible = pad.visible = false;
    this.objs.launcher = launcher;
    this.objs.launcherStand = stand;
    this.objs.launcherRamp = ramp;
    this.objs.launcherPad = pad;
    // 규칙 게시판 (북쪽 벽)
    const board = new CanvasTex(512, 320);
    board.draw((c, w, h) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#ff006e';
      c.font = font(40, true);
      c.textAlign = 'center';
      c.fillText('우리 반 새 경기 규칙', w / 2, 60);
      c.fillStyle = '#888';
      c.font = font(26);
      c.fillText('(아직 비어 있음)', w / 2, 170);
    });
    const bm = this.plane(2.4, 1.5, board.material(), 13.5, 1.6, -29.98);
    // 이동식 게시판 받침 (무대 앞에 세워 둠)
    const standMat = paint(0x9aa1a8, 0.4, 0.6);
    const back = this.box(2.5, 1.6, 0.04, 0x9aa1a8, 13.5, 0.8, -30.02, { shadow: true });
    back.material = standMat;
    for (const dx of [-1.2, 1.2]) {
      this.box(0.05, 0.85, 0.05, 0x9aa1a8, 13.5 + dx, 0, -30.02).material = standMat;
      this.box(0.08, 0.04, 0.5, 0x9aa1a8, 13.5 + dx, 0, -29.95).material = standMat;
    }
    this.objs.ruleBoard = bm;
    this.ruleBoardTex = board;
    // 공 수레 (작아진 공 넣는 곳)
    const cart = new THREE.Group();
    cart.position.set(2.4, 0, -17.3);
    this.root.add(cart);
    this.box(0.9, 0.6, 0.6, 0x495057, 0, 0, 0, { parent: cart });
    const balls = new THREE.Group();
    balls.position.y = 0.72;
    cart.add(balls);
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), this.mat(0xe63946));
      b.position.set(-0.25 + i * 0.25, 0, 0);
      balls.add(b);
    }
    this.colliders.push(aabb(2.4, -17.3, 0.9, 0.6));
    this.objs.ballCart = cart;
    this.objs.ballCartBalls = balls;
    // 체육관 문 (잠김)
    this.gymDoor = aabb(9, -16.1, 1.2, 0.3);
    this.colliders.push(this.gymDoor);
  }

  /** 체육관 문 열림 0~1 */
  setGymDoor(t: number) {
    const d = this.objs.doorGym;
    d.position.x = 9 + t * 1.25;
    this.gymDoor.enabled = t < 0.5;
  }

  setRuleBoard(lines: string[]) {
    this.ruleBoardTex.draw((c, w, h) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#ff006e';
      c.font = font(40, true);
      c.textAlign = 'center';
      c.fillText('우리 반 새 경기 규칙', w / 2, 60);
      c.fillStyle = '#243447';
      c.font = font(26, true);
      c.textAlign = 'left';
      lines.forEach((l, i) => c.fillText(`${i + 1}. ${l}`, 30, 120 + i * 50));
      void h;
    });
  }

  /** 방송실 (복도 동쪽, x 11.1~14.7, z 2.5~6.5). 사건 1 축제 경로에서 열린다 */
  private buildBroadcastRoom() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 4), new THREE.MeshLambertMaterial({ color: 0xcdbfa8 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(12.9, 0.001, 4.5);
    this.root.add(floor);
    this.wallZ(2.5, 11.1, 14.8);
    this.wallZ(6.5, 11.1, 14.8);
    this.wallX(14.8, 2.5, 6.5);
    // 마이크 책상
    const desk = new THREE.Group();
    desk.position.set(14.1, 0, 4.5);
    this.root.add(desk);
    if (!this.prop('metal_office_desk', desk, { w: 1.4, h: 0.76, d: 0.7 }, 0, 0, 0, Math.PI / 2)) this.box(0.7, 0.76, 1.4, 0x8d99ae, 0, 0, 0, { parent: desk });
    this.prop('classic_laptop', desk, { w: 0.34 }, 0.05, 0.76, 0.4, -Math.PI / 2);
    this.colliders.push(aabb(14.1, 4.5, 0.7, 1.4));
    const mic = new THREE.Group();
    mic.position.set(13.95, 0.76, 4.3);
    this.root.add(mic);
    this.box(0.14, 0.03, 0.14, 0x343a40, 0, 0, 0, { parent: mic, ownMat: true });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), this.mat(0x343a40));
    stem.position.y = 0.15;
    stem.rotation.z = 0.3;
    mic.add(stem);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), this.mat(0x6c757d));
    head.position.set(-0.05, 0.3, 0);
    mic.add(head);
    this.objs.mic = mic;
    // ON AIR 등
    const onAir = new CanvasTex(256, 80);
    onAir.draw((c, w, h) => {
      c.fillStyle = '#5c1a1a';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#ff6b6b';
      c.font = font(44, true);
      c.textAlign = 'center';
      c.fillText('ON AIR', w / 2, 56);
    });
    const air = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.22), onAir.material());
    air.position.set(14.68, 2.2, 4.5);
    air.rotation.y = -Math.PI / 2;
    this.root.add(air);
    this.objs.onAir = air;
    // 문틀 위 벽 + 문 충돌 (잠겨 있을 때)
    this.box(0.2, 0.8, 1.2, C.wall, 11.1, 2.2, 4.5);
    this.broadcastDoor = aabb(11.1, 4.5, 0.3, 1.2);
    this.colliders.push(this.broadcastDoor);
  }

  private sign(text: string, x: number, y: number, z: number, ry: number, bg: string) {
    const t = new CanvasTex(256, 64);
    t.draw((c, w, h) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff';
      c.font = font(32, true);
      c.textAlign = 'center';
      c.fillText(text, w / 2, 44);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), t.material());
    m.position.set(x, y + this.baseY, z);
    m.rotation.y = ry;
    this.root.add(m);
    return m;
  }

  private crumbMaterial() {
    if (this.crumbMat) return this.crumbMat;
    const crumbTex = new CanvasTex(256, 256);
    crumbTex.draw((c, w, h) => {
      c.fillStyle = '#c8803a';
      c.fillRect(0, 0, w, h);
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 900; i++) {
        c.fillStyle = ['#e0a458', '#a8642a', '#f2c078', '#b87333'][i % 4];
        c.fillRect(rnd() * w, rnd() * h, 3 + rnd() * 5, 3 + rnd() * 5);
      }
    });
    crumbTex.tex.wrapS = crumbTex.tex.wrapT = THREE.RepeatWrapping;
    crumbTex.tex.repeat.set(2, 2);
    this.crumbMat = new THREE.MeshLambertMaterial({ map: crumbTex.tex });
    return this.crumbMat;
  }

  /** 미리 잘라 둔 돈가스 조각 모양 (판 크기 비율로) */
  cutletPieceMesh(cols: number, half: boolean): THREE.Mesh {
    const w = (cols / 12) * CUTLET_W - 0.04;
    const d = (half ? CUTLET_D / 2 : CUTLET_D) - 0.04;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, CUTLET_H, d), this.crumbMaterial());
    m.castShadow = true;
    return m;
  }

  /** 크기 조절기 화면 숫자 */
  setMachineScreen(text: string, color = '#7cfc8a') {
    this.machineScreen.draw((c, w, h) => {
      c.fillStyle = '#10261c';
      c.fillRect(0, 0, w, h);
      c.fillStyle = color;
      c.font = font(30, true);
      c.textAlign = 'center';
      c.fillText('크기 조절기', w / 2, 60);
      c.font = font(40, true);
      c.fillText(text, w / 2, 120);
    });
  }

  /** 방송실 문 열림 0~1 */
  setBroadcastDoor(t: number) {
    const d = this.objs.doorBroadcast;
    d.position.z = 4.5 + t * 1.25;
    this.broadcastDoor.enabled = t < 0.5;
  }

  // ───────────────────────── 층·계단 ─────────────────────────
  /** y 높이 → 층 (0 = 1층, 1 = 2층) */
  levelOf(y: number): 0 | 1 {
    return y > FLOOR1_Y / 2 ? 1 : 0;
  }

  /** 바닥 높이: 계단 위면 경사, 아니면 지금 층 바닥 */
  groundY(x: number, z: number, y: number): number {
    if (x > STAIR.x0 && x < STAIR.x1 && z < STAIR.zBottom && z > STAIR.zTop) {
      const t = (STAIR.zBottom - z) / (STAIR.zBottom - STAIR.zTop);
      return FLOOR1_Y * (1 - t);
    }
    return this.levelOf(y) === 1 ? 0 : FLOOR1_Y;
  }

  /** 이 층에서 부딪히는 상자들 (두 층 공통 벽 포함) */
  collidersFor(level: 0 | 1): Aabb[] {
    if (this.levelCacheLen !== this.colliders.length) {
      this.levelCache = [
        this.colliders.filter((c) => c.level !== 1),
        this.colliders.filter((c) => c.level !== 0),
      ];
      this.levelCacheLen = this.colliders.length;
    }
    return this.levelCache[level];
  }

  /** 다른 층 목표를 가리킬 때: 지금 층의 계단 입구 */
  stairHint(level: 0 | 1): THREE.Vector3 {
    return level === 0 ? new THREE.Vector3(12.4, FLOOR1_Y + 1.6, -5.3) : new THREE.Vector3(12.4, 1.6, -15.0);
  }

  /**
   * 계단실 (1층 z -6 → 2층 z -14, 폭 x 11.1~13.7). 실제 건물처럼 잇는다:
   * - 디딤판 16단(통짜 콘크리트 + 디딤판 윗면 + 미끄럼 방지 줄), 아래는 막힌 경사 밑면
   * - 2층 층계참은 두께 SLAB의 바닥 판(밑면·앞면이 1층에서 보임) + 끝 모서리
   * - 계단실 벽은 1층 바닥 ~ 2층 천장까지 한 장 (층 사이 틈 없음), 1층 입구 위 보(인방)
   * - 양쪽 벽 손잡이(경사 + 층계참 수평부)
   */
  private buildStairs() {
    this.curLevel = 'both';
    this.baseY = FLOOR1_Y;
    const { x0, x1, zBottom, zTop, steps } = STAIR;
    const run = zBottom - zTop, w = x1 - x0, cx = (x0 + x1) / 2;
    const rise = STOREY / steps, tread = run / steps;
    const concrete = paint(0xc9ccd1, 0.75);
    const treadMat = pbr('terrazzo', { color: 0xd4d6d2, roughness: 0.7 });
    const nosing = paint(0x4a4e54, 0.6);
    for (let i = 0; i < steps; i++) {
      const top = rise * (i + 1);
      const z = zBottom - (i + 0.5) * tread;
      // 몸통(바닥부터 이 단 높이까지) — 경사 밑면 대신 계단 아래를 막아 틈이 없게
      this.box(w, top - 0.02, tread + 0.005, 0xc9ccd1, cx, 0, z, { shadow: false }).material = concrete;
      const tr = this.box(w, 0.02, tread + 0.02, 0xd4d6d2, cx, top - 0.02, z + 0.01, { shadow: false });
      tr.material = treadMat;
      worldUV(tr.geometry, w, 0.02, tread + 0.02, TILE.terrazzo);
      this.box(w - 0.1, 0.012, 0.05, 0x4a4e54, cx, top, z + tread / 2 - 0.035, { shadow: false }).material = nosing; // 미끄럼 방지 줄
    }
    // 계단실 벽: 1층 바닥 ~ 2층 천장 (한 장)
    const tall = STOREY + WALL_H;
    const zS = zTop - 2.1, zN = zBottom + 1.5;
    this.box(0.2, tall, zN - zS, C.wall, x1 + 0.1, 0, (zS + zN) / 2, { collide: true, wall: true });
    this.box(w + 0.2, tall, 0.2, C.wall, cx, 0, zS, { collide: true, wall: true });
    this.box(w + 0.2, tall, 0.2, C.wall, cx, 0, zN, { collide: true, wall: true });
    // 1층 계단 입구(복도 쪽 x 11.1, z -6~-4.5) 위 보: 1층 천장 높이 ~ 2층 바닥
    this.box(0.2, STOREY - WALL_H, zN - zBottom + 0.1, C.wall, x0, WALL_H, (zBottom + zN) / 2, { wall: true, shadow: false });
    // 손잡이: 양쪽 벽에 경사 봉 + 받침
    const railMat = pbr('oak', { color: 0xc49a6c, roughness: 0.5 });
    const slope = Math.atan2(STOREY, run);
    for (const x of [x0 + 0.08, x1 - 0.08]) {
      const len = Math.hypot(run, STOREY);
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 10), railMat);
      rail.position.set(x, FLOOR1_Y + STOREY / 2 + 0.88, (zBottom + zTop) / 2);
      rail.rotation.x = Math.PI / 2 - slope;
      rail.castShadow = true;
      this.root.add(rail);
      for (let k = 0; k <= 4; k++) {
        const t = k / 4;
        this.box(0.06, 0.03, 0.03, 0x9aa1a8, x + (x < cx ? -0.03 : 0.03), STOREY * t + 0.86, zBottom - run * t, { shadow: false });
      }
      // 2층 층계참 수평부
      const flat = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 10), railMat);
      flat.position.set(x, 0.88, zTop - 0.6);
      flat.rotation.x = Math.PI / 2;
      this.root.add(flat);
    }
    // 2층 층계참: 두께 있는 바닥 판 (1층 계단에서 올려다보면 밑면·앞면이 보인다)
    this.baseY = 0;
    this.curLevel = 1;
    const landing = this.box(w, SLAB, zTop - zS - 0.1, 0xc9ccd1, cx, -SLAB, (zTop + zS + 0.1) / 2, { shadow: false });
    landing.material = concrete;
    this.floorPlane(w, zTop - zS - 0.1, cx, (zTop + zS + 0.1) / 2, treadMat);
    this.box(w, 0.012, 0.05, 0x4a4e54, cx, 0.0, zTop - 0.03, { shadow: false }).material = nosing;
    // 2층 복도 바닥 판 끝(계단실과 맞닿는 x 11.1 아래) — 층 사이 틈을 판으로 메운다
    this.box(0.2, SLAB, zN - zS, C.wall, x0, -SLAB, (zS + zN) / 2, { shadow: false });
    this.ceiling(w, zN - zS, cx, (zS + zN) / 2);
    // 1층 층계참 바닥
    this.baseY = FLOOR1_Y;
    this.curLevel = 0;
    this.floorPlane(w, zN - zBottom, cx, (zBottom + zN) / 2, treadMat);
    this.baseY = 0;
    this.curLevel = 1;
  }

  /** 2층: 천장, 4·5학년 교실 벽(닫힌 방), 우리 반 꾸미기 */
  private finishSecondFloor() {
    this.baseY = 0;
    this.curLevel = 1;
    this.ceiling(3.7, 4, 12.95, 4.5);
    // 5-1(남쪽)·4-1(북쪽): 닫힌 교실의 바깥 벽
    this.wallZ(-16.1, -7.2, 0.9);
    this.wallX(-7.1, -16.1, -6.0);
    this.wallZ(16.1, -7.2, 2.9);
    this.wallX(-7.1, 7.0, 16.1);
    // 복도 동쪽 닫힌 방들(화장실·도서관 뒤)의 바깥 벽
    // 창문 너머(x 11.2~15)는 바깥: 1층 지붕(옥상) + 난간 벽
    for (const [z0, z1] of [[-4.5, 2.5], [6.5, 16.1]] as [number, number][]) {
      const zc = (z0 + z1) / 2, len = z1 - z0;
      const roof = this.box(3.8, 0.3, len, 0x9a9b96, 13.1, -0.32, zc, { shadow: false });
      roof.material = pbr('terrazzo', { color: 0x9c9d98, roughness: 0.95 });
      worldUV(roof.geometry, 3.8, 0.3, len, 3);
      this.box(0.25, 0.9, len, C.wall, 14.95, -0.02, zc, { shadow: false });
    }

    // 우리 반 앞쪽 칠판 아래 수납장 충돌 상자 (모습은 ClassroomHQ)
    this.colliders.push({ ...aabb(0, -5.79, 7.4, 0.42), level: 1 });
    // 복도: 소화기, 게시물
    this.box(0.18, 0.5, 0.18, 0xd62828, 7.35, 0, 1.2, { shadow: false });
    this.box(0.18, 0.5, 0.18, 0xd62828, 10.85, 0, -7.3, { shadow: false });
  }

  /**
   * 1층 (y = FLOOR1_Y): 중앙 복도, 넓은 현관(실내화 신발장), 계단, 교무실·보건실(들어갈 수 있음),
   * 1~3학년 교실·과학실·화장실(닫힌 문), 북쪽 끝 급식실 동(CafeteriaWing). 벽은 한 층 전체 높이.
   */
  private buildFirstFloor() {
    this.baseY = FLOOR1_Y;
    this.curLevel = 0;
    // 복도 벽: 서쪽(저학년 교실), 동쪽(계단·현관·교무실·보건실·화장실)
    this.wallX(7.1, -16.1, 16.1);
    this.wallX(11.1, -16.1, -6.0);
    const openings: [number, number][] = [[OFFICE.doorZ - 0.6, OFFICE.doorZ + 0.6], [NURSE.doorZ - 0.6, NURSE.doorZ + 0.6]];
    let z = 1.0;
    for (const [a, b] of openings) {
      this.wallX(11.1, z, a);
      this.box(0.2, STOREY - 2.2, b - a, C.wall, 11.1, 2.2, (a + b) / 2, { wall: true, shadow: false }); // 문 위
      z = b;
    }
    this.wallX(11.1, z, 16.1);
    this.wallZ(-16.1, 7.0, 11.2);
    this.door('door1_1', '1-1', 7.23, -11, Math.PI / 2, 0xf4a261);
    this.door('door2_1', '2-1', 7.23, -1.5, Math.PI / 2, 0xe9c46a);
    this.door('door3_1', '3-1', 7.23, 9.0, Math.PI / 2, 0x90be6d);
    this.door('doorScience', '과학실', 7.23, 14.2, Math.PI / 2, 0x8fb996);
    this.door('doorRestroom', '화장실', 10.97, 13.5, -Math.PI / 2);
    // 교무실·보건실: 열린 미닫이 (문틀 + 옆으로 밀어 둔 문짝) + 튀어나온 명패
    for (const [dz, name, bg] of [[OFFICE.doorZ, '교무실', '#264653'], [NURSE.doorZ, '보건실', '#e63946']] as [number, string, string][]) {
      const oak = pbr('oak', { roughness: 0.65 });
      this.box(0.26, 0.08, 1.36, 0x9c6644, 11.1, 2.2, dz).material = oak;
      for (const e of [-0.64, 0.64]) this.box(0.26, 2.2, 0.08, 0x9c6644, 11.1, 0, dz + e).material = oak;
      const leaf = this.box(0.045, 2.04, 1.15, 0xc7a27a, 11.24, 0, dz + 1.1);
      leaf.material = oak;
      this.flagSign(name, 11.1, dz - 0.95, -1, bg, '#ffffff');
    }
    // 방 칸막이 (교무실 | 보건실 | 화장실)
    this.wallZ(8.0, 11.1, 14.9);
    this.wallZ(12.0, 11.1, 14.9);
    this.sign('계단 ▶ 2층', 10.98, 2.45, -6.6, -Math.PI / 2, '#457b9d');
    this.sign('급식실 ▲', 9, 2.55, 15.9, Math.PI, '#e76f51');
    // 동쪽 바깥벽 (방들)
    this.wallX(14.9, 1.0, 16.1);
    this.wallX(14.9, -16.1, -4.5);
    // 현관 (x 11.1~18.0): 남·북 벽, 동쪽 유리 출입문 벽
    this.wallZ(LOBBY.z0, 11.1, LOBBY.x1 + 0.1);
    this.wallZ(LOBBY.z1, 11.1, LOBBY.x1 + 0.1);
    // 정문 유리 출입문 벽: 충돌만 여기서 (모습은 EntranceBuilder — 벽돌 기둥·알루미늄 틀·열린 유리문)
    for (const [a, b] of [[LOBBY.z0, LOBBY.doorZ0], [LOBBY.doorZ1, LOBBY.z1]]) this.colliders.push({ ...aabb(LOBBY.x1, (a + b) / 2, 0.2, b - a), level: 0 });
    // 현관 확장부 지붕 (2층 바닥 높이)
    this.box(LOBBY.x1 - 14.9 + 0.3, 0.3, LOBBY.z1 - LOBBY.z0 + 0.4, 0x9c9d98, (14.9 + LOBBY.x1) / 2 + 0.15, STOREY - 0.3, (LOBBY.z0 + LOBBY.z1) / 2, { shadow: false });
    this.door('doorAdmin', '행정실', 10.97, 6.6, -Math.PI / 2, 0xc7a27a);
    // 바깥 마당(현관 앞): 화단 경계석으로 둘러쌈 (모습은 EntranceBuilder). 현관 동 옆 구석까지 막는다
    const yx0 = 14.9, yx1 = 24.6, ycx = (yx0 + yx1) / 2, ylen = yx1 - yx0;
    this.colliders.push(
      { ...aabb(ycx, -7.2, ylen, 0.4), level: 0 },
      { ...aabb(ycx, 4.2, ylen, 0.4), level: 0 },
      { ...aabb(yx1, -1.5, 0.4, 11.8), level: 0 },
    );
    this.baseY = 0;
    this.curLevel = 1;
  }

  /** 건물 바깥: 땅, 운동장, 벽돌 외벽(알록달록 창틀), 지붕. 현관 앞에서 보이는 쪽 위주 */
  private buildExterior() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshLambertMaterial({ color: 0xd8c3a0 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(10, FLOOR1_Y - 0.01, 0);
    ground.receiveShadow = true;
    this.root.add(ground);
    // 외벽: 크림색 뿜칠 + 회색 화강석 받침·층 띠·두겁 (벽돌은 현관 동에만 포인트로 — EntranceBuilder)
    const stucco = stuccoMat(), stone = plinthMat();
    const H = -FLOOR1_Y + WALL_H + 0.3;
    const facade = (w: number, x: number, z: number, ry: number, y0 = FLOOR1_Y, h = H) => {
      const m = new THREE.Mesh(worldUV(new THREE.PlaneGeometry(w, h), w, h, 0, TILE_EXT.stucco), stucco);
      m.position.set(x, y0 + h / 2, z);
      m.rotation.y = ry;
      this.root.add(m);
      return m;
    };
    const plinth = (w: number, x: number, z: number) => {
      const g = new THREE.BoxGeometry(0.08, 0.9, w);
      worldUV(g, 0.08, 0.9, w, TILE_EXT.granitePlinth);
      const m = new THREE.Mesh(g, stone);
      m.position.set(x, FLOOR1_Y + 0.45, z);
      m.receiveShadow = true;
      this.root.add(m);
    };
    // 동쪽 정면 (현관 쪽). 1층 현관 동(z -4.5~1.0) 자리는 비운다 (현관 동 벽이 대신)
    facade(11.7, 15.02, -10.35, Math.PI / 2, FLOOR1_Y, -FLOOR1_Y);
    facade(15.2, 15.02, 8.6, Math.PI / 2, FLOOR1_Y, -FLOOR1_Y);
    facade(11.7, 15.02, -10.35, Math.PI / 2, 0, H + FLOOR1_Y);
    facade(4.0, 15.02, 4.5, Math.PI / 2, 0, H + FLOOR1_Y);
    facade(7.0, 15.02, -1.0, Math.PI / 2, 0, H + FLOOR1_Y); // 현관 위 2층 벽 (학교 이름 글자)
    plinth(11.7, 15.06, -10.35);
    plinth(15.2, 15.06, 8.6);
    // 창: 흰 알루미늄 틀(가운데 세로살 + 위 채광 가로살) + 짙은 유리 + 화강석 창턱
    const glass = new THREE.MeshStandardMaterial({ color: 0x4f6d82, roughness: 0.12, metalness: 0.35, envMapIntensity: 1.4 });
    const frameM = paint(0xf2f2ee, 0.4, 0.3);
    const part = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      this.root.add(b);
    };
    for (const [y, row] of [[FLOOR1_Y + 1.05, 0], [1.05, 1]] as [number, number][]) {
      for (let i = 0; i < 10; i++) {
        const z = -14.5 + i * 3.2;
        if (row === 0 && z > LOBBY.z0 - 1 && z < LOBBY.z1 + 1) continue; // 현관 자리
        if (row === 1 && ((z > -4.5 && z < 2.5) || z > 6.5)) continue; // 2층 복도 창문 쪽은 바깥(옥상)
        const W = 2.2, Hh = 1.5, cy = y + Hh / 2, fx = 15.06;
        const win = new THREE.Mesh(new THREE.PlaneGeometry(W, Hh), glass);
        win.position.set(15.035, cy, z);
        win.rotation.y = Math.PI / 2;
        this.root.add(win);
        part(0.07, 0.07, W + 0.07, frameM, fx, y + Hh, z);
        part(0.07, 0.07, W + 0.07, frameM, fx, y, z);
        part(0.07, Hh, 0.07, frameM, fx, cy, z - W / 2);
        part(0.07, Hh, 0.07, frameM, fx, cy, z + W / 2);
        part(0.06, Hh, 0.05, frameM, fx, cy, z);
        part(0.06, 0.05, W, frameM, fx, y + Hh * 0.72, z);
        part(0.16, 0.06, W + 0.24, stone, 15.1, y - 0.03, z);
      }
    }
    // 층 사이 회색 띠 + 지붕 두겁
    const band = (w: number, y: number, z: number, h: number) => {
      const g = new THREE.BoxGeometry(0.3, h, w);
      worldUV(g, 0.3, h, w, TILE_EXT.granitePlinth);
      const m = new THREE.Mesh(g, stone);
      m.position.set(15.1, y + h / 2, z);
      this.root.add(m);
    };
    band(11.7, -0.32, -10.35, 0.3);
    band(15.2, -0.32, 8.6, 0.3);
    band(11.7, WALL_H, -10.35, 0.38);
    band(4.0, WALL_H, 4.5, 0.38);
    band(7.0, WALL_H, -1.0, 0.38);
    // 남쪽 강당 동, 북쪽 급식실 동 바깥 (현관 앞에서 보이는 면)
    const south = new THREE.Mesh(worldUV(new THREE.PlaneGeometry(2.4, H), 2.4, H, 0, TILE_EXT.stucco), stucco);
    south.position.set(16.2, FLOOR1_Y + H / 2, -16.05);
    this.root.add(south);
    const north = new THREE.Mesh(worldUV(new THREE.PlaneGeometry(0.3, H), 0.3, H, 0, TILE_EXT.stucco), stucco);
    north.position.set(15.0, FLOOR1_Y + H / 2, 16.2);
    this.root.add(north);
    facade(11.0, 15.12, 21.6, Math.PI / 2);
    // 창밖 풍경: 나무 줄 + 아파트 단지 (운동장 사진처럼)
    const trunkMat = paint(0x6b4f3a, 0.9);
    const leafMats = [paint(0x4f8a3c, 0.85), paint(0x5f9e45, 0.85), paint(0x3f7a35, 0.85)];
    for (let i = 0; i < 14; i++) {
      const z = -26 + i * 4.1 + ((i * 37) % 7) * 0.2;
      const x = 24 + ((i * 53) % 5) * 0.6;
      if (Math.abs(z + 1.5) < 2.8) continue; // 정문 앞 길은 비워 둔다 (등교 길·카메라)
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.2, 8), trunkMat);
      trunk.position.set(x, FLOOR1_Y + 1.1, z);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 + ((i * 13) % 4) * 0.2, 1), leafMats[i % 3]);
      crown.position.set(x, FLOOR1_Y + 3.3, z);
      crown.scale.y = 1.25;
      this.root.add(trunk, crown);
    }
    const apt = new CanvasTex(128, 256);
    apt.draw((c, w, h) => {
      c.fillStyle = '#e9e4da';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#9fb3c2';
      for (let y = 6; y < h; y += 14) for (let x = 6; x < w; x += 20) c.fillRect(x, y, 12, 8);
    });
    apt.tex.wrapS = apt.tex.wrapT = THREE.RepeatWrapping;
    for (let i = 0; i < 5; i++) {
      const hgt = 26 + (i % 3) * 6;
      const t = apt.tex.clone();
      t.needsUpdate = true;
      t.repeat.set(2, hgt / 14);
      const b = new THREE.Mesh(new THREE.BoxGeometry(8, hgt, 18), new THREE.MeshLambertMaterial({ map: t }));
      b.position.set(58 + (i % 2) * 9, FLOOR1_Y + hgt / 2, -40 + i * 20);
      this.root.add(b);
    }
    // 멀리 보이는 산 (분위기)
    const hill = new THREE.Mesh(new THREE.SphereGeometry(30, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x4f772d }));
    hill.scale.set(1.6, 0.35, 1);
    hill.position.set(70, FLOOR1_Y, 0);
    this.root.add(hill);
  }

  /** 문 열림 정도 0~1 (시각만; 충돌은 따로) */
  setCafeteriaDoor(t: number) {
    this.cafeteriaDoor.open = t;
    this.cafeteriaDoor.mesh.position.x = t * 2.05;
  }

  setBoard(lines: string[], accent = '#ffd166') {
    this.boardTex.draw((c, w, h) => {
      c.fillStyle = '#16302b';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffffff';
      c.textAlign = 'center';
      lines.forEach((l, i) => {
        c.fillStyle = i === 0 ? accent : '#f1faee';
        c.font = font(i === 0 ? 74 : 50, i === 0);
        c.fillText(l, w / 2, 120 + i * 92);
      });
    });
  }

  setClock(min: number) {
    this.clockTex.draw((c, w) => {
      const r = w / 2;
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(r, r, r - 4, 0, Math.PI * 2);
      c.fill();
      c.lineWidth = 8;
      c.strokeStyle = '#ef476f';
      c.stroke();
      c.fillStyle = '#333';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        c.fillRect(r + Math.sin(a) * (r - 24) - 4, r - Math.cos(a) * (r - 24) - 4, 8, 8);
      }
      const hA = (((min / 60) % 12) / 12) * Math.PI * 2;
      const mA = ((min % 60) / 60) * Math.PI * 2;
      c.lineCap = 'round';
      c.strokeStyle = '#222';
      c.lineWidth = 12;
      c.beginPath();
      c.moveTo(r, r);
      c.lineTo(r + Math.sin(hA) * r * 0.5, r - Math.cos(hA) * r * 0.5);
      c.stroke();
      c.lineWidth = 7;
      c.beginPath();
      c.moveTo(r, r);
      c.lineTo(r + Math.sin(mA) * r * 0.75, r - Math.cos(mA) * r * 0.75);
      c.stroke();
    });
  }

  /** 모둠 포스터를 뒤 게시판에 붙인다 */
  setGroupPoster(theme: PosterTheme, slogan: string, bg: string, stickers: { kind: string; x: number; y: number }[]) {
    // 학생들이 크레파스로 만든 모둠 포스터 (props/posterArt.ts)
    this.posterTex.draw((c, w, h) => drawKidPoster(c, w, h, { theme, slogan, bg, stickers, footer: '6-1 2모둠' }, 2));
    this.objs.groupPoster.visible = true;
  }
}

