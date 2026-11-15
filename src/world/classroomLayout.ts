// 6-1 교실 배치 기준값 (지도·이야기 코드가 같이 쓴다).
/** 교실 안쪽 벽면: 창가(서) x0, 복도(동) x1, 칠판(앞) z0, 게시판(뒤) z1 — 가로 13m × 깊이 10.8m */
export const ROOM = { x0: -6.0, x1: 7.0, z0: -5.0, z1: 5.8 };
/** 예전 교실(뒤 벽 z 7) 기준으로 만든 뒤쪽 물건을 옮길 때 */
export const BACK_DZ = ROOM.z1 - 7.0;
// 교실: x -7(창가, 서) ~ 7(복도, 동), z -6(칠판, 앞) ~ 7(사물함, 뒤). 앞문·뒷문은 모두 복도 쪽(동) 벽.

// ───────── 학생 책상 8개·의자 8개: 수업에 따라 두 가지 배치 (같은 책상을 옮기기만 한다) ─────────
// 'pairs' = 일반 수업: 2명씩 짝 4쌍, 모두 칠판(앞, -z)을 본다 (게임 시작 기본)
// 'pods'  = 모둠 활동: 일반 책상 4개를 맞붙인 4명 모둠 2개, 서로 마주 본다
export type DeskLayout = 'pairs' | 'pods';
/** 학생 책상 크기 (앉은 사람 기준 가로 w × 앞뒤 d), 윗면 높이. 캐릭터 키 약 1.4m 기준 */
export const DESK = { w: 0.8, d: 0.56, top: 0.68 };
/** 의자 좌판 높이, 책상 가장자리 → 앉는 자리 거리 */
export const CHAIR = { seat: 0.38, gap: 0.25 };
/** 모둠 가운데. 1모둠 = 창가 쪽, 2모둠 = 복도 쪽 */
export const PODS = [
  { x: -2.2, z: -1.1, name: '1모둠' },
  { x: 2.2, z: -1.1, name: '2모둠' },
];
/** 짝 책상 가운데 (일반 수업): 앞줄·뒷줄 × 창가 쪽·복도 쪽 */
export const PAIRS = [
  { x: -1.9, z: -2.3 },
  { x: -1.9, z: 0.2 },
  { x: 1.9, z: -2.3 },
  { x: 1.9, z: 0.2 },
];
/** 자리표 (두 배치에서 같은 학생 = 같은 책상).
 *  pods: [모둠, 책상이 놓인 쪽(-1 서 / 1 동), 줄(-1 칠판 쪽 / 1 뒤쪽)], pairs: [짝 번호, 짝 안에서 쪽(-1 서 / 1 동)] */
