// 오전 시간표와 화면 시계 — 순수 로직.
import { PERIODS, type PeriodId } from '../core/SaveData';

export interface PeriodInfo {
  id: PeriodId;
  label: string;
  /** 게임 속 시각(분, 0시 기준) */
  start: number;
  end: number;
  /** 이 시간 동안 시계가 start→end로 흐른다(실제 초). 그 뒤에는 end-1분에 멈춰 기다린다. */
  expectedSec: number;
  /** 이 시간이 지나면 선생님이 정리해 주고 다음으로 넘어간다(진행 막힘 방지). */
  softLimitSec: number;
}

const hm = (h: number, m: number) => h * 60 + m;

export const SCHEDULE: Record<PeriodId, PeriodInfo> = {
  arrival: { id: 'arrival', label: '등교', start: hm(8, 40), end: hm(9, 0), expectedSec: 120, softLimitSec: 210 },
  korean: { id: 'korean', label: '1교시 국어', start: hm(9, 0), end: hm(9, 40), expectedSec: 180, softLimitSec: 260 },
  break: { id: 'break', label: '쉬는 시간', start: hm(9, 40), end: hm(9, 50), expectedSec: 60, softLimitSec: 60 },
  math: { id: 'math', label: '2교시 수학', start: hm(9, 50), end: hm(10, 30), expectedSec: 180, softLimitSec: 300 },
  group: { id: 'group', label: '3교시 모둠 활동', start: hm(10, 40), end: hm(11, 20), expectedSec: 180, softLimitSec: 300 },
  art: { id: 'art', label: '4교시 미술', start: hm(11, 30), end: hm(12, 10), expectedSec: 150, softLimitSec: 260 },
  lunch: { id: 'lunch', label: '점심시간', start: hm(12, 10), end: hm(12, 20), expectedSec: 90, softLimitSec: 9999 },
  // 사건 1: 거대 돈가스. 오래 막히면 단계별 힌트, 10분이 넘으면 어른들이 도와 마무리한다
  cutlet: { id: 'cutlet', label: '점심시간 · 사건 1', start: hm(12, 20), end: hm(13, 0), expectedSec: 480, softLimitSec: 600 },
  robot: { id: 'robot', label: '청소 시간 · 사건 2', start: hm(13, 0), end: hm(13, 20), expectedSec: 300, softLimitSec: 480 },
  dodgeball: { id: 'dodgeball', label: '5교시 체육 · 사건 3', start: hm(13, 20), end: hm(14, 0), expectedSec: 240, softLimitSec: 480 },
  // 시간이 멈춘 쉬는 시간: 화면 시계는 14:00 근처에서 멈춘다
  hallway: { id: 'hallway', label: '쉬는 시간 · 사건 4', start: hm(14, 0), end: hm(14, 1), expectedSec: 9999, softLimitSec: 480 },
};

export function nextPeriod(p: PeriodId): PeriodId | null {
  const i = PERIODS.indexOf(p);
  return i >= 0 && i < PERIODS.length - 1 ? PERIODS[i + 1] : null;
}

/** 지난 실제 시간(초) → 게임 시각(분). 늦잠이면 등교 시각이 늦게 시작한다. */
export function clockMinutes(p: PeriodId, elapsedSec: number, overslept = false): number {
  const info = SCHEDULE[p];
  const start = p === 'arrival' && overslept ? hm(8, 52) : info.start;
  const t = Math.min(1, Math.max(0, elapsedSec / info.expectedSec));
  return Math.min(info.end - 1, start + t * (info.end - start));
}

export function formatClock(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.floor(min % 60);
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h > 12 ? h - 12 : h;
  return `${ampm} ${h12}:${String(m).padStart(2, '0')}`;
}
