// 고품질 강당 (2층 남쪽): 참고 사진처럼 나무 마루 + 파란 선, 높은 창 + 커튼, 무대, 철골 지붕.
// 경기장 범위는 그대로(x 1.0~17.0, z -30.0~-16.2), 북쪽(z -34.6~-30.15)에 무대를 붙이고 천장을 6.5m로 올린다.
// 골대·공 창고·규칙 게시판·발사대 등 게임 물건은 SchoolMap이 그대로 만든다.
import { SCHOOL_NAME } from '../data/school';
import { TILE_EXT, brickMat } from './exteriorTex';
import * as THREE from 'three';
import { aabb } from './Collision';
import { CanvasTex, font } from './canvasTex';
import { HQBuilder } from './hq';
import { TILE, aoMaterial, paint, pbr, worldUV } from './pbr';

export const GYM_H = 6.5;
const X0 = 1.0, X1 = 17.0, ZS = -16.2, ZN = -34.6, STAGE_Z = -30.15, STAGE_H = 1.0;

export class GymBuilder extends HQBuilder {
  private maple = pbr('oak', { color: 0xfff0d8, roughness: 0.42, envMapIntensity: 0.9 });
  private plaster = pbr('plaster', { roughness: 0.9 });
  private slat = pbr('oak', { color: 0xe9cfa8, roughness: 0.6 });
  private steelBeam = paint(0x8a9299, 0.5, 0.6);
  private curtain = paint(0x8c1c2b, 0.95);

  build() {
    this.y = 0;
    this.level = 1;
    this.floor();
    this.walls();
    this.highWindows(X0 - 0.1, 1);
    this.highWindows(X1 + 0.1, -1);
    this.stage();
    this.roof();
    this.hoops();
    this.courtAO();
    this.exterior();
  }

  private floor() {
    const w = X1 - X0, d = ZS - ZN, zc = (ZS + ZN) / 2, xc = (X0 + X1) / 2;
    const f = this.add(worldUV(new THREE.PlaneGeometry(w, d), w, d, 0, TILE.oak * 1.4), this.maple, xc, 0.003, zc, { cast: false });
    f.rotation.x = -Math.PI / 2;
    // 경기 선: 파란 바깥선·가운데선·원, 흰 배드민턴 선, 노란 제한 구역
    const blue = new THREE.MeshBasicMaterial({ color: 0x2f6fbf });
    const white = new THREE.MeshBasicMaterial({ color: 0xf6f4ee });
    const yellow = new THREE.MeshBasicMaterial({ color: 0xf2b134 });
    const line = (mat: THREE.Material, x: number, z: number, lw: number, ld: number) => {
      const m = this.add(new THREE.PlaneGeometry(lw, ld), mat, x, 0.006, z, { cast: false, receive: false });
      m.rotation.x = -Math.PI / 2;
    };
    const cx0 = 2.4, cx1 = 15.6, cz0 = -29.2, cz1 = -17.0, lw = 0.07;
    line(blue, (cx0 + cx1) / 2, cz0, cx1 - cx0, lw);
    line(blue, (cx0 + cx1) / 2, cz1, cx1 - cx0, lw);
    line(blue, cx0, (cz0 + cz1) / 2, lw, cz1 - cz0);
    line(blue, cx1, (cz0 + cz1) / 2, lw, cz1 - cz0);
    line(blue, (cx0 + cx1) / 2, -23.1, cx1 - cx0, lw);
    const ring = this.add(new THREE.RingGeometry(1.75, 1.82, 48), blue, 9, 0.006, -23.1, { cast: false, receive: false });
    ring.rotation.x = -Math.PI / 2;
    for (const [z0, z1] of [[-28.6, -24.0], [-22.2, -17.6]] as [number, number][]) {
      for (const x of [4.0, 14.0]) line(white, x, (z0 + z1) / 2, 0.05, z1 - z0);
      line(white, 9, z0, 10, 0.05);
      line(white, 9, z1, 10, 0.05);
    }
    // 양쪽 끝 반원 (노란 선)
    for (const [z, rot] of [[cz0, 0], [cz1, Math.PI]] as [number, number][]) {
      const arc = this.add(new THREE.RingGeometry(2.6, 2.67, 40, 1, 0, Math.PI), yellow, 9, 0.007, z, { cast: false, receive: false });
      arc.rotation.set(-Math.PI / 2, 0, rot);
    }
  }

