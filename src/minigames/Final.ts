// 최종 사건 창: AI 해석 고치기(짝짓기), 개선 기준 정하기
import { Panel } from '../ui/Panel';
import { el, button } from '../ui/dom';
import type { UiCtx } from './Textbook';
import { CRITERIA_OPTIONS, MISREADS, REAL_CARDS, type Criteria, type RealId } from '../story/finalLogic';

const LETTERS = 'ABCDE';
const REAL_ORDER: RealId[] = ['rest', 'erase', 'meal', 'play', 'tidy'];

/** 소원마다 진짜 바람 카드를 짝짓기. 줄(1~4) 고르고 카드(A~E). Enter로 보내기 */
export function openMatch(ctx: UiCtx, start: Record<string, RealId | undefined>, wrong: string[]): Promise<Record<string, RealId | undefined> | null> {
  return new Promise((resolve) => {
    let res: Record<string, RealId | undefined> | null = null;
    const pairs = { ...start };
    let row = 0;
    const p = new Panel(ctx.layer, { title: 'AI 해석 고치기 — 소원에 담긴 진짜 바람', wide: true, onClose: () => resolve(res) });
    const rows = el('div', { class: 'match-rows' });
    const cards = el('div', { class: 'cards' });
    const msg = el('div', { class: 'keys-hint' }, '1~4로 소원 줄 고르기 → A~E로 진짜 바람 카드 · Enter: AI에게 보내기');
    const render = () => {
      rows.innerHTML = '';
      MISREADS.forEach((m, i) => {
        const r = pairs[m.id];
        const line = el('div', { class: 'match-row' + (i === row ? ' sel' : '') + (wrong.includes(m.id) && r === start[m.id] ? ' bad' : '') },
          el('div', { class: 'match-wish' }, `${i + 1}. ${m.wish}`),
          el('div', { class: 'match-ai' }, `AI: ${m.ai}`),
          el('div', { class: 'match-real' }, r ? `→ ${REAL_CARDS[r]}` : '→ (진짜 바람은?)'),
        );
        line.addEventListener('click', () => ((row = i), render()));
        rows.append(line);
      });
      cards.innerHTML = '';
      REAL_ORDER.forEach((id, i) => cards.append(button(`${LETTERS[i]}. ${REAL_CARDS[id]}`, () => pick(id), 'card')));
    };
    const pick = (id: RealId) => {
      pairs[MISREADS[row].id] = id;
      ctx.sfx.place();
      row = Math.min(MISREADS.length - 1, row + 1);
      render();
    };
    const send = () => {
      if (MISREADS.some((m) => !pairs[m.id])) {
        ctx.sfx.oops();
        msg.textContent = '네 줄 모두 진짜 바람을 골라 주세요.';
        return;
      }
      res = pairs;
      p.close();
    };
    if (wrong.length) p.body.append(el('div', { class: 'partner-line' }, `AI: 「${wrong.length}개는 기록과 맞지 않습니다.」 (빨간 줄을 다시 봐요)`));
    p.body.append(rows, cards, msg, el('div', { class: 'row center' }, button('AI에게 보내기 (Enter)', send, 'btn primary')));
    p.onKey((e) => {
      if (e.repeat) return;
      const n = Number(e.key);
      if (n >= 1 && n <= MISREADS.length) (row = n - 1), render();
      const li = LETTERS.indexOf(e.key.toUpperCase());
      if (li >= 0 && e.key.length === 1) pick(REAL_ORDER[li]);
      if (e.key === 'Enter') send();
    });
    render();
  });
}

/** 개선 기준 세 가지. AI의 지금 설정(학교 삭제 계획)에서 시작한다 */
export function openCriteria(ctx: UiCtx, feedback: string | null): Promise<Criteria | null> {
  return new Promise((resolve) => {
    let res: Criteria | null = null;
    const c: Criteria = { space: 'remove', rest: 0, lessons: 'none' };
    const p = new Panel(ctx.layer, { title: 'AI 개선 기준 — 우리 학교에 꼭 필요한 것', wide: true, onClose: () => resolve(res) });
    const box = el('div', { class: 'criteria' });
    const keys: (keyof Criteria)[] = ['space', 'rest', 'lessons'];
    const label = { space: '① 공간', rest: '② 쉬는 시간', lessons: '③ 수업' };
    const cycle = (k: keyof Criteria) => {
      const opts = CRITERIA_OPTIONS[k] as readonly (readonly [string | number, string])[];
      const i = opts.findIndex(([v]) => v === c[k]);
      (c as unknown as Record<string, unknown>)[k] = opts[(i + 1) % opts.length][0];
      ctx.sfx.blip();
      render();
    };
    const render = () => {
      box.innerHTML = '';
      for (const k of keys) {
        const opts = CRITERIA_OPTIONS[k] as readonly (readonly [string | number, string])[];
        const cur = opts.find(([v]) => v === c[k])![1];
        box.append(el('div', { class: 'criteria-row' }, el('b', {}, label[k]), button(`${cur}  ⟳`, () => cycle(k), 'btn')));
      }
    };
    p.body.append(
      el('div', { class: 'partner-line' }, feedback ? `AI: 「${feedback}」` : 'AI: 「현재 계획: 공간 없음 · 쉬는 시간 0분 · 수업 없음 → 학교 삭제」'),
      box,
      el('div', { class: 'keys-hint' }, '1·2·3: 기준 바꾸기 · Enter: 이 기준으로 적용'),
      el('div', { class: 'row center' }, button('이 기준으로 적용! (Enter)', () => ((res = { ...c }), p.close()), 'btn primary big')),
    );
    p.onKey((e) => {
      if (e.repeat) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 3) cycle(keys[n - 1]);
      if (e.key === 'Enter') {
        res = { ...c };
        p.close();
      }
    });
    render();
  });
}
