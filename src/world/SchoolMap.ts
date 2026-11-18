// 학교 맵: 2층 건물. 2층(y=0) = 6-1 교실·복도·급식실·강당·방송실(사건 무대), 1층(y=-3.6) = 현관·저학년 교실·교무실.
// 책상·의자·가구는 Poly Haven(CC0) 모델을 쓰고, 모델을 못 불러오면 기본 도형으로 대신한다.
import * as THREE from 'three';
import { aabb, type Aabb } from './Collision';
import { CanvasTex, font, wrapText } from './canvasTex';
import { mergeLocal, mergeStatic } from './merge';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SCHOOL_NAME } from '../data/school';
import type { PosterTheme } from '../core/SaveData';
import { hasProp, placeInstances, placeOne, type Fit, type Placement } from './props';
import { CorridorBuilder } from './CorridorHQ';
import { ClassroomBuilder } from './ClassroomHQ';
import { LibraryBuilder } from './LibraryHQ';
import { ENTRANCE_DZ, FirstFloorBuilder, GATE_Z, LOBBY, NURSE, OFFICE } from './FirstFloorHQ';
import { EntranceBuilder } from './EntranceHQ';
import { buildTabletCart } from './props/tabletCart';
import { buildCutleryBin, buildTray } from './props/items';
import { drawKidPoster } from './props/posterArt';
import { TILE_EXT, brickMat, concreteMat, plinthMat, stuccoMat } from './exteriorTex';
import { makeTree } from './landscape';
import { BACK_DZ, ROOM, TEACHER_DESK, TEACHER_SHELF, ART_CAB, BOOKSHELF, CLASS_DOORS, CHAIR, CLASS_SEATING, BACK_BOARD, CLEAN_CABINET, CLOCK_POS, DESK, EAST_PILLAR, WEST_PILLAR, GROUP_TABLE, HALL_WINDOWS, HALL_WIN_Y, LOCKERS, LOCKER_COLS, LOCKER_COUNT, LOCKER_DOOR, LOCKER_FRONT_Z, MY_LOCKER, BIG_EXHIBIT, RECYCLE, TABLET_CART, TRASH, WINDOW_CAB, deskBoxes, lockerCell, seatOf, type DeskLayout } from './classroomLayout';
import { buildCleaningCabinet, buildFabricRecycling, buildLockerCarcass, buildOfficeChair, buildStudentChair, buildStudentDesk, buildSmallBin, buildTeacherDesk, buildTeacherDeskItems, buildTeacherShelf, buildTeacherUnderDesk, buildTrashBin, lockerDoorGeo, lockerHandle, mdf } from './classroomSet';
import { compact } from './props/kit';
import { GymBuilder } from './GymHQ';
import { CafeteriaWingBuilder, STEEL, cafeteriaTable } from './CafeteriaWing';
import { CAFE, FLOOR1_Y, LANDING_Y, STAIR, STAIR_ENDS, STOREY, stairY } from './rooms';
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
  /** 교실 학생 책상: 가방 고리 쪽(책상 자기 좌표 x 부호), 옆에 서는 곳·방향 */
  hookSide?: number;
  standX?: number;
  standZ?: number;
  standYaw?: number;
}

