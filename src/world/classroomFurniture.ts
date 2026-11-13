// 교실 가구 (직접 제작): 학급 문고 책장, 미술 재료 수납장 + 정리 바구니, 분리수거함.
// 교실 재질(흰 판재 + 참나무)에 맞춘다. 상호작용 물건이라 강조 효과가 다른 물건에 번지지 않게
// 묶음마다 재질을 따로 복제해 쓴다. 책·뚜껑처럼 작은 조각은 한 덩어리로 합쳐 그리기 호출을 줄인다.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CanvasTex, font } from './canvasTex';
import { mergeChildrenByColor } from './merge';
import { TILE, paint, pbr, worldUV } from './pbr';

/** 밑면 높이 y에 상자 하나 */
function part(g: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, tile = 0, round = 0) {
  const geo = round ? new RoundedBoxGeometry(w, h, d, 2, round) : new THREE.BoxGeometry(w, h, d);
  if (tile && !round) worldUV(geo, w, h, d, tile);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}

function label(text: string, w: number, h: number, bg: string, fg: string) {
  const t = new CanvasTex(256, Math.round((256 * h) / w));
  t.draw((c, cw, ch) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, cw, ch);
    c.fillStyle = fg;
    c.font = font(Math.round(ch * 0.55), true);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, cw / 2, ch / 2 + 2);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), t.material());
}

const BOOK_COLORS = [0xd1495b, 0x2a9d8f, 0xe9c46a, 0x3d5a80, 0xf4a261, 0x8ab17d, 0x9d4edd, 0xf1faee, 0x6d597a, 0xe76f51];

/** 책 한 줄 (z0~z1, 바닥 y) — 높이·두께·색이 제각각, 가끔 기울어진 책 */
function bookRow(g: THREE.Object3D, z0: number, z1: number, y: number, maxH: number, depth: number, x: number, seed: number) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let z = z0 + 0.01;
  while (z < z1 - 0.05) {
    const t = 0.025 + rnd() * 0.035;
    const h = maxH * (0.72 + rnd() * 0.26);
    const d = depth * (0.8 + rnd() * 0.2);
    const col = BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)];
    const b = part(g, d, h, t, new THREE.MeshBasicMaterial({ color: col }), x, y, z + t / 2);
    if (rnd() < 0.08 && z < z1 - 0.2) {
      b.rotation.x = 0.28;
      b.position.z += 0.08;
      z += 0.12;
    }
    z += t + 0.002;
    if (rnd() < 0.06) z += 0.08 + rnd() * 0.1; // 빈자리
  }
}

