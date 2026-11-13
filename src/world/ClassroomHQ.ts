// 고품질 교실 (2층 6-1): 실제 한국 초등학교 교실처럼.
// - 나무 마루(CC0), 흡음 텍스 천장 + 사각 LED 평판등 + 천장형 냉난방기 + 천장 선풍기
// - 운동장 쪽 큰 창(알루미늄 미닫이 + 위 고정창 + 롤 블라인드), 나무 징두리 판벽
// - 앞면: 나무 판 위 전자칠판 + 양옆 화이트보드, 태극기·급훈·스피커, 나무 수납장
// - 뒷면: 개인 사물함(색 문 + 번호), 코르크 게시판
// - 창밖: 스탠드·구령대·모래 운동장·색깔 울타리·나무·아파트
// 교실 범위: x -7.0~7.0 (벽 안쪽 면), z -6.0~7.0, 바닥 y 0, 천장 3.
// 게임 로직이 쓰는 물건(objs, 충돌 상자, 자리)은 SchoolMap이 그대로 만든다. 여기서는 모습만.
import * as THREE from 'three';
import { aabb } from './Collision';
import { HQBuilder } from './hq';
import { TILE, aoMaterial, paint, pbr, worldUV } from './pbr';
import { CanvasTex, font } from './canvasTex';

const H = 3;
const X0 = -7.0, X1 = 7.0, Z0 = -6.0, Z1 = 7.0;

export class ClassroomBuilder extends HQBuilder {
  private alu = paint(0xe6e9ec, 0.32, 0.55);
  private wood = pbr('oak', { color: 0xf3e2c8, roughness: 0.62 });
  private laminateWhite = paint(0xf2eee6, 0.55);
  private fabric = paint(0xece3cf, 0.98);

