// 키보드·마우스 입력. 눌린 순간(pressed)과 누르고 있는 상태(down)를 구분한다.

export class Input {
  private downSet = new Set<string>();
  private pressedSet = new Set<string>();
  private releasedSet = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  pointerLocked = false;
  private dragging = false;
  /** 오버레이(미니게임·메뉴)가 키 입력을 가져갈 때 true */
  captured = false;
  /** 키를 누른 그 순간 창이 열려 있으면 true (Game이 설정) */
  blockKeys: () => boolean = () => false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      const k = norm(e);
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k) && !isTyping(e)) e.preventDefault();
      // 창(미니게임·메뉴)이 열려 있을 때 누른 키는 게임으로 새지 않게 한다
      if (!this.downSet.has(k) && !this.blockKeys()) this.pressedSet.add(k);
      this.downSet.add(k);
    });
    window.addEventListener('keyup', (e) => {
      const k = norm(e);
      this.downSet.delete(k);
      this.releasedSet.add(k);
    });
    window.addEventListener('blur', () => {
      for (const k of this.downSet) this.releasedSet.add(k);
      this.downSet.clear();
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked || this.dragging) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2 || !this.pointerLocked) this.dragging = true;
      // 마우스가 잠겨 있을 때 왼쪽 클릭 = 행동 (원격 조종 집게 등)
      if (e.button === 0 && this.pointerLocked && !this.blockKeys()) this.pressedSet.add('MouseLeft');
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => (this.wheel += Math.sign(e.deltaY)), { passive: true });
  }

  requestLock() {
    if (this.pointerLocked) return;
    try {
      const r = this.canvas.requestPointerLock() as unknown;
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {});
    } catch {
      /* 드래그로 회전 가능 */
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(k: string): boolean {
    return !this.captured && this.downSet.has(k);
  }
  pressed(k: string): boolean {
    return !this.captured && this.pressedSet.has(k);
  }
  released(k: string): boolean {
    return this.releasedSet.has(k);
  }
  /** 캡처 여부와 상관없이(오버레이용) */
  rawPressed(k: string): boolean {
    return this.pressedSet.has(k);
  }

  /** 테스트·자동화용: 키를 눌렀다 뗀 것으로 처리 */
  simulatePress(k: string) {
    this.pressedSet.add(k);
  }

  endFrame() {
    this.pressedSet.clear();
    this.releasedSet.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}

function norm(e: KeyboardEvent): string {
  if (e.code === 'Space') return 'Space';
  if (e.code.startsWith('Key')) return e.code.slice(3); // 'KeyE' → 'E' (한글 입력 상태에서도 동작)
  if (e.code.startsWith('Digit')) return e.code.slice(5);
  if (e.code.startsWith('Numpad') && /\d/.test(e.code.slice(6))) return e.code.slice(6);
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') return 'Shift';
  return e.code || e.key;
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
}