  /** 벽: 아래 2.2m 나무 살 판벽, 위는 페인트 벽 (3m 위는 새로 세움), 무대 쪽 벽 연장 */
  private walls() {
    const P = 0.2;
    // 3m 위 벽 띠 (창 아래·위) — 창 사이 기둥은 highWindows
    for (const [x, dir] of [[X0 - 0.1, 1], [X1 + 0.1, -1]] as [number, number][]) {
      void dir;
      this.wallBox(P, 0.6, ZS - ZN + 0.4, x, 3.0, (ZS + ZN) / 2);
      this.wallBox(P, GYM_H - 5.6, ZS - ZN + 0.4, x, 5.6, (ZS + ZN) / 2);
    }
    this.wallBox(X1 - X0 + 0.4, GYM_H - 3.0, P, (X0 + X1) / 2, 3.0, ZS + 0.1); // 남쪽 위
    // 무대 쪽 연장 (z -34.7 ~ -30.1): 양옆·뒤 전체 높이
    for (const x of [X0 - 0.1, X1 + 0.1]) {
      this.wallBox(P, 3.0, -30.1 - (ZN - 0.1), x, 0, (-30.1 + ZN - 0.1) / 2);
      this.colliders.push({ ...aabb(x, (-30.1 + ZN - 0.1) / 2, P, -30.1 - ZN + 0.1), level: this.level });
    }
    this.wallBox(X1 - X0 + 0.4, GYM_H, P, (X0 + X1) / 2, 0, ZN - 0.1);
    this.colliders.push({ ...aabb((X0 + X1) / 2, ZN - 0.1, X1 - X0 + 0.4, P), level: this.level });
    // 나무 살 판벽 (경기장 둘레, 2.2m)
    const wh = 2.2;
    const runsX: [number, number, number, number][] = [
      [X1 - 0.01, ZS, STAGE_Z, -1],
      [X0 + 0.01, -24.0, ZS, 1],
      [X0 + 0.01, STAGE_Z, -28.0, 1],
    ];
    for (const [x, z0, z1, n] of runsX) this.slats(x, n, z0, z1, wh, true);
    for (const [x0, x1] of [[X0, 7.0], [11.0, X1]]) this.slats(ZS - 0.01, -1, x0, x1, wh, false);
  }

  private wallBox(w: number, h: number, d: number, x: number, y: number, z: number) {
    const m = this.box(w, h, d, this.plaster, x, y, z, true, TILE.plaster);
    this.blockers.push(m);
    return m;
  }

  /** 세로 나무 살 판벽: 판 + 0.12 간격 홈 (along: true = z 방향 벽) */
  private slats(p: number, n: number, a0: number, a1: number, h: number, alongZ: boolean) {
    const len = Math.abs(a1 - a0), c = (a0 + a1) / 2;
    if (alongZ) this.box(0.02, h, len, this.slat, p + n * 0.01, 0, c, false, TILE.oak);
    else this.box(len, h, 0.02, this.slat, c, 0, p + n * 0.01, false, TILE.oak);
    const groove = paint(0x8b6b4a, 0.8);
    const k = Math.floor(len / 0.6);
    for (let i = 1; i < k; i++) {
      const t = Math.min(a0, a1) + (i * len) / k;
      if (alongZ) this.box(0.024, h, 0.012, groove, p + n * 0.012, 0, t, false);
      else this.box(0.012, h, 0.024, groove, t, 0, p + n * 0.012, false);
    }
    // 위 띠
    if (alongZ) this.box(0.05, 0.05, len, this.slat, p + n * 0.025, h, c, false, TILE.oak);
    else this.box(len, 0.05, 0.05, this.slat, c, h, p + n * 0.025, false, TILE.oak);
  }

