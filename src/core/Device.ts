// 기기 판별: 태블릿(터치), 웨일북·크롬북(저사양 노트북, 터치 화면일 수도), 일반 노트북·PC.
// 조작 방식은 '자동'이면 마지막으로 쓴 입력(손가락 / 키보드·마우스)을 따라 바뀐다.

export type ControlMode = 'keyboard' | 'touch';

const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator);
const ua = nav.userAgent ?? '';
const mm = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;

export const device = {
  /** 화면 터치가 되는 기기 (터치 노트북 포함) */
  touchCapable: (nav.maxTouchPoints ?? 0) > 0 || (typeof window !== 'undefined' && 'ontouchstart' in window),
  /** 마우스·터치패드가 없는 기기 (태블릿) */
  touchOnly: mm('(pointer: coarse)') && !mm('(any-pointer: fine)'),
  /** iPad·안드로이드 태블릿 (iPadOS는 맥처럼 보이므로 터치 지점 수로 구분) */
  tabletOS: /Android|iPad|Mobile|Tablet/i.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1),
  /** 크롬북·웨일북(웨일 OS) */
  laptopOS: /CrOS|Whale ?OS|WhaleBook/i.test(ua),
  cores: nav.hardwareConcurrency || 4,
  memory: (nav as Navigator & { deviceMemory?: number }).deviceMemory ?? 8,
};

/** 처음 켰을 때 그래픽을 '낮음'으로 시작할 기기 (학교용 태블릿·크롬북·웨일북, 코어·메모리가 적은 컴퓨터) */
export function looksLowSpec(): boolean {
  return device.tabletOS || device.laptopOS || device.cores <= 4 || device.memory <= 4;
}

/** 처음 조작 방식 */
export function initialMode(): ControlMode {
  return device.touchOnly || (device.tabletOS && device.touchCapable) ? 'touch' : 'keyboard';
}

export function fullscreenSupported(): boolean {
  const d = document as Document & { webkitFullscreenEnabled?: boolean };
  return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
}

export function isFullscreen(): boolean {
  const d = document as Document & { webkitFullscreenElement?: Element };
  return !!(document.fullscreenElement || d.webkitFullscreenElement);
}

export function toggleFullscreen() {
  const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  const d = document as Document & { webkitExitFullscreen?: () => void };
  try {
    if (isFullscreen()) {
      if (document.exitFullscreen) void document.exitFullscreen().catch(() => {});
      else d.webkitExitFullscreen?.();
    } else if (root.requestFullscreen) {
      void root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    } else root.webkitRequestFullscreen?.();
  } catch {
    /* 전체 화면이 안 되는 브라우저: 그냥 둔다 */
  }
}
