// 키보드·마우스·터치 입력. 눌린 순간(pressed)과 누르고 있는 상태(down)를 구분한다.
// 터치 화면의 조이스틱·버튼(TouchControls)은 같은 키 이름으로 이 입력에 들어온다.

export interface Move {
  /** 앞(+)·뒤(-) */
  f: number;
  /** 오른쪽(+)·왼쪽(-) */
  r: number;
  /** 0~1 (키보드는 1, 조이스틱은 미는 만큼) */
  mag: number;
  run: boolean;
}

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
  /** 터치 조이스틱 (-1~1, 위로 밀면 stickY > 0) */
  stickX = 0;
  stickY = 0;
  private virtualDown = new Set<string>();

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
      this.resetVirtual();
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
    // 마우스 휠은 한 칸씩, 터치패드(크롬북·웨일북) 두 손가락 스크롤은 미끄러지듯. 터치패드 확대(ctrl+휠)는 화면 확대 대신 카메라 거리
    canvas.addEventListener('wheel', (e) => {
      if (e.ctrlKey) e.preventDefault();
      const d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      this.wheel += Math.max(-1.5, Math.min(1.5, (e.ctrlKey ? d * 4 : d) / 100));
    }, { passive: false });
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
    return !this.captured && (this.downSet.has(k) || this.virtualDown.has(k));
  }

  /** 이동 입력: 키보드(WASD·Shift) + 터치 조이스틱 */
  move(): Move {
    if (this.captured) return { f: 0, r: 0, mag: 0, run: false };
    const m = Math.hypot(this.stickX, this.stickY);
    if (m > 0.18) {
      const k = Math.min(1, m) / m;
      return { f: this.stickY * k, r: this.stickX * k, mag: Math.min(1, m), run: m > 0.92 || this.down('Shift') };
    }
    const f = (this.down('W') ? 1 : 0) - (this.down('S') ? 1 : 0);
    const r = (this.down('D') ? 1 : 0) - (this.down('A') ? 1 : 0);
    return { f, r, mag: f || r ? 1 : 0, run: this.down('Shift') };
  }

  /** 화면 버튼을 누름 (키를 누른 것과 같다) */
  virtualPress(k: string) {
    if (!this.virtualDown.has(k) && !this.blockKeys()) this.pressedSet.add(k);
    this.virtualDown.add(k);
  }
  virtualRelease(k: string) {
    if (!this.virtualDown.delete(k)) return;
    this.releasedSet.add(k);
  }
  /** 손가락으로 끌어 둘러보기 */
  addLook(dx: number, dy: number) {
    this.mouseDX += dx;
    this.mouseDY += dy;
  }
  addZoom(steps: number) {
    this.wheel += steps;
  }
  /** 조작 방식이 바뀔 때 눌려 있던 것 정리 */
  resetVirtual() {
    for (const k of this.virtualDown) this.releasedSet.add(k);
    this.virtualDown.clear();
    this.stickX = this.stickY = 0;
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