  build() {
    this.y = 0;
    this.level = 1;
    this.floor();
    this.ceilingHQ();
    this.windowWall(-7.1, Z0, Z1);
    this.wainscot();
    this.corridorSide();
    this.frontWall();
    this.backWall();
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

  // ───────── 운동장 쪽 창문 벽 ─────────
  private windowWall(x: number, z0: number, z1: number) {
    const len = z1 - z0, zc = (z0 + z1) / 2;
    const plaster = pbr('plaster', { roughness: 0.9 });
    const sillY = 0.86, topY = 2.64;
    const sill = this.box(0.2, sillY, len + 0.2, plaster, x, 0, zc, true, TILE.plaster);
    const header = this.box(0.2, H - topY, len + 0.2, plaster, x, topY, zc, true, TILE.plaster);
    this.blockers.push(sill, header);
    this.colliders.push({ ...aabb(x, zc, 0.2, len), level: this.level });
    // 창 양끝 기둥(벽)
    for (const [za, zb] of [[z0, z0 + 0.15], [z1 - 0.15, z1]]) this.box(0.2, topY - sillY, zb - za, plaster, x, sillY, (za + zb) / 2, true, TILE.plaster);
    // 안쪽 창턱 (인조 대리석)
    this.box(0.3, 0.035, len - 0.3, paint(0xe9e6df, 0.4), x + 0.12, sillY, zc);
    // 바깥 창턱
    this.box(0.12, 0.04, len - 0.3, paint(0xbfc1bc, 0.6), x - 0.14, sillY - 0.04, zc, false);
    // 창틀: 5칸, 칸마다 아래 미닫이 두 장 + 위 고정창
    const wz0 = z0 + 0.15, wz1 = z1 - 0.15, wl = wz1 - wz0;
    const bays = 5, bw = wl / bays;
    const midY = 2.2;
    this.box(0.1, 0.05, wl, this.alu, x, sillY, (wz0 + wz1) / 2);
    this.box(0.1, 0.05, wl, this.alu, x, topY - 0.05, (wz0 + wz1) / 2);
    this.box(0.1, 0.06, wl, this.alu, x, midY - 0.03, (wz0 + wz1) / 2);
    for (let i = 0; i <= bays; i++) this.box(0.12, topY - sillY, 0.06, this.alu, x, sillY, wz0 + i * bw);
    const paneH = midY - 0.03 - sillY - 0.05;
    for (let i = 0; i < bays; i++) {
      const bz = wz0 + i * bw;
      // 위 고정창
      const up = this.add(new THREE.PlaneGeometry(bw - 0.06, topY - 0.05 - (midY + 0.03)), this.glass, x, (midY + 0.03 + topY - 0.05) / 2, bz + bw / 2, { cast: false, receive: false, ry: Math.PI / 2 });
      up.renderOrder = 2;
      this.blockers.push(up);
      // 아래 미닫이 두 장 (안쪽·바깥쪽 레일)
      for (const k of [0, 1]) {
        const sx = x + (k ? 0.028 : -0.028);
        const sw = bw * 0.52;
        const cz = k ? bz + bw - sw / 2 : bz + sw / 2;
        const y0 = sillY + 0.05;
        this.box(0.035, 0.04, sw, this.alu, sx, y0, cz);
        this.box(0.035, 0.04, sw, this.alu, sx, y0 + paneH - 0.04, cz);
        this.box(0.035, paneH, 0.04, this.alu, sx, y0, cz - sw / 2 + 0.02);
        this.box(0.035, paneH, 0.04, this.alu, sx, y0, cz + sw / 2 - 0.02);
        const p = this.add(new THREE.PlaneGeometry(sw - 0.06, paneH - 0.07), this.glass, sx, y0 + paneH / 2, cz, { cast: false, receive: false, ry: Math.PI / 2 });
        p.renderOrder = 2;
        this.blockers.push(p);
        // 잠금 손잡이
        this.box(0.03, 0.09, 0.025, this.chrome, sx + 0.03, y0 + paneH * 0.45, k ? cz - sw / 2 + 0.06 : cz + sw / 2 - 0.06, false);
      }
      // 롤 블라인드: 칸마다 내려온 길이가 다름
      const drop = [0.42, 0.95, 0.3, 0.7, 0.18][i];
      const bx = x + 0.2;
      const roll = this.add(new THREE.CylinderGeometry(0.04, 0.04, bw - 0.08, 10), this.laminateWhite, bx, topY + 0.1, bz + bw / 2);
      roll.rotation.x = Math.PI / 2;
      this.box(0.012, drop, bw - 0.14, this.fabric, bx, topY + 0.06 - drop, bz + bw / 2);
      this.box(0.02, 0.025, bw - 0.12, this.alu, bx, topY + 0.05 - drop, bz + bw / 2, false); // 아래 무게 막대
      // 줄
      this.box(0.006, 0.9, 0.006, paint(0xd8d2c4, 0.9), bx + 0.01, topY - 0.9, bz + bw - 0.12, false);
    }
    // 블라인드 박스 (천장 아래 길게)
    this.box(0.14, 0.12, len - 0.1, this.laminateWhite, x + 0.2, topY + 0.04, zc, false);
  }

  /** 나무 징두리 판벽 (벽 아래 0.95m) + 띠 */
  private wainscot() {
    const h = 0.95;
    const runs: [number, number, number, number, number][] = [
      // x, z, 길이, 방향(0: z를 따라, 1: x를 따라), 안쪽 법선 부호
      [X1 - 0.008, (-3.7 + 4.5) / 2, 4.5 + 3.7, 0, -1], // 복도 쪽 (두 문 사이)
      [X1 - 0.008, 6.6, 0.8, 0, -1], // 뒷문 뒤
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

  /** 복도 쪽 벽 안쪽: 나무틀 위창(반투명) + 문틀 */
  private corridorSide() {
    const x = X1 - 0.03;
    const y0 = 2.0, h = 0.72;
    for (const [z0, z1] of [[-3.4, 4.2]] as [number, number][]) {
      const len = z1 - z0, zc = (z0 + z1) / 2;
      this.box(0.06, 0.06, len, this.wood, x, y0, zc, false, TILE.oak);
      this.box(0.06, 0.06, len, this.wood, x, y0 + h - 0.06, zc, false, TILE.oak);
      const n = Math.round(len / 1.1);
      for (let i = 0; i <= n; i++) this.box(0.06, h, 0.05, this.wood, x, y0, z0 + (i * len) / n, false, TILE.oak);
      const frostIn = paint(0xe4ebee, 0.3);
      for (let i = 0; i < n; i++) this.add(new THREE.PlaneGeometry(len / n - 0.06, h - 0.1), frostIn, x - 0.005, y0 + h / 2, z0 + ((i + 0.5) * len) / n, { cast: false, ry: -Math.PI / 2 });
    }
    // 문틀 (안쪽)
    for (const [z0, z1] of [[-5.4, -3.8], [4.6, 6.2]]) {
      const zc = (z0 + z1) / 2, w = z1 - z0;
      this.box(0.05, 0.08, w + 0.16, this.wood, X1 - 0.02, 2.1, zc, false, TILE.oak);
      this.box(0.05, 2.1, 0.08, this.wood, X1 - 0.02, 0, z0 - 0.04, false, TILE.oak);
      this.box(0.05, 2.1, 0.08, this.wood, X1 - 0.02, 0, z1 + 0.04, false, TILE.oak);
    }
    // 스위치·인터폰
    this.box(0.02, 0.12, 0.08, this.laminateWhite, X1 - 0.01, 1.2, -3.55, false);
    this.box(0.03, 0.22, 0.14, paint(0xdedfda, 0.5), X1 - 0.015, 1.35, -2.95, false);
  }

  // ───────── 앞면: 칠판 벽 ─────────
  private frontWall() {
    const z = Z0;
    // 나무 판 뒷벽 (칠판·보드가 붙는 면)
    this.box(8.1, 2.0, 0.025, this.wood, 0, 0.7, z + 0.0125, false, TILE.oak);
    this.box(8.2, 0.05, 0.05, this.wood, 0, 2.7, z + 0.025, false, TILE.oak);
    // 양옆 화이트보드 (알루미늄 틀 + 반짝이는 흰 면 + 펜 받침)
    const wb = paint(0xfbfbfa, 0.12);
    for (const bx of [-2.95, 2.95]) {
      this.box(1.9, 1.35, 0.03, this.alu, bx, 0.95, z + 0.04, false);
      const s = this.add(new THREE.PlaneGeometry(1.84, 1.29), wb, bx, 0.95 + 0.675, z + 0.056, { cast: false });
      void s;
      this.box(1.7, 0.03, 0.07, this.alu, bx, 0.92, z + 0.07);
      // 자석·종이
      for (const [dx, dy, c] of [[-0.6, 0.45, 0xffd166], [0.5, 0.3, 0xa0d2eb]] as [number, number, number][]) this.add(new THREE.PlaneGeometry(0.21, 0.28), paint(c, 0.9), bx + dx, 0.95 + 0.675 + dy, z + 0.058, { cast: false });
    }
    // 태극기 액자
    this.box(0.76, 0.54, 0.03, this.wood, 0, 2.45, z + 0.04, false, TILE.oak);
    // 급훈 액자
    const motto = new CanvasTex(512, 128);
    motto.draw((c, w, h) => {
      c.fillStyle = '#fffdf6';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#7a5230';
      c.font = font(30, true);
      c.textAlign = 'center';
      c.fillText('급 훈', w / 2, 38);
      c.fillStyle = '#2b2d42';
      c.font = font(46, true);
      c.fillText('서로 돕고 함께 웃자', w / 2, 100);
    });
    this.box(1.5, 0.4, 0.03, this.wood, 3.2, 2.42, z + 0.04, false, TILE.oak);
    this.add(new THREE.PlaneGeometry(1.4, 0.32), motto.material(), 3.2, 2.62, z + 0.057, { cast: false });
    // 스피커
    this.rbox(0.36, 0.26, 0.14, paint(0xece9e2, 0.55), -3.4, 2.5, z + 0.08, 0.02);
    this.box(0.28, 0.18, 0.005, paint(0x6c6f73, 0.8), -3.4, 2.54, z + 0.152, false);
    // 앞 수납장: 흰 몸통 + 나무 문 + 손잡이 + 상판
    const n = 8, cw = 0.92, x0 = -3.22 - cw / 2;
    this.box(n * cw, 0.68, 0.42, this.laminateWhite, x0 + (n * cw) / 2, 0.02, z + 0.21);
    for (let i = 0; i < n; i++) {
      const cx = x0 + cw * (i + 0.5);
      this.box(cw - 0.02, 0.6, 0.02, this.wood, cx, 0.06, z + 0.43, false, TILE.oak);
      this.box(0.12, 0.02, 0.025, this.chrome, cx + (i % 2 ? -0.3 : 0.3), 0.56, z + 0.45, false);
    }
    this.box(n * cw + 0.04, 0.03, 0.46, paint(0xe2ddd3, 0.45), x0 + (n * cw) / 2, 0.7, z + 0.23);
  }

  // ───────── 뒷면: 사물함·게시판 ─────────
  private backWall() {
    // 사물함 위 상판 + 소품
    this.box(12.1, 0.03, 0.54, pbr('oak', { color: 0xf3e2c8, roughness: 0.55 }), 0, 1.14, 6.66, true, TILE.oak);
    const pot = paint(0xd9805f, 0.8), leaf = paint(0x4f8a3c, 0.85);
    for (const px of [-5.2, -1.4, 4.9]) {
      this.add(new THREE.CylinderGeometry(0.1, 0.08, 0.18, 12), pot, px, 1.26, 6.7);
      const l = this.add(new THREE.IcosahedronGeometry(0.17, 1), leaf, px, 1.45, 6.7);
      l.scale.y = 0.8;
    }
    // 책 꽂이 상자
    const bookColors = [0xe76f51, 0x2a9d8f, 0xe9c46a, 0x264653, 0xf4a261, 0x8ab17d];
    for (let i = 0; i < 9; i++) this.box(0.045, 0.24 + (i % 3) * 0.02, 0.18, paint(bookColors[i % 6], 0.7), 1.0 + i * 0.05, 1.155, 6.7, true);
    this.box(0.5, 0.2, 0.22, paint(0x4ea8de, 0.6), 2.3, 1.155, 6.7);
    // 게시판 나무 테두리 (판은 SchoolMap 물건: exhibitBoard)
    for (const [bx, w] of [[-3.6, 3.2], [3.6, 2.0]] as [number, number][]) {
      this.box(w + 0.1, 0.05, 0.05, this.wood, bx, 1.33, 6.955, false, TILE.oak);
      this.box(w + 0.1, 0.05, 0.05, this.wood, bx, 2.7, 6.955, false, TILE.oak);
      this.box(0.05, 1.42, 0.05, this.wood, bx - w / 2 - 0.025, 1.33, 6.955, false, TILE.oak);
      this.box(0.05, 1.42, 0.05, this.wood, bx + w / 2 + 0.025, 1.33, 6.955, false, TILE.oak);
    }
    // 게시판 위 그림·안내문 (압정)
    const papers: [number, number, number, number][] = [[-4.7, 2.2, 0xfff3c4, 0.03], [-4.1, 1.75, 0xd6f0ff, -0.05], [-2.6, 2.25, 0xffe0e9, 0.04], [-2.2, 1.7, 0xe3f5d8, -0.02]];
    for (const [px, py, c, r] of papers) {
      const p = this.add(new THREE.PlaneGeometry(0.42, 0.32), paint(c, 0.9), px, py, 6.918, { cast: false, ry: Math.PI });
      p.rotation.z = r;
      this.add(new THREE.SphereGeometry(0.012, 6, 4), paint(0xe63946, 0.4), px, py + 0.13, 6.91, { cast: false });
    }
    // 시간표 액자 (뒤 오른쪽 위)
    const tt = new CanvasTex(256, 192);
    tt.draw((c, w, h) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#3a86ff';
      c.fillRect(0, 0, w, 30);
      c.fillStyle = '#fff';
      c.font = font(20, true);
      c.textAlign = 'center';
      c.fillText('6-1 시간표', w / 2, 22);
      c.strokeStyle = '#ced4da';
      for (let i = 0; i <= 5; i++) {
        c.beginPath();
        c.moveTo((i * w) / 5, 30);
        c.lineTo((i * w) / 5, h);
        c.stroke();
      }
      for (let j = 0; j <= 6; j++) {
        c.beginPath();
        c.moveTo(0, 30 + (j * (h - 30)) / 6);
        c.lineTo(w, 30 + (j * (h - 30)) / 6);
        c.stroke();
      }
      const subj = ['국어', '수학', '사회', '과학', '영어', '체육', '미술', '음악'];
      c.fillStyle = '#495057';
      c.font = font(13);
      for (let i = 0; i < 5; i++) for (let j = 0; j < 6; j++) c.fillText(subj[(i * 3 + j * 5) % 8], ((i + 0.5) * w) / 5, 30 + ((j + 0.7) * (h - 30)) / 6);
    });
    this.box(0.86, 0.66, 0.025, this.wood, 6.1, 1.9, 6.985, false);
    this.add(new THREE.PlaneGeometry(0.8, 0.6), tt.material(), 6.1, 2.23, 6.968, { cast: false, ry: Math.PI });
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
