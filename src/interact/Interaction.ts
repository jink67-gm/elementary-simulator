// 상호작용: 가까운 대상에 [E] 조사·줍기·대화, 들고 있는 물건으로 [F] 사용·놓기.
import * as THREE from 'three';
import type { ItemId } from '../data/items';

export interface Interactable {
  id: string;
  obj: THREE.Object3D;
  /** 상호작용 거리 (기본 2m) */
  radius?: number;
  /** 프롬프트 표시 높이 */
  promptY?: number;
  /** 위치를 직접 지정 (obj 위치 대신) */
  at?: THREE.Vector3;
  /** E 동작 이름. null이면 지금은 E 불가 */
  prompt?: () => string | null;
  onInteract?: () => void;
  /** 들고 있는 물건으로 F 동작 이름. null이면 이 대상에는 못 씀 */
  usePrompt?: (item: ItemId | null) => string | null;
  onUse?: (item: ItemId | null) => void;
  /** 점수 배율 (클수록 덜 우선). 자리 앉기처럼 넓은 대상은 크게 */
  bias?: number;
  /** 하이라이트 하지 않음 (NPC 등) */
  noGlow?: boolean;
}

export interface Focus {
  /** E 대상 */
  e: Interactable | null;
  eLabel: string | null;
  /** F 대상 (E 대상과 다를 수 있다: 앉아서 교과서는 E, 손들기는 F) */
  f: Interactable | null;
  fLabel: string | null;
  /** 프롬프트를 띄울 대상 */
  target: Interactable;
}

export class InteractionSystem {
  list: Interactable[] = [];
  focus: Focus | null = null;
  private glowing: THREE.Mesh[] = [];
  private saved = new Map<THREE.Mesh, number>();

  add(i: Interactable): Interactable {
    this.remove(i.id);
    this.list.push(i);
    return i;
  }

  remove(id: string) {
    const idx = this.list.findIndex((x) => x.id === id);
    if (idx >= 0) {
      if (this.focus?.target.id === id) this.setGlow(null);
      this.list.splice(idx, 1);
    }
  }

  get(id: string) {
    return this.list.find((x) => x.id === id);
  }

  position(i: Interactable): THREE.Vector3 {
    if (i.at) return i.at;
    const p = new THREE.Vector3();
    i.obj.getWorldPosition(p);
    return p;
  }

  update(playerPos: THREE.Vector3, facing: THREE.Vector3, held: ItemId | null, seated: boolean) {
    let bestE: Interactable | null = null, eLabel: string | null = null, eScore = Infinity;
    let bestF: Interactable | null = null, fLabel: string | null = null, fScore = Infinity;
    for (const it of this.list) {
      if (!it.obj.visible && !it.at) continue;
      const p = this.position(it);
      if (Math.abs(p.y - playerPos.y) > 2.4) continue; // 다른 층
      const dx = p.x - playerPos.x, dz = p.z - playerPos.z;
      const d = Math.hypot(dx, dz);
      const r = it.radius ?? 2;
      if (d > r) continue;
      const dot = d > 0.01 ? (dx * facing.x + dz * facing.z) / d : 1;
      if (!seated && dot < -0.2 && d > 0.8) continue;
      // 바라보는 쪽을 크게 반영: 가까운 여러 대상 중 내가 보고 있는 것을 고른다 (앉아 있으면 카메라 방향)
      const score = (d + 0.05) * (2 - dot * 1.5) * (it.bias ?? 1);
      const e = it.prompt ? it.prompt() : null;
      if (e && score < eScore) { eScore = score; bestE = it; eLabel = e; }
      const f = it.usePrompt ? it.usePrompt(held) : null;
      if (f && score < fScore) { fScore = score; bestF = it; fLabel = f; }
    }
    const target = bestE ?? bestF;
    this.focus = target ? { e: bestE, eLabel, f: bestF, fLabel, target } : null;
    this.setGlow(target && !target.noGlow ? target : null);
  }

  private setGlow(t: Interactable | null) {
    for (const m of this.glowing) {
      const mat = m.material as THREE.MeshLambertMaterial;
      if (mat.emissive) mat.emissive.setHex(this.saved.get(m) ?? 0);
    }
    this.glowing = [];
    if (!t) return;
    const pulse = 0.35 + Math.sin(performance.now() / 180) * 0.15;
    t.obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.MeshLambertMaterial;
      if (!mat || !mat.emissive) return;
      if (!this.saved.has(m)) this.saved.set(m, mat.emissive.getHex());
      mat.emissive.setRGB(pulse, pulse * 0.85, pulse * 0.4);
      this.glowing.push(m);
    });
  }
}

/** 하이라이트가 다른 물체로 번지지 않게 재질을 복제한다 */
export function ownMaterials(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.material && !(m.material as THREE.Material).userData.owned) {
      m.material = (m.material as THREE.Material).clone();
      (m.material as THREE.Material).userData.owned = true;
    }
  });
}
