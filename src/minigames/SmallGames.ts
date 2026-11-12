// 가위바위보, 발표 문장 카드, 종이비행기 접기, 안내 카드
import { Panel } from '../ui/Panel';
import { el, button, wait, wa } from '../ui/dom';
import type { UiCtx } from './Textbook';

// ───────── 가위바위보 ─────────
export type Rps = 0 | 1 | 2; // 가위·바위·보
const RPS = ['가위', '바위', '보'];
export function rpsResult(me: Rps, them: Rps): 'win' | 'lose' | 'draw' {
  if (me === them) return 'draw';
  return (me + 3 - them) % 3 === 1 ? 'win' : 'lose';
}

export function openRps(ctx: UiCtx, opponent: string): Promise<'win' | 'lose' | 'draw' | null> {
  return new Promise((resolve) => {
    let res: 'win' | 'lose' | 'draw' | null = null;
    const p = new Panel(ctx.layer, { title: `${opponent}${wa(opponent)} 가위바위보`, onClose: () => resolve(res) });
    const call = el('div', { class: 'rps-call' }, '내 거 골라! (1 가위 · 2 바위 · 3 보)');
    const result = el('div', { class: 'partner-line' }, `${opponent}: 나 이번엔 바위 낸다? 진짜로?`);
    let picked = false;
    const go = async (me: Rps) => {
      if (picked) return;
      picked = true;
      for (const w of ['가위…', '바위…', '보!']) {
        call.textContent = w;
        ctx.sfx.blip();
        await wait(380);
      }
      // 민재는 '바위 낸다'고 해 놓고 절반은 진짜 바위
      const them = (Math.random() < 0.5 ? 1 : Math.floor(Math.random() * 3)) as Rps;
      res = rpsResult(me, them);
      call.textContent = `나: ${RPS[me]}  vs  ${opponent}: ${RPS[them]}`;
      const lines = {
        win: [`${opponent}: 아 진짜?! 한 판 더! …아 쉬는 시간 끝나겠다`, `${opponent}: 너 혹시 내 마음 읽었어?`],
        lose: [`${opponent}: 거봐 바위라니까ㅋㅋ 믿었어야지`, `${opponent}: 오예! 오늘 운 좋다. 급식도 맛있겠다`],
        draw: [`${opponent}: 똑같네?! 우리 텔레파시 통했다`, `${opponent}: 비겼다… 이건 무효!`],
      }[res];
      result.textContent = lines[Math.floor(Math.random() * lines.length)];
      res === 'win' ? ctx.sfx.success() : ctx.sfx.place();
      await wait(1800);
      p.close();
    };
    p.body.append(call, el('div', { class: 'row center' }, ...RPS.map((n, i) => button(`${i + 1}. ${n}`, () => void go(i as Rps), 'btn big'))), result);
    p.onKey((e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= 3) void go((n - 1) as Rps);
    });
  });
}

// ───────── 발표 문장 카드 ─────────
export const SPEECH_CARDS = [
  '우리 모둠은 학교를 더 재미있게 바꾸는 방법을 생각했습니다.',
  '예를 들어, 학생들이 원하는 것을 직접 이야기할 시간을 만들면 좋겠습니다.',
  '그러면 모두가 오고 싶은 학교가 될 것입니다. 들어 주셔서 감사합니다!',
];

export function openSpeech(ctx: UiCtx): Promise<{ order: number[]; good: boolean } | null> {
  return new Promise((resolve) => {
    let res: { order: number[]; good: boolean } | null = null;
    const p = new Panel(ctx.layer, { title: '발표 준비 — 문장 카드를 순서대로 놓아요', wide: true, onClose: () => resolve(res) });
    const shuffled = [2, 0, 1];
    const slots: (number | null)[] = [null, null, null];
    let held: number | null = null;
    const hand = el('div', { class: 'cards' });
    const slotRow = el('div', { class: 'slots' });
    const msg = el('div', { class: 'keys-hint' }, '카드를 클릭한 다음 칸을 클릭하거나, 1~3을 눌러 차례대로 놓아요. Backspace: 다시');
    const render = () => {
      hand.innerHTML = '';
      shuffled.forEach((ci, i) => {
        if (slots.includes(ci)) return;
        const c = button(`${i + 1}. ${SPEECH_CARDS[ci]}`, () => {
          held = ci;
          render();
        }, 'card' + (held === ci ? ' held' : ''));
        c.draggable = true;
        c.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/plain', String(ci)));
        hand.append(c);
      });
      slotRow.innerHTML = '';
      ['처음', '가운데', '끝'].forEach((label, si) => {
        const s = el('div', { class: 'slot-card' + (slots[si] !== null ? ' filled' : '') }, el('div', { class: 'slot-label' }, label), slots[si] !== null ? SPEECH_CARDS[slots[si]!] : '');
        s.addEventListener('click', () => put(si));
        s.addEventListener('dragover', (e) => e.preventDefault());
        s.addEventListener('drop', (e) => {
          e.preventDefault();
          held = Number(e.dataTransfer?.getData('text/plain'));
          put(si);
        });
        slotRow.append(s);
      });
    };
    const put = async (si: number) => {
      if (held === null) return;
      slots[si] = held;
      held = null;
      ctx.sfx.place();
      render();
      if (slots.every((s) => s !== null)) {
        const order = slots as number[];
        res = { order, good: order.join() === '0,1,2' };
        msg.textContent = res.good ? '자연스러운 순서! 이제 발표하러 가자.' : '음… 순서가 좀 웃기지만 그래도 발표는 할 수 있어!';
        ctx.sfx.success();
        await wait(1600);
        p.close();
      }
    };
    p.body.append(slotRow, hand, msg);
    p.onKey((e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= 3) {
        const ci = shuffled[n - 1];
        if (slots.includes(ci)) return;
        held = ci;
        void put(slots.indexOf(null));
      } else if (e.key === 'Backspace') {
        slots.fill(null);
        held = null;
        render();
      }
    });
    render();
  });
}

