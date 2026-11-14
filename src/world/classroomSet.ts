// 6-1 교실 가구·소품 (직접 제작, CC0): 창가 긴 수납장, 복도 쪽 낮은 책장, 청소도구함, 쓰레기통, 천 분리수거함,
// 교사용 컴퓨터·의자, 공기청정기, 벽 선풍기, 화분, 사물함 몸통.
// 재질은 교실 공통(연한 우드 MDF + 흰 판재)에 맞추고, 소품마다 재질별로 합쳐(compact) 그리기 호출을 줄인다.
import * as THREE from 'three';
import { add, box, canvasTex, compact, cyl, fabric, font, rbox, std } from './props/kit';
import { bookRow } from './classroomFurniture';
import { mergeChildrenByColor } from './merge';
import { TILE, worldUV } from './pbr';
import { TIMETABLE, TIMETABLE_DAYS } from '../data/timetable';

/** 연한 우드 MDF (교실 가구 공통): 밝은 살구빛 나무 + 옅은 결 */
let mdfMat: THREE.MeshStandardMaterial | null = null;
export const mdf = () => {
  if (mdfMat) return mdfMat;
  const t = canvasTex('mdfWood', 256, 256, (c, w, h) => {
    c.fillStyle = '#eccb96';
    c.fillRect(0, 0, w, h);
    let s = 3;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) {
      c.strokeStyle = `rgba(${150 + rnd() * 40},${105 + rnd() * 30},${50 + rnd() * 20},${0.05 + rnd() * 0.09})`;
      c.lineWidth = 0.6 + rnd() * 1.6;
      const y = rnd() * h;
      c.beginPath();
      c.moveTo(0, y);
      c.bezierCurveTo(w * 0.3, y + (rnd() - 0.5) * 8, w * 0.7, y + (rnd() - 0.5) * 8, w, y);
      c.stroke();
    }
  }, true);
  mdfMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
  return mdfMat;
};
const mdfEdge = () => std(0xd9bf96, 0.6);
const white = () => std(0xf4f1ea, 0.5);
const darkGap = () => std(0x4a3f33, 0.8);
const chrome = () => std(0xc9ced3, 0.3, 0.8);

/** 나뭇결이 실제 크기로 깔리는 상자 */
function wbox(w: number, h: number, d: number) {
  return worldUV(new THREE.BoxGeometry(w, h, d), w, h, d, TILE.oak);
}

function labelTex(key: string, text: string, bg: string, fg: string, w = 256, h = 80) {
  return canvasTex('lbl|' + key, w, h, (c, cw, ch) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, cw, ch);
    c.fillStyle = fg;
    c.font = font(Math.round(ch * 0.56), 800);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, cw / 2, ch / 2 + 2);
  });
}

/** 작은 화분 (종류 0~3: 둥근 잎 / 꽃 / 뾰족 잎 / 늘어진 잎). 원점 = 화분 바닥 */
export function buildPlant(kind = 0, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const potCol = [0xf4f1ea, 0xd9805f, 0xf4f1ea, 0x9fc5d8][kind % 4];
  add(g, cyl(0.075, 0.055, 0.12, 14), std(potCol, 0.6), 0, 0.06, 0);
  add(g, cyl(0.068, 0.068, 0.012, 14), std(0x4a3626, 0.95), 0, 0.118, 0);
  const leaf = std([0x4f9a3c, 0x3f8a3a, 0x2f7a45, 0x5aa646][kind % 4], 0.8);
  const k = kind % 4;
  if (k === 0 || k === 3) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2, r = 0.05 + (i % 3) * 0.02;
      const m = add(g, new THREE.SphereGeometry(0.055, 8, 6), leaf, Math.cos(a) * r, 0.2 + (i % 3) * 0.045 - (k === 3 ? 0.03 : 0), Math.sin(a) * r);
      m.scale.set(1, 0.55, 0.8);
      m.rotation.set(0.3, a, 0.4);
    }
  } else if (k === 1) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const m = add(g, new THREE.SphereGeometry(0.05, 8, 6), leaf, Math.cos(a) * 0.045, 0.17, Math.sin(a) * 0.045);
      m.scale.set(1, 0.5, 0.8);
    }
    const petal = std([0xff8fab, 0xffd166, 0xf28482][Math.floor(scale * 7) % 3], 0.7);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.5;
      add(g, cyl(0.004, 0.004, 0.1, 5), leaf, Math.cos(a) * 0.03, 0.21, Math.sin(a) * 0.03);
      add(g, new THREE.SphereGeometry(0.026, 8, 6), petal, Math.cos(a) * 0.03, 0.27, Math.sin(a) * 0.03);
    }
  } else {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const m = add(g, new THREE.ConeGeometry(0.022, 0.26, 5), leaf, Math.cos(a) * 0.03, 0.24, Math.sin(a) * 0.03);
      m.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    }
  }
  g.scale.setScalar(scale);
  return compact(g);
}

