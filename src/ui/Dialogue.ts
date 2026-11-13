// 자막 대화창: 1~2줄, 한 글자씩 표시. E(또는 Enter·클릭)로 넘기고, 마지막 줄에서 E를 누르면 닫힌다. Q로 모두 넘기기.
// 저절로 넘어가지 않는다 (읽는 속도는 플레이어가 정한다).
import { el, button } from './dom';

export interface Line {
  who: string;
  text: string;
  /** 말하는 동안 실행 (표정·동작) */
  act?: () => void;
}

export class Dialogue {
  private box = el('div', { class: 'dialogue hidden' });
  private nameEl = el('div', { class: 'd-name' });
  private textEl = el('div', { class: 'd-text' });
  private nextEl = el('div', { class: 'd-next' }, '▼ ', el('span', { class: 'kb' }, 'E'), el('span', { class: 'tap-only' }, '톡'));
  private queue: { line: Line; done: () => void }[] = [];
  private current: { line: Line; done: () => void; shown: number; t: number; hold: number } | null = null;
  speed = 1; // 글자 속도 배율
  onType: () => void = () => {};
  skipAll = false;

  constructor(parent: HTMLElement) {
    const skip = button('모두 넘기기 (Q)', () => this.skipEverything(), 'd-skip');
    this.box.append(this.nameEl, this.textEl, this.nextEl, skip);
    this.box.addEventListener('click', () => this.advance());
    parent.append(this.box);
  }

  get active() {
    return !!this.current;
  }

  get currentText() {
    return this.current ? `${this.current.line.who}: ${this.current.line.text}` : '';
  }

  /** 여러 줄을 순서대로 말한다. 모두 끝나면 resolve. */
  say(lines: Line[]): Promise<void> {
    return Promise.all(lines.map((line) => new Promise<void>((done) => this.queue.push({ line, done })))).then(() => {});
  }

  advance() {
    const c = this.current;
    if (!c) return;
    if (c.shown < c.line.text.length) c.shown = c.line.text.length;
    else this.finish();
  }

  skipEverything() {
    while (this.current) this.finish();
  }

  private finish() {
    const c = this.current;
    if (!c) return;
    this.current = null;
    c.done();
    this.next();
  }

  private next() {
    const n = this.queue.shift();
    if (!n) {
      this.box.classList.add('hidden');
      return;
    }
    this.current = { ...n, shown: 0, t: 0, hold: 0 };
    n.line.act?.();
    this.box.classList.remove('hidden');
    this.nameEl.textContent = n.line.who;
    this.nameEl.classList.toggle('narr', n.line.who === '');
    this.textEl.textContent = '';
    this.nextEl.textContent = '…';
  }

  update(dt: number) {
    if (!this.current && this.queue.length) this.next();
    const c = this.current;
    if (!c) return;
    const len = c.line.text.length;
    if (c.shown < len) {
      c.t += dt * 38 * this.speed;
      const before = Math.floor(c.shown);
      c.shown = Math.min(len, c.t);
      if (Math.floor(c.shown) !== before && before % 3 === 0) this.onType();
    } else {
      c.hold += dt;
      // 다 나온 뒤에는 E를 기다린다. 마지막 줄이면 「E 닫기」로 안내
      const last = this.queue.length === 0;
      this.nextEl.textContent = last ? '▼ E 닫기' : '▼ E 다음';
    }
    // finish()로 다음 줄로 넘어갔으면 이전 줄(c)이 아니라 새 줄을 그린다
    const now = this.current;
    if (now) this.textEl.textContent = now.line.text.slice(0, Math.floor(now.shown));
  }
}
