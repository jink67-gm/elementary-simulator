import { describe, expect, it } from 'vitest';
import { ambienceFor, bgmFor, placeAt, woodFloor } from '../src/core/musicRules';

describe('배경음악 규칙', () => {
  it('교시별 기본 곡', () => {
    expect(bgmFor({ period: 'arrival', phase: 'bag', eventActive: false })).toBe('explore');
    expect(bgmFor({ period: 'korean', phase: 'find', eventActive: false })).toBe('class');
    expect(bgmFor({ period: 'math', phase: 'tablet', eventActive: false })).toBe('class');
    expect(bgmFor({ period: 'break', phase: 'free', eventActive: false })).toBe('break');
    expect(bgmFor({ period: 'group', phase: 'task', eventActive: false })).toBe('group');
    expect(bgmFor({ period: 'art', phase: 'craft', eventActive: false })).toBe('group');
  });

  it('등교 중 교실에 들어와도 수업 음악이 아니다 (장소보다 상태)', () => {
    expect(bgmFor({ period: 'arrival', phase: 'free', eventActive: false })).toBe('explore');
  });

  it('사건 음악이 우선하고, 해결되면 평소 음악으로 돌아간다', () => {
    expect(bgmFor({ period: 'lunch', phase: '', eventActive: false })).toBe('break');
    expect(bgmFor({ period: 'lunch', phase: 'reveal', eventActive: false })).toBe('cutlet');
    expect(bgmFor({ period: 'cutlet', phase: '', eventActive: true })).toBe('cutlet');
    expect(bgmFor({ period: 'cutlet', phase: '', eventActive: false })).toBe('break');
    expect(bgmFor({ period: 'robot', phase: '', eventActive: true })).toBe('robot');
    expect(bgmFor({ period: 'dodgeball', phase: '', eventActive: true })).toBe('robot');
    expect(bgmFor({ period: 'hallway', phase: '', eventActive: true })).toBe('hallway');
    expect(bgmFor({ period: 'hallway', phase: '', eventActive: false })).toBe('break');
    expect(bgmFor({ period: 'final', phase: '', eventActive: true })).toBe('hallway');
    expect(bgmFor({ period: 'final', phase: '', eventActive: false })).toBe('ending');
  });
});

describe('장소·환경음·발소리', () => {
  it('장소 판정', () => {
    expect(placeAt(0, 0, 0)).toBe('class'); // 6-1
    expect(placeAt(9, 0, 0)).toBe('hall'); // 2층 복도
    expect(placeAt(4, 0, -9)).toBe('hall'); // 계단실
    expect(placeAt(8, 0, -22)).toBe('gym');
    expect(placeAt(9, 0, 20)).toBe('library');
    expect(placeAt(14, -3.6, -2)).toBe('hall'); // 1층 현관
    expect(placeAt(30, -3.6, -2)).toBe('out'); // 교문 밖
  });

  it('환경음: 교실·복도만, 시간이 멈춘 복도는 조용', () => {
    expect(ambienceFor('class', 'korean', false)).toBe('classroom');
    expect(ambienceFor('hall', 'break', false)).toBe('corridor');
    expect(ambienceFor('out', 'arrival', false)).toBeNull();
    expect(ambienceFor('hall', 'hallway', true)).toBeNull();
    expect(ambienceFor('hall', 'hallway', false)).toBe('corridor');
  });

  it('발소리 재질', () => {
    expect(woodFloor('class')).toBe(true);
    expect(woodFloor('gym')).toBe(true);
    expect(woodFloor('hall')).toBe(false);
  });
});
