// 사건 2: 청소 로봇 비상정지 숫자판
import { Panel } from '../ui/Panel';
import { el, button, wait } from '../ui/dom';
import type { UiCtx } from './Textbook';
import { STOP_CODE, checkCode } from '../story/robotLogic';

/** 세 자리 코드 입력. 맞으면 true. 틀리면 onWrong(로봇이 우스꽝스럽게 반응) */
export function openKeypad(ctx: UiCtx, known: (string | undefined)[], onWrong: () => void): Promise<boolean> {
  return new Promise((resolve) => {
    let ok = false;
    let input = '';
    let busy = false;
    const p = new Panel(ctx.layer, { title: '청소 로봇 — 비상정지', onClose: () => resolve(ok) });
    const screen = el('div', { class: 'machine-screen' }, el('div', { class: 'machine-value' }, '_ _ _'));
    const memo = el('div', { class: 'machine-sticker' },
      el('b', {}, '내가 들은 숫자'),
      ...[0, 1, 2].map((i) => el('div', {}, `${i + 1}번째: ${known[i] ?? '? (친구에게 물어보자)'}`)),
    );
    const msg = el('div', { class: 'partner-line' }, '「비상정지 코드 세 자리를 입력하세요」');
    const show = () => {
      (screen.firstElementChild as HTMLElement).textContent = (input + '___').slice(0, 3).split('').join(' ');
    };
    const press = async (d: string) => {
      if (busy || ok) return;
      input += d;
      ctx.sfx.blip();
      show();
      const r = checkCode(input);
      if (r === 'ok') {
        ok = true;
        ctx.sfx.success();
        msg.textContent = '삐— 비상정지. 「청소를… 잠시… 쉬겠습니다…」';
        await wait(1300);
        p.close();
      } else if (r === 'wrong' || input.length >= STOP_CODE.length) {
        busy = true;
        ctx.sfx.oops();
        msg.textContent = ['삐빅! 코드 오류. 「청소 의욕이 120%로 상승했습니다!」', '삐빅! 「오답 감지. 바닥을 한 번 더 닦겠습니다」', '삐빅! 틀렸다… 친구들한테 다시 물어보자.'][Math.floor(Math.random() * 3)];
        onWrong();
        await wait(900);
        input = '';
        show();
        busy = false;
      }
    };
    const pad = el('div', { class: 'keypad' });
    for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']) pad.append(button(d, () => void press(d), 'btn big'));
    p.body.append(el('div', { class: 'machine-wrap' }, memo, el('div', { class: 'machine-area' }, screen, pad)), msg, el('div', { class: 'keys-hint' }, '숫자 키 0~9 또는 버튼'));
    p.onKey((e) => {
      if (/^\d$/.test(e.key) && !e.repeat) void press(e.key);
    });
    show();
  });
}
