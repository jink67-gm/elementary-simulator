import { describe, expect, it } from 'vitest';
import { BALL_START, GOALS, decideDodge, launchAdvice, rulesOk, simulateLaunch, stepBall } from '../src/story/dodgeLogic';

describe('초대형 피구공 발사 실험', () => {
  it('똑바로 서쪽은 뜀틀에 걸려 실패', () => {
    expect(simulateLaunch(0, 10).result).toBe('stopped');
  });
  it('30도 · 힘 8이면 창고로', () => {
    expect(simulateLaunch(30, 8).result).toBe('stored');
  });
  it('각도가 맞아도 힘이 약하면 모자람', () => {
    const r = simulateLaunch(30, 3);
    expect(r.result).toBe('stopped');
    expect(launchAdvice(30, 3, r)).toContain('세게');
  });
  it('정답 각도는 여러 개 (5도 단위로 2개 이상)', () => {
    const ok = [];
    for (let a = -45; a <= 45; a += 5) if (simulateLaunch(a, 9).result === 'stored') ok.push(a);
    expect(ok.length).toBeGreaterThanOrEqual(2);
  });
  it('공은 체육관 밖으로 안 나간다', () => {
    const b = { x: BALL_START.x, z: BALL_START.z, vx: 20, vz: 20 };
    for (let i = 0; i < 300; i++) stepBall(b, 1 / 30);
    expect(b.x).toBeLessThanOrEqual(17);
    expect(b.z).toBeLessThanOrEqual(-16.1);
  });
});

describe('새 경기', () => {
  it('규칙 카드', () => {
    expect(rulesOk(['roll', 'team', 'goals'])).toBe('ok');
    expect(rulesOk(['roll', 'hit', 'goals'])).toBe('unsafe');
    expect(rulesOk(['roll', 'team', 'cheer'])).toBe('needGoals');
    expect(rulesOk(['goals'])).toBe('few');
  });
  it('북쪽으로 밀면 북쪽 골', () => {
    const b = { x: 9, z: -23, vx: 0, vz: 0 };
    let hit = false;
    for (let i = 0; i < 200 && !hit; i++) {
      stepBall(b, 1 / 30, i < 10 ? [{ dx: 0, dz: -0.6 }] : []);
      hit = GOALS[0].test(b);
    }
    expect(hit).toBe(true);
  });
});

describe('해결 판정', () => {
  const base = { stored: false, shrunkInCart: false, goals: 0, launches: 0, shrinkTried: false, rulesSet: false };
  it('아직', () => expect(decideDodge({ ...base, launches: 3 })).toBeNull());
  it('물리', () => expect(decideDodge({ ...base, launches: 2, stored: true })).toBe('physics'));
  it('축소', () => expect(decideDodge({ ...base, shrinkTried: true, shrunkInCart: true })).toBe('shrink'));
  it('새 경기', () => expect(decideDodge({ ...base, rulesSet: true, goals: 2 })).toBe('sport'));
  it('섞어서', () => expect(decideDodge({ ...base, launches: 1, rulesSet: true, goals: 2 })).toBe('mixed'));
});
