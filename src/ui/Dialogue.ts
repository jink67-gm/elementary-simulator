// 자막 대화창: 1~2줄, 한 글자씩 표시, Enter/E/클릭으로 넘기기, Q로 모두 넘기기.
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
  private queue: { line: Line; done: () => void }[] = [];
  private current: { line: Line; done: () => void; shown: number; t: number; hold: number } | null = null;
  speed = 1; // 글자 속도 배율
  onType: () => void = () => {};
  skipAll = false;

  constructor(parent: HTMLElement) {
    const skip = button('모두 넘기기 (Q)', () => this.skipEverything(), 'd-skip');
    this.box.append(this.nameEl, this.textEl, el('div', { class: 'd-next' }, '▼ Enter'), skip);
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
      // 자동으로 넘어가기 (읽을 시간 확보)
      if (c.hold > (1.6 + len * 0.045) / this.speed) this.finish();
    }
    if (this.current) this.textEl.textContent = c.line.text.slice(0, Math.floor(c.shown));
  }
}
