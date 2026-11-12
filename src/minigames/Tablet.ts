// 2교시 태블릿: 퀴즈 대결 3문제 → AI 학교생활 도우미 소원 설문
import { Panel } from '../ui/Panel';
import { el, button, wait } from '../ui/dom';
import { checkAnswer, type QuizQuestion } from './quizLogic';
import type { UiCtx } from './Textbook';
import type { Wish } from '../core/SaveData';

export interface TabletResult {
  score: number;
  wish: Wish;
}

export const WISH_LABELS: Record<Wish, string> = {
  lunch: '급식 왕창!',
  break: '쉬는 시간 100분',
  sport: '체육 매일 하기',
  clean: '청소는 자동으로',
};

export interface TabletHooks {
  /** 문제를 풀 때마다 친구 반응 한 줄 (이름, 말) */
  react: (qIndex: number, correct: boolean) => [string, string];
  sharedWith: string | null;
}

export function openTablet(ctx: UiCtx, questions: QuizQuestion[], hooks: TabletHooks): Promise<TabletResult> {
  return new Promise((resolve) => {
    const p = new Panel(ctx.layer, { title: '17번 태블릿', closable: false, wide: true, cls: 'tablet-wrap' });
    const screen = el('div', { class: 'tablet-screen' });
    const chat = el('div', { class: 'tablet-chat' });
    p.body.append(el('div', { class: 'tablet' }, screen, chat));
    const say = (who: string, text: string) => {
      chat.append(el('div', { class: 'chat-line' }, el('b', {}, who), ' ', text));
      chat.scrollTop = chat.scrollHeight;
    };
    if (hooks.sharedWith) say(hooks.sharedWith, '같이 보자! 화면 잘 보여.');

    let keyFn: ((e: KeyboardEvent) => void) | null = null;
    p.onKey((e) => keyFn?.(e));

    const quiz = async (): Promise<number> => {
      screen.innerHTML = '';
      screen.append(el('div', { class: 'boot' }, '퀴즈 대결 접속 중…'));
      await wait(900);
      let score = 0;
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const correct = await new Promise<boolean>((res) => {
          screen.innerHTML = '';
          const input = el('div', { class: 'answer' });
          let value = '';
          const feedback = el('div', { class: 'feedback' });
          let locked = false;
          const draw = () => (input.textContent = value || ' ');
          const submit = () => {
            if (locked || !value) return;
            locked = true;
            const ok = checkAnswer(value, q.answer);
            feedback.textContent = ok ? '정답! 딩동댕~' : `아깝다! 정답은 ${q.answer} — ${q.hint}`;
            feedback.className = 'feedback ' + (ok ? 'good' : 'bad');
            if (ok) ctx.sfx.success();
            else ctx.sfx.oops();
            const [who, line] = hooks.react(i, ok);
            say(who, line);
            setTimeout(() => res(ok), ok ? 1300 : 2600);
          };
          const typeKey = (k: string) => {
            if (locked) return;
            if (k === '⌫') value = value.slice(0, -1);
            else if (value.length < 8) value += k;
            ctx.sfx.blip();
            draw();
          };
          const pad = el('div', { class: 'keypad' });
          for (const k of ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', '/', '⌫']) pad.append(button(k, () => typeKey(k), 'key-btn'));
          pad.append(button('확인', submit, 'key-btn ok'));
          screen.append(
            el('div', { class: 'q-count' }, `문제 ${i + 1} / ${questions.length}`),
            el('div', { class: 'question' }, q.text),
            input,
            pad,
            feedback,
            el('div', { class: 'keys-hint' }, '숫자·점(.)·빗금(/) 입력, Backspace 지우기, Enter 확인'),
          );
          draw();
          keyFn = (e) => {
            if (/^[0-9]$/.test(e.key)) typeKey(e.key);
            else if (e.key === '.' || e.key === '/') typeKey(e.key);
            else if (e.key === 'Backspace') typeKey('⌫');
            else if (e.key === 'Enter') submit();
          };
        });
        if (correct) score++;
      }
      keyFn = null;
      screen.innerHTML = '';
      screen.append(
        el('div', { class: 'question' }, '퀴즈 끝! 다 같이 수고했어요'),
        el('div', { class: 'big-score' }, `${score} / ${questions.length}`),
        el('div', { class: 'keys-hint' }, '순위는 없어요. 틀린 문제는 다음에 또 만나요!'),
      );
      await wait(2200);
      return score;
    };

    const survey = (): Promise<Wish> =>
      new Promise((res) => {
        screen.innerHTML = '';
        const head = el(
          'div',
          { class: 'ai-head' },
          el('div', { class: 'ai-badge' }, 'AI 학교생활 개선 도우미 · 시범 운영'),
          el('div', { class: 'question' }, '우리 학교에 바라는 소원을 하나 골라 주세요!'),
        );
        const grid = el('div', { class: 'wish-grid' });
        const wishes: Wish[] = ['lunch', 'break', 'sport', 'clean'];
        let chosen = false;
        const choose = async (w: Wish) => {
          if (chosen) return;
          chosen = true;
          ctx.sfx.chime();
          grid.querySelectorAll('button').forEach((b, i) => b.classList.toggle('picked', wishes[i] === w));
          await wait(600);
          screen.append(el('div', { class: 'ai-reply' }, `AI: 소원 「${WISH_LABELS[w]}」 접수 완료. 문자 그대로 최선을 다하겠습니다.`));
          await wait(2600);
          res(w);
        };
        wishes.forEach((w, i) => grid.append(button(`${i + 1}. ${WISH_LABELS[w]}`, () => void choose(w), 'wish')));
        screen.append(head, grid, el('div', { class: 'keys-hint' }, '클릭하거나 1~4'));
        keyFn = (e) => {
          const n = Number(e.key);
          if (n >= 1 && n <= 4) void choose(wishes[n - 1]);
        };
        // 민재가 옆에서 입력하는 모습
        setTimeout(() => say('민재', '(타닥타닥) 기타: "돈가스 왕 크게!!!"'), 1200);
        setTimeout(() => say('서아', '민재야 그런 거 써도 돼…?'), 2600);
      });

    void (async () => {
      const score = await quiz();
      const wish = await survey();
      keyFn = null;
      p.close();
      resolve({ score, wish });
    })();
  });
}
