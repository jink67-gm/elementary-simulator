// 교과서 쪽수 찾기 — 순수 로직. 펼친 면은 (짝수 왼쪽, 홀수 오른쪽).

export const BOOK_LAST_PAGE = 196;

export function spreadLeft(page: number): number {
  const p = Math.max(2, Math.min(BOOK_LAST_PAGE - 1, Math.round(page)));
  return p % 2 === 0 ? p : p - 1;
}

export function spreadHas(left: number, target: number): boolean {
  return target === left || target === left + 1;
}

/** 한 장 넘기기(±2쪽) */
export function flipLeaf(left: number, dir: 1 | -1): number {
  return spreadLeft(left + dir * 2);
}

/** 뭉텅이로 넘기기: 실제 책처럼 정확하지 않다. rng는 0~1. */
export function flipChunk(left: number, dir: 1 | -1, rng: number): number {
  const amount = 12 + Math.floor(rng * 14); // 12~25쪽
  return spreadLeft(left + dir * amount);
}

export type PageComment = 'found' | 'reversed' | 'veryClose' | 'close' | 'far' | 'wayOff';

export function commentFor(left: number, target: number): PageComment {
  if (spreadHas(left, target)) return 'found';
  const rev = Number(String(target).split('').reverse().join(''));
  if (rev !== target && spreadHas(left, rev)) return 'reversed';
  const d = Math.abs(left - target);
  if (d <= 4) return 'veryClose';
  if (d <= 14) return 'close';
  if (d <= 50) return 'far';
  return 'wayOff';
}
