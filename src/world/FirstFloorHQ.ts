// 1층 방 꾸미기: 넓은 현관(실내화 신발장), 교무실, 보건실. 벽·문 자리는 SchoolMap.buildFirstFloor.
// 좌표: 1층 바닥 y = FLOOR1_Y. 현관 x 11.1~18.0 z -4.5~1.0 / 교무실 x 11.1~14.9 z 1.0~8.0 / 보건실 z 8.0~12.0
import * as THREE from 'three';
import { aabb } from './Collision';
import { CanvasTex, font } from './canvasTex';
import { HQBuilder } from './hq';
import { TILE, aoMaterial, paint, pbr, worldUV } from './pbr';
import { CEIL_H, FLOOR1_Y } from './rooms';
import { SCHOOL_NAME } from '../data/school';
import { TILE_EXT, graniteMat } from './exteriorTex';

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

  // ───────── 현관: 바깥 신발 구역(화강석) | 실내화 구역(테라조), 학년별 신발장, 안내도·소식 게시판, 방향 표지판 ─────────
  private lobby() {
    const L = LOBBY;
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

    // 학년별 실내화 신발장: 칸이 뚫린 나무 신발장 (5칸 × 4단), 위에 학년 이름표
    const inner = paint(0xe7dcc8, 0.8), base = paint(0x5c5f63, 0.6);
    const unit = (x: number, z: number, facing: 1 | -1, label: string) => {
      const W = 1.2, H = 1.25, D = 0.36, t = 0.022;
      this.colliders.push({ ...aabb(x, z, W, D), level: this.level });
      const front = z + (facing * D) / 2, back = z - (facing * D) / 2;
      this.box(W, 0.07, D, base, x, 0, z, false);
      this.box(W, t, D, this.wood, x, H - t, z, false, TILE.oak);
      for (const sx of [-1, 1]) this.box(t, H - 0.07, D, this.wood, x + sx * (W / 2 - t / 2), 0.07, z, false, TILE.oak);
      this.box(W - 2 * t, H - 0.07 - t, 0.012, inner, x, 0.07, back + facing * 0.006, false);
      const rows = 4, cols = 5, rowH = (H - 0.07 - t) / rows, colW = (W - 2 * t) / cols;
      for (let r = 1; r < rows; r++) this.box(W - 2 * t, 0.016, D - 0.03, this.wood, x, 0.07 + r * rowH - 0.008, z + facing * 0.012, false);
      for (let c = 1; c < cols; c++) this.box(0.016, H - 0.07 - t, D - 0.03, this.wood, x - W / 2 + t + c * colW, 0.07, z + facing * 0.012, false);
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          if ((r * 5 + c + label.length) % 4 === 1) continue; // 빈 칸 (이미 신고 들어간 친구)
          const cx = x - W / 2 + t + (c + 0.5) * colW, cy = 0.07 + r * rowH + 0.008;
          const col = [0x4ea8de, 0xef476f, 0x06d6a0, 0xffd166, 0x9b5de5][(r + c * 2) % 5];
          for (const dx of [-0.045, 0.045]) {
            this.box(0.07, 0.045, 0.22, paint(0xf4f4f2, 0.6), cx + dx, cy, front - facing * 0.15, false);
            this.box(0.072, 0.022, 0.07, paint(col, 0.5), cx + dx, cy + 0.045, front - facing * 0.08, false);
          }
        }
      // 학년 이름표
      const tag = new CanvasTex(256, 64);
      tag.draw((c, w, h) => {
        c.fillStyle = '#2f6b4f';
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#fff';
        c.font = font(36, true);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(label, w / 2, h / 2 + 2);
      });
      this.add(new THREE.PlaneGeometry(0.44, 0.11), tag.material(), x, H + 0.075, front - facing * 0.01, { cast: false, ry: facing > 0 ? 0 : Math.PI });
      this.box(0.46, 0.13, 0.015, base, x, H + 0.01, front - facing * 0.02, false);
    };
    const grades = ['1학년', '2학년', '3학년', '4학년', '5학년', '6학년', '손님용'];
    for (let i = 0; i < 5; i++) unit(11.8 + i * 1.25, L.z0 + 0.28, 1, grades[i]);
    for (let i = 0; i < 2; i++) unit(15.9 + i * 1.25, L.z1 - 0.28, -1, grades[5 + i]);
    // 우산꽂이 (문 옆)
    this.add(new THREE.CylinderGeometry(0.16, 0.14, 0.5, 14), paint(0x8d99ae, 0.4, 0.6), 17.72, 0.25, -3.75);
    for (let i = 0; i < 3; i++) this.add(new THREE.CylinderGeometry(0.012, 0.012, 0.75, 6), paint([0x1d3557, 0xe63946, 0xffc300][i], 0.5), 17.68 + i * 0.04, 0.45, -3.78 + i * 0.03);

    // 북쪽 벽: 학교 안내도 (알루미늄 액자) + 우리 학교 소식 게시판 + 긴 의자
    const wallZ = L.z1 - 0.1;
    this.framed(this.guideMap(), 1.5, 0.95, 12.05, 1.62, wallZ);
    this.framed(this.newsBoard(), 1.9, 1.07, 14.2, 1.6, wallZ);
    // 긴 의자 (신발 갈아 신을 때 앉는 곳)
    const bx = 14.2, bz = wallZ - 0.22;
    this.box(1.6, 0.04, 0.34, this.wood, bx, 0.4, bz, true, TILE.oak);
    for (const dx of [-0.7, 0.7]) this.box(0.05, 0.4, 0.3, paint(0x6b7076, 0.4, 0.6), bx + dx, 0, bz, false);
    this.colliders.push({ ...aabb(bx, bz, 1.6, 0.34), level: this.level });
    // 남쪽 벽 (신발장 위): 안내문 두 장
    this.poster(['실내화로 갈아 신어요', '바깥 신발은 신발장에', '복도에서는 천천히 걸어요'], 1.0, 0.62, 13.0, 1.72, L.z0 + 0.11, 0, '#2a9d8f');
    this.poster(['비 오는 날', '우산은 우산꽂이에', '젖은 신발은 털고 들어와요'], 0.9, 0.56, 15.6, 1.72, L.z0 + 0.11, 0, '#457b9d');
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
      floor('2층', 92, [['강당', '#cdb4db', 100], ['6-1', '#ffd6a5', 82], ['5-1', '#fdffb6', 82], ['4-1', '#caffbf', 82], ['도서관', '#9bf6ff', 100], ['방송실', '#bdb2ff', 100], ['급식실 위', '#e9ecef', 106]]);
      floor('1층', 200, [['1-1', '#ffd6a5', 82], ['2-1', '#fdffb6', 82], ['3-1', '#caffbf', 82], ['현관', '#ffadad', 92], ['교무실', '#a0c4ff', 96], ['행정실', '#a0c4ff', 96], ['급식실', '#ffc6ff', 122]]);
      // 현재 위치
      c.fillStyle = '#e63946';
      c.beginPath();
      c.arc(92 + 82 * 3 + 46, 316, 13, 0, Math.PI * 2);
      c.fill();
      c.font = font(22, true);
      c.textAlign = 'left';
      c.fillText('지금 여기', 92 + 82 * 3 + 64, 318);
      c.fillStyle = '#243447';
      c.font = font(24, true);
      c.fillText('▶ 계단: 현관에서 복도로 나가 바로 오른쪽(남쪽)', 28, 380);
      c.fillText('▶ 6학년 교실: 계단으로 2층 → 복도 가운데', 28, 420);
      c.fillStyle = '#6c757d';
      c.font = font(20);
      c.fillText('보건실은 교무실 옆 · 과학실은 1층 복도 끝', 28, 458);
    });
    return t;
  }

  /** 코르크 게시판: 이번 주 급식 · 6학년 시간표 · 알림 · 그림 */
  private newsBoard(): CanvasTex {
    const t = new CanvasTex(960, 540);
    t.draw((c, w, h) => {
      c.fillStyle = '#c99a63';
      c.fillRect(0, 0, w, h);
      let r = 5;
      const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 2600; i++) {
        c.fillStyle = rnd() < 0.5 ? 'rgba(120,80,40,0.35)' : 'rgba(235,200,150,0.35)';
        c.fillRect(rnd() * w, rnd() * h, 2, 2);
      }
      c.fillStyle = '#2f6b4f';
      c.fillRect(0, 0, w, 64);
      c.fillStyle = '#fff';
      c.font = font(36, true);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('우리 학교 소식', w / 2, 34);
      const paper = (x: number, y: number, pw: number, ph: number, head: string, headCol: string, lines: string[], rot: number, size = 22) => {
        c.save();
        c.translate(x + pw / 2, y + ph / 2);
        c.rotate(rot);
        c.fillStyle = 'rgba(0,0,0,0.18)';
        c.fillRect(-pw / 2 + 5, -ph / 2 + 6, pw, ph);
        c.fillStyle = '#ffffff';
        c.fillRect(-pw / 2, -ph / 2, pw, ph);
        c.fillStyle = headCol;
        c.fillRect(-pw / 2, -ph / 2, pw, 44);
        c.fillStyle = '#fff';
        c.font = font(25, true);
        c.textAlign = 'center';
        c.fillText(head, 0, -ph / 2 + 23);
        c.fillStyle = '#243447';
        c.font = font(size);
        c.textAlign = 'left';
        lines.forEach((l, i) => c.fillText(l, -pw / 2 + 16, -ph / 2 + 74 + i * (size + 12)));
        c.fillStyle = '#e63946';
        c.beginPath();
        c.arc(0, -ph / 2 + 8, 7, 0, Math.PI * 2);
        c.fill();
        c.restore();
      };
      paper(24, 88, 330, 250, '이번 주 급식', '#e76f51', ['월  돈가스 ★ · 미역국', '화  카레라이스 · 깍두기', '수  짜장밥 · 탕수육', '목  비빔밥 · 미역국', '금  스파게티 · 마늘빵'], -0.02);
      paper(382, 92, 300, 262, '6학년 월요일', '#457b9d', ['1교시  국어', '2교시  수학', '3교시  모둠 활동', '4교시  미술', '점심  급식 (12:10)', '5교시  체육'], 0.015, 21);
      paper(712, 88, 222, 200, '알림', '#2a9d8f', ['실내화 꼭 신기', '복도에서 천천히', '분실물은 교무실'], 0.03);
      paper(712, 312, 222, 196, '그림 대회', '#9b5de5', ['주제: 우리 학교', '마감: 금요일', '1층 복도 전시'], -0.025);
      paper(40, 366, 300, 150, '도서관', '#f4a261', ['점심시간에 열어요', '책 2권까지 빌려요'], 0.02);
      // 아이 그림 (해·집)
      c.save();
      c.translate(392, 380);
      c.rotate(-0.02);
      c.fillStyle = '#fff';
      c.fillRect(0, 0, 290, 140);
      c.fillStyle = '#ffd166';
      c.beginPath();
      c.arc(240, 40, 26, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#ef476f';
      c.fillRect(40, 70, 90, 60);
      c.fillStyle = '#118ab2';
      c.beginPath();
      c.moveTo(30, 72);
      c.lineTo(85, 30);
      c.lineTo(140, 72);
      c.fill();
      c.fillStyle = '#06d6a0';
      c.fillRect(0, 128, 290, 12);
      c.restore();
    });
    return t;
  }

  /** 천장에 매단 방향 표지판 (현관에서 복도 쪽을 볼 때 읽힘) */
  private directionSign(x: number, y: number, z: number) {
    const W = 2.6, H = 0.34;
    this.box(0.05, H, W, paint(0x2f6b4f, 0.5), x, y, z, false);
    for (const dz of [-W / 2 + 0.2, W / 2 - 0.2]) this.add(new THREE.CylinderGeometry(0.008, 0.008, CEIL_H - y - H, 6), this.chrome, x, y + H + (CEIL_H - y - H) / 2, z + dz, { cast: false });
    const t = new CanvasTex(1024, 134);
    t.draw((c, w, h) => {
      c.fillStyle = '#2f6b4f';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(255,255,255,0.85)';
      c.lineWidth = 4;
      c.strokeRect(8, 8, w - 16, h - 16);
      c.fillStyle = 'rgba(255,255,255,0.5)';
      c.fillRect(w / 2 - 2, 22, 4, h - 44);
      c.fillStyle = '#fff';
      c.textBaseline = 'middle';
      c.font = font(40, true);
      c.textAlign = 'left';
      c.fillText('◀ 교무실 · 행정실 · 보건실', 30, h / 2 + 2);
      c.textAlign = 'right';
      c.fillText('계단 · 2층 교실 ▶', w - 30, h / 2 + 2);
    });
    this.add(new THREE.PlaneGeometry(W - 0.04, H - 0.02), t.material(), x + 0.027, y + H / 2, z, { cast: false, ry: Math.PI / 2 });
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
