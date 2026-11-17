// 학교 조경 (저사양): 느티나무·소나무·향나무와 다듬은 회양목 생울타리.
// 나무 하나 = 줄기 메시 1개 + 잎 메시 1개 (작은 덩어리 여러 개를 울퉁불퉁하게 만든 뒤 합침).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { barkMat, foliageMat } from './exteriorTex';

export type TreeKind = 'zelkova' | 'pine' | 'juniper';

function rng(seed: number) {
  let s = Math.max(1, Math.floor(seed * 9973) % 2147483647);
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** 울퉁불퉁한 잎 덩어리 (정이십면체 꼭짓점을 조금씩 흔듦) */
function clump(r: number, R: () => number, sy = 0.8) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  // 같은 위치 꼭짓점은 같은 만큼 움직여야 틈이 안 생긴다
  const seen = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let f = seen.get(k);
    if (f === undefined) seen.set(k, (f = 0.82 + R() * 0.32));
    p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * sy, p.getZ(i) * f);
  }
  g.computeVertexNormals();
  return g;
}

function limb(r0: number, r1: number, len: number, x: number, y: number, z: number, tiltX: number, tiltZ: number) {
  const g = new THREE.CylinderGeometry(r1, r0, len, 6, 1);
  g.translate(0, len / 2, 0);
  g.rotateX(tiltX);
  g.rotateZ(tiltZ);
  g.translate(x, y, z);
  return g.toNonIndexed();
}

/** 나무 하나 (밑동이 원점). 높이 대략: 느티 5.5m, 소나무 4.5m, 향나무 2.2m */
export function makeTree(kind: TreeKind, seed: number, scale = 1): THREE.Group {
  const R = rng(seed + 1);
  const wood: THREE.BufferGeometry[] = [], leaf: THREE.BufferGeometry[] = [];
  if (kind === 'zelkova') {
    const h = 2.0 + R() * 0.4;
    wood.push(limb(0.17, 0.12, h, 0, 0, 0, (R() - 0.5) * 0.08, (R() - 0.5) * 0.08));
    // 갈라지는 굵은 가지 3~4개 + 그 끝의 잎 덩어리 (위로 퍼지는 우산 모양)
    const n = 3 + Math.floor(R() * 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + R() * 0.6, tilt = 0.45 + R() * 0.25, len = 1.4 + R() * 0.5;
      wood.push(limb(0.09, 0.05, len, 0, h - 0.1, 0, Math.sin(a) * tilt, -Math.cos(a) * tilt));
      const ex = Math.cos(a) * Math.sin(tilt) * len, ez = Math.sin(a) * Math.sin(tilt) * len, ey = h + Math.cos(tilt) * len;
      const c = clump(0.95 + R() * 0.35, R, 0.7);
      c.translate(ex, ey + 0.3, ez);
      leaf.push(c);
    }
    for (let i = 0; i < 3; i++) {
      const c = clump(0.9 + R() * 0.3, R, 0.7);
      c.translate((R() - 0.5) * 0.8, h + 1.7 + R() * 0.5, (R() - 0.5) * 0.8);
      leaf.push(c);
    }
  } else if (kind === 'pine') {
    // 살짝 굽은 붉은 줄기 + 층층이 납작한 잎 덩어리
    const segs = 3;
    let x = 0, z = 0, y = 0;
    const lean = R() * Math.PI * 2;
    for (let i = 0; i < segs; i++) {
      const len = 1.2, tx = Math.sin(lean) * (0.12 + i * 0.06), tz = -Math.cos(lean) * (0.12 + i * 0.06);
      wood.push(limb(0.15 - i * 0.03, 0.12 - i * 0.03, len, x, y, z, tx, tz));
      // 마디 끝 = (-len·cos tx·sin tz, len·cos tx·cos tz, len·sin tx)
      x += -len * Math.cos(tx) * Math.sin(tz);
      z += len * Math.sin(tx);
      y += len * Math.cos(tx) * Math.cos(tz);
    }
    for (const [ly, r] of [[1.8, 1.0], [2.6, 1.15], [3.3, 0.95], [3.9, 0.6]] as [number, number][]) {
      for (let k = 0; k < 2; k++) {
        const a = R() * Math.PI * 2, d = r * 0.45;
        const c = clump(r * (0.75 + R() * 0.2), R, 0.42);
        c.translate(Math.cos(a) * d + x * (ly / y), ly + R() * 0.2, Math.sin(a) * d + z * (ly / y));
        leaf.push(c);
      }
      const br = limb(0.05, 0.03, r * 0.8, x * (ly / y), ly - 0.2, z * (ly / y), (R() - 0.5) * 2.2, (R() - 0.5) * 2.2);
      wood.push(br);
    }
  } else {
    // 향나무: 짧은 줄기 + 위로 갈수록 좁아지는 짙은 덩어리 (뾰족한 원뿔이 아니라 뭉게뭉게)
    wood.push(limb(0.07, 0.05, 0.5, 0, 0, 0, 0, 0));
    for (const [ly, r] of [[0.75, 0.55], [1.2, 0.5], [1.6, 0.4], [1.95, 0.28]] as [number, number][]) {
      for (let k = 0; k < 2; k++) {
        const c = clump(r * (0.8 + R() * 0.25), R, 0.95);
        c.translate((R() - 0.5) * r * 0.5, ly + R() * 0.1, (R() - 0.5) * r * 0.5);
        leaf.push(c);
      }
    }
  }
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(mergeGeometries(wood)!, barkMat(kind === 'pine'));
  const crown = new THREE.Mesh(mergeGeometries(leaf)!, foliageMat(kind === 'pine' ? 'pine' : kind === 'juniper' ? 'deep' : (['mid', 'light', 'deep'] as const)[Math.floor(R() * 3)]));
  trunk.castShadow = crown.castShadow = true;
  crown.receiveShadow = true;
  g.add(trunk, crown);
  g.scale.setScalar(scale);
  g.rotation.y = R() * Math.PI * 2;
  return g;
}

/** 다듬은 회양목 생울타리 (각진 상자 + 위가 살짝 둥근 덩어리) — 길이 방향 = x. 밑동이 y 0 */
export function makeHedge(len: number, h = 0.6, d = 0.55, seed = 3): THREE.Mesh {
  const R = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const body = new THREE.BoxGeometry(len, h * 0.8, d, Math.max(1, Math.round(len / 0.5)), 1, 1).toNonIndexed();
  body.translate(0, h * 0.4, 0);
  parts.push(body);
  // 윗면: 짧게 깎은 잎 덩어리 줄 (각진 모양은 유지하되 조금 울퉁불퉁)
  const n = Math.max(2, Math.round(len / 0.45));
  for (let i = 0; i < n; i++) {
    const c = clump(d * 0.52, R, 0.55);
    c.scale(len / n / (d * 0.95), 1, 1);
    c.translate(-len / 2 + (i + 0.5) * (len / n), h * 0.8, 0);
    parts.push(c);
  }
  const m = new THREE.Mesh(mergeGeometries(parts)!, foliageMat('box'));
  m.castShadow = m.receiveShadow = true;
  return m;
}
