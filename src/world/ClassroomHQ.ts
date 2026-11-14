// 고품질 교실 (2층 6-1): 실제 한국 초등학교 교실처럼. 네 방향이 하나의 공간으로 이어진다.
// - 앞(z=-6): 전자칠판 + 양옆 녹색 칠판, 아래 흰 MDF 수납장, 위 태극기, 왼쪽 교사용 책상(SchoolMap)
// - 왼쪽(창가, x=-7): 녹색 창틀 + 베이지 콤비 블라인드, 창 아래 긴 우드 MDF 수납장·화분, 돌출 기둥 + 시간표(월~금 × 1~6교시)
// - 뒤(z=7, 문·창 없음): 긴 게시판 하나, 아래 우드 MDF 사물함, 왼쪽 청소도구함 / 오른쪽 태블릿 충전함·쓰레기통·분리수거함
// - 오른쪽(복도 쪽, x=7): 앞문·뒷문(유리 미닫이), 그 사이 복도 유리창 + 낮은 책장, 가운데 기둥 벽시계, 공기청정기
// 교실 범위: x -7.0~7.0 (벽 안쪽 면), z -6.0~7.0, 바닥 y 0, 천장 3.
// 게임 로직이 쓰는 물건(objs, 충돌 상자, 자리)은 SchoolMap이 만든다. 여기서는 모습과 붙박이 가구.
import * as THREE from 'three';
import { aabb } from './Collision';
import { HQBuilder } from './hq';
import { TILE, aoMaterial, paint, pbr, worldUV } from './pbr';
import { CanvasTex, font } from './canvasTex';
import { ART_CAB, BOOKSHELF, CLASS_DOORS, BACK_BOARD, CLOCK_POS, EAST_PILLAR, EAST_SHELF, EAST_SHELVES, HALL_WINDOWS, HALL_WIN_Y, LOCKERS, PURIFIER, WEST_PILLAR, WINDOW_CAB } from './classroomLayout';
import { buildAirPurifier, buildCabinetRun, buildGarland, buildOpenShelf, buildPlant, combiBlindMat, taegukgiTex, timetableTex } from './classroomSet';
import { compact, std } from './props/kit';

const H = 3;
const X0 = -7.0, X1 = 7.0, Z0 = -6.0, Z1 = 7.0;

export class ClassroomBuilder extends HQBuilder {
  private wood = pbr('oak', { color: 0xf3e2c8, roughness: 0.62 });

  build() {
    this.y = 0;
    this.level = 1;
    this.floor();
    this.ceilingHQ();
    this.fabric = combiBlindMat();
    this.slidingWindowWall(-7.1, Z0, Z1, 1, { blinds: true, bays: 5, frame: this.frame });
    this.wainscot();
    this.corridorSide();
    this.frontWall();
    this.backWall();
    this.furniture();
    this.roomAO();
    this.outsideWest();
  }

  // ───────── 바닥·천장 ─────────
  private floor() {
    const w = X1 - X0 + 0.2, d = Z1 - Z0 + 0.2;
    const f = this.add(worldUV(new THREE.PlaneGeometry(w, d), w, d, 0, TILE.laminate), pbr('laminate', { roughness: 0.62, envMapIntensity: 0.8, normalScale: 0.6 }), 0, 0.003, (Z0 + Z1) / 2, { cast: false });
    f.rotation.x = -Math.PI / 2;
  }

