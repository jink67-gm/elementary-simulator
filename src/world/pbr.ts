// PBR 재질 모음: CC0 텍스처(public/textures) + 직접 그린 텍스처(천장 흡음 텍스·코르크·모서리 그림자).
// 텍스처를 못 불러와도 색만 있는 재질로 대신해 게임은 그대로 돈다.
// 무늬 크기는 「미터당」으로 맞춘다: worldUV()로 상자·판의 UV를 실제 크기에 맞게 늘린다.
import * as THREE from 'three';

export type PbrId = 'terrazzo' | 'plaster' | 'oak' | 'laminate' | 'ceiling' | 'cork' | 'floorTile' | 'wallTile';
const FILES: Partial<Record<PbrId, string>> = {
  terrazzo: 'terrazzo_tiles',
  plaster: 'painted_plaster_wall',
  oak: 'oak_veneer_01',
  laminate: 'laminate_floor_02',
};
/** 한 장이 덮는 크기(미터) */
export const TILE: Record<PbrId, number> = { terrazzo: 2.4, plaster: 2.5, oak: 1.2, laminate: 2.4, ceiling: 1.8, cork: 1.0, floorTile: 1.2, wallTile: 0.8 };

const maps = new Map<PbrId, { map?: THREE.Texture; normalMap?: THREE.Texture; roughnessMap?: THREE.Texture }>();
export const pbrErrors: string[] = [];

export async function preloadPbr(anisotropy = 4) {
  const loader = new THREE.TextureLoader();
  const base = `${import.meta.env.BASE_URL}textures/`;
  const load = (url: string, srgb: boolean) =>
    loader.loadAsync(url).then((t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = anisotropy;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    });
  await Promise.all(
    (Object.entries(FILES) as [PbrId, string][]).map(async ([id, dir]) => {
      try {
        const [map, normalMap, roughnessMap] = await Promise.all([load(`${base}${dir}/diff.jpg`, true), load(`${base}${dir}/nor.jpg`, false), load(`${base}${dir}/rough.jpg`, false)]);
        maps.set(id, { map, normalMap, roughnessMap });
      } catch (e) {
        pbrErrors.push(`재질 텍스처를 못 불러왔어요: ${dir} — 단색으로 대신해요.`);
        console.error(e);
      }
    }),
  );
  maps.set('ceiling', { map: ceilingTex(), roughnessMap: undefined });
  maps.set('cork', { map: corkTex() });
  maps.set('floorTile', { map: floorTileTex(), roughnessMap: tileRoughTex(512, 2, 6) });
  maps.set('wallTile', { map: wallTileTex(), roughnessMap: tileRoughTex(512, 4, 4) });
}

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** PBR 재질 (같은 설정이면 같은 재질을 돌려줘 합치기 좋게) */
export function pbr(id: PbrId, o: { color?: number; roughness?: number; metalness?: number; normalScale?: number; envMapIntensity?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${id}|${o.color ?? ''}|${o.roughness ?? ''}|${o.metalness ?? ''}|${o.normalScale ?? ''}|${o.envMapIntensity ?? ''}`;
  let m = cache.get(key);
  if (m) return m;
  const t = maps.get(id) ?? {};
  m = new THREE.MeshStandardMaterial({
    color: o.color ?? 0xffffff,
    map: t.map ?? null,
    normalMap: t.normalMap ?? null,
    roughnessMap: t.roughnessMap ?? null,
    roughness: o.roughness ?? 1,
    metalness: o.metalness ?? 0,
    envMapIntensity: o.envMapIntensity ?? 1,
  });
  if (t.normalMap) m.normalScale.setScalar(o.normalScale ?? 1);
  if (!t.map) m.color.setHex(o.color ?? FALLBACK[id]);
  m.userData.pbr = true;
  cache.set(key, m);
  return m;
}
const FALLBACK: Record<PbrId, number> = { terrazzo: 0xc9c9c3, plaster: 0xf3f1ec, oak: 0xb07d4f, laminate: 0xc4a27a, ceiling: 0xf2f0ea, cork: 0xb98a5a, floorTile: 0xd9d6cc, wallTile: 0xf4f4f1 };

/** 색만 있는 표준 재질 (도장 금속·플라스틱 등) */
export function paint(color: number, roughness = 0.6, metalness = 0): THREE.MeshStandardMaterial {
  const key = `paint|${color}|${roughness}|${metalness}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.userData.pbr = true;
    cache.set(key, m);
  }
  return m;
}

export function isPbrMaterial(m: THREE.Material) {
  return !!m.userData.pbr;
}