/**
 * 문 달린 낮은 수납장 한 줄 (여러 모듈이 이어진 모양). 앞면 = +x, 길이 = z. 원점 = 바닥 가운데.
 * 모듈마다 양문 + 세로 매립 손잡이, 굽(걸레받이), 상판.
 */
export function buildCabinetRun(len: number, h: number, d: number, o: { whiteDoors?: boolean; module?: number } = {}): THREE.Group {
  const g = new THREE.Group();
  const wood = mdf(), door = o.whiteDoors ? white() : wood, gap = darkGap();
  add(g, box(d - 0.05, 0.07, len - 0.02), std(0x3a3632, 0.7), -0.01, 0.035, 0);
  add(g, wbox(d, h - 0.1, len), o.whiteDoors ? white() : wood, 0, 0.07 + (h - 0.1) / 2, 0);
  add(g, wbox(d + 0.03, 0.03, len + 0.01), o.whiteDoors ? std(0xe7e2d8, 0.45) : wood, 0.012, h - 0.015, 0);
  const n = Math.max(1, Math.round(len / (o.module ?? 0.84))), mw = len / n;
  const fx = d / 2;
  for (let i = 0; i < n; i++) {
    const zc = -len / 2 + mw * (i + 0.5);
    for (const s of [-1, 1]) {
      const dw = mw / 2 - 0.012;
      const m = add(g, o.whiteDoors ? box(0.018, h - 0.14, dw) : wbox(0.018, h - 0.14, dw), door, fx + 0.009, 0.085 + (h - 0.14) / 2, zc + (s * mw) / 4);
      void m;
      // 세로 매립 손잡이 (문 안쪽 가장자리)
      add(g, box(0.006, 0.13, 0.022), gap, fx + 0.0185, h - 0.26, zc + s * 0.03);
    }
    if (i > 0) add(g, box(0.02, h - 0.12, 0.008), gap, fx + 0.004, 0.08 + (h - 0.12) / 2, zc - mw / 2);
  }
  return compact(g);
}

