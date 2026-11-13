// 6-1 교실 배치 기준값: 사물함 번호 → 칸, 모둠 책상 윗면 높이 등 (지도와 이야기 코드가 같이 쓴다)
// ───────── 사물함 (6-1 뒤 벽, 12칸 × 2단) ─────────
// 번호는 교실에서 사물함을 바라볼 때 왼쪽 → 오른쪽, 아래 단(1~12) → 위 단(13~24).
// 사물함은 -z(교실 쪽)를 보므로, 바라보는 사람의 왼쪽은 +x 쪽이다.
export const LOCKER_COLS = 12;
export const LOCKER_COUNT = 24;
export const MY_LOCKER = 17;
export const LOCKER_FRONT_Z = 6.39;
export const LOCKER_DOOR = { w: 0.92, h: 0.46 };
/** 사물함 번호 → 단(row 0=아래)·칸(col)·칸 가운데 x·칸 아래 높이 y */
export function lockerCell(num: number) {
  const row = Math.floor((num - 1) / LOCKER_COLS);
  const col = (num - 1) % LOCKER_COLS;
  return { row, col, x: 5.5 - col, y: 0.1 + row * 0.52, z: LOCKER_FRONT_Z };
}

// ───────── 모둠 책상 (6-1 뒤쪽, 3~4교시) ─────────
/** 모둠 책상 가운데와 크기, 윗면 높이. 책상 위 물건(역할 카드·포스터 종이·재료)은 이 높이에 올린다 */
export const GROUP_TABLE = { x: 0, z: 4.7, w: 2.6, d: 1.2, top: 0.68, thick: 0.04 };
