// 미니게임·메뉴용 전체 화면 창. 열려 있는 동안 캐릭터 조작은 멈춘다.
import { el, button } from './dom';

export interface PanelOpts {
  title: string;
  closable?: boolean;
  wide?: boolean;
  onClose?: () => void;
  cls?: string;
}

let openCount = 0;
export function panelsOpen() {
  return openCount > 0;
}

export class Panel {
  root: HTMLElement;
  body: HTMLElement;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  closed = false;

  constructor(parent: HTMLElement, private opts: PanelOpts) {
    this.body = el('div', { class: 'panel-body' });
    const head = el('div', { class: 'panel-head' }, el('h2', {}, opts.title));
    if (opts.closable !== false) head.append(button('닫기 (Esc)', () => this.close(), 'btn small ghost'));
    this.root = el('div', { class: 'panel-wrap ' + (opts.cls ?? '') }, el('div', { class: 'panel' + (opts.wide ? ' wide' : '') }, head, this.body));
    parent.append(this.root);
    openCount++;
  }

  /** 창이 열려 있는 동안만 키 입력을 받는다. Esc는 닫기. */
  onKey(fn: (e: KeyboardEvent) => void) {
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && this.opts.closable !== false) {
        e.preventDefault();
        this.close();
        return;
      }
      fn(e);
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  setTitle(t: string) {
    const h = this.root.querySelector('h2');
    if (h) h.textContent = t;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.root.remove();
    openCount--;
    this.opts.onClose?.();
  }
}