/** 문 없는 낮은 책장 (복도 쪽 창 아래): 칸마다 책·교구 바구니. 앞면 = +x, 길이 = z */
export function buildOpenShelf(len: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group();
  const wood = mdf();
  add(g, box(d - 0.05, 0.06, len - 0.02), std(0x3a3632, 0.7), -0.01, 0.03, 0);
  add(g, wbox(d, 0.022, len), wood, 0, 0.071, 0);
  add(g, wbox(0.015, h - 0.06, len), std(0xe9dcc4, 0.7), -d / 2 + 0.0075, 0.06 + (h - 0.06) / 2, 0);
  add(g, wbox(d + 0.02, 0.028, len + 0.01), wood, 0.008, h - 0.014, 0);
  add(g, wbox(d - 0.02, 0.02, len - 0.03), wood, 0, 0.44, 0);
  const n = Math.max(2, Math.round(len / 0.86)), bw = len / n;
  for (let i = 0; i <= n; i++) add(g, wbox(d, h - 0.07, 0.022), wood, 0, 0.06 + (h - 0.07) / 2, -len / 2 + i * bw + (i === 0 ? 0.011 : i === n ? -0.011 : 0));
  const books = new THREE.Group();
  g.add(books);
  const basket = (col: number, y: number, zc: number, w: number) => {
    const m = std(col, 0.5);
    add(g, rbox(d - 0.1, 0.2, w, 0.02), m, 0.03, y + 0.1, zc);
    add(g, box(0.006, 0.05, w * 0.4), std(0x2d2d2d, 0.6), d / 2 - 0.018, y + 0.14, zc); // 손잡이 구멍
    add(g, box(0.004, 0.05, w * 0.5), std(0xffffff, 0.6), d / 2 - 0.017, y + 0.06, zc); // 이름표
  };
  for (let i = 0; i < n; i++) {
    const z0 = -len / 2 + i * bw + 0.03, z1 = z0 + bw - 0.06, zc = (z0 + z1) / 2;
    // 위 칸
    if (i % 3 === 0) bookRow(books, z0, z1, 0.462, 0.27, 0.22, -0.02, 31 + i * 9);
    else if (i % 3 === 1) {
      basket(0xf2c94c, 0.46, zc - bw * 0.22, bw * 0.38);
      basket(0xf2c94c, 0.46, zc + bw * 0.22, bw * 0.38);
    } else {
      basket(0x9fb4c7, 0.46, zc - bw * 0.22, bw * 0.38);
      basket(0xf4f1ea, 0.46, zc + bw * 0.22, bw * 0.38);
    }
    // 아래 칸
    if (i % 2 === 0) bookRow(books, z0, z1, 0.084, 0.3, 0.24, -0.02, 77 + i * 5);
    else {
      basket(0x8fc1a9, 0.084, zc - bw * 0.22, bw * 0.38);
      basket(0xef8f7f, 0.084, zc + bw * 0.22, bw * 0.38);
    }
  }
  mergeChildrenByColor(books, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
  return compact(g);
}

/**
 * 청소도구함: 연한 우드 MDF, 높이 0.9, 양문(세로 매립 손잡이), 윗면 오른쪽에 긴 도구가 올라오는 수납구.
 * 안 왼쪽 = 선반(수건·세제·분무기), 안 오른쪽 = 빗자루·대걸레. 앞면 = -z (교실에서 볼 때 왼쪽 = +x).
 * doors: [왼쪽 문, 오른쪽 문] (경첩 그룹, rotation.y로 연다)
 */
export function buildCleaningCabinet(W = 0.95, H = 0.9, D = 0.5, broom = true): { cabinet: THREE.Group; doors: THREE.Group[] } {
  const cabinet = new THREE.Group();
  const wood = mdf(), inner = std(0xead9bd, 0.7);
  const t = 0.02;
  const shell = new THREE.Group();
  cabinet.add(shell);
  add(shell, box(W - 0.04, 0.06, D - 0.05), std(0x3a3632, 0.7), 0, 0.03, 0.02);
  add(shell, wbox(W, t, D), wood, 0, 0.07, 0); // 바닥판
  add(shell, wbox(t, H - 0.06, D), wood, W / 2 - t / 2, 0.06 + (H - 0.06) / 2, 0);
  add(shell, wbox(t, H - 0.06, D), wood, -W / 2 + t / 2, 0.06 + (H - 0.06) / 2, 0);
  add(shell, wbox(W, H - 0.06, 0.012), inner, 0, 0.06 + (H - 0.06) / 2, D / 2 - 0.006); // 뒤판
  add(shell, wbox(t, H - 0.1, D - 0.03), wood, 0, 0.08 + (H - 0.1) / 2, 0.01); // 가운데 칸막이
  // 윗판: 왼쪽 칸(+x)은 막히고, 오른쪽 칸(-x)은 긴 도구가 올라오는 수납구(뚫림 + 테두리)
  add(shell, wbox(W / 2 + 0.01, t, D), wood, W / 4 - 0.005, H - t / 2, 0);
  add(shell, wbox(W / 2 - 0.01, t, 0.1), wood, -W / 4 - 0.005, H - t / 2, -D / 2 + 0.05);
  add(shell, wbox(W / 2 - 0.01, t, 0.1), wood, -W / 4 - 0.005, H - t / 2, D / 2 - 0.05);
  add(shell, wbox(0.05, t, D), wood, -W / 2 + 0.025, H - t / 2, 0);
  // 왼쪽 칸 선반 두 장 + 청소용품
  for (const y of [0.36, 0.62]) add(shell, wbox(W / 2 - 0.03, 0.016, D - 0.06), wood, W / 4, y, 0.01);
  const towel = [0xffffff, 0xa8d5e2, 0xffd6a5];
  towel.forEach((c, i) => add(shell, rbox(0.2, 0.045, 0.16, 0.012), fabric(c, 3), W / 4 - 0.06, 0.39 + i * 0.047, 0.04));
  add(shell, rbox(0.1, 0.2, 0.07, 0.02), std(0x2f80ed, 0.4), W / 4 + 0.14, 0.47, 0.06); // 세제 통
  add(shell, cyl(0.02, 0.02, 0.03, 10), std(0xffffff, 0.4), W / 4 + 0.14, 0.585, 0.06);
  for (const [dx, c] of [[-0.1, 0x6fcf97], [0.06, 0xf2c94c]] as [number, number][]) {
    add(shell, cyl(0.035, 0.04, 0.16, 12), std(c, 0.35, 0, { transparent: true, opacity: 0.85, key: 'spray' + c }), W / 4 + dx, 0.716, 0.05); // 분무기
    add(shell, box(0.03, 0.035, 0.07), std(0xf4f4f4, 0.4), W / 4 + dx, 0.815, 0.03);
    add(shell, cyl(0.012, 0.012, 0.03, 8), std(0xf4f4f4, 0.4), W / 4 + dx, 0.795, 0.05);
  }
  add(shell, rbox(0.18, 0.2, 0.14, 0.02), std(0x8fc1a9, 0.5), W / 4 - 0.07, 0.19, 0.05); // 양동이
  add(shell, rbox(0.14, 0.07, 0.1, 0.02), std(0xf2a65a, 0.8), W / 4 + 0.13, 0.115, 0.05); // 수세미 상자
  // 오른쪽 칸: 빗자루 + 대걸레 (자루가 윗면 수납구 위로 올라온다) + 쓰레받기
  const rx = -W / 4;
  const stick = (x: number, z: number, len: number, col: number, tilt: number) => {
    const m = add(shell, cyl(0.012, 0.012, len, 8), std(col, 0.5), x, 0.12 + len / 2, z);
    m.rotation.z = tilt;
    m.position.x += Math.sin(-tilt) * len * 0.5;
    return m;
  };
  if (broom) {
    stick(rx - 0.09, 0.06, 1.12, 0x2f80ed, 0.03);
    add(shell, rbox(0.2, 0.14, 0.05, 0.015), std(0x2f80ed, 0.6), rx - 0.08, 0.16, 0.06); // 빗자루 솔 머리
    for (let i = 0; i < 6; i++) add(shell, box(0.026, 0.09, 0.03), std(0xf2e2b8, 0.9), rx - 0.155 + i * 0.03, 0.115, 0.06);
  }
  stick(rx + 0.1, 0.08, 1.2, 0xf4f4f4, -0.025);
  add(shell, cyl(0.06, 0.09, 0.2, 10), fabric(0xf7f7f2, 2), rx + 0.085, 0.2, 0.08); // 대걸레 머리
  add(shell, box(0.2, 0.012, 0.16), std(0xeb5757, 0.5), rx, 0.1, -0.1); // 쓰레받기
  compact(shell);
  // 양문 (경첩 = 바깥 모서리)
  const doors: THREE.Group[] = [];
  for (const s of [1, -1]) {
    const hinge = new THREE.Group();
    hinge.position.set(s * (W / 2 - 0.004), 0.075, -D / 2 - 0.01);
    const dw = W / 2 - 0.008, dh = H - 0.085;
    const leaf = add(hinge, wbox(dw, dh, 0.018), wood.clone(), (-s * dw) / 2, dh / 2, 0);
    leaf.userData.keep = true;
    add(hinge, box(0.022, 0.16, 0.006), darkGap(), -s * (dw - 0.035), dh * 0.62, -0.0095); // 세로 매립 손잡이
    add(hinge, wbox(dw, 0.012, 0.004), mdfEdge(), (-s * dw) / 2, dh - 0.006, -0.0095);
    cabinet.add(hinge);
    doors.push(hinge);
  }
  // 이름표
  add(cabinet, new THREE.PlaneGeometry(0.26, 0.07), std(0xffffff, 0.6, 0, { map: labelTex('clean', '청소도구함', '#ffffff', '#5b4a36'), key: 'cleanLabel' }), W / 4, H - 0.11, -D / 2 - 0.021, 0, Math.PI, 0, false);
  return { cabinet, doors };
}

/** 파란 플라스틱 쓰레기통 + 흰 스윙 뚜껑. 원점 = 바닥 가운데 */
export function buildTrashBin(): THREE.Group {
  const g = new THREE.Group();
  const blue = std(0x1e88e5, 0.42), lid = std(0xf7f7f5, 0.4);
  add(g, rbox(0.4, 0.5, 0.34, 0.035, 3), blue, 0, 0.25, 0);
  add(g, rbox(0.42, 0.03, 0.36, 0.012), std(0x1565c0, 0.45), 0, 0.5, 0);
  // 뚜껑: 지붕 모양 몸체 + 가운데 축에 달린 스윙 판
  const roof = add(g, rbox(0.41, 0.15, 0.35, 0.05, 3), lid, 0, 0.585, 0);
  void roof;
  const flap = add(g, rbox(0.3, 0.13, 0.012, 0.004), std(0xe2e5e8, 0.35), 0, 0.59, -0.168);
  flap.rotation.x = 0.16;
  add(g, cyl(0.008, 0.008, 0.33, 8), std(0xb8bec4, 0.4, 0.6), 0, 0.655, -0.16, 0, 0, Math.PI / 2);
  // 재활용 표시 딱지
  add(g, new THREE.PlaneGeometry(0.2, 0.09), std(0xffffff, 0.6, 0, { map: labelTex('trash', '일반 쓰레기', '#ffffff', '#1565c0'), key: 'trashLabel' }), 0, 0.3, -0.171, 0, Math.PI, 0, false);
  return compact(g);
}

/** 천 소재 3칸 분리수거함 (회색 = 캔, 아이보리 = 종이, 검정 = 플라스틱). 앞면 = -z, 원점 = 바닥 가운데 */
export function buildFabricRecycling(): THREE.Group {
  const g = new THREE.Group();
  const kinds: [string, number, string, string][] = [
    ['캔', 0x8d949b, '#ffffff', '#4b5258'],
    ['종이', 0xece3cc, '#ffffff', '#7a6a45'],
    ['플라스틱', 0x26282b, '#ffffff', '#26282b'],
  ];
  const w = 0.44, h = 0.56, d = 0.36;
  const frame = std(0xb8bec4, 0.35, 0.7);
  kinds.forEach(([name, col, bg, fg], i) => {
    // 교실에서 볼 때 왼쪽(+x)부터 캔 → 종이 → 플라스틱
    const x = (1 - i) * (w + 0.02);
    const cloth = fabric(col, 4);
    add(g, rbox(w, h, d, 0.03, 3), cloth, x, 0.05 + h / 2, 0);
    // 윗테두리 (천을 접어 박은 띠) + 열린 속
    add(g, rbox(w + 0.012, 0.035, d + 0.012, 0.012), fabric(new THREE.Color(col).multiplyScalar(0.8).getHex(), 4), x, 0.05 + h - 0.01, 0);
    add(g, box(w - 0.05, 0.004, d - 0.05), std(0x17181a, 0.95), x, 0.05 + h + 0.008, 0);
    // 손잡이 끈 (양옆)
    for (const s of [-1, 1]) add(g, new THREE.TorusGeometry(0.05, 0.008, 5, 10, Math.PI), cloth, x + s * (w / 2 - 0.09), 0.05 + h + 0.0, -d / 2 - 0.004);
    // 이름표 (투명 주머니에 끼운 카드)
    add(g, new THREE.PlaneGeometry(0.24, 0.12), std(0xffffff, 0.55, 0, { map: labelTex('rc' + name, name, bg, fg, 256, 128), key: 'rcLabel' + name }), x, 0.37, -d / 2 - 0.004, 0, Math.PI, 0, false);
    add(g, box(0.27, 0.15, 0.003), std(0xdfe3e6, 0.3), x, 0.37, -d / 2 - 0.001);
  });
  // 철제 받침 틀 (다리 + 가로대)
  const total = 3 * w + 0.04;
  for (const z of [-d / 2 + 0.02, d / 2 - 0.02]) add(g, box(total + 0.02, 0.015, 0.015), frame, 0, 0.045, z);
  for (const x of [-total / 2, total / 2]) for (const z of [-d / 2 + 0.02, d / 2 - 0.02]) add(g, cyl(0.01, 0.01, 0.05, 6), frame, x, 0.025, z);
  return compact(g);
}

/** 교사용 컴퓨터 한 벌: 모니터·키보드·마우스·본체·연필꽂이. 화면이 +z(앉은 사람 쪽)를 본다. 원점 = 책상 윗면 */
export function buildTeacherPC(): THREE.Group {
  const g = new THREE.Group();
  const black = std(0x1d1f23, 0.4), grey = std(0x8a9099, 0.4, 0.4);
  add(g, rbox(0.56, 0.34, 0.025, 0.008), black, 0, 0.31, -0.12);
  add(g, new THREE.PlaneGeometry(0.52, 0.3), new THREE.MeshStandardMaterial({ color: 0x3a6ea5, emissive: 0x2a5d94, emissiveIntensity: 0.5, roughness: 0.3 }), 0, 0.31, -0.106, 0, 0, 0, false);
  add(g, box(0.05, 0.12, 0.03), grey, 0, 0.09, -0.14);
  add(g, rbox(0.22, 0.012, 0.16, 0.005), grey, 0, 0.006, -0.13);
  add(g, rbox(0.4, 0.016, 0.13, 0.005), std(0x2a2c31, 0.5), 0, 0.01, 0.1); // 키보드
  add(g, box(0.36, 0.004, 0.1), std(0x44474d, 0.6), 0, 0.02, 0.1);
  add(g, rbox(0.055, 0.025, 0.09, 0.012), std(0x2a2c31, 0.4), 0.3, 0.013, 0.1); // 마우스
  add(g, box(0.2, 0.003, 0.18), std(0x3d4756, 0.9), 0.3, 0.002, 0.1);
  // 연필꽂이 + 필기구
  add(g, cyl(0.04, 0.035, 0.1, 12), std(0x4f8fbf, 0.5), -0.42, 0.05, 0.0);
  [0xffd166, 0xef476f, 0x06a77d, 0x333333].forEach((c, i) => {
    const p = add(g, cyl(0.005, 0.005, 0.16, 6), std(c, 0.5), -0.42 + (i - 1.5) * 0.015, 0.11, (i % 2) * 0.02 - 0.01);
    p.rotation.z = (i - 1.5) * 0.12;
  });
  // 서류함 + 공책
  add(g, rbox(0.26, 0.07, 0.33, 0.01), std(0xf2c94c, 0.5), 0.42, 0.035, -0.03);
  add(g, box(0.22, 0.012, 0.3), std(0xffffff, 0.8), 0.42, 0.076, -0.03);
  return compact(g);
}

/** 교사용 의자 (바퀴 달린 사무용). 등받이가 +z 쪽. 원점 = 바닥 */
export function buildOfficeChair(): THREE.Group {
  const g = new THREE.Group();
  const cloth = fabric(0x3d4756, 4), frame = std(0x24262a, 0.5);
  add(g, rbox(0.46, 0.07, 0.44, 0.03), cloth, 0, 0.45, 0);
  const back = add(g, rbox(0.42, 0.5, 0.06, 0.03), cloth, 0, 0.78, 0.22);
  back.rotation.x = 0.1;
  add(g, rbox(0.26, 0.14, 0.06, 0.03), cloth, 0, 1.1, 0.25);
  add(g, cyl(0.025, 0.025, 0.3, 8), std(0x9aa0a6, 0.3, 0.7), 0, 0.27, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = add(g, box(0.28, 0.025, 0.04), frame, Math.cos(a) * 0.14, 0.1, Math.sin(a) * 0.14);
    leg.rotation.y = -a;
    add(g, cyl(0.028, 0.028, 0.03, 8), frame, Math.cos(a) * 0.27, 0.03, Math.sin(a) * 0.27, 0, 0, Math.PI / 2);
  }
  for (const s of [-1, 1]) {
    add(g, box(0.03, 0.18, 0.03), frame, s * 0.25, 0.56, 0.02);
    add(g, rbox(0.05, 0.025, 0.24, 0.01), frame, s * 0.25, 0.66, 0.0);
  }
  return compact(g);
}

/** 세워 두는 공기청정기 (흰 몸통, 앞 흡입 그릴, 위 표시등). 앞면 = -x */
export function buildAirPurifier(): THREE.Group {
  const g = new THREE.Group();
  add(g, rbox(0.3, 0.72, 0.36, 0.04, 3), std(0xf6f6f3, 0.4), 0, 0.38, 0);
  add(g, rbox(0.26, 0.02, 0.32, 0.008), std(0x4a4d52, 0.5), 0, 0.01, 0);
  for (let i = 0; i < 9; i++) add(g, box(0.004, 0.012, 0.26), std(0xb9bec4, 0.5), -0.151, 0.12 + i * 0.045, 0);
  add(g, box(0.16, 0.004, 0.2), std(0x2a2c31, 0.5), 0, 0.741, 0);
  add(g, box(0.02, 0.005, 0.06), new THREE.MeshStandardMaterial({ color: 0x4dd0e1, emissive: 0x26c6da, emissiveIntensity: 1.2 }), -0.1, 0.742, 0);
  return compact(g);
}

/** 벽걸이 선풍기 (벽 = 원점 뒤 -x 방향으로 붙음, 바람은 +x) */
export function buildWallFan(): THREE.Group {
  const g = new THREE.Group();
  const w = std(0xf4f4f2, 0.5), grey = std(0x9aa0a6, 0.4, 0.5);
  add(g, rbox(0.06, 0.2, 0.14, 0.02), w, 0.03, 0, 0);
  add(g, box(0.16, 0.04, 0.04), w, 0.12, 0.03, 0);
  add(g, cyl(0.07, 0.07, 0.12, 12), w, 0.24, 0.06, 0, 0, 0, Math.PI / 2);
  for (const dx of [0.3, 0.36]) add(g, new THREE.TorusGeometry(0.2, 0.006, 5, 24), grey, dx, 0.06, 0, 0, Math.PI / 2, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI;
    add(g, box(0.004, 0.4, 0.004), grey, 0.365, 0.06, 0, a, 0, 0);
  }
  for (let i = 0; i < 3; i++) {
    const b = add(g, box(0.008, 0.17, 0.09), std(0xbfe3f5, 0.3, 0, { transparent: true, opacity: 0.8, key: 'fanBlade' }), 0.33, 0.06, 0);
    b.rotation.x = (i / 3) * Math.PI * 2;
    b.position.y += Math.cos(b.rotation.x) * 0.09;
    b.position.z += Math.sin(b.rotation.x) * 0.09;
  }
  return compact(g);
}

/** 태극기 (액자에 넣는 그림) */
export function taegukgiTex() {
  return canvasTex('taegukgi', 384, 256, (c, w, h) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, r = h * 0.25;
    c.save();
    c.translate(cx, cy);
    c.rotate(Math.atan2(2, 3));
    c.fillStyle = '#cd2e3a';
    c.beginPath();
    c.arc(0, 0, r, Math.PI, 0);
    c.fill();
    c.fillStyle = '#0047a0';
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI);
    c.fill();
    c.fillStyle = '#cd2e3a';
    c.beginPath();
    c.arc(-r / 2, 0, r / 2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#0047a0';
    c.beginPath();
    c.arc(r / 2, 0, r / 2, 0, Math.PI * 2);
    c.fill();
    c.restore();
    // 건곤감리 (막대 3줄, 끊긴 줄은 가운데를 비운다)
    const tri: [number, number, boolean[]][] = [
      [-1, -1, [false, false, false]], // 건 (왼쪽 위)
      [1, 1, [true, true, true]], // 곤 (오른쪽 아래)
      [1, -1, [true, false, true]], // 감 (오른쪽 위)
      [-1, 1, [false, true, false]], // 리 (왼쪽 아래)
    ];
    const ang = Math.atan2(h, w);
    for (const [sx, sy, broken] of tri) {
      c.save();
      c.translate(cx + sx * Math.cos(ang) * r * 2.05, cy + sy * Math.sin(ang) * r * 2.05);
      c.rotate(Math.atan2(sy * Math.sin(ang), sx * Math.cos(ang)));
      c.fillStyle = '#111111';
      const bl = r * 1.0, bt = r * 0.16, gap = r * 0.09;
      broken.forEach((b, i) => {
        const x = (i - 1) * (bt + gap) - bt / 2;
        if (b) {
          c.fillRect(x, -bl / 2, bt, bl / 2 - gap / 2);
          c.fillRect(x, gap / 2, bt, bl / 2 - gap / 2);
        } else c.fillRect(x, -bl / 2, bt, bl);
      });
      c.restore();
    }
  });
}

