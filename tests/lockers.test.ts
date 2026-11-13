import { describe, expect, it } from 'vitest';
import { LOCKER_COUNT, MY_LOCKER, lockerCell } from '../src/world/classroomLayout';

describe('사물함 번호 → 위치', () => {
  it('1~24번이 서로 다른 칸에 순서대로 놓인다', () => {
    const seen = new Set<string>();
    for (let n = 1; n <= LOCKER_COUNT; n++) {
      const c = lockerCell(n);
      const key = `${c.x},${c.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      if (n > 1 && n !== 13) expect(lockerCell(n - 1).x - c.x).toBeCloseTo(1); // 왼쪽(+x)에서 오른쪽(-x)으로
    }
    expect(seen.size).toBe(24);
  });
  it('17번은 위 단 5번째 칸, 20번과 겹치지 않는다', () => {
    const a = lockerCell(MY_LOCKER), b = lockerCell(20);
    expect(a.row).toBe(1);
    expect(a.col).toBe(4);
    expect(b.row).toBe(1);
    expect(b.col).toBe(7);
    expect(Math.abs(a.x - b.x)).toBeCloseTo(3);
  });
  it('17번은 로봇 사건의 「사물함」 구역(x 1.5) 앞에 있다', () => {
    expect(lockerCell(MY_LOCKER).x).toBeCloseTo(1.5);
  });
});
