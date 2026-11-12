// 사건 3 「초대형 피구공 대회」 규칙 — 순수 로직(2D 위에서 본 체육관). 테스트: tests/dodge.test.ts
// 좌표: x는 서(1)→동(17), z는 북(-30)→남(-16.1, 복도 쪽 문).

export const BALL_R = 1.3;
/** 굴러가는 공 감속 (m/s²) */
export const FRICTION = 0.8;
/** 벽·장애물에 부딪혔을 때 튕기는 정도 */
export const RESTITUTION = 0.55;

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
export const GYM: Rect = { minX: 1, maxX: 17, minZ: -30, maxZ: -16.1 };
export const BALL_START = { x: 9, z: -23 };
/** 서쪽 벽의 공 창고 입구 (이 높이로 벽에 닿으면 창고로 굴러 들어감) */
export const STORAGE_OPEN = { minZ: -28, maxZ: -24 };
/** 뜀틀(가운데 장애물) */
export const OBSTACLES: Rect[] = [{ minX: 5.0, maxX: 5.8, minZ: -22.8, maxZ: -21.6 }];
/** 새 경기 골대: 북쪽 벽 가운데, 동쪽 벽 가운데 */
export const GOALS: { id: 'north' | 'east'; name: string; test: (b: BallState) => boolean }[] = [
  { id: 'north', name: '북쪽 골대', test: (b) => b.z - BALL_R <= GYM.minZ + 0.05 && b.x > 7 && b.x < 11 },
  { id: 'east', name: '동쪽 골대', test: (b) => b.x + BALL_R >= GYM.maxX - 0.05 && b.z > -25 && b.z < -21 },
];