/** 초록 덩굴 장식 (게시판 위에 길게): 길이 = x */
export function buildGarland(len: number): THREE.Group {
  const g = new THREE.Group();
  const leafA = std(0x4f9a3c, 0.85), leafB = std(0x6dbb4d, 0.85), flower = std(0xffffff, 0.7);
  let s = 5;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const n = Math.round(len / 0.07);
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (i + 0.5) * (len / n);
    const m = add(g, new THREE.SphereGeometry(0.05, 6, 5), i % 2 ? leafA : leafB, x + (rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.07 - (i % 9 === 0 ? 0.06 : 0), 0.01 + rnd() * 0.02, 0, 0, 0, false);
    m.scale.set(1, 0.65, 0.35);
    m.rotation.z = (rnd() - 0.5) * 1.6;
    if (i % 6 === 3) add(g, new THREE.SphereGeometry(0.018, 6, 5), flower, x, (rnd() - 0.5) * 0.05, 0.045, 0, 0, 0, false);
  }
  return compact(g);
}

/** 사물함 몸통 (문 제외): 연한 우드 MDF 틀 + 칸막이 + 굽 + 상판. 앞면 = -z, 원점 = 바닥 가운데 */
export function buildLockerCarcass(w: number, d: number, top: number, cols: number): THREE.Group {
  const g = new THREE.Group();
  const wood = mdf();
  add(g, box(w - 0.02, 0.1, d - 0.04), std(0x3a3632, 0.7), 0, 0.05, 0.02);
  add(g, wbox(w, top - 0.13, d - 0.03), std(0xead9bd, 0.7), 0, 0.1 + (top - 0.13) / 2, 0.015); // 속 (문 사이 틈으로 보임)
  for (let i = 0; i <= cols; i++) add(g, wbox(0.02, top - 0.13, 0.03), wood, -w / 2 + (i * w) / cols + (i === 0 ? 0.01 : i === cols ? -0.01 : 0), 0.1 + (top - 0.13) / 2, -d / 2 + 0.015);
  for (const y of [0.1, 0.6, top - 0.05]) add(g, wbox(w, 0.02, 0.03), wood, 0, y + 0.01, -d / 2 + 0.015);
  add(g, wbox(w + 0.03, 0.03, d + 0.02), wood, 0, top - 0.015, -0.005);
  return compact(g);
}

