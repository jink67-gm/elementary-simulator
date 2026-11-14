// 6-1 교실 배치 기준값 (지도·이야기 코드가 같이 쓴다).
// 교실: x -7(창가, 서) ~ 7(복도, 동), z -6(칠판, 앞) ~ 7(사물함, 뒤). 앞문·뒷문은 모두 복도 쪽(동) 벽.

// ───────── 학생 책상: 4명씩 2모둠 (일반 학생 책상 4개를 맞붙인 모둠 대형) ─────────
/** 학생 책상 크기 (앉은 사람 기준 가로 w × 앞뒤 d), 윗면 높이 */
export const DESK = { w: 0.74, d: 0.54, top: 0.68 };
/** 모둠 가운데. 1모둠 = 창가 쪽, 2모둠 = 복도 쪽 */
export const PODS = [
  { x: -2.3, z: 0.0, name: '1모둠' },
  { x: 2.3, z: 0.0, name: '2모둠' },
];
/** 자리표: [모둠, 책상이 놓인 쪽(-1 서 / 1 동), 줄(-1 칠판 쪽 / 1 뒤쪽), 자리 주인] */
export const CLASS_SEATING: [number, -1 | 1, -1 | 1, string][] = [
  // 1모둠: 플레이어·서아(짝꿍) / 민재·현우
  [0, 1, -1, 'player'],
  [0, 1, 1, 'seoa'],
  [0, -1, -1, 'minjae'],
  [0, -1, 1, 'filler2'],
  // 2모둠: 준호·하린 / 지우·수빈
  [1, -1, -1, 'junho'],
  [1, -1, 1, 'harin'],
  [1, 1, -1, 'filler0'],
  [1, 1, 1, 'filler1'],
];
/** 자리 하나의 좌표: 책상 가운데, 의자(앉는 곳), 바라보는 방향, 책상 바깥 옆(가방 고리·옆에 서는 곳) */
export function classSeat(pod: number, sx: -1 | 1, row: -1 | 1) {
  const p = PODS[pod];
  const deskX = p.x + (sx * DESK.d) / 2, deskZ = p.z + (row * DESK.w) / 2;
  return {
    x: deskX + sx * (DESK.d / 2 + 0.23),
    z: deskZ,
    yaw: sx > 0 ? -Math.PI / 2 : Math.PI / 2,
    deskX,
    deskZ,
    /** 책상 모델 회전 (원래 모델: 의자가 +z 쪽) */
    rot: sx > 0 ? Math.PI / 2 : -Math.PI / 2,
    /** 책상 바깥 옆면 방향 (z) */
    side: row,
    standX: deskX,
    standZ: deskZ + row * (DESK.w / 2 + 0.55),
  };
}
/** 책상 기준 좌표(앉은 사람이 볼 때 오른쪽 +lx, 몸 쪽 +lz) → 월드 좌표·회전 */
export function onDesk(seat: { deskX: number; deskZ: number; rot?: number }, lx: number, lz: number, ry = 0): [number, number, number] {
  const t = seat.rot ?? 0, c = Math.cos(t), s = Math.sin(t);
  return [seat.deskX + lx * c + lz * s, seat.deskZ - lx * s + lz * c, ry + t];
}

// ───────── 모둠 활동 자리 (3~4교시): 플레이어 모둠(1모둠)의 맞붙인 책상 가운데 ─────────
/** 가운데·크기·윗면 높이. 역할 카드·포스터 종이·재료는 이 높이에 올린다 */
export const GROUP_TABLE = { x: PODS[0].x, z: PODS[0].z, w: DESK.d * 2, d: DESK.w * 2, top: DESK.top + 0.004 };

// ───────── 뒤 벽 (z = 7): 복도 쪽부터 청소도구함 → 사물함 → 태블릿 충전함 → 쓰레기통 → 분리수거함 ─────────
// 사물함 12칸 × 2단. 번호는 사물함을 바라볼 때 왼쪽(+x) → 오른쪽, 아래 단(1~12) → 위 단(13~24).
export const LOCKER_COLS = 12;
export const LOCKER_COUNT = 24;
export const MY_LOCKER = 17;
export const LOCKER_FRONT_Z = 6.39;
export const LOCKER_W = 0.5;
export const LOCKER_X0 = 5.6; // 사물함 동쪽 끝
export const LOCKER_DOOR = { w: 0.46, h: 0.46 };
/** 사물함 번호 → 단(row 0=아래)·칸(col)·칸 가운데 x·칸 아래 높이 y */
export function lockerCell(num: number) {
  const row = Math.floor((num - 1) / LOCKER_COLS);
  const col = (num - 1) % LOCKER_COLS;
  return { row, col, x: LOCKER_X0 - LOCKER_W * (col + 0.5), y: 0.1 + row * 0.5, z: LOCKER_FRONT_Z };
}
export const LOCKERS = { x: LOCKER_X0 - (LOCKER_COLS * LOCKER_W) / 2, w: LOCKER_COLS * LOCKER_W, z: 6.65, d: 0.5, top: 1.13 };
export const CLEAN_CABINET = { x: 6.25, z: 6.68, w: 0.95, d: 0.5, h: 0.9 };
export const TABLET_CART = { x: -1.25, z: 6.6 };
export const TRASH = { x: -2.35, z: 6.62 };
export const RECYCLE = { x: -3.5, z: 6.64, w: 1.38 };
/** 뒤 게시판: 가로로 긴 판 하나. 왼쪽(창가 쪽)에 작품 전시, 오른쪽(복도 쪽)에 모둠 포스터 */
export const BACK_BOARD = { x: 1.2, w: 8.8, y: 1.38, h: 1.36 };
export const EXHIBIT = { x: -0.9, w: 3.2 };
export const POSTER_BOARD = { x: 4.2, w: 2.4 };

// ───────── 옆 벽 ─────────
/** 창가(서) 긴 수납장: 높이는 창턱 바로 아래 */
export const WINDOW_CAB = { x: -6.775, d: 0.45, h: 0.82, z0: -3.3, z1: 6.95 };
export const BOOKSHELF = { x: -6.7, z: -0.6, len: 2.2 };
export const ART_CAB = { x: -6.55, z: 4.4, len: 1.9 };
/** 복도 쪽(동) 벽: 문 두 개 + 그 사이 유리창 두 칸 + 창 아래 낮은 책장 */
export const CLASS_DOORS = [
  { z0: -5.4, z1: -3.8, name: '앞문' },
  { z0: 4.6, z1: 6.2, name: '뒷문' },
];
export const HALL_WINDOWS: [number, number][] = [[-3.1, -0.8], [0.5, 3.5]];
export const HALL_WIN_Y = { sill: 1.0, top: 2.15 };
export const EAST_SHELF = { x: 6.79, d: 0.42, h: 0.8 };
/** 창 아래 책장 두 개 (가운데 기둥 양옆) */
export const EAST_SHELVES: [number, number][] = [[-3.05, -0.85], [0.55, 3.45]];
/** 돌출 기둥 (바닥~천장): 창가 = 시간표, 복도 쪽 = 벽시계 */
export const WEST_PILLAR = { x: -6.72, z: 0.95, w: 0.56, d: 0.7 };
export const EAST_PILLAR = { x: 6.78, z: -0.15, w: 0.44, d: 1.0 };
export const CLOCK_POS = { x: 6.55, y: 2.12, z: -0.15 };
export const PURIFIER = { x: 6.66, z: 3.95 };