/** 학급 문고: 창 아래 낮은 책장 (높이 0.82, 창턱 아래). 앞면 +x, 길이 2.2(z) */
export function buildBookshelf(g: THREE.Group) {
  const body = paint(0xf3efe7, 0.5).clone();
  const oak = pbr('oak', { color: 0xf3e2c8, roughness: 0.55 }).clone();
  const back = paint(0xe8e1d4, 0.7).clone();
  const L = 2.2, D = 0.4, Hh = 0.82, xb = -0.25, xf = xb + D;
  const xc = (xb + xf) / 2;
  part(g, D, 0.07, L, paint(0x2f3337, 0.6).clone(), xc + 0.01, 0, 0); // 받침
  part(g, D, 0.025, L, body, xc, 0.07, 0); // 바닥판
  part(g, 0.015, Hh - 0.07, L, back, xb + 0.008, 0.07, 0); // 뒤판
  for (const z of [-L / 2 + 0.0125, -L / 6, L / 6, L / 2 - 0.0125]) part(g, D, Hh - 0.07, 0.025, body, xc, 0.07, z); // 옆판·칸막이
  part(g, D - 0.02, 0.022, L - 0.04, body, xc, 0.44, 0); // 가운데 선반
  part(g, D + 0.04, 0.03, L + 0.04, oak, xc + 0.02, Hh, 0, TILE.oak); // 나무 상판
  // 책 (아래·위 칸, 세 칸씩)
  const books = new THREE.Group();
  g.add(books);
  const bays: [number, number][] = [[-L / 2 + 0.03, -L / 6 - 0.015], [-L / 6 + 0.015, L / 6 - 0.015], [L / 6 + 0.015, L / 2 - 0.03]];
  bays.forEach(([z0, z1], i) => {
    bookRow(books, z0, z1, 0.095, 0.32, 0.26, xb + 0.17, 11 + i * 7);
    bookRow(books, z0, z1, 0.462, 0.33, 0.26, xb + 0.17, 53 + i * 5);
  });
  // 위에 세워 둔 그림책 몇 권 + 북엔드
  bookRow(books, 0.35, 0.62, Hh + 0.03, 0.26, 0.2, xb + 0.14, 97);
  mergeChildrenByColor(books, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
  part(g, 0.16, 0.16, 0.012, paint(0x9aa0a6, 0.4, 0.5).clone(), xb + 0.14, Hh + 0.03, 0.64);
  // 이름표
  const tag = label('학급 문고', 0.42, 0.09, '#2d6a4f', '#ffffff');
  tag.position.set(xf + 0.026, Hh - 0.06, 0);
  tag.rotation.y = Math.PI / 2;
  g.add(tag);
}

/** 미술 재료 수납장: 흰 몸통 + 나무 문 4짝 + 나무 상판 (높이 0.98). 앞면 +x, 길이 1.9(z) */
export function buildArtCabinet(g: THREE.Group) {
  const body = paint(0xf3efe7, 0.5).clone();
  const oak = pbr('oak', { color: 0xf3e2c8, roughness: 0.55 }).clone();
  const chrome = paint(0xc9ced3, 0.3, 0.8).clone();
  const L = 1.9, D = 0.6, Hh = 0.95, xb = -0.45, xf = xb + D, xc = (xb + xf) / 2;
  part(g, D - 0.04, 0.08, L - 0.04, paint(0x2f3337, 0.6).clone(), xc, 0, 0);
  part(g, D, Hh - 0.08, L, body, xc, 0.08, 0);
  const n = 4, dw = L / n;
  for (let i = 0; i < n; i++) {
    const z = -L / 2 + dw * (i + 0.5);
    part(g, 0.02, Hh - 0.14, dw - 0.02, oak, xf + 0.01, 0.1, z, TILE.oak);
    part(g, 0.03, 0.14, 0.02, chrome, xf + 0.035, 0.6, z + (i % 2 ? -1 : 1) * (dw / 2 - 0.07));
  }
  part(g, D + 0.03, 0.03, L + 0.03, oak, xc + 0.015, Hh, 0, TILE.oak);
  const tag = label('미술 재료', 0.36, 0.08, '#ffffff', '#7a5230');
  tag.position.set(xf + 0.022, Hh - 0.07, -L / 2 + dw);
  tag.rotation.y = Math.PI / 2;
  g.add(tag);
}

/** 정리 바구니: 뚜껑 없는 플라스틱 통 (바닥 + 벽 4) + 이름표. g 원점 = 바닥 가운데 */
export function buildBin(g: THREE.Group, color: number, name: string) {
  const m = paint(color, 0.45).clone();
  const W = 0.46, Hh = 0.22, t = 0.018;
  part(g, W - 0.04, 0.015, W - 0.04, m, 0, 0, 0);
  part(g, t, Hh, W, m, -W / 2 + t / 2, 0, 0, 0, 0.008);
  part(g, t, Hh, W, m, W / 2 - t / 2, 0, 0, 0, 0.008);
  part(g, W, Hh, t, m, 0, 0, -W / 2 + t / 2, 0, 0.008);
  part(g, W, Hh, t, m, 0, 0, W / 2 - t / 2, 0, 0.008);
  const tag = label(name, 0.3, 0.08, '#ffffff', '#333333');
  tag.position.set(W / 2 + 0.002, 0.12, 0);
  tag.rotation.y = Math.PI / 2;
  g.add(tag);
}

/** 분리수거함: 나무 받침 위 통 3개 (일반·플라스틱·종이), 색 뚜껑 + 투입구 + 이름표. 앞면 -x, 길이 1.1(z) */
export function buildRecycling(g: THREE.Group) {
  const oak = pbr('oak', { color: 0xf3e2c8, roughness: 0.55 }).clone();
  const body = paint(0xf1f1ef, 0.45).clone();
  const slot = paint(0x2b2d31, 0.7).clone();
  part(g, 0.5, 0.06, 1.12, oak, 0.02, 0, 0, TILE.oak);
  const kinds: [string, number][] = [['일반', 0x6c757d], ['플라스틱', 0x1d8fd1], ['종이', 0x2a9d6f]];
  kinds.forEach(([name, col], i) => {
    const z = -0.37 + i * 0.37;
    part(g, 0.44, 0.58, 0.34, body, 0.02, 0.06, z, 0, 0.03);
    part(g, 0.46, 0.05, 0.36, paint(col, 0.4).clone(), 0.02, 0.64, z, 0, 0.02);
    part(g, 0.12, 0.012, 0.2, slot, -0.08, 0.69, z);
    const tag = label(name, 0.26, 0.11, '#' + col.toString(16).padStart(6, '0'), '#ffffff');
    tag.position.set(-0.201, 0.45, z);
    tag.rotation.y = -Math.PI / 2;
    g.add(tag);
  });
}