/** 사물함 문 한 짝: 연한 우드 MDF + 원형 매립 손잡이. 원점 = 문 가운데, 앞면 = -z */
export function lockerDoorGeo(w: number, h: number) {
  return wbox(w, h, 0.02);
}
export function lockerHandle(parent: THREE.Object3D, x: number, y: number, z: number) {
  add(parent, new THREE.RingGeometry(0.022, 0.03, 20), std(0xb9a27c, 0.5), x, y, z - 0.0115, 0, Math.PI, 0, false);
  add(parent, new THREE.CircleGeometry(0.022, 20), darkGap(), x, y, z - 0.0112, 0, Math.PI, 0, false);
}
export { chrome as chromeMat };

/** 학생 책상: 밝은 나무 상판(둥근 모서리, 회색 테두리) + 회색 금속 틀 + 책 서랍. 앉는 쪽 = +z. 원점 = 바닥 가운데 */
export function buildStudentDesk(w: number, d: number, top: number): THREE.Group {
  const g = new THREE.Group();
  const metal = std(0x8e949c, 0.42, 0.55), woodTop = std(0xe9c98f, 0.55), edge = std(0x5d6474, 0.5);
  add(g, rbox(w, 0.022, d, 0.01), edge, 0, top - 0.017, 0);
  add(g, rbox(w - 0.012, 0.012, d - 0.012, 0.005), woodTop, 0, top - 0.006, 0);
  // 책 서랍 (앞이 트인 철판 상자)
  add(g, box(w - 0.14, 0.008, d - 0.1), metal, 0, top - 0.14, -0.01);
  for (const s of [-1, 1]) add(g, box(0.008, 0.11, d - 0.1), metal, s * (w / 2 - 0.07), top - 0.085, -0.01);
  add(g, box(w - 0.14, 0.11, 0.008), metal, 0, top - 0.085, -d / 2 + 0.04);
  // 다리 (양옆 ㄷ자 틀) + 발 받침 가로대
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 0.045);
    for (const z of [-d / 2 + 0.06, d / 2 - 0.06]) add(g, box(0.028, top - 0.03, 0.028), metal, x, (top - 0.03) / 2, z);
    add(g, box(0.03, 0.025, d - 0.02), metal, x, 0.0125, 0);
    add(g, box(0.02, 0.02, d - 0.14), metal, x, top - 0.2, 0);
    for (const z of [-d / 2 + 0.01, d / 2 - 0.01]) add(g, box(0.034, 0.012, 0.03), std(0x2f3337, 0.7), x, 0.006, z);
  }
  add(g, box(w - 0.09, 0.02, 0.02), metal, 0, 0.14, -d / 2 + 0.06);
  return g;
}

