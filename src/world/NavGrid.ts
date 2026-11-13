// NPC 길찾기용 격자 A*. 장애물은 NPC 반지름만큼 부풀려 표시한다. 순수 로직.
import type { Aabb } from './Collision';

export interface Pt {
  x: number;
  z: number;
}

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private blocked: Uint8Array;

  constructor(
    readonly minX: number,
    readonly minZ: number,
    maxX: number,
    maxZ: number,
    readonly cell = 0.35,
  ) {
    this.cols = Math.ceil((maxX - minX) / cell);
    this.rows = Math.ceil((maxZ - minZ) / cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
  }

  rebuild(boxes: Aabb[], inflate: number) {
    this.blocked.fill(0);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const { x, z } = this.center(c, r);
        for (const b of boxes) {
          if (b.enabled === false || b.level === 0) continue; // 길찾기는 2층(인물들이 다니는 층)만
          if (x > b.minX - inflate && x < b.maxX + inflate && z > b.minZ - inflate && z < b.maxZ + inflate) {
            this.blocked[r * this.cols + c] = 1;
            break;
          }
        }
      }
    }
  }

  center(c: number, r: number): Pt {
    return { x: this.minX + (c + 0.5) * this.cell, z: this.minZ + (r + 0.5) * this.cell };
  }

  toCell(p: Pt): [number, number] {
    return [
      Math.max(0, Math.min(this.cols - 1, Math.floor((p.x - this.minX) / this.cell))),
      Math.max(0, Math.min(this.rows - 1, Math.floor((p.z - this.minZ) / this.cell))),
    ];
  }

  isBlocked(c: number, r: number): boolean {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return true;
    return this.blocked[r * this.cols + c] === 1;
  }

  /** 막힌 칸에 서 있으면 가장 가까운 빈칸을 찾는다. */
  private nearestFree(c: number, r: number): [number, number] | null {
    if (!this.isBlocked(c, r)) return [c, r];
    for (let rad = 1; rad < 8; rad++) {
      for (let dr = -rad; dr <= rad; dr++)
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.abs(dr) !== rad && Math.abs(dc) !== rad) continue;
          if (!this.isBlocked(c + dc, r + dr)) return [c + dc, r + dr];
        }
    }
    return null;
  }

  /** from→to 경로(월드 좌표). 끝점은 정확히 to. 못 찾으면 null. */
  findPath(from: Pt, to: Pt): Pt[] | null {
    const s = this.nearestFree(...this.toCell(from));
    const g = this.nearestFree(...this.toCell(to));
    if (!s || !g) return null;
    const N = this.cols * this.rows;
    const gScore = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const si = s[1] * this.cols + s[0];
    const gi = g[1] * this.cols + g[0];
    gScore[si] = 0;
    // 작은 격자라 단순 이진 힙
    const heap: [number, number][] = [[0, si]];
    const push = (f: number, i: number) => {
      heap.push([f, i]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = (): [number, number] => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    const h = (i: number) => {
      const c = i % this.cols, r = (i / this.cols) | 0;
      const dx = Math.abs(c - g[0]), dz = Math.abs(r - g[1]);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    let found = false;
    while (heap.length) {
      const [, cur] = pop();
      if (closed[cur]) continue;
      if (cur === gi) { found = true; break; }
      closed[cur] = 1;
      const cc = cur % this.cols, cr = (cur / this.cols) | 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nc = cc + dc, nr = cr + dr;
          if (this.isBlocked(nc, nr)) continue;
          if (dc && dr && (this.isBlocked(cc + dc, cr) || this.isBlocked(cc, cr + dr))) continue; // 모서리 자르기 금지
          const ni = nr * this.cols + nc;
          const ng = gScore[cur] + (dc && dr ? 1.414 : 1);
          if (ng < gScore[ni]) {
            gScore[ni] = ng;
            came[ni] = cur;
            push(ng + h(ni), ni);
          }
        }
    }
    if (!found) return null;
    const cells: number[] = [];
    for (let i = gi; i !== -1; i = came[i]) cells.push(i);
    cells.reverse();
    const pts = cells.map((i) => this.center(i % this.cols, (i / this.cols) | 0));
    pts.push({ x: to.x, z: to.z });
    return this.smooth(pts);
  }

  /** 직선으로 갈 수 있는 중간점은 건너뛴다. */
  private smooth(pts: Pt[]): Pt[] {
    if (pts.length <= 2) return pts;
    const out: Pt[] = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.lineFree(pts[i], pts[j])) j--;
      out.push(pts[j]);
      i = j;
    }
    return out.slice(1);
  }

  lineFree(a: Pt, b: Pt): boolean {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.ceil(d / (this.cell * 0.5));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const [c, r] = this.toCell({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      if (this.isBlocked(c, r)) return false;
    }
    return true;
  }
}