  /** 높은 창 (y 3.6~5.6) + 창 사이 기둥 + 커튼 */
  private highWindows(x: number, dir: 1 | -1) {
    const y0 = 3.6, y1 = 5.6, h = y1 - y0;
    const z0 = ZN + 0.3, z1 = ZS - 0.3, n = 7, bw = (z1 - z0) / n;
    const ry = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    for (let i = 0; i <= n; i++) this.wallBox(0.2, h, 0.34, x, y0, z0 + i * bw);
    this.wallBox(0.2, h, 0.34, x, y0, ZN - 0.05);
    this.wallBox(0.2, h, 0.34, x, y0, ZS + 0.05);
    for (let i = 0; i < n; i++) {
      const zc = z0 + (i + 0.5) * bw, ww = bw - 0.34;
      this.box(0.08, 0.05, ww, this.alu, x, y0, zc, false);
      this.box(0.08, 0.05, ww, this.alu, x, y1 - 0.05, zc, false);
      this.box(0.08, h, 0.05, this.alu, x, y0, zc, false);
      this.box(0.08, 0.04, ww, this.alu, x, y0 + h * 0.62, zc, false);
      const g = this.add(new THREE.PlaneGeometry(ww - 0.04, h - 0.1), this.glass, x, y0 + h / 2, zc, { cast: false, receive: false, ry });
      g.renderOrder = 2;
      this.blockers.push(g);
      // 묶어 둔 커튼 (창 양옆)
      for (const s of [-1, 1]) {
        const c = this.box(0.12, h + 0.35, 0.26, this.curtain, x + dir * 0.18, y0 - 0.15, zc + s * (ww / 2 - 0.1));
        c.castShadow = true;
      }
    }
    // 커튼 레일
    this.box(0.04, 0.04, z1 - z0, this.chrome, x + dir * 0.2, y1 + 0.22, (z0 + z1) / 2, false);
  }

  /** 무대: 나무 단 + 계단 + 막(커튼) + 액자 벽 + 교탁 + 국기 */
  private stage() {
    const xc = (X0 + X1) / 2, d = STAGE_Z - ZN, zc = (STAGE_Z + ZN) / 2;
    // 단
    this.box(X1 - X0, STAGE_H, d, paint(0x6b4a33, 0.6), xc, 0, zc);
    const top = this.box(X1 - X0, 0.02, d, pbr('oak', { color: 0xd9b48c, roughness: 0.45 }), xc, STAGE_H, zc, false, TILE.oak);
    top.receiveShadow = true;
    this.box(X1 - X0, STAGE_H - 0.1, 0.03, this.slat, xc, 0.05, STAGE_Z + 0.015, false, TILE.oak); // 앞판
    this.box(X1 - X0, 0.06, 0.06, paint(0x3a2a1e, 0.6), xc, STAGE_H - 0.05, STAGE_Z + 0.03, false); // 앞 모서리
    this.colliders.push({ ...aabb(xc, zc, X1 - X0, d), level: this.level });
    // 옆 계단 (장식)
    for (let i = 0; i < 4; i++) this.box(1.0, (STAGE_H / 4) * (i + 1), 0.3, paint(0x6b4a33, 0.6), 2.0, 0, STAGE_Z + 1.05 - i * 0.3);
    this.colliders.push({ ...aabb(2.0, STAGE_Z + 0.6, 1.0, 1.2), level: this.level });
    // 무대 액자 벽 (양옆 기둥 + 위 가림벽)
    const pz = STAGE_Z - 0.35;
    this.wallBox(2.2, GYM_H - STAGE_H, 0.3, X0 + 1.1, STAGE_H, pz);
    this.wallBox(2.2, GYM_H - STAGE_H, 0.3, X1 - 1.1, STAGE_H, pz);
    this.wallBox(X1 - X0 - 4.4, GYM_H - 4.9, 0.3, xc, 4.9, pz);
    // 막: 위 주름 가림막 + 양옆 묶은 큰 막
    const val = this.box(X1 - X0 - 4.4, 0.55, 0.12, this.curtain, xc, 4.35, pz + 0.22);
    val.castShadow = true;
    for (let i = 0; i < 24; i++) this.box(0.04, 0.55, 0.14, paint(0x6e1421, 0.95), X0 + 2.3 + i * ((X1 - X0 - 4.6) / 23), 4.35, pz + 0.22, false);
    for (const s of [-1, 1]) {
      const cx = xc + s * (X1 - X0 - 4.4) / 2 - s * 0.55;
      for (let k = 0; k < 4; k++) this.box(0.26, 4.35 - STAGE_H, 0.22, k % 2 ? paint(0x7a1826, 0.95) : this.curtain, cx - s * k * 0.2, STAGE_H, pz + 0.1 + (k % 2) * 0.05);
    }
    // 무대 뒤 벽: 학교 이름 현수막
    const ban = new CanvasTex(1024, 192);
    ban.draw((c, w, h) => {
      c.fillStyle = '#1f3b63';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffd166';
      c.fillRect(0, h - 14, w, 14);
      c.fillStyle = '#ffffff';
      c.font = font(92, true);
      c.textAlign = 'center';
      c.fillText(SCHOOL_NAME, w / 2, 120);
    });
    this.add(new THREE.PlaneGeometry(6.4, 1.2), ban.material(), xc, 3.3, ZN + 0.02, { cast: false });
    // 교탁
    const lect = pbr('oak', { color: 0xc9925f, roughness: 0.5 });
    this.box(0.9, 1.05, 0.55, lect, xc, STAGE_H, -31.6, true, TILE.oak);
    this.box(1.0, 0.05, 0.65, lect, xc, STAGE_H + 1.05, -31.6, true, TILE.oak);
    const mic = this.add(new THREE.CylinderGeometry(0.008, 0.008, 0.35, 6), this.chrome, xc + 0.25, STAGE_H + 1.25, -31.45, { cast: false });
    mic.rotation.x = 0.5;
    // 국기 깃대 (태극기 접힌 모양)
    this.add(new THREE.CylinderGeometry(0.02, 0.02, 2.3, 8), paint(0xd4af37, 0.3, 0.8), xc - 2.6, STAGE_H + 1.15, -33.6);
    const flag = this.box(0.04, 0.9, 0.22, paint(0xf7f7f5, 0.9), xc - 2.6, STAGE_H + 1.1, -33.5);
    void flag;
    // 무대 위 조명 봉
    this.box(X1 - X0 - 5, 0.08, 0.08, paint(0x2b2d31, 0.5), xc, 5.4, -31.2, false);
    for (let i = 0; i < 6; i++) {
      const sp = this.add(new THREE.CylinderGeometry(0.08, 0.11, 0.24, 10), paint(0x2b2d31, 0.5), xc - 3 + i * 1.2, 5.25, -31.2);
      sp.rotation.x = -0.6;
    }
  }

