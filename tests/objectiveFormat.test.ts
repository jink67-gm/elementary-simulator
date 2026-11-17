import { describe, expect, it } from 'vitest';
import { formatObjective } from '../src/ui/objectiveFormat';

describe('formatObjective', () => {
  it('짧은 문장은 그대로', () => {
    expect(formatObjective('선생님 말씀 듣기')).toEqual({ main: '선생님 말씀 듣기', route: [], list: [], note: '' });
  });
  it('끝 괄호의 화살표는 길 순서', () => {
    const p = formatObjective('가방 메고 6-1 교실 내 책상에 걸기 (횡단보도 → 교문 → 현관 → 복도 건너 계단 → 내 책상에서 E)');
    expect(p.main).toBe('가방 메고 6-1 교실 내 책상에 걸기');
    expect(p.route).toEqual(['횡단보도', '교문', '현관', '복도 건너 계단', '내 책상에서 E']);
  });
  it('덧붙인 (선택) 일은 목록으로', () => {
    const p = formatObjective('가방 메고 6-1 교실 내 책상에 걸기 (횡단보도 → 교문) · (선택) 준호 필통 찾아 주기');
    expect(p.route).toEqual(['횡단보도', '교문']);
    expect(p.list).toEqual(['(선택) 준호 필통 찾아 주기']);
  });
  it('제목: 할 일 · 할 일', () => {
    const p = formatObjective('발표 준비: 교과서 단서 찾기(E) · 짝과 이야기하기(E) · 준비되면 F로 손 들기');
    expect(p.main).toBe('발표 준비');
    expect(p.list).toEqual(['교과서 단서 찾기(E)', '짝과 이야기하기(E)', '준비되면 F로 손 들기']);
  });
  it('제목! 할 일 · 할 일', () => {
    const p = formatObjective('쉬는 시간 60초! 준호와 종이비행기 · 민재와 가위바위보 · 복도에서 공차기');
    expect(p.main).toBe('쉬는 시간 60초!');
    expect(p.list.length).toBe(3);
  });
  it('짧은 (E)는 본문에 남고, 긴 괄호 설명은 메모', () => {
    expect(formatObjective('뒤쪽 17번 사물함에서 국어책 꺼내기 (E)').main).toBe('뒤쪽 17번 사물함에서 국어책 꺼내기 (E)');
    const p = formatObjective('조리실 작업대에 절단기 레일 걸기 (조리실 문 안 안전 구역에서 작업대 쪽으로 F)');
    expect(p.main).toBe('조리실 작업대에 절단기 레일 걸기');
    expect(p.note).toBe('조리실 문 안 안전 구역에서 작업대 쪽으로 F');
  });
  it('— 진행 메모', () => {
    const p = formatObjective('조각 집어서(E) 친구 식판에 담기(F) — 3/5');
    expect(p.main).toBe('조각 집어서(E) 친구 식판에 담기(F)');
    expect(p.note).toBe('3/5');
  });
  it('괄호 안 목록', () => {
    const p = formatObjective('컴퓨터 3대에서 기록 모으기 (교실 선생님 노트북 · 1층 급식실 앞 키오스크 · 방송실 노트북)');
    expect(p.main).toBe('컴퓨터 3대에서 기록 모으기');
    expect(p.list).toEqual(['교실 선생님 노트북', '1층 급식실 앞 키오스크', '방송실 노트북']);
  });
});
