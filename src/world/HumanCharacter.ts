// 뼈대가 있는 GLB 캐릭터 + 공용 동작 모음(Quaternius Universal Animation Library).
// 블록 캐릭터(Character)와 같은 방식으로 쓴다: setPose / update / lookAt / hand / setHidden.
// 손들기·환호는 동작 위에 팔 방향을 덧씌워 앉기·서기와 함께 쓸 수 있게 한다.
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Pose } from './Character';
import { sharedAnims } from './models';

const CLIP: Record<string, string> = {
  stand: 'Idle_Loop',
  walk: 'Walk_Loop',
  run: 'Jog_Fwd_Loop',
  sit: 'Sitting_Idle_Loop',
  talk: 'Idle_Talking_Loop',
};

/** 캐릭터마다 골반 높이가 달라서, 골반 위치 트랙을 비율만큼 줄인 동작을 만든다 */
const scaledCache = new Map<string, THREE.AnimationClip[]>();
function clipsFor(key: string, ratio: number): THREE.AnimationClip[] {
  const k = key + ':' + ratio.toFixed(3);
  let c = scaledCache.get(k);
  if (c) return c;
  c = sharedAnims.clips.map((clip) => {
    const tracks = clip.tracks.map((t) => {
      if (!t.name.endsWith('.position')) return t;
      const t2 = t.clone();
      for (let i = 0; i < t2.values.length; i++) t2.values[i] *= ratio;
      return t2;
    });
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  });
  scaledCache.set(k, c);
  return c;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();

/** bone을 child 쪽 방향이 dir(월드)을 향하게 w만큼 돌린다 */
function aimBone(bone: THREE.Object3D, child: THREE.Object3D, dir: THREE.Vector3, w: number) {
  if (w <= 0.001 || !bone.parent) return;
  bone.getWorldPosition(_v1);
  child.getWorldPosition(_v2);
  const cur = _v2.sub(_v1).normalize();
  _q1.setFromUnitVectors(cur, dir);
  _q1.slerp(_q3.identity(), 1 - w);
  bone.getWorldQuaternion(_q2);
  _q1.multiply(_q2);
  bone.parent.getWorldQuaternion(_q2).invert();
  bone.quaternion.copy(_q2.multiply(_q1));
  bone.updateMatrixWorld(true);
}

export class HumanCharacter {
  root = new THREE.Group();
  hand = new THREE.Group();
  head: THREE.Object3D | null = null;
  pose: Pose = 'stand';
  readonly scale = 1;
  private model: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private seated = false;
  private headTarget: THREE.Vector3 | null = null;
  private headYaw = 0;
  private headPitch = 0;
  private bones: Record<string, THREE.Object3D | undefined> = {};
  private raiseW = 0;
  private cheerW = 0;
  private t = 0;

  constructor(gltf: GLTF, id: string) {
    this.model = cloneSkinned(gltf.scene);
    this.root.add(this.model);
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.frustumCulled = false;
      }
    });
    for (const n of ['Head', 'pelvis', 'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r'])
      this.bones[n] = this.model.getObjectByName(n) ?? undefined;
    this.head = this.bones.Head ?? null;
    if (this.bones.hand_r) {
      this.bones.hand_r.add(this.hand);
      this.hand.position.set(0, 0.08, 0.02);
    } else this.root.add(this.hand);
    const pelvis = this.bones.pelvis;
    const rest = sharedAnims.pelvisRest;
    const ratio = pelvis && rest && rest.length() > 1e-6 ? pelvis.position.length() / rest.length() : 1;
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const clip of clipsFor(id, ratio)) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.root.traverse((o) => (o.userData.character = this));
    this.play(CLIP.stand, 0);
    this.mixer.update(Math.random() * 2); // 반 친구들이 똑같이 움직이지 않게
  }

  private play(name: string, fade = 0.25) {
    const next = this.actions.get(name) ?? this.actions.get(CLIP.stand);
    if (!next || next === this.current) return;
    next.reset().play();
    if (this.current) this.current.crossFadeTo(next, fade, false);
    this.current = next;
  }

  setPose(p: Pose) {
    if (p === 'sit') this.seated = true;
    else if (p !== 'raise' && p !== 'cheer') this.seated = false;
    this.pose = p;
    if (p === 'raise' || p === 'cheer') {
      this.play(this.seated ? CLIP.sit : CLIP.stand, 0.3);
      return;
    }
    this.play(CLIP[p] ?? CLIP.stand, p === 'sit' ? 0.35 : 0.2);
  }

  lookAt(target: THREE.Vector3 | null) {
    this.headTarget = target;
  }

  /** 등 부착점: 척추(spine) 본이 있으면 거기에, 없으면 몸 뒤 가슴 높이 */
  private _back: THREE.Object3D | null = null;
  get backSocket(): THREE.Object3D {
    if (this._back) return this._back;
    const g = new THREE.Group();
    let spine: THREE.Object3D | null = null;
    this.root.traverse((o) => {
      if (!spine && (o as THREE.Bone).isBone && /spine2|spine1|chest|spine/i.test(o.name)) spine = o;
    });
    if (spine) (spine as THREE.Object3D).add(g);
    else {
      g.position.set(0, 1.0, -0.12);
      this.root.add(g);
    }
    return (this._back = g);
  }

  /** 작은 동작: GLB 캐릭터가 들어오면 본(팔·척추) 애니메이션으로 바꿀 자리. 지금은 무시 */
  gesture(_g: string, _dur?: number) {}

  setHidden(h: boolean) {
    this.model.visible = !h;
  }

  update(dt: number, speed01 = 0) {
    this.t += dt;
    if (this.current && (this.pose === 'walk' || this.pose === 'run')) this.current.timeScale = 0.7 + speed01 * 0.45;
    else if (this.current) this.current.timeScale = 1;
    this.mixer.update(dt);
    this.model.updateMatrixWorld(true);

    // 손들기·환호: 팔을 위로
    const k = 1 - Math.exp(-dt * 8);
    this.raiseW += ((this.pose === 'raise' ? 1 : 0) - this.raiseW) * k;
    this.cheerW += ((this.pose === 'cheer' ? 1 : 0) - this.cheerW) * k;
    const b = this.bones;
    const rq = this.root.getWorldQuaternion(new THREE.Quaternion());
    const up = (x: number, z: number) => new THREE.Vector3(x, 1, z).normalize().applyQuaternion(rq);
    if (b.upperarm_r && b.lowerarm_r && b.hand_r) {
      const w = Math.max(this.raiseW, this.cheerW);
      const sway = this.cheerW * Math.sin(this.t * 9) * 0.25;
      const d = up(-0.18 - this.cheerW * 0.3 + sway, 0.12);
      aimBone(b.upperarm_r, b.lowerarm_r, d, w);
      aimBone(b.lowerarm_r, b.hand_r, d, w);
    }
    if (b.upperarm_l && b.lowerarm_l && b.hand_l && this.cheerW > 0.001) {
      const d = up(0.48 + Math.sin(this.t * 9 + 1.5) * 0.25, 0.12);
      aimBone(b.upperarm_l, b.lowerarm_l, d, this.cheerW);
      aimBone(b.lowerarm_l, b.hand_l, d, this.cheerW);
    }

    // 고개 돌리기
    let yaw = 0;
    let pitch = 0;
    if (this.headTarget && this.head) {
      this.head.getWorldPosition(_v1);
      const local = this.root.worldToLocal(this.headTarget.clone()).sub(this.root.worldToLocal(_v1.clone()));
      yaw = Math.max(-1.1, Math.min(1.1, Math.atan2(local.x, local.z)));
      pitch = Math.max(-0.5, Math.min(0.5, -Math.atan2(local.y, Math.hypot(local.x, local.z))));
    }
    const kh = 1 - Math.exp(-dt * 8);
    this.headYaw += (yaw - this.headYaw) * kh;
    this.headPitch += (pitch - this.headPitch) * kh;
    if (this.head?.parent && (Math.abs(this.headYaw) > 1e-3 || Math.abs(this.headPitch) > 1e-3)) {
      const inv = this.head.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      const upAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(rq).applyQuaternion(inv);
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(rq).applyQuaternion(inv);
      const q = new THREE.Quaternion().setFromAxisAngle(upAxis, this.headYaw).multiply(new THREE.Quaternion().setFromAxisAngle(side, this.headPitch));
      this.head.quaternion.premultiply(q);
    }
  }
}
