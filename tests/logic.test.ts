import { describe, expect, it } from 'vitest';
import { newSave, parseSave, SaveFormatError, SAVE_VERSION } from '../src/core/SaveData';
import { SaveManager, type StorageLike } from '../src/core/SaveManager';
import { Inventory } from '../src/player/Inventory';
import { aabb, resolveCircle } from '../src/world/Collision';
import { NavGrid } from '../src/world/NavGrid';
import { commentFor, flipChunk, flipLeaf, spreadHas, spreadLeft } from '../src/minigames/textbookLogic';
import { checkAnswer, pickQuestions } from '../src/minigames/quizLogic';
import { clockMinutes, formatClock, nextPeriod, SCHEDULE } from '../src/story/schedule';
import { posterTheme } from '../src/minigames/Poster';
import { rpsResult } from '../src/minigames/SmallGames';
import { wa } from '../src/ui/dom';

class MemStore implements StorageLike {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

describe('저장', () => {
  it('새 저장은 등교부터, 가방을 들고 시작', () => {
    const s = newSave({ nickname: '콩떡', look: 1 });
    expect(s.period).toBe('arrival');
    expect(s.inventory).toEqual(['bag']);
    expect(s.version).toBe(SAVE_VERSION);
  });

  it('저장 → 읽기 왕복', () => {
    const store = new MemStore();
    const m = new SaveManager(store);
    const s = newSave({ nickname: '번개', look: 2 });
    s.period = 'math';
    s.flags.helpedFriend = true;
    s.playerWish = 'break';
    expect(m.write(s)).toBe(true);
    const r = m.read()!;
    expect(r.period).toBe('math');
    expect(r.flags.helpedFriend).toBe(true);
    expect(r.playerWish).toBe('break');
  });

  it('JSON 가져오기: 이상한 값은 안전한 기본값으로', () => {
    const r = parseSave({ version: 1, period: 'gym-party', playerWish: 'pizza', flags: { a: true, b: 'yes' }, inventory: ['bag', 'sword', 'tablet'], avatar: { nickname: '아주아주아주아주긴별명입니다', look: 99 } });
    expect(r.period).toBe('arrival');
    expect(r.playerWish).toBeNull();
    expect(r.flags).toEqual({ a: true });
    expect(r.inventory).toEqual(['bag', 'tablet']);
    expect(r.avatar.nickname.length).toBeLessThanOrEqual(12);
    expect(r.avatar.look).toBe(7);
  });

  it('형식이 틀리거나 미래 버전이면 거절', () => {
    expect(() => SaveManager.importJson('not json')).toThrow(SaveFormatError);
    expect(() => parseSave({ period: 'math' })).toThrow(SaveFormatError);
    expect(() => parseSave({ version: SAVE_VERSION + 1 })).toThrow(SaveFormatError);
  });

  it('저장소가 없으면 실패를 알려 준다', () => {
    const m = new SaveManager(null);
    expect(m.write(newSave({ nickname: 'a', look: 0 }))).toBe(false);
    expect(m.lastError).toBeTruthy();
  });
});

describe('소지품 4칸', () => {
  it('빈손이면 선택 칸에, 아니면 빈칸에 넣고 그 칸을 고른다', () => {
    const inv = new Inventory();
    inv.add('bag');
    expect(inv.held).toBe('bag');
    inv.add('koreanBook');
    expect(inv.slots).toEqual(['bag', 'koreanBook', null, null]);
    expect(inv.held).toBe('koreanBook');
    inv.remove('koreanBook');
    expect(inv.held).toBeNull();
    inv.add('tablet');
    expect(inv.slots[1]).toBe('tablet');
  });
  it('꽉 차면 false', () => {
    const inv = new Inventory();
    for (const i of ['bag', 'tablet', 'charger', 'glue'] as const) expect(inv.add(i)).toBe(true);
    expect(inv.add('scraps')).toBe(false);
    expect(inv.isFull()).toBe(true);
  });
});

describe('충돌', () => {
  it('원을 상자 밖으로 밀어낸다', () => {
    const c = { x: 0.9, z: 0, r: 0.3 };
    const r = resolveCircle(c, [aabb(0, 0, 2, 2)]);
    expect(r.hit).toBe(true);
    expect(c.x).toBeCloseTo(1.3, 5);
  });
  it('꺼진 상자(열린 문)는 통과', () => {
    const b = aabb(0, 0, 2, 2);
    b.enabled = false;
    const c = { x: 0.5, z: 0, r: 0.3 };
    expect(resolveCircle(c, [b]).hit).toBe(false);
  });
});

describe('NPC 길찾기', () => {
  it('벽을 돌아서 간다', () => {
    const g = new NavGrid(0, 0, 10, 10, 0.5);
    g.rebuild([aabb(5, 4, 1, 8)], 0.2); // 위쪽이 막힌 벽, 아래(z 8~10)로 돌아가야 함
    const p = g.findPath({ x: 2, z: 2 }, { x: 8, z: 2 })!;
    expect(p).not.toBeNull();
    expect(p[p.length - 1]).toEqual({ x: 8, z: 2 });
    expect(Math.max(...p.map((q) => q.z))).toBeGreaterThan(8);
    for (let i = 1; i < p.length; i++) expect(g.lineFree(p[i - 1], p[i]) || i === p.length - 1).toBe(true);
  });
});

describe('교과서 쪽수', () => {
  it('펼친 면은 짝수-홀수', () => {
    expect(spreadLeft(87)).toBe(86);
    expect(spreadHas(86, 87)).toBe(true);
    expect(flipLeaf(84, 1)).toBe(86);
    expect(flipLeaf(2, -1)).toBe(2);
  });
  it('뭉텅이로 넘기면 12~25쪽', () => {
    expect(flipChunk(20, 1, 0)).toBe(32);
    expect(flipChunk(20, 1, 0.999)).toBe(44);
  });
  it('68쪽은 숫자 뒤집힘 농담', () => {
    expect(commentFor(68, 86)).toBe('reversed');
    expect(commentFor(86, 86)).toBe('found');
    expect(commentFor(84, 86)).toBe('veryClose');
    expect(commentFor(10, 86)).toBe('wayOff');
  });
});

describe('수학 퀴즈', () => {
  it('학년마다 3문제', () => {
    for (const g of [4, 5, 6] as const) expect(pickQuestions(g, () => 0.5)).toHaveLength(3);
  });
  it('0.75 = 3/4, 8 = 8.0', () => {
    expect(checkAnswer('0.75', '0.75')).toBe(true);
    expect(checkAnswer('3/4', '0.75')).toBe(true);
    expect(checkAnswer('8.0', '8')).toBe(true);
    expect(checkAnswer('2/8', '1/4')).toBe(true);
    expect(checkAnswer('7', '8')).toBe(false);
    expect(checkAnswer('', '8')).toBe(false);
    expect(checkAnswer('1/0', '8')).toBe(false);
  });
});

describe('시간표', () => {
  it('순서대로 이어지고 마지막 사건에서 끝', () => {
    expect(nextPeriod('arrival')).toBe('korean');
    expect(nextPeriod('art')).toBe('lunch');
    expect(nextPeriod('lunch')).toBe('cutlet');
    expect(nextPeriod('cutlet')).toBe('robot');
    expect(nextPeriod('robot')).toBe('dodgeball');
    expect(nextPeriod('dodgeball')).toBe('hallway');
    expect(nextPeriod('hallway')).toBe('final');
    expect(nextPeriod('final')).toBeNull();
  });
  it('시계는 종 치기 1분 전에서 기다린다', () => {
    expect(clockMinutes('korean', 0)).toBe(SCHEDULE.korean.start);
    expect(clockMinutes('korean', 9999)).toBe(SCHEDULE.korean.end - 1);
    expect(clockMinutes('arrival', 0, true)).toBeGreaterThan(clockMinutes('arrival', 0, false));
    expect(formatClock(9 * 60 + 5)).toBe('오전 9:05');
    expect(formatClock(12 * 60 + 10)).toBe('오후 12:10');
  });
});

describe('작은 놀이들', () => {
  it('가위바위보', () => {
    expect(rpsResult(1, 0)).toBe('win');
    expect(rpsResult(0, 2)).toBe('win');
    expect(rpsResult(2, 1)).toBe('win');
    expect(rpsResult(0, 1)).toBe('lose');
    expect(rpsResult(2, 2)).toBe('draw');
  });
  it('포스터 주제는 스티커가 많은 쪽', () => {
    expect(posterTheme([{ kind: 'ball' }, { kind: 'ball' }, { kind: 'food' }], 0)).toBe('play');
    expect(posterTheme([{ kind: 'heart' }, { kind: 'food' }], 0)).toBe('food');
  });
  it('와/과', () => {
    expect(wa('민재')).toBe('와');
    expect(wa('하린')).toBe('과');
    expect(wa('담임 선생님')).toBe('과');
  });
});
