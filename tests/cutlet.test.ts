import { describe, expect, it } from 'vitest';
import {
  CUTLET_TOTAL, cutPieces, decideSolution, isFair, machineApply, machineCheck, planHint, splitArea, tryAddToTray, wiresCorrect,
} from '../src/story/cutletLogic';

describe('거대 돈가스 절단', () => {
  it('조각 넓이의 합은 항상 24', () => {
    for (const halved of [false, true]) {
      for (const cuts of [[], [6], [2, 4, 6, 8, 10], [1, 1, 11, 5, 0, 12, 13]]) {
        expect(cutPieces(cuts, halved).reduce((s, p) => s + p.area, 0)).toBe(CUTLET_TOTAL);
      }
    }
  });
  it('반 가르고 4·8에서 자르면 4짜리 6조각', () => {
    const p = cutPieces([4, 8], true);
    expect(p).toHaveLength(6);
    expect(p.every((x) => x.area === 4)).toBe(true);
    expect(planHint(p)).toContain('딱 맞는');
  });
  it('반 안 가르고 2칸씩 자르면 4짜리 6조각', () => {
    expect(cutPieces([2, 4, 6, 8, 10], false).map((x) => x.area)).toEqual([4, 4, 4, 4, 4, 4]);
  });
  it('안 자르면 식판보다 크다는 안내', () => {
    expect(planHint(cutPieces([], false))).toContain('식판보다 큰');
  });
  it('큰 조각 반 가르기', () => {
    expect(splitArea(8)).toEqual([4, 4]);
    expect(splitArea(7)).toEqual([4, 3]);
  });
});

describe('식판 배식', () => {
  it('큰 조각은 안 올라간다', () => {
    expect(tryAddToTray(0, 6)).toEqual({ ok: false, total: 0, verdict: 'tooBig' });
  });
  it('작은 조각 두 개면 완성', () => {
    const a = tryAddToTray(0, 2);
    expect(a.verdict).toBe('small');
    expect(tryAddToTray(a.total, 2).verdict).toBe('good');
  });
  it('너무 많이 담으면 거절', () => {
    expect(tryAddToTray(4, 2).verdict).toBe('overfull');
  });
  it('공평 판정', () => {
    expect(isFair([4, 4, 4, 4, 4, 4])).toBe(true);
    expect(isFair([3, 4, 4, 4, 4, 4])).toBe(true);
    expect(isFair([3, 5, 4, 4, 4, 4])).toBe(false);
    expect(isFair([4, 4, 4, 4, 4, 2])).toBe(false);
  });
});

describe('크기 조절기', () => {
  it('÷2 → ÷5 = 100%', () => {
    expect(machineCheck(machineApply(machineApply(1000, 'half'), 'fifth'))).toBe('exact');
  });
  it('÷5 → −100 = 100%', () => {
    expect(machineCheck(machineApply(machineApply(1000, 'fifth'), 'minus100'))).toBe('exact');
  });
  it('너무 작게', () => {
    expect(machineCheck(machineApply(machineApply(1000, 'fifth'), 'fifth'))).toBe('tooSmall');
  });
  it('전선', () => {
    expect(wiresCorrect({ red: 'power', blue: 'size', yellow: 'ground' })).toBe(true);
    expect(wiresCorrect({ red: 'size', blue: 'power', yellow: 'ground' })).toBe(false);
  });
});

describe('해결 판정', () => {
  const base = { servedTrays: 0, anyServed: false, machineFixed: false, festivalHeld: false };
  it('아직 해결 전', () => expect(decideSolution(base)).toBeNull());
  it('여섯 명 배식', () => expect(decideSolution({ ...base, servedTrays: 6, anyServed: true })).toBe('cut_and_share'));
  it('기계', () => expect(decideSolution({ ...base, machineFixed: true })).toBe('shrink_machine'));
  it('축제', () => expect(decideSolution({ ...base, festivalHeld: true })).toBe('festival'));
  it('섞어서', () => expect(decideSolution({ ...base, anyServed: true, servedTrays: 2, machineFixed: true })).toBe('mixed'));
});