/** 학생 의자: 회색 계열 플라스틱 좌판·등받이(손잡이 구멍) + 회색 금속 다리. 등받이 = +z. 원점 = 바닥 가운데 */
export function buildStudentChair(): THREE.Group {
  const g = new THREE.Group();
  const shell = std(0x8f93b3, 0.5), metal = std(0x8e949c, 0.42, 0.55);
  const sh = 0.4;
  add(g, rbox(0.4, 0.035, 0.38, 0.016, 3), shell, 0, sh, 0);
  const back = add(g, rbox(0.4, 0.26, 0.03, 0.014, 3), shell, 0, sh + 0.33, 0.185);
  back.rotation.x = 0.1;
  add(g, box(0.13, 0.035, 0.034), std(0x3a3d4a, 0.6), 0, sh + 0.39, 0.193, 0.1); // 손잡이 구멍
  for (const s of [-1, 1]) {
    const x = s * 0.17;
    add(g, box(0.022, sh, 0.022), metal, x, sh / 2, -0.15);
    add(g, box(0.022, sh + 0.3, 0.022), metal, x, (sh + 0.3) / 2, 0.165);
    add(g, box(0.022, 0.022, 0.33), metal, x, 0.12, 0.007);
    for (const z of [-0.15, 0.165]) add(g, box(0.03, 0.012, 0.03), std(0x2f3337, 0.7), x, 0.006, z);
  }
  add(g, box(0.34, 0.02, 0.02), metal, 0, sh - 0.03, -0.15);
  return g;
}

