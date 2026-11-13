// 1층 방 꾸미기: 넓은 현관(실내화 신발장), 교무실, 보건실. 벽·문 자리는 SchoolMap.buildFirstFloor.
// 좌표: 1층 바닥 y = FLOOR1_Y. 현관 x 11.1~18.0 z -4.5~1.0 / 교무실 x 11.1~14.9 z 1.0~8.0 / 보건실 z 8.0~12.0
import * as THREE from 'three';
import { aabb } from './Collision';
import { CanvasTex, font } from './canvasTex';
import { HQBuilder } from './hq';
import { TILE, aoMaterial, paint, pbr, worldUV } from './pbr';
import { CEIL_H, FLOOR1_Y } from './rooms';

export const LOBBY = { x0: 11.1, x1: 18.0, z0: -4.5, z1: 1.0, doorZ0: -2.6, doorZ1: -0.4 };
export const OFFICE = { x0: 11.2, x1: 14.8, z0: 1.1, z1: 7.9, doorZ: 3.0 };
export const NURSE = { x0: 11.2, x1: 14.8, z0: 8.1, z1: 11.9, doorZ: 10.0 };

export class FirstFloorBuilder extends HQBuilder {
  private wood = pbr('oak', { color: 0xf3e2c8, roughness: 0.55 });

  build() {
    this.y = FLOOR1_Y;
    this.level = 0;
    this.lobby();
    this.office();
    this.nurse();
  }