  private ceilingHQ() {
    const w = X1 - X0 + 0.2, d = Z1 - Z0 + 0.2, zc = (Z0 + Z1) / 2;
    const ceil = this.add(worldUV(new THREE.PlaneGeometry(w, d), w, d, 0, TILE.ceiling), pbr('ceiling', { roughness: 0.95 }), 0, H - 0.002, zc, { cast: true });
    ceil.rotation.x = Math.PI / 2;
    this.blockers.push(ceil);
    // 사각 LED 평판등 3줄 × 4
    const led = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfffbf2, emissiveIntensity: 1.3, roughness: 0.5 });
    led.userData.pbr = true; // 천장 등은 한 덩어리로 합쳐 그린다
    for (const x of [-4.2, 0, 4.2])
      for (const z of [-4.2, -1.2, 1.8, 4.8]) {
        this.box(0.66, 0.03, 0.66, this.alu, x, H - 0.032, z, false);
        this.box(0.6, 0.012, 0.6, led, x, H - 0.042, z, false);
      }
    // 천장형 냉난방기 2대 (4방향 바람 날개)
    for (const x of [-2.1, 2.1]) {
      const z = 0.3;
      this.rbox(0.95, 0.06, 0.95, paint(0xf4f4f2, 0.45), x, H - 0.06, z, 0.02);
      this.box(0.5, 0.012, 0.5, paint(0xd9dbd8, 0.6), x, H - 0.072, z, false); // 흡입 그릴
      for (const [dx, dz, rot] of [[0, 0.36, 0], [0, -0.36, 0], [0.36, 0, 1], [-0.36, 0, 1]] as [number, number, number][]) {
        const vane = this.box(rot ? 0.06 : 0.62, 0.012, rot ? 0.62 : 0.06, paint(0x9aa0a6, 0.5), x + dx, H - 0.074, z + dz, false);
        void vane;
      }
    }
    // 천장 선풍기 2대 (날개 셋)
    const fanMat = paint(0xf7f7f5, 0.5);
    for (const [x, z] of [[-4.2, 3.3], [4.2, -2.7]] as [number, number][]) {
      this.add(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), this.chrome, x, H - 0.15, z, { cast: false });
      this.add(new THREE.CylinderGeometry(0.13, 0.11, 0.12, 16), fanMat, x, H - 0.35, z);
      for (let k = 0; k < 3; k++) {
        const a = (k * Math.PI * 2) / 3 + 0.4;
        const b = this.add(new THREE.BoxGeometry(0.5, 0.012, 0.11), fanMat, x + Math.cos(a) * 0.36, H - 0.37, z + Math.sin(a) * 0.36);
        b.rotation.y = -a;
      }
    }
    // 화재 감지기·스프링클러
    const det = paint(0xfafafa, 0.5);
    for (const [x, z] of [[-2.1, -3.0], [2.1, 3.6]] as [number, number][]) this.add(new THREE.CylinderGeometry(0.07, 0.08, 0.04, 14), det, x, H - 0.02, z, { cast: false });
  }

  /** 나무 징두리 판벽 (벽 아래 0.95m) + 띠 */
  private wainscot() {
    const h = 0.95;
    const runs: [number, number, number, number, number][] = [
      // x, z, 길이, 방향(0: z를 따라, 1: x를 따라), 안쪽 법선 부호
      [X1 - 0.008, (-3.7 + 4.5) / 2, 4.5 + 3.7, 0, -1], // 복도 쪽 (두 문 사이, 창 아래)
    ];
    for (const [x, z, len, along, n] of runs) {
      if (along === 0) {
        this.box(0.016, h, len, this.wood, x, 0.12, z, false, TILE.oak);
        this.box(0.04, 0.035, len, this.wood, x + n * 0.012, 0.12 + h, z, false, TILE.oak);
        // 판 이음매
        for (let k = 1; k < Math.round(len / 1.2); k++) this.box(0.02, h, 0.008, paint(0x8b6b4a, 0.8), x + n * 0.004, 0.12, z - len / 2 + (k * len) / Math.round(len / 1.2), false);
      }
    }
    // 창 아래 벽에도 판벽
    this.box(0.016, 0.62, Z1 - Z0 - 0.3, this.wood, X0 + 0.008, 0.12, (Z0 + Z1) / 2, false, TILE.oak);
    this.box(0.04, 0.035, Z1 - Z0 - 0.3, this.wood, X0 + 0.02, 0.74, (Z0 + Z1) / 2, false, TILE.oak);
    // 걸레받이 (교실 둘레)
    const base = this.dark;
    this.box(0.02, 0.12, Z1 - Z0, base, X0 + 0.01, 0, (Z0 + Z1) / 2, false);
    this.box(X1 - X0, 0.12, 0.02, base, 0, 0, Z0 + 0.01, false);
    this.box(X1 - X0, 0.12, 0.02, base, 0, 0, Z1 - 0.01, false);
    this.box(0.02, 0.12, 8.2, base, X1 - 0.01, 0, 0.4, false);
  }

  /** 복도 쪽 벽: 복도가 보이는 나무틀 유리창 두 칸 + 문틀(안쪽) */
  private corridorSide() {
    const { sill, top } = HALL_WIN_Y;
    for (const [z0, z1] of HALL_WINDOWS) {
      const len = z1 - z0, zc = (z0 + z1) / 2, h = top - sill;
      // 벽 두께(0.2)를 감싸는 나무 틀: 위·아래·양옆 + 가운데 세로 살 + 창턱
      this.box(0.26, 0.06, len + 0.12, this.wood, 7.1, sill - 0.06, zc, true, TILE.oak);
      this.box(0.26, 0.06, len + 0.12, this.wood, 7.1, top, zc, true, TILE.oak);
      for (const z of [z0 - 0.03, z1 + 0.03]) this.box(0.26, h, 0.06, this.wood, 7.1, sill, z, true, TILE.oak);
      this.box(0.3, 0.025, len + 0.16, this.wood, 7.08, sill - 0.085, zc, true, TILE.oak);
      const n = 2, pw = len / n;
      for (let i = 1; i < n; i++) this.box(0.08, h, 0.05, this.wood, 7.1, sill, z0 + i * pw, true, TILE.oak);
      for (let i = 0; i < n; i++) {
        // 미닫이 창 두 장 (안쪽·바깥쪽 레일에 어긋나게)
        const px = 7.1 + (i ? 0.025 : -0.025), pz = z0 + (i + 0.5) * pw;
        for (const y of [sill + 0.0, top - 0.045]) this.box(0.03, 0.045, pw - 0.02, this.wood, px, y, pz, false, TILE.oak);
        for (const z of [pz - pw / 2 + 0.03, pz + pw / 2 - 0.03]) this.box(0.03, h, 0.045, this.wood, px, sill, z, false, TILE.oak);
        const g = this.add(new THREE.PlaneGeometry(pw - 0.1, h - 0.09), this.glass, px, sill + h / 2, pz, { cast: false, receive: false, ry: Math.PI / 2 });
        g.renderOrder = 2;
        this.blockers.push(g);
        this.box(0.02, 0.1, 0.02, this.chrome, px - 0.02, sill + h * 0.45, i ? pz - pw / 2 + 0.07 : pz + pw / 2 - 0.07, false);
      }
    }
    // 문틀 (안쪽) + 문지방
    for (const { z0, z1 } of CLASS_DOORS) {
      const zc = (z0 + z1) / 2, w = z1 - z0;
      this.box(0.25, 0.08, w + 0.16, this.wood, 7.1, 2.1, zc, false, TILE.oak);
      this.box(0.25, 2.1, 0.08, this.wood, 7.1, 0, z0 - 0.04, false, TILE.oak);
      this.box(0.25, 2.1, 0.08, this.wood, 7.1, 0, z1 + 0.04, false, TILE.oak);
      this.box(0.24, 0.012, w, paint(0x9aa0a6, 0.4, 0.6), 7.1, 0.0, zc, false);
      // 문 위 고정 유리 느낌의 밝은 판 (안쪽)
      this.box(0.012, 0.5, w - 0.1, paint(0xe4ebee, 0.3), 6.995, 2.3, zc, false);
      this.box(0.02, 0.56, w, this.wood, 6.992, 2.27, zc, false, TILE.oak);
    }
    // 스위치·인터폰 (앞문 옆 기둥 벽)
    this.box(0.03, 0.22, 0.14, paint(0xdedfda, 0.5), X1 - 0.015, 1.35, -3.35, false);
  }

  // ───────── 앞면: 칠판 벽 ─────────
  private frontWall() {
    const z = Z0;
    // 나무 판 뒷벽 (칠판·보드가 붙는 면)
    this.box(8.1, 2.0, 0.025, this.wood, 0, 0.7, z + 0.0125, false, TILE.oak);
    this.box(8.2, 0.05, 0.05, this.wood, 0, 2.7, z + 0.025, false, TILE.oak);
    // 전자칠판 양옆 짙은 녹색 칠판 (알루미늄 틀 + 분필 받침 + 분필·지우개)
    const green = paint(0x1f4d3a, 0.85);
    for (const bx of [-2.95, 2.95]) {
      this.box(1.9, 1.35, 0.03, this.alu, bx, 0.95, z + 0.04, false);
      this.add(new THREE.PlaneGeometry(1.84, 1.29), green, bx, 0.95 + 0.675, z + 0.056, { cast: false });
      this.box(1.86, 0.025, 0.08, this.alu, bx, 0.925, z + 0.075);
      for (const [dx, c] of [[-0.5, 0xffffff], [-0.42, 0xfff3a3], [-0.34, 0xffc2d1]] as [number, number][]) this.box(0.07, 0.012, 0.012, paint(c, 0.9), bx + dx, 0.95, z + 0.085, false);
      this.rbox(0.13, 0.035, 0.05, paint(0x3d5a80, 0.9), bx + 0.55, 0.95, z + 0.08, 0.008);
    }
    // 오른쪽 칠판: 시간표 + 수업 안내 자료 (자석으로 붙인 종이)
    const notice = new CanvasTex(256, 340);
    notice.draw((c, w, h) => {
      c.fillStyle = '#fffdf3';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#2d6a4f';
      c.fillRect(0, 0, w, 46);
      c.fillStyle = '#fff';
      c.font = font(24, true);
      c.textAlign = 'center';
      c.fillText('오늘의 수업', w / 2, 32);
      c.textAlign = 'left';
      c.fillStyle = '#333';
      c.font = font(20);
      ['1교시 국어 — 발표하기', '2교시 수학 — 태블릿 퀴즈', '3교시 모둠 — 포스터', '4교시 미술 — 만들기', '점심 — 돈가스!'].forEach((t, i) => c.fillText(t, 14, 84 + i * 50));
    });
    this.add(new THREE.PlaneGeometry(0.4, 0.53), notice.material(), 3.3, 1.9, z + 0.058, { cast: false });
    for (const [mx, my, col] of [[3.3, 2.185, 0x3a86ff], [3.3, 1.47, 0xffd166]] as [number, number, number][]) this.add(new THREE.CylinderGeometry(0.018, 0.018, 0.008, 10), paint(col, 0.4), mx, my, z + 0.062, { cast: false }).rotation.x = Math.PI / 2;
    this.add(new THREE.PlaneGeometry(0.3, 0.21), paint(0xd6f0ff, 0.9), 3.3, 1.36, z + 0.058, { cast: false });
    // 태극기 액자 (칠판 위 가운데)
    this.box(0.7, 0.48, 0.03, this.wood, 0, 2.5, z + 0.04, false, TILE.oak);
    this.add(new THREE.PlaneGeometry(0.63, 0.42), std(0xffffff, 0.7, 0, { map: taegukgiTex(), key: 'taegukgi' }), 0, 2.74, z + 0.057, { cast: false });
    // 칠판 아래 흰색 MDF 수납장 (양문 모듈)
    const cab = buildCabinetRun(7.36, 0.72, 0.42, { whiteDoors: true, module: 0.92 });
    cab.position.set(0, 0, z + 0.21);
    cab.rotation.y = -Math.PI / 2; // 앞면이 교실 쪽(+z)
    this.root.add(cab);
    // 수납장 위 작은 화분
    const p = buildPlant(0, 0.9);
    p.position.set(-3.3, 0.72, z + 0.22);
    this.root.add(p);
  }

  // ───────── 뒷면: 게시판 (문 없음) ─────────
  private backWall() {
    const deco = new THREE.Group();
    this.root.add(deco);
    // 사물함 위 화분·책
    [[LOCKERS.x + 2.5, 0], [LOCKERS.x + 0.4, 2], [LOCKERS.x - 2.4, 1]].forEach(([px, kind]) => {
      const pl = buildPlant(kind, 1);
      pl.position.set(px, LOCKERS.top, 6.7);
      deco.add(pl);
    });
    const bookColors = [0xe76f51, 0x2a9d8f, 0xe9c46a, 0x264653, 0xf4a261, 0x8ab17d];
    for (let i = 0; i < 9; i++) this.box(0.045, 0.24 + (i % 3) * 0.02, 0.18, paint(bookColors[i % 6], 0.7), LOCKERS.x - 1.2 + i * 0.05, LOCKERS.top, 6.72, true);
    this.rbox(0.5, 0.2, 0.24, paint(0x4ea8de, 0.6), LOCKERS.x + 1.5, LOCKERS.top, 6.72, 0.02);
    // 가로로 긴 게시판 하나: 나무 테두리 + 노란 물결 띠 + 네 귀퉁이 잎 장식 (판은 SchoolMap 물건: exhibitBoard)
    const B = BACK_BOARD;
    this.box(B.w + 0.1, 0.06, 0.06, this.wood, B.x, B.y - 0.03, 6.955, false, TILE.oak);
    this.box(B.w + 0.1, 0.06, 0.06, this.wood, B.x, B.y + B.h - 0.03, 6.955, false, TILE.oak);
    for (const sx of [-1, 1]) this.box(0.06, B.h, 0.06, this.wood, B.x + sx * (B.w / 2 + 0.02), B.y, 6.955, false, TILE.oak);
    const yellow = paint(0xffd43b, 0.9);
    this.box(B.w - 0.02, B.h - 0.02, 0.02, yellow, B.x, B.y + 0.01, 6.975, false);
    for (const [gx, gy] of [[-1, 1], [1, 1]]) {
      const gl = buildGarland(0.9);
      gl.position.set(B.x + gx * (B.w / 2 - 0.6), B.y + B.h / 2 + gy * (B.h / 2 - 0.2), 6.93);
      gl.rotation.y = Math.PI;
      deco.add(gl);
    }
    // 종이 튤립 (게시판 아래 양쪽)
    for (const sx of [-1, 1])
      for (let i = 0; i < 4; i++) {
        const fx = B.x + sx * (B.w / 2 - 0.5) + (i - 1.5) * 0.14, fy = B.y + 0.22;
        this.add(new THREE.PlaneGeometry(0.02, 0.2), paint(0x4f9a3c, 0.9), fx, fy, 6.925, { cast: false, ry: Math.PI });
        this.add(new THREE.CircleGeometry(0.06, 10), paint([0xff8fab, 0xffd166, 0xf28482, 0xc77dff][i], 0.9), fx, fy + 0.14, 6.924, { cast: false, ry: Math.PI });
      }
    compact(deco);
    // 학습 자료 (작품 아래 줄)
    for (let i = 0; i < 5; i++) {
      const px = B.x - 1.7 + i * 0.85;
      this.add(new THREE.PlaneGeometry(0.3, 0.38), paint(0xfffdf3, 0.9), px, B.y + 0.32, 6.92, { cast: false, ry: Math.PI });
      this.add(new THREE.PlaneGeometry(0.24, 0.05), paint([0xef476f, 0x3a86ff, 0x06a77d, 0xf4a261, 0x8338ec][i], 0.9), px, B.y + 0.45, 6.918, { cast: false, ry: Math.PI });
    }
  }

  // ───────── 붙박이 가구: 창가 긴 수납장·화분, 복도 쪽 낮은 책장, 공기청정기, 벽 선풍기 ─────────
  private furniture() {
    const deco = new THREE.Group();
    this.root.add(deco);
    const W = WINDOW_CAB;
    // 창가 수납장: 학급 문고·미술 재료함 자리를 뺀 나머지 구간을 양문 모듈로 채운다
    const holes: [number, number][] = [[BOOKSHELF.z - BOOKSHELF.len / 2, BOOKSHELF.z + BOOKSHELF.len / 2], [WEST_PILLAR.z - WEST_PILLAR.d / 2, WEST_PILLAR.z + WEST_PILLAR.d / 2], [ART_CAB.z - ART_CAB.len / 2, ART_CAB.z + ART_CAB.len / 2]];
    let z = W.z0;
    for (const [a, b] of [...holes, [W.z1, W.z1] as [number, number]]) {
      if (a - z > 0.2) {
        const run = buildCabinetRun(a - z - 0.01, W.h, W.d);
        run.position.set(W.x, 0, (z + a) / 2);
        deco.add(run);
      }
      z = b;
    }
    // 화분 (창가 수납장 위, 창턱 앞)
    const plants: [number, number, number][] = [[-3.0, 2, 1.2], [-2.3, 1, 1.0], [1.6, 1, 0.95], [2.1, 0, 1.0], [2.8, 3, 1.1], [3.2, 1, 0.9], [5.75, 0, 1.3], [6.5, 2, 1.1]];
    for (const [pz, kind, sc] of plants) {
      const pl = buildPlant(kind, sc);
      pl.position.set(W.x - 0.03, W.h, pz);
      deco.add(pl);
    }
    // 복도 쪽 창 아래 낮은 책장 두 개 (동화책·교구 바구니)
    const E = EAST_SHELF;
    EAST_SHELVES.forEach(([a, b], i) => {
      const es = buildOpenShelf(b - a, E.h, E.d);
      es.position.set(E.x, 0, (a + b) / 2);
      es.rotation.y = Math.PI; // 앞면이 교실 쪽(-x)
      deco.add(es);
      this.colliders.push({ ...aabb(E.x, (a + b) / 2, E.d, b - a), level: 1 });
      const pl = buildPlant(i ? 0 : 3, 1.1);
      pl.position.set(E.x, E.h, i ? a + 0.3 : a + 0.3);
      deco.add(pl);
    });
    // 공기청정기 (뒷문 옆 기둥 벽 앞)
    const ap = buildAirPurifier();
    ap.position.set(PURIFIER.x, 0, PURIFIER.z);
    deco.add(ap);
    this.colliders.push({ ...aabb(PURIFIER.x, PURIFIER.z, 0.32, 0.38), level: 1 });
    // 돌출 기둥 (바닥~천장, 실제 벽 두께): 창가 = 시간표, 복도 쪽 = 벽시계(SchoolMap) + 스위치
    const plaster = pbr('plaster', { roughness: 0.9 });
    for (const P of [WEST_PILLAR, EAST_PILLAR]) {
      const m = this.box(P.w, H, P.d, plaster, P.x, 0, P.z, true, TILE.plaster);
      this.blockers.push(m);
      this.box(P.w + 0.02, 0.12, P.d + 0.02, this.dark, P.x, 0, P.z, false);
    }
    const wp = WEST_PILLAR, fx = wp.x + wp.w / 2;
    const ttm = this.add(new THREE.PlaneGeometry(0.56, 0.84), std(0xffffff, 0.8, 0, { map: timetableTex(), key: 'timetable' }), fx + 0.012, 1.62, wp.z, { cast: false, ry: Math.PI / 2 });
    void ttm;
    this.box(0.012, 0.86, 0.58, paint(0xf7f3e8, 0.8), fx + 0.004, 1.19, wp.z, false);
    // 걸이 끈 + 못
    for (const sz of [-1, 1]) {
      const st = this.box(0.004, 0.2, 0.006, paint(0xb08a5a, 0.9), fx + 0.006, 2.04, wp.z + sz * 0.1, false);
      st.rotation.x = sz * 0.75;
    }
    this.add(new THREE.SphereGeometry(0.012, 8, 6), this.chrome, fx + 0.01, 2.21, wp.z, { cast: false });
    const ep = EAST_PILLAR, ex = ep.x - ep.w / 2;
    for (const [dz, wdt] of [[-0.14, 0.07], [-0.04, 0.07], [0.08, 0.06], [0.16, 0.06]] as [number, number][]) this.box(0.012, 0.11, wdt, this.laminateWhite, ex - 0.006, 1.2, ep.z + dz, false);
    void CLOCK_POS;
    compact(deco);
  }

  /** 벽·천장 모서리 그림자 (교실 둘레) */
  private roomAO() {
    const walls: [number, number, number, number, number][] = [
      // 벽 중심 x, z, 길이, 안쪽 법선 nx, nz
      [X0, (Z0 + Z1) / 2, Z1 - Z0, 1, 0],
      [X1, (Z0 + Z1) / 2, Z1 - Z0, -1, 0],
      [0, Z0, X1 - X0, 0, 1],
      [0, Z1, X1 - X0, 0, -1],
    ];
    for (const [x, z, len, nx, nz] of walls) {
      for (const ceilingSide of [false, true]) {
        const wdt = ceilingSide ? 0.4 : 0.45;
        const m = this.add(new THREE.PlaneGeometry(len, wdt), aoMaterial(), x + (nx * wdt) / 2, ceilingSide ? H - 0.004 : 0.008, z + (nz * wdt) / 2, { cast: false, receive: false });
        m.rotation.order = 'YXZ';
        if (ceilingSide) m.rotation.set(Math.PI / 2, Math.atan2(-nx, -nz), 0);
        else m.rotation.set(-Math.PI / 2, Math.atan2(nx, nz), 0);
      }
    }
  }

  // ───────── 창밖 (서쪽): 학교 건물 벽 + 운동장 ─────────
  private outsideWest() {
    const gy = -3.6; // 1층 바닥 = 땅
    const ext = paint(0xe9e2d4, 0.85);
    const band = paint(0xb85c38, 0.8);
    // 건물 서쪽 외벽: 1층 전체 + 2층(다른 교실) — 6-1 창 부분은 창문 벽이 대신
    this.box(0.1, -gy, 32.4, ext, -7.25, gy, 0, false);
    this.box(0.1, H + 0.4, 10.0, ext, -7.25, 0, -11.1, false);
    this.box(0.1, H + 0.4, 9.0, ext, -7.25, 0, 11.6, false);
    this.box(0.12, 0.4, 13.2, ext, -7.25, H, 0.5, false);
    this.box(0.14, 0.22, 32.4, band, -7.27, -0.25, 0, false); // 층 띠
    // 다른 교실 창 (어두운 유리 + 흰 틀)
    const darkGlass = paint(0x5d7f97, 0.15, 0.2);
    for (const [y, zs] of [[gy + 0.9, [-13.5, -9.5, -5.5, -1.5, 2.5, 6.5, 10.5, 14.5]], [0.9, [-13.5, -9.5, 9.6, 13.6]]] as [number, number[]][]) {
      for (const z of zs) {
        this.box(0.05, 1.72, 3.0, this.alu, -7.31, y - 0.06, z, false);
        this.box(0.04, 1.6, 2.88, darkGlass, -7.34, y, z, false);
      }
    }
    // 스탠드 (계단식 콘크리트) + 구령대
    const conc = pbr('terrazzo', { color: 0xc9c6bd, roughness: 0.95 });
    for (let k = 0; k < 3; k++) this.box(1.2, 0.4 * (3 - k), 26, conc, -8.0 - k * 1.2, gy, 0, true, 2);
    this.box(4.0, 1.2, 3.2, conc, -12.4, gy, 0.5, true, 2);
    this.box(4.2, 0.08, 3.4, paint(0x8d6e63, 0.7), -12.4, gy + 1.2, 0.5);
    // 모래 운동장
    const sand = new CanvasTex(256, 256);
    sand.draw((c, w, h) => {
      c.fillStyle = '#cdb38c';
      c.fillRect(0, 0, w, h);
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 9000; i++) {
        c.fillStyle = ['#bfa47c', '#d9c29c', '#b39570', '#e0cba8'][i % 4];
        c.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
      }
    });
    sand.tex.wrapS = sand.tex.wrapT = THREE.RepeatWrapping;
    sand.tex.repeat.set(18, 22);
    const field = this.add(new THREE.PlaneGeometry(44, 56), new THREE.MeshStandardMaterial({ map: sand.tex, roughness: 1 }), -36, gy + 0.004, 0, { cast: false });
    field.rotation.x = -Math.PI / 2;
    // 흰 선: 트랙 + 축구장
    const line = new THREE.MeshBasicMaterial({ color: 0xf4f1ea });
    const track = this.add(new THREE.RingGeometry(9.6, 9.75, 48, 1, 0, Math.PI), line, -26, gy + 0.008, -9, { cast: false, receive: false });
    track.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    const track2 = this.add(new THREE.RingGeometry(9.6, 9.75, 48, 1, 0, Math.PI), line, -26, gy + 0.008, 9, { cast: false, receive: false });
    track2.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
    for (const dx of [-9.67, 9.67]) {
      const s = this.add(new THREE.PlaneGeometry(0.15, 18), line, -26 + dx, gy + 0.008, 0, { cast: false, receive: false });
      s.rotation.x = -Math.PI / 2;
    }
    const mid = this.add(new THREE.PlaneGeometry(14, 0.12), line, -26, gy + 0.008, 0, { cast: false, receive: false });
    mid.rotation.x = -Math.PI / 2;
    // 축구 골대 둘
    const white = paint(0xf8f9fa, 0.4, 0.3);
    for (const gz of [-15.5, 15.5]) {
      for (const dx of [-1.8, 1.8]) this.add(new THREE.CylinderGeometry(0.06, 0.06, 2.0, 8), white, -26 + dx, gy + 1.0, gz);
      const bar = this.add(new THREE.CylinderGeometry(0.06, 0.06, 3.6, 8), white, -26, gy + 2.0, gz);
      bar.rotation.z = Math.PI / 2;
    }
    // 색깔 울타리
    const colors = [0xef476f, 0xffd166, 0x06d6a0, 0x118ab2, 0x9b5de5, 0xf78c6b];
    for (let i = 0; i < 28; i++) {
      const z = -27 + i * 2;
      this.box(0.06, 1.6, 1.9, paint(colors[i % colors.length], 0.6), -47, gy, z, false);
    }
    this.box(0.12, 0.08, 56, white, -47, gy + 1.6, 0, false);
    // 나무 줄
    const trunk = paint(0x6b4f3a, 0.9);
    const leaves = [paint(0x4f8a3c, 0.85), paint(0x5f9e45, 0.85), paint(0x3f7a35, 0.85)];
    for (let i = 0; i < 12; i++) {
      const z = -26 + i * 4.7 + ((i * 37) % 5) * 0.3;
      const tx = -49.5 - ((i * 53) % 3) * 0.8;
      this.add(new THREE.CylinderGeometry(0.14, 0.18, 2.6, 8), trunk, tx, gy + 1.3, z);
      const cr = this.add(new THREE.IcosahedronGeometry(1.7 + ((i * 13) % 4) * 0.25, 1), leaves[i % 3], tx, gy + 3.7, z);
      cr.scale.y = 1.2;
    }
    // 아파트 단지
    const apt = new CanvasTex(128, 256);
    apt.draw((c, w, h) => {
      c.fillStyle = '#ece6dc';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#a5b8c6';
      for (let y = 6; y < h; y += 14) for (let x = 6; x < w; x += 20) c.fillRect(x, y, 12, 8);
    });
    apt.tex.wrapS = apt.tex.wrapT = THREE.RepeatWrapping;
    for (let i = 0; i < 4; i++) {
      const hgt = 30 + (i % 3) * 7;
      const t = apt.tex.clone();
      t.needsUpdate = true;
      t.repeat.set(2, hgt / 14);
      const b = new THREE.Mesh(new THREE.BoxGeometry(9, hgt, 20), new THREE.MeshLambertMaterial({ map: t }));
      b.position.set(-70 - (i % 2) * 10, gy + hgt / 2, -36 + i * 24);
      this.root.add(b);
    }
  }
}
