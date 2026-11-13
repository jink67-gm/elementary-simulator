// 학교 태블릿 충전 보관함: 철제 몸통 + 앞문 두 짝(환기 구멍·손잡이·자물쇠) + 위 칸막이 거치대(8칸, 칸 번호) + 바퀴 + 밀대 + 충전 표시등.
// 앞면 = -x (교실 쪽). 위 거치대에 태블릿이 세워 꽂혀 있다 — 칸 순서대로 slots.children[0..7].
import * as THREE from 'three';
import { add, box, canvasTex, compact, cyl, flatPlane, font, rbox, std, tube } from './kit';
import { buildTablet } from './items';

export function buildTabletCart(): { cart: THREE.Group; slots: THREE.Group; lamp: THREE.Mesh } {
  const cart = new THREE.Group();
  const body = std(0xd9dee3, 0.45, 0.35), trim = std(0x6c7a89, 0.5, 0.4), dark = std(0x2b2f36, 0.6);
  const W = 0.6, D = 1.1, y0 = 0.09, bodyH = 0.8, top = y0 + bodyH;
  add(cart, rbox(W, bodyH, D, 0.02, 2), body, 0, y0 + bodyH / 2, 0);
  add(cart, box(W + 0.01, 0.03, D + 0.01), trim, 0, y0 + 0.015, 0);
  // 앞문 두 짝
  const fx = -W / 2 - 0.004;
  for (const s of [-1, 1]) {
    const zc = s * 0.27;
    add(cart, box(0.012, 0.66, 0.5), std(0xe6eaee, 0.4, 0.3), fx, y0 + 0.4, zc);
    for (let i = 0; i < 6; i++) add(cart, box(0.004, 0.012, 0.3), dark, fx - 0.006, y0 + 0.2 + i * 0.03, zc);
    add(cart, box(0.02, 0.12, 0.018), trim, fx - 0.012, y0 + 0.52, zc - s * 0.21);
  }
  add(cart, cyl(0.012, 0.012, 0.012, 12), std(0xc9ced3, 0.3, 0.85), fx - 0.008, y0 + 0.66, 0, 0, 0, Math.PI / 2);
  // 이름표·표시등
  const label = canvasTex('cartLabel', 256, 64, (c, w, h) => {
    c.fillStyle = '#24406b';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff';
    c.font = font(28, 800);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('6-1 태블릿 충전함', w / 2, h / 2 + 2);
  });
  add(cart, new THREE.PlaneGeometry(0.34, 0.085), std(0xffffff, 0.5, 0, { map: label, key: 'cartLabel' }), fx - 0.007, y0 + 0.75, 0, 0, -Math.PI / 2, 0, false);
  const lamp = add(cart, box(0.012, 0.02, 0.1), new THREE.MeshStandardMaterial({ color: 0x51cf66, emissive: 0x2fbf4f, emissiveIntensity: 1.2 }), fx - 0.008, y0 + 0.75, 0.3);
  // 위 거치대: 바닥판 + 둘레 + 칸막이 + 칸 번호
  add(cart, box(W, 0.02, D), trim, 0, top + 0.01, 0);
  for (const z of [-D / 2 + 0.01, 0, D / 2 - 0.01]) add(cart, box(W, 0.1, 0.02), trim, 0, top + 0.02 + 0.05, z);
  for (const x of [-W / 2 + 0.01, W / 2 - 0.01]) add(cart, box(0.02, 0.1, D), trim, x, top + 0.07, 0);
  for (const row of [-1, 1])
    for (let k = 0; k <= 4; k++) add(cart, box(0.005, 0.15, 0.46), std(0xb9c2cc, 0.35, 0.5), -0.24 + k * 0.12, top + 0.095, row * 0.27);
  const nums = canvasTex('cartNums', 256, 32, (c, w, h) => {
    c.fillStyle = '#e9ecef';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#24406b';
    c.font = font(22, 800);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let i = 0; i < 4; i++) c.fillText(`${i + 1}`, (w / 4) * (i + 0.5), h / 2 + 1);
  });
  for (const row of [-1, 1]) add(cart, flatPlane(0.46, 0.035), std(0xffffff, 0.5, 0, { map: nums, key: 'cartNums' }), 0, top + 0.122, row * 0.27 - row * 0.235, 0, -Math.PI / 2, 0, false);
  // 세워 꽂힌 태블릿 8대 (화면이 앞(-x)을 본다) + 충전선
  const slots = new THREE.Group();
  slots.userData.keep = true;
  cart.add(slots);
  for (let i = 0; i < 8; i++) {
    const t = buildTablet('off', 10 + i);
    t.rotation.z = Math.PI / 2;
    t.position.set(-0.18 + (i % 4) * 0.12, top + 0.02 + 0.135, -0.27 + Math.floor(i / 4) * 0.54);
    slots.add(t);
  }
  for (let i = 0; i < 8; i++) add(cart, tube(`cable${i % 4}`, [[0, 0, 0], [0.02, -0.02, 0.02], [0.03, -0.05, 0.0]], 0.003, 8, 4), dark, -0.17 + (i % 4) * 0.12, top + 0.03, -0.27 + Math.floor(i / 4) * 0.54 + 0.08);
  // 바퀴 + 밀대
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      add(cart, box(0.05, 0.03, 0.05), trim, sx * 0.24, 0.075, sz * 0.48);
      add(cart, cyl(0.035, 0.035, 0.025, 14), dark, sx * 0.24, 0.035, sz * 0.48, Math.PI / 2, 0, 0);
    }
  add(cart, tube('cartHandle', [[-0.22, top - 0.1, D / 2], [-0.22, top - 0.05, D / 2 + 0.08], [0.22, top - 0.05, D / 2 + 0.08], [0.22, top - 0.1, D / 2]], 0.012, 16, 8), std(0x495057, 0.4, 0.6));
  lamp.userData.keep = true;
  compact(cart);
  return { cart, slots, lamp };
}
