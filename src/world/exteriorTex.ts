// 건물 바깥 재질 (직접 그린 캔버스 텍스처): 크림색 외벽, 차분한 벽돌, 화강석 판석, 보도블록, 화단 흙.
// 무늬는 「미터당」 크기로 그려서 worldUV(geo, w, h, d, TILE_EXT.xxx)와 함께 쓴다. 같은 재질을 여러 곳이 나눠 써서 합치기 좋다.
import * as THREE from 'three';

export const TILE_EXT = { stucco: 3, brick: 1.2, granite: 1.2, paver: 1.0, soil: 2, granitePlinth: 1.8, grass: 2.5 };

function canvasTex(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void, srgb = true) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d')!;
  draw(c, size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 잔 얼룩 (같은 seed면 같은 무늬) */
function speckle(c: CanvasRenderingContext2D, s: number, n: number, colors: string[], maxR: number, seed = 7) {
  let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    c.fillStyle = colors[Math.floor(rnd() * colors.length)];
    c.globalAlpha = 0.25 + rnd() * 0.45;
    c.fillRect(rnd() * s, rnd() * s, 1 + rnd() * maxR, 1 + rnd() * maxR);
  }
  c.globalAlpha = 1;
}

const mats = new Map<string, THREE.MeshStandardMaterial>();
function mat(key: string, make: () => THREE.MeshStandardMaterial) {
  let m = mats.get(key);
  if (!m) {
    m = make();
    m.userData.pbr = true; // 정적 메시 합치기 대상
    mats.set(key, m);
  }
  return m;
}

/** 크림색 뿜칠 외벽 (3m마다 옅은 줄눈) */
export const stuccoMat = () =>
  mat('stucco', () => {
    const map = canvasTex(256, (c, s) => {
      c.fillStyle = '#efe6d3';
      c.fillRect(0, 0, s, s);
      speckle(c, s, 2600, ['#e4d9c3', '#f7f0e2', '#ddd1b9'], 2.2);
      c.fillStyle = 'rgba(150, 135, 110, 0.35)';
      c.fillRect(0, s - 2, s, 2);
      c.fillRect(s - 2, 0, 2, s);
    });
    return new THREE.MeshStandardMaterial({ map, roughness: 0.92 });
  });

/** 차분한 적갈색 벽돌 (포인트용): 1.2m에 16단 × 6장, 밝은 줄눈 */
export const brickMat = () =>
  mat('brick', () => {
    const map = canvasTex(512, (c, s) => {
      c.fillStyle = '#d9d2c5'; // 줄눈
      c.fillRect(0, 0, s, s);
      const rows = 16, cols = 6, bh = s / rows, bw = s / cols;
      let r = 11;
      const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
      const tones = ['#a8644a', '#b06c50', '#9d5c44', '#b8775a', '#a35f47', '#96553f'];
      for (let y = 0; y < rows; y++)
        for (let x = -1; x < cols; x++) {
          const ox = (x + (y % 2) * 0.5) * bw;
          c.fillStyle = tones[Math.floor(rnd() * tones.length)];
          c.fillRect(ox + 2, y * bh + 2, bw - 4, bh - 4);
        }
      speckle(c, s, 3000, ['#7f4634', '#c98b6c', '#8a4c39'], 2);
    });
    return new THREE.MeshStandardMaterial({ map, roughness: 0.88 });
  });

/** 회색 화강석 판석 (60cm, 가는 줄눈) — 현관 앞 바닥, 받침돌 */
export const graniteMat = (tone: 'light' | 'dark' = 'light') =>
  mat('granite' + tone, () => {
    const map = canvasTex(256, (c, s) => {
      const base = tone === 'light' ? '#c3c1bb' : '#8d8f91';
      c.fillStyle = base;
      c.fillRect(0, 0, s, s);
      speckle(c, s, 4200, tone === 'light' ? ['#9e9c97', '#dcdad4', '#7d7b77', '#e8e6e0'] : ['#6f7173', '#a7a9aa', '#5c5e60'], 1.6, tone === 'light' ? 5 : 9);
      c.fillStyle = 'rgba(60, 60, 60, 0.45)';
      for (const p of [0, s / 2]) {
        c.fillRect(0, p, s, 2);
        c.fillRect(p, 0, 2, s);
      }
    });
    return new THREE.MeshStandardMaterial({ map, roughness: 0.62 });
  });

/** 화강석 받침(벽 아래 띠): 줄눈 없이 결만 */
export const plinthMat = () =>
  mat('plinth', () => {
    const map = canvasTex(256, (c, s) => {
      c.fillStyle = '#a9a8a3';
      c.fillRect(0, 0, s, s);
      speckle(c, s, 4000, ['#87857f', '#c9c7c1', '#6f6d68'], 1.8, 3);
      c.fillStyle = 'rgba(70, 70, 70, 0.4)';
      c.fillRect(s - 2, 0, 2, s);
    });
    return new THREE.MeshStandardMaterial({ map, roughness: 0.6 });
  });

/** 보도블록 (회색·연한 적색 섞인 사각 블록, 반씩 엇갈림) */
export const paverMat = () =>
  mat('paver', () => {
    const map = canvasTex(256, (c, s) => {
      c.fillStyle = '#6f6a64';
      c.fillRect(0, 0, s, s);
      const n = 5, b = s / n;
      let r = 21;
      const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
      const tones = ['#b9b2a8', '#c4bdb2', '#aaa298', '#c9a99a', '#b8978a'];
      for (let y = 0; y < n * 2; y++)
        for (let x = -1; x < n; x++) {
          const ox = (x + (y % 2) * 0.5) * b;
          c.fillStyle = tones[Math.floor(rnd() * tones.length)];
          c.fillRect(ox + 2, (y * b) / 2 + 2, b - 4, b / 2 - 4);
        }
      speckle(c, s, 1500, ['#8c857c', '#d6d0c6'], 1.5, 13);
    });
    return new THREE.MeshStandardMaterial({ map, roughness: 0.85 });
  });

/** 화단 흙 + 나무 껍질 덮개 */
export const soilMat = () =>
  mat('soil', () => {
    const map = canvasTex(256, (c, s) => {
      c.fillStyle = '#5d4535';
      c.fillRect(0, 0, s, s);
      speckle(c, s, 3500, ['#7a5a40', '#463326', '#8c6a4a', '#3a2a1f'], 3.5, 17);
    });
    return new THREE.MeshStandardMaterial({ map, roughness: 1 });
  });

/** 잔디 (짧게 깎은 학교 화단 잔디) */
export const grassMat = () =>
  mat('grass', () => {
    const map = canvasTex(256, (c, s) => {
      c.fillStyle = '#6e9a4a';
      c.fillRect(0, 0, s, s);
      speckle(c, s, 6000, ['#5c8a3c', '#83ad5a', '#4f7c34', '#94b866'], 2.5, 29);
    });
    return new THREE.MeshStandardMaterial({ map, roughness: 0.95 });
  });
