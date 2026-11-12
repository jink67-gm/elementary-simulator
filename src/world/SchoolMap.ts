// 학교 맵: 6학년 3반 교실 + 중앙 복도 + 급식실 입구.
// 책상·의자·가구는 Poly Haven(CC0) 모델을 쓰고, 모델을 못 불러오면 기본 도형으로 대신한다.
import * as THREE from 'three';
import { aabb, type Aabb } from './Collision';
import { CanvasTex, font, wrapText } from './canvasTex';
import { mergeStatic } from './merge';
import type { PosterTheme } from '../core/SaveData';
import { hasProp, placeInstances, placeOne, type Fit, type Placement } from './props';

export interface Seat {
  x: number;
  z: number;
  yaw: number;
  deskX: number;
  deskZ: number;
}

const WALL_H = 3;
/** 거대 돈가스 판 크기 (미터) */
export const CUTLET_W = 5.2;
export const CUTLET_D = 2.8;
export const CUTLET_H = 0.2;
const DESK_ROWS = [-3, -1.3, 0.4, 2.1];
const PAIR_X = [-4.2, 0, 4.2];

const C = {
  floorWood: 0xd9b382,
  floorHall: 0xd8d5cc,
  wall: 0xf4efe4,
  wallTrim: 0x9fc5a8,
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
  private crumbMat: THREE.MeshLambertMaterial | null = null;
  private machineScreen!: CanvasTex;
  broadcastDoor!: Aabb;

  /** 소품 모델 여러 개 놓기. 모델이 없으면 false */
  private props(id: string, places: Placement[], fit: Fit): boolean {
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
    this.setBoard(['6학년 3반', '오늘도 무사히!']);
    this.setClock(8 * 60 + 40);
    this.optimize();
  }

  /** 상호작용·애니메이션이 없는 상자들을 재질별로 합친다 (그리기 호출 수백 개 → 수십 개) */
  private optimize() {
    const keep = new Set<THREE.Object3D>();
    for (const [k, o] of Object.entries(this.objs)) if (!k.startsWith('desk_') || o === this.objs.playerDesk) keep.add(o);
    const cached = new Set<THREE.Material>(this.matCache.values());
    mergeStatic(this.root, keep, (m) => cached.has(m));
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
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), o.ownMat ? new THREE.MeshLambertMaterial({ color }) : this.mat(color));
    m.position.set(x, y + h / 2, z);
    m.receiveShadow = true;
    m.castShadow = o.shadow ?? !o.wall;
    (o.parent ?? this.root).add(m);
    if (o.collide) this.colliders.push(aabb(x, z, w, d));
    if (o.wall) this.cameraBlockers.push(m);
    return m;
  }

  private wallX(x: number, z0: number, z1: number) {
    this.box(0.2, WALL_H, z1 - z0, C.wall, x, 0, (z0 + z1) / 2, { collide: true, wall: true });
    this.box(0.22, 0.12, z1 - z0, C.wallTrim, x, 0, (z0 + z1) / 2, { wall: false, shadow: false });
  }
  private wallZ(z: number, x0: number, x1: number) {
    this.box(x1 - x0, WALL_H, 0.2, C.wall, (x0 + x1) / 2, 0, z, { collide: true, wall: true });
    this.box(x1 - x0, 0.12, 0.22, C.wallTrim, (x0 + x1) / 2, 0, z, { shadow: false });
  }

  private plane(w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    this.root.add(m);
    return m;
  }

  private buildClassroom() {
    // 바닥 (나무 판자 줄무늬)
    const floorTex = new CanvasTex(256, 256);
    floorTex.draw((c, w, h) => {
      c.fillStyle = '#d9b382';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i++) {
        c.fillStyle = i % 2 ? '#d2aa76' : '#dcb886';
        c.fillRect(0, i * 32, w, 30);
        c.fillStyle = '#c49a66';
        c.fillRect(((i * 97) % 256), i * 32, 2, 30);
      }
    });
    floorTex.tex.wrapS = floorTex.tex.wrapT = THREE.RepeatWrapping;
    floorTex.tex.repeat.set(5, 5);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 13), new THREE.MeshLambertMaterial({ map: floorTex.tex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 0.5);
    floor.receiveShadow = true;
    this.root.add(floor);

    // 벽: 앞(칠판) z=-6, 뒤(사물함) z=7, 창문 x=-7, 복도쪽 x=7 (앞문·뒷문)
    this.wallZ(-6.1, -7.2, 7.2);
    this.wallZ(7.1, -7.2, 7.2);
    this.wallX(-7.1, -6, 7);
    this.wallX(7.1, -6, -5.4);
    this.wallX(7.1, -3.8, 4.6);
    this.wallX(7.1, 6.2, 7);
    // 문 위 벽
    this.box(0.2, 0.8, 1.6, C.wall, 7.1, 2.2, -4.6);
    this.box(0.2, 0.8, 1.6, C.wall, 7.1, 2.2, 5.4);
    // 열려 있는 미닫이문
    this.box(0.06, 2.1, 1.5, 0xc7a27a, 7.25, 0, -6.0 + 0.0, { shadow: false });
    this.box(0.06, 2.1, 1.5, 0xc7a27a, 7.25, 0, 6.6, { shadow: false });

    // 창문 (서쪽 벽)
    const glass = new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.85 });
    for (const z of [-4, -1, 2, 5]) {
      this.plane(2.2, 1.4, glass, -6.99, 1.75, z, Math.PI / 2);
      this.box(0.05, 0.06, 2.3, 0xffffff, -6.97, 1.02, z, { shadow: false });
      this.box(0.05, 0.06, 2.3, 0xffffff, -6.97, 2.45, z, { shadow: false });
    }

    // 전자칠판 + 시계
    const boardFrame = this.box(3.8, 1.8, 0.08, 0x30343b, 0, 0.75, -5.96, { shadow: false });
    boardFrame.name = 'board';
    this.objs.board = boardFrame;
    this.plane(3.6, 1.575, this.boardTex.material(), 0, 1.65, -5.91);
    const clock = new THREE.Mesh(new THREE.CircleGeometry(0.24, 32), this.clockTex.material());
    clock.position.set(0, 2.75, -5.95);
    this.root.add(clock);
    this.objs.clock = clock;

    // 선생님 책상
    const tdesk = new THREE.Group();
    tdesk.position.set(-4.6, 0, -4.7);
    this.root.add(tdesk);
    if (!this.prop('metal_office_desk', tdesk, { w: 1.5, h: 0.78, d: 0.75 }, 0, 0, 0, Math.PI)) {
      this.box(1.5, 0.08, 0.75, 0xb98b5e, 0, 0.72, 0, { parent: tdesk });
      this.box(0.5, 0.72, 0.7, 0xa57a50, -0.45, 0, 0, { parent: tdesk });
    }
    const drawer = this.box(0.44, 0.18, 0.04, 0xd0a674, -0.45, 0.45, 0.37, { parent: tdesk, ownMat: true });
    this.objs.teacherDrawer = drawer;
    if (!this.prop('classic_laptop', tdesk, { w: 0.36 }, 0.3, 0.78, -0.05)) this.box(0.25, 0.3, 0.02, 0x222222, 0.3, 0.8, -0.2, { parent: tdesk }); // 모니터
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

    // 학생 책상 24개 (짝꿍 두 명씩)
    const deskTop = this.mat(C.desk);
    const modelDesks = hasProp('SchoolDesk_01') && hasProp('SchoolChair_01');
    const deskPlaces: Placement[] = [];
    for (const rz of DESK_ROWS) {
      for (const px of PAIR_X) {
        for (const side of [-1, 1]) {
          const sx = px + side * 0.38;
          const g = new THREE.Group();
          g.position.set(sx, 0, rz);
          this.root.add(g);
          if (modelDesks) {
            deskPlaces.push({ x: sx, z: rz });
          } else {
          const top = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.05, 0.48), deskTop);
          top.position.y = 0.62;
          top.castShadow = top.receiveShadow = true;
          g.add(top);
          for (const [lx, lz] of [[-0.3, -0.2], [0.3, -0.2], [-0.3, 0.2], [0.3, 0.2]]) this.box(0.04, 0.6, 0.04, C.deskLeg, lx, 0, lz, { parent: g });
          // 의자 (책상 뒤, 앞을 바라봄)
          this.box(0.4, 0.04, 0.38, C.chair, 0, 0.3, 0.45, { parent: g });
          this.box(0.4, 0.38, 0.04, C.chair, 0, 0.34, 0.64, { parent: g });
          for (const [lx, lz] of [[-0.17, 0.3], [0.17, 0.3], [-0.17, 0.6], [0.17, 0.6]]) this.box(0.03, 0.3, 0.03, C.deskLeg, lx, 0, lz, { parent: g });
          }
          const key = `${px}_${rz}_${side}`;
          this.seats[key] = { x: sx, z: rz + 0.45, yaw: Math.PI, deskX: sx, deskZ: rz };
          this.objs['desk_' + key] = g;
        }
        this.colliders.push(aabb(px, rz, 1.45, 0.5, 'desk'));
      }
    }
    if (modelDesks) {
      this.props('SchoolDesk_01', deskPlaces, { w: 0.68, h: 0.66, d: 0.48 });
      this.props('SchoolChair_01', deskPlaces.map((p) => ({ x: p.x, z: p.z + 0.5 })), { w: 0.4, h: 0.78, d: 0.42, backToPlusZ: true });
    }
    const S = (px: number, ri: number, side: number) => this.seats[`${px}_${DESK_ROWS[ri]}_${side}`];
    this.seats.player = S(0, 2, -1);
    this.seats.seoa = S(0, 2, 1);
    this.seats.minjae = S(0, 3, -1);
    this.seats.junho = S(4.2, 1, -1);
    this.seats.harin = S(-4.2, 1, 1);
    const fill: [number, number, number][] = [[-4.2, 0, -1], [0, 0, 1], [4.2, 0, 1], [0, 1, -1], [4.2, 2, 1], [-4.2, 3, -1], [4.2, 3, -1], [-4.2, 2, 1], [-4.2, 0, 1], [4.2, 1, 1]];
    fill.forEach(([px, ri, side], i) => (this.seats['filler' + i] = S(px, ri, side)));
    this.objs.playerDesk = this.objs[`desk_0_${DESK_ROWS[2]}_-1`];

    // 태블릿 충전함
    const cart = new THREE.Group();
    cart.position.set(6.3, 0, -1.2);
    this.root.add(cart);
    this.box(0.6, 0.9, 1.1, 0x5c6f82, 0, 0.05, 0, { parent: cart });
    for (let i = 0; i < 6; i++) this.box(0.04, 0.3, 0.2, 0x2b2f3a, -0.2 + (i % 3) * 0.2, 0.95, -0.25 + Math.floor(i / 3) * 0.5, { parent: cart });
    const lamp = this.box(0.1, 0.06, 0.02, 0x7cfc8a, -0.3, 0.7, 0.3, { parent: cart, ownMat: true });
    lamp.rotation.y = Math.PI / 2;
    this.colliders.push(aabb(6.3, -1.2, 0.6, 1.1));
    this.objs.tabletCart = cart;

    // 학급 문고
    const shelf = new THREE.Group();
    shelf.position.set(-6.7, 0, -0.6);
    this.root.add(shelf);
    const shelfModel = this.prop('Shelf_01', shelf, { w: 1.1, h: 1.6, d: 0.4 }, 0.02, 0, -0.55, Math.PI / 2) && this.prop('Shelf_01', shelf, { w: 1.1, h: 1.6, d: 0.4 }, 0.02, 0, 0.55, Math.PI / 2);
    if (!shelfModel) this.box(0.45, 1.1, 2.2, 0xa0784e, 0, 0, 0, { parent: shelf });
    const bookColors = [0xe76f51, 0x2a9d8f, 0xe9c46a, 0x264653, 0xf4a261, 0x8ab17d, 0x9d4edd];
    if (!shelfModel) for (let i = 0; i < 16; i++) this.box(0.3, 0.3, 0.09, bookColors[i % bookColors.length], 0.06, i < 8 ? 0.1 : 0.6, -0.95 + (i % 8) * 0.26, { parent: shelf, shadow: false });
    this.colliders.push(aabb(-6.7, -0.6, 0.45, 2.2));
    this.objs.bookshelf = shelf;

    // 사물함 (뒤 벽, 12칸 × 2단) — 17번이 내 것
    const lockers = new THREE.Group();
    this.root.add(lockers);
    for (let col = 0; col < 12; col++) {
      for (let row = 0; row < 2; row++) {
        const x = -5.5 + col;
        const y = 0.1 + row * 0.52;
        this.box(0.96, 0.5, 0.5, C.locker, x, y, 6.65, { parent: lockers, shadow: false });
        const num = row * 12 + col + 1;
        if (num === 17) continue;
        this.box(0.86, 0.42, 0.03, 0x8fb3d9, x, y + 0.04, 6.39, { parent: lockers, shadow: false });
      }
    }
    // 내 사물함 문 (경첩 축)
    const hinge = new THREE.Group();
    hinge.position.set(-5.5 + 4 - 0.43, 0.66, 6.38); // 4번째 칸, 2단 → 17번
    this.root.add(hinge);
    const door = this.box(0.86, 0.42, 0.03, 0xffb703, 0.43, 0, 0, { parent: hinge, ownMat: true });
    door.position.y = 0.25;
    const tag = new CanvasTex(128, 64);
    tag.draw((c, w, h) => {
      c.fillStyle = '#fff';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#222';
      c.font = font(40, true);
      c.textAlign = 'center';
      c.fillText('17', w / 2, 46);
    });
    const tagMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), tag.material());
    tagMesh.position.set(0.43, 0.32, -0.02);
    tagMesh.rotation.y = Math.PI;
    hinge.add(tagMesh);
    this.objs.lockerDoor = hinge;
    this.objs.locker17 = door;
    this.colliders.push(aabb(0, 6.65, 12, 0.5));

    // 모둠 책상 + 의자
    const gt = new THREE.Group();
    gt.position.set(0, 0, 4.7);
    this.root.add(gt);
    this.box(2.6, 0.06, 1.2, 0xf0d9b5, 0, 0.62, 0, { parent: gt });
    for (const [lx, lz] of [[-1.2, -0.5], [1.2, -0.5], [-1.2, 0.5], [1.2, 0.5]]) this.box(0.06, 0.62, 0.06, C.deskLeg, lx, 0, lz, { parent: gt });
    this.colliders.push(aabb(0, 4.7, 2.6, 1.2));
    this.objs.groupTable = gt;

    // 미술 재료함 + 정리 바구니 3개
    const cab = new THREE.Group();
    cab.position.set(-6.5, 0, 4.6);
    this.root.add(cab);
    if (!this.prop('painted_wooden_cabinet', cab, { w: 1.9, h: 1.0, d: 0.8 }, 0, 0, 0, Math.PI / 2)) this.box(0.8, 1.0, 1.9, 0x7fb069, 0, 0, 0, { parent: cab });
    const binColors = [0xe85d75, 0xf5d547, 0x58c4f6];
    ['binCut', 'binStick', 'binPaper'].forEach((name, i) => {
      const b = new THREE.Group();
      b.position.set(-6.5, 1.0, 4.0 + i * 0.6);
      this.root.add(b);
      this.box(0.5, 0.22, 0.5, binColors[i], 0, 0, 0, { parent: b, ownMat: true });
      this.objs[name] = b;
    });
    this.colliders.push(aabb(-6.5, 4.6, 0.8, 1.9));
    this.objs.artCabinet = cab;

    // 쓰레기통·분리수거함
    const trash = new THREE.Group();
    trash.position.set(6.4, 0, 3.2);
    this.root.add(trash);
    const trashModel = this.prop('metal_trash_can', trash, { w: 1.1, h: 0.75, d: 0.45 }, 0, 0, 0, Math.PI / 2);
    if (!trashModel) this.box(0.45, 0.7, 0.45, 0x8d99ae, 0, 0, -0.3, { parent: trash });
    this.prop('plastic_broom', this.root, { h: 1.1 }, 6.85, 0, 4.3, -Math.PI / 2);
    this.prop('dustpan', this.root, { w: 0.3 }, 6.6, 0, 4.1, -Math.PI / 2);
    if (!trashModel) this.box(0.45, 0.7, 0.45, 0x4ea8de, 0, 0, 0.3, { parent: trash, ownMat: true });
    this.colliders.push(aabb(6.4, 3.2, 0.5, 1.1));
    this.objs.trash = trash;

    // 뒤 게시판 (작품 전시 + 모둠 포스터)
    this.objs.exhibitBoard = this.box(3.2, 1.3, 0.05, 0xc9a26b, -3.6, 1.4, 6.95, { shadow: false, ownMat: true });
    this.box(2.0, 1.3, 0.05, 0xc9a26b, 3.6, 1.4, 6.95, { shadow: false });
    const poster = this.plane(1.6, 1.2, this.posterTex.material(), 3.6, 2.05, 6.9, Math.PI);
    poster.visible = false;
    this.objs.groupPoster = poster;
  }

  private buildHallway() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 32), new THREE.MeshLambertMaterial({ color: C.floorHall }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(9, 0.001, 0);
    floor.receiveShadow = true;
    this.root.add(floor);
    // 가운데 줄
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 32), new THREE.MeshLambertMaterial({ color: 0xb8c6a0 }));
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(9, 0.003, 0);
    this.root.add(stripe);

    this.wallX(11.1, -16, 3.9);
    this.wallX(11.1, 5.1, 16);
    this.wallX(7.1, -16, -6.2);
    this.wallX(7.1, 7.2, 16);
    this.wallZ(-16.1, 7, 11);
    this.wallZ(16.1, 2.9, 8);
    this.wallZ(16.1, 10, 15.1);
    this.box(2, 0.8, 0.2, C.wall, 9, 2.2, 16.1);

    // 문 장식 (잠긴 문들)
    const door = (name: string, label: string, x: number, z: number, ry: number, color = 0xc7a27a) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      this.root.add(g);
      this.box(1.2, 2.1, 0.06, color, 0, 0, 0, { parent: g, ownMat: true, shadow: false });
      const t = new CanvasTex(256, 64);
      t.draw((c, w, h) => {
        c.fillStyle = '#2d6a4f';
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#fff';
        c.font = font(32, true);
        c.textAlign = 'center';
        c.fillText(label, w / 2, 44);
      });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), t.material());
      sign.position.set(0, 2.35, 0.04);
      g.add(sign);
      this.objs[name] = g;
      return g;
    };
    door('doorRestroom', '화장실', 10.97, -12, -Math.PI / 2);
    door('doorBroadcast', '방송실', 10.97, 4.5, -Math.PI / 2, 0x9b8bb4);
    door('doorLibrary', '도서관', 10.97, 10, -Math.PI / 2, 0x8fb996);
    door('doorClass1', '6학년 1반', 7.23, -11, Math.PI / 2);
    door('doorGym', '체육관 ▲', 9, -15.97, 0, 0x7a9cc6);

    // 우리 반 표지판
    const t = new CanvasTex(256, 64);
    t.draw((c, w, h) => {
      c.fillStyle = '#ff8a5b';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff';
      c.font = font(34, true);
      c.textAlign = 'center';
      c.fillText('6학년 3반', w / 2, 45);
    });
    for (const z of [-4.6, 5.4]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), t.material());
      s.position.set(7.22, 2.45, z);
      s.rotation.y = Math.PI / 2;
      this.root.add(s);
    }

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
    const bulletin = this.plane(2.0, 1.17, bb.material(), 10.98, 1.6, -2, -Math.PI / 2);
    this.objs.bulletin = bulletin;

    // 신발장
    for (let i = 0; i < 3; i++) this.box(0.4, 1.0, 1.0, 0x8ecae6, 10.75, 0, -9.4 + i * 1.05, { collide: false });
    this.colliders.push(aabb(10.75, -8.35, 0.4, 3.1));
    // 정수기
    this.box(0.45, 1.2, 0.4, 0xe0e0e0, 7.45, 0, 10.5, { collide: true });
    this.box(0.3, 0.2, 0.05, 0x4ea8de, 7.45, 0.85, 10.29, { shadow: false });
  }

  /** 급식실 (x 2.9~15.1, z 16.1~27) + 조리 창고 + 배식대 + 거대 돈가스 식탁 + 친구들 식탁 */
  private buildCafeteria() {
    const floorTex = new CanvasTex(256, 256);
    floorTex.draw((c) => {
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          c.fillStyle = (x + y) % 2 ? '#d7e8ee' : '#c6dde6';
          c.fillRect(x * 64, y * 64, 64, 64);
          c.strokeStyle = '#b3cbd4';
          c.strokeRect(x * 64 + 0.5, y * 64 + 0.5, 63, 63);
        }
    });
    floorTex.tex.wrapS = floorTex.tex.wrapT = THREE.RepeatWrapping;
    floorTex.tex.repeat.set(6, 5.5);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12.2, 11), new THREE.MeshLambertMaterial({ map: floorTex.tex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(9, 0.001, 21.5);
    floor.receiveShadow = true;
    this.root.add(floor);
    this.wallX(2.9, 16.1, 27);
    this.wallX(15.1, 16.1, 27);
    this.wallZ(27.1, 2.9, 15.1);

    // 조리 창고 (서쪽 뒤)
    this.wallZ(23.5, 2.9, 4.0);
    this.wallX(5.6, 23.5, 27);
    this.sign('조리 창고', 4.8, 2.3, 23.38, Math.PI, '#577590');
    const shelf = new THREE.Group();
    shelf.position.set(3.15, 0, 25.0);
    this.root.add(shelf);
    if (!this.prop('Shelf_01', shelf, { w: 1.6, h: 1.6, d: 0.45 }, 0, 0, 0, Math.PI / 2)) this.box(0.45, 1.6, 1.6, 0xa0a8b0, 0, 0, 0, { parent: shelf });
    this.colliders.push(aabb(3.15, 25.0, 0.5, 1.6));
    this.objs.storageShelf = shelf;
    // 음식 크기 조절기 (구석 단말기)
    const mach = new THREE.Group();
    mach.position.set(3.7, 0, 26.6);
    this.root.add(mach);
    this.box(0.9, 1.35, 0.5, 0x8d99ae, 0, 0, 0, { parent: mach, ownMat: true });
    const screen = new CanvasTex(256, 160);
    screen.draw((c, w, h) => {
      c.fillStyle = '#10261c';
      c.fillRect(0, 0, w, h);
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
    this.colliders.push(aabb(3.7, 26.6, 0.9, 0.5));
    this.objs.sizeMachine = mach;
    this.machineScreen = screen;
    // 접이식 테이블 더미 (축제용)
    const fold = new THREE.Group();
    fold.position.set(5.0, 0, 26.5);
    this.root.add(fold);
    for (let i = 0; i < 4; i++) {
      const t = this.box(1.2, 0.05, 0.6, 0xe9e4d4, 0, 0.05 + i * 0.07, 0, { parent: fold, shadow: false });
      t.rotation.y = 0.04 * (i % 2 ? 1 : -1);
    }
    this.colliders.push(aabb(5.0, 26.5, 1.2, 0.6));
    this.objs.foldStack = fold;

    // 배식대 + 국통
    this.box(6, 0.9, 0.8, 0xbfc5cc, 9.6, 0, 25.6, { collide: true });
    this.box(6, 0.05, 0.9, 0xdfe3e8, 9.6, 0.9, 25.6, { shadow: false });
    this.box(6.2, 0.06, 0.06, 0x9aa3ad, 9.6, 1.3, 25.2, { shadow: false }); // 손잡이 봉
    const pots = new THREE.Group();
    this.root.add(pots);
    for (let i = 0; i < 3; i++) if (!this.prop('pot_enamel_01', pots, { w: 0.6 }, 7.6 + i * 1.6, 0.95, 25.7)) this.box(0.5, 0.35, 0.5, 0xf2f2f2, 7.6 + i * 1.6, 0.95, 25.7, { parent: pots });
    this.prop('brass_pan_01', this.root, { w: 0.5 }, 12.2, 0.95, 25.8, 0.4);
    // 원래 크기로 돌아온 돈가스 더미 (크기 조절기 성공 시)
    const stack = new THREE.Group();
    stack.position.set(9.6, 0.95, 25.65);
    const crumbMat = this.crumbMaterial();
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.035, 12).scale(1.3, 1, 0.9), crumbMat);
      c.position.set(((i * 37) % 7) * 0.12 - 0.36, 0.02 + Math.floor(i / 7) * 0.04, ((i * 11) % 3) * 0.12 - 0.12);
      c.rotation.y = i;
      stack.add(c);
    }
    stack.visible = false;
    this.root.add(stack);
    this.objs.cutletStack = stack;
    // 식판 수레 (배식대 동쪽)
    const cart = new THREE.Group();
    cart.position.set(13.9, 0, 25.6);
    this.root.add(cart);
    this.box(0.7, 0.75, 0.6, 0x9aa3ad, 0, 0, 0, { parent: cart });
    for (let i = 0; i < 6; i++) this.box(0.42, 0.03, 0.32, 0xd7dde3, 0, 0.75 + i * 0.035, 0, { parent: cart, shadow: false });
    this.colliders.push(aabb(13.9, 25.6, 0.7, 0.6));
    this.objs.trayCart = cart;

    // 거대 돈가스 식탁
    this.box(5.6, 0.72, 3.4, 0xe9dcc0, 9, 0, 21.0, { collide: true });
    const cutlet = new THREE.Group();
    cutlet.position.set(9, 0.72, 21.0);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.05, 3.25), this.mat(0xf8f9fa));
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
    // 안전 절단기 (식탁 위를 지나가는 노란 문틀 모양. 칼날은 덮개 안)
    const gantry = new THREE.Group();
    gantry.position.set(9, 0.72, 21.0);
    const yel = 0xffc300;
    this.box(0.12, 0.9, 0.12, yel, 0, 0, -1.75, { parent: gantry, ownMat: true });
    this.box(0.12, 0.9, 0.12, yel, 0, 0, 1.75, { parent: gantry });
    this.box(0.2, 0.14, 3.6, yel, 0, 0.9, 0, { parent: gantry });
    this.box(0.3, 0.3, 0.4, 0x495057, 0, 0.62, 0, { parent: gantry });
    gantry.visible = false;
    this.root.add(gantry);
    this.objs.cutterGantry = gantry;
    const panel = new THREE.Group();
    panel.position.set(12.25, 0, 22.3);
    this.box(0.35, 1.0, 0.35, 0x495057, 0, 0, 0, { parent: panel });
    this.box(0.5, 0.06, 0.4, 0xffc300, 0, 1.0, 0, { parent: panel, ownMat: true });
    this.box(0.12, 0.04, 0.12, 0xe63946, 0.1, 1.06, 0, { parent: panel, shadow: false });
    panel.visible = false;
    this.root.add(panel);
    this.objs.cutterPanel = panel;

    // 친구들 식탁 두 개 + 의자 여섯
    const tables: [number, number][] = [[4.9, 17.6], [13.1, 17.6]];
    const tablesOk = this.props('dining_table', tables.map(([x, z]) => ({ x, z })), { w: 2.2, h: 0.74, d: 1.2 });
    tables.forEach(([x, z], i) => {
      if (!tablesOk) this.box(2.2, 0.74, 1.2, 0xf2e8cf, x, 0, z);
      this.colliders.push(aabb(x, z, 2.2, 1.2));
      const anchor = new THREE.Object3D();
      anchor.position.set(x, 0.74, z);
      this.root.add(anchor);
      this.objs['dinerTable' + i] = anchor;
    });
    const diner: [number, number, number, number, number][] = [
      // 의자 x, z, 바라보는 방향, 식판 x, z
      [4.3, 18.75, Math.PI, 4.3, 17.95],
      [5.5, 18.75, Math.PI, 5.5, 17.95],
      [3.35, 17.6, Math.PI / 2, 3.95, 17.6],
      [12.5, 18.75, Math.PI, 12.5, 17.95],
      [13.7, 18.75, Math.PI, 13.7, 17.95],
      [14.65, 17.6, -Math.PI / 2, 14.05, 17.6],
    ];
    diner.forEach(([x, z, yaw, tx, tz], i) => (this.seats['diner' + i] = { x, z, yaw, deskX: tx, deskZ: tz }));
    const chairs: Placement[] = diner.map(([x, z, yaw]) => ({ x: x + Math.sin(yaw + Math.PI) * 0.05, z: z + Math.cos(yaw + Math.PI) * 0.05, ry: yaw - Math.PI }));
    if (!this.props('plastic_monobloc_chair_01', chairs, { w: 0.46, h: 0.8, d: 0.46, backToPlusZ: true }))
      for (const c of chairs) this.box(0.42, 0.42, 0.42, 0x4ea8de, c.x, 0, c.z, { shadow: false });

    // 미끄럼 주의 (배식대 앞)
    this.prop('WetFloorSign_01', this.root, { h: 0.6 }, 7.0, 0, 24.3, 0.5);

    // 급식실 문 (미닫이)
    const doorMesh = this.box(2, 2.2, 0.08, 0xd9d9d9, 9, 0, 16.05, { ownMat: true });
    const window = this.box(1.2, 0.5, 0.09, 0x9ad0ec, 9, 1.4, 16.05, { ownMat: true, shadow: false });
    const g = new THREE.Group();
    this.root.remove(doorMesh, window);
    g.add(doorMesh, window);
    this.root.add(g);
    this.sign('급식실', 9, 2.45, 15.98, Math.PI, '#e76f51');
    const collider = aabb(9, 16.1, 2, 0.3);
    this.colliders.push(collider);
    this.cafeteriaDoor = { mesh: g, collider, open: 0 };
    this.objs.cafeteriaDoor = g;
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
    m.position.set(x, y, z);
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
    const icons: Record<string, [string, string]> = {
      food: ['#e07a1f', '밥'], ball: ['#3a86ff', '공'], clock: ['#8338ec', '시계'], heart: ['#ff006e', '♥'], star: ['#ffbe0b', '★'],
    };
    this.posterTex.draw((c, w, h) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#222';
      c.font = font(30, true);
      c.textAlign = 'center';
      wrapText(c, slogan, w / 2, 56, w - 40, 38);
      for (const s of stickers) {
        const [col, label] = icons[s.kind] ?? ['#999', '?'];
        c.fillStyle = col;
        c.beginPath();
        c.arc(s.x * w, s.y * h, 34, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#fff';
        c.font = font(label.length > 1 ? 22 : 34, true);
        c.fillText(label, s.x * w, s.y * h + 10);
      }
      c.fillStyle = '#555';
      c.font = font(20);
      c.fillText(`6학년 3반 2모둠 · ${{ food: '맛있는 학교', rest: '쉬는 학교', play: '신나는 학교', friends: '함께하는 학교' }[theme]}`, w / 2, h - 18);
    });
    this.objs.groupPoster.visible = true;
  }
}

export const DESK_ROW_Z = DESK_ROWS;