const WALL_H = 3;
/** 복도 벽에 뚫는 문 자리 너비 (door()의 문짝·문선이 이 안에 들어간다) */
const DOOR_GAP = 1.2;
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
      windows: [[-5.4, 2.2], [6.9, 15.8]],
      // 다른 반 창은 frostedRoomFace (위 유리창을 겹치지 않는다)
      transoms: [],
      arches: [-13.3, -0.2, 7.0, 15.4],
      openDoors: [], // 6-1 문은 SchoolMap.buildSlidingDoor (열리고 닫히는 미닫이)
    });
    new CorridorBuilder(this.root, this.colliders, this.cameraBlockers).build({
      baseY: FLOOR1_Y,
      level: 0,
      z0: -16.1,
      z1: 16.1,
      windows: [],
      transoms: [],
      arches: [-2.9, 8.2],
      openDoors: [],
    });
    new FirstFloorBuilder(this.root, this.colliders, this.cameraBlockers).build();
    this.buildExterior();
    {
      // 정문 바깥은 처음 만든 자리 좌표로 짓고 현관과 함께 남쪽으로 옮긴다
      const eg = new THREE.Group();
      eg.position.z = ENTRANCE_DZ;
      this.root.add(eg);
      const c0 = this.colliders.length;
      new EntranceBuilder(eg, this.colliders, this.cameraBlockers).build();
      for (let i = c0; i < this.colliders.length; i++) {
        this.colliders[i].minZ += ENTRANCE_DZ;
        this.colliders[i].maxZ += ENTRANCE_DZ;
      }
    }
    this.buildStreet();
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
  /** x 벽 (z0~z1)에 문 자리(DOOR_GAP)를 뚫어 짓는다: 문 옆 벽 + 문 위 인방 */
  private doorWallX(x: number, z0: number, z1: number, doors: number[]) {
    let z = z0;
    for (const d of [...doors].sort((a, b) => a - b)) {
      const a = d - DOOR_GAP / 2, b = d + DOOR_GAP / 2;
      if (a > z) this.wallX(x, z, a);
      this.box(0.2, this.wallH - 2.2, DOOR_GAP, C.wall, x, 2.2, d, { wall: true, shadow: false });
      z = b;
    }
    if (z1 > z) this.wallX(x, z, z1);
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
  private flagSign(text: string, wallX: number, z: number, dir: 1 | -1, _bg = '', _fg = '') {
    void _bg, void _fg;
    const t = this.plateTex(text, 256, 96);
    const g = new THREE.Group();
    g.position.set(wallX + dir * 0.4, this.baseY + 2.45, z);
    this.root.add(g);
    // 은색 알루미늄 테 + 양면 아크릴 판
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.25, 0.03), paint(0xb8bec4, 0.35, 0.6));
    g.add(bar);
    for (const s2 of [1, -1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.225), t.material());
      m.rotation.y = s2 === 1 ? 0 : Math.PI;
      m.position.z = s2 * 0.016;
      g.add(m);
    }
    // 벽에 붙는 받침 (ㄱ자 금속)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.035), paint(0x8d949b, 0.4, 0.6));
    arm.position.set(-dir * 0.36, 0.08, 0);
    const arm2 = arm.clone();
    arm2.position.y = -0.08;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.24, 0.07), paint(0x8d949b, 0.4, 0.6));
    plate.position.set(-dir * 0.405, 0, 0);
    g.add(arm, arm2, plate);
    return g;
  }

  /** 학교 실명판 무늬 (모든 문패·안내판 공통): 흰 아크릴 + 위아래 남색 선 + 한글 + 작은 영문 */
  private plateTex(text: string, w = 256, h = 96): CanvasTex {
    const EN: Record<string, string> = {
      교장실: "Principal's Office", 행정실: 'Administration', 학생자치실: 'Student Council', Wee클래스: 'Wee Class', 교무실: "Teachers' Office", 보건실: 'Health Room',
      '남자 화장실': 'Men', '여자 화장실': 'Women', '교직원 화장실': 'Staff Restroom', 화장실: 'Restroom', 방송실: 'Broadcasting', 강당: 'Auditorium', 도서관: 'Library',
      급식실: 'Cafeteria', 엘리베이터: 'Elevator', '공 창고': 'Storage', '5-1': 'Class 5-1', '4-1': 'Class 4-1', '6-1': 'Class 6-1',
    };
    const key = text.replace(/[▲▼◀▶]/g, '').trim();
    const en = EN[key] ?? '';
    const t = new CanvasTex(w, h);
    t.draw((c, cw, ch) => {
      c.fillStyle = '#f7f8f8';
      c.fillRect(0, 0, cw, ch);
      c.fillStyle = '#2c4a6b';
      c.fillRect(0, 0, cw, ch * 0.07);
      c.fillRect(0, ch * 0.93, cw, ch * 0.07);
      c.fillStyle = '#1f2d3d';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const big = Math.round(ch * (en ? 0.42 : 0.5));
      c.font = font(text.length > 6 ? Math.round(big * 0.78) : big, true);
      c.fillText(text, cw / 2, en ? ch * 0.43 : ch / 2);
      if (en) {
        c.fillStyle = '#6c757d';
        c.font = font(Math.round(ch * 0.17));
        c.fillText(en, cw / 2, ch * 0.77);
      }
    });
    return t;
  }

  /** 엘리베이터 (복도 동쪽 벽, 지금 층): 스테인리스 양문 + 문틀 + 호출 버튼 + 층 표시 */
  private elevatorDoor(z: number, floor: 1 | 2) {
    const g = new THREE.Group();
    g.position.set(10.99, this.baseY, z);
    this.root.add(g);
    const steel = paint(0xc3c8cd, 0.25, 0.9), dark = paint(0x3a3f45, 0.5, 0.4);
    const frame = (w: number, h: number, d: number, y: number, zz: number, m: THREE.Material = steel) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(d, h, w), m);
      b.position.set(-d / 2, y + h / 2, zz);
      b.castShadow = b.receiveShadow = true;
      g.add(b);
      return b;
    };
    frame(1.5, 0.12, 0.06, 2.1, 0);
    frame(0.12, 2.1, 0.06, 0, -0.69);
    frame(0.12, 2.1, 0.06, 0, 0.69);
    const l = frame(0.62, 2.08, 0.03, 0.01, -0.315, paint(0xd5d9dd, 0.2, 0.95));
    const r = frame(0.62, 2.08, 0.03, 0.01, 0.315, paint(0xd5d9dd, 0.2, 0.95));
    this.cameraBlockers.push(l, r);
    frame(0.006, 2.08, 0.035, 0.01, 0, dark); // 가운데 틈
    // 층 표시 (위) + 호출 버튼 (오른쪽)
    const t = new CanvasTex(128, 48);
    t.draw((c, w, h) => {
      c.fillStyle = '#111';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#ff6b3d';
      c.font = font(30, true);
      c.textAlign = 'center';
      c.fillText(`▲ ${floor}`, w / 2, 36);
    });
    const ind = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.11), t.material());
    ind.position.set(-0.065, 2.38, 0);
    ind.rotation.y = -Math.PI / 2;
    g.add(ind);
    frame(0.12, 0.22, 0.02, 1.0, 0.95, dark);
    for (const [y, c] of [[1.17, 0x74c0fc], [1.05, 0x74c0fc]] as [number, number][]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 12), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.4 }));
      b.rotation.z = Math.PI / 2;
      b.position.set(-0.03, y, 0.95);
      g.add(b);
    }
    this.sign('엘리베이터', 10.98, 2.55, z, -Math.PI / 2, '#495057');
    this.objs[floor === 1 ? 'elevator1' : 'elevator2'] = g;
  }

  /**
   * 닫힌 문 (들어갈 필요 없는 방): 벽 앞에 붙는 문틀 + 문짝. 문 뒤는 벽이 막혀 있어 틈으로 건너편이 보이지 않는다.
   * - 화장실: 밝은 회색 여닫이 문 + 픽토그램 판 + 발차기판 + 레버 손잡이
   * - 교장실: 짙은 나무 여닫이 문 (창 없음)
   * - 그 밖의 방: 나무 미닫이 문 (위쪽 불투명 유리창 + 오목 손잡이) — 한국 학교 실 문
   */
  private door(name: string, label: string, x: number, z: number, ry: number, color = 0xc7a27a, _signBg = '') {
    void _signBg;
    const g = new THREE.Group();
    g.position.set(x, this.baseY, z);
    g.rotation.y = ry;
    this.root.add(g);
    const wc = label.includes('화장실');
    const solidWood = name === 'doorPrincipal';
    const W = wc ? 0.95 : 1.1, H = 2.1;
    const oak = pbr('oak', { roughness: 0.6 });
    // 복도 벽의 문은 벽에 뚫린 자리(DOOR_GAP) 안, 벽 두께 가운데에 들어간다 (문짝 = leafG, 벽 앞면에서 0.12 안쪽)
    const inWall = Math.abs(Math.abs(ry) - Math.PI / 2) < 0.01;
    const leafG = new THREE.Group();
    leafG.position.z = inWall ? -0.12 : 0;
    g.add(leafG);
    let tgt: THREE.Object3D = g;
    const part = (w: number, h: number, d: number, m: THREE.Material, px: number, py: number, pz: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(px, py + h / 2, pz);
      b.castShadow = false;
      b.receiveShadow = true;
      tgt.add(b);
      return b;
    };
    if (inWall) {
      // 문 자리 안쪽 마감 (양옆·위 문선): 벽 두께만큼 깊은 나무/회색 판
      const jamb = wc ? paint(0xa9b0b6, 0.4, 0.4) : pbr('oak', { color: 0xe2c9a6, roughness: 0.6 });
      const jt = (DOOR_GAP - W) / 2;
      for (const s2 of [-1, 1]) part(jt, H + 0.1, 0.22, jamb, s2 * (DOOR_GAP / 2 - jt / 2), 0, -0.13);
      part(DOOR_GAP, 0.1, 0.22, jamb, 0, H, -0.13);
      part(DOOR_GAP, 0.02, 0.22, paint(0x8d8f91, 0.5), 0, 0, -0.13); // 문턱
      if (name !== 'doorBroadcast') {
        // 닫힌 문: 벽 대신 막는다
        const wx = x + Math.sin(ry) * -0.13, wz = z + Math.cos(ry) * -0.13;
        this.colliders.push({ ...aabb(wx, wz, 0.24, DOOR_GAP), level: this.curLevel });
      }
    }
    // 문틀 (벽에서 살짝 튀어나온 테두리)
    const frameM = wc ? paint(0xa9b0b6, 0.4, 0.4) : oak;
    part(W + 0.2, 0.08, 0.1, frameM, 0, H, -0.01);
    for (const s2 of [-1, 1]) part(0.08, H, 0.1, frameM, s2 * (W / 2 + 0.06), 0, -0.01);
    // 문짝 (문 자리 안. 뒤는 방이라 보이지 않는다)
    tgt = leafG;
    const leafM = wc ? paint(0xd5d9dc, 0.45, 0.15) : solidWood ? pbr('oak', { color: 0x8a6a52, roughness: 0.5 }) : oak;
    void color;
    const leaf = part(W, H - 0.01, 0.045, leafM, 0, 0.005, -0.01);
    this.cameraBlockers.push(leaf); // 닫힌 문 너머로 카메라가 빠지지 않게
    const steel = paint(0xc9ced3, 0.28, 0.85);
    if (wc) {
      part(W - 0.06, 0.22, 0.05, paint(0xb3b9bf, 0.35, 0.6), 0, 0.03, -0.005); // 발차기판
      part(0.14, 0.03, 0.04, steel, W / 2 - 0.16, 1.0, 0.03); // 레버
      part(0.06, 0.06, 0.02, steel, W / 2 - 0.1, 0.985, 0.02);
      // 픽토그램 판 (문 위쪽)
      const female = label.includes('여자'), staff = label.includes('교직원');
      const pt = new CanvasTex(128, 160);
      pt.draw((c, w, h) => {
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, w, h);
        const col = staff ? '#495057' : female ? '#d6336c' : '#1c7ed6';
        c.fillStyle = col;
        const fig = (cx: number, skirt: boolean) => {
          c.beginPath();
          c.arc(cx, 34, 12, 0, Math.PI * 2);
          c.fill();
          if (skirt) {
            c.beginPath();
            c.moveTo(cx - 9, 52); c.lineTo(cx + 9, 52); c.lineTo(cx + 18, 98); c.lineTo(cx - 18, 98); c.closePath();
            c.fill();
          } else c.fillRect(cx - 12, 52, 24, 46);
          c.fillRect(cx - 9, 96, 7, 30);
          c.fillRect(cx + 2, 96, 7, 30);
        };
        if (staff) { fig(w / 2 - 22, false); fig(w / 2 + 22, true); } else fig(w / 2, female);
        c.font = font(22, true);
        c.textAlign = 'center';
        c.fillText(staff ? '교직원' : female ? '여자' : label.includes('남자') ? '남자' : '화장실', w / 2, 150);
      });
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.25), pt.material());
      pm.position.set(0, 1.55, 0.016);
      leafG.add(pm);
    } else if (solidWood) {
      // 판문 몰딩 두 칸 + 레버
      for (const py of [0.25, 1.2]) part(W - 0.3, 0.75, 0.012, pbr('oak', { color: 0x7a5c46, roughness: 0.5 }), 0, py, 0.017);
      part(0.14, 0.03, 0.04, steel, W / 2 - 0.16, 1.0, 0.03);
    } else {
      // 미닫이: 위쪽 불투명 유리창(나무 살) + 오목 손잡이 + 아래 판
      const gw = W * 0.55;
      part(gw + 0.06, 0.68, 0.05, oak, -W * 0.12, 1.22, 0.0);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(gw, 0.62), paint(0xd6e0e5, 0.2));
      glass.position.set(-W * 0.12, 1.53, 0.027);
      leafG.add(glass);
      part(0.03, 0.62, 0.012, oak, -W * 0.12, 1.22, 0.03);
      part(0.05, 0.18, 0.02, paint(0x4a4e54, 0.5, 0.5), W / 2 - 0.1, 0.92, 0.015); // 오목 손잡이
      // 문 위 레일 덮개
      part(W + 0.2, 0.06, 0.06, oak, 0, H - 0.06, 0.04);
    }
    if (Math.abs(Math.abs(ry) - Math.PI / 2) < 0.01) {
      // 복도 벽의 문: 문 옆 위에 튀어나온 실명판
      const west = ry > 0;
      this.flagSign(label, west ? 7.1 : 11.1, z + 0.8, west ? 1 : -1);
    } else {
      const t = this.plateTex(label, 256, 80);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.225), t.material());
      sign.position.set(0, 2.35, 0.04);
      g.add(sign);
    }
    mergeLocal(g, isPbrMaterial, this.cameraBlockers); // 문 조각들을 재질별로 합침 (그리기 호출 줄이기)
    mergeLocal(leafG, isPbrMaterial, this.cameraBlockers);
    g.userData.leaf = leafG;
    this.objs[name] = g;
    return g;
  }

  private buildClassroom() {
    // 바닥·천장·창문 벽·판벽·붙박이 가구 모습은 ClassroomHQ가 짓는다. 여기서는 벽·충돌·게임이 쓰는 물건.
    // 벽: 앞(칠판) ROOM.z0, 뒤(사물함·게시판, 문 없음) ROOM.z1, 창문 ROOM.x0, 복도 쪽 x=7 (앞문·뒷문 모두 여기).
    // 복도 쪽 벽은 복도 모습이 그대로이도록 예전 길이(z -6~7)를 유지한다
    this.wallZ(ROOM.z0 - 0.1, ROOM.x0 - 0.2, 7.2);
    this.wallZ(ROOM.z1 + 0.1, ROOM.x0 - 0.2, 7.2);
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
    const boardFrame = this.box(3.8, 1.8, 0.08, 0x30343b, 0, 0.75, ROOM.z0 + 0.04, { shadow: false });
    boardFrame.material = paint(0x1c1f23, 0.35, 0.2).clone(); // 강조 효과용 자기 재질
    boardFrame.name = 'board';
    this.objs.board = boardFrame;
    this.plane(3.6, 1.575, this.boardTex.material(), 0, 1.65, ROOM.z0 + 0.09);
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

    // 선생님 책상 (앞 왼쪽, 창가): 실제 교사용 사무 책상 크기 (가로 2.34 × 깊이 1.1 × 높이 0.99, 학생 책상과 비율을 맞춤)
    // 책상 위: 모니터·키보드·마우스·교과서 3권·필기구 꽂이만. 선생님은 칠판 쪽(-z)에 앉는다
    const TD = TEACHER_DESK;
    const tdesk = new THREE.Group();
    tdesk.position.set(TD.x, 0, TD.z);
    this.root.add(tdesk);
    const { desk: tdeskModel, drawer } = buildTeacherDesk(TD.w, TD.d, TD.h);
    tdesk.add(tdeskModel);
    this.objs.teacherDrawer = drawer;
    const items = buildTeacherDeskItems();
    items.scale.setScalar(1.15);
    items.position.set(-0.25, TD.h, -0.08);
    items.rotation.y = Math.PI; // 화면이 선생님(칠판 쪽)을 본다
    tdesk.add(items);
    // 책상 아래: 컴퓨터 본체·멀티탭·정리된 전선 (모니터 받침 위치 = 물품 묶음 기준 + 0.18×1.15 학생 쪽)
    // 모니터 두 대의 받침 위치 (물품 묶음은 π 돌려 1.15배: 묶음 안 x ±0.29, z -0.2)
    const monXZ = [-0.29, 0.29].map((mxi) => [items.position.x - mxi * 1.15, items.position.z + 0.2 * 1.15] as [number, number]);
    // 멀티탭 선이 들어갈 틈: 교사 책장 끝과 창가 책장 시작 사이 (책상 자기 좌표)
    const gapWorldZ = (TEACHER_SHELF.z + TEACHER_SHELF.len / 2 + WINDOW_CAB.z0) / 2;
    tdesk.add(buildTeacherUnderDesk(TD.w, TD.d, TD.h, monXZ, gapWorldZ - TD.z));
    // 작은 쓰레기통: 책상 아래 본체 앞 (선생님 쪽, 의자 다리 공간 밖)
    const tbin = buildSmallBin();
    tbin.position.set(-TD.w / 2 + 0.24, 0, -TD.d / 2 + 0.12);
    tdesk.add(tbin);
    const tchair = buildOfficeChair();
    tchair.scale.setScalar(1.15);
    tchair.position.set(-0.2, 0, -TD.d / 2 - 0.25);
    tchair.rotation.y = Math.PI - 0.15;
    tdesk.add(tchair);
    // 교사용 교과서 꽂이 선반 (책상 옆, 창 아래)
    const TS = TEACHER_SHELF;
    const tshelf = buildTeacherShelf(TS.len, TS.h, TS.d);
    tshelf.position.set(TS.x, 0, TS.z);
    this.root.add(tshelf);
    this.colliders.push(aabb(TS.x, TS.z, TS.d, TS.len));
    this.colliders.push(aabb(TD.x, TD.z, TD.w, TD.d));
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
    const menuMesh = this.plane(0.9, 1.17, menu.material(), 4.6, 1.6, ROOM.z0 + 0.1);
    this.objs.lunchMenu = menuMesh;

    // 학생 책상 8개 + 의자 8개 = 학생 8명 (플레이어 + NPC 7명). 한 벌(책상+의자)씩 묶어 두고,
    // 수업 배치(짝 ↔ 모둠)가 바뀌면 같은 묶음의 위치·방향만 바꾼다 (setDeskLayout). 가방·책상 위 물건은 이 묶음의 자식
    for (const { who } of CLASS_SEATING) {
      const g = new THREE.Group();
      g.name = 'deskSet:' + who;
      this.root.add(g);
      g.add(buildStudentDesk(DESK.w, DESK.d, DESK.top));
      const ch = buildStudentChair();
      ch.position.z = DESK.d / 2 + CHAIR.gap;
      g.add(ch);
      compact(g);
      this.objs['deskSet_' + who] = g;
      this.objs['desk_' + who] = g;
      this.seats[who] = { ...seatOf('pairs', who) };
    }
    for (const b of deskBoxes('pairs')) {
      const c = { ...aabb(b.x, b.z, b.w, b.d, 'desk'), level: 1 as const };
      this.deskColliders.push(c);
      this.colliders.push(c);
    }
    this.setDeskLayout('pairs');
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
    this.colliders.push(aabb(TABLET_CART.x, TABLET_CART.z, TABLET_CART.w + 0.04, TABLET_CART.d + 0.04));
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
    if (hasBroom) this.prop('plastic_broom', cabinet, { h: cc.h + 0.2 }, -cc.w / 4 - 0.08, 0.09, 0.02, 0.4);
    this.colliders.push(aabb(cc.x, cc.z, cc.w, cc.d));
    this.objs.cleanCabinet = cabinet;
    this.cleanDoors = cleanDoors;

    // 파란 쓰레기통(흰 스윙 뚜껑) + 천 3칸 분리수거함(캔·종이·플라스틱)
    const bin = buildTrashBin();
    bin.position.set(TRASH.x, 0, TRASH.z);
    this.root.add(bin);
    this.objs.trashBin = bin;
    this.colliders.push(aabb(TRASH.x, TRASH.z, TRASH.w, TRASH.d));
    const trash = buildFabricRecycling();
    trash.position.set(RECYCLE.x, 0, RECYCLE.z);
    this.root.add(trash);
    this.colliders.push(aabb(RECYCLE.x, RECYCLE.z, RECYCLE.w, RECYCLE.d));
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
    const exhibit = this.box(B.w - 0.16, B.h - 0.16, 0.04, 0x1f6b4a, B.x, B.y + 0.08, 6.96 + BACK_DZ, { shadow: false, ownMat: true });
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
    poster.position.set(BIG_EXHIBIT.x, BIG_EXHIBIT.y - 0.07, 6.9 + BACK_DZ);
    // 큰 작품 칸의 기본 작품: 학급 협동화 (모둠 포스터를 붙이면 그 자리를 내준다)
    const muralTex = new CanvasTex(640, 400);
    muralTex.draw((c, w, h) => drawKidPoster(c, w, h, { theme: 'friends', slogan: '사이좋은 6학년 1반', bg: '#e7f5ff', stickers: [], footer: '6-1 학급 협동화' }, 2));
    const mural = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.92), new THREE.MeshStandardMaterial({ map: muralTex.tex, roughness: 0.85 }));
    mural.position.set(BIG_EXHIBIT.x, BIG_EXHIBIT.y - 0.07, 6.905 + BACK_DZ);
    mural.rotation.y = Math.PI;
    this.root.add(mural);
    this.objs.bigMural = mural;
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

  /** 지금 학생 책상 배치 */
  deskLayout: DeskLayout = 'pairs';
  private deskColliders: Aabb[] = [];
  /** 학생 책상 배치 바꾸기 (같은 책상·의자를 옮긴다). 자리(seats)는 같은 객체를 고쳐 쓴다. 길 찾기는 부른 쪽에서 다시 만든다 */
  setDeskLayout(layout: DeskLayout) {
    this.deskLayout = layout;
    for (const { who } of CLASS_SEATING) {
      const st = seatOf(layout, who);
      Object.assign(this.seats[who], st);
      const g = this.objs['deskSet_' + who];
      g.position.set(st.deskX, 0, st.deskZ);
      g.rotation.y = st.rot;
      g.updateMatrixWorld(true);
    }
    deskBoxes(layout).forEach((b, i) => Object.assign(this.deskColliders[i], aabb(b.x, b.z, b.w, b.d, 'desk'), { level: 1 }));
    this.levelCacheLen = -1;
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

    // 동쪽(현관 쪽) 벽: 화장실·엘리베이터(z -16~-5.4) | 창(-5.4~2.2) | 방송실 | 창(6.9~15.8). 창 구간은 CorridorHQ
    this.doorWallX(11.1, -16.1, -5.4, [-14.8, -12.2]);
    this.door('doorRestroom2M', '남자 화장실', 10.97, -14.8, -Math.PI / 2, 0x7fa7c9, '#1d3557');
    this.door('doorRestroom2F', '여자 화장실', 10.97, -12.2, -Math.PI / 2, 0xe8a0a8, '#c9184a');
    this.elevatorDoor(-6.6, 2);
    // 서쪽(방 쪽) 벽: 5-1 | 계단실(남쪽 절반 = 3층 가는 방화문, 북쪽 절반 = 1층으로 내려가는 계단 입구) | 6-1 | 4-1
    this.doorWallX(7.1, -16, STAIR.zS0, [-14.2]);
    this.wallX(7.1, STAIR.zS1, STAIR.zN0);
    this.wallX(7.1, STAIR.zN1, -6.0);
    this.box(0.2, WALL_H - 2.2, STAIR.zN1 - STAIR.zN0, C.wall, 7.1, 2.2, (STAIR.zN0 + STAIR.zN1) / 2, { wall: true, shadow: false }); // 계단 입구 위 보
    this.fireDoor();
    this.wallX(11.1, 2.2, 3.9);
    this.wallX(11.1, 5.1, 6.9);
    this.wallX(11.1, 15.8, 16);
    this.doorWallX(7.1, 7.2, 16, [8.4]);
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
    this.door('doorClass1', '5-1', 7.23, -14.2, Math.PI / 2);
    this.door('doorClass4', '4-1', 7.23, 8.4, Math.PI / 2);
    this.door('doorGym', '강당 ▲', 9, -15.97, 0, 0x7a9cc6);
    this.sign('1층 ▼', 7.215, 2.35, STAIR.zN1 + 0.42, Math.PI / 2);
    // 방 쪽 벽 창문 (다른 반: 불투명 유리)
    this.frostedRoomFace(-16.0, STAIR.zS0, [-14.2, -12.4], [-13.3]);
    this.frostedRoomFace(ROOM.z1 + 0.1, 16.0, [8.4, 12.6], [7.0, 15.4]);

    // 우리 반 명패 (앞문·뒷문 옆에 튀어나온 판)
    this.flagSign('6-1', 7.1, CLASS_DOORS[0].z1 + 0.4, 1, '#ffe8d6', '#d62828');
    this.flagSign('6-1', 7.1, CLASS_DOORS[1].z1 + 0.35, 1, '#ffe8d6', '#d62828');

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
    bin.position.set(5.3, 0, 5.7 + BACK_DZ);
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
    this.robotColliders.push(aabb(5.3, 5.7 + BACK_DZ, 0.8, 0.6));
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

  private sign(text: string, x: number, y: number, z: number, ry: number, _bg = '') {
    void _bg;
    // 벽에 붙인 실명판 (얇은 알루미늄 테 + 판)
    const t = this.plateTex(text, 256, 80);
    const g = new THREE.Group();
    g.position.set(x, y + this.baseY, z);
    g.rotation.y = ry;
    this.root.add(g);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.25, 0.02), paint(0xb8bec4, 0.35, 0.6));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.225), t.material());
    m.position.z = 0.011;
    g.add(back, m);
    return g;
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
    // 문짝만 옆 벽 속으로 밀어 넣는다 (문선·문틀은 그대로)
    const leaf = this.objs.doorBroadcast.userData.leaf as THREE.Object3D;
    leaf.position.x = t * 1.2; // 문 자기 좌표 +x = 세계 +z (북쪽 벽 속)
    this.broadcastDoor.enabled = t < 0.5;
  }

  // ───────────────────────── 층·계단 ─────────────────────────
  /** y 높이 → 층 (0 = 1층, 1 = 2층) */
  levelOf(y: number): 0 | 1 {
    return y > FLOOR1_Y / 2 ? 1 : 0;
  }

  /** 바닥 높이: 계단 위면 경사, 아니면 지금 층 바닥 */
  groundY(x: number, z: number, y: number): number {
    // 계단실 안은 늘 계단·층계참 높이 (1층에서 2단 밑, 2층에서 1단 위로는 벽·방화문 때문에 못 들어간다)
    const sy = stairY(x, z);
    if (sy !== null) return sy;
    void y;
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
    const e = STAIR_ENDS;
    return level === 0 ? new THREE.Vector3(e.bottom.x, FLOOR1_Y + 1.6, e.bottom.z) : new THREE.Vector3(e.top.x, 1.6, e.top.z);
  }

  /**
   * 중앙 계단실 (복도 서쪽, 현관에서 복도를 건너 정면): 꺾인 계단.
   * - 1단(남쪽 절반): 1층 복도 쪽에서 서쪽으로 반 층 → 층계참 → 2단(북쪽 절반): 동쪽으로 반 층 → 2층 복도
   * - 2층 남쪽 절반에서는 3층으로 가는 3단이 이어지지만 방화문으로 닫혀 있다 (fireDoor)
   * - 디딤판은 통짜 콘크리트(밑이 막힘) + 디딤판 + 미끄럼 방지 줄, 가운데 벽(벽식 계단), 벽 손잡이
   */
  private buildStairs() {
    const S = STAIR;
    const run = S.xEdge - S.xTurn, tread = run / S.steps;
    const half = -FLOOR1_Y / 2, rise = half / S.steps;
    const concrete = paint(0xc9ccd1, 0.75);
    const treadMat = pbr('terrazzo', { color: 0xd4d6d2, roughness: 0.7 });
    const nosing = paint(0x4a4e54, 0.6);
    const zS = (S.zS0 + S.zS1) / 2, zN = (S.zN0 + S.zN1) / 2, wS = S.zS1 - S.zS0, wN = S.zN1 - S.zN0;
    const zAll = (S.zS0 + S.zN1) / 2, dAll = S.zN1 - S.zS0;
    const landTop = LANDING_Y - FLOOR1_Y;
    this.curLevel = 'both';
    this.baseY = FLOOR1_Y;
    const step = (x: number, top: number, z: number, w: number, noseX: number) => {
      this.box(tread + 0.005, top - 0.02, w, 0xc9ccd1, x, 0, z, { shadow: false }).material = concrete;
      const tr = this.box(tread + 0.01, 0.02, w, 0xd4d6d2, x, top - 0.02, z, { shadow: false });
      tr.material = treadMat;
      worldUV(tr.geometry, tread + 0.01, 0.02, w, TILE.terrazzo);
      this.box(0.05, 0.012, w - 0.1, 0x4a4e54, noseX, top, z, { shadow: false }).material = nosing;
    };
    // 1단: 복도 쪽(x xEdge)이 1층, 서쪽으로 올라간다
    for (let i = 0; i < S.steps; i++) {
      const x = S.xEdge - (i + 0.5) * tread;
      step(x, rise * (i + 1), zS, wS, x + tread / 2 - 0.03);
    }
    // 층계참 (반 층)
    this.box(S.xTurn - S.xBack, landTop - 0.02, dAll, 0xc9ccd1, (S.xBack + S.xTurn) / 2, 0, zAll, { shadow: false }).material = concrete;
    const land = this.box(S.xTurn - S.xBack, 0.02, dAll, 0xd4d6d2, (S.xBack + S.xTurn) / 2, landTop - 0.02, zAll, { shadow: false });
    land.material = treadMat;
    worldUV(land.geometry, S.xTurn - S.xBack, 0.02, dAll, TILE.terrazzo);
    // 2단: 층계참에서 동쪽으로 올라 2층
    for (let i = 0; i < S.steps; i++) {
      const x = S.xTurn + (i + 0.5) * tread;
      step(x, half + rise * (i + 1), zN, wN, x - tread / 2 + 0.03);
    }
    // 2층 도착 바닥 (마지막 디딤판 ~ 복도 벽)
    const arr = this.box(7.15 - S.xEdge, 0.3, wN, 0xd4d6d2, (S.xEdge + 7.15) / 2, -FLOOR1_Y - 0.3, zN, { shadow: false });
    arr.material = treadMat;
    // 1층 입구 바닥 (1단 첫 디딤판 앞 ~ 복도)
    this.box(7.15 - S.xEdge + 0.05, 0.012, wS, 0xd4d6d2, (S.xEdge + 7.15) / 2, 0, zS, { shadow: false }).material = treadMat;
    // 계단실 벽: 1층 바닥 ~ 2층 위 (3층 가는 계단까지 덮는 높이), 바깥쪽 3면 + 가운데 벽
    const tall = -FLOOR1_Y + 3.4;
    const x0 = S.xBack - 0.2;
    this.box(0.2, tall, dAll + 0.4, C.wall, x0 + 0.1, 0, zAll, { collide: true, wall: true });
    for (const z of [S.zS0 - 0.1, S.zN1 + 0.1]) this.box(7.0 - x0, tall, 0.2, C.wall, (x0 + 7.0) / 2, 0, z, { collide: true, wall: true });
    this.box(7.0 - S.xTurn, tall, S.zN0 - S.zS1, C.wall, (S.xTurn + 7.0) / 2, 0, S.zMid, { collide: true, wall: true });
    // 1층에서 2단 밑(막힌 곳)으로 들어가지 못하게
    this.colliders.push({ ...aabb((S.xTurn + S.xEdge) / 2, zN, run, wN), level: 0 });
    // 벽 손잡이 (나무 봉 + 받침): 1단은 남쪽 벽·가운데 벽, 2단은 북쪽 벽·가운데 벽
    const railMat = pbr('oak', { color: 0xc49a6c, roughness: 0.5 });
    const slope = Math.atan2(half, run), len = Math.hypot(half, run);
    const stripeM = paint(0x9fb3a8, 0.7);
    const rail = (z: number, y0: number, up: 1 | -1) => {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 10), railMat);
      r.position.set((S.xEdge + S.xTurn) / 2, FLOOR1_Y + y0 + half / 2 + 0.88, z);
      r.rotation.z = up * (Math.PI / 2 - slope);
      r.castShadow = true;
      this.root.add(r);
      for (let k = 0; k <= 3; k++) {
        const t = k / 3, x = S.xEdge - run * t, y = up > 0 ? half * t : half * (1 - t);
        // 벽 받침 (벽 → 봉 ㄱ자)
        const side = z < (S.zS0 + S.zN1) / 2 ? (Math.abs(z - S.zS0) < 0.2 || Math.abs(z - S.zN0) < 0.2 ? -1 : 1) : (Math.abs(z - S.zN1) < 0.2 ? 1 : -1);
        this.box(0.025, 0.07, 0.025, 0x9aa1a8, x, y0 + y + 0.8, z + side * 0.035, { shadow: false }).material = paint(0x9aa1a8, 0.35, 0.7);
        this.box(0.025, 0.025, 0.06, 0x9aa1a8, x, y0 + y + 0.8, z + side * 0.05, { shadow: false }).material = paint(0x9aa1a8, 0.35, 0.7);
      }
      // 손잡이 끝: 수평으로 30cm 연장 (위·아래 계단 끝, 실제 학교 계단처럼)
      const hEdge = up > 0 ? 0 : half, hTurn = up > 0 ? half : 0;
      for (const [xa, xb, hh] of [[S.xEdge, S.xEdge + 0.3, hEdge], [S.xTurn - 0.3, S.xTurn, hTurn]] as [number, number, number][]) {
        const e = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, xb - xa, 10), railMat);
        e.rotation.z = Math.PI / 2;
        e.position.set((xa + xb) / 2, this.baseY + y0 + hh + 0.88, z);
        this.root.add(e);
      }
      // 벽 띠 (손잡이와 나란한 회녹색 줄 — 계단실 벽 마감)
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, 0.012), stripeM);
      const side2 = Math.abs(z - S.zS0) < 0.2 || Math.abs(z - S.zN0) < 0.2 ? -1 : 1;
      stripe.position.set((S.xEdge + S.xTurn) / 2, this.baseY + y0 + half / 2 + 1.25, z + side2 * 0.05);
      stripe.rotation.z = -up * slope;
      this.root.add(stripe);
    };
    rail(S.zS0 + 0.06, 0, 1);
    rail(S.zS1 - 0.06, 0, 1);
    rail(S.zN0 + 0.06, half, -1);
    rail(S.zN1 - 0.06, half, -1);
    // 벽등 (1단 위, 층계참 위)
    const lampM = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: 1.2 });
    this.box(0.6, 0.08, 0.1, 0xffffff, (S.xEdge + S.xTurn) / 2, 2.7, S.zS0 + 0.05, { shadow: false }).material = lampM;
    this.box(0.1, 0.08, 0.6, 0xffffff, S.xBack + 0.05, landTop + 2.2, zAll, { shadow: false }).material = lampM;
    // 층계참 창 (뒤 벽, 반 층 높이): 바깥 빛이 들어오는 불투명 유리
    const frost = paint(0xdbe5ea, 0.22);
    this.box(0.04, 1.1, 1.8, 0xffffff, S.xBack + 0.02, landTop + 0.9, zAll, { shadow: false }).material = frost;
    for (const dz of [-0.92, 0.92]) this.box(0.06, 1.16, 0.05, 0xffffff, S.xBack + 0.03, landTop + 0.87, zAll + dz, { shadow: false }).material = pbr('oak', { roughness: 0.6 });
    // 층 표지 · 층계참 안내 (벽에 납작하게)
    this.floorPlate('1', 6.35, 1.65, S.zS0 + 0.006, 0);
    this.sign('2층 ▲', S.xBack + 0.012, landTop + 1.55, -7.6, Math.PI / 2);
    this.sign('1층 ▼', S.xBack + 0.012, landTop + 1.55, -10.8, Math.PI / 2);
    // ── 2층 위: 3층 가는 3단(남쪽 절반, 방화문 뒤) + 3층 쪽 층계참 + 계단실 천장 ──
    this.baseY = 0;
    this.curLevel = 1;
    for (let i = 0; i < S.steps; i++) {
      const x = S.xEdge - (i + 0.5) * tread, top = rise * (i + 1);
      this.box(tread + 0.005, 0.35, wS, 0xc9ccd1, x, top - 0.35, zS, { shadow: false }).material = concrete;
      const tr = this.box(tread + 0.01, 0.02, wS, 0xd4d6d2, x, top - 0.02, zS, { shadow: false });
      tr.material = treadMat;
    }
    // 3단 밑면: 계단참에서 올려다볼 때 톱니 모양이 보이지 않게 매끈한 경사 슬래브
    {
      const sof = new THREE.Mesh(new THREE.BoxGeometry(len + 0.1, 0.06, wS - 0.02), concrete);
      sof.position.set((S.xEdge + S.xTurn) / 2, half / 2 - 0.33, zS);
      sof.rotation.z = -slope;
      this.root.add(sof);
    }
    const l3 = this.box(S.xTurn - S.xBack, 0.3, dAll, 0xc9ccd1, (S.xBack + S.xTurn) / 2, half - 0.3 + 0.01, zAll, { shadow: false });
    l3.material = concrete;
    rail(S.zS0 + 0.06, -FLOOR1_Y, 1);
    this.floorPlate('2', 6.35, 1.65, S.zN1 - 0.006, Math.PI);
    this.ceiling(7.0 - x0, dAll + 0.4, (x0 + 7.0) / 2, zAll, true, 3.4);
    this.baseY = 0;
    this.curLevel = 1;
  }

  /** 소화기 + 받침대 (복도 벽 앞 바닥). dir: 벽에서 복도 쪽 (+1 = +x) */
  private extinguisher(x: number, z: number, dir: 1 | -1, wallSign = true) {
    const red = paint(0xc92a2a, 0.35, 0.1), blk = paint(0x212529, 0.6);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.24), paint(0xb0b5ba, 0.4, 0.6));
    stand.position.set(x, this.baseY + 0.025, z);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.46, 16), red);
    body.position.set(x, this.baseY + 0.3, z);
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.07, 10), blk);
    head.position.set(x, this.baseY + 0.565, z);
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.015, 0.03), blk);
    lever.position.set(x + dir * 0.03, this.baseY + 0.6, z);
    const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 6), blk);
    hose.position.set(x - dir * 0.085, this.baseY + 0.4, z);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.14), paint(0xf8f9fa, 0.5));
    label.position.set(x + dir * 0.076, this.baseY + 0.3, z);
    label.rotation.y = dir * Math.PI / 2;
    this.root.add(stand, body, head, lever, hose, label);
    // 벽 위 「소화기」 표지 (벽이 창이면 붙이지 않는다)
    if (!wallSign) {
      this.colliders.push({ ...aabb(x, z, 0.26, 0.26), level: this.curLevel });
      return;
    }
    const t = new CanvasTex(128, 48);
    t.draw((c, w, h) => {
      c.fillStyle = '#c92a2a';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff';
      c.font = font(30, true);
      c.textAlign = 'center';
      c.fillText('소화기', w / 2, 35);
    });
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.11), t.material());
    sg.position.set(x - dir * 0.21, this.baseY + 1.5, z);
    sg.rotation.y = dir * Math.PI / 2;
    this.root.add(sg);
    this.colliders.push({ ...aabb(x, z, 0.26, 0.26), level: this.curLevel });
  }

  /** 층 표지판 (계단실 벽에 붙임: 큰 숫자 + 「층」) */
  private floorPlate(n: string, x: number, y: number, z: number, ry: number, sub = '') {
    const t = new CanvasTex(192, 192);
    t.draw((c, w, h) => {
      c.fillStyle = '#2c4a6b';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = font(104, true);
      c.fillText(n, w / 2 - 20, h / 2 - (sub ? 14 : 0));
      c.font = font(44, true);
      c.fillText('층', w / 2 + 50, h / 2 + 22 - (sub ? 14 : 0));
      if (sub) {
        c.font = font(24, true);
        c.fillText(sub, w / 2, h - 26);
      }
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), t.material());
    m.position.set(x, this.baseY + y, z);
    m.rotation.y = ry;
    this.root.add(m);
  }

  /** 피난 안내도 (액자) */
  private evacMap(x: number, y: number, z: number, ry: number, floor: number) {
    const t = new CanvasTex(320, 230);
    t.draw((c, w, h) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#1f9d55';
      c.fillRect(0, 0, w, 38);
      c.fillStyle = '#fff';
      c.font = font(24, true);
      c.textAlign = 'center';
      c.fillText(`피난 안내도 (${floor}층)`, w / 2, 27);
      c.strokeStyle = '#495057';
      c.lineWidth = 3;
      c.strokeRect(20, 60, w - 40, 130);
      c.strokeRect(20, 105, w - 40, 40);
      for (let i = 1; i < 6; i++) { c.beginPath(); c.moveTo(20 + i * 46, 60); c.lineTo(20 + i * 46, 105); c.stroke(); }
      c.strokeStyle = '#2b8a3e';
      c.lineWidth = 5;
      c.beginPath(); c.moveTo(260, 125); c.lineTo(110, 125); c.lineTo(110, 175); c.stroke();
      c.fillStyle = '#e03131';
      c.beginPath(); c.arc(260, 125, 8, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#212529';
      c.font = font(15);
      c.fillText('● 현재 위치   ━ 대피 경로', w / 2, 215);
    });
    const fr = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.46, 0.02), paint(0xb8bec4, 0.35, 0.6));
    fr.position.set(x, this.baseY + y, z);
    fr.rotation.y = ry;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.42), t.material());
    m.position.set(x + Math.sin(ry) * 0.012, this.baseY + y, z + Math.cos(ry) * 0.012);
    m.rotation.y = ry;
    this.root.add(fr, m);
  }

  /** 창 아래 낮은 복도 책장 (복도 동쪽 창문 벽 앞, 학급 문고). x = 앞면 쪽 가운데 */
  private windowShelf(x: number, z: number, len: number) {
    const H = 0.8, D = 0.32, wood = pbr('oak', { color: 0xe6d2b3, roughness: 0.6 });
    const xc = x + 0.16 - D / 2 + 0.06;
    const g = new THREE.Group();
    g.position.set(xc, this.baseY, z);
    this.root.add(g);
    const b = (w: number, h: number, d: number, m: THREE.Material, px: number, py: number, pz: number) => {
      const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mm.position.set(px, py + h / 2, pz);
      mm.castShadow = mm.receiveShadow = true;
      g.add(mm);
    };
    b(D, 0.022, len, wood, 0, H - 0.022, 0);
    b(D - 0.02, 0.06, len, paint(0x8d8f91, 0.6), 0, 0, 0);
    b(D, 0.022, len, wood, 0, 0.06, 0);
    b(D, 0.022, len, wood, 0, 0.42, 0);
    b(0.012, H, len, wood, D / 2 - 0.006, 0, 0);
    const n = Math.round(len / 0.8);
    for (let i = 0; i <= n; i++) b(D, H - 0.022, 0.022, wood, 0, 0, -len / 2 + 0.011 + (i * (len - 0.022)) / n);
    const cols = [0x1d3557, 0xa61e4d, 0x2b8a3e, 0xe67700, 0x5f3dc4, 0x868e96, 0x0b7285, 0xf1f3f5];
    let k = 0;
    for (const sy of [0.082, 0.442])
      for (let bz = -len / 2 + 0.05; bz < len / 2 - 0.08; ) {
        const bw = 0.025 + ((k * 7) % 3) * 0.008, bh = 0.2 + ((k * 5) % 4) * 0.025;
        if ((k * 11) % 9 === 0) bz += 0.07;
        b(0.2, bh, bw, paint(cols[k % cols.length], 0.7), -0.03, sy, bz + bw / 2);
        bz += bw + 0.003;
        k++;
      }
    this.colliders.push({ ...aabb(xc, z, D, len), level: this.curLevel });
  }

  /** 1층 복도: 소화전함·소화기, 나무 벤치 + 게시판, 낮은 수납장, 교직원 우편함, 피난 안내도·안전 표지 */
  private safetyFixtures1F() {
    const ex = 11.0; // 동쪽 벽 복도 쪽 면
    // 옥내 소화전함 (빨간 철문 + 「소화전」 글씨, 벽에 반쯤 묻힘)
    {
      const z = 6.4;
      this.box(0.12, 1.25, 0.75, 0xc92a2a, ex - 0.02, 0.55, z, { ownMat: true }).material = paint(0xc92a2a, 0.35, 0.1);
      const t = new CanvasTex(128, 64);
      t.draw((c, w, h) => {
        c.clearRect(0, 0, w, h);
        c.fillStyle = '#ffffff';
        c.font = font(34, true);
        c.textAlign = 'center';
        c.fillText('소화전', w / 2, 44);
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), new THREE.MeshBasicMaterial({ map: t.tex, transparent: true }));
      m.position.set(ex - 0.085, this.baseY + 1.5, z);
      m.rotation.y = -Math.PI / 2;
      this.root.add(m);
      this.box(0.03, 0.12, 0.04, 0xadb5bd, ex - 0.095, 1.05, z + 0.3).material = paint(0xadb5bd, 0.3, 0.8);
      this.colliders.push({ ...aabb(ex - 0.02, z, 0.14, 0.75), level: 0 });
    }
    this.extinguisher(10.78, 9.0, -1);
    this.extinguisher(7.42, -6.4, 1);
    // 나무 벤치 + 위 게시판 (동쪽 벽, 교무실 맞은편)
    {
      const z = -1.4, len = 1.8, D = 0.4, x = ex - D / 2 - 0.02;
      const seat = pbr('oak', { color: 0xd9bf98, roughness: 0.55 }), leg = paint(0x6c737a, 0.45, 0.5);
      for (let i = 0; i < 3; i++) this.box(D / 3 - 0.012, 0.035, len, 0xd9bf98, x - D / 2 + (i + 0.5) * (D / 3), 0.42, z).material = seat;
      for (const s2 of [-1, 1]) this.box(D - 0.04, 0.42, 0.05, 0x6c737a, x, 0, z + s2 * (len / 2 - 0.12)).material = leg;
      this.colliders.push({ ...aabb(x, z, D, len), level: 0 });
      const bb = new CanvasTex(512, 256);
      bb.draw((c, w, h) => {
        c.fillStyle = '#c69c6d';
        c.fillRect(0, 0, w, h);
        const notes: [string, string, string][] = [['#ffffff', '교직원 연수', '수요일 15:00 시청각실'], ['#fff3bf', '학부모 상담 주간', '다음 주 월~금'], ['#e7f5ff', '분리배출 안내', '종이·플라스틱·캔']];
        notes.forEach(([bg, a2, b2], i) => {
          const nx = 16 + i * 166;
          c.fillStyle = 'rgba(0,0,0,0.18)';
          c.fillRect(nx + 3, 25, 152, 200);
          c.fillStyle = bg;
          c.fillRect(nx, 22, 152, 200);
          c.fillStyle = '#212529';
          c.textAlign = 'center';
          c.font = font(21, true);
          c.fillText(a2, nx + 76, 62);
          c.font = font(16);
          c.fillText(b2, nx + 76, 92);
          c.fillStyle = 'rgba(73,80,87,0.35)';
          for (let k = 0; k < 5; k++) c.fillRect(nx + 14, 120 + k * 16, 124, 5);
        });
      });
      this.box(0.03, 0.9, 1.8, 0xe6e9ec, ex - 0.015, 1.15, z).material = paint(0xe6e9ec, 0.32, 0.55);
      this.plane(1.74, 0.84, bb.material(), ex - 0.032, 1.6, z, -Math.PI / 2);
    }
    // 낮은 수납장 (회색 철제 두 칸 문) + 교직원 우편함 (벽걸이 칸)
    {
      const z = 1.6, x = ex - 0.23;
      this.box(0.45, 0.9, 1.6, 0xd5d9dd, x, 0, z, { collide: true }).material = paint(0xd5d9dd, 0.45, 0.35);
      for (const dz of [-0.4, 0.4]) {
        this.box(0.012, 0.8, 0.78, 0xe3e6e9, x - 0.226, 0.05, z + dz).material = paint(0xe3e6e9, 0.4, 0.3);
        this.box(0.02, 0.12, 0.025, 0x868e96, x - 0.24, 0.6, z + dz - Math.sign(dz) * 0.32).material = paint(0x868e96, 0.3, 0.7);
      }
      // 우편함: 4 × 6 칸 나무 칸 + 이름표
      const mz = z, my = 1.2;
      this.box(0.25, 0.7, 1.3, 0xc7a27a, ex - 0.125, my, mz).material = pbr('oak', { color: 0xd9bf98, roughness: 0.6 });
      const mt = new CanvasTex(384, 208);
      mt.draw((c, w, h) => {
        c.fillStyle = '#b08a62';
        c.fillRect(0, 0, w, h);
        for (let r = 0; r < 4; r++)
          for (let k = 0; k < 6; k++) {
            const cx = 6 + k * 63, cy = 6 + r * 50;
            c.fillStyle = '#3b2f25';
            c.fillRect(cx, cy, 57, 44);
            c.fillStyle = '#f1f3f5';
            c.fillRect(cx + 4, cy + 30, 49, 11);
            if ((r * 6 + k) % 3 === 0) {
              c.fillStyle = '#ffffff';
              c.fillRect(cx + 8, cy + 4, 40, 22);
            }
          }
      });
      this.plane(1.26, 0.66, mt.material(), ex - 0.252, my + 0.35, mz, -Math.PI / 2);
      const lab = new CanvasTex(256, 48);
      lab.draw((c, w, h) => {
        c.fillStyle = '#2c4a6b';
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#fff';
        c.font = font(28, true);
        c.textAlign = 'center';
        c.fillText('교직원 우편함', w / 2, 34);
      });
      this.plane(0.6, 0.11, lab.material(), ex - 0.252, my + 0.79, mz, -Math.PI / 2);
    }
    // 피난 안내도 (현관 맞은편 계단 옆 벽) · 복도 우측 통행 표지
    this.evacMap(7.215, 1.55, -7.25, Math.PI / 2, 1);
    const kr = new CanvasTex(256, 96);
    kr.draw((c, w, h) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#1c7ed6';
      c.lineWidth = 6;
      c.strokeRect(3, 3, w - 6, h - 6);
      c.fillStyle = '#1c7ed6';
      c.font = font(30, true);
      c.textAlign = 'center';
      c.fillText('복도에서는', w / 2, 40);
      c.fillText('천천히 우측 통행', w / 2, 76);
    });
    this.plane(0.6, 0.225, kr.material(), ex - 0.012, 1.7, 11.0, -Math.PI / 2);
  }

  /** 3층 가는 방화문 (2층 계단실 남쪽 절반 입구): 회색 철문 두 짝, 손잡이, 그물 유리창, 도어클로저, 안내판. 늘 닫혀 있다 */
  private fireDoor() {
    const S = STAIR, w = S.zS1 - S.zS0, zc = (S.zS0 + S.zS1) / 2;
    const g = new THREE.Group();
    g.position.set(7.1, this.baseY, zc);
    this.root.add(g);
    const steel = paint(0xa7aea9, 0.45, 0.45), frame = paint(0x6c757d, 0.4, 0.6), dark = paint(0x2b2f33, 0.4, 0.5);
    const part = (sx: number, sy: number, sz: number, m: THREE.Material, x: number, y: number, z: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
      b.position.set(x, y, z);
      b.castShadow = b.receiveShadow = true;
      g.add(b);
      return b;
    };
    part(0.24, 0.08, w, frame, 0, 2.14, 0);
    for (const s of [-1, 1]) part(0.24, 2.18, 0.07, frame, 0, 1.09, s * (w / 2 - 0.035));
    const lw = (w - 0.14) / 2;
    // 그물 유리 (철망 무늬)
    const wire = new CanvasTex(64, 64);
    wire.draw((c, cw, ch) => {
      c.fillStyle = '#b9c7cf';
      c.fillRect(0, 0, cw, ch);
      c.strokeStyle = 'rgba(70,80,88,0.7)';
      c.lineWidth = 1.5;
      for (let i = 0; i <= cw; i += 8) {
        c.beginPath(); c.moveTo(i, 0); c.lineTo(i, ch); c.stroke();
        c.beginPath(); c.moveTo(0, i); c.lineTo(cw, i); c.stroke();
      }
    });
    wire.tex.wrapS = wire.tex.wrapT = THREE.RepeatWrapping;
    wire.tex.repeat.set(2, 4);
    const wireM = new THREE.MeshStandardMaterial({ map: wire.tex, roughness: 0.15, metalness: 0.1 });
    for (const s of [-1, 1]) {
      const zc2 = s * (lw / 2 + 0.005);
      const leaf = part(0.06, 2.06, lw - 0.01, steel, 0, 1.05, zc2);
      this.cameraBlockers.push(leaf);
      // 세로로 긴 그물 유리창 (양면)
      for (const sx of [-1, 1]) {
        const gp = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.6), wireM);
        gp.position.set(sx * 0.031, 1.45, zc2 - s * 0.12);
        gp.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
        g.add(gp);
        for (const dy of [-0.32, 0.32]) part(0.008, 0.03, 0.24, frame, sx * 0.031, 1.45 + dy, zc2 - s * 0.12);
        for (const dz2 of [-0.11, 0.11]) part(0.008, 0.66, 0.025, frame, sx * 0.031, 1.45, zc2 - s * 0.12 + dz2);
      }
      // 패닉바 (가로 누름 손잡이, 복도 쪽) + 받침
      part(0.04, 0.05, lw - 0.25, paint(0xd9dde0, 0.25, 0.85), 0.07, 1.0, zc2);
      for (const e of [-1, 1]) part(0.06, 0.08, 0.04, dark, 0.05, 1.0, zc2 + e * (lw / 2 - 0.14));
      // 도어클로저 + 팔
      part(0.07, 0.06, 0.3, dark, 0.06, 1.98, zc2);
      part(0.03, 0.02, 0.28, dark, 0.09, 1.95, zc2 - s * 0.14);
    }
    // 위 비상구 유도등 (초록 피난구 표시)
    const ex = new CanvasTex(128, 64);
    ex.draw((c, cw, ch) => {
      c.fillStyle = '#1f9d55';
      c.fillRect(0, 0, cw, ch);
      c.fillStyle = '#ffffff';
      c.fillRect(cw - 38, 10, 26, 44);
      c.fillStyle = '#1f9d55';
      c.fillRect(cw - 34, 14, 18, 40);
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(42, 16, 7, 0, Math.PI * 2); c.fill();
      c.fillRect(34, 24, 14, 18);
      c.fillRect(30, 40, 6, 16); c.fillRect(46, 40, 6, 14);
      c.fillRect(48, 26, 22, 5);
    });
    const exit = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.34), paint(0xf1f3f5, 0.5));
    exit.position.set(0.13, 2.32, w / 2 - 0.35);
    g.add(exit);
    const exf = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.14), new THREE.MeshBasicMaterial({ map: ex.tex, toneMapped: false }));
    exf.position.set(0.161, 2.32, w / 2 - 0.35);
    exf.rotation.y = Math.PI / 2;
    g.add(exf);
    part(0.07, 2.06, 0.012, dark, 0, 1.05, 0); // 두 짝 사이 틈
    // 문 위 벽 + 안내판
    this.box(0.2, WALL_H - 2.18, w, C.wall, 7.1, 2.18, zc, { wall: true, shadow: false });
    const t = new CanvasTex(256, 128);
    t.draw((c, cw, ch) => {
      c.fillStyle = '#c92a2a';
      c.fillRect(0, 0, cw, 44);
      c.fillStyle = '#fff';
      c.fillRect(0, 44, cw, ch - 44);
      c.fillStyle = '#fff';
      c.font = font(30, true);
      c.textAlign = 'center';
      c.fillText('방 화 문', cw / 2, 32);
      c.fillStyle = '#212529';
      c.font = font(19, true);
      c.fillText('항상 닫혀 있어야 합니다', cw / 2, 76);
      c.font = font(17);
      c.fillText('3층 ▲ (지금은 갈 수 없어요)', cw / 2, 108);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), t.material());
    sign.position.set(0.105, 2.55, 0); // 문 위 벽
    sign.rotation.y = Math.PI / 2;
    g.add(sign);
    this.colliders.push({ ...aabb(7.1, zc, 0.24, w), level: 1 });
    mergeLocal(g, isPbrMaterial, this.cameraBlockers);
    this.objs.fireDoor = g;
  }

  /**
   * 다른 방의 복도 쪽 벽 창문 (6-1과 같은 나무틀 미닫이창, 유리는 불투명).
   * 지금 층 서쪽 벽(x 7.1)의 복도 쪽 면에 붙인다. doors = 문 가운데 z (문 자리는 비운다)
   */
  private frostedRoomFace(z0: number, z1: number, doors: number[], avoid: number[] = []) {
    // 다른 방 복도 쪽 창: 나무틀 미닫이 + 맑은 유리 + 안쪽에 내려 둔 블라인드 (방 안은 보이지 않는다).
    // 문 자리(DOOR_GAP)와 복도 기둥(avoid) 옆은 비우고, 남는 구간이 짧으면 창을 넣지 않는다.
    const oak = pbr('oak', { roughness: 0.6 });
    const sill = 1.05, top = 2.15, h = top - sill, fx = 7.21;
    const busy = [...doors.map((d) => [d - DOOR_GAP / 2 - 0.3, d + DOOR_GAP / 2 + 0.3] as [number, number]), ...avoid.map((a) => [a - 0.45, a + 0.45] as [number, number])].sort((p, q) => p[0] - q[0]);
    const free: [number, number][] = [];
    let z = z0 + 0.3;
    const end = z1 - 0.3;
    for (const [a, b] of busy) {
      if (b <= z) continue;
      if (a >= end) break; // 이 구간 밖 (다음 방)
      if (a - z > 1.4) free.push([z, a]);
      z = Math.max(z, b);
    }
    if (end - z > 1.4) free.push([z, end]);
    const blind = this.blindMaterial();
    let k = 0;
    for (const [a, b] of free) {
      const len = b - a, n = Math.ceil(len / 2.6), gap = 0.3, ww = (len - gap * (n - 1)) / n;
      for (let i = 0; i < n; i++, k++) {
        const za = a + i * (ww + gap), zc = za + ww / 2;
        // 바깥 틀 + 창턱
        this.box(0.06, 0.06, ww + 0.1, 0x9c6644, fx + 0.01, sill - 0.06, zc, { shadow: false }).material = oak;
        this.box(0.06, 0.06, ww + 0.1, 0x9c6644, fx + 0.01, top, zc, { shadow: false }).material = oak;
        for (const e of [-1, 1]) this.box(0.06, h, 0.06, 0x9c6644, fx + 0.01, sill, zc + e * (ww / 2 + 0.02), { shadow: false }).material = oak;
        this.box(0.12, 0.025, ww + 0.14, 0x9c6644, fx + 0.04, sill - 0.085, zc, { shadow: false }).material = oak;
        // 블라인드 (창마다 내려온 길이가 조금씩 다름: 맨 위에 짙은 틈이 살짝)
        const drop = [1, 0.93, 0.97, 0.88][k % 4];
        const bh = (h - 0.06) * drop;
        const bl = this.plane(ww - 0.04, bh, blind, fx + 0.002, top - 0.03 - bh / 2, zc, Math.PI / 2);
        bl.receiveShadow = true;
        if (drop < 1) this.plane(ww - 0.04, h - 0.06 - bh, paint(0x3a3f44, 0.9), fx + 0.001, sill + 0.03 + (h - 0.06 - bh) / 2 + bh, zc, Math.PI / 2);
        this.box(0.05, 0.05, ww - 0.04, 0xe9ecef, fx + 0.02, top - 0.08, zc, { shadow: false }).material = paint(0xe9ecef, 0.5); // 블라인드 머리
        // 미닫이 두 장 (가운데 살) + 맑은 유리 (살짝 반사)
        this.box(0.05, h, 0.05, 0x9c6644, fx + 0.03, sill, zc, { shadow: false }).material = oak;
        for (const sgn of [-1, 1]) {
          const pz = zc + (sgn * ww) / 4;
          const gl = this.plane(ww / 2 - 0.08, h - 0.08, this.clearGlass(), fx + 0.035, sill + h / 2, pz, Math.PI / 2);
          gl.renderOrder = 2;
          this.box(0.02, 0.1, 0.02, 0xc9ced3, fx + 0.05, sill + h * 0.45, pz + sgn * (ww / 4 - 0.07), { shadow: false }).material = paint(0xc9ced3, 0.3, 0.8);
        }
      }
    }
  }

  private blindMat?: THREE.Material;
  /** 가로 블라인드 (밝은 베이지 살 + 살 사이 옅은 그늘 + 세로 끈) */
  private blindMaterial() {
    if (this.blindMat) return this.blindMat;
    const t = new CanvasTex(64, 256);
    t.draw((c, w, h) => {
      for (let y = 0; y < h; y += 8) {
        const g = c.createLinearGradient(0, y, 0, y + 8);
        g.addColorStop(0, '#f3efe6');
        g.addColorStop(0.7, '#e3ddd0');
        g.addColorStop(1, '#b9b2a4');
        c.fillStyle = g;
        c.fillRect(0, y, w, 8);
      }
      c.fillStyle = 'rgba(120,112,98,0.55)';
      c.fillRect(w * 0.25, 0, 1.5, h);
      c.fillRect(w * 0.75, 0, 1.5, h);
    });
    t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping;
    t.tex.repeat.set(2, 3.5);
    const m = new THREE.MeshStandardMaterial({ map: t.tex, roughness: 0.85 });
    m.userData.pbr = true;
    return (this.blindMat = m);
  }

  private glassMat?: THREE.Material;
  /** 맑은 창유리 (복도 쪽 실내창): 거의 투명 + 약한 반사 */
  private clearGlass() {
    if (this.glassMat) return this.glassMat;
    const m = new THREE.MeshStandardMaterial({ color: 0xdfeaf0, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, envMapIntensity: 1.6, depthWrite: false });
    m.userData.pbr = true;
    return (this.glassMat = m);
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
    for (const [z0, z1] of [[-5.4, 2.5], [6.5, 16.1]] as [number, number][]) {
      const zc = (z0 + z1) / 2, len = z1 - z0;
      const roof = this.box(3.8, 0.3, len, 0x9a9b96, 13.1, -0.32, zc, { shadow: false });
      roof.material = pbr('terrazzo', { color: 0x9c9d98, roughness: 0.95 });
      worldUV(roof.geometry, 3.8, 0.3, len, 3);
      this.box(0.25, 0.9, len, C.wall, 14.95, -0.02, zc, { shadow: false });
    }

    // 우리 반 앞쪽 칠판 아래 수납장 충돌 상자 (모습은 ClassroomHQ)
    this.colliders.push({ ...aabb(0, ROOM.z0 + 0.21, 7.4, 0.42), level: 1 });
    // 복도: 소화기(받침대), 층 표지, 피난 안내도, 창 아래 낮은 책장
    this.extinguisher(7.42, 1.2, 1, false); // 6-1 복도 창 앞: 표지는 붙이지 않음
    this.extinguisher(10.78, -7.3, -1);
    this.windowShelf(10.78, -3.0, 2.0);
    this.windowShelf(10.78, 10.6, 2.4);
  }

  /**
   * 1층 (y = FLOOR1_Y): 중앙 복도, 넓은 현관(실내화 신발장), 계단, 교무실·보건실(들어갈 수 있음),
   * 1~3학년 교실·과학실·화장실(닫힌 문), 북쪽 끝 급식실 동(CafeteriaWing). 벽은 한 층 전체 높이.
   */
  private buildFirstFloor() {
    this.baseY = FLOOR1_Y;
    this.curLevel = 0;
    const S = STAIR;
    // ── 서쪽(운동장 쪽) 벽: 방만 (1층은 교무실 층 — 다른 학년 교실 없음). 열린 곳 = 계단 1단 입구, 보건실·교무실 문 ──
    const westDoors = [-13.6, NURSE.doorZ, OFFICE.doorZ, 6.6, 9.6, 15.0]; // 교장실·보건실·교무실·행정실·학생자치실·Wee클래스
    const westOpen = ([[S.zS0, S.zS1] as [number, number], ...westDoors.map((d) => [d - DOOR_GAP / 2, d + DOOR_GAP / 2] as [number, number])]).sort((a, b) => a[0] - b[0]);
    let z = -16.1;
    for (const [a, b] of westOpen) {
      this.wallX(7.1, z, a);
      this.box(0.2, STOREY - 2.2, b - a, C.wall, 7.1, 2.2, (a + b) / 2, { wall: true, shadow: false }); // 문·계단 입구 위
      z = b;
    }
    this.wallX(7.1, z, 16.1);
    // 교무실·보건실: 다른 방처럼 닫힌 문 (안은 보여 주지 않는다)
    this.door('doorOffice', '교무실', 7.23, OFFICE.doorZ, Math.PI / 2);
    this.door('doorNurse', '보건실', 7.23, NURSE.doorZ, Math.PI / 2);
    this.door('doorPrincipal', '교장실', 7.23, -13.6, Math.PI / 2, 0x8d6e63, '#6d4c41');
    this.door('doorAdmin', '행정실', 7.23, 6.6, Math.PI / 2, 0xc7a27a);
    this.door('doorCouncil', '학생자치실', 7.23, 9.6, Math.PI / 2, 0x90be6d);
    this.door('doorWee', 'Wee클래스', 7.23, 15.0, Math.PI / 2, 0xf4a261);
    // 방 쪽 벽 창문 (불투명 유리)
    const arches1 = [-2.9, 8.2];
    this.frostedRoomFace(-16.0, S.zS0 - 0.15, [-13.6], arches1);
    this.frostedRoomFace(NURSE.z0, NURSE.z1, [NURSE.doorZ], arches1);
    this.frostedRoomFace(OFFICE.z0, OFFICE.z1, [OFFICE.doorZ], arches1);
    this.frostedRoomFace(OFFICE.z1 + 0.2, 16.0, [6.6, 9.6, 15.0], arches1);
    // 계단 입구 안내 (2단 밑 벽)
    this.sign('2층 ▲', 7.215, 2.35, (S.zN0 + S.zN1) / 2, Math.PI / 2);
    this.safetyFixtures1F();
    // ── 동쪽(현관 쪽) 벽: 화장실·엘리베이터 | 현관 | 화장실 ──
    this.doorWallX(11.1, -16.1, LOBBY.z0, [-14.75]);
    this.doorWallX(11.1, LOBBY.z1, 16.1, [-4.4, 4.6, 13.5]);
    this.box(0.2, STOREY - WALL_H, LOBBY.z1 - LOBBY.z0, C.wall, 11.1, WALL_H, (LOBBY.z0 + LOBBY.z1) / 2, { wall: true, shadow: false }); // 현관 입구 위 보
    this.wallZ(-16.1, 7.0, 11.2);
    this.door('doorRestroomM', '남자 화장실', 10.97, -14.75, -Math.PI / 2, 0x7fa7c9, '#1d3557');
    this.elevatorDoor(-6.6, 1);
    this.door('doorRestroomF', '여자 화장실', 10.97, -4.4, -Math.PI / 2, 0xe8a0a8, '#c9184a');
    this.door('doorStaffWC', '교직원 화장실', 10.97, 4.6, -Math.PI / 2, 0xc7a27a);
    this.door('doorRestroom', '화장실', 10.97, 13.5, -Math.PI / 2);
    this.sign('급식실 ▲', 9, 2.55, 15.9, Math.PI, '#e76f51');
    // 동쪽 바깥벽 (화장실·엘리베이터 칸)
    this.wallX(14.9, LOBBY.z1, 16.1);
    this.wallX(14.9, -16.1, LOBBY.z0);
    // 현관 (x 11.1~18.0): 남·북 벽, 동쪽 유리 출입문 벽
    this.wallZ(LOBBY.z0, 11.1, LOBBY.x1 + 0.1);
    this.wallZ(LOBBY.z1, 11.1, LOBBY.x1 + 0.1);
    // 정문 유리 출입문 벽: 충돌만 여기서 (모습은 EntranceBuilder — 벽돌 기둥·알루미늄 틀·열린 유리문)
    for (const [a, b] of [[LOBBY.z0, LOBBY.doorZ0], [LOBBY.doorZ1, LOBBY.z1]]) this.colliders.push({ ...aabb(LOBBY.x1, (a + b) / 2, 0.2, b - a), level: 0 });
    // 현관 확장부 지붕 (2층 바닥 높이). 현관 안쪽(x 11.1~14.9) 위는 2층 화장실·엘리베이터 칸
    this.box(LOBBY.x1 - 14.9 + 0.3, 0.3, LOBBY.z1 - LOBBY.z0 + 0.4, 0x9c9d98, (14.9 + LOBBY.x1) / 2 + 0.15, STOREY - 0.3, (LOBBY.z0 + LOBBY.z1) / 2, { shadow: false });
    // 바깥 마당(현관 앞): 화단 경계석으로 둘러쌈 (모습은 EntranceBuilder). 현관 동 옆 구석까지 막는다
    // (현관과 함께 ENTRANCE_DZ만큼 옮김) 동쪽 끝은 교문 길(GATE_Z ± 1.9)만 열려 있다
    const yx0 = 14.9, yx1 = 24.6, ycx = (yx0 + yx1) / 2, ylen = yx1 - yx0, dz = ENTRANCE_DZ;
    const g0 = GATE_Z - 1.9, g1 = GATE_Z + 1.9, yz0 = -7.4 + dz, yz1 = 4.4 + dz;
    this.colliders.push(
      { ...aabb(ycx, -7.2 + dz, ylen, 0.4), level: 0 },
      { ...aabb(ycx, 4.2 + dz, ylen, 0.4), level: 0 },
      { ...aabb(yx1, (yz0 + g0) / 2, 0.4, g0 - yz0), level: 0 },
      { ...aabb(yx1, (g1 + yz1) / 2, 0.4, yz1 - g1), level: 0 },
    );
    this.baseY = 0;
    this.curLevel = 1;
  }

  /**
   * 등굣길: 교문(학교 이름 기둥) → 보도 → 어린이 보호구역 찻길 + 횡단보도(신호등) → 건너편 보도.
   * 걸을 수 있는 곳은 교문 길(GATE_Z ± 1.9)을 따라 x 24.6 ~ 36.3 (찻길은 횡단보도로만 건넌다)
   */
  private buildStreet() {
    const Y = FLOOR1_Y, gz = GATE_Z;
    const flat = (w: number, d: number, m: THREE.Material, x: number, z: number, y: number) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
      p.rotation.x = -Math.PI / 2;
      p.position.set(x, Y + y, z);
      p.receiveShadow = true;
      this.root.add(p);
      return p;
    };
    const solid = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, Y + y + h / 2, z);
      b.castShadow = b.receiveShadow = true;
      this.root.add(b);
      return b;
    };
    // 교문: 화강석 기둥 둘 + 학교 이름 판 + 옆으로 밀어 둔 철문 + 바닥 레일
    const stone = paint(0xb9b4aa, 0.8), dark = paint(0x3d4146, 0.5, 0.5);
    for (const s of [-1, 1]) {
      solid(0.7, 1.7, 0.7, stone, 25.3, 0, gz + s * 2.25);
      solid(0.8, 0.1, 0.8, paint(0x8d8a83, 0.7), 25.3, 1.7, gz + s * 2.25);
    }
    const plate = new CanvasTex(512, 128);
    plate.draw((c, w, h) => {
      c.fillStyle = '#2f3a2f';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#f8f3e6';
      c.font = font(64, true);
      c.textAlign = 'center';
      c.fillText(SCHOOL_NAME, w / 2, 86);
    });
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.16), plate.material());
    pm.position.set(25.66, Y + 1.35, gz + 2.25);
    pm.rotation.y = Math.PI / 2;
    this.root.add(pm);
    for (let i = 0; i < 9; i++) solid(0.03, 1.2, 0.03, dark, 25.0, 0.05, gz + 2.65 + i * 0.12); // 밀어 둔 철문 살
    solid(0.05, 0.05, 1.05, dark, 25.0, 1.2, gz + 3.12);
    solid(0.04, 0.02, 4.4, paint(0x8a9096, 0.4, 0.6), 25.0, 0.01, gz); // 바닥 레일
    this.colliders.push({ ...aabb(25.3, gz - 2.25, 0.7, 0.7), level: 0 }, { ...aabb(25.3, gz + 2.25, 0.7, 0.7), level: 0 });
    // 보도 (학교 쪽 x 25.6~27.7, 건너편 x 33.7~36.6): 보도블록, 찻길 쪽 연석
    const paver = new THREE.MeshStandardMaterial({ color: 0xc9b59a, roughness: 0.9 });
    flat(2.1, 140, paver, 26.65, gz, 0.012);
    flat(3.5, 140, paver, 35.45, gz, 0.012);
    const curb = paint(0xa7a59f, 0.8);
    for (const [x0, x1] of [[27.6, 27.75], [33.6, 33.75]]) {
      solid(x1 - x0, 0.14, 66, curb, (x0 + x1) / 2, 0, gz - 35.2);
      solid(x1 - x0, 0.14, 66, curb, (x0 + x1) / 2, 0, gz + 35.2);
    }
    // 찻길: 아스팔트 + 어린이 보호구역(빨간 바닥) + 노란 중앙선 + 흰 정지선 + 횡단보도
    flat(5.9, 140, new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.95 }), 30.7, gz, 0.015);
    flat(5.9, 20, new THREE.MeshStandardMaterial({ color: 0xa8483d, roughness: 0.9 }), 30.7, gz, 0.018);
    const white = new THREE.MeshBasicMaterial({ color: 0xf2f2ee }), yellow = new THREE.MeshBasicMaterial({ color: 0xf2c230 });
    for (const dx of [-0.08, 0.08]) {
      flat(0.1, 22, yellow, 30.7 + dx, gz - 13.5, 0.021);
      flat(0.1, 22, yellow, 30.7 + dx, gz + 13.5, 0.021);
    }
    for (let i = 0; i < 6; i++) flat(0.45, 3.6, white, 28.1 + i * 0.95, gz, 0.022); // 횡단보도 줄
    flat(2.9, 0.3, white, 29.25, gz - 2.4, 0.022); // 정지선
    flat(2.9, 0.3, white, 32.15, gz + 2.4, 0.022);
    const zoneT = new CanvasTex(256, 128);
    zoneT.draw((c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = '#ffffff';
      c.font = font(44, true);
      c.textAlign = 'center';
      c.fillText('어린이', w / 2, 52);
      c.fillText('보호구역', w / 2, 108);
    });
    const zm = new THREE.MeshBasicMaterial({ map: zoneT.tex, transparent: true });
    for (const [x, z, r] of [[29.25, gz - 6, Math.PI / 2], [32.15, gz + 6, -Math.PI / 2]] as [number, number, number][]) {
      const p = flat(2.2, 1.1, zm, x, z, 0.023);
      p.rotation.z = r;
    }
    // 보행자 신호등 두 개: 회색 기둥 + 검은 함 (위 빨간 사람 꺼짐 / 아래 초록 사람 켜짐) + 차양
    const pole = paint(0x8a9096, 0.45, 0.55);
    const pedTex = (green: boolean) => {
      const t = new CanvasTex(64, 64);
      t.draw((c, w, h) => {
        c.fillStyle = '#111';
        c.fillRect(0, 0, w, h);
        c.fillStyle = green ? '#3cff7a' : '#5a1a1a';
        c.beginPath();
        c.arc(w / 2, 14, 6, 0, Math.PI * 2);
        c.fill();
        if (green) {
          // 걷는 사람
          c.fillRect(w / 2 - 5, 21, 10, 18);
          c.beginPath();
          c.moveTo(w / 2 - 4, 38); c.lineTo(w / 2 - 12, 56); c.lineTo(w / 2 - 6, 57); c.lineTo(w / 2 + 1, 41);
          c.moveTo(w / 2 + 2, 38); c.lineTo(w / 2 + 12, 55); c.lineTo(w / 2 + 6, 57); c.lineTo(w / 2 - 2, 41);
          c.fill();
        } else {
          c.fillRect(w / 2 - 6, 21, 12, 20);
          c.fillRect(w / 2 - 6, 40, 5, 17);
          c.fillRect(w / 2 + 1, 40, 5, 17);
        }
      });
      return green ? new THREE.MeshBasicMaterial({ map: t.tex, toneMapped: false }) : t.material();
    };
    const redM = pedTex(false), greenM = pedTex(true);
    for (const [x, z, face] of [[27.35, gz + 2.1, Math.PI / 2], [34.05, gz - 2.1, -Math.PI / 2]] as [number, number, number][]) {
      const pc = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.9, 12), pole);
      pc.position.set(x, Y + 1.45, z);
      pc.castShadow = true;
      this.root.add(pc);
      const head = new THREE.Group();
      head.position.set(x, Y + 2.25, z);
      head.rotation.y = face;
      this.root.add(head);
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.74, 0.22), paint(0x22252a, 0.55));
      housing.position.z = 0.15;
      housing.castShadow = true;
      head.add(housing);
      for (const [dy, m] of [[0.17, redM], [-0.17, greenM]] as [number, THREE.Material][]) {
        const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.3), m);
        lens.position.set(0, dy, 0.262);
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.12), paint(0x22252a, 0.55));
        visor.position.set(0, dy + 0.16, 0.32);
        head.add(lens, visor);
      }
      // 보행 버튼함 (기둥 허리)
      const btn = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.08), paint(0xf2c230, 0.5));
      btn.position.set(0, -1.15, 0.1);
      head.add(btn);
      this.colliders.push({ ...aabb(x, z, 0.2, 0.2), level: 0 });
    }
    // 어린이 보호구역 표지 (주의 표지 삼각형 + 아래 보조판) + 제한속도 30
    const caution = new CanvasTex(256, 256);
    caution.draw((c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = '#c92a2a';
      c.beginPath();
      c.moveTo(w / 2, 8); c.lineTo(w - 6, h - 26); c.lineTo(6, h - 26); c.closePath();
      c.fill();
      c.fillStyle = '#ffd43b';
      c.beginPath();
      c.moveTo(w / 2, 42); c.lineTo(w - 38, h - 44); c.lineTo(38, h - 44); c.closePath();
      c.fill();
      // 손잡고 걷는 두 아이 (실루엣)
      c.fillStyle = '#1b1b1b';
      for (const [cx, s2] of [[w / 2 - 22, 1], [w / 2 + 22, 0.85]] as [number, number][]) {
        c.beginPath();
        c.arc(cx, 112 + (1 - s2) * 30, 10 * s2, 0, Math.PI * 2);
        c.fill();
        c.fillRect(cx - 9 * s2, 126 + (1 - s2) * 26, 18 * s2, 36 * s2);
        c.fillRect(cx - 8 * s2, 160 + (1 - s2) * 20, 6 * s2, 30 * s2);
        c.fillRect(cx + 2 * s2, 160 + (1 - s2) * 20, 6 * s2, 30 * s2);
      }
      c.fillRect(w / 2 - 14, 138, 28, 5);
    });
    const plateT = new CanvasTex(256, 72);
    plateT.draw((c, w, h) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#212529';
      c.lineWidth = 4;
      c.strokeRect(3, 3, w - 6, h - 6);
      c.fillStyle = '#212529';
      c.font = font(36, true);
      c.textAlign = 'center';
      c.fillText('어린이보호구역', w / 2, 49);
    });
    const speedT = new CanvasTex(128, 128);
    speedT.draw((c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(w / 2, h / 2, 62, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#d62828';
      c.lineWidth = 13;
      c.beginPath();
      c.arc(w / 2, h / 2, 54, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = '#111';
      c.font = font(54, true);
      c.textAlign = 'center';
      c.fillText('30', w / 2, h / 2 + 19);
    });
    const signPost = (x: number, z: number, ry: number) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.9, 10), pole);
      p.position.set(x, Y + 1.45, z);
      this.root.add(p);
      const face = (w: number, h: number, m: THREE.Material, y: number) => {
        const s2 = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
        s2.position.set(x + Math.sin(ry) * 0.045, Y + y, z + Math.cos(ry) * 0.045);
        s2.rotation.y = ry;
        this.root.add(s2);
        const back = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.95, h * 0.95), paint(0x9aa0a6, 0.5, 0.5));
        back.position.set(x + Math.sin(ry) * 0.04, Y + y, z + Math.cos(ry) * 0.04);
        back.rotation.y = ry + Math.PI;
        this.root.add(back);
      };
      face(0.66, 0.66, new THREE.MeshStandardMaterial({ map: caution.tex, transparent: true, alphaTest: 0.5, roughness: 0.5 }), 2.5);
      face(0.66, 0.19, plateT.material(), 2.08);
      face(0.5, 0.5, new THREE.MeshStandardMaterial({ map: speedT.tex, transparent: true, alphaTest: 0.5, roughness: 0.5 }), 1.62);
    };
    signPost(35.95, gz + 2.3, -Math.PI / 2);
    signPost(27.2, gz - 5.5, Math.PI / 2);
    // 보행자 방호 울타리 (학교 쪽 보도, 횡단보도 밖): 노란 기둥 + 위·아래 가로대 + 세로 살 판
    const barT = new CanvasTex(128, 64);
    barT.draw((c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = '#e0b22c';
      for (let x = 4; x < w; x += 16) c.fillRect(x, 0, 5, h);
    });
    barT.tex.wrapS = THREE.RepeatWrapping;
    barT.tex.repeat.set(12.2 / 0.16 / 8, 1); // 울타리 판 넷이 같은 길이 → 재질 하나
    const fence = paint(0xe0b22c, 0.55, 0.3);
    const barM = new THREE.MeshStandardMaterial({ map: barT.tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.55 });
    for (const [fx, zc] of [[27.45, gz - 8.4], [27.45, gz + 8.4], [33.85, gz - 8.4], [33.85, gz + 8.4]] as [number, number][]) {
      const L2 = 12.2;
      solid(0.05, 0.05, L2, fence, fx, 0.95, zc);
      solid(0.04, 0.04, L2, fence, fx, 0.2, zc);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(L2, 0.73), barM);
      panel.position.set(fx, Y + 0.585, zc);
      panel.rotation.y = Math.PI / 2;
      this.root.add(panel);
      for (let i = 0; i <= 6; i++) solid(0.07, 1.02, 0.07, fence, fx, 0, zc - L2 / 2 + (i * L2) / 6);
    }
    // 볼라드 (횡단보도 양쪽 보도 끝): 회색 철제 + 노란 반사띠
    const bollM = paint(0x9aa0a6, 0.4, 0.6), refl = paint(0xf2c230, 0.35);
    for (const bx of [27.4, 33.95])
      for (const dz of [-1.5, -0.5, 0.5, 1.5]) {
        const bz = gz + dz;
        if ((bx < 30 && dz > 1) || (bx > 30 && dz < -1)) continue; // 신호등 자리
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.8, 14), bollM);
        b.position.set(bx, Y + 0.4, bz);
        b.castShadow = true;
        const r2 = new THREE.Mesh(new THREE.CylinderGeometry(0.073, 0.073, 0.07, 14), refl);
        r2.position.set(bx, Y + 0.66, bz);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), bollM);
        cap.position.set(bx, Y + 0.8, bz);
        this.root.add(b, r2, cap);
      }
    // 학교 담장 (교문 양옆): 화강석 낮은 담 + 짙은 회색 철제 울타리
    const barT2 = new CanvasTex(128, 64);
    barT2.draw((c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = '#3d4146';
      for (let x = 4; x < w; x += 16) c.fillRect(x, 0, 4, h);
    });
    barT2.tex.wrapS = THREE.RepeatWrapping;
    const wallFenceM = new THREE.MeshStandardMaterial({ map: barT2.tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5 });
    for (const s2 of [-1, 1]) {
      const za = gz + s2 * 2.65, zb = gz + s2 * 26, zc = (za + zb) / 2, L2 = Math.abs(zb - za);
      solid(0.32, 0.55, L2, stone, 25.3, 0, zc);
      solid(0.36, 0.06, L2, paint(0x8d8a83, 0.7), 25.3, 0.55, zc);
      barT2.tex.repeat.set(L2 / 0.12 / 8, 1); // 양쪽 담장이 같은 길이
      const fm = new THREE.Mesh(new THREE.PlaneGeometry(L2, 1.0), wallFenceM);
      fm.position.set(25.3, Y + 1.13, zc);
      fm.rotation.y = Math.PI / 2;
      this.root.add(fm);
      solid(0.05, 0.05, L2, dark, 25.3, 1.6, zc);
      solid(0.04, 0.04, L2, dark, 25.3, 0.68, zc);
      for (let z2 = Math.min(za, zb) + 0.02; z2 <= Math.max(za, zb); z2 += 2.4) solid(0.07, 1.1, 0.07, dark, 25.3, 0.58, z2);
    }
    this.noiseBarrier(37.25, gz, 120);
    // 걸을 수 있는 길 둘레 (교문 ~ 건너편 보도)
    const x0 = 24.6, x1 = 36.6, xc = (x0 + x1) / 2;
    this.colliders.push(
      { ...aabb(xc, gz - 2.05, x1 - x0, 0.3), level: 0 },
      { ...aabb(xc, gz + 2.05, x1 - x0, 0.3), level: 0 },
      { ...aabb(x1, gz, 0.3, 4.4), level: 0 },
    );
  }

  /**
   * 아파트 한 동 (배경): 앞뒤 = 베란다 줄(흰 난간·유리·커튼), 옆 = 색 띠 + 「10X동」 번호 + 작은 창,
   * 아래 1층 필로티(짙은 돌), 옥상 난간 + 엘리베이터 기계실 + 물탱크. 크기 8 × 층수·2.8 × 18 (앞면이 학교 쪽 -x)
   */
  private apartmentBlock(x: number, z: number, floors: number, accent: string, no: number, seed: number) {
    const FH = 2.8, W = 8, D = 18, H = floors * FH, Y = FLOOR1_Y + 3;
    let r = seed * 97 + 13;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    // 앞·뒤: 한 층 4세대 줄 (512 × 128 = 18m × 1층)
    const front = new CanvasTex(512, 128);
    front.draw((c, w, h) => {
      c.fillStyle = '#ece6da';
      c.fillRect(0, 0, w, h);
      const uw = w / 4;
      for (let u = 0; u < 4; u++) {
        const x0 = u * uw;
        // 유리 (위는 하늘 반사, 아래는 어둡게) + 커튼/블라인드 몇 집
        const g = c.createLinearGradient(0, 14, 0, 92);
        g.addColorStop(0, '#a9c7da');
        g.addColorStop(1, '#4a6174');
        c.fillStyle = g;
        c.fillRect(x0 + 8, 14, uw - 16, 78);
        const cur = rnd();
        if (cur < 0.55) {
          c.fillStyle = ['#f3ead6', '#e9e4ef', '#f6f1e7', '#e0d6c4'][Math.floor(rnd() * 4)];
          const cw = (uw - 16) * (0.3 + rnd() * 0.4);
          c.fillRect(x0 + 8 + (rnd() < 0.5 ? 0 : uw - 16 - cw), 18, cw, 74);
        }
        c.fillStyle = 'rgba(255,255,255,0.35)';
        c.fillRect(x0 + 8, 22, uw - 16, 3);
        // 창 가운데 살
        c.fillStyle = '#c9c4ba';
        c.fillRect(x0 + uw / 2 - 1.5, 18, 3, 74);
        // 베란다 난간 (흰 판 + 위 손잡이)
        c.fillStyle = '#f8f7f4';
        c.fillRect(x0 + 4, 70, uw - 8, 30);
        c.fillStyle = 'rgba(150,150,150,0.5)';
        c.fillRect(x0 + 4, 70, uw - 8, 2);
        // 에어컨 실외기 (가끔)
        if (rnd() < 0.3) {
          c.fillStyle = '#d7d9d6';
          c.fillRect(x0 + uw - 34, 78, 22, 16);
          c.fillStyle = '#9aa0a3';
          c.beginPath();
          c.arc(x0 + uw - 23, 86, 6, 0, Math.PI * 2);
          c.fill();
        }
        // 세대 사이 벽
        c.fillStyle = '#dcd5c8';
        c.fillRect(x0, 0, 5, h);
      }
      // 층 사이 슬래브 띠
      c.fillStyle = '#d4cdbf';
      c.fillRect(0, 100, w, 10);
      c.fillStyle = 'rgba(0,0,0,0.08)';
      c.fillRect(0, 110, w, 3);
    });
    front.tex.wrapS = front.tex.wrapT = THREE.RepeatWrapping;
    front.tex.repeat.set(1, floors);
    // 옆: 색 띠 + 동 번호 + 계단실 작은 창
    const side = new CanvasTex(256, 1024);
    side.draw((c, w, h) => {
      c.fillStyle = '#ece6da';
      c.fillRect(0, 0, w, h);
      c.fillStyle = accent;
      c.fillRect(0, 0, 46, h);
      c.fillRect(w - 46, 0, 46, h);
      c.fillStyle = 'rgba(255,255,255,0.25)';
      c.fillRect(46, 0, 6, h);
      c.fillRect(w - 52, 0, 6, h);
      c.fillStyle = '#7d8f9c';
      for (let k = 0; k < floors; k++) {
        const y = 150 + (k * (h - 170)) / floors;
        c.fillRect(w / 2 - 14, y, 28, 18);
      }
      c.fillStyle = '#5a6570';
      c.font = font(64, true);
      c.textAlign = 'center';
      c.fillText(`${no}동`, w / 2, 90);
    });
    const plain = new THREE.MeshLambertMaterial({ color: 0xd9d3c7 });
    const fm = new THREE.MeshLambertMaterial({ map: front.tex });
    const sm = new THREE.MeshLambertMaterial({ map: side.tex });
    // 박스 면 순서: +x, -x, +y, -y, +z, -z
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [fm, fm, plain, plain, sm, sm]);
    body.position.set(x, Y + H / 2, z);
    this.root.add(body);
    // 1층 필로티 (짙은 돌 + 기둥 사이 그늘)
    const base = new THREE.Mesh(new THREE.BoxGeometry(W - 0.6, 3, D - 0.6), new THREE.MeshLambertMaterial({ color: 0x5f5a54 }));
    base.position.set(x, FLOOR1_Y + 1.5, z);
    this.root.add(base);
    for (const dz of [-D / 2 + 0.4, -D / 4, 0, D / 4, D / 2 - 0.4]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 3, 0.6), new THREE.MeshLambertMaterial({ color: 0xb8afa2 }));
      col.position.set(x, FLOOR1_Y + 1.5, z + dz);
      this.root.add(col);
    }
    // 옥상: 난간 + 기계실 + 물탱크
    const roofM = new THREE.MeshLambertMaterial({ color: 0xcfc8bb });
    const top = Y + H;
    for (const [w2, d2, ox, oz] of [[W, 0.25, 0, -D / 2 + 0.125], [W, 0.25, 0, D / 2 - 0.125], [0.25, D, -W / 2 + 0.125, 0], [0.25, D, W / 2 - 0.125, 0]] as [number, number, number, number][]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w2, 1.0, d2), roofM);
      rim.position.set(x + ox, top + 0.5, z + oz);
      this.root.add(rim);
    }
    const house = new THREE.Mesh(new THREE.BoxGeometry(4, 3.2, 5), new THREE.MeshLambertMaterial({ color: 0xe2dccf }));
    house.position.set(x + 0.5, top + 1.6, z + (rnd() < 0.5 ? -3 : 3));
    const tank = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2, 2.6), new THREE.MeshLambertMaterial({ color: 0x8fb3c9 }));
    tank.position.set(x - 1.5, top + 1.0, z - house.position.z + z);
    this.root.add(house, tank);
  }

  /**
   * 건너편 보도 뒤 도로 방음벽 (등굣길 시작 자리 뒤가 허전하지 않게): 콘크리트 받침 + 회색 H형 기둥(2.5m 간격)
   * + 아래 불투명 골판 금속판 + 위 투명 아크릴판(가로 살) + 도로 쪽으로 휘어진 윗부분. x = 벽 가운데, 길이 len (z 방향)
   */
  private noiseBarrier(x: number, zc: number, len: number) {
    const Y = FLOOR1_Y;
    const conc = concreteMat();
    const base = new THREE.Mesh(worldUV(new THREE.BoxGeometry(0.45, 1.0, len), 0.45, 1.0, len, TILE_EXT.concrete), conc);
    base.position.set(x + 0.05, Y + 0.5, zc);
    base.receiveShadow = base.castShadow = true;
    this.root.add(base);
    // 받침 위 두겁 + 보도 쪽 배수 구멍 줄
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, len), paint(0xb4b3ad, 0.85));
    cap.position.set(x + 0.05, Y + 1.04, zc);
    this.root.add(cap);
    const holes: THREE.BufferGeometry[] = [];
    for (let z = zc - len / 2 + 1.25; z < zc + len / 2; z += 2.5) {
      const hg = new THREE.BoxGeometry(0.01, 0.08, 0.18);
      hg.translate(x - 0.175, Y + 0.12, z);
      holes.push(hg);
    }
    const hm = new THREE.Mesh(mergeGeometries(holes)!, paint(0x3a3d40, 0.9));
    this.root.add(hm);
    const H0 = 1.0, H1 = 2.4, H2 = 5.6; // 받침 위 ~ 불투명판 ~ 투명판 끝
    // 불투명 골판 (밝은 회색 + 세로 골 그늘 + 아래 파란 띠)
    const rib = new CanvasTex(256, 64);
    rib.draw((c, w, h) => {
      // 판 두 장(2.5m씩): 색이 아주 조금 다름 + 세로 골 + 이음 틀 + 아래 파란 띠 + 빗물 얼룩
      for (const [x0, base] of [[0, '#d9dcdc'], [w / 2, '#d2d6d7']] as [number, string][]) {
        c.fillStyle = base;
        c.fillRect(x0, 0, w / 2, h);
        for (let i = 4; i < w / 2; i += 8) {
          c.fillStyle = 'rgba(90,98,104,0.26)';
          c.fillRect(x0 + i, 0, 2, h);
          c.fillStyle = 'rgba(255,255,255,0.45)';
          c.fillRect(x0 + i + 3, 0, 1, h);
        }
        const g = c.createLinearGradient(0, h * 0.55, 0, h);
        g.addColorStop(0, 'rgba(110,105,95,0)');
        g.addColorStop(1, 'rgba(110,105,95,0.18)');
        c.fillStyle = g;
        c.fillRect(x0, 0, w / 2, h);
        c.fillStyle = '#7d8890';
        c.fillRect(x0, 0, 3, h); // 판 이음 틀
      }
      c.fillStyle = '#5b8fb9';
      c.fillRect(0, h - 9, w, 5);
      c.fillStyle = '#8a9399';
      c.fillRect(0, 0, w, 3);
    });
    rib.tex.wrapS = THREE.RepeatWrapping;
    rib.tex.repeat.set(len / 5, 1);
    const ribM = new THREE.MeshStandardMaterial({ map: rib.tex, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide });
    const op = new THREE.Mesh(new THREE.PlaneGeometry(len, H1 - H0), ribM);
    op.position.set(x, Y + (H0 + H1) / 2, zc);
    op.rotation.y = Math.PI / 2;
    op.receiveShadow = true;
    this.root.add(op);
    // 투명 아크릴 (하늘이 비치는 옅은 청록 + 가로 살)
    const acr = new CanvasTex(128, 256);
    acr.draw((c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = 'rgba(196,222,230,0.3)';
      c.fillRect(0, 0, w, h);
      // 조류 충돌 방지 점 (세로 점선, 10cm 간격)
      c.fillStyle = 'rgba(70,80,88,0.55)';
      for (let x = 6; x < w; x += 10) for (let y = 4; y < h; y += 7) c.fillRect(x, y, 2, 2);
      // 위쪽 하늘 반사 띠 + 아래 먼지
      c.fillStyle = 'rgba(255,255,255,0.28)';
      c.fillRect(0, 14, w, 3);
      c.fillRect(0, 22, w, 1);
      const g = c.createLinearGradient(0, h * 0.7, 0, h);
      g.addColorStop(0, 'rgba(120,115,100,0)');
      g.addColorStop(1, 'rgba(120,115,100,0.22)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      // 판 틀 (가로 살 + 판 양옆 세로 틀)
      c.fillStyle = 'rgba(110,123,132,0.95)';
      for (let y = 0; y < h; y += 64) c.fillRect(0, y, w, 4);
      c.fillRect(0, 0, 3, h);
    });
    acr.tex.wrapS = acr.tex.wrapT = THREE.RepeatWrapping;
    acr.tex.repeat.set(len / 2.5, 1);
    const acrM = new THREE.MeshStandardMaterial({ map: acr.tex, transparent: true, roughness: 0.08, metalness: 0.25, envMapIntensity: 1.5, side: THREE.DoubleSide, depthWrite: false });
    const tp = new THREE.Mesh(new THREE.PlaneGeometry(len, H2 - H1), acrM);
    tp.position.set(x, Y + (H1 + H2) / 2, zc);
    tp.rotation.y = Math.PI / 2;
    tp.renderOrder = 2;
    this.root.add(tp);
    // 도로 쪽으로 휘어진 윗부분 (세 조각으로 꺾어 곡선처럼)
    const arcR = 1.6;
    let px = x, py = H2;
    for (let i = 0; i < 3; i++) {
      const a0 = (i / 3) * (Math.PI / 3), a1 = ((i + 1) / 3) * (Math.PI / 3);
      const nx = x - arcR * (1 - Math.cos(a1)), ny = H2 + arcR * Math.sin(a1);
      const seg = Math.hypot(nx - px, ny - py);
      const pm = acrM.clone();
      pm.map = acr.tex.clone();
      pm.map.needsUpdate = true;
      pm.map.repeat.set(len / 2.5, (seg / (H2 - H1)) * 1.0);
      const piece = new THREE.Mesh(new THREE.PlaneGeometry(len, seg), pm);
      piece.position.set((px + nx) / 2, Y + (py + ny) / 2, zc);
      piece.rotation.order = 'YXZ';
      piece.rotation.set(-(a0 + a1) / 2, Math.PI / 2, 0);
      piece.renderOrder = 2;
      this.root.add(piece);
      px = nx;
      py = ny;
    }
    // 기둥 (2.5m 간격): 곧은 부분 + 휜 윗부분, 맨 위 가로 띠
    const postM = paint(0x6f7b84, 0.45, 0.5);
    const posts: THREE.BufferGeometry[] = [];
    for (let z = zc - len / 2; z <= zc + len / 2 + 0.01; z += 2.5) {
      // H형강: 가운데 판 + 앞뒤 날개
      const web = new THREE.BoxGeometry(0.16, H2 - H0, 0.03);
      web.translate(x + 0.1, Y + (H0 + H2) / 2, z);
      posts.push(web);
      for (const fx2 of [0.02, 0.18]) {
        const fl = new THREE.BoxGeometry(0.025, H2 - H0, 0.2);
        fl.translate(x + fx2, Y + (H0 + H2) / 2, z);
        posts.push(fl);
      }
      // 아래 고정판
      const pl = new THREE.BoxGeometry(0.3, 0.03, 0.3);
      pl.translate(x + 0.1, Y + H0 + 0.1, z);
      posts.push(pl);
      let qx = x + 0.1, qy = H2;
      for (let i = 0; i < 3; i++) {
        const a1 = ((i + 1) / 3) * (Math.PI / 3);
        const nx = x + 0.1 - arcR * (1 - Math.cos(a1)), ny = H2 + arcR * Math.sin(a1);
        const seg = Math.hypot(nx - qx, ny - qy);
        const g2 = new THREE.BoxGeometry(0.14, seg + 0.04, 0.18);
        g2.rotateZ(Math.atan2(qx - nx, ny - qy));
        g2.translate((qx + nx) / 2, Y + (qy + ny) / 2, z);
        posts.push(g2);
        qx = nx;
        qy = ny;
      }
    }
    for (const [yy, xx] of [[H1, x + 0.02], [H2, x + 0.02]] as [number, number][]) {
      const rail = new THREE.BoxGeometry(0.1, 0.12, len);
      rail.translate(xx, Y + yy, zc);
      posts.push(rail);
    }
    const pm2 = new THREE.Mesh(mergeGeometries(posts.map((g) => g.toNonIndexed()))!, postM);
    pm2.castShadow = pm2.receiveShadow = true;
    this.root.add(pm2);
  }

  /**
   * 3층 (밖에서만 보임): 2층 위에 복도·교실 폭(x -7.3~11.35)만큼 한 층 더. 동쪽 면에 창 줄, 위 두겁.
   * 안으로는 못 들어간다 (계단실 3층 쪽은 방화문)
   */
  private thirdFloorShell(
    facade: (w: number, x: number, z: number, ry: number, y0?: number, h?: number) => THREE.Mesh,
    part: (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => void,
    glass: THREE.Material,
    frameM: THREE.Material,
    stone: THREE.Material,
  ) {
    const y0 = WALL_H + 0.3, h = STOREY + 0.3, ex = 11.35;
    facade(32.4, ex, 0, Math.PI / 2, y0, h);
    facade(18.65, (ex - 7.3) / 2, -16.2, Math.PI, y0, h);
    facade(18.65, (ex - 7.3) / 2, 16.2, 0, y0, h);
    facade(32.4, -7.3, 0, -Math.PI / 2, y0, h);
    for (let i = 0; i < 10; i++) {
      const z = -14.5 + i * 3.2, W = 2.2, Hh = 1.5, y = STOREY + 1.05, cy = y + Hh / 2;
      const win = new THREE.Mesh(new THREE.PlaneGeometry(W, Hh), glass);
      win.position.set(ex + 0.015, cy, z);
      win.rotation.y = Math.PI / 2;
      this.root.add(win);
      part(0.07, 0.07, W + 0.07, frameM, ex + 0.04, y + Hh, z);
      part(0.07, 0.07, W + 0.07, frameM, ex + 0.04, y, z);
      part(0.07, Hh, 0.07, frameM, ex + 0.04, cy, z - W / 2);
      part(0.07, Hh, 0.07, frameM, ex + 0.04, cy, z + W / 2);
      part(0.06, Hh, 0.05, frameM, ex + 0.04, cy, z);
      part(0.16, 0.06, W + 0.24, stone, ex + 0.08, y - 0.03, z);
    }
    // 2층과 3층 사이 띠 + 지붕 두겁
    part(0.3, 0.3, 32.6, stone, ex + 0.05, y0 + 0.15, 0);
    part(0.3, 0.38, 32.6, stone, ex + 0.05, y0 + h + 0.19, 0);
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
    const brick = brickMat();
    const facade = (w: number, x: number, z: number, ry: number, y0 = FLOOR1_Y, h = H, mat: THREE.Material = stucco) => {
      const m = new THREE.Mesh(worldUV(new THREE.PlaneGeometry(w, h), w, h, 0, mat === brick ? TILE_EXT.brick : TILE_EXT.stucco), mat);
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
    // 동쪽 정면 (현관 쪽). 1층 현관 동(LOBBY z) 자리는 비운다 (현관 동 벽이 대신)
    const sW = LOBBY.z0 + 16.2, sC = (-16.2 + LOBBY.z0) / 2, nW = 16.2 - LOBBY.z1, nC = (LOBBY.z1 + 16.2) / 2;
    // 1층은 적갈색 벽돌, 2·3층은 밝은 뿜칠 (한국 학교에 흔한 벽돌 + 콘크리트 조합)
    facade(sW, 15.02, sC, Math.PI / 2, FLOOR1_Y, -FLOOR1_Y, brick);
    facade(nW, 15.02, nC, Math.PI / 2, FLOOR1_Y, -FLOOR1_Y, brick);
    // 2층: 화장실·엘리베이터 칸(z -16.2~-5.4, 현관 위 포함)과 방송실(2.5~6.5)만 벽, 나머지는 1층 지붕(옥상)
    facade(10.8, 15.02, -10.8, Math.PI / 2, 0, H + FLOOR1_Y);
    facade(4.0, 15.02, 4.5, Math.PI / 2, 0, H + FLOOR1_Y);
    plinth(sW, 15.06, sC);
    plinth(nW, 15.06, nC);
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
        if (row === 1 && ((z > -5.4 && z < 2.5) || z > 6.5)) continue; // 2층 복도 창문 쪽은 바깥(옥상)
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
    band(sW, -0.32, sC, 0.3);
    band(nW, -0.32, nC, 0.3);
    band(10.8, WALL_H, -10.8, 0.38);
    band(4.0, WALL_H, 4.5, 0.38);
    this.thirdFloorShell(facade, part, glass, frameM, stone);
    // 남쪽 강당 동, 북쪽 급식실 동 바깥 (현관 앞에서 보이는 면)
    const south = new THREE.Mesh(worldUV(new THREE.PlaneGeometry(2.4, H), 2.4, H, 0, TILE_EXT.stucco), stucco);
    south.position.set(16.2, FLOOR1_Y + H / 2, -16.05);
    this.root.add(south);
    const north = new THREE.Mesh(worldUV(new THREE.PlaneGeometry(0.3, H), 0.3, H, 0, TILE_EXT.stucco), stucco);
    north.position.set(15.0, FLOOR1_Y + H / 2, 16.2);
    this.root.add(north);
    facade(11.0, 15.12, 21.6, Math.PI / 2);
    // 창밖 풍경: 나무 줄 + 아파트 단지 (운동장 사진처럼)
    // 담장 안쪽 조경수 줄: 느티나무·소나무 섞어서 (교문 길은 비움)
    for (let i = 0; i < 14; i++) {
      const z = -26 + i * 4.1 + ((i * 37) % 7) * 0.2;
      const x = 23.6 + ((i * 53) % 5) * 0.35;
      if (Math.abs(z - GATE_Z) < 3.4) continue; // 교문 길은 비워 둔다 (등교 길·카메라)
      const t = makeTree(i % 3 === 1 ? 'pine' : 'zelkova', i + 3, 0.95 + ((i * 7) % 4) * 0.06);
      t.position.set(x, FLOOR1_Y, z);
      this.root.add(t);
    }
    // 길 건너 아파트 단지 (방음벽 너머로 보이는 배경)
    const blocks: [number, number, number, string, number][] = [
      [74, -46, 15, '#7a9cc6', 101], [86, -24, 18, '#c98f6b', 102], [74, -2, 13, '#7fb08a', 103], [86, 20, 20, '#7a9cc6', 104], [74, 42, 15, '#c98f6b', 105],
    ];
    blocks.forEach(([bx, bz, floors, accent, no], i) => this.apartmentBlock(bx, bz, floors, accent, no, i));
    // 멀리 보이는 산 (분위기)
    const hill = new THREE.Mesh(new THREE.SphereGeometry(30, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x8fa894 }));
    hill.scale.set(2.4, 0.3, 1.6);
    hill.position.set(120, FLOOR1_Y, 0);
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
    this.posterTex.draw((c, w, h) => drawKidPoster(c, w, h, { theme, slogan, bg, stickers, footer: '6-1 1모둠' }, 2));
    this.objs.groupPoster.visible = true;
    this.objs.bigMural.visible = false;
  }
}

