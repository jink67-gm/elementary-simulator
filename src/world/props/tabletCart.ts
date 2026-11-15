// 학교 태블릿 충전 보관함 (실제 학교 제품 모양): 흰 철제 몸통 + 앞면 검은 유리문(안쪽 조명 아래 칸막이에 세워 꽂힌 태블릿이 보임)
// + 왼쪽 번호 자물쇠 키패드 + 세로 손잡이 + 옆면 전원 스위치·환기구 + 바퀴 4개 + 충전 표시등.
// 크기: 가로 0.82 × 깊이 0.6 × 높이 0.86(바퀴 포함). 앞면 = -x (교실 쪽). 태블릿은 칸 순서대로 slots.children[0..7].
import * as THREE from 'three';
import { add, box, canvasTex, compact, cyl, font, rbox, std } from './kit';
import { buildTablet } from './items';

export const CART_SIZE = { w: 0.82, d: 0.6, h: 0.86 };

export function buildTabletCart(): { cart: THREE.Group; slots: THREE.Group; lamp: THREE.Mesh } {
  const cart = new THREE.Group();
  const W = CART_SIZE.d, L = CART_SIZE.w; // 자기 좌표: x = 깊이(앞 -x), z = 가로
  const y0 = 0.11, bodyH = CART_SIZE.h - y0, top = y0 + bodyH;
  const white = std(0xf2f3f1, 0.38, 0.15), black = std(0x15171a, 0.25, 0.3), dark = std(0x2b2f36, 0.6), chrome = std(0xc9ced3, 0.28, 0.85);
  const fx = -W / 2;
  // 몸통 + 윗판(살짝 튀어나옴) + 아래 받침 틀
  // 속이 빈 몸통 (앞 유리문 너머로 안이 보이게): 뒤판·양옆판·바닥판
  const bh = bodyH - 0.03, t = 0.025;
  add(cart, rbox(t, bh, L, 0.008), white, W / 2 - t / 2, y0 + bh / 2, 0);
  for (const s2 of [-1, 1]) add(cart, rbox(W, bh, t, 0.008), white, 0, y0 + bh / 2, s2 * (L / 2 - t / 2));
  add(cart, box(W, 0.03, L), white, 0, y0 + 0.015, 0);
  add(cart, rbox(W + 0.02, 0.03, L + 0.02, 0.008, 2), std(0xe4e6e3, 0.4, 0.1), 0, top - 0.015, 0);
  add(cart, box(W - 0.02, 0.03, L - 0.02), std(0x8a9096, 0.5, 0.4), 0, y0 - 0.01, 0);
  // 앞면 검은 유리문: 테두리 판 + 창(안이 보이는 유리) — 왼쪽(교실에서 보면 왼쪽 = +z) 넓은 띠에 키패드
  const doorY0 = y0 + 0.06, doorY1 = top - 0.07;
  const winZ0 = -L / 2 + 0.07, winZ1 = L / 2 - 0.2, winY0 = doorY0 + 0.07, winY1 = doorY1 - 0.08;
  const bar = (z0: number, z1: number, ya: number, yb: number) => add(cart, box(0.02, yb - ya, z1 - z0), black, fx - 0.01, (ya + yb) / 2, (z0 + z1) / 2);
  bar(-L / 2 + 0.03, L / 2 - 0.03, doorY0, winY0);
  bar(-L / 2 + 0.03, L / 2 - 0.03, winY1, doorY1);
  bar(-L / 2 + 0.03, winZ0, winY0, winY1);
  bar(winZ1, L / 2 - 0.03, winY0, winY1);
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fb8c8, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false });
  const gp = add(cart, new THREE.PlaneGeometry(winZ1 - winZ0, winY1 - winY0), glass, fx - 0.012, (winY0 + winY1) / 2, (winZ0 + winZ1) / 2, 0, -Math.PI / 2, 0, false);
  gp.renderOrder = 2;
  gp.userData.keep = true;
  // 안: 은은한 파란 조명 벽 + 바닥 받침 + 칸막이 10칸
  const innerX = fx + 0.03;
  add(cart, new THREE.PlaneGeometry(winZ1 - winZ0, winY1 - winY0), new THREE.MeshStandardMaterial({ color: 0xcfe6ff, emissive: 0x9cc8f5, emissiveIntensity: 0.55, roughness: 0.6 }), W / 2 - 0.04, (winY0 + winY1) / 2, (winZ0 + winZ1) / 2, 0, -Math.PI / 2, 0, false);
  add(cart, box(W - 0.1, 0.02, winZ1 - winZ0), std(0xdfe5ec, 0.5), 0.01, winY0 + 0.01, (winZ0 + winZ1) / 2);
  const slotN = 10, pitch = (winZ1 - winZ0 - 0.04) / slotN, slotY = winY0 + 0.02;
  for (let i = 0; i <= slotN; i++) {
    const z = winZ0 + 0.02 + i * pitch;
    add(cart, box(W - 0.14, 0.1, 0.006), std(0xf4f6f8, 0.35), 0.03, slotY + 0.05, z); // 아래 칸막이
    add(cart, box(0.006, winY1 - winY0 - 0.06, 0.006), std(0xb9c4cf, 0.4, 0.4), W / 2 - 0.07, (winY0 + winY1) / 2, z); // 뒤 세로 지지대
  }
  for (let i = 0; i < slotN; i++) add(cart, cyl(0.004, 0.004, 0.06, 6), dark, 0.12, slotY + 0.03, winZ0 + 0.02 + (i + 0.5) * pitch); // 충전선
  // 세워 꽂힌 태블릿 8대 (세로로, 옆면이 앞을 본다)
  const slots = new THREE.Group();
  slots.userData.keep = true;
  cart.add(slots);
  for (let i = 0; i < 8; i++) {
    const holder = new THREE.Group();
    const t = buildTablet('off', 10 + i);
    t.rotation.z = Math.PI / 2;
    holder.add(t);
    holder.rotation.y = Math.PI / 2;
    holder.position.set(0.02, slotY + 0.135 + 0.005, winZ0 + 0.02 + (i + 0.5) * pitch);
    slots.add(holder);
  }
  // 왼쪽 띠: 번호 키패드 + 이름표, 창 옆 세로 손잡이
  const kz = (winZ1 + L / 2 - 0.03) / 2;
  add(cart, rbox(0.012, 0.15, 0.08, 0.008), std(0x0d0e10, 0.3, 0.2), fx - 0.022, (winY0 + winY1) / 2 + 0.05, kz);
  const keys = canvasTex('cartKeys', 64, 128, (c, w, h) => {
    c.fillStyle = '#0d0e10';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#d8f3ff';
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) c.fillRect(10 + k * 17, 14 + r * 26, 10, 10);
  });
  add(cart, new THREE.PlaneGeometry(0.06, 0.12), new THREE.MeshStandardMaterial({ map: keys, emissive: 0xffffff, emissiveMap: keys, emissiveIntensity: 0.6 }), fx - 0.029, (winY0 + winY1) / 2 + 0.05, kz, 0, -Math.PI / 2, 0, false);
  add(cart, box(0.03, 0.2, 0.022), chrome, fx - 0.03, (winY0 + winY1) / 2 - 0.02, winZ1 + 0.035);
  const label = canvasTex('cartLabel2', 256, 48, (c, w, h) => {
    c.fillStyle = '#15171a';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff';
    c.font = font(26, 800);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('6-1 태블릿 충전함', w / 2, h / 2 + 2);
  });
  add(cart, new THREE.PlaneGeometry(0.26, 0.048), std(0xffffff, 0.5, 0, { map: label, key: 'cartLabel2' }), fx - 0.021, (winY1 + doorY1) / 2, (winZ0 + winZ1) / 2, 0, -Math.PI / 2, 0, false);
  // 충전 표시등 (초록 = 충전 완료)
  const lamp = add(cart, box(0.01, 0.018, 0.09), new THREE.MeshStandardMaterial({ color: 0x51cf66, emissive: 0x2fbf4f, emissiveIntensity: 1.4 }), fx - 0.022, (winY1 + doorY1) / 2, winZ1 + 0.06);
  // 옆면(교실에서 보면 오른쪽 = -z): 전원 스위치 둘 + 환기구
  const sz = -L / 2 - 0.003;
  add(cart, box(0.16, 0.12, 0.006), std(0xe1e3e0, 0.4), -0.05, top - 0.17, sz);
  for (const dx of [-0.09, -0.01]) add(cart, box(0.03, 0.05, 0.012), std(0xd63031, 0.4), dx, top - 0.17, sz - 0.006);
  for (let i = 0; i < 6; i++) add(cart, box(0.26, 0.01, 0.004), dark, 0.06, y0 + 0.12 + i * 0.03, sz);
  for (let i = 0; i < 6; i++) add(cart, box(0.26, 0.01, 0.004), dark, 0.06, y0 + 0.12 + i * 0.03, -sz);
  // 바퀴 4개 (받침 + 회전 축 + 바퀴)
  for (const sx of [-1, 1])
    for (const s2 of [-1, 1]) {
      const x = sx * (W / 2 - 0.07), z = s2 * (L / 2 - 0.08);
      add(cart, box(0.06, 0.012, 0.06), std(0x8a9096, 0.4, 0.6), x, y0 - 0.03, z);
      add(cart, box(0.02, 0.04, 0.05), std(0x8a9096, 0.4, 0.6), x + 0.015, y0 - 0.055, z);
      add(cart, cyl(0.04, 0.04, 0.03, 16), dark, x, 0.04, z, Math.PI / 2, 0, 0);
      add(cart, cyl(0.015, 0.015, 0.032, 10), std(0xb9bec4, 0.4, 0.6), x, 0.04, z, Math.PI / 2, 0, 0);
    }
  void innerX;
  lamp.userData.keep = true;
  compact(cart);
  return { cart, slots, lamp };
}
