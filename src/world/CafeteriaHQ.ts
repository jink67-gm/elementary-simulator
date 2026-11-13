// 고품질 급식실 (2층 북쪽): 실제 한국 초등학교 급식실처럼.
// - 자기질 바닥 타일(살짝 반사), 흰 유광 벽 타일 징두리, 흡음 천장 + LED, 운동장 쪽 큰 창(햇빛)
// - 초록 벽기둥, 스테인리스 배식대(침 가림 유리·보온 칸) + 주방 벽(선반·후드), 손 씻는 곳
// - 긴 식탁 + 주황 둥근 의자, 오늘의 식단 게시판
// 급식실 범위: x 3.0~15.0 (벽 안쪽 면), z 16.2~27.0, 바닥 y 0, 천장 3.
// 게임 물건(배식대 충돌, 식탁 자리, 절단기, 크기 조절기 등)은 SchoolMap이 그대로 만든다.
import * as THREE from 'three';
import { aabb } from './Collision';
import { CanvasTex, font } from './canvasTex';
import { HQBuilder } from './hq';
import { TILE, aoMaterial, paint, pbr, worldUV } from './pbr';

const H = 3;
const X0 = 3.0, X1 = 15.0, Z0 = 16.2, Z1 = 27.0;
export const STEEL = () => paint(0xc4c9ce, 0.34, 0.75);
export const STOOL_ORANGE = 0xf08a3c;

export class CafeteriaBuilder extends HQBuilder {
  private steel = STEEL();
  private tileWall = pbr('wallTile', { roughness: 0.55, envMapIntensity: 1.1 });
  private green = paint(0x4f9d69, 0.6);

  build() {
    this.y = 0;
    this.level = 1;
    // 바닥: 600 자기질 타일
    const w = X1 - X0 + 0.2, d = Z1 - Z0 + 0.2, zc = (Z0 + Z1) / 2, xc = (X0 + X1) / 2;
    const f = this.add(worldUV(new THREE.PlaneGeometry(w, d), w, d, 0, TILE.floorTile), pbr('floorTile', { roughness: 0.6, envMapIntensity: 0.9 }), xc, 0.003, zc, { cast: false });
    f.rotation.x = -Math.PI / 2;
    this.ceilingHQ(xc, zc, w, d);
    // 운동장 쪽(서쪽) 창: 창고 앞까지
    this.slidingWindowWall(2.9, Z0 - 0.1, 23.4, 1, { bays: 3, sillY: 0.95 });
    this.wallTiles();
    this.pilasters();
    this.servingLine();
    this.handWash(11.6, Z0);
    this.longTable(4.15, 21.3, 2.8);
    this.menuBoard();
    this.roomAO();
  }

