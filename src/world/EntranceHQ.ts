// 정문(현관 바깥) 꾸미기: 벽돌 포인트 현관 동, 깊은 캐노피 + 초록 학교 이름 간판 + 타일 원기둥, 스테인리스 유리문 줄(시트지·점자블록),
// 화강석 현관 앞 바닥 + 보도블록 길, 화강석 경계석 화단(관목·꽃·조경석), 화분, 교훈석, 볼라드.
// 좌표: 1층 바닥 y = FLOOR1_Y 기준. 현관 동 x 14.9~18.0, z -4.5~1.0, 유리 출입문 x = 18.0 (문 z -2.6~-0.4).
// 바깥 마당(플레이어가 걸을 수 있는 곳)은 x 18.2~24.6, z -7.2~4.2 — 그 둘레 충돌은 SchoolMap.buildFirstFloor.
import * as THREE from 'three';
import { aabb } from './Collision';
import { CanvasTex } from './canvasTex';
import { HQBuilder } from './hq';
import { LOBBY_SRC as LOBBY } from './FirstFloorHQ';
import { FLOOR1_Y, STOREY } from './rooms';
import { paint, worldUV } from './pbr';
import { SCHOOL_MOTTO, SCHOOL_NAME } from '../data/school';
import { TILE_EXT, brickMat, concreteMat, graniteMat, grassMat, paverMat, plinthMat, soilMat, stuccoMat } from './exteriorTex';
import { makeHedge, makeTree } from './landscape';
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
    const filmY0 = 1.12, filmY1 = 1.42; // 눈높이 안전 띠
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
      // 반투명 흰 시트 (안전 표시 띠) + 가는 회색 줄 + 작은 학교 이름
      c.fillStyle = 'rgba(245,246,244,0.82)';
      c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(120,128,135,0.9)';
      c.fillRect(0, 96, w, 10);
      c.fillRect(0, h - 40, w, 6);
      c.fillStyle = '#5c6670';
      c.font = `700 40px ${FONT}`;
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      for (let x = 60; x < w; x += 700) c.fillText(SCHOOL_NAME, x, 52);
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

  // ───────── 캐노피: 얇은 콘크리트 슬래브 + 흰 천장(매립등) + 화강석 마감 네모 기둥 + 금속 입체 글자 간판 ─────────
  private canopy() {
    const C = CANOPY, w = C.x1 - C.x0, d = C.z1 - C.z0, xc = (C.x0 + C.x1) / 2, zc = (C.z0 + C.z1) / 2;
    const conc = concreteMat();
    const slab = this.box(w, C.top - C.bottom, d, conc, xc, C.bottom, zc, true, TILE_EXT.concrete);
    this.blockers.push(slab);
    // 천장판 + 매립 원형 등
    const soffit = this.add(new THREE.PlaneGeometry(w - 0.1, d - 0.1), paint(0xf1efea, 0.9), xc, C.bottom - 0.005, zc, { cast: false });
    soffit.rotation.x = Math.PI / 2;
    const led = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff8e8, emissiveIntensity: 1.2 });
    led.userData.pbr = true;
    for (const lx of [xc - 0.6, xc + 0.7]) for (const lz of [zc - 2.6, zc, zc + 2.6]) {
      const l = this.add(new THREE.CylinderGeometry(0.12, 0.12, 0.012, 16), led, lx, C.bottom - 0.012, lz, { cast: false });
      void l;
    }
    // 앞 띠(파사드): 밝은 회색 알루미늄 판 + 위아래 테두리. 학교 이름은 짙은 회색 금속 입체 글자
    const panelM = paint(0xd9dbd8, 0.45, 0.35), edgeM = paint(0x8d9194, 0.4, 0.5);
    const fH = 0.62, fY = C.bottom - 0.02;
    this.box(0.12, fH, d + 0.12, panelM, C.x1 + 0.06, fY, zc);
    for (const z of [C.z0 - 0.06, C.z1 + 0.06]) this.box(w + 0.12, fH, 0.12, panelM, xc + 0.06, fY, z);
    this.box(0.15, 0.04, d + 0.16, edgeM, C.x1 + 0.06, fY + fH, zc, false);
    this.box(0.15, 0.04, d + 0.16, edgeM, C.x1 + 0.06, fY - 0.04, zc, false);
    this.nameSign(C.x1 + 0.125, fY + fH / 2, zc, d - 1.6, fH - 0.18);
    // 네모 기둥 (화강석 판 마감) + 받침
    const gr = plinthMat();
    for (const z of [C.z0 + 0.45, C.z1 - 0.45]) {
      const cx = C.x1 - 0.45;
      this.box(0.42, C.bottom, 0.42, gr, cx, 0, z, true, TILE_EXT.granitePlinth);
      this.box(0.48, 0.12, 0.48, paint(0x8d8a83, 0.7), cx, 0, z);
      this.colliders.push({ ...aabb(cx, z, 0.48, 0.48), level: 0 });
    }
  }

  /** 학교 이름 간판: 금속 입체 글자 (글자 그림자로 두께감) */
  private nameSign(x: number, yc: number, z: number, W: number, H: number) {
    const t = new CanvasTex(2048, Math.round((2048 * H) / W));
    t.draw((c, cw, ch) => {
      c.clearRect(0, 0, cw, ch);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `800 ${Math.round(ch * 0.74)}px ${FONT}`;
      (c as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${Math.round(ch * 0.22)}px`;
      c.fillStyle = 'rgba(40,40,40,0.35)';
      c.fillText(SCHOOL_NAME, cw / 2 + Math.round(ch * 0.11) + 6, ch / 2 + 9);
      c.fillStyle = '#3c4146';
      c.fillText(SCHOOL_NAME, cw / 2 + Math.round(ch * 0.11), ch / 2 + 4);
    });
    const m = new THREE.MeshStandardMaterial({ map: t.tex, transparent: true, alphaTest: 0.3, roughness: 0.35, metalness: 0.6 });
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
    const wx0 = px1, wx1 = 25.2, wz0 = DOOR_Z - 1.8, wz1 = DOOR_Z + 1.8;
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

  // ───────── 조경: 화강석 경계석 화단(흙 + 다듬은 회양목 생울타리 + 향나무·느티나무), 현관 옆 네모 화분, 교훈석 ─────────
  private planting() {
    const curbM = plinthMat(), soil = soilMat();
    const curb = (x0: number, x1: number, z0: number, z1: number) => this.box(x1 - x0, 0.3, z1 - z0, curbM, (x0 + x1) / 2, 0, (z0 + z1) / 2, false, TILE_EXT.granitePlinth);
    const bed = (x0: number, x1: number, z0: number, z1: number, y = 0.02) => this.ground(x1 - x0, z1 - z0, soil, TILE_EXT.soil, (x0 + x1) / 2, (z0 + z1) / 2, y);
    const hedge = (x0: number, x1: number, z: number, h = 0.62, alongZ = false, seed = 1) => {
      const m = makeHedge(Math.abs(x1 - x0), h, 0.5, seed);
      m.position.set(alongZ ? z : (x0 + x1) / 2, this.y, alongZ ? (x0 + x1) / 2 : z);
      if (alongZ) m.rotation.y = Math.PI / 2;
      this.root.add(m);
    };
    const tree = (kind: 'zelkova' | 'pine' | 'juniper', x: number, z: number, seed: number, sc = 1) => {
      const t = makeTree(kind, seed, sc);
      t.position.set(x, this.y, z);
      this.root.add(t);
      this.blockers.push(...t.children);
    };
    // 남쪽·북쪽 화단 (마당 경계, 담장 x 25.1 안쪽까지)
    curb(14.9, 24.85, -7.45, -7.2);
    curb(14.9, 24.85, 4.2, 4.45);
    bed(14.9, 25.1, -9.4, -7.45);
    bed(14.9, 25.1, 4.45, 6.4);
    // 경계석 바로 뒤 회양목 생울타리 (각지게 다듬음) + 뒤쪽 향나무·느티나무
    hedge(15.2, 24.8, -7.8, 0.62, false, 3);
    hedge(15.2, 19.6, 4.8, 0.62, false, 5);
    hedge(21.8, 24.8, 4.8, 0.62, false, 7);
    for (const [k, x, z, sd] of [['juniper', 16.2, -8.8, 11], ['juniper', 18.4, -8.9, 12], ['zelkova', 21.2, -8.8, 13], ['juniper', 23.9, -8.8, 14], ['juniper', 16.3, 5.8, 15], ['pine', 23.6, 5.7, 16]] as ['zelkova' | 'pine' | 'juniper', number, number, number][])
      tree(k, x, z, sd, k === 'zelkova' ? 0.9 : 1);
    // 교문 쪽 마당 끝: 담장 안쪽 경계석 + 낮은 생울타리 (교문 길 양옆)
    const wz0 = DOOR_Z - 1.8, wz1 = DOOR_Z + 1.8;
    curb(24.6, 24.85, -7.45, wz0 - 0.14);
    curb(24.6, 24.85, wz1 + 0.14, 4.45);
    bed(24.85, 25.12, -7.45, wz0 - 0.14);
    bed(24.85, 25.12, wz1 + 0.14, 4.45);
    // 조경석 몇 개 (낮고 납작하게)
    const R = rng(77);
    const rockM = paint(0x9b978e, 0.92);
    for (const [x, z, sc] of [[19.9, -8.7, 0.8], [22.6, 5.6, 0.7]] as [number, number, number][]) {
      const r = this.add(new THREE.DodecahedronGeometry(0.42 * sc, 0), rockM, x, 0.1 * sc, z);
      r.scale.set(1.4, 0.5, 1.0);
      r.rotation.y = R() * 3;
    }
    // 현관 동 옆 구석 화단 (벽에 붙은 낮은 화강석 화단 + 생울타리)
    for (const [z0, z1] of [[-7.2, L.z0 - 0.12], [L.z1 + 0.12, 4.2]]) {
      const zc = (z0 + z1) / 2, d = z1 - z0;
      this.solid(1.0, 0.45, d, curbM, 15.45, 0, zc, TILE_EXT.granitePlinth);
      this.ground(0.86, d - 0.14, soil, TILE_EXT.soil, 15.45, zc, 0.452);
      const h = makeHedge(d - 0.3, 0.5, 0.6, 9);
      h.position.set(15.45, this.y + 0.45, zc);
      h.rotation.y = Math.PI / 2;
      this.root.add(h);
    }
    // 현관 양옆 네모 화강석 화분 (낮은 회양목)
    for (const [px, pz] of [[19.0, -4.9], [19.0, 1.35]] as [number, number][]) {
      this.box(0.9, 0.5, 0.9, curbM, px, 0, pz, true, TILE_EXT.granitePlinth);
      this.ground(0.8, 0.8, soil, TILE_EXT.soil, px, pz, 0.5);
      const h = makeHedge(0.74, 0.42, 0.74, 21);
      h.position.set(px, this.y + 0.5, pz);
      this.root.add(h);
      this.colliders.push({ ...aabb(px, pz, 0.9, 0.9), level: 0 });
    }
    this.mottoStone(20.6, 5.35);
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
