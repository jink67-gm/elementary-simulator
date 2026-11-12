// 사건 4: 시간표 카드를 순서대로 놓기
import { Panel } from '../ui/Panel';
import { el, button } from '../ui/dom';
import type { UiCtx } from './Textbook';
import { CARD_TEXT, type CardId } from '../story/hallwayLogic';

/** 모은 카드를 여섯 칸에 순서대로. 다 채우고 Enter → 순서, 닫으면 null */
export function openTimetable(ctx: UiCtx, cards: CardId[], hints: string[], lastRight: number | null): Promise<CardId[] | null> {
  return new Promise((resolve) => {
    let res: CardId[] | null = null;
    const p = new Panel(ctx.layer, { title: '시간표 복원판 — 오늘 오전을 순서대로', wide: true, onClose: () => resolve(res) });
    const slots: (CardId | null)[] = Array(6).fill(null);
    const hand = el('div', { class: 'cards' });
    const row = el('div', { class: 'slots six' });
    const msg = el('div', { class: 'keys-hint' }, '카드를 누르면(1~6) 빈 칸에 차례로 들어가요 · 칸을 누르면 빼기 · Backspace 처음부터 · Enter 확인');
    const render = () => {
      hand.innerHTML = '';
      cards.forEach((c, i) => {
        if (slots.includes(c)) return;
        hand.append(button(`${i + 1}. ${CARD_TEXT[c]}`, () => put(c), 'card'));
      });
      row.innerHTML = '';
      slots.forEach((c, i) => {
        const s = el('div', { class: 'slot-card' + (c ? ' filled' : '') }, el('div', { class: 'slot-label' }, `${i + 1}번째`), c ? CARD_TEXT[c] : '');
        s.addEventListener('click', () => {
          slots[i] = null;
          render();
        });
        row.append(s);
      });
    };
    const put = (c: CardId) => {
      const i = slots.indexOf(null);
      if (i < 0 || slots.includes(c)) return;
      slots[i] = c;
      ctx.sfx.place();
      render();
    };
    const confirm = () => {
      if (slots.includes(null)) {
        ctx.sfx.oops();
        msg.textContent = '여섯 칸을 다 채워 주세요.';
        return;
      }
      res = slots as CardId[];
      p.close();
    };
    const hintBox = el('div', { class: 'info-lines' });
    for (const h of hints) hintBox.append(el('div', { class: 'info-line' }, h));
    if (lastRight !== null) hintBox.append(el('div', { class: 'info-line' }, `(지난번에는 ${lastRight}칸이 맞았다)`));
    p.body.append(hintBox, row, hand, msg, el('div', { class: 'row center' }, button('이 순서로 복원! (Enter)', confirm, 'btn primary')));
    p.onKey((e) => {
      if (e.repeat) return;
      const n = Number(e.key);
      if (n >= 1 && n <= cards.length) put(cards[n - 1]);
      else if (e.key === 'Backspace') (slots.fill(null), render());
      else if (e.key === 'Enter') confirm();
    });
    render();
  });
}
