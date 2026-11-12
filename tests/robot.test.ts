import { describe, expect, it } from 'vitest';
import { CODE_HINTS, STOP_CODE, checkCode, compartmentOk, decideRobot, messLevel, startingBin } from '../src/story/robotLogic';

const base = { binLeft: 0, sortedByRemote: 0, zonesSaved: false, stopped: false, returnedByHand: 0, pendingHand: 0 };

describe('청소 로봇', () => {
  it('축제를 열었으면 축제 포스터까지 7개', () => {
    expect(startingBin(false)).toHaveLength(6);
    expect(startingBin(true)).toHaveLength(7);
  });
  it('보관함 칸 맞추기', () => {
    const [book, pencil] = startingBin(false);
    expect(compartmentOk(book, 'books')).toBe(true);
    expect(compartmentOk(pencil, 'books')).toBe(false);
  });
  it('친구 셋의 힌트를 이으면 코드', () => {
    expect(CODE_HINTS.map((h) => h.digit).join('')).toBe(STOP_CODE);
    expect(checkCode('41')).toBe('partial');
    expect(checkCode('418')).toBe('wrong');
    expect(checkCode('417')).toBe('ok');
  });
  it('아직 남았으면 해결 아님', () => {
    expect(decideRobot({ ...base, binLeft: 2, sortedByRemote: 4 })).toBeNull();
    expect(decideRobot({ ...base, stopped: true, returnedByHand: 5, pendingHand: 1 })).toBeNull();
  });
  it('세 가지 방법과 섞어서', () => {
    expect(decideRobot({ ...base, sortedByRemote: 6 })).toBe('remote');
    expect(decideRobot({ ...base, zonesSaved: true })).toBe('zones');
    expect(decideRobot({ ...base, stopped: true, returnedByHand: 6 })).toBe('stopcode');
    expect(decideRobot({ ...base, sortedByRemote: 2, stopped: true, returnedByHand: 4 })).toBe('mixed');
  });
  it('어수선함', () => {
    expect(messLevel(0, 0)).toBe(0);
    expect(messLevel(5, 2)).toBe(3);
    expect(messLevel(9, 9)).toBe(5);
  });
});
