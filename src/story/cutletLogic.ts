// 사건 1 「거대 돈가스」 규칙 — 순수 로직(화면·DOM 없음). 테스트: tests/cutlet.test.ts
//
// 돈가스는 가로 12칸짜리 판으로 본다. 가운데 가로로 한 번(반 가르기) + 세로 절단선 여러 개.
// 조각 크기(넓이)는 '칸 수 × (반 갈랐으면 1, 아니면 2)'. 전체는 24.
// 식판 하나에는 3~5가 딱 좋다(4가 공평한 1인분). 6 이상은 식판보다 크다.

export const CUTLET_COLS = 12;
export const CUTLET_TOTAL = 24;
export const DINERS = 6;
export const TRAY_MIN = 3;
export const TRAY_MAX = 5;
export const FAIR_SHARE = CUTLET_TOTAL / DINERS; // 4

export interface Piece {
  /** 왼쪽 끝 칸 (0~11) */
  c0: number;
  /** 오른쪽 끝(포함하지 않음) */
  c1: number;
  /** 0 = 위(또는 통짜), 1 = 아래 */
  row: 0 | 1;
  /** 반 갈랐으면 true */
  half: boolean;
  area: number;
}

/** 절단선(1~11 사이 정수)과 반 가르기 여부로 조각 목록을 만든다 */
export function cutPieces(cuts: number[], halved: boolean): Piece[] {
  const xs = [0, ...[...new Set(cuts)].filter((c) => c > 0 && c < CUTLET_COLS).sort((a, b) => a - b), CUTLET_COLS];
  const out: Piece[] = [];
  for (const row of halved ? ([0, 1] as const) : ([0] as const)) {
    for (let i = 0; i < xs.length - 1; i++) {
      const w = xs[i + 1] - xs[i];
      out.push({ c0: xs[i], c1: xs[i + 1], row, half: halved, area: w * (halved ? 1 : 2) });
    }
  }
  return out;
}

export type TrayVerdict = 'tooBig' | 'overfull' | 'small' | 'good';

/** 식판에 조각을 올려 볼 때. ok=false면 올라가지 않는다(조각은 손에 그대로) */
export function tryAddToTray(current: number, area: number): { ok: boolean; total: number; verdict: TrayVerdict } {
  if (area > TRAY_MAX) return { ok: false, total: current, verdict: 'tooBig' };
  const total = current + area;
  if (total > TRAY_MAX) return { ok: false, total: current, verdict: 'overfull' };
  return { ok: true, total, verdict: total >= TRAY_MIN ? 'good' : 'small' };
}

export function trayDone(total: number) {
  return total >= TRAY_MIN && total <= TRAY_MAX;
}

/** 모두 받았고, 가장 많이 받은 친구와 적게 받은 친구 차이가 1 이하면 공평 */
export function isFair(totals: number[]): boolean {
  if (!totals.length || !totals.every(trayDone)) return false;
  return Math.max(...totals) - Math.min(...totals) <= 1;
}

/** 큰 조각을 안전 절단기로 반 가르기 */
export function splitArea(area: number): [number, number] {
  const a = Math.ceil(area / 2);
  return [a, area - a];
}

/** 절단 계획 평가 (절단기 화면에서 미리 보여 주는 말) */
export function planHint(pieces: Piece[]): string {
  const big = pieces.filter((p) => p.area > TRAY_MAX).length;
  const good = pieces.filter((p) => p.area >= TRAY_MIN && p.area <= TRAY_MAX).length;
  if (pieces.length < DINERS && big) return `조각 ${pieces.length}개 — 여섯 명이 먹기엔 모자라고, 식판보다 큰 조각이 ${big}개!`;
  if (big) return `식판보다 큰 조각이 ${big}개 있어요. 더 잘라야 할 것 같아요.`;
  if (good >= DINERS) return `식판에 딱 맞는 조각 ${good}개! 여섯 명에게 하나씩 줄 수 있어요.`;
  if (pieces.length >= DINERS * 2) return `한입 크기 ${pieces.length}조각. 식판마다 두세 개씩 담아야겠다.`;
  return `조각 ${pieces.length}개. 작은 조각은 두 개를 한 식판에 담으면 돼요.`;
}

// ───────── 음식 크기 조절기 ─────────
export type MachineOp = 'half' | 'fifth' | 'minus100' | 'double';
export const MACHINE_START = 1000;
export const MACHINE_TARGET = 100;
export const MACHINE_OPS: Record<MachineOp, { label: string; apply: (v: number) => number }> = {
  half: { label: '÷2', apply: (v) => v / 2 },
  fifth: { label: '÷5', apply: (v) => v / 5 },
  minus100: { label: '−100', apply: (v) => v - 100 },
  double: { label: '×2', apply: (v) => v * 2 },
};

export function machineApply(v: number, op: MachineOp): number {
  return Math.max(0, Math.round(MACHINE_OPS[op].apply(v) * 100) / 100);
}

export type MachineResult = 'exact' | 'tooSmall' | 'stillBig';
export function machineCheck(v: number): MachineResult {
  if (v === MACHINE_TARGET) return 'exact';
  return v < MACHINE_TARGET ? 'tooSmall' : 'stillBig';
}

/** 전선: 설명 스티커대로 꽂아야 켜진다 */
export const WIRES = ['red', 'blue', 'yellow'] as const;
export type Wire = (typeof WIRES)[number];
export const PORTS = ['power', 'size', 'ground'] as const;
export type Port = (typeof PORTS)[number];
export const WIRE_RULE: Record<Wire, Port> = { red: 'power', blue: 'size', yellow: 'ground' };
export function wiresCorrect(conn: Partial<Record<Wire, Port>>): boolean {
  return WIRES.every((w) => conn[w] === WIRE_RULE[w]);
}

// ───────── 해결 판정 ─────────
export type Solution = 'cut_and_share' | 'shrink_machine' | 'festival' | 'mixed';

export interface Progress {
  servedTrays: number; // 다 담은 식판 수
  anyServed: boolean; // 한 조각이라도 담았는지
  machineFixed: boolean;
  festivalHeld: boolean;
}

/** 모두가 점심을 먹을 수 있는 상태인지, 그렇다면 어떤 방법으로 해결했는지 */
export function decideSolution(p: Progress): Solution | null {
  const paths = [p.anyServed, p.machineFixed, p.festivalHeld].filter(Boolean).length;
  if (p.festivalHeld || p.machineFixed || p.servedTrays >= DINERS) return paths > 1 ? 'mixed' : p.festivalHeld ? 'festival' : p.machineFixed ? 'shrink_machine' : 'cut_and_share';
  return null;
}