/** 상자·판 UV를 실제 크기(미터)/무늬 크기로 늘린다 */
export function worldUV(geo: THREE.BufferGeometry, w: number, h: number, d: number, tile: number) {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  if (geo.type === 'PlaneGeometry') {
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
  } else {
    // BoxGeometry 면 순서: +x, -x, +y, -y, +z, -z (면마다 정점 4개)
    const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

// ───────── 직접 그린 텍스처 ─────────
function canvasTex(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void, srgb = true) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d')!;
  draw(c, size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** 천장 흡음 텍스: 600mm 판 3x3, 작은 구멍 무늬, 은색 T바 */
function ceilingTex() {
  return canvasTex(512, (c, s) => {
    c.fillStyle = '#f1efe8';
    c.fillRect(0, 0, s, s);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 5200; i++) {
      c.fillStyle = `rgba(120,115,105,${0.18 + rnd() * 0.3})`;
      const r = 0.6 + rnd() * 1.1;
      c.beginPath();
      c.arc(rnd() * s, rnd() * s, r, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = '#c9c6bd';
    c.lineWidth = 5;
    for (let k = 0; k <= 3; k++) {
      c.beginPath();
      c.moveTo((k * s) / 3, 0);
      c.lineTo((k * s) / 3, s);
      c.moveTo(0, (k * s) / 3);
      c.lineTo(s, (k * s) / 3);
      c.stroke();
    }
  });
}

/** 급식실 바닥 타일: 600mm 자기질 타일 2x2, 옅은 얼룩 + 줄눈 */
function floorTileTex() {
  return canvasTex(512, (c, s) => {
    let seed = 23;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = 2, t = s / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const v = 214 + Math.floor(rnd() * 8);
        c.fillStyle = `rgb(${v},${v - 2},${v - 9})`;
        c.fillRect(i * t, j * t, t, t);
        for (let k = 0; k < 900; k++) {
          c.fillStyle = `rgba(${150 + rnd() * 60},${145 + rnd() * 60},${135 + rnd() * 50},0.18)`;
          c.fillRect(i * t + rnd() * t, j * t + rnd() * t, 1 + rnd() * 3, 1 + rnd() * 3);
        }
      }
    c.fillStyle = '#a9a69d';
    for (let k = 0; k <= n; k++) {
      c.fillRect((k * s) / n - 2, 0, 4, s);
      c.fillRect(0, (k * s) / n - 2, s, 4);
    }
  });
}

/** 벽 타일: 200mm 흰 유광 타일 4x4 + 회색 줄눈 */
function wallTileTex() {
  return canvasTex(512, (c, s) => {
    const n = 4, t = s / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const g = c.createLinearGradient(i * t, j * t, i * t + t, j * t + t);
        g.addColorStop(0, '#fbfbf9');
        g.addColorStop(1, '#eeeeea');
        c.fillStyle = g;
        c.fillRect(i * t, j * t, t, t);
      }
    c.fillStyle = '#c3c4bf';
    for (let k = 0; k <= n; k++) {
      c.fillRect((k * s) / n - 3, 0, 6, s);
      c.fillRect(0, (k * s) / n - 3, s, 6);
    }
  });
}

/** 타일 거칠기: 타일 면은 매끈(반사), 줄눈은 거칠게 */
function tileRoughTex(size: number, n: number, grout: number) {
  return canvasTex(size, (c, s) => {
    c.fillStyle = '#4a4a4a';
    c.fillRect(0, 0, s, s);
    c.fillStyle = '#f0f0f0';
    for (let k = 0; k <= n; k++) {
      c.fillRect((k * s) / n - grout / 2, 0, grout, s);
      c.fillRect(0, (k * s) / n - grout / 2, s, grout);
    }
  }, false);
}

function corkTex() {
  return canvasTex(256, (c, s) => {
    c.fillStyle = '#c08d5c';
    c.fillRect(0, 0, s, s);
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2600; i++) {
      c.fillStyle = ['#a9744a', '#d4a373', '#8f5f3a', '#cfa070'][i % 4];
      c.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 3, 1 + rnd() * 3);
    }
  });
}

/** 모서리 그림자(가짜 AO): 한쪽 끝이 어둡고 점점 투명해지는 띠 */
let aoMat: THREE.MeshBasicMaterial | null = null;
export function aoMaterial() {
  if (aoMat) return aoMat;
  const cv = document.createElement('canvas');
  cv.width = 4;
  cv.height = 64;
  const c = cv.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.42)');
  g.addColorStop(0.35, 'rgba(0,0,0,0.14)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 4, 64);
  const t = new THREE.CanvasTexture(cv);
  aoMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  return aoMat;
}

/** 하늘 그라데이션 배경 */
export function skyTexture() {
  const cv = document.createElement('canvas');
  cv.width = 4;
  cv.height = 256;
  const c = cv.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#6fb3e8');
  g.addColorStop(0.55, '#b9dcf5');
  g.addColorStop(1, '#eef6fb');
  c.fillStyle = g;
  c.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
