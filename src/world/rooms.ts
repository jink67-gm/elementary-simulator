// 공간별 기준 좌표. 지도(SchoolMap·…HQ)와 이야기(Morning·Cutlet·Final…)가 같은 값을 쓴다.
// 좌표계: 2층 바닥 y = 0, 1층 바닥 y = FLOOR1_Y(-3.6). 한 층 높이 3.6 = 천장 높이 3.0 + 천장 속·바닥 판 0.6.
// x는 서(운동장)→동(현관), z는 남(강당)→북(급식실).
import * as THREE from 'three';

export const FLOOR1_Y = -3.6;
export const STOREY = -FLOOR1_Y;
/** 천장 높이 (방 바닥에서) */
export const CEIL_H = 3;
/** 위층 바닥 판 두께 (1층 천장 속은 그 아래 STOREY - CEIL_H - SLAB 만큼) */
export const SLAB = 0.3;

export type Level = 0 | 1;
/** 층 → 바닥 높이 */
export function floorY(level: Level): number {
  return level === 1 ? 0 : FLOOR1_Y;
}
/** 높이 → 층 (계단 가운데쯤에서 바뀐다) */
export function levelOfY(y: number): Level {
  return y > FLOOR1_Y / 2 ? 1 : 0;
}

/** 계단: 1층 z -6(아래) → 2층 z -14(위), 폭 x 11.1~13.7. 디딤판 16개 */
export const STAIR = { x0: 11.1, x1: 13.7, zBottom: -6, zTop: -14, steps: 16, cx: 12.4 };
/** 계단 위·아래 층계참에서 NPC가 지나가는 점 */
export const STAIR_ENDS = {
  top: { x: STAIR.cx, z: -15.0, y: 0 },
  topStep: { x: STAIR.cx, z: STAIR.zTop - 0.1, y: 0 },
  bottomStep: { x: STAIR.cx, z: STAIR.zBottom + 0.1, y: FLOOR1_Y },
  bottom: { x: STAIR.cx, z: -5.25, y: FLOOR1_Y },
};

// ───────── 1층 급식실 동 (복도 북쪽 끝 너머) ─────────
// 식사 공간 ─(벽: 배식창·식판 반납창·조리실 문·창고 문)─ 조리실 / 식재료·조리 도구 창고
export const CAFE = {
  y: FLOOR1_Y,
  /** 1층 복도 → 식사 공간 미닫이 문 (가운데) */
  door: { x: 9, z: 16.1, w: 2 },
  dining: { x0: 1.0, x1: 15.0, z0: 16.2, z1: 23.6 },
  /** 식사 공간과 조리실 사이 벽 (가운데 z) */
  wallZ: 23.7,
  kitchen: { x0: 4.2, x1: 15.0, z0: 23.8, z1: 30.0 },
  storage: { x0: 1.0, x1: 4.0, z0: 23.8, z1: 30.0 },
  /** 벽에 뚫린 곳들 (x 구간) */
  serveWindow: { x0: 5.6, x1: 11.6, sill: 0.9, top: 2.05 },
  returnWindow: { x0: 12.0, x1: 13.2, sill: 0.9, top: 1.6 },
  kitchenDoor: { x: 14.2, w: 1.2 },
  storageDoor: { x: 2.5, w: 1.2 },
  /** 배식대 (벽을 가로지름: 식사 쪽 식판 봉 + 조리실 쪽 보온 칸) */
  counter: { x0: 5.6, x1: 11.6, z: 23.65, d: 1.3, top: 0.92 },
  /** 거대 돈가스 작업대 (조리실 가운데) */
  workTable: { x: 8.4, z: 27.2, w: 5.6, d: 3.4, top: 0.77 },
  /** 학생이 들어가도 되는 안전 작업 구역 (조리실 문 안쪽, 노란 난간으로 막힘) */
  safeZone: { x0: 12.3, x1: 15.0, z0: 23.8, z1: 25.9 },
  cutterPanel: { x: 12.62, z: 24.55 },
  /** 자른 조각을 올려 두는 배식 이송대 (안전 구역 북쪽 난간 앞) */
  passTable: { x: 13.9, z: 25.5, w: 1.9, d: 0.5, top: 0.9 },
  cook: { x: 8.6, z: 24.55, yaw: Math.PI },
  /** 식재료·조리 도구 창고 안 */
  storageShelf: { x: 1.4, z: 26.4 },
  sizeMachine: { x: 3.1, z: 29.3 },
  foldStack: { x: 1.6, z: 29.2 },
  shelfItems: { x: 1.45, z: 25.8, z2: 26.6, top: 0.88 },
  /** 식판 보관대 (입구 오른쪽) */
  trayRack: { x: 12.1, z: 16.55 },
  /** 친구들 식탁 두 개 (자리 0~2, 3~5) */
  dinerTables: [
    { x: 5.8, z: 19.9 },
    { x: 12.4, z: 19.9 },
  ],
  /** 줄 서는 곳 (배식대 앞, 동쪽 → 서쪽) */
  queue: { z: 22.5, x0: 12.6, x1: 6.0 },
  /** 플레이어가 급식실에 들어오면 서는 곳 */
  entry: { x: 9, z: 17.0 },
};

/** 급식실 동 좌표 → 월드 좌표 (바닥 높이 포함) */
export function cafe(x: number, z: number, dy = 0): THREE.Vector3 {
  return new THREE.Vector3(x, CAFE.y + dy, z);
}

/** 1층 복도 북쪽 끝 (급식실 문 앞) */
export const CAFE_FRONT = { x: 9, z: 14.6, y: FLOOR1_Y };
/** 거대 돈가스 축제 테이블 자리 (1층 복도, 급식실 문 앞) */
// 복도 서쪽 벽을 따라 (동쪽 벽의 보건실·화장실 문을 막지 않게). 손님은 테이블 동쪽에 선다
export const FEST_SPOTS: [number, number][] = [
  [7.8, 13.6],
  [7.8, 12.2],
  [7.8, 10.8],
];
