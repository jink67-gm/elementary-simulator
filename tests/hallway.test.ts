import { describe, expect, it } from 'vitest';
import { CORRECT_ORDER, DOOR_CLOCK, CARD_TIME, checkOrder, hasExtraHint, memoryOf } from '../src/story/hallwayLogic';
import { newSave } from '../src/core/SaveData';

describe('끝나지 않는 쉬는 시간', () => {
  it('정답 순서', () => {
    expect(checkOrder([...CORRECT_ORDER])).toEqual({ ok: true, right: 6 });
  });
  it('일부만 맞으면 맞은 개수', () => {
    expect(checkOrder(['korean', 'math', 'break', 'group', 'art', 'lunch'])).toEqual({ ok: false, right: 4 });
  });
  it('문 위 시계는 진짜 시각과 다르다 (시계만 보고 풀 수 없게)', () => {
    for (const id of CORRECT_ORDER) expect(DOOR_CLOCK[id]).not.toBe(CARD_TIME[id]);
  });
  it('기억은 오전 행동을 반영', () => {
    const s = newSave({ nickname: '콩떡', look: 0 });
    expect(memoryOf('korean', s).join()).toContain('넘겼다');
    s.flags.helpedPageFriend = true;
    expect(memoryOf('korean', s).join()).toContain('서아에게');
    s.cafeteriaSolution = 'festival';
    expect(memoryOf('lunch', s).join()).toContain('축제');
  });
  it('추가 힌트 조건', () => {
    const s = newSave({ nickname: '콩떡', look: 0 });
    expect(hasExtraHint(s)).toBe(false);
    s.groupRole = 'researcher';
    expect(hasExtraHint(s)).toBe(true);
  });
});
