// 터치 화면 조작 (태블릿·터치 크롬북·웨일북).
// 왼쪽 아래를 누르고 끌면 그 자리에 조이스틱이 생겨 이동, 오른쪽 화면을 끌면 둘러보기, 두 손가락 벌리기·오므리기로 카메라 거리.
// 버튼은 키보드와 같은 이름(E·F·Space)을 달아서 안내 문구("E로 줍기")가 그대로 통한다.
import type { Input } from '../core/Input';
import { el } from './dom';

export interface TouchState {
  /** 화면에 조작 버튼을 보일지 */
  visible: boolean;
  /** 컷신: 이동·둘러보기 없이 대사 넘기기만 */
  cine: boolean;
  talking: boolean;
  eLabel: string | null;
  fLabel: string | null;
  spaceLabel: string;
}

const STICK_R = 58;
const LOOK_GAIN = 1.7;

interface Finger {
  id: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
  t: number;
  moved: number;
}

export class TouchControls {
  root = el('div', { class: 'touch-ui hidden' });
  private look = el('div', { class: 'touch-look' });
  private base = el('div', { class: 'stick-base hidden' });
  private knob = el('div', { class: 'stick-knob' });
  private ghost = el('div', { class: 'stick-ghost' }, el('span', {}, '이동'));
  private btnE: HTMLElement;
  private btnF: HTMLElement;
  private btnSpace: HTMLElement;
  private eText = el('span', { class: 'tb-label' });
  private fText = el('span', { class: 'tb-label' });
  private spaceText = el('span', { class: 'tb-label' });
  private stick: Finger | null = null;
  private lookers = new Map<number, Finger>();
  private pinch = 0;
  private last: Partial<TouchState> = {};
  /** 둘러보기 감도 (설정의 감도와 곱한다) */
  gain = LOOK_GAIN;