  private ceilingHQ(xc: number, zc: number, w: number, d: number) {
    const ceil = this.add(worldUV(new THREE.PlaneGeometry(w, d), w, d, 0, TILE.ceiling), pbr('ceiling', { roughness: 0.95 }), xc, H - 0.002, zc, { cast: true });
    ceil.rotation.x = Math.PI / 2;
    this.blockers.push(ceil);
    const led = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfffbf2, emissiveIntensity: 1.3, roughness: 0.5 });
    for (const x of [5.2, 9.0, 12.8])
      for (const z of [18.0, 21.2, 24.4]) {
        this.box(0.66, 0.03, 0.66, this.alu, x, H - 0.032, z, false);
        this.box(0.6, 0.012, 0.6, led, x, H - 0.042, z, false);
      }
    // 환기구 (네모 그릴)
    for (const [x, z] of [[7.1, 19.6], [10.9, 22.8]] as [number, number][]) {
      this.box(0.5, 0.02, 0.5, paint(0xe9eaea, 0.5), x, H - 0.022, z, false);
      for (let k = 0; k < 5; k++) this.box(0.42, 0.012, 0.03, paint(0x8f959b, 0.6), x, H - 0.03, z - 0.18 + k * 0.09, false);
    }
  }

  /** 흰 벽 타일 징두리 (1.2m) + 위 띠 */
  private wallTiles() {
    const h = 1.2, t = 0.012;
    const runsZ: [number, number, number][] = [
      // 벽 z, x0, x1 (안쪽 법선 방향은 부호로)
      [Z0 + t / 2 + 0.005, X0, 7.9],
      [Z0 + t / 2 + 0.005, 10.1, X1],
    ];
    for (const [z, x0, x1] of runsZ) {
      const len = x1 - x0;
      this.box(len, h, t, this.tileWall, (x0 + x1) / 2, 0.1, z, false, TILE.wallTile);
      this.box(len, 0.04, 0.03, this.green, (x0 + x1) / 2, 0.1 + h, z + 0.01, false);
    }
    // 동쪽 벽
    const len = Z1 - Z0;
    this.box(t, h, len, this.tileWall, X1 - t / 2 - 0.005, 0.1, (Z0 + Z1) / 2, false, TILE.wallTile);
    this.box(0.03, 0.04, len, this.green, X1 - 0.02, 0.1 + h, (Z0 + Z1) / 2, false);
    // 서쪽 창 아래
    this.box(t, 0.85, 23.3 - Z0, this.tileWall, X0 + t / 2 + 0.005, 0.1, (Z0 + 23.3) / 2, false, TILE.wallTile);
    // 걸레받이
    this.box(0.02, 0.1, len, this.dark, X1 - 0.01, 0, (Z0 + Z1) / 2, false);
    this.box(0.02, 0.1, 23.3 - Z0, this.dark, X0 + 0.01, 0, (Z0 + 23.3) / 2, false);
    this.box(X1 - X0, 0.1, 0.02, this.dark, (X0 + X1) / 2, 0, Z0 + 0.01, false);
    // 주방 벽 (배식대 뒤): 천장 가까이까지 타일
    this.box(9.3, 2.3, t, this.tileWall, 10.3, 0, Z1 - t / 2 - 0.005, false, TILE.wallTile);
  }

  /** 초록 벽기둥 (동쪽 벽) */
  private pilasters() {
    for (const z of [18.6, 21.6]) {
      this.rbox(0.32, H - 0.02, 0.56, this.green, X1 - 0.16, 0, z, 0.04);
      this.colliders.push({ ...aabb(X1 - 0.16, z, 0.32, 0.56), level: this.level });
    }
  }

  /** 배식대 위·뒤: 침 가림 유리, 보온 칸, 주방 선반·그릇·후드 */
  private servingLine() {
    const cz = 25.6, x0 = 6.6, x1 = 12.6, xc = (x0 + x1) / 2;
    // 앞판 세로 줄 (스테인리스 판 이음)
    for (let x = x0 + 0.75; x < x1; x += 1.5) this.box(0.015, 0.8, 0.01, paint(0x9aa1a8, 0.4, 0.8), x, 0.05, cz - 0.405, false);
    // 보온 칸 (어두운 사각)
    for (const x of [7.6, 9.2, 10.8, 12.2]) this.box(0.62, 0.006, 0.5, paint(0x3a3f44, 0.3, 0.6), x, 0.951, cz + 0.05, false);
    // 침 가림 유리 (기둥 + 기울어진 유리)
    for (let i = 0; i <= 4; i++) this.add(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 8), this.chrome, x0 + 0.1 + (i * (x1 - x0 - 0.2)) / 4, 1.2, cz - 0.15);
    const g = this.add(new THREE.PlaneGeometry(x1 - x0 - 0.1, 0.42), this.glass, xc, 1.42, cz - 0.24, { cast: false, receive: false });
    g.rotation.x = -0.45;
    g.rotation.y = Math.PI;
    g.renderOrder = 2;
    const g2 = this.add(new THREE.PlaneGeometry(x1 - x0 - 0.1, 0.42), this.glass, xc, 1.42, cz - 0.24, { cast: false, receive: false });
    g2.rotation.x = 0.45;
    g2.renderOrder = 2;
    this.box(x1 - x0 - 0.1, 0.025, 0.04, this.chrome, xc, 1.6, cz - 0.1, false);
    // 주방 쪽 선반 + 쌓인 그릇·식판
    this.box(5.0, 0.03, 0.35, this.steel, 9.6, 1.55, Z1 - 0.18);
    for (const sx of [7.6, 9.4]) this.box(0.03, 0.2, 0.3, this.steel, sx, 1.35, Z1 - 0.18, false);
    const bowl = paint(0xf5f3ee, 0.3);
    for (let i = 0; i < 6; i++) for (let k = 0; k < 4; k++) this.add(new THREE.CylinderGeometry(0.075, 0.05, 0.05, 12), bowl, 7.5 + i * 0.32, 1.6 + k * 0.035, Z1 - 0.18);
    for (let k = 0; k < 10; k++) this.box(0.42, 0.018, 0.3, paint(0xcfd5da, 0.3, 0.6), 10.6, 1.58 + k * 0.022, Z1 - 0.18, false);
    // 후드 (환기 덮개)
    this.box(5.4, 0.5, 0.7, this.steel, 9.8, H - 0.62, Z1 - 0.35);
    this.box(5.4, 0.04, 0.72, paint(0x9aa1a8, 0.4, 0.8), 9.8, H - 0.64, Z1 - 0.36, false);
  }

  /** 손 씻는 곳: 수전 두 개 + 거울 + 비누 (남쪽 벽, 문 오른쪽) */
  private handWash(x: number, z: number) {
    const len = 1.8;
    this.box(len, 0.08, 0.5, this.steel, x, 0.78, z + 0.25);
    this.box(len, 0.78, 0.04, this.steel, x, 0, z + 0.48, false);
    for (const dx of [-0.45, 0.45]) {
      this.box(0.4, 0.01, 0.3, paint(0x8f969c, 0.25, 0.8), x + dx, 0.861, z + 0.25, false);
      this.add(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 8), this.chrome, x + dx, 0.97, z + 0.06, { cast: false });
      const sp = this.add(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8), this.chrome, x + dx, 1.07, z + 0.12, { cast: false });
      sp.rotation.x = Math.PI / 2;
      this.add(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10), paint(dx < 0 ? 0x7cc6a4 : 0xf2b5c4, 0.4), x + dx + 0.25, 0.92, z + 0.1);
    }
    const mirror = this.add(new THREE.PlaneGeometry(len - 0.1, 0.6), paint(0xdfe6ea, 0.04, 1.0), x, 1.55, z + 0.02, { cast: false });
    void mirror;
    this.box(len - 0.04, 0.64, 0.015, this.alu, x, 1.23, z + 0.008, false);
    this.colliders.push({ ...aabb(x, z + 0.25, len, 0.5), level: this.level });
    // 손 씻기 안내
    const t = new CanvasTex(256, 96);
    t.draw((c, w, h) => {
      c.fillStyle = '#e9f5ff';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#1d6fa5';
      c.font = font(34, true);
      c.textAlign = 'center';
      c.fillText('손 씻고 먹어요!', w / 2, 46);
      c.font = font(20);
      c.fillText('비누로 30초 쓱싹쓱싹', w / 2, 80);
    });
    this.add(new THREE.PlaneGeometry(0.75, 0.28), t.material(), x, 2.05, z + 0.02, { cast: false });
  }

  /** 긴 식탁 + 양쪽 주황 둥근 의자 (z 방향 길이) */
  private longTable(x: number, z: number, len: number) {
    const top = paint(0xf4f1ea, 0.4);
    const edge = pbr('oak', { color: 0xf3e2c8, roughness: 0.5 });
    this.box(0.78, 0.035, len, top, x, 0.705, z);
    this.box(0.8, 0.03, len + 0.02, edge, x, 0.68, z, false, TILE.oak);
    for (const dz of [-len / 2 + 0.2, len / 2 - 0.2]) {
      this.box(0.06, 0.68, 0.06, this.steel, x - 0.3, 0, z + dz);
      this.box(0.06, 0.68, 0.06, this.steel, x + 0.3, 0, z + dz);
    }
    this.box(0.04, 0.04, len - 0.4, this.steel, x, 0.15, z, false);
    const n = Math.floor(len / 0.65);
    for (const side of [-1, 1])
      for (let i = 0; i < n; i++) cafeteriaStool(this.root, x + side * 0.6, z - len / 2 + (i + 0.5) * (len / n), this.steel);
    this.colliders.push({ ...aabb(x, z, 1.5, len), level: this.level });
  }

  /** 오늘의 식단 게시판 (남쪽 벽 안쪽, 문 왼쪽) */
  private menuBoard() {
    const t = new CanvasTex(512, 320);
    t.draw((c, w, h) => {
      c.fillStyle = '#fffaf0';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#e76f51';
      c.fillRect(0, 0, w, 64);
      c.fillStyle = '#fff';
      c.font = font(38, true);
      c.textAlign = 'center';
      c.fillText('오늘의 식단', w / 2, 46);
      c.fillStyle = '#333';
      c.font = font(30, true);
      ['잡곡밥', '미역국', '돈가스 ★', '양배추 샐러드', '배추김치 · 우유'].forEach((m, i) => c.fillText(m, w / 2, 112 + i * 46));
    });
    this.box(1.3, 0.85, 0.03, pbr('oak', { color: 0xf3e2c8, roughness: 0.55 }), 5.6, 1.35, Z0 + 0.03, false, TILE.oak);
    this.add(new THREE.PlaneGeometry(1.22, 0.77), t.material(), 5.6, 1.775, Z0 + 0.048, { cast: false });
  }

  private roomAO() {
    const walls: [number, number, number, number, number][] = [
      [X0, (Z0 + Z1) / 2, Z1 - Z0, 1, 0],
      [X1, (Z0 + Z1) / 2, Z1 - Z0, -1, 0],
      [(X0 + X1) / 2, Z0, X1 - X0, 0, 1],
      [(X0 + X1) / 2, Z1, X1 - X0, 0, -1],
    ];
    for (const [x, z, len, nx, nz] of walls)
      for (const ceilingSide of [false, true]) {
        const wdt = ceilingSide ? 0.4 : 0.45;
        const m = this.add(new THREE.PlaneGeometry(len, wdt), aoMaterial(), x + (nx * wdt) / 2, ceilingSide ? H - 0.004 : 0.008, z + (nz * wdt) / 2, { cast: false, receive: false });
        m.rotation.order = 'YXZ';
        if (ceilingSide) m.rotation.set(Math.PI / 2, Math.atan2(-nx, -nz), 0);
        else m.rotation.set(-Math.PI / 2, Math.atan2(nx, nz), 0);
      }
  }
}