  private room(x0: number, x1: number, z0: number, z1: number, floorMat: THREE.Material, tile: number, lamps: [number, number][]) {
    const w = x1 - x0, d = z1 - z0, xc = (x0 + x1) / 2, zc = (z0 + z1) / 2;
    const f = this.add(worldUV(new THREE.PlaneGeometry(w, d), w, d, 0, tile), floorMat, xc, 0.004, zc, { cast: false });
    f.rotation.x = -Math.PI / 2;
    const c = this.add(worldUV(new THREE.PlaneGeometry(w, d), w, d, 0, TILE.ceiling), pbr('ceiling', { roughness: 0.95 }), xc, CEIL_H - 0.002, zc, { cast: true });
    c.rotation.x = Math.PI / 2;
    this.blockers.push(c);
    const led = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfffbf2, emissiveIntensity: 1.3, roughness: 0.5 });
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

  // ───────── 현관: 돌 타일, 실내화 신발장, 발판, 유리문 ─────────
  private lobby() {
    const L = LOBBY;
    this.room(L.x0, L.x1, L.z0, L.z1, pbr('terrazzo', { color: 0xc9c2b4, roughness: 0.7 }), TILE.terrazzo, [[12.6, -1.75], [15.2, -1.75], [17.0, -1.75]]);
    // 실내화 신발장: 칸칸이 (4단 × 5칸), 남·북 벽을 따라
    const unit = (x: number, z: number, facing: 1 | -1) => {
      const W = 1.2, H = 1.25, Dp = 0.36;
      this.solid(W, H, Dp, this.wood, x, 0, z);
      const inner = paint(0x6b5a48, 0.9);
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 5; c++) {
          const cx = x - W / 2 + 0.12 + c * 0.24, cy = 0.12 + r * 0.29;
          this.box(0.2, 0.24, 0.02, inner, cx, cy, z + facing * (Dp / 2 - 0.012), false);
          if ((r * 5 + c) % 3 !== 1) {
            // 실내화 한 켤레 (흰 고무 + 색 띠)
            const col = [0x4ea8de, 0xef476f, 0x06d6a0, 0xffd166][(r + c) % 4];
            for (const dx of [-0.045, 0.045]) {
              this.box(0.07, 0.05, 0.2, paint(0xf4f4f2, 0.6), cx + dx, cy + 0.005, z + facing * 0.04, false);
              this.box(0.072, 0.02, 0.06, paint(col, 0.5), cx + dx, cy + 0.05, z + facing * 0.06, false);
            }
          }
        }
    };
    for (let i = 0; i < 5; i++) unit(11.8 + i * 1.25, L.z0 + 0.2, 1);
    for (let i = 0; i < 2; i++) unit(15.9 + i * 1.25, L.z1 - 0.2, -1);
    // 우산꽂이·발판
    this.add(new THREE.CylinderGeometry(0.16, 0.14, 0.5, 14), paint(0x8d99ae, 0.4, 0.6), 17.6, 0.25, 0.55);
    const mat = this.add(new THREE.PlaneGeometry(1.6, 2.4), paint(0x3d4b5c, 0.98), 17.0, 0.008, -1.5, { cast: false });
    mat.rotation.x = -Math.PI / 2;
    this.poster(['실내화로 갈아 신어요', '바깥 신발은 신발장에', '복도에서는 천천히 걸어요'], 1.0, 0.62, 14.1, 1.65, L.z1 - 0.02, Math.PI, '#2a9d8f');
  }

  // ───────── 교무실: 선생님 책상 네 개(마주 보기), 서류함, 일정 칠판, 복사기 ─────────
  private office() {
    const O = OFFICE;
    this.room(O.x0 - 0.1, O.x1 + 0.1, O.z0 - 0.1, O.z1 + 0.1, pbr('laminate', { color: 0xe8e0d4, roughness: 0.6 }), TILE.laminate, [[13.0, 2.6], [13.0, 6.2]]);
    const grey = paint(0x9aa1a8, 0.5, 0.3);
    const screenMat = paint(0x1b1e22, 0.3);
    for (const [x, z, face] of [[12.6, 4.6, 1], [13.8, 4.6, 1], [12.6, 5.6, -1], [13.8, 5.6, -1]] as [number, number, number][]) {
      this.box(1.1, 0.72, 0.68, grey, x, 0, z);
      this.box(1.14, 0.03, 0.72, this.wood, x, 0.72, z);
      this.box(0.5, 0.32, 0.03, screenMat, x, 0.85, z + face * 0.18);
      this.box(0.06, 0.12, 0.06, grey, x, 0.75, z + face * 0.2);
      // 의자
      this.rbox(0.45, 0.06, 0.45, paint(0x2b2d42, 0.6), x, 0.45, z - face * 0.62, 0.02);
      this.rbox(0.45, 0.45, 0.06, paint(0x2b2d42, 0.6), x, 0.5, z - face * 0.85, 0.02);
      this.box(0.05, 0.45, 0.05, this.chrome, x, 0, z - face * 0.62, false);
      // 서류 더미
      this.box(0.3, 0.06, 0.22, paint(0xf8f9fa, 0.9), x + 0.35, 0.75, z - face * 0.1, false);
    }
    this.colliders.push({ ...aabb(13.2, 5.1, 2.4, 1.4), level: this.level });
    // 서류함 (북쪽 벽)
    for (let i = 0; i < 3; i++) {
      this.solid(0.9, 1.3, 0.5, paint(0xd5d9dd, 0.45, 0.4), 12.0 + i * 0.95, 0, O.z1 - 0.28);
      for (let k = 0; k < 3; k++) this.box(0.25, 0.03, 0.02, this.chrome, 12.0 + i * 0.95, 0.3 + k * 0.4, O.z1 - 0.52, false);
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

  // ───────── 보건실: 침대 둘(커튼), 약장, 세면대, 키·몸무게 재기 ─────────
  private nurse() {
    const N = NURSE;
    this.room(N.x0 - 0.1, N.x1 + 0.1, N.z0 - 0.1, N.z1 + 0.1, pbr('floorTile', { color: 0xe9eef0, roughness: 0.55 }), TILE.floorTile, [[13.0, 10.0]]);
    const white = paint(0xf8f9fa, 0.5);
    for (const z of [8.75, 10.65]) {
      this.solid(1.9, 0.5, 0.9, this.chrome, 13.8, 0, z);
      this.box(1.85, 0.14, 0.86, white, 13.8, 0.5, z);
      this.box(0.4, 0.1, 0.6, paint(0xdbe9f6, 0.8), 14.5, 0.64, z);
      this.box(1.2, 0.03, 0.88, paint(0x9fd3c7, 0.85), 13.5, 0.645, z);
      // 커튼 레일 + 반쯤 친 커튼
      this.box(0.03, 0.03, 1.0, this.chrome, 12.75, 2.35, z, false);
      const cur = this.box(0.04, 1.75, 0.5, paint(0xbfe3da, 0.95), 12.78, 0.55, z - 0.25);
      cur.castShadow = true;
    }
    // 약장 (유리문) — 남쪽 벽
    this.solid(1.5, 1.8, 0.4, white, 12.2, 0, N.z0 + 0.25);
    for (let k = 0; k < 3; k++) {
      this.box(1.4, 0.02, 0.36, paint(0xdee2e6, 0.5), 12.2, 0.45 + k * 0.45, N.z0 + 0.25, false);
      for (let i = 0; i < 6; i++) this.box(0.1, 0.16, 0.08, paint([0xef476f, 0x4ea8de, 0x06d6a0][i % 3], 0.5), 11.65 + i * 0.22, 0.47 + k * 0.45, N.z0 + 0.25, false);
    }
    const glass = this.add(new THREE.PlaneGeometry(1.4, 1.6), this.glass, 12.2, 0.95, N.z0 + 0.455, { cast: false });
    glass.renderOrder = 2;
    // 세면대 + 키 재기
    this.solid(0.6, 0.85, 0.45, white, 11.6, 0, N.z1 - 0.3);
    this.add(new THREE.PlaneGeometry(0.5, 0.6), paint(0xdfe6ea, 0.04, 1.0), 11.6, 1.45, N.z1 - 0.06, { cast: false, ry: Math.PI });
    this.box(0.08, 2.0, 0.08, this.alu, 12.5, 0, N.z1 - 0.12);
    this.box(0.5, 0.05, 0.5, white, 12.5, 0, N.z1 - 0.35, false);
    this.poster(['시력 검사표', 'ㅁ ㅇ ㅅ ㄱ', 'ㄴ ㄷ ㄹ ㅂ ㅈ', 'ㅊ ㅋ ㅌ ㅍ ㅎ ㅇ'], 0.6, 0.9, 11.25, 1.5, 10.6, Math.PI / 2, '#e63946');
  }
}