  constructor(parent: HTMLElement, private input: Input, onMenu: () => void) {
    this.base.append(this.knob);
    this.btnE = this.key('E', 'tb-e', this.eText);
    this.btnF = this.key('F', 'tb-f', this.fText);
    this.btnSpace = this.key('Space', 'tb-space', this.spaceText);
    const menu = el('button', { class: 'tb-menu', type: 'button', 'aria-label': '메뉴' }, el('span', { class: 'tb-burger' }), '메뉴');
    menu.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onMenu();
    });
    const pad = el('div', { class: 'touch-pad' }, this.btnSpace, this.btnF, this.btnE);
    this.root.append(this.look, this.ghost, this.base, pad, menu);
    parent.prepend(this.root);

    const L = this.look;
    L.addEventListener('pointerdown', (e) => this.down(e));
    L.addEventListener('pointermove', (e) => this.moveP(e));
    L.addEventListener('pointerup', (e) => this.up(e));
    L.addEventListener('pointercancel', (e) => this.up(e, true));
    L.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** 키 하나 = 버튼 하나. 누르고 있는 동안 키를 누르고 있는 것과 같다 (종이비행기 꾹 누르기) */
  private key(k: string, cls: string, label: HTMLElement) {
    const b = el('button', { class: 'tb ' + cls, type: 'button' }, el('span', { class: 'tb-key' }, k === 'Space' ? '␣' : k), label);
    const release = () => {
      b.classList.remove('on');
      this.input.virtualRelease(k);
    };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        b.setPointerCapture(e.pointerId);
      } catch {
        /* 무시 */
      }
      b.classList.add('on');
      this.input.virtualPress(k);
    });
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('lostpointercapture', release);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }

  private down(e: PointerEvent) {
    e.preventDefault();
    try {
      this.look.setPointerCapture(e.pointerId);
    } catch {
      /* 무시 */
    }
    const f: Finger = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 };
    const w = this.look.clientWidth;
    // 화면 왼쪽 42%: 이동 조이스틱 (컷신 중에는 조이스틱 없음)
    if (!this.stick && e.clientX < w * 0.42 && !this.last.cine) {
      this.stick = f;
      this.base.classList.remove('hidden');
      this.ghost.classList.add('hidden');
      this.base.style.transform = `translate(${f.x}px, ${f.y}px)`;
      this.knob.style.transform = 'translate(0px, 0px)';
      return;
    }
    this.lookers.set(f.id, f);
    if (this.lookers.size === 2) this.pinch = this.spread();
  }

  private moveP(e: PointerEvent) {
    if (this.stick && e.pointerId === this.stick.id) {
      let dx = e.clientX - this.stick.sx, dy = e.clientY - this.stick.sy;
      const d = Math.hypot(dx, dy);
      // 손가락이 많이 벗어나면 조이스틱 중심이 따라온다
      if (d > STICK_R * 1.6) {
        const k = (d - STICK_R * 1.6) / d;
        this.stick.sx += dx * k;
        this.stick.sy += dy * k;
        dx = e.clientX - this.stick.sx;
        dy = e.clientY - this.stick.sy;
        this.base.style.transform = `translate(${this.stick.sx}px, ${this.stick.sy}px)`;
      }
      const l = Math.hypot(dx, dy);
      const c = l > STICK_R ? STICK_R / l : 1;
      this.knob.style.transform = `translate(${dx * c}px, ${dy * c}px)`;
      this.input.stickX = dx / STICK_R;
      this.input.stickY = -dy / STICK_R;
      return;
    }
    const f = this.lookers.get(e.pointerId);
    if (!f) return;
    const dx = e.clientX - f.x, dy = e.clientY - f.y;
    f.x = e.clientX;
    f.y = e.clientY;
    f.moved += Math.abs(dx) + Math.abs(dy);
    if (this.lookers.size >= 2) {
      // 두 손가락: 벌리면 가까이, 오므리면 멀리
      const s = this.spread();
      const diff = s - this.pinch;
      if (Math.abs(diff) > 28) {
        this.input.addZoom(diff > 0 ? -1 : 1);
        this.pinch = s;
      }
      return;
    }
    if (this.last.cine) return;
    this.input.addLook(dx * this.gain, dy * this.gain);
  }

  private up(e: PointerEvent, cancel = false) {
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick = null;
      this.input.stickX = this.input.stickY = 0;
      this.base.classList.add('hidden');
      this.ghost.classList.remove('hidden');
      return;
    }
    const f = this.lookers.get(e.pointerId);
    if (!f) return;
    this.lookers.delete(e.pointerId);
    // 짧게 톡 → 대사 넘기기 (대사가 떠 있을 때만)
    if (!cancel && f.moved < 14 && performance.now() - f.t < 350 && this.last.talking) {
      this.input.virtualPress('Enter');
      this.input.virtualRelease('Enter');
    }
  }

  private spread() {
    const [a, b] = [...this.lookers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  /** 매 프레임: 상황에 맞게 버튼 이름·보이기를 바꾼다 (바뀐 것만 고친다) */
  update(s: TouchState) {
    const L = this.last;
    if (L.visible !== s.visible) {
      this.root.classList.toggle('hidden', !s.visible);
      if (!s.visible) this.reset();
    }
    if (L.cine !== s.cine) {
      this.root.classList.toggle('cine', s.cine);
      if (s.cine && this.stick) this.reset();
    }
    const e = s.eLabel ?? '';
    if (L.eLabel !== s.eLabel) {
      this.eText.textContent = e;
      this.btnE.classList.toggle('idle', !s.eLabel);
    }
    if (L.fLabel !== s.fLabel) {
      this.fText.textContent = s.fLabel ?? '';
      this.btnF.classList.toggle('hidden', !s.fLabel);
    }
    if (L.spaceLabel !== s.spaceLabel) this.spaceText.textContent = s.spaceLabel;
    this.last = { ...s };
  }

  /** 손가락을 모두 뗀 것으로 */
  reset() {
    this.stick = null;
    this.lookers.clear();
    this.base.classList.add('hidden');
    this.ghost.classList.remove('hidden');
    for (const b of [this.btnE, this.btnF, this.btnSpace]) b.classList.remove('on');
    this.input.resetVirtual();
  }
}
