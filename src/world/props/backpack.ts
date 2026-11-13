// 초등학생 책가방: 둥근 몸통, 앞주머니(반사띠·지퍼), 지퍼 라인, 손잡이, 어깨끈 2개(패드), 양옆 물병 주머니(한쪽엔 물병), 등판 패드, 바닥 보강.
// 상태: 'floor' 바닥·의자에 세워 둠 / 'hung' 책상 고리에 걸림(손잡이로 매달리고 끈이 늘어짐) / 'worn' 등에 멤(끈이 어깨를 감음).
// 가방 자체 좌표: 앞면 = +z, 등판 = -z, 바닥 = -H/2. 'worn'만 캐릭터 등 부착점(backSocket) 좌표로 돌려 놓는다.
import * as THREE from 'three';
import { add, box, compact, cyl, fabric, geo, rbox, std, tube } from './kit';

export type BagState = 'floor' | 'hung' | 'worn';

const W = 0.34, H = 0.4, D = 0.17;

/** 납작한 끈 (곡선을 x=0에서 만들고 옆으로 넓힌다) */
function strapGeo(key: string, pts: [number, number, number][]) {
  return geo(`strap|${key}`, () => {
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(0, p[1], p[2]))), 20, 0.011, 6);
    g.scale(2.3, 1, 1);
    return g;
  });
}

function bagBody(color: number, accent: number): THREE.Group {
  const g = new THREE.Group();
  const main = fabric(color, 5);
  const dark = fabric(new THREE.Color(color).multiplyScalar(0.72).getHex(), 5);
  const acc = fabric(accent, 4);
  const zip = std(0x2b2d33, 0.6);
  const metal = std(0xc9ced3, 0.3, 0.85);
  add(g, rbox(W, H, D, 0.07, 3), main);
  add(g, rbox(W + 0.004, 0.035, D + 0.004, 0.016), dark, 0, -H / 2 + 0.0175, 0); // 바닥 보강
  // 앞주머니 + 반사띠 + 주머니 지퍼
  add(g, rbox(0.26, 0.18, 0.07, 0.035, 3), acc, 0, -0.085, D / 2 + 0.008);
  add(g, box(0.2, 0.018, 0.004), std(0xdfe3e6, 0.25, 0.5), 0, -0.035, D / 2 + 0.044);
  add(g, tube('bag-pocketzip', [[-0.115, -0.012, D / 2 + 0.036], [-0.06, 0.0, D / 2 + 0.041], [0.06, 0.0, D / 2 + 0.041], [0.115, -0.012, D / 2 + 0.036]], 0.004, 16, 5), zip);
  add(g, box(0.01, 0.026, 0.005), metal, 0.07, -0.012, D / 2 + 0.045, 0, 0, 0.2);
  // 큰 지퍼: 옆 → 위 → 옆 (앞판과 옆판 이음매)
  const zz = D / 2 - 0.035;
  add(g, tube('bag-mainzip', [[-W / 2 - 0.003, -0.13, zz], [-W / 2 - 0.003, H / 2 - 0.08, zz], [-W / 2 + 0.05, H / 2 + 0.003, zz], [W / 2 - 0.05, H / 2 + 0.003, zz], [W / 2 + 0.003, H / 2 - 0.08, zz], [W / 2 + 0.003, -0.13, zz]], 0.005, 40, 5), zip);
  for (const x of [-0.04, 0.05]) {
    add(g, box(0.012, 0.03, 0.006), metal, x, H / 2 - 0.004, zz + 0.012, 0.5, 0, 0);
    add(g, box(0.02, 0.008, 0.008), std(0xffc845, 0.6), x, H / 2 - 0.018, zz + 0.024, 0.5, 0, 0); // 지퍼 고리 끈
  }
  // 손잡이
  add(g, geo('bag-handle', () => new THREE.TorusGeometry(0.045, 0.009, 6, 14, Math.PI)), dark, 0, H / 2 - 0.012, -0.035);
  // 양옆 물병 주머니 (한쪽엔 물병)
  for (const s of [-1, 1]) {
    add(g, rbox(0.045, 0.14, 0.12, 0.02), acc, s * (W / 2 + 0.012), -0.115, 0.0);
    add(g, box(0.048, 0.012, 0.122), dark, s * (W / 2 + 0.013), -0.05, 0.0);
  }
  add(g, cyl(0.026, 0.026, 0.15, 14), std(0x9fd3f0, 0.15, 0.1, { transparent: true, opacity: 0.85, key: 'bottle' }), W / 2 + 0.02, -0.06, 0.01);
  add(g, cyl(0.022, 0.022, 0.03, 14), std(0xff6b6b, 0.5), W / 2 + 0.02, 0.03, 0.01);
  // 등판 패드
  add(g, rbox(W - 0.07, H - 0.1, 0.022, 0.01), std(0x3a3f47, 0.9), 0, 0.0, -D / 2 - 0.006);
  // 이름표 (앞주머니 위 투명 창)
  add(g, box(0.06, 0.035, 0.003), std(0xffffff, 0.4), -0.085, 0.07, D / 2 - 0.004);
  return g;
}

export function buildBackpack(state: BagState = 'floor', color = 0x3f6fd8, accent = 0xffc845): THREE.Group {
  const root = new THREE.Group();
  root.name = 'backpack';
  const strapM = std(0x2b2d42, 0.85);
  const buckle = std(0x9aa1a8, 0.4, 0.6);
  if (state === 'worn') {
    // 등 부착점 좌표: 캐릭터 등면 z ≈ -0.01, 가방은 -z 쪽, 끈은 어깨 위로 넘어 가슴 앞(+z)으로
    const body = bagBody(color, accent);
    body.rotation.y = Math.PI;
    body.position.set(0, -0.01, -0.01 - D / 2 - 0.016);
    root.add(body);
    for (const x of [-0.11, 0.11]) {
      const pts: [number, number, number][] = [[x, 0.16, -0.035], [x, 0.25, -0.01], [x, 0.272, 0.08], [x, 0.235, 0.2], [x, 0.12, 0.238], [x, -0.03, 0.238], [x * 1.25, -0.14, 0.18], [x * 1.35, -0.18, 0.06], [x, -0.17, -0.035]];
      add(root, tube(`bag-worn-${x}`, pts, 0.012, 36, 6), strapM);
      add(root, box(0.05, 0.03, 0.012), buckle, x, -0.04, 0.244);
    }
    return compact(root);
  }
  const body = bagBody(color, accent);
  root.add(body);
  // 등판 쪽 어깨끈: 위에서 아래로 고리 모양 (매달리면 더 늘어진다)
  const sag = state === 'hung' ? 0.075 : 0.05;
  for (const x of [-0.085, 0.085]) {
    const pts: [number, number, number][] = [[0, H / 2 - 0.05, -D / 2 - 0.012], [0, H / 2 - 0.12, -D / 2 - sag], [0, 0.0, -D / 2 - sag - 0.008], [0, -H / 2 + 0.13, -D / 2 - sag + 0.01], [0, -H / 2 + 0.05, -D / 2 - 0.014]];
    const m = add(body, strapGeo(`${state}`, pts), strapM);
    m.position.x = x;
    add(body, box(0.045, 0.028, 0.012), buckle, x, -0.03, -D / 2 - sag - 0.012);
  }
  if (state === 'hung') body.rotation.x = -0.05;
  return compact(root);
}

export const BAG_SIZE = { W, H, D };
