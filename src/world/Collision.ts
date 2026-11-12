// XZ 평면 충돌: 원(플레이어·NPC·공) 대 축 정렬 상자(벽·책상). 순수 로직.

export interface Aabb {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** 문처럼 켜고 끌 수 있는 벽 */
  enabled?: boolean;
  tag?: string;
}

export interface Circle {
  x: number;
  z: number;
  r: number;
}

export function aabb(cx: number, cz: number, w: number, d: number, tag?: string): Aabb {
  return { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, enabled: true, tag };
}

/**
 * 원을 상자들 밖으로 밀어낸다. 밀어낸 방향의 법선을 돌려준다(공 튕기기용).
 * 여러 번 반복해 모서리 끼임을 줄인다.
 */
export function resolveCircle(c: Circle, boxes: Aabb[], iterations = 3): { hit: boolean; nx: number; nz: number } {
  let hit = false;
  let nx = 0;
  let nz = 0;
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (const b of boxes) {
      if (b.enabled === false) continue;
      const px = Math.max(b.minX, Math.min(c.x, b.maxX));
      const pz = Math.max(b.minZ, Math.min(c.z, b.maxZ));
      let dx = c.x - px;
      let dz = c.z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= c.r * c.r) continue;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        const push = c.r - d;
        dx /= d;
        dz /= d;
        c.x += dx * push;
        c.z += dz * push;
        nx = dx;
        nz = dz;
      } else {
        // 중심이 상자 안: 가장 가까운 면으로 뺀다
        const l = c.x - b.minX, r = b.maxX - c.x, t = c.z - b.minZ, bo = b.maxZ - c.z;
        const m = Math.min(l, r, t, bo);
        if (m === l) { c.x = b.minX - c.r; nx = -1; nz = 0; }
        else if (m === r) { c.x = b.maxX + c.r; nx = 1; nz = 0; }
        else if (m === t) { c.z = b.minZ - c.r; nx = 0; nz = -1; }
        else { c.z = b.maxZ + c.r; nx = 0; nz = 1; }
      }
      hit = true;
      moved = true;
    }
    if (!moved) break;
  }
  return { hit, nx, nz };
}

/** 원끼리 겹치면 a를 밀어낸다. */
export function separateCircles(a: Circle, b: Circle): boolean {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  const rr = a.r + b.r;
  const d2 = dx * dx + dz * dz;
  if (d2 >= rr * rr) return false;
  const d = Math.sqrt(d2) || 1e-4;
  const push = rr - d;
  a.x += (dx / d) * push;
  a.z += (dz / d) * push;
  return true;
}

export function pointInAabb(x: number, z: number, b: Aabb, pad = 0): boolean {
  return x >= b.minX - pad && x <= b.maxX + pad && z >= b.minZ - pad && z <= b.maxZ + pad;
}