/** 주황 둥근 급식실 의자 (앉는 면 높이 0.45) — parent 좌표 */
export function cafeteriaStool(parent: THREE.Object3D, x: number, z: number, steel: THREE.Material) {
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.16, 0.045, 18), stoolMat());
  seat.position.set(x, 0.45, z);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.43, 8), steel);
  leg.position.set(x, 0.215, z);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.02, 14), steel);
  foot.position.set(x, 0.01, z);
  for (const m of [seat, leg, foot]) {
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
  }
}
let stoolM: THREE.Material | null = null;
function stoolMat() {
  return (stoolM ??= paint(STOOL_ORANGE, 0.45));
}

/** 급식실 식탁 (윗면 높이 0.74): 흰 상판 + 나무 테두리 + 스테인리스 다리 — parent 좌표 */
export function cafeteriaTable(parent: THREE.Object3D, x: number, z: number, w: number, d: number, steel: THREE.Material, topY = 0.74) {
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const o = topY - 0.74;
  add(new THREE.BoxGeometry(w, 0.03, d), paint(0xf4f1ea, 0.4), x, 0.725 + o, z);
  add(worldUV(new THREE.BoxGeometry(w + 0.02, 0.03, d + 0.02), w + 0.02, 0.03, d + 0.02, TILE.oak), pbr('oak', { color: 0xf3e2c8, roughness: 0.5 }), x, 0.695 + o, z);
  // 긴 식탁은 다리를 더 (1.4m마다)
  const nx = Math.max(1, Math.round((w - 0.24) / 1.4));
  for (let i = 0; i <= nx; i++)
    for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.68 + o, 0.05), steel, x - (w / 2 - 0.12) + (i * (w - 0.24)) / nx, (0.68 + o) / 2, z + sz * (d / 2 - 0.12));
  for (const sz of [-1, 1]) add(new THREE.BoxGeometry(w - 0.24, 0.035, 0.035), steel, x, 0.62 + o, z + sz * (d / 2 - 0.12));
}