  /** 천장(6.5m) + 철골 트러스 + 고천장 등 */
  private roof() {
    const w = X1 - X0 + 0.4, d = ZS - ZN + 0.4, xc = (X0 + X1) / 2, zc = (ZS + ZN) / 2;
    const ceil = this.add(worldUV(new THREE.PlaneGeometry(w, d), w, d, 0, TILE.ceiling * 1.5), pbr('ceiling', { color: 0xf3f4f1, roughness: 0.95 }), xc, GYM_H - 0.002, zc, { cast: true });
    ceil.rotation.x = Math.PI / 2;
    this.blockers.push(ceil);
    // 트러스 (x 방향), 위·아래 현재 + 사선
    for (const z of [-17.9, -21.9, -25.9, -29.9]) {
      this.box(X1 - X0, 0.12, 0.12, this.steelBeam, xc, GYM_H - 0.14, z, false);
      this.box(X1 - X0, 0.1, 0.1, this.steelBeam, xc, GYM_H - 0.85, z, false);
      const n = 10;
      for (let i = 0; i < n; i++) {
        const x = X0 + ((i + 0.5) * (X1 - X0)) / n;
        const diag = this.add(new THREE.BoxGeometry(0.06, 0.82, 0.06), this.steelBeam, x, GYM_H - 0.48, z, { cast: false });
        diag.rotation.z = (i % 2 ? 1 : -1) * 0.9;
      }
    }
    // 고천장 등 (둥근 갓 + 빛나는 면)
    const lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e6, emissiveIntensity: 1.6 });
    lamp.userData.pbr = true; // 천장 등은 한 덩어리로 합쳐 그린다
    const shade = paint(0xe9ecef, 0.4, 0.5);
    for (const x of [4.6, 9.0, 13.4])
      for (const z of [-19.9, -23.9, -27.9]) {
        this.add(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 4), this.chrome, x, GYM_H - 0.45, z, { cast: false });
        this.add(new THREE.CylinderGeometry(0.12, 0.34, 0.24, 18, 1, true), shade, x, GYM_H - 1.02, z, { cast: false });
        const l = this.add(new THREE.CircleGeometry(0.32, 18), lamp, x, GYM_H - 1.13, z, { cast: false, receive: false });
        l.rotation.x = Math.PI / 2;
      }
  }

  /** 농구 골대 (양옆 벽 위) */
  private hoops() {
    const white = paint(0xf8f9fa, 0.3);
    const orange = paint(0xe8590c, 0.5, 0.4);
    for (const [x, dir] of [[X0 + 0.02, 1], [X1 - 0.02, -1]] as [number, number][]) {
      const z = -23.1;
      this.box(0.4, 0.08, 0.08, this.steelBeam, x + dir * 0.2, 3.95, z, false);
      this.box(0.04, 1.05, 1.8, white, x + dir * 0.42, 2.95, z);
      this.box(0.045, 0.45, 0.6, paint(0xe63946, 0.5), x + dir * 0.415, 3.05, z, false);
      this.box(0.046, 0.41, 0.56, white, x + dir * 0.416, 3.07, z, false);
      const rim = this.add(new THREE.TorusGeometry(0.23, 0.015, 6, 20), orange, x + dir * 0.7, 3.05, z);
      rim.rotation.x = Math.PI / 2;
    }
  }

  private courtAO() {
    const walls: [number, number, number, number, number][] = [
      [X0, (ZS + STAGE_Z) / 2, ZS - STAGE_Z, 1, 0],
      [X1, (ZS + STAGE_Z) / 2, ZS - STAGE_Z, -1, 0],
      [(X0 + X1) / 2, ZS, X1 - X0, 0, -1],
    ];
    for (const [x, z, len, nx, nz] of walls) {
      const wdt = 0.5;
      const m = this.add(new THREE.PlaneGeometry(len, wdt), aoMaterial(), x + (nx * wdt) / 2, 0.009, z + (nz * wdt) / 2, { cast: false, receive: false });
      m.rotation.order = 'YXZ';
      m.rotation.set(-Math.PI / 2, Math.atan2(nx, nz), 0);
    }
  }

  /** 바깥 껍데기 (높아진 강당·무대 동) */
  private exterior() {
    const ext = brickMat(); // 차분한 벽돌 (강당 동 포인트)
    const top = paint(0xe9e2d4, 0.8);
    const gy = -3.6, hh = GYM_H + 0.4 - gy;
    // 높은 창(3.6~5.6) 자리는 비운다
    const zl = ZS - ZN + 0.6, zcc = (ZS + ZN) / 2, topH = GYM_H + 0.4 - 5.6;
    this.box(0.12, 3.6 - gy, zl, ext, X1 + 0.27, gy, zcc, false, TILE_EXT.brick);
    this.box(0.12, topH, zl, ext, X1 + 0.27, 5.6, zcc, false, TILE_EXT.brick);
    this.box(0.12, 0.6, zl, ext, X0 - 0.27, 3.0, zcc, false, TILE_EXT.brick); // 공 창고 지붕 위부터
    this.box(0.12, topH, zl, ext, X0 - 0.27, 5.6, zcc, false, TILE_EXT.brick);
    this.box(0.12, 3.6, -28.7 - ZN, ext, X0 - 0.27, gy, (ZN - 28.6) / 2, false, TILE_EXT.brick);
    this.box(0.12, 3.0, -28.7 - ZN, ext, X0 - 0.27, 0, (ZN - 28.6) / 2, false, TILE_EXT.brick);
    this.box(X1 - X0 + 0.66, hh, 0.12, ext, (X0 + X1) / 2, gy, ZN - 0.27, false, TILE_EXT.brick);
    this.box(X1 - X0 + 0.7, 0.3, ZS - ZN + 0.7, top, (X0 + X1) / 2, GYM_H + 0.4, (ZS + ZN) / 2, false);
  }
}
