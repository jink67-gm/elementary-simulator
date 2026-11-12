// 사건 4 「끝나지 않는 쉬는 시간」 규칙 — 순수 로직. 테스트: tests/hallway.test.ts
import type { SaveData } from '../core/SaveData';

export type CardId = 'korean' | 'break' | 'math' | 'group' | 'art' | 'lunch';
/** 진짜 오전 순서 */
export const CORRECT_ORDER: CardId[] = ['korean', 'break', 'math', 'group', 'art', 'lunch'];

export const CARD_TEXT: Record<CardId, string> = {
  korean: '국어책 펴기 · 인물의 마음',
  break: '복도 · 종이비행기 · 가위바위보',
  math: '태블릿 퀴즈 대결',
  group: '모둠 포스터 만들기',
  art: '종이비행기 / 미니 포스터 만들기',
  lunch: '급식실 · 거대 돈가스',
};
export const CARD_TIME: Record<CardId, string> = { korean: '09:00', break: '09:40', math: '09:50', group: '10:40', art: '11:30', lunch: '12:10' };

/** 시간 문 위 시계: 뒤틀려서 엉뚱한 시각을 가리킨다 */
export const DOOR_CLOCK: Record<CardId, string> = { korean: '13:13', break: '09:99', math: '07:07', group: '12:00', art: '08:30', lunch: '10:10' };

/** 문을 열면 보이는 오전의 기억 (플레이어가 실제로 한 행동으로 채운다) */
export function memoryOf(id: CardId, s: SaveData): string[] {
  const f = s.flags;
  switch (id) {
    case 'korean':
      return [
        '선생님: 「국어책 86쪽 펴 볼까요?」',
        f.helpedPageFriend ? '서아에게 86쪽을 알려 줬다.' : '86쪽을 찾느라 책장을 마구 넘겼다.',
        f.spokeInClass ? '손을 들고 발표했다!' : '발표는… 마음속으로만 했다.',
        '→ 아침에 맨 처음 들은 수업이었다.',
      ];
    case 'break':
      return [
        '종이비행기가 복도를 날았다.' + (s.stats.planeBest ? ` (최고 ${s.stats.planeBest}m)` : ''),
        s.stats.rpsGames ? `민재와 가위바위보 ${s.stats.rpsGames}판.` : '민재가 가위바위보 하자고 졸랐다.',
        f.heardBreakWish ? '하린: 「쉬는 시간 100분이었으면 좋겠다…」' : '누군가 「10분 너무 짧아…」라고 했다.',
        '→ 첫 수업이 끝나고 바로였다. 10분.',
      ];
    case 'math':
      return [
        '태블릿을 켜고 퀴즈 대결!' + (f.quizDone && !f.quizSkipped ? ` (${s.quizScore}/3)` : ''),
        f.helpedDevice ? '서아 태블릿 배터리 문제를 도와줬다.' : '서아 태블릿이 3%였다.',
        '수업 끝에 AI 소원 설문이 떴다.',
      ];
    case 'group':
      return [
        '모둠 책상에 넷이 모였다.',
        s.groupRole ? `내 역할 카드: ${{ speaker: '발표', maker: '제작', researcher: '자료', organizer: '정리' }[s.groupRole]}` : '역할을 정했다.',
        '「우리 학교를 더 재미있게 바꾸는 방법」 포스터.',
      ];
    case 'art':
      return [f.artPlane ? '색종이로 비행기를 접었다.' : f.artPoster ? '미니 포스터를 꾸몄다.' : '만들기를 했다.', f.returnedGlue ? '하린이 풀을 빌려 쓰고 바로 돌려줬다.' : '풀을 빌려 썼다.', '선생님: 「정리하고 급식 먹으러 가요!」'];
    case 'lunch':
      return ['급식실 문이 열리자…', '돈가스가 책상보다 컸다.', s.cafeteriaSolution === 'festival' ? '복도에서 돈가스 축제를 열었다!' : s.cafeteriaSolution === 'shrink_machine' ? '크기 조절기로 원래대로 돌렸다.' : '다 같이 나눠 먹었다.'];
  }
}

/** 방송 기록 테이프 세 개 — 순서 단서 */
export const BROADCAST_LOGS = [
  '[방송 기록 1] 「1교시가 끝났습니다. 10분 쉬는 시간입니다.」',
  '[방송 기록 2] 「3교시는 모둠 활동입니다. 수학 시간에 쓴 태블릿은 충전함에 넣어 주세요.」',
  '[방송 기록 3] 「4교시 미술 정리 후 급식실로 이동합니다.」',
];
/** 자료 담당이었거나 AI 설명서를 찾았으면 하나 더 */
export const EXTRA_HINT = '[AI 설명서 메모] 「오전 시간표: 첫 수업은 국어. 교시 사이에는 쉬는 시간이 한 번만 길게 표시됩니다.」';

export function checkOrder(order: CardId[]): { ok: boolean; right: number } {
  let right = 0;
  order.forEach((c, i) => c === CORRECT_ORDER[i] && right++);
  return { ok: right === CORRECT_ORDER.length && order.length === CORRECT_ORDER.length, right };
}

export function hasExtraHint(s: SaveData): boolean {
  return s.groupRole === 'researcher' || !!s.flags.foundAIManual;
}
