// 정문(현관 바깥) 꾸미기: 벽돌 포인트 현관 동, 깊은 캐노피 + 초록 학교 이름 간판 + 타일 원기둥, 스테인리스 유리문 줄(시트지·점자블록),
// 화강석 현관 앞 바닥 + 보도블록 길, 화강석 경계석 화단(관목·꽃·조경석), 화분, 교훈석, 볼라드.
// 좌표: 1층 바닥 y = FLOOR1_Y 기준. 현관 동 x 14.9~18.0, z -4.5~1.0, 유리 출입문 x = 18.0 (문 z -2.6~-0.4).
// 바깥 마당(플레이어가 걸을 수 있는 곳)은 x 18.2~24.6, z -7.2~4.2 — 그 둘레 충돌은 SchoolMap.buildFirstFloor.
import * as THREE from 'three';
import { aabb } from './Collision';
import { CanvasTex } from './canvasTex';
import { HQBuilder } from './hq';
import { LOBBY } from './FirstFloorHQ';
import { FLOOR1_Y, STOREY } from './rooms';
import { paint, worldUV } from './pbr';
import { SCHOOL_MOTTO, SCHOOL_NAME } from '../data/school';
import { TILE_EXT, brickMat, graniteMat, grassMat, paverMat, plinthMat, soilMat, stuccoMat } from './exteriorTex';
import { FONT } from './canvasTex';

