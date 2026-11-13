// 내빈용 실내 슬리퍼 (직접 만든 모델 — 이 프로젝트 안에서 CC0로 공개).
// 앞이 막힌 슬리퍼: 둥근 발바닥 밑창 + 발등 덮개. 내빈용은 검정. 길이 0.26m, 원점 = 밑창 바닥 가운데, 앞코 = +z.
import * as THREE from 'three';
import { paint } from './pbr';

let soleGeo: THREE.BufferGeometry | null = null;
let upperGeo: THREE.BufferGeometry | null = null;
let bandGeo: THREE.BufferGeometry | null = null;

function geos() {
  if (!soleGeo) {
    // 발 모양 밑창: 뒤꿈치(좁음) → 앞(넓음)
    const s = new THREE.Shape();
    const heel = { z: -0.085, r: 0.04 }, toe = { z: 0.072, r: 0.052 };
    s.absarc(0, heel.z, heel.r, Math.PI, Math.PI * 2, false);
    s.lineTo(toe.r, toe.z);
    s.absarc(0, toe.z, toe.r, 0, Math.PI, false);
    s.lineTo(-heel.r, heel.z);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 16 });
    // x·y 평면에 그린 모양을 바닥에 눕힌다: 두께는 위(+y), 앞코는 +z
    g.rotateX(-Math.PI / 2);
    g.rotateY(Math.PI);
    g.translate(0, 0.004, 0);
    soleGeo = g;
    // 발등 덮개: 앞쪽 위 1/4 타원구 (천)
    const u = new THREE.SphereGeometry(1, 20, 8, 0, Math.PI, 0, Math.PI / 2);
    u.scale(0.056, 0.048, 0.092);
    u.translate(0, 0.022, 0.012);
    upperGeo = u;
    // 덮개 입구 테두리 (밝은 띠)
    const b = new THREE.TorusGeometry(0.056, 0.006, 6, 20, Math.PI);
    b.scale(1, 0.86, 1);
    b.translate(0, 0.022, 0.012);
    bandGeo = b;
  }
  return { sole: soleGeo!, upper: upperGeo!, band: bandGeo! };
}

/** 슬리퍼 한 짝 */
export function makeSlipper(color = 0x1d1e21, soleColor = 0x2c2d30): THREE.Group {
  const g = geos();
  const grp = new THREE.Group();
  const upperM = paint(color, 0.95);
  upperM.side = THREE.DoubleSide;
  const parts: [THREE.BufferGeometry, THREE.Material][] = [
    [g.sole, paint(soleColor, 0.75)],
    [g.upper, upperM],
    [g.band, paint(0x3a3c40, 0.7)],
  ];
  for (const [geo, m] of parts) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = mesh.receiveShadow = true;
    grp.add(mesh);
  }
  return grp;
}

/** 슬리퍼 한 켤레 (가운데 원점, 앞코 = +z). 살짝 벌어지게 놓는다 */
export function makeSlipperPair(color?: number, soleColor?: number): THREE.Group {
  const pair = new THREE.Group();
  for (const s of [-1, 1]) {
    const one = makeSlipper(color, soleColor);
    one.position.x = s * 0.058;
    one.rotation.y = s * 0.04;
    pair.add(one);
  }
  return pair;
}
