// 포스터 꾸미기: 배경·스티커 끌어다 놓기·문구. 모둠 포스터와 미술 시간 미니 포스터에서 함께 쓴다.
import { Panel } from '../ui/Panel';
import { el, button } from '../ui/dom';
import type { UiCtx } from './Textbook';
import type { PosterTheme } from '../core/SaveData';

export interface PosterResult {
  theme: PosterTheme;
  slogan: string;
  bg: string;
  stickers: { kind: string; x: number; y: number }[];
}

export const STICKERS: { kind: string; label: string; theme: PosterTheme; color: string }[] = [
  { kind: 'food', label: '밥', theme: 'food', color: '#e07a1f' },
  { kind: 'clock', label: '시계', theme: 'rest', color: '#8338ec' },
  { kind: 'ball', label: '공', theme: 'play', color: '#3a86ff' },
  { kind: 'heart', label: '♥', theme: 'friends', color: '#ff006e' },
  { kind: 'star', label: '★', theme: 'friends', color: '#ffbe0b' },
];

const SLOGANS = [
  '급식 메뉴, 우리가 같이 정해요!',
  '쉬는 시간에 쉴 공간이 더 있으면 좋겠어요',
  '운동장에서 함께 노는 시간을 늘려요',
  '서로 인사하는 우리 학교',
];
const BGS = ['#fff3b0', '#cdeac0', '#cde7f0', '#ffd6e0'];

/** 스티커 종류가 가장 많은 쪽이 주제. 동점이면 문구 쪽 주제 */
export function posterTheme(stickers: { kind: string }[], sloganIndex: number): PosterTheme {
  const sloganTheme: PosterTheme[] = ['food', 'rest', 'play', 'friends'];
  const count: Record<PosterTheme, number> = { food: 0, rest: 0, play: 0, friends: 0 };
  for (const s of stickers) {
    const t = STICKERS.find((x) => x.kind === s.kind)?.theme;
    if (t) count[t]++;
  }
  count[sloganTheme[sloganIndex]] += 0.5;
  return (Object.entries(count).sort((a, b) => b[1] - a[1])[0][0] as PosterTheme) ?? 'friends';
}

export function openPoster(ctx: UiCtx, title: string, minStickers = 3): Promise<PosterResult | null> {
  return new Promise((resolve) => {
    let result: PosterResult | null = null;
    const p = new Panel(ctx.layer, { title, wide: true, onClose: () => resolve(result) });
    let bg = BGS[0];
    let slogan = 0;
    const stickers: { kind: string; x: number; y: number }[] = [];
    const board = el('div', { class: 'poster-board' });
    const sloganEl = el('div', { class: 'poster-slogan' });
    board.append(sloganEl);
    const count = el('div', { class: 'keys-hint' });
    const doneBtn = button('완성!', () => finish(), 'btn primary');

    const render = () => {
      board.style.background = bg;
      sloganEl.textContent = SLOGANS[slogan];
      board.querySelectorAll('.sticker').forEach((n) => n.remove());
      for (const s of stickers) {
        const def = STICKERS.find((d) => d.kind === s.kind)!;
        const n = el('div', { class: 'sticker' }, def.label);
        n.style.background = def.color;
        n.style.left = `${s.x * 100}%`;
        n.style.top = `${s.y * 100}%`;
        board.append(n);
      }
      count.textContent = `스티커 ${stickers.length}개 (최소 ${minStickers}개) · 팔레트에서 끌어다 놓거나 1~5 누르기 · ←/→ 문구 바꾸기 · B 배경색`;
      doneBtn.disabled = stickers.length < minStickers;
    };
    const place = (kind: string, x?: number, y?: number) => {
      if (stickers.length >= 12) stickers.shift();
      stickers.push({ kind, x: x ?? 0.15 + Math.random() * 0.7, y: y ?? 0.3 + Math.random() * 0.55 });
      ctx.sfx.place();
      render();
    };
    const finish = () => {
      if (stickers.length < minStickers) return;
      result = { theme: posterTheme(stickers, slogan), slogan: SLOGANS[slogan], bg, stickers: [...stickers] };
      ctx.sfx.success();
      p.close();
    };

    const palette = el('div', { class: 'palette' });
    STICKERS.forEach((s, i) => {
      const b = el('div', { class: 'sticker pal', draggable: 'true', title: `${i + 1}` }, s.label);
      b.style.background = s.color;
      b.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/plain', s.kind));
      b.addEventListener('click', () => place(s.kind));
      palette.append(b);
    });
    board.addEventListener('dragover', (e) => e.preventDefault());
    board.addEventListener('drop', (e) => {
      e.preventDefault();
      const kind = e.dataTransfer?.getData('text/plain');
      if (!kind) return;
      const r = board.getBoundingClientRect();
      place(kind, Math.min(0.92, Math.max(0.08, (e.clientX - r.left) / r.width)), Math.min(0.92, Math.max(0.2, (e.clientY - r.top) / r.height)));
    });
    const bgRow = el('div', { class: 'row' });
    BGS.forEach((c) => {
      const b = button('', () => {
        bg = c;
        render();
      }, 'swatch-btn');
      b.style.background = c;
      bgRow.append(b);
    });
    const sloganRow = el(
      'div',
      { class: 'row' },
      button('◀ 문구', () => {
        slogan = (slogan + SLOGANS.length - 1) % SLOGANS.length;
        render();
      }),
      button('문구 ▶', () => {
        slogan = (slogan + 1) % SLOGANS.length;
        render();
      }),
      button('스티커 하나 떼기', () => {
        stickers.pop();
        render();
      }, 'btn ghost'),
    );
    p.body.append(el('div', { class: 'poster-layout' }, board, el('div', { class: 'poster-tools' }, el('h3', {}, '스티커'), palette, el('h3', {}, '배경'), bgRow, el('h3', {}, '문구'), sloganRow, doneBtn)), count);
    p.onKey((e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= 5) place(STICKERS[n - 1].kind);
      else if (e.code === 'ArrowLeft') { slogan = (slogan + SLOGANS.length - 1) % SLOGANS.length; render(); }
      else if (e.code === 'ArrowRight') { slogan = (slogan + 1) % SLOGANS.length; render(); }
      else if (e.code === 'KeyB') { bg = BGS[(BGS.indexOf(bg) + 1) % BGS.length]; render(); }
      else if (e.key === 'Enter') finish();
    });
    render();
  });
}