const L = LOBBY;
/** 출입문 가운데 z */
const DOOR_Z = (L.doorZ0 + L.doorZ1) / 2;
/** 현관 동 앞면 (벽돌 기둥 포함) z 범위 */
const FRONT_Z0 = L.z0 - 0.12, FRONT_Z1 = L.z1 + 0.12;
/** 캐노피 */
const CANOPY = { x0: L.x1, x1: 21.0, z0: DOOR_Z - 4.3, z1: DOOR_Z + 4.3, bottom: 2.85, top: 3.25 };
/** 정면 유리문 줄 (스테인리스 틀): 벽돌 기둥 사이 z 범위. 가운데 두 짝(L.doorZ0~doorZ1)은 열어 둔 출입문 */
const SHOP_Z0 = -4.25, SHOP_Z1 = 0.45;
/** 시트지 그림의 가로 위치 (바깥에서 볼 때 왼쪽 = +z) */
const filmU = (z: number) => (SHOP_Z1 - z) / (SHOP_Z1 - SHOP_Z0);

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export class EntranceBuilder extends HQBuilder {
  private doorGlass = new THREE.MeshStandardMaterial({ color: 0xc6e0ec, transparent: true, opacity: 0.24, roughness: 0.04, metalness: 0.15, envMapIntensity: 1.5, depthWrite: false });
  private leafMats = [paint(0x4f7f3d, 0.85), paint(0x5f9447, 0.85), paint(0x3f6e33, 0.85), paint(0x6d9e4f, 0.85)];

  build() {
    this.y = FLOOR1_Y;
    this.level = 0;
    this.entranceBlock();
    this.doors();
    this.canopy();
    this.paving();
    this.planting();
  }

  /** 판 (위를 보는 바닥판) — worldUV로 무늬 크기를 미터에 맞춘다 */
  private ground(w: number, d: number, mat: THREE.Material, tile: number, x: number, z: number, y: number) {
    const m = this.add(worldUV(new THREE.PlaneGeometry(w, d), w, d, 0, tile), mat, x, y, z, { cast: false });
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  /** 세운 판 (ry 방향을 바라봄) */
  private facePlane(w: number, h: number, mat: THREE.Material, tile: number, x: number, y: number, z: number, ry: number) {
    return this.add(worldUV(new THREE.PlaneGeometry(w, h), w, h, 0, tile), mat, x, y, z, { cast: false, ry });
  }

  private solid(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, tile = 0) {
    const m = this.box(w, h, d, mat, x, y, z, true, tile);
    this.colliders.push({ ...aabb(x, z, w, d), level: this.level });
    return m;
  }

  // ───────── 현관 동: 벽돌 옆벽 + 벽돌 기둥 + 위 크림색 띠 + 화강석 받침·두겁 ─────────
  private entranceBlock() {
    const brick = brickMat(), stone = plinthMat(), stucco = stuccoMat();
    const xA = 14.9, xB = L.x1 + 0.35, xc = (xA + xB) / 2, w = xB - xA;
    // 현관 동 남·북 바깥벽: 벽돌 마감 + 아래 화강석 받침
    for (const [z, ry] of [[L.z0 - 0.104, Math.PI], [L.z1 + 0.104, 0]] as [number, number][]) {
      this.facePlane(w, STOREY, brick, TILE_EXT.brick, xc, STOREY / 2, z, ry);
      const dz = ry ? -0.03 : 0.03;
      this.box(w, 0.42, 0.06, stone, xc, 0, z + dz, false, TILE_EXT.granitePlinth);
    }
    // 앞면 벽돌 기둥 두 개 (유리 옆)
    const pierD = 0.5, pierX = L.x1 + 0.08;
    for (const [z0, z1] of [[FRONT_Z0, SHOP_Z0], [SHOP_Z1, FRONT_Z1]]) {
      const zc = (z0 + z1) / 2, pw = z1 - z0;
      this.solid(pierD, CANOPY.bottom, pw, brick, pierX, 0, zc, TILE_EXT.brick);
      this.box(pierD + 0.06, 0.42, pw + 0.06, stone, pierX, 0, zc, false, TILE_EXT.granitePlinth);
    }
    // 유리 위 앞 띠벽 (캐노피 뒤, 크림색) + 두겁돌
    const band = this.box(0.42, STOREY - 2.62, FRONT_Z1 - FRONT_Z0, stucco, L.x1 + 0.1, 2.62, DOOR_Z - 0.25, false, TILE_EXT.stucco);
    this.blockers.push(band);
    this.box(0.56, 0.1, FRONT_Z1 - FRONT_Z0 + 0.14, stone, L.x1 + 0.1, STOREY, (FRONT_Z0 + FRONT_Z1) / 2, false, TILE_EXT.granitePlinth);
    for (const z of [L.z0 - 0.06, L.z1 + 0.06]) this.box(xB - xA, 0.1, 0.34, stone, xc, STOREY, z, false, TILE_EXT.granitePlinth);
  }

  // ───────── 유리문 줄: 스테인리스 틀, 위 초록빛 채광창, 아래 시트지 그림, 긴 막대 손잡이, 가운데 두 짝은 열어 둠 ─────────
  private doors() {
    const x = L.x1, st = this.chrome, g = this.doorGlass;
    const transom = new THREE.MeshStandardMaterial({ color: 0x4f9d74, transparent: true, opacity: 0.55, roughness: 0.08, metalness: 0.2, depthWrite: false });
    const handleM = paint(0x8a3b2a, 0.45);
    const film = this.filmTexture();
    const fw = 0.07, DH = 2.2, TOP = 2.66;
    const filmY0 = 0.22, filmY1 = 1.08;
    // 세로 틀
    for (const z of [SHOP_Z0, -3.425, L.doorZ0, L.doorZ1, SHOP_Z1]) this.box(fw, TOP, fw + 0.02, st, x, 0, z);
    // 문 위 가로 틀 + 맨 위 틀 + 초록 채광창
    this.box(fw, 0.08, SHOP_Z1 - SHOP_Z0, st, x, DH, (SHOP_Z0 + SHOP_Z1) / 2);
    this.box(fw + 0.02, 0.08, SHOP_Z1 - SHOP_Z0, st, x, TOP - 0.08, (SHOP_Z0 + SHOP_Z1) / 2);
    this.box(0.02, TOP - DH - 0.16, SHOP_Z1 - SHOP_Z0, transom, x, DH + 0.08, (SHOP_Z0 + SHOP_Z1) / 2, false);
    // 닫힌 문 (틀 + 유리 + 시트지 + 손잡이)
    const closed = (z0: number, z1: number, handleAt: number) => {
      const zc = (z0 + z1) / 2, w = z1 - z0;
      this.box(fw - 0.02, 0.14, w - fw, st, x, 0, zc);
      this.box(0.02, DH - 0.14, w - fw, g, x, 0.14, zc, false);
      this.filmPlane(film, w - fw - 0.04, filmY0, filmY1, x + 0.016, zc);
      for (const s of [-1, 1]) this.add(new THREE.CylinderGeometry(0.018, 0.018, 0.95, 10), handleM, x + s * 0.06, 1.15, handleAt);
    };
    closed(SHOP_Z0, -3.425, -3.425 - 0.12);
    closed(-3.425, L.doorZ0, -3.425 + 0.12);
    closed(L.doorZ1, SHOP_Z1, L.doorZ1 + 0.12);
    // 열어 둔 양여닫이 (안쪽으로)
    for (const [hz, dir, rot] of [[L.doorZ0 + 0.04, 1, -1.25], [L.doorZ1 - 0.04, -1, 1.25]] as [number, 1 | -1, number][]) {
      const leaf = new THREE.Group();
      leaf.position.set(x, this.y, hz);
      leaf.rotation.y = rot;
      this.root.add(leaf);
      const W = (L.doorZ1 - L.doorZ0) / 2 - 0.05;
      const part = (w: number, h: number, d: number, m: THREE.Material, px: number, py: number, pz: number, geo?: THREE.BufferGeometry) => {
        const mesh = new THREE.Mesh(geo ?? new THREE.BoxGeometry(w, h, d), m);
        mesh.position.set(px, py + (geo ? 0 : h / 2), pz);
        mesh.castShadow = m !== g;
        leaf.add(mesh);
      };
      part(0.05, DH - 0.04, 0.06, st, 0, 0.02, dir * 0.03);
      part(0.05, DH - 0.04, 0.06, st, 0, 0.02, dir * (W - 0.03));
      part(0.05, 0.14, W, st, 0, 0.02, (dir * W) / 2);
      part(0.05, 0.07, W, st, 0, DH - 0.09, (dir * W) / 2);
      part(0.02, DH - 0.25, W - 0.08, g, 0, 0.16, (dir * W) / 2);
      // 시트지 (문짝에도): 문이 닫혔을 때 자리의 그림 조각
      const zc = dir > 0 ? L.doorZ0 + W / 2 : L.doorZ1 - W / 2;
      const fg = this.filmGeo(W - 0.1, filmY1 - filmY0, zc);
      for (const sx of [-1, 1]) {
        const fm = new THREE.Mesh(fg, film);
        fm.position.set(sx * 0.014, (filmY0 + filmY1) / 2, (dir * W) / 2);
        fm.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (dir < 0) fm.rotation.y += Math.PI;
        leaf.add(fm);
      }
      for (const s of [-1, 1]) part(0, 0, 0, handleM, s * 0.055, 1.15, dir * (W - 0.13), new THREE.CylinderGeometry(0.018, 0.018, 0.95, 10));
    }
    // 문 앞: 노란 점자블록 줄 + 짙은 발판
    const dots = new CanvasTex(64, 64);
    dots.draw((c, w, h) => {
      c.fillStyle = '#f2c230';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#d9a91a';
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        c.beginPath();
        c.arc(8 + i * 16, 8 + j * 16, 4.5, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(0, 0, w, 1);
      c.fillRect(0, 0, 1, h);
    });
    dots.tex.wrapS = dots.tex.wrapT = THREE.RepeatWrapping;
    const tactile = new THREE.MeshStandardMaterial({ map: dots.tex, roughness: 0.7 });
    tactile.userData.pbr = true;
    this.ground(0.3, SHOP_Z1 - SHOP_Z0, tactile, 0.3, x + 0.42, (SHOP_Z0 + SHOP_Z1) / 2, 0.016);
    this.ground(1.1, 2.0, paint(0x3e4650, 0.95), 1, x + 1.2, DOOR_Z, 0.016);
    this.ground(0.9, 1.4, paint(0x3e4650, 0.95), 1, x + 1.1, -3.5, 0.016);
  }

  /** 유리문 아래쪽 시트지 그림: 흰 바탕 + 주황 물결 띠 + 초록 언덕 + 병아리·나비 + 작은 학교 이름 */
  private filmTexture(): THREE.Material {
    const t = new CanvasTex(2048, 372);
    t.draw((c, w, h) => {
      c.fillStyle = 'rgba(255,255,255,0.93)';
      c.fillRect(0, 0, w, h);
      // 주황 물결 띠
      c.strokeStyle = '#f39a2b';
      c.lineWidth = 34;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-20, 60);
      for (let x = 0; x <= w + 40; x += 20) c.lineTo(x, 70 + Math.sin(x / 190) * 38);
      c.stroke();
      // 초록 언덕
      c.fillStyle = '#8fd16a';
      c.beginPath();
      c.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) c.lineTo(x, h - 70 - Math.sin(x / 140) * 22 - Math.sin(x / 57) * 8);
      c.lineTo(w, h);
      c.fill();
      c.fillStyle = '#6cbf4c';
      c.beginPath();
      c.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) c.lineTo(x, h - 38 - Math.sin(x / 90 + 1) * 14);
      c.lineTo(w, h);
      c.fill();
      // 병아리·꽃·나비
      let r = 3;
      const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 18; i++) {
        const x = 60 + i * 110 + rnd() * 40, y = h - 110 - rnd() * 60;
        if (i % 3 === 0) {
          c.fillStyle = '#ffd43b';
          c.beginPath();
          c.arc(x, y, 18, 0, Math.PI * 2);
          c.arc(x + 14, y - 16, 11, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#f08c00';
          c.fillRect(x + 23, y - 18, 8, 4);
        } else if (i % 3 === 1) {
          c.fillStyle = ['#ff8fab', '#ffffff', '#b197fc'][i % 3];
          for (let k = 0; k < 5; k++) {
            c.beginPath();
            c.arc(x + Math.cos((k * Math.PI * 2) / 5) * 10, y + 30 + Math.sin((k * Math.PI * 2) / 5) * 10, 8, 0, Math.PI * 2);
            c.fill();
          }
          c.fillStyle = '#ffd43b';
          c.beginPath();
          c.arc(x, y + 30, 6, 0, Math.PI * 2);
          c.fill();
        } else {
          c.fillStyle = '#74c0fc';
          c.beginPath();
          c.ellipse(x - 9, y - 40, 11, 7, -0.5, 0, Math.PI * 2);
          c.ellipse(x + 9, y - 40, 11, 7, 0.5, 0, Math.PI * 2);
          c.fill();
        }
      }
      // 작은 학교 이름 (띠 위)
      c.fillStyle = '#e8590c';
      c.font = `800 44px ${FONT}`;
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(SCHOOL_NAME, 70, 150);
      c.fillText('Elementary School', w - 520, 150);
    });
    const m = new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, toneMapped: false, side: THREE.FrontSide });
    return m;
  }

  /** 시트지 판: 문 줄 전체 그림 중 z 자리에 해당하는 조각 */
  private filmGeo(w: number, h: number, zc: number) {
    const geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    const u0 = filmU(zc + w / 2), u1 = filmU(zc - w / 2);
    for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * (u1 - u0));
    uv.needsUpdate = true;
    return geo;
  }

  private filmPlane(m: THREE.Material, w: number, y0: number, y1: number, x: number, zc: number) {
    this.add(this.filmGeo(w, y1 - y0, zc), m, x, (y0 + y1) / 2, zc, { cast: false, receive: false, ry: Math.PI / 2 });
  }

  // ───────── 캐노피: 깊고 두꺼운 슬래브 + 흰 천장(형광등) + 초록 간판 띠 + 타일 원기둥 ─────────
  private canopy() {
    const C = CANOPY, w = C.x1 - C.x0, d = C.z1 - C.z0, xc = (C.x0 + C.x1) / 2, zc = (C.z0 + C.z1) / 2;
    const slab = this.box(w, C.top - C.bottom, d, paint(0xe9e5dc, 0.85), xc, C.bottom, zc);
    this.blockers.push(slab);
    // 천장판 + 형광등
    const soffit = this.add(new THREE.PlaneGeometry(w - 0.1, d - 0.1), paint(0xf6f4ee, 0.9), xc, C.bottom - 0.005, zc, { cast: false });
    soffit.rotation.x = Math.PI / 2;
    const led = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff8e8, emissiveIntensity: 1.5 });
    for (const lx of [xc - 0.6, xc + 0.7]) for (const lz of [zc - 2.6, zc, zc + 2.6]) {
      this.box(0.34, 0.05, 1.25, paint(0xdadde0, 0.4, 0.4), lx, C.bottom - 0.06, lz, false);
      this.box(0.26, 0.012, 1.15, led, lx, C.bottom - 0.072, lz, false);
    }
    // 초록 간판 띠 (앞·옆)
    const green = paint(0x2a7a4b, 0.5, 0.1);
    const fH = 0.78, fY = C.bottom - 0.12;
    this.box(0.18, fH, d + 0.18, green, C.x1 + 0.09, fY, zc);
    for (const z of [C.z0 - 0.09, C.z1 + 0.09]) this.box(w + 0.18, fH, 0.18, green, xc + 0.09, fY, z);
    this.box(0.22, 0.05, d + 0.22, paint(0xf2f2ee, 0.4), C.x1 + 0.09, fY + fH, zc, false); // 위 테두리
    this.box(0.22, 0.05, d + 0.22, paint(0xf2f2ee, 0.4), C.x1 + 0.09, fY - 0.05, zc, false); // 아래 테두리
    this.nameSign(C.x1 + 0.185, fY + fH / 2, zc, d - 0.6, fH - 0.1);
    // 굵은 원기둥 (하늘색 모자이크 타일) + 화강석 받침
    const mosaic = this.mosaicMat();
    for (const z of [C.z0 + 0.55, C.z1 - 0.55]) {
      const cx = C.x1 - 0.5;
      const col = this.add(new THREE.CylinderGeometry(0.27, 0.27, C.bottom, 28), mosaic, cx, C.bottom / 2, z);
      void col;
      this.add(new THREE.CylinderGeometry(0.33, 0.35, 0.16, 28), plinthMat(), cx, 0.08, z);
      this.colliders.push({ ...aabb(cx, z, 0.62, 0.62), level: 0 });
    }
  }

  private mosaicMat(): THREE.Material {
    const t = new CanvasTex(256, 256);
    t.draw((c, w, h) => {
      c.fillStyle = '#e8eef3';
      c.fillRect(0, 0, w, h);
      let r = 41;
      const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
      const tones = ['#4f86c6', '#5b93d1', '#3f76b8', '#6aa0da', '#7fb0e2', '#4a80c0'];
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        c.fillStyle = tones[Math.floor(rnd() * tones.length)];
        c.fillRect(x * 16 + 1, y * 16 + 1, 14, 14);
      }
    });
    t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping;
    t.tex.repeat.set(3, 5);
    const m = new THREE.MeshStandardMaterial({ map: t.tex, roughness: 0.35, metalness: 0.05 });
    return m;
  }

  /** 학교 이름 간판: 초록 띠 위의 흰 글자 */
  private nameSign(x: number, yc: number, z: number, W: number, H: number) {
    const t = new CanvasTex(2048, Math.round((2048 * H) / W));
    t.draw((c, cw, ch) => {
      c.clearRect(0, 0, cw, ch);
      c.fillStyle = '#ffffff';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `800 ${Math.round(ch * 0.66)}px ${FONT}`;
      (c as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${Math.round(ch * 0.28)}px`;
      c.shadowColor = 'rgba(0,0,0,0.3)';
      c.shadowOffsetY = 3;
      c.shadowBlur = 4;
      c.fillText(SCHOOL_NAME, cw / 2 + Math.round(ch * 0.14), ch / 2 + 4);
    });
    const m = new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, toneMapped: false });
    this.add(new THREE.PlaneGeometry(W, H), m, x + 0.005, yc, z, { cast: false, receive: false, ry: Math.PI / 2 });
  }

  // ───────── 바닥: 현관 앞 화강석 판석(테두리) · 보도블록 길(경계석) · 잔디 ─────────
  private paving() {
    const gL = graniteMat('light'), gD = graniteMat('dark');
    const px0 = L.x1, px1 = 21.9, pz0 = DOOR_Z - 4.6, pz1 = DOOR_Z + 4.6;
    this.ground(px1 - px0, pz1 - pz0, gL, TILE_EXT.granite, (px0 + px1) / 2, (pz0 + pz1) / 2, 0.012);
    // 짙은 테두리 띠
    const bw = 0.3;
    this.ground(bw, pz1 - pz0, gD, TILE_EXT.granite, px1 - bw / 2, (pz0 + pz1) / 2, 0.014);
    for (const z of [pz0 + bw / 2, pz1 - bw / 2]) this.ground(px1 - px0, bw, gD, TILE_EXT.granite, (px0 + px1) / 2, z, 0.014);
    // 보도블록 길: 현관 앞에서 동쪽 교문 쪽으로 (마당 밖까지 이어 보이게)
    const wx0 = px1, wx1 = 32, wz0 = DOOR_Z - 1.8, wz1 = DOOR_Z + 1.8;
    this.ground(wx1 - wx0, wz1 - wz0, paverMat(), TILE_EXT.paver, (wx0 + wx1) / 2, DOOR_Z, 0.01);
    for (const z of [wz0 - 0.07, wz1 + 0.07]) this.box(wx1 - wx0, 0.07, 0.14, plinthMat(), (wx0 + wx1) / 2, 0, z, false, TILE_EXT.granitePlinth);
    // 잔디 (마당 남·북 + 벽 쪽 구석)
    const grass = grassMat();
    for (const [z0, z1] of [[-7.2, wz0 - 0.14], [wz1 + 0.14, 4.2]]) this.ground(24.6 - L.x1, z1 - z0, grass, TILE_EXT.grass, (L.x1 + 24.6) / 2, (z0 + z1) / 2, 0.006);
    // 현관 동 옆 구석 (현관 안으로 잔디가 들어가지 않게 따로)
    for (const [z0, z1] of [[-7.2, FRONT_Z0], [FRONT_Z1, 4.2]]) this.ground(L.x1 - 14.9, z1 - z0, grass, TILE_EXT.grass, (14.9 + L.x1) / 2, (z0 + z1) / 2, 0.006);
    // 교문 쪽 볼라드 (마당 끝: 등교 시간에는 차가 못 들어오게)
    const steel = paint(0xb9bec3, 0.3, 0.8), band = paint(0xffc23d, 0.5);
    for (let i = 0; i < 4; i++) {
      const z = wz0 + 0.45 + i * ((wz1 - wz0 - 0.9) / 3);
      this.add(new THREE.CylinderGeometry(0.075, 0.085, 0.8, 16), steel, 24.5, 0.4, z);
      this.add(new THREE.CylinderGeometry(0.078, 0.078, 0.06, 16), band, 24.5, 0.66, z, { cast: false });
    }
  }

  // ───────── 조경: 화강석 경계석 화단(흙 + 낮은 관목 + 꽃 + 조경석), 현관 화분, 교훈석 ─────────
  private planting() {
    const curbM = plinthMat(), soil = soilMat();
    const curb = (x0: number, x1: number, z0: number, z1: number) => this.box(x1 - x0, 0.36, z1 - z0, curbM, (x0 + x1) / 2, 0, (z0 + z1) / 2, false, TILE_EXT.granitePlinth);
    const bed = (x0: number, x1: number, z0: number, z1: number, y = 0.02) => this.ground(x1 - x0, z1 - z0, soil, TILE_EXT.soil, (x0 + x1) / 2, (z0 + z1) / 2, y);
    const R = rng(77);
    // 남쪽·북쪽 화단 (마당 경계 밖으로 넓게)
    curb(14.9, 24.85, -7.45, -7.2);
    curb(14.9, 24.85, 4.2, 4.45);
    bed(14.9, 27, -9.4, -7.45);
    bed(14.9, 27, 4.45, 6.4);
    // 동쪽 화단 (길 양옆)
    const wz0 = DOOR_Z - 1.8, wz1 = DOOR_Z + 1.8;
    curb(24.6, 24.85, -7.45, wz0 - 0.14);
    curb(24.6, 24.85, wz1 + 0.14, 4.45);
    bed(24.85, 27, -7.45, wz0 - 0.14);
    bed(24.85, 27, wz1 + 0.14, 4.45);
    // 관목 줄
    for (let x = 15.4; x < 26.8; x += 0.8 + R() * 0.25) {
      this.shrub(x, -8.2 - R() * 0.5, 0.9 + R() * 0.35, R);
      this.shrub(x + 0.3, 5.2 + R() * 0.5, 0.9 + R() * 0.35, R);
    }
    for (let z = -7.0; z < 4.2; z += 0.8 + R() * 0.2) if (z < wz0 - 0.4 || z > wz1 + 0.4) this.shrub(25.7 + R() * 0.5, z, 0.85 + R() * 0.3, R);
    // 꽃 (화단 앞줄)
    const flowerM = [0xf4a6c1, 0xffd36e, 0xffffff, 0xb48ee0, 0xff8a7a].map((c) => paint(c, 0.7));
    const flowerGeo = new THREE.IcosahedronGeometry(0.06, 0);
    const flowers = (x0: number, x1: number, z: number) => {
      for (let x = x0; x < x1; x += 0.16 + R() * 0.14) this.add(flowerGeo, flowerM[Math.floor(R() * flowerM.length)], x, 0.12 + R() * 0.08, z + (R() - 0.5) * 0.3, { cast: false });
    };
    flowers(15.2, 24.6, -7.7);
    flowers(15.2, 24.6, 4.7);
    // 조경석
    const rockM = paint(0x9b978e, 0.92);
    for (const [x, z, s] of [[17.2, -8.6, 1.0], [21.9, -7.9, 0.75], [23.6, 5.6, 0.9], [25.4, -5.5, 0.7], [25.3, 2.6, 0.8]] as [number, number, number][]) {
      const r = this.add(new THREE.DodecahedronGeometry(0.42 * s, 0), rockM, x, 0.12 * s, z);
      r.scale.set(1.35, 0.62, 1.0);
      r.rotation.y = R() * 3;
    }
    // 현관 동 옆 구석 화단 (벽에 붙은 낮은 화강석 화단)
    for (const [z0, z1] of [[-7.2, L.z0 - 0.12], [L.z1 + 0.12, 4.2]]) {
      const zc = (z0 + z1) / 2, d = z1 - z0;
      this.solid(1.0, 0.45, d, curbM, 15.45, 0, zc, TILE_EXT.granitePlinth);
      this.ground(0.86, d - 0.14, soil, TILE_EXT.soil, 15.45, zc, 0.452);
      for (let z = z0 + 0.4; z < z1 - 0.2; z += 0.75) this.shrub(15.45 + (R() - 0.5) * 0.2, z, 0.75 + R() * 0.2, R, 0.45);
    }
    // 현관 옆 화분들: 왼쪽 작은 화분 무리(제라늄), 오른쪽 하얀 받침 화분
    const potM = paint(0xb5653f, 0.8), potW = paint(0xf3f1ea, 0.5);
    const bloom = [paint(0xe5383b, 0.7), paint(0xff8fab, 0.7), paint(0xffb703, 0.7)];
    for (const [px, pz, r] of [[18.75, -4.55, 0.2], [19.2, -4.75, 0.16], [18.85, -5.1, 0.17], [19.35, -5.2, 0.22]] as [number, number, number][]) {
      this.add(new THREE.CylinderGeometry(r, r * 0.75, r * 1.6, 16), potM, px, r * 0.8, pz);
      const leaf = this.add(new THREE.IcosahedronGeometry(r * 1.05, 1), this.leafMats[1], px, r * 1.6 + r * 0.6, pz);
      leaf.scale.y = 0.75;
      for (let i = 0; i < 5; i++) this.add(new THREE.IcosahedronGeometry(r * 0.25, 0), bloom[Math.floor(R() * 3)], px + (R() - 0.5) * r * 1.4, r * 2.3 + R() * r * 0.3, pz + (R() - 0.5) * r * 1.4, { cast: false });
    }
    this.colliders.push({ ...aabb(19.05, -4.88, 0.9, 0.95), level: 0 });
    {
      const ux = 19.0, uz = 1.35;
      this.add(new THREE.CylinderGeometry(0.2, 0.26, 0.12, 20), potW, ux, 0.06, uz);
      this.add(new THREE.CylinderGeometry(0.09, 0.13, 0.4, 16), potW, ux, 0.32, uz);
      const bowl = new THREE.LatheGeometry([new THREE.Vector2(0.1, 0), new THREE.Vector2(0.38, 0.12), new THREE.Vector2(0.46, 0.3), new THREE.Vector2(0.44, 0.34)], 24);
      this.add(bowl, potW, ux, 0.5, uz);
      const bush = this.add(new THREE.IcosahedronGeometry(0.42, 1), this.leafMats[0], ux, 0.95, uz);
      bush.scale.y = 0.6;
      for (let i = 0; i < 16; i++) this.add(new THREE.IcosahedronGeometry(0.06, 0), bloom[i % 2], ux + (R() - 0.5) * 0.7, 1.02 + R() * 0.14, uz + (R() - 0.5) * 0.7, { cast: false });
      this.colliders.push({ ...aabb(ux, uz, 0.9, 0.9), level: 0 });
    }
    // 둥글게 다듬은 큰 관목 + 향나무 (화단 모서리)
    for (const [x, z, s2] of [[18.6, -8.3, 1.25], [21.2, -8.5, 1.1], [18.9, 5.4, 1.2], [22.4, 5.6, 1.15]] as [number, number, number][]) {
      const ball = this.add(new THREE.IcosahedronGeometry(0.6 * s2, 2), this.leafMats[2], x, 0.5 * s2, z);
      ball.scale.y = 0.85;
    }
    const juniper = paint(0x2f5d34, 0.85);
    for (const [x, z] of [[16.3, -8.5], [24.0, -8.6], [16.3, 5.7], [24.2, 5.7], [26.0, -6.6], [26.0, 3.6]] as [number, number][]) {
      this.add(new THREE.CylinderGeometry(0.06, 0.08, 0.4, 6), paint(0x6b4f3a, 0.9), x, 0.2, z);
      for (const [y, r, h] of [[0.75, 0.55, 1.0], [1.35, 0.42, 0.85], [1.85, 0.26, 0.7]]) this.add(new THREE.ConeGeometry(r, h, 10), juniper, x, y, z);
    }
    this.mottoStone(20.6, 5.35);
  }

  /** 낮은 관목 한 덩이 (둥근 잎뭉치 2~4개). 가끔 철쭉 꽃 */
  private shrub(x: number, z: number, s: number, R: () => number, y = 0) {
    const n = 2 + Math.floor(R() * 3);
    const m = this.leafMats[Math.floor(R() * this.leafMats.length)];
    for (let i = 0; i < n; i++) {
      const r = (0.26 + R() * 0.16) * s;
      const b = this.add(new THREE.IcosahedronGeometry(r, 1), m, x + (R() - 0.5) * 0.5 * s, y + r * 0.7, z + (R() - 0.5) * 0.4 * s);
      b.scale.y = 0.78;
      b.rotation.y = R() * 3;
    }
    if (R() < 0.3) {
      const pink = paint(0xe78fb3, 0.7);
      for (let i = 0; i < 6; i++) this.add(new THREE.IcosahedronGeometry(0.05, 0), pink, x + (R() - 0.5) * 0.6 * s, y + 0.38 * s + R() * 0.12, z + (R() - 0.5) * 0.4 * s, { cast: false });
    }
  }

  /** 교훈석: 북쪽 화단의 큰 돌에 새긴 교훈 */
  private mottoStone(x: number, z: number) {
    const rock = this.add(new THREE.DodecahedronGeometry(0.62, 1), paint(0xa29d92, 0.9), x, 0.42, z);
    rock.scale.set(1.75, 0.95, 0.7);
    this.box(1.9, 0.12, 0.9, plinthMat(), x, 0, z, false, TILE_EXT.granitePlinth);
    const t = new CanvasTex(512, 160);
    t.draw((c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = '#3b352c';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `800 ${Math.round(h * 0.34)}px ${FONT}`;
      c.fillText(SCHOOL_MOTTO.join(' · '), w / 2, h / 2);
    });
    this.add(new THREE.PlaneGeometry(1.5, 0.46), new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, depthWrite: false }), x, 0.5, z - 0.47, { cast: false, receive: false, ry: Math.PI });
  }
}