export const CLASS_SEATING: { who: string; pod: [number, -1 | 1, -1 | 1]; pair: [number, -1 | 1] }[] = [
  // 1모둠: 플레이어·서아(짝꿍) / 민재·현우
  { who: 'player', pod: [0, 1, -1], pair: [0, 1] },
  { who: 'seoa', pod: [0, 1, 1], pair: [0, -1] },
  { who: 'minjae', pod: [0, -1, -1], pair: [1, 1] },
  { who: 'filler2', pod: [0, -1, 1], pair: [1, -1] },
  // 2모둠: 준호·하린 / 지우·수빈
  { who: 'junho', pod: [1, -1, -1], pair: [2, -1] },
  { who: 'harin', pod: [1, -1, 1], pair: [2, 1] },
  { who: 'filler0', pod: [1, 1, -1], pair: [3, -1] },
  { who: 'filler1', pod: [1, 1, 1], pair: [3, 1] },
];
export interface ClassSeat {
  /** 앉는 곳·바라보는 방향 */
  x: number;
  z: number;
  yaw: number;
  /** 책상 가운데 */
  deskX: number;
  deskZ: number;
  /** 책상 모델 회전 (원래 모델: 의자가 +z 쪽) */
  rot: number;
  /** 가방 고리가 달린 쪽 (책상 자기 좌표 x 부호) */
  hookSide: number;
  /** 책상 옆에 서서 물건을 놓는 곳과 그때 바라보는 방향 */
  standX: number;
  standZ: number;
  standYaw: number;
}
export function seatOf(layout: DeskLayout, who: string): ClassSeat {
  const e = CLASS_SEATING.find((c) => c.who === who)!;
  const gap = DESK.d / 2 + CHAIR.gap;
  if (layout === 'pairs') {
    const [i, side] = e.pair;
    const p = PAIRS[i];
    const deskX = p.x + (side * DESK.w) / 2, deskZ = p.z;
    return { x: deskX, z: deskZ + gap, yaw: Math.PI, deskX, deskZ, rot: 0, hookSide: side, standX: deskX, standZ: deskZ - DESK.d / 2 - 0.45, standYaw: 0 };
  }
  const [pod, sx, row] = e.pod;
  const p = PODS[pod];
  const deskX = p.x + (sx * DESK.d) / 2, deskZ = p.z + (row * DESK.w) / 2;
  return {
    x: deskX + sx * gap,
    z: deskZ,
    yaw: sx > 0 ? -Math.PI / 2 : Math.PI / 2,
    deskX,
    deskZ,
    rot: sx > 0 ? Math.PI / 2 : -Math.PI / 2,
    hookSide: sx > 0 ? -row : row,
    standX: deskX,
    standZ: deskZ + row * (DESK.w / 2 + 0.55),
    standYaw: row > 0 ? Math.PI : 0,
  };
}
/** 배치별 책상 충돌 상자 4개 (짝 책상 하나씩 / 모둠의 앞·뒷줄 하나씩) — 개수가 같아 제자리에서 바꿔 쓴다 */
export function deskBoxes(layout: DeskLayout): { x: number; z: number; w: number; d: number }[] {
  if (layout === 'pairs') return PAIRS.map((p) => ({ x: p.x, z: p.z, w: DESK.w * 2, d: DESK.d }));
  return PODS.flatMap((p) => [-1, 1].map((row) => ({ x: p.x, z: p.z + (row * DESK.w) / 2, w: DESK.d * 2, d: DESK.w })));
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
export const LOCKER_FRONT_Z = 6.39 + BACK_DZ;
export const LOCKER_W = 0.5;
export const LOCKER_X0 = 5.285; // 사물함 동쪽 끝 (청소도구함 바로 옆)
export const LOCKER_DOOR = { w: 0.46, h: 0.46 };
/** 사물함 번호 → 단(row 0=아래)·칸(col)·칸 가운데 x·칸 아래 높이 y */
export function lockerCell(num: number) {
  const row = Math.floor((num - 1) / LOCKER_COLS);
  const col = (num - 1) % LOCKER_COLS;
  return { row, col, x: LOCKER_X0 - LOCKER_W * (col + 0.5), y: 0.1 + row * 0.5, z: LOCKER_FRONT_Z };
}
export const LOCKERS = { x: LOCKER_X0 - (LOCKER_COLS * LOCKER_W) / 2, w: LOCKER_COLS * LOCKER_W, z: 6.65 + BACK_DZ, d: 0.5, top: 1.13 };
/** 청소도구함: 가로 1.365 × 깊이 0.715 × 높이 1.365 (뒷면이 벽에 붙고, 복도 쪽 끝은 그대로) */
export const CLEAN_CABINET = { x: 6.0425, z: 6.64 + BACK_DZ, w: 1.365, d: 0.715, h: 1.365 };
/** 태블릿 충전함: 가로 0.82 × 깊이 0.6 × 높이 0.86(바퀴 포함), 앞면이 교실 쪽 */
export const TABLET_CART = { x: -1.515, z: 6.62 + BACK_DZ, w: 0.82, d: 0.6 };
export const TRASH = { x: -2.515, z: 6.7 + BACK_DZ, w: 0.48, d: 0.42 };
export const RECYCLE = { x: -3.675, z: 6.7 + BACK_DZ, w: 1.62, d: 0.44 };
/** 뒤 게시판: 가로로 긴 판 하나. 창가 쪽 넓은 부분 = 학생 8명 작품 칸(2줄 × 4칸), 복도 쪽 = 큰 작품 전시 칸 */
export const BACK_BOARD = { x: 1.2, w: 8.8, y: 1.38, h: 1.36 };
/** 학생 작품 칸 하나 (색 도화지 바탕 + 작품 + 이름표) */
export const EXHIBIT_SLOT = { w: 1.22, h: 0.6 };
/** 작품 칸 순서 = 자리표 순서 (교실에서 볼 때 위 줄 왼쪽부터). 왼쪽 = +x */
export const EXHIBIT_SLOTS: { who: string; x: number; y: number }[] = ['player', 'seoa', 'minjae', 'filler2', 'junho', 'harin', 'filler0', 'filler1'].map((who, i) => ({
  who,
  x: [1.85, 0.45, -0.95, -2.35][i % 4],
  y: i < 4 ? 2.33 : 1.71,
}));
/** 내 작품 칸 (전시 상호작용 위치) */
export const EXHIBIT = { x: EXHIBIT_SLOTS[0].x, y: EXHIBIT_SLOTS[0].y, w: EXHIBIT_SLOT.w };
/** 큰 작품 전시 칸 (모둠 포스터·학급 협동화) */
export const BIG_EXHIBIT = { x: 4.1, y: 2.0, w: 2.7, h: 1.24 };
export const POSTER_BOARD = { x: BIG_EXHIBIT.x, w: BIG_EXHIBIT.w };

// ───────── 옆 벽 ─────────
/** 창가(서) 긴 수납장: 높이는 창턱 바로 아래 */
export const WINDOW_CAB = { x: ROOM.x0 + 0.225, d: 0.45, h: 0.82, z0: -3.0, z1: ROOM.z1 - 0.05 };
export const BOOKSHELF = { x: ROOM.x0 + 0.3, z: -0.6, len: 2.2 };
export const ART_CAB = { x: ROOM.x0 + 0.45, z: 3.7, len: 1.9 };
/** 복도 쪽(동) 벽: 문 두 개 + 그 사이 유리창 두 칸 + 창 아래 낮은 책장 */
export const CLASS_DOORS = [
  { z0: -4.5, z1: -2.9, name: '앞문' },
  { z0: 3.6, z1: 5.2, name: '뒷문' },
];
export const HALL_WINDOWS: [number, number][] = [[-2.4, -0.65], [0.35, 2.95]];
export const HALL_WIN_Y = { sill: 1.0, top: 2.15 };
export const EAST_SHELF = { x: 6.79, d: 0.42, h: 0.8 };
/** 창 아래 책장 두 개 (가운데 기둥 양옆) */
export const EAST_SHELVES: [number, number][] = [[-2.35, -0.7], [0.4, 2.9]];
/** 돌출 기둥 (바닥~천장): 창가 = 시간표, 복도 쪽 = 벽시계 */
export const WEST_PILLAR = { x: ROOM.x0 + 0.15, z: 0.95, w: 0.7, d: 0.7 }; // 창 벽 바깥면부터 교실 쪽으로 0.5m 돌출
export const EAST_PILLAR = { x: 6.78, z: -0.15, w: 0.44, d: 1.0 };
export const CLOCK_POS = { x: 6.55, y: 2.12, z: -0.15 };
/** 교사용 책상 (앞 왼쪽, 창가 쪽) */
export const TEACHER_DESK = { x: -4.45, z: -3.65, w: 1.8, d: 0.85, h: 0.76 };
export const PURIFIER = { x: 6.66, z: 3.25 };
