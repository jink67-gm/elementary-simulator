// 저장 데이터 형식 (GAME_DESIGN.md 8.2) — 순수 로직, DOM 없음.
import type { ItemId } from '../data/items';
import { ITEMS } from '../data/items';

export const SAVE_VERSION = 1;

export type SceneId = 'home' | 'school' | 'classroom' | 'cafeteria' | 'gym' | 'hallway' | 'controlRoom';
export type CafeteriaSolution = 'cut_and_share' | 'shrink_machine' | 'festival' | 'mixed' | null;
export type Wish = 'lunch' | 'break' | 'sport' | 'clean';
export type GroupRole = 'speaker' | 'maker' | 'researcher' | 'organizer';
export type PosterTheme = 'food' | 'rest' | 'play' | 'friends';

/** 오전 일과 순서. 저장은 각 교시가 시작될 때 체크포인트로 남는다. */
export const PERIODS = ['arrival', 'korean', 'break', 'math', 'group', 'art', 'lunch', 'cutlet'] as const;
export type PeriodId = (typeof PERIODS)[number];

export interface Avatar {
  nickname: string;
  look: number; // 캐릭터 색 조합 번호
}

export interface SaveData {
  version: number;
  chapter: number;
  scene: SceneId;
  period: PeriodId;
  playedSeconds: number;
  avatar: Avatar;
  playerWish: Wish | null;
  groupRole: GroupRole | null;
  schoolPosterTheme: PosterTheme | null;
  cafeteriaSolution: CafeteriaSolution;
  quizScore: number;
  flags: Record<string, boolean>;
  stats: Record<string, number>;
  collectibles: string[];
  schoolChaos: number;
  inventory: ItemId[];
  lastCheckpoint: string;
  savedAt: string;
}

export function newSave(avatar: Avatar): SaveData {
  return {
    version: SAVE_VERSION,
    chapter: 1,
    scene: 'hallway',
    period: 'arrival',
    playedSeconds: 0,
    avatar,
    playerWish: null,
    groupRole: null,
    schoolPosterTheme: null,
    cafeteriaSolution: null,
    quizScore: 0,
    flags: {},
    stats: {},
    collectibles: [],
    schoolChaos: 0,
    inventory: ['bag'],
    lastCheckpoint: 'arrival',
    savedAt: new Date(0).toISOString(),
  };
}

const WISHES: Wish[] = ['lunch', 'break', 'sport', 'clean'];
const ROLES: GroupRole[] = ['speaker', 'maker', 'researcher', 'organizer'];
const THEMES: PosterTheme[] = ['food', 'rest', 'play', 'friends'];
const SOLUTIONS: Exclude<CafeteriaSolution, null>[] = ['cut_and_share', 'shrink_machine', 'festival', 'mixed'];

function oneOf<T>(v: unknown, list: readonly T[]): T | null {
  return list.includes(v as T) ? (v as T) : null;
}

export class SaveFormatError extends Error {}

/**
 * 외부에서 들어온 JSON(가져오기·localStorage)을 검사하고 현재 버전으로 맞춘다.
 * 알 수 없는 값은 안전한 기본값으로 바꾸고, 형식 자체가 틀리면 SaveFormatError.
 */
export function parseSave(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object') throw new SaveFormatError('저장 파일 형식이 아니에요.');
  const r = raw as Record<string, unknown>;
  if (typeof r.version !== 'number') throw new SaveFormatError('버전 정보가 없는 파일이에요.');
  if (r.version > SAVE_VERSION) throw new SaveFormatError('더 새로운 버전의 게임에서 만든 저장이에요.');

  const av = (r.avatar ?? {}) as Record<string, unknown>;
  const base = newSave({
    nickname: typeof av.nickname === 'string' ? av.nickname.slice(0, 12) : '콩떡',
    look: typeof av.look === 'number' ? Math.max(0, Math.min(7, Math.floor(av.look))) : 0,
  });

  const flags: Record<string, boolean> = {};
  if (r.flags && typeof r.flags === 'object') {
    for (const [k, v] of Object.entries(r.flags as object)) if (typeof v === 'boolean') flags[k] = v;
  }
  const stats: Record<string, number> = {};
  if (r.stats && typeof r.stats === 'object') {
    for (const [k, v] of Object.entries(r.stats as object)) if (typeof v === 'number' && isFinite(v)) stats[k] = v;
  }
  const inventory = Array.isArray(r.inventory)
    ? (r.inventory.filter((i) => typeof i === 'string' && i in ITEMS) as ItemId[]).slice(0, 4)
    : base.inventory;

  return {
    ...base,
    chapter: typeof r.chapter === 'number' ? r.chapter : 1,
    scene: (typeof r.scene === 'string' ? r.scene : 'hallway') as SceneId,
    period: oneOf(r.period, PERIODS) ?? 'arrival',
    playedSeconds: typeof r.playedSeconds === 'number' ? r.playedSeconds : 0,
    playerWish: oneOf(r.playerWish, WISHES),
    groupRole: oneOf(r.groupRole, ROLES),
    schoolPosterTheme: oneOf(r.schoolPosterTheme, THEMES),
    cafeteriaSolution: oneOf(r.cafeteriaSolution, SOLUTIONS),
    quizScore: typeof r.quizScore === 'number' ? r.quizScore : 0,
    flags,
    stats,
    collectibles: Array.isArray(r.collectibles) ? r.collectibles.filter((c) => typeof c === 'string') : [],
    schoolChaos: typeof r.schoolChaos === 'number' ? r.schoolChaos : 0,
    inventory,
    lastCheckpoint: typeof r.lastCheckpoint === 'string' ? r.lastCheckpoint : 'arrival',
    savedAt: typeof r.savedAt === 'string' ? r.savedAt : base.savedAt,
    version: SAVE_VERSION,
  };
}

export function cloneSave(s: SaveData): SaveData {
  return JSON.parse(JSON.stringify(s)) as SaveData;
}
