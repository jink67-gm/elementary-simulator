// 소품 만들기 도구: 모양·재질·캔버스 그림을 이름으로 캐시해서 같은 물건을 여러 번 만들어도 그리기 비용이 늘지 않게 한다.
// 소품은 가까이서 자주 보는 물건이라 배경보다 세밀하게 만들되, 다각형 수는 물건 하나에 수백~천 개 안쪽으로.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FONT } from '../canvasTex';

const geos = new Map<string, THREE.BufferGeometry>();
const mats = new Map<string, THREE.Material>();
const texs = new Map<string, THREE.CanvasTexture>();

export function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geos.get(key) as T | undefined;
  if (!g) {
    g = make();
    geos.set(key, g);
  }
  return g;
}

export function mat<T extends THREE.Material>(key: string, make: () => T): T {
  let m = mats.get(key) as T | undefined;
  if (!m) {
    m = make();
    mats.set(key, m);
  }
  return m;
}

/** 표준 재질 (빛 반응 + 상호작용 강조용 emissive) */
export function std(color: number, roughness = 0.6, metalness = 0, o: { map?: THREE.Texture; transparent?: boolean; opacity?: number; side?: THREE.Side; key?: string } = {}) {
  return mat(`std|${color}|${roughness}|${metalness}|${o.key ?? ''}|${o.opacity ?? 1}|${o.side ?? 0}`, () => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, map: o.map ?? null, transparent: o.transparent ?? false, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide });
    if (o.transparent) m.depthWrite = false;
    return m;
  });
}

export function rbox(w: number, h: number, d: number, r: number, seg = 2) {
  return geo(`rbox|${w}|${h}|${d}|${r}|${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)));
}

export function box(w: number, h: number, d: number) {
  return geo(`box|${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
}

export function cyl(rt: number, rb: number, h: number, seg = 12, open = false) {
  return geo(`cyl|${rt}|${rb}|${h}|${seg}|${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
}

/** 캔버스 그림 텍스처 (한 번만 그린다) */
export function canvasTex(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, repeat = false) {
  let t = texs.get(key);
  if (!t) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    draw(cv.getContext('2d')!, w, h);
    t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    texs.set(key, t);
  }
  return t;
}

/** 다시 그릴 수 있는 캔버스 텍스처 (포스터처럼 내용이 바뀌는 것) */
export function liveTex(w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { canvas: cv, ctx: cv.getContext('2d')!, tex: t, redraw: (fn: (c: CanvasRenderingContext2D, w: number, h: number) => void) => (fn(cv.getContext('2d')!, w, h), (t.needsUpdate = true)) };
}

export function add(parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, shadow = true) {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** 곡선을 따라가는 관 (끈·지퍼·손잡이) */
export function tube(key: string, pts: [number, number, number][], r: number, segs = 24, radial = 6, closed = false) {
  return geo(`tube|${key}`, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed), segs, r, radial, closed));
}

let seed = 1;
export function rnd(s?: number) {
  if (s !== undefined) seed = s;
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
}

/** 천 결 (회색조: 재질 색과 곱해진다) */
export function fabricMap() {
  return canvasTex('fabric', 128, 128, (c, w, h) => {
    c.fillStyle = '#e9e9e9';
    c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      c.fillStyle = y % 4 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.35)';
      c.fillRect(0, y, w, 1);
    }
    for (let x = 0; x < w; x += 2) {
      c.fillStyle = x % 4 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.2)';
      c.fillRect(x, 0, 1, h);
    }
    rnd(9);
    for (let i = 0; i < 500; i++) {
      c.fillStyle = `rgba(0,0,0,${rnd() * 0.06})`;
      c.fillRect(rnd() * w, rnd() * h, 2, 1);
    }
  }, true);
}

/** 천 재질 */
export function fabric(color: number, repeat = 6) {
  return mat(`fabric|${color}|${repeat}`, () => {
    const t = fabricMap().clone();
    t.needsUpdate = true;
    t.repeat.set(repeat, repeat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({ color, roughness: 0.92, map: t });
  });
}

/** 둥근 모서리 사각형 길 (캔버스) */
export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function font(px: number, weight = 700, display = false) {
  return display ? `${px}px "Jua", ${FONT}` : `${weight} ${px}px ${FONT}`;
}

/** 위를 보는 평면 (책상·바닥에 놓인 종이·인쇄면) */
export function flatPlane(w: number, l: number) {
  return geo(`flat|${w}|${l}`, () => new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2));
}

/** 둥근 모서리 판 (카드·밑창 등): 밑면 y=0, 두께 t */
export function roundSlab(w: number, l: number, t: number, r: number) {
  return geo(`slab|${w}|${l}|${t}|${r}`, () => {
    const s = new THREE.Shape();
    const x0 = -w / 2, z0 = -l / 2;
    s.moveTo(x0 + r, z0);
    s.lineTo(x0 + w - r, z0);
    s.quadraticCurveTo(x0 + w, z0, x0 + w, z0 + r);
    s.lineTo(x0 + w, z0 + l - r);
    s.quadraticCurveTo(x0 + w, z0 + l, x0 + w - r, z0 + l);
    s.lineTo(x0 + r, z0 + l);
    s.quadraticCurveTo(x0, z0 + l, x0, z0 + l - r);
    s.lineTo(x0, z0 + r);
    s.quadraticCurveTo(x0, z0, x0 + r, z0);
    const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 5 });
    g.rotateX(Math.PI / 2); // 모양 y → -z 방향, 두께는 아래로
    g.translate(0, t, 0);
    return g;
  });
}

/**
 * 소품 하나를 재질별로 합친다 (부품 수십 개 → 재질 수만큼의 그리기 호출). 학교 PC 성능용.
 * userData.keep = true 인 메시(화면처럼 나중에 바꾸는 것)와 그 아래는 그대로 둔다.
 */
export function compact<T extends THREE.Object3D>(root: T): T {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<THREE.Material, THREE.Mesh[]>();
  const visit = (o: THREE.Object3D) => {
    if (o.userData.keep) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !Array.isArray(m.material)) groups.set(m.material, [...(groups.get(m.material) ?? []), m]);
    for (const c of o.children) visit(c);
  };
  for (const c of root.children) visit(c);
  for (const [material, meshes] of groups) {
    if (meshes.length < 2) continue;
    const parts = meshes.map((m) => {
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
      g.morphAttributes = {};
      return g;
    });
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = meshes.some((m) => m.castShadow);
    mesh.receiveShadow = true;
    mesh.renderOrder = meshes[0].renderOrder;
    for (const m of meshes) m.removeFromParent();
    root.add(mesh);
  }
  return root;
}
