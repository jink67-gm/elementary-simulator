// 국어책 86쪽 찾기 + 단서 문장 찾기
import { Panel } from '../ui/Panel';
import { el, button, wait } from '../ui/dom';
import type { Sfx } from '../core/Audio';
import { commentFor, flipChunk, flipLeaf, spreadHas, spreadLeft, BOOK_LAST_PAGE, type PageComment } from './textbookLogic';

export interface UiCtx {
  layer: HTMLElement;
  sfx: Sfx;
}

export const STORY_TITLE = '운동장에 남은 아이';
export const CLUE_SENTENCES = [
  '종이 울리자 아이들은 우르르 교실로 뛰어 들어갔다.',
  '도윤이는 아까 민호에게 "너 때문에 졌잖아!"라고 소리친 것이 자꾸 생각났다.',
  '운동장 한쪽에는 누군가 두고 간 줄넘기가 놓여 있었다.',
  '하늘에는 구름이 천천히 흘러가고 있었다.',
];
export const CLUE_INDEX = 1;

const PARTNER: Record<Exclude<PageComment, 'found'>, string[]> = {
  reversed: ['68쪽…? 숫자 뒤집힌 거 아니야?ㅋㅋ', '거기 68쪽이야. 86쪽! 팔십육!'],
  veryClose: ['거의 다 왔어! 한두 장만!', '오 근처다 근처!'],
  close: ['조금만 더 가 봐.', '그 근처 맞아. 한 장씩 넘겨 봐.'],
  far: ['선생님 벌써 첫 줄 읽으셨어…', '좀 멀다. 뭉텅이로 넘겨!'],
  wayOff: ['거기 부록 아니야?ㅋㅋ', '어… 그건 지난 학기 진도인데?'],
};

function pageText(p: number): string {
  if (p === 86) return `「${STORY_TITLE}」\n\n${CLUE_SENTENCES.join(' ')}`;
  if (p === 87) return '생각해 봅시다\n① 도윤이는 왜 혼자 남았을까요?\n② 내가 도윤이라면 어떻게 할까요?';
  if (p === 68 || p === 69) return '「봄비 오는 날」\n창밖에 톡톡 빗방울이 떨어졌다…';
  if (p > 180) return '부록 · 낱말 풀이\n가랑비: 가늘게 내리는 비';
  const topics = ['비유하는 표현', '마음을 전하는 글', '이야기의 흐름', '뉴스와 광고', '토론해요'];
  return `${topics[Math.floor(p / 20) % topics.length]}\n…………………\n…………\n………………`;
}

/** 쪽수 찾기. 찾으면 true, 창을 닫으면 false */
export function openTextbookFind(ctx: UiCtx, startPage: number, target = 86): Promise<boolean> {
  return new Promise((resolve) => {
    let left = spreadLeft(startPage);
    let done = false;
    let lastCommentAt = 0;
    const p = new Panel(ctx.layer, { title: `국어책 — ${target}쪽을 찾아요`, wide: true, onClose: () => resolve(done) });
    const pageL = el('div', { class: 'page left' });
    const pageR = el('div', { class: 'page right' });
    const book = el('div', { class: 'book' }, pageL, pageR);
    const partner = el('div', { class: 'partner-line' }, '서아: 몇 쪽이라고? 86쪽?');
    const render = () => {
      pageL.innerHTML = '';
      pageR.innerHTML = '';
      pageL.append(el('div', { class: 'page-text' }, pageText(left)), el('div', { class: 'page-num' }, String(left)));
      pageR.append(el('div', { class: 'page-text' }, pageText(left + 1)), el('div', { class: 'page-num' }, String(left + 1)));
      book.classList.toggle('found', spreadHas(left, target));
    };
    const after = async () => {
      ctx.sfx.page();
      book.classList.remove('flip');
      void book.offsetWidth;
      book.classList.add('flip');
      render();
      const c = commentFor(left, target);
      if (c === 'found') {
        done = true;
        partner.textContent = '서아: 찾았다! 86쪽. 나도 거기 펼게.';
        ctx.sfx.success();
        await wait(1100);
        p.close();
        return;
      }
      const now = performance.now();
      if (now - lastCommentAt > 1400 || c === 'reversed') {
        lastCommentAt = now;
        const list = PARTNER[c];
        partner.textContent = '서아: ' + list[Math.floor(Math.random() * list.length)];
      }
    };
    const leaf = (d: 1 | -1) => {
      if (done) return;
      left = flipLeaf(left, d);
      void after();
    };
    const chunk = (d: 1 | -1) => {
      if (done) return;
      left = flipChunk(left, d, Math.random());
      void after();
    };
    const controls = el(
      'div',
      { class: 'row center' },
      button('◀◀ 뭉텅이', () => chunk(-1)),
      button('◀ 한 장', () => leaf(-1)),
      button('한 장 ▶', () => leaf(1)),
      button('뭉텅이 ▶▶', () => chunk(1)),
    );
    p.body.append(
      book,
      partner,
      controls,
      el('div', { class: 'keys-hint' }, `A/D 또는 ←/→: 한 장 · Shift+A/D: 뭉텅이로 넘기기 (책은 ${BOOK_LAST_PAGE}쪽까지)`),
    );
    p.onKey((e) => {
      const dir = e.code === 'KeyA' || e.code === 'ArrowLeft' ? -1 : e.code === 'KeyD' || e.code === 'ArrowRight' ? 1 : 0;
      if (!dir) return;
      e.preventDefault();
      if (e.shiftKey) chunk(dir);
      else leaf(dir);
    });
    render();
  });
}

/** 86쪽에서 주인공의 마음을 알려 주는 문장 고르기. 맞히면 true */
export function openTextbookClue(ctx: UiCtx): Promise<boolean> {
  return new Promise((resolve) => {
    let ok = false;
    const p = new Panel(ctx.layer, { title: '국어책 86쪽 — 도윤이의 마음이 보이는 문장은?', wide: true, onClose: () => resolve(ok) });
    const msg = el('div', { class: 'partner-line' }, '문장을 클릭하거나 1~4를 눌러요.');
    const list = el('div', { class: 'sentences' });
    const pick = async (i: number) => {
      if (ok) return;
      const b = list.children[i] as HTMLElement;
      if (i === CLUE_INDEX) {
        ok = true;
        b.classList.add('right');
        msg.textContent = '찾았다! 도윤이는 친구에게 한 말 때문에 마음이 무거웠구나.';
        ctx.sfx.success();
        await wait(1500);
        p.close();
      } else {
        b.classList.add('wrong');
        ctx.sfx.oops();
        msg.textContent = i === 3 ? '구름 이야기는 마음이랑 상관없어 보여…' : i === 2 ? '줄넘기는… 그냥 배경 같아.' : '이건 다른 아이들 이야기네.';
      }
    };
    CLUE_SENTENCES.forEach((s, i) => list.append(button(`${i + 1}. ${s}`, () => void pick(i), 'sentence')));
    p.body.append(el('div', { class: 'story-title' }, `「${STORY_TITLE}」`), list, msg);
    p.onKey((e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= 4) void pick(n - 1);
    });
  });
}