// ───────── 종이비행기 접기 ─────────
const FOLDS: { key: string; code: string; text: string; shape: string }[] = [
  { key: '↓', code: 'ArrowDown', text: '세로로 반 접었다 펴기', shape: 'fold-1' },
  { key: '←', code: 'ArrowLeft', text: '위 모서리 두 개를 가운데로', shape: 'fold-2' },
  { key: '→', code: 'ArrowRight', text: '한 번 더 가운데로 접기', shape: 'fold-3' },
  { key: '↑', code: 'ArrowUp', text: '반으로 접고 날개 펴기!', shape: 'fold-4' },
];

export function openFolding(ctx: UiCtx): Promise<boolean> {
  return new Promise((resolve) => {
    let ok = false;
    let step = 0;
    let crumples = 0;
    const p = new Panel(ctx.layer, { title: '종이비행기 접기', onClose: () => resolve(ok) });
    const paper = el('div', { class: 'paper fold-0' });
    const info = el('div', { class: 'rps-call' });
    const msg = el('div', { class: 'partner-line' }, '화살표 키를 눌러 접어요. (버튼을 눌러도 돼요)');
    const btns = el('div', { class: 'row center' });
    const render = () => {
      info.textContent = step < FOLDS.length ? `${step + 1}단계: ${FOLDS[step].text}  [${FOLDS[step].key}]` : '완성!';
      btns.innerHTML = '';
      for (const f of FOLDS) btns.append(button(f.key, () => void press(f.code), 'btn big'));
    };
    const press = async (code: string) => {
      if (step >= FOLDS.length) return;
      if (code === FOLDS[step].code) {
        paper.className = 'paper ' + FOLDS[step].shape;
        step++;
        ctx.sfx.page();
        if (step === FOLDS.length) {
          ok = true;
          msg.textContent = crumples ? `조금 구겨졌지만 그게 더 잘 날 수도…?` : '각이 살아 있다! 장인의 비행기.';
          ctx.sfx.success();
          render();
          await wait(1500);
          p.close();
          return;
        }
      } else {
        crumples++;
        paper.classList.add('crumple');
        setTimeout(() => paper.classList.remove('crumple'), 400);
        ctx.sfx.oops();
        msg.textContent = ['앗, 반대로 접었다… 살살 다시 펴자.', '종이가 살짝 구겨졌다. 괜찮아!', '하린: 그 방향 아니야ㅋㅋ'][crumples % 3];
      }
      render();
    };
    p.body.append(paper, info, btns, msg);
    p.onKey((e) => {
      if (e.code.startsWith('Arrow')) {
        e.preventDefault();
        void press(e.code);
      }
    });
    render();
  });
}

// ───────── 안내 카드 (급식표·게시판 등) ─────────
export function openInfo(ctx: UiCtx, title: string, lines: string[], footer?: string): Promise<void> {
  return new Promise((resolve) => {
    const p = new Panel(ctx.layer, { title, onClose: () => resolve() });
    const list = el('div', { class: 'info-lines' });
    for (const l of lines) list.append(el('div', { class: 'info-line' }, l));
    p.body.append(list);
    if (footer) p.body.append(el('div', { class: 'partner-line' }, footer));
    p.body.append(el('div', { class: 'row center' }, button('확인', () => p.close(), 'btn primary')));
    p.onKey((e) => {
      if (e.repeat) return;
      if (e.key === 'Enter' || e.code === 'KeyE') p.close();
    });
  });
}
