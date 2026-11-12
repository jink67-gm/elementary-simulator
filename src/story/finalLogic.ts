// 최종 사건 「AI 학교생활 도우미」 규칙과 엔딩 판정 — 순수 로직. 테스트: tests/final.test.ts
import type { SaveData } from '../core/SaveData';

export type RecordId = 'poster' | 'lunch' | 'wishes';
export const RECORD_NAMES: Record<RecordId, string> = { poster: '모둠 포스터 파일', lunch: '급식 기록', wishes: '소원 설문 기록' };

/** AI가 잘못 알아들은 소원과 진짜 바람 */
export type RealId = 'meal' | 'tidy' | 'play' | 'rest' | 'erase';
export const REAL_CARDS: Record<RealId, string> = {
  meal: '맛있는 급식을 다 같이 넉넉히 먹고 싶다',
  tidy: '청소를 같이 하면 덜 힘들면 좋겠다',
  play: '체육 시간이 더 즐거웠으면 좋겠다',
  rest: '친구들과 놀 시간이 조금만 더 있으면 좋겠다',
  erase: '학교가 사라졌으면 좋겠다',
};
export const MISREADS: { id: string; wish: string; ai: string; real: RealId }[] = [
  { id: 'cutlet', wish: '「돈가스 왕 크게!」', ai: '돈가스 크기 1,000% 확대', real: 'meal' },
  { id: 'robot', wish: '「청소는 로봇이 다 해 주면」', ai: '교실의 모든 물건 수거', real: 'tidy' },
  { id: 'ball', wish: '「피구공 안 잃어버렸으면」', ai: '공 크기 1,000% 확대', real: 'play' },
  { id: 'break', wish: '「쉬는 시간 100분!」', ai: '학교 시간 정지', real: 'rest' },
];

export function checkMatch(pairs: Record<string, RealId | undefined>): { ok: boolean; wrong: string[] } {
  const wrong = MISREADS.filter((m) => pairs[m.id] !== m.real).map((m) => m.id);
  return { ok: wrong.length === 0, wrong };
}

/** 개선 기준 세 가지 */
export interface Criteria {
  space: 'keep' | 'remove';
  rest: 0 | 10 | 15 | 100;
  lessons: 'safeFun' | 'testOnly' | 'none';
}
export const CRITERIA_OPTIONS = {
  space: [['keep', '친구들과 만날 공간 유지'], ['remove', '공간 없애기 (집에서 혼자)']] as const,
  rest: [[0, '쉬는 시간 0분'], [10, '쉬는 시간 10분 (지금처럼)'], [15, '쉬는 시간 15분 (조금 더)'], [100, '쉬는 시간 100분']] as const,
  lessons: [['safeFun', '안전하고 즐거운 수업 유지'], ['testOnly', '시험만 보기'], ['none', '수업 없애기']] as const,
};

/** 기준이 바람직한지, 아니면 AI가 뭐라고 되묻는지 */
export function criteriaFeedback(c: Criteria): string | null {
  if (c.space === 'remove') return '「만날 공간 없음」 → 친구들과 만날 수 없습니다. 모둠 포스터 기록과 맞지 않습니다.';
  if (c.rest === 100) return '「쉬는 시간 100분」 → 아까처럼 시간이 멈출 수 있습니다. 다시 확인해 주세요.';
  if (c.rest === 0) return '「쉬는 시간 0분」 → 소원 기록에 「놀 시간이 조금 더」가 있습니다.';
  if (c.lessons !== 'safeFun') return '「수업」 기준이 학생 기록(즐거운 체육·모둠 활동)과 맞지 않습니다.';
  return null;
}

/** 숨은 미션: 하루 동안 친구를 도운 일들 (성적과 무관) */
export const HIDDEN: { id: string; label: string; done: (s: SaveData) => boolean }[] = [
  { id: 'pencil', label: '준호 필통 찾아 주기', done: (s) => !!s.flags.pencilReturned },
  { id: 'device', label: '서아 태블릿 도와주기', done: (s) => !!s.flags.helpedDevice },
  { id: 'glue', label: '하린이 풀 돌려주기', done: (s) => !!s.flags.returnedGlue },
  { id: 'share', label: '점심을 다 같이 나누기 (공평 배식 또는 축제)', done: (s) => !!s.flags.sharedFairly || !!s.flags.festivalHeld },
  { id: 'tapes', label: '방송 기록 테이프 모두 찾기', done: (s) => !!s.flags.foundBroadcastLog },
];
export function hiddenProgress(s: SaveData): { done: string[]; total: number } {
  return { done: HIDDEN.filter((h) => h.done(s)).map((h) => h.id), total: HIDDEN.length };
}

export type Ending = 'A' | 'B' | 'C';
export const ENDING_TITLES: Record<Ending, [string, string]> = {
  A: ['엔딩 A · 평범한 학교', '근데… 내일도 학교 와야 하네?'],
  B: ['엔딩 B · 조금 나아진 학교', '우리가 말한 게 진짜로 바뀌었다.'],
  C: ['엔딩 C · 전설의 학교', '비밀 놀이 공간이 열렸다!'],
};

export function decideEnding(o: { reset: boolean; criteriaOk: boolean; hiddenAll: boolean }): Ending | null {
  if (o.reset) return 'A';
  if (!o.criteriaOk) return null;
  return o.hiddenAll ? 'C' : 'B';
}

/** 엔딩 뒤 이야기: 앞에서 한 해결 방법이 학교 변화로 남는다 */
export function epilogue(s: SaveData, e: Ending, rest: Criteria['rest'] | null): string[] {
  if (e === 'A') {
    return [
      'AI 도우미는 처음 상태로 돌아갔다. 돈가스도, 피구공도, 시계도 원래대로.',
      '민재: 「아쉽다… 그래도 돈가스는 맛있었어.」',
      '다음 날 아침, 알람이 울린다. 08:25.',
    ];
  }
  const out: string[] = [];
  if (rest === 15) out.push('쉬는 시간이 10분에서 15분으로 늘었다. (5분이지만 엄청 크다)');
  else out.push('쉬는 시간은 그대로 10분. 대신 「쉬는 시간 의견함」이 생겼다.');
  const sol = s.cafeteriaSolution;
  if (sol === 'festival') out.push('한 달에 한 번 「급식 축제의 날」이 생겼다.');
  else if (sol === 'shrink_machine') out.push('급식 메뉴를 학생들이 투표로 정하는 「급식 의견판」이 생겼다.');
  else out.push('「다 같이 나눠 먹기」 날이 생겼다. 배식 당번은 돌아가면서!');
  if (s.flags.robotReprogrammed) out.push('청소 로봇은 「학생 물건 금지」 모드로 청소 도우미가 됐다.');
  else if (s.results.robot) out.push('청소 로봇은 무거운 쓰레기통만 옮겨 주는 도우미가 됐다.');
  if (s.flags.newSportInvented) out.push('체육 시간 새 종목 「다 같이 굴려 굴려」가 정식 종목이 됐다.');
  else if (s.results.dodgeball) out.push('피구공에는 이제 커다란 이름표가 붙어 있다.');
  if (s.schoolPosterTheme) out.push('모둠 포스터에 쓴 생각이 학교 게시판 맨 위에 붙었다.');
  if (e === 'C') {
    out.push('그리고… 체육관 옆 공 창고 뒤편에서 「비밀 놀이 공간」 문이 열렸다!');
    out.push('하린: 「여기, 우리 반만 아는 곳이다.」');
  }
  return out;
}
