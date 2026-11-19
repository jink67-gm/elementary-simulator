// 지금 어떤 배경음악·환경음·발소리를 쓸지 정하는 규칙 (순수 함수: 테스트하기 쉽게).
// 장소보다 「지금 무슨 일이 일어나는지」(교시·사건 상태)가 먼저다: 교실에 들어왔다고 수업 음악이 나오지 않는다.
import type { AmbId, BgmId } from './Audio';
import type { PeriodId } from './SaveData';

export interface MusicState {
  period: PeriodId;
  phase: string;
  /** 지금 교시가 사건이면: 사건이 아직 진행 중인가 (해결되면 false) */
  eventActive: boolean;
}

/** 교시·사건 상태 → BGM */
export function bgmFor(s: MusicState): BgmId {
  switch (s.period) {
    case 'arrival':
      return 'explore'; // 등교: 학교 탐험
    case 'korean':
    case 'math':
      return 'class'; // 일반 수업
    case 'break':
      return 'break';
    case 'group':
    case 'art':
      return 'group'; // 모둠 활동·포스터·미술
    case 'lunch':
      // 급식실로 가는 자유 시간 → 문이 열리고 거대 돈가스가 나타나면 사건 음악
      return s.phase === 'reveal' ? 'cutlet' : 'break';
    case 'cutlet':
      return s.eventActive ? 'cutlet' : 'break';
    case 'robot':
      return s.eventActive ? 'robot' : 'break';
    case 'dodgeball':
      return s.eventActive ? 'robot' : 'break'; // 피구 소동·추격도 같은 「대폭주」 곡
    case 'hallway':
      return s.eventActive ? 'hallway' : 'break'; // 시간이 다시 흐르면 진짜 쉬는 시간
    case 'final':
      return s.eventActive ? 'hallway' : 'ending'; // AI 오류 → 해결하면 하교 엔딩 (한 번만)
  }
}

export type Place = 'class' | 'gym' | 'library' | 'hall' | 'out';

/** 위치 → 장소 종류 (y: 2층 바닥 0, 1층 -3.6) */
export function placeAt(x: number, y: number, z: number): Place {
  if (y < -1.8) {
    // 1층: 현관 바깥(정문·횡단보도)은 실외, 나머지는 복도·현관·급식실
    return x > 18.0 ? 'out' : 'hall';
  }
  if (z < -16.2) return 'gym';
  if (z > 16.2) return 'library';
  // 복도 서쪽 교실들 (5-1 · 6-1 · 4-1). 가운데 계단실 띠는 복도 취급
  if (x < 7.05 && z > -16.1 && z < 16.1 && !(z > -11.6 && z < -6.8)) return 'class';
  return 'hall';
}

/** 장소 → 환경음. 시간이 멈춘 무한 복도에서는 조용하게 */
export function ambienceFor(place: Place, period: PeriodId, eventActive: boolean): AmbId | null {
  if (period === 'hallway' && eventActive) return null;
  if (place === 'class') return 'classroom';
  if (place === 'hall') return 'corridor';
  return null;
}

/** 발소리 재질: 교실·체육관 마루는 나무, 나머지는 타일·돌 */
export function woodFloor(place: Place): boolean {
  return place === 'class' || place === 'gym';
}