export interface BallState {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

/** 발사대 각도(도)·힘(1~10) → 처음 속도. 0도 = 서쪽, +각도 = 북쪽으로 */
export function launchVelocity(angleDeg: number, power: number): { vx: number; vz: number } {
  const a = (angleDeg * Math.PI) / 180;
  const s = 0.6 * Math.max(1, Math.min(10, power));
  return { vx: -Math.cos(a) * s, vz: -Math.sin(a) * s };
}

export type StepEvent = 'stored' | 'bump' | null;

/**
 * 공 한 단계 움직이기. pushes: 이번 프레임에 공을 미는 힘(속도 변화, m/s).
 * 반환: 창고에 들어가면 'stored', 벽·장애물에 부딪히면 'bump'.
 */
export function stepBall(b: BallState, dt: number, pushes: { dx: number; dz: number }[] = [], obstacles = OBSTACLES): StepEvent {
  for (const p of pushes) {
    b.vx += p.dx;
    b.vz += p.dz;
  }
  const sp = Math.hypot(b.vx, b.vz);
  if (sp > 0) {
    const ns = Math.max(0, sp - FRICTION * dt);
    b.vx *= ns / sp;
    b.vz *= ns / sp;
  }
  b.x += b.vx * dt;
  b.z += b.vz * dt;
  let ev: StepEvent = null;
  // 서쪽 벽: 창고 입구면 들어감
  if (b.x - BALL_R < GYM.minX) {
    if (b.z > STORAGE_OPEN.minZ && b.z < STORAGE_OPEN.maxZ) return 'stored';
    b.x = GYM.minX + BALL_R;
    b.vx = Math.abs(b.vx) * RESTITUTION;
    ev = 'bump';
  }
  if (b.x + BALL_R > GYM.maxX) {
    b.x = GYM.maxX - BALL_R;
    b.vx = -Math.abs(b.vx) * RESTITUTION;
    ev = 'bump';
  }
  if (b.z - BALL_R < GYM.minZ) {
    b.z = GYM.minZ + BALL_R;
    b.vz = Math.abs(b.vz) * RESTITUTION;
    ev = 'bump';
  }
  if (b.z + BALL_R > GYM.maxZ) {
    b.z = GYM.maxZ - BALL_R;
    b.vz = -Math.abs(b.vz) * RESTITUTION;
    ev = 'bump';
  }
  for (const o of obstacles) {
    const cx = Math.max(o.minX, Math.min(b.x, o.maxX));
    const cz = Math.max(o.minZ, Math.min(b.z, o.maxZ));
    const dx = b.x - cx, dz = b.z - cz;
    const d = Math.hypot(dx, dz);
    if (d < BALL_R && d > 1e-6) {
      const nx = dx / d, nz = dz / d;
      b.x = cx + nx * BALL_R;
      b.z = cz + nz * BALL_R;
      const vn = b.vx * nx + b.vz * nz;
      if (vn < 0) {
        b.vx -= (1 + RESTITUTION) * vn * nx;
        b.vz -= (1 + RESTITUTION) * vn * nz;
      }
      ev = 'bump';
    }
  }
  return ev;
}

export interface RollResult {
  path: { x: number; z: number }[];
  result: 'stored' | 'stopped';
  bumps: number;
}

/** 발사 실험을 끝까지 계산 (화면은 이 경로를 그대로 보여 준다) */
export function simulateLaunch(angleDeg: number, power: number, dt = 1 / 30): RollResult {
  const b: BallState = { x: BALL_START.x, z: BALL_START.z, ...launchVelocity(angleDeg, power) };
  const path = [{ x: b.x, z: b.z }];
  let bumps = 0;
  for (let i = 0; i < 30 * 30; i++) {
    const ev = stepBall(b, dt);
    path.push({ x: b.x, z: b.z });
    if (ev === 'stored') return { path, result: 'stored', bumps };
    if (ev === 'bump') bumps++;
    if (Math.hypot(b.vx, b.vz) < 0.02) break;
  }
  return { path, result: 'stopped', bumps };
}

/** 실패했을 때 친구가 해 주는 조언 */
export function launchAdvice(angleDeg: number, power: number, r: RollResult): string {
  const end = r.path[r.path.length - 1];
  if (end.x > 4 && r.bumps === 0) return '힘이 모자라! 조금 더 세게(W).';
  if (end.z > STORAGE_OPEN.maxZ && angleDeg < 25) return '뜀틀에 걸리잖아~ 각도를 북쪽으로 더 틀어 봐(A).';
  if (end.z < STORAGE_OPEN.minZ) return '너무 북쪽이야. 각도를 조금 줄여 봐(D).';
  return power < 7 ? '거의 다 왔어! 힘을 조금만 더!' : '아깝다! 각도를 살짝만 바꿔 봐.';
}

// ───────── 새 경기 규칙 카드 ─────────
export interface RuleCard {
  id: string;
  text: string;
  safe: boolean;
}
export const RULE_CARDS: RuleCard[] = [
  { id: 'roll', text: '공은 손으로 굴리거나 밀기만 해요', safe: true },
  { id: 'team', text: '두 팀이 아니라 다 같이 한 팀!', safe: true },
  { id: 'goals', text: '골대는 북쪽 벽, 동쪽 벽 두 곳', safe: true },
  { id: 'cheer', text: '골 넣으면 다 같이 「영차!」', safe: true },
  { id: 'hit', text: '큰 공으로 친구 맞히기', safe: false },
];
export function rulesOk(ids: string[]): 'ok' | 'unsafe' | 'needGoals' | 'few' {
  if (ids.some((id) => !RULE_CARDS.find((c) => c.id === id)?.safe)) return 'unsafe';
  if (ids.length < 3) return 'few';
  if (!ids.includes('goals')) return 'needGoals';
  return 'ok';
}

// ───────── 해결 판정 ─────────
export type DodgeSolution = 'physics' | 'shrink' | 'sport' | 'mixed';
export interface DodgeProgress {
  stored: boolean;
  shrunkInCart: boolean;
  goals: number;
  launches: number;
  shrinkTried: boolean;
  rulesSet: boolean;
}
export function decideDodge(p: DodgeProgress): DodgeSolution | null {
  const done = p.stored || p.shrunkInCart || p.goals >= 2;
  if (!done) return null;
  const used = [p.launches > 0, p.shrinkTried, p.rulesSet].filter(Boolean).length;
  if (used > 1) return 'mixed';
  return p.stored ? 'physics' : p.shrunkInCart ? 'shrink' : 'sport';
}
