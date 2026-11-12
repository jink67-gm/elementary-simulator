// 사건 2 「자동 청소 로봇의 역습」 규칙 — 순수 로직. 테스트: tests/robot.test.ts
import type { ItemId } from '../data/items';

/** 분실물 보관함 칸 */
export type LostCat = 'books' | 'tools' | 'paper';
export const LOST_CAT_NAMES: Record<LostCat, string> = { books: '책·기기', tools: '학용품', paper: '종이·옷' };

/** 물건 주인: 친구(NPC id) 또는 'me'(플레이어 것) */
export type Owner = 'seoa' | 'junho' | 'harin' | 'minjae' | 'filler0' | 'filler1' | 'me';

export interface LostItem {
  id: ItemId;
  owner: Owner;
  cat: LostCat;
}

/** 로봇이 이미 치워 버린 물건 6개 */
export const BASE_LOST: LostItem[] = [
  { id: 'koreanBook', owner: 'seoa', cat: 'books' },
  { id: 'pencilCase', owner: 'junho', cat: 'tools' },
  { id: 'glue', owner: 'harin', cat: 'tools' },
  { id: 'tablet', owner: 'minjae', cat: 'books' },
  { id: 'ruler', owner: 'filler0', cat: 'tools' },
  { id: 'gymClothes', owner: 'me', cat: 'paper' },
];
/** 축제를 열었으면 축제 포스터도 치워 버린다 */
export const FEST_LOST: LostItem = { id: 'festPoster', owner: 'harin', cat: 'paper' };
/** 자동 모드로 돌아다니다 더 치우는 물건 (보호 구역 3곳) */
export const ZONE_LOST: Record<ZoneId, LostItem> = {
  desk: { id: 'bag', owner: 'me', cat: 'paper' },
  board: { id: 'miniPoster', owner: 'me', cat: 'paper' },
  locker: { id: 'markers', owner: 'filler1', cat: 'tools' },
};
export type ZoneId = 'desk' | 'board' | 'locker';
export const ZONES: ZoneId[] = ['desk', 'board', 'locker'];
export const ZONE_NAMES: Record<ZoneId, string> = { desk: '내 책상', board: '뒤 게시판', locker: '사물함' };

export function startingBin(festivalHeld: boolean): LostItem[] {
  return festivalHeld ? [...BASE_LOST, FEST_LOST] : [...BASE_LOST];
}

/** 이 물건이 이 칸에 맞는지 */
export function compartmentOk(item: LostItem, cat: LostCat): boolean {
  return item.cat === cat;
}

/** 비상정지 코드: 친구 세 명이 한 자리씩 알고 있다 */
export const STOP_CODE = '417';
export const CODE_HINTS: { who: 'seoa' | 'junho' | 'harin'; digit: string; line: string }[] = [
  { who: 'seoa', digit: '4', line: '로봇 설명서 첫 장에 「비상정지 코드 첫 자리: 4」라고 써 있었어.' },
  { who: 'junho', digit: '1', line: '나 아까 로봇 뒤에 붙은 스티커 봤어! 가운데 숫자 1!' },
  { who: 'harin', digit: '7', line: '청소 당번표 맨 아래에 「…7」이라고 적혀 있던데? 마지막 자리 아닐까?' },
];

export function checkCode(input: string): 'ok' | 'wrong' | 'partial' {
  if (input === STOP_CODE) return 'ok';
  return STOP_CODE.startsWith(input) && input.length < STOP_CODE.length ? 'partial' : 'wrong';
}

export type RobotSolution = 'remote' | 'zones' | 'stopcode' | 'mixed';

export interface RobotProgress {
  binLeft: number; // 아직 수거함에 있는 물건
  sortedByRemote: number; // 원격 조종으로 보관함에 넣은 개수
  zonesSaved: boolean; // 청소 금지 구역 저장 완료
  stopped: boolean; // 비상정지
  returnedByHand: number; // 직접 돌려준 개수
  pendingHand: number; // 손에 들고 아직 안 돌려준 물건
}

/** 다 돌려놓았는지, 어떤 방법이었는지 */
export function decideRobot(p: RobotProgress): RobotSolution | null {
  const done = p.binLeft === 0 && p.pendingHand === 0;
  if (!done) return null;
  const used = [p.sortedByRemote > 0, p.zonesSaved, p.stopped || p.returnedByHand > 0].filter(Boolean).length;
  if (used > 1) return 'mixed';
  if (p.zonesSaved) return 'zones';
  if (p.sortedByRemote > 0) return 'remote';
  return 'stopcode';
}

/** 어수선함 0~5: 급식 부스러기 + 로봇이 더 치운 횟수 */
export function messLevel(crumbs: number, extraGrabs: number): number {
  return Math.min(5, (crumbs >= 4 ? 1 : 0) + extraGrabs);
}
