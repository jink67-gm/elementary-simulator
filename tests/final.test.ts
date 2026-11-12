import { describe, expect, it } from 'vitest';
import { MISREADS, checkMatch, criteriaFeedback, decideEnding, epilogue, hiddenProgress } from '../src/story/finalLogic';
import { newSave } from '../src/core/SaveData';

describe('최종 사건', () => {
  it('짝짓기: 다 맞아야 통과, 「학교가 사라지기」는 정답이 아님', () => {
    const right = Object.fromEntries(MISREADS.map((m) => [m.id, m.real]));
    expect(checkMatch(right).ok).toBe(true);
    expect(checkMatch({ ...right, break: 'erase' })).toEqual({ ok: false, wrong: ['break'] });
    expect(MISREADS.some((m) => m.real === 'erase')).toBe(false);
  });
  it('개선 기준 피드백', () => {
    expect(criteriaFeedback({ space: 'keep', rest: 15, lessons: 'safeFun' })).toBeNull();
    expect(criteriaFeedback({ space: 'keep', rest: 10, lessons: 'safeFun' })).toBeNull();
    expect(criteriaFeedback({ space: 'keep', rest: 100, lessons: 'safeFun' })).toContain('멈출');
    expect(criteriaFeedback({ space: 'remove', rest: 10, lessons: 'safeFun' })).toContain('만날');
    expect(criteriaFeedback({ space: 'keep', rest: 10, lessons: 'none' })).toContain('수업');
  });
  it('엔딩 판정', () => {
    expect(decideEnding({ reset: true, criteriaOk: false, hiddenAll: true })).toBe('A');
    expect(decideEnding({ reset: false, criteriaOk: false, hiddenAll: true })).toBeNull();
    expect(decideEnding({ reset: false, criteriaOk: true, hiddenAll: false })).toBe('B');
    expect(decideEnding({ reset: false, criteriaOk: true, hiddenAll: true })).toBe('C');
  });
  it('숨은 미션과 엔딩 뒤 이야기는 앞의 행동을 반영', () => {
    const s = newSave({ nickname: '콩떡', look: 0 });
    expect(hiddenProgress(s).done).toHaveLength(0);
    s.flags.pencilReturned = true;
    s.flags.festivalHeld = true;
    expect(hiddenProgress(s).done).toEqual(['pencil', 'share']);
    s.cafeteriaSolution = 'festival';
    s.flags.newSportInvented = true;
    const b = epilogue(s, 'B', 15).join('\n');
    expect(b).toContain('15분');
    expect(b).toContain('축제의 날');
    expect(b).toContain('굴려 굴려');
    expect(epilogue(s, 'C', 10).join('\n')).toContain('비밀 놀이 공간');
    expect(epilogue(s, 'A', null).join('\n')).toContain('08:25');
  });
});