/** 시간표 그림 (월~금 × 1~6교시, 데이터: data/timetable.ts) */
export function timetableTex() {
  return canvasTex('timetable', 512, 768, (c, w, h) => {
    c.fillStyle = '#bfe3f7';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#9bd17c';
    c.fillRect(0, h - 60, w, 60);
    c.fillStyle = '#ffffff';
    roundRectPath(c, 110, 22, w - 220, 96, 46);
    c.fill();
    c.fillStyle = '#263238';
    c.font = font(64, 800);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('시간표', w / 2, 74);
    const x0 = 28, y0 = 140, cw = (w - 56) / 6, rows = TIMETABLE.length + 1, ch = (h - 60 - y0 - 24) / rows;
    const dayCol = ['#ffb3ba', '#ffd9a8', '#fff3a8', '#c4eac0', '#b9d9f5'];
    for (let r = 0; r < rows; r++)
      for (let k = 0; k < 6; k++) {
        const x = x0 + k * cw, y = y0 + r * ch;
        c.fillStyle = r === 0 ? (k === 0 ? '#ffe08a' : dayCol[k - 1]) : k === 0 ? '#fff0b8' : '#ffffff';
        c.fillRect(x, y, cw, ch);
        c.strokeStyle = '#5f6b73';
        c.lineWidth = 3;
        c.strokeRect(x, y, cw, ch);
        const text = r === 0 ? (k === 0 ? '교시' : TIMETABLE_DAYS[k - 1]) : k === 0 ? `${r}교시` : TIMETABLE[r - 1][k - 1];
        c.fillStyle = '#263238';
        c.font = font(r === 0 || k === 0 ? 30 : 28, r === 0 || k === 0 ? 800 : 600);
        c.fillText(text, x + cw / 2, y + ch / 2 + 2);
      }
  });
}
function roundRectPath(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** 베이지 콤비 블라인드 천 (불투명 띠와 비치는 띠가 번갈아) */
export function combiBlindMat() {
  const t = canvasTex('combiBlind', 8, 64, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      c.fillStyle = 'rgba(238,224,196,1)';
      c.fillRect(0, i * 16, w, 9);
      c.fillStyle = 'rgba(244,236,218,0.38)';
      c.fillRect(0, i * 16 + 9, w, 7);
    }
  }, true);
  const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.95, side: THREE.DoubleSide });
  m.userData.pbr = true;
  return m;
}
