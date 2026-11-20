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

/**
 * 앉을 때 모델을 들어 올리는 높이 (m). 앉기 동작의 엉덩이 아래면(약 0.32m)이 교실 의자 좌판 윗면(0.40m)에
 * 맞도록 (scripts/player-model-check.mjs에서 잼). 들어 올리지 않으면 엉덩이가 좌판 속으로 8cm 묻힌다.
 */
const SIT_LIFT = 0.1;
/** 앉았을 때 무릎을 내리는 높이 (m): 허벅지 앞쪽이 좌판 두께 안에 숨는 정도까지만 */
const KNEE_DROP = 0.05;

/** 모델 크기 배율 (GLB 기본 키 1.35m → 게임 속 반 친구들 옆에 서도 작아 보이지 않게) */
const MODEL_SCALE: Record<string, number> = { student_gray: 1.25 };
/**
 * 다리는 동작 대신 발 디디기로 움직인다 (받은 걷기 동작은 보폭이 한 걸음 0.3m 정도로 아주 작아,
 * 게임 이동 속도 초당 3m에 맞추면 발이 바닥 위를 미끄러졌다).
 * 발은 디딘 자리에 고정돼 있다가, 몸이 반 걸음 이상 앞서가면 들어서 다음 자리(계단이면 그 단 위)로 옮긴다.
 * 팔·몸통은 걷기·뛰기 동작을 그대로 쓰고, 재생 속도를 걸음 박자에 맞춘다.
 */
/** 몸을 가장 많이 내리는 높이 (m, 음수): 걸을 때 / 뛸 때 */
const PELVIS_MIN_WALK = -0.08;
const PELVIS_MIN_RUN = -0.1;
/** 계단에서 한 단 아래 발에 닿도록 더 내릴 수 있는 높이 */
const PELVIS_MIN_STAIRS = -0.16;
/** 걸음 길이: 빠를수록 길게, 다만 몸을 PELVIS_MIN 이상 내리지 않아도 다리가 닿는 길이까지 */
/** 걸음 시간(초)과 디딜 자리(몸보다 앞, m): 디딘 발이 몸 앞 X에서 몸 뒤 X까지 고르게 지나가도록 X = L - v·d/2 */
function swingPlan(L: number, v: number, run: boolean): { d: number; ahead: number } {
  const d = Math.min((L / Math.max(v, 0.3)) * (run ? 1.3 : 0.8), run ? 0.3 : 0.36);
  return { d, ahead: Math.max(0.05, L - (v * d) / 2) };
}

function stepLength(v: number, legLen: number, run: boolean): number {
  const r = legLen * 0.97, drop = -PELVIS_MIN_WALK;
  // 뛸 때는 두 발이 다 떠 있는 순간이 있어 다리 길이로 막지 않는다
  const max = run ? 1.0 : 2 * Math.sqrt(Math.max(0, r * r - (r - drop) * (r - drop)));
  return Math.min(max, Math.max(0.25, 0.18 + 0.16 * v));
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _hip = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _foot = new THREE.Vector3();
const _qFoot = new THREE.Quaternion();
const _ik = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _root = new THREE.Vector3();
const _q4 = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const _d = new THREE.Vector3();
const _rest = [new THREE.Vector3(), new THREE.Vector3()];
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();

const _qR = new THREE.Quaternion();
const _qW = new THREE.Quaternion();
const _side = new THREE.Vector3();
const _up = new THREE.Vector3();
const _fwd2 = new THREE.Vector3();
const _ra = new THREE.Vector3();
const _mA = new THREE.Matrix4();
const _mB = new THREE.Matrix4();
const _qAlign = new THREE.Quaternion();
const _sa = new THREE.Vector3();
const _sb = new THREE.Vector3();
const _ta = new THREE.Vector3();
const _tb = new THREE.Vector3();

/** 뼈 방향 a를 b로 돌리되, 옆 축 side는 최대한 그대로 두는 회전 (비틀림 없음) */
function alignFrame(a: THREE.Vector3, side: THREE.Vector3, b: THREE.Vector3): THREE.Quaternion {
  _sa.copy(side).addScaledVector(a, -side.dot(a)).normalize();
  _ta.crossVectors(_sa, a);
  _sb.copy(side).addScaledVector(b, -side.dot(b)).normalize();
  _tb.crossVectors(_sb, b);
  _mA.makeBasis(_sa, a, _ta);
  _mB.makeBasis(_sb, b, _tb);
  _mB.multiply(_mA.transpose());
  return _qAlign.setFromRotationMatrix(_mB);
}

/** 뼈의 월드 회전을 q로 */
function setWorldQuat(bone: THREE.Object3D, q: THREE.Quaternion) {
  if (!bone.parent) return;
  bone.parent.getWorldQuaternion(_q2).invert();
  bone.quaternion.copy(_q2.multiply(q));
  bone.updateMatrixWorld(true);
}

/** 뼈를 월드 축 axis로 angle만큼 더 돌린다 */
function rotateWorld(bone: THREE.Object3D, axis: THREE.Vector3, angle: number) {
  if (Math.abs(angle) < 1e-5) return;
  bone.getWorldQuaternion(_qW);
  _qW.premultiply(_q1.setFromAxisAngle(axis, angle));
  setWorldQuat(bone, _qW);
}

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
  readonly scale: number;
  /** 발 놓을 바닥 높이 (계단은 디딤판 윗면). Game이 지도와 연결한다 */
  static footGround: ((x: number, z: number, y: number) => number) | null = null;
  /** 서 있을 때 발목 자리 (몸 기준) · 발 방향 */
  private footRest: THREE.Vector3[] = [];
  private footRestQ: THREE.Quaternion[] = [];
  /** 디딘 발목의 높이 (바닥에서) */
  private ankleH = 0.1;
  /** 다리 길이 (허벅지 + 종아리) */
  private legLen = 0.6;
  /** 계단·보폭에 맞춰 몸을 내리고 올리는 높이 (부드럽게) */
  private pelvisOff = 0;
  /** 두 발: 지금 발목 자리(월드), 걸음 중이면 출발·도착 자리와 진행도 */
  private feet = [0, 1].map(() => ({ pos: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, dur: 0.3, arc: 0.06, swing: false }));
  private feetInit = false;
  /** 서 있는 자세의 다리 뼈 (몸 기준 회전·뼈 방향·길이): 다리를 움직일 때 이 자세에서 무릎 축을 그대로 두고 돌린다 (비틀림 없이) */
  private legRest: { qT: THREE.Quaternion; qC: THREE.Quaternion; dT: THREE.Vector3; dC: THREE.Vector3; lT: number; lC: number }[] = [];
  /** 걷기·뛰기 정도 (0 서기 ~ 1), 뛰기 정도 — 팔 흔들기·몸 숙이기를 부드럽게 */
  private gaitW = 0;
  private runW = 0;
  private lastL = 0.5;
  /** 마지막으로 든 발 (0 왼발, 1 오른발)과 그 뒤 흐른 시간 — 걸을 때 두 발을 번갈아, 반 박자마다 든다 */
  private lastStep = 1;
  private sinceStep = 0;
  private lastRoot = new THREE.Vector3();
  /** 자동 확인용 기록: 디딘 발이 움직인 거리(m/프레임), 걸음 수 */
  gaitLog: { planted: number[]; steps: number; forced: number } | null = null;
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
  private sitW = 0;
  /**
   * 다리 뼈의 「동작이 만든」 회전. three.js 믹서는 값이 바뀔 때만 뼈에 다시 쓰므로(가만히 앉은 자세는 안 씀),
   * 다리 보정(앉기·발 디디기)을 덧붙이기 전에 저장했다가 다음 프레임 믹서 전에 되돌려 보정이 쌓이지 않게 한다
   */
  private legAnim: [THREE.Object3D, THREE.Quaternion][] = [];
  private cheerW = 0;
  private t = 0;

  constructor(gltf: GLTF, id: string) {
    this.model = cloneSkinned(gltf.scene);
    const S = (this.scale = MODEL_SCALE[id] ?? 1);
    this.model.scale.setScalar(S);
    this.hand.scale.setScalar(1 / S); // 손에 든 물건·등 가방은 원래 크기로
    this.root.add(this.model);
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.frustumCulled = false;
      }
    });
    for (const n of ['Head', 'pelvis', 'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r', 'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r', 'spine'])
      this.bones[n] = this.model.getObjectByName(n) ?? undefined;
    this.head = this.bones.Head ?? null;
    // 다리·팔·척추: 걸음·팔 흔들기를 덧붙이는 뼈 (믹서가 안 쓴 프레임에 쌓이지 않게 되돌릴 대상)
    for (const n of ['thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r', 'spine', 'upperarm_l', 'lowerarm_l', 'upperarm_r', 'lowerarm_r']) {
      const b = this.bones[n];
      if (b) this.legAnim.push([b, b.quaternion.clone()]);
    }
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
    this.measureRest();
    this.play(CLIP.stand, 0);
    this.mixer.update(Math.random() * 2); // 반 친구들이 똑같이 움직이지 않게
  }

  /** 서 있는 자세에서 발목 자리·발 방향·다리 길이를 잰다 (몸 기준) */
  private measureRest() {
    const b = this.bones;
    const legs = [[b.thigh_l, b.calf_l, b.foot_l], [b.thigh_r, b.calf_r, b.foot_r]];
    if (legs.some((l) => l.some((x) => !x))) return;
    const act = this.actions.get(CLIP.stand);
    act?.reset().play();
    this.mixer.setTime(0);
    this.root.updateMatrixWorld(true);
    const rq = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    let ankle = 0;
    for (const [thigh, calf, foot] of legs) {
      const f = foot!.getWorldPosition(new THREE.Vector3());
      this.footRest.push(this.root.worldToLocal(f.clone()));
      this.footRestQ.push(rq.clone().multiply(foot!.getWorldQuaternion(new THREE.Quaternion())));
      ankle += this.footRest[this.footRest.length - 1].y / 2;
      const h = thigh!.getWorldPosition(new THREE.Vector3()), k = calf!.getWorldPosition(new THREE.Vector3());
      this.legRest.push({
        qT: rq.clone().multiply(thigh!.getWorldQuaternion(new THREE.Quaternion())),
        qC: rq.clone().multiply(calf!.getWorldQuaternion(new THREE.Quaternion())),
        dT: k.clone().sub(h).normalize(),
        dC: f.clone().sub(k).normalize(),
        lT: h.distanceTo(k),
        lC: k.distanceTo(f),
      });
      this.legLen = h.distanceTo(k) + k.distanceTo(f);
    }
    this.ankleH = ankle;
    act?.stop();
    for (const [bn, q] of this.legAnim) bn.quaternion.copy(q);
  }

  /**
   * 다리 두 뼈 IK: 발목을 target(월드)으로. 무릎은 늘 몸 앞쪽으로 굽고(경첩), 뼈는 서 있는 자세에서
   * 무릎 축(몸 옆 방향)을 그대로 둔 채 돌린다 — 매 프레임 가장 짧게 돌리면 다리가 비틀려 흐느적거렸다
   */
  private legIK(i: number, thigh: THREE.Object3D, calf: THREE.Object3D, target: THREE.Vector3) {
    const r = this.legRest[i];
    if (!r) return;
    const rq = this.root.getWorldQuaternion(_qR);
    const side = _side.set(1, 0, 0).applyQuaternion(rq);
    const fwd = _fwd2.set(0, 0, 1).applyQuaternion(rq);
    thigh.getWorldPosition(_hip);
    const a = r.lT, b = r.lC;
    _ik.copy(target).sub(_hip);
    const c = Math.max(Math.abs(a - b) + 1e-3, Math.min(a + b - 1e-3, _ik.length()));
    _ik.normalize();
    _pole.copy(fwd).addScaledVector(_ik, -fwd.dot(_ik));
    if (_pole.lengthSq() < 1e-8) _pole.set(0, 1, 0).addScaledVector(_ik, -_ik.y);
    _pole.normalize();
    const cosA = Math.max(-1, Math.min(1, (a * a + c * c - b * b) / (2 * a * c)));
    const d1 = _dir.copy(_ik).multiplyScalar(cosA).addScaledVector(_pole, Math.sqrt(1 - cosA * cosA)).normalize();
    _knee.copy(_hip).addScaledVector(d1, a);
    setWorldQuat(thigh, alignFrame(_ra.copy(r.dT).applyQuaternion(rq), side, d1).multiply(_qW.copy(rq).multiply(r.qT)));
    const d2 = _dir.copy(target).sub(_knee).normalize();
    setWorldQuat(calf, alignFrame(_ra.copy(r.dC).applyQuaternion(rq), side, d2).multiply(_qW.copy(rq).multiply(r.qC)));
  }

  /**
   * 팔 흔들기·몸통: 걷기·뛰기 동작의 팔을 빠르게 돌리면 허둥대 보여서, 서 있는 자세 위에 걸음에 맞춘 팔 흔들기를 얹는다.
   * 왼팔은 오른발과, 오른팔은 왼발과 함께 앞으로. 뛸 때는 팔꿈치를 굽히고 몸을 조금 숙인다
   */
  private swingArms(dt: number, moving: boolean, run: boolean) {
    const k = 1 - Math.exp(-dt * 8);
    this.gaitW += ((moving ? 1 : 0) - this.gaitW) * k;
    this.runW += ((moving && run ? 1 : 0) - this.runW) * k;
    if (this.gaitW < 0.01 || this.footRest.length !== 2) return;
    const b = this.bones;
    const rq = this.root.getWorldQuaternion(_qR);
    const side = _side.set(1, 0, 0).applyQuaternion(rq);
    const up = _up.set(0, 1, 0).applyQuaternion(rq);
    const fwd = _fwd2.set(0, 0, 1).applyQuaternion(rq);
    this.root.getWorldPosition(_root);
    // 발이 몸보다 얼마나 앞에 있나 (-1 뒤 ~ 1 앞)
    const ahead = this.feet.map((f) => Math.max(-1, Math.min(1, (_d.copy(f.pos).sub(_root).dot(fwd) / (this.lastL * 0.5 || 1)))));
    const amp = (0.3 + 0.22 * this.runW) * this.gaitW;
    const bend = (0.3 + 0.95 * this.runW) * this.gaitW;
    // 뛸 때는 팔을 조금 뒤로 당긴 채 흔든다 (앞으로 뻗지 않게)
    const back = 0.18 * this.runW;
    // 몸통: 앞으로 조금 숙이고(뛸 때), 다리와 반대로 살짝 비튼다
    const spine = b.spine;
    if (spine) {
      rotateWorld(spine, side, 0.16 * this.runW);
      rotateWorld(spine, up, 0.09 * this.gaitW * (ahead[0] - ahead[1]) * 0.5);
    }
    const arms = [[b.upperarm_l, b.lowerarm_l, ahead[1]], [b.upperarm_r, b.lowerarm_r, ahead[0]]] as const;
    for (const [upper, lower, s] of arms) {
      if (!upper || !lower) continue;
      // 앞으로 흔들기 = 몸 옆 축으로 음의 방향 회전 (아래로 늘어진 팔이 앞(+z)으로)
      rotateWorld(upper, side, -amp * s + back);
      rotateWorld(lower, side, -(bend + 0.18 * Math.max(0, s) * this.gaitW));
    }
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
    // 발 디디기를 쓰는 캐릭터는 걸을 때도 서 있는 동작 위에 다리·팔을 얹는다
    const procedural = this.legRest.length === 2 && (p === 'walk' || p === 'run');
    this.play(procedural ? CLIP.stand : CLIP[p] ?? CLIP.stand, p === 'sit' ? 0.35 : 0.2);
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
    if (spine) {
      (spine as THREE.Object3D).add(g);
      g.scale.setScalar(1 / this.scale); // 가방은 원래 크기로
    } else {
      g.position.set(0, 1.0, -0.12);
      this.root.add(g);
    }
    return (this._back = g);
  }

  /** 발 디디기 + 다리 IK (서기·걷기·뛰기). 앉았거나 공중이면 동작 그대로 */
  private stepFeet(dt: number, v: number) {
    const G = HumanCharacter.footGround;
    const b = this.bones;
    const legs = [[b.thigh_l, b.calf_l, b.foot_l], [b.thigh_r, b.calf_r, b.foot_r]] as const;
    this.root.getWorldPosition(_root);
    const ok = G && this.footRest.length === 2 && legs.every((l) => l.every(Boolean));
    const airborne = !ok || _root.y - G!(_root.x, _root.z, _root.y) > 0.06;
    if (airborne || this.sitW >= 0.05) {
      this.feetInit = false;
      this.pelvisOff += (0 - this.pelvisOff) * (1 - Math.exp(-dt * 12));
      this.model.position.y = this.sitW * SIT_LIFT + this.pelvisOff;
      return;
    }
    const ground = (p: THREE.Vector3) => G!(p.x, p.z, _root.y) + this.ankleH;
    const rq = this.root.getWorldQuaternion(_q4);
    const fwd = _fwd.set(0, 0, 1).applyQuaternion(rq).setY(0).normalize();
    const moving = (this.pose === 'walk' || this.pose === 'run') && v > 0.3;
    const run = this.pose === 'run';
    const onStairs = Math.abs(G!(_root.x, _root.z, _root.y) - _root.y) > 0.01;
    const pmin = run ? PELVIS_MIN_RUN : onStairs ? PELVIS_MIN_STAIRS : PELVIS_MIN_WALK;
    // 걸음 길이: 디딜 자리(몸 앞 X)가 다리가 넉넉히 닿는 곳(몸을 가장 낮췄을 때 닿는 거리의 85%) 안에 들도록
    let L = stepLength(v, this.legLen, run);
    {
      legs[0][0]!.getWorldPosition(_hip);
      const h = _hip.y - this.pelvisOff + pmin - (G!(_root.x, _root.z, _root.y) + this.ankleH);
      const r = this.legLen * 0.97;
      const xMax = 0.85 * Math.sqrt(Math.max(0.0001, r * r - h * h));
      L = Math.max(0.2, Math.min(L, xMax / (run ? 0.35 : 0.6)));
    }
    const rest = [0, 1].map((i) => {
      const r = this.root.localToWorld(_rest[i].copy(this.footRest[i]));
      r.y = ground(r);
      return r;
    });
    // 처음이거나 순간이동했으면 두 발을 제자리에
    if (!this.feetInit || this.lastRoot.distanceTo(_root) > 1.2) {
      this.feet.forEach((f, i) => {
        f.pos.copy(rest[i]);
        f.swing = false;
      });
      this.feetInit = true;
    }
    this.lastRoot.copy(_root);
    // 걸음 중인 발: 들어 올려 반원을 그리며 다음 자리로
    for (const f of this.feet) {
      if (!f.swing) {
        if (this.gaitLog) this.gaitLog.planted.push(0);
        continue;
      }
      f.t += dt / f.dur;
      const k = Math.min(1, f.t), s = k * k * (3 - 2 * k);
      // 걸음 중에도 몸이 돌거나 빨라지면 디딜 자리를 다시 잡는다 (발이 몸을 따라가게)
      const fi = this.feet.indexOf(f);
      f.to.copy(rest[fi]);
      if (moving) f.to.addScaledVector(fwd, v * f.dur * (1 - k) + swingPlan(L, v, run).ahead);
      f.to.y = ground(f.to);
      f.pos.lerpVectors(f.from, f.to, s);
      f.pos.y += f.arc * Math.sin(Math.PI * k);
      // 지나가는 자리 바닥(계단 모서리)보다 아래로 가지 않게
      // 발끝(앞 9cm)도 보고 넘는다
      _d.copy(f.pos).addScaledVector(fwd, 0.09 * this.scale);
      f.pos.y = Math.max(f.pos.y, ground(f.pos) + 0.01 * Math.sin(Math.PI * k), ground(_d) + 0.02 * Math.sin(Math.PI * k));
      if (k >= 1) {
        f.pos.copy(f.to);
        f.swing = false;
      }
    }
    // 다음 걸음. 걸을 때: 두 발을 번갈아, 반 박자(걸음 길이 ÷ 속도)마다 — 몸보다 뒤처진 정도만 보면 두 발이 잇달아 들려
    // 둘 다 앞·둘 다 뒤에 있는 엇박이 된다. 서 있을 때: 제자리에서 벗어난 발을 옮긴다.
    // 다리가 닿지 않는 발은 언제든 든다
    this.sinceStep += dt;
    {
      const busy = this.feet.some((f) => f.swing);
      let best = -1, bestV = -Infinity, bestUrgent = false;
      this.feet.forEach((f, i) => {
        if (f.swing) return;
        _d.copy(f.pos).sub(rest[i]).setY(0);
        const behind = moving ? -_d.dot(fwd) : _d.length();
        const far = _d.length();
        // 옆으로 벗어난 정도 (몸이 돌았을 때)
        const lat = Math.abs(_d.dot(_side.set(1, 0, 0).applyQuaternion(rq)));
        // 급히 돌거나 빨라져 발이 많이 뒤처지면: 다른 발이 걷는 중이어도 바로, 빠르게 옮긴다
        const urgent = moving ? far > L * 0.9 || lat > 0.16 * this.scale : far > 0.3 * this.scale;
        const turn = i !== this.lastStep && this.sinceStep >= (L / Math.max(v, 0.3)) * 0.97;
        // 걷기: 발이 반 걸음 앞에 디뎌 반 걸음 뒤까지 / 뛰기: 몸 가까이(0.35걸음 앞)에 디뎌 금방 차고 나간다
        const need = moving
          ? run
            ? turn || behind >= L * 0.5
            : (turn && behind > 0) || behind >= L * 0.75 || far > L * 0.85 || lat > 0.08 * this.scale
          : far > 0.07 * this.scale;
        // 다리가 닿는지: 몸을 가장 많이 내렸을 때(PELVIS_MIN) 엉덩이에서도 발이 멀면 들어 옮긴다
        legs[i][0]!.getWorldPosition(_hip);
        _hip.y += pmin - this.pelvisOff;
        const reach = _hip.distanceTo(f.pos) > this.legLen * 0.99;
        // 뛸 때는 앞발이 반쯤 나아가면 뒷발도 든다 (두 발이 다 떠 있는 순간)
        const free = !busy || run || urgent;
        const score = (moving ? behind : far) + lat + (reach || urgent ? 9 : 0);
        if (((need && free) || reach || urgent) && score > bestV) {
          bestV = score;
          best = i;
          bestUrgent = urgent || reach;
          if (reach && !need && this.gaitLog) this.gaitLog.forced++;
        }
      });
      if (best >= 0) {
        const f = this.feet[best];
        // 걸음 시간: 박자에 맞추되 너무 길지 않게 (천천히 출발하다 빨라질 때 발이 뒤처지지 않게), 급할 때는 더 짧게
        f.dur = moving ? swingPlan(L, v, run).d : 0.2;
        if (bestUrgent) f.dur = Math.min(f.dur, 0.18);
        f.from.copy(f.pos);
        f.to.copy(rest[best]);
        if (moving) f.to.addScaledVector(fwd, v * f.dur + swingPlan(L, v, run).ahead);
        f.to.y = ground(f.to);
        f.arc = (moving ? (run ? 0.13 : 0.075) : 0.04) * (this.scale / 1.25);
        f.t = 0;
        f.swing = true;
        this.lastStep = best;
        this.sinceStep = 0;
        if (this.gaitLog) this.gaitLog.steps++;
      }
    }
    // 몸 높이: 두 다리가 거의 곧게 펴질 때까지 (무릎을 너무 굽히지 않게) — 계단에서는 저절로 오르내린다
    // 디딘 발(걸음 중인 발 말고)에 맞춘다: 걸을 때는 디딘 다리가 거의 펴지게(무릎 약 15°) — 들고 있는 발까지 맞추면
    // 몸이 늘 낮아져 무릎을 굽힌 채 엉거주춤 걸었다. 서 있을 때는 서기 동작 높이 그대로(올리지 않음)
    const planted = this.feet.some((f) => !f.swing);
    let want = Infinity;
    legs.forEach(([thigh], i) => {
      if (planted && this.feet[i].swing) return;
      thigh!.getWorldPosition(_hip);
      const hipY = _hip.y - this.pelvisOff;
      const p = this.feet[i].pos;
      const h = Math.hypot(p.x - _hip.x, p.z - _hip.z), r = this.legLen * (moving && !run ? 0.99 : 0.97);
      const maxHip = p.y + Math.sqrt(Math.max(0, r * r - h * h));
      want = Math.min(want, maxHip - hipY);
    });
    if (!moving) want = Math.min(want, onStairs ? 0.3 : 0);
    want = Math.max(pmin, Math.min(0.3, want));
    // 내려야 할 때는 바로 (늦으면 디딘 발에 다리가 닿지 않아 발이 끌린다), 올릴 때는 부드럽게
    this.pelvisOff = want < this.pelvisOff ? want : this.pelvisOff + (want - this.pelvisOff) * (1 - Math.exp(-dt * (moving ? 30 : 12)));
    this.model.position.y = this.sitW * SIT_LIFT + this.pelvisOff;
    this.model.updateMatrixWorld(true);
    // 다리를 발 자리로 (발은 몸 방향으로 평평하게)
    legs.forEach(([thigh, calf, foot], i) => {
      this.legIK(i, thigh!, calf!, this.feet[i].pos);
      // 발: 디딘 발은 평평하게, 걸음 중에는 발끝을 살짝 든다
      const f = this.feet[i];
      _qFoot.copy(rq).multiply(this.footRestQ[i]);
      if (f.swing) _qFoot.premultiply(_q3.setFromAxisAngle(_side.set(1, 0, 0).applyQuaternion(rq), -0.35 * Math.sin(Math.PI * Math.min(1, f.t))));
      setWorldQuat(foot!, _qFoot);
    });
    this.lastL = L;
  }

  /** 작은 동작: GLB 캐릭터가 들어오면 본(팔·척추) 애니메이션으로 바꿀 자리. 지금은 무시 */
  gesture(_g: string, _dur?: number) {}

  setHidden(h: boolean) {
    this.model.visible = !h;
  }

  /** speedMs: 실제 이동 속도(m/s). 주면 걷기·뛰기 재생 속도를 보폭에 맞춰 발이 미끄러지지 않게 한다 */
  update(dt: number, speed01 = 0, speedMs?: number) {
    this.t += dt;
    const gait = this.pose === 'walk' || this.pose === 'run';
    if (this.current && gait && this.legRest.length !== 2) {
      // 팔·몸통 동작 박자를 걸음 박자에 맞춘다 (동작 한 바퀴 = 두 걸음)
      const v = speedMs ?? speed01 * 3;
      const L = stepLength(v, this.legLen, this.pose === 'run');
      this.current.timeScale = v > 0.3 ? Math.max(0.5, Math.min(2.5, (this.current.getClip().duration * v) / (2 * L))) : 1;
    } else if (this.current) this.current.timeScale = 1;
    for (const [b, q] of this.legAnim) b.quaternion.copy(q);
    this.mixer.update(dt);
    for (const [b, q] of this.legAnim) q.copy(b.quaternion);
    // 앉으면 엉덩이를 좌판 높이에 맞춘다 (동작이 넘어가는 동안 함께 부드럽게)
    this.sitW += ((this.seated ? 1 : 0) - this.sitW) * (1 - Math.exp(-dt * 10));
    this.model.position.y = this.sitW * SIT_LIFT + this.pelvisOff;
    this.model.updateMatrixWorld(true);
    const vNow = gait ? (speedMs ?? speed01 * 3) : 0;
    this.stepFeet(dt, vNow);
    this.swingArms(dt, gait && vNow > 0.3 && this.sitW < 0.05, this.pose === 'run');
    // 다리: 무릎을 조금만 내려(KNEE_DROP) 발을 바닥 쪽으로. 허벅지 앞쪽이 좌판 두께(4cm) 안에 숨는 만큼만 숙이고,
    // 발 방향은 그대로 둔다 (종아리를 돌리면 발끝이 바닥 속으로 들어간다). 의자가 높아 발은 바닥에서 조금 떠 있다
    if (KNEE_DROP > 0 && this.sitW > 0.01) {
      const drop = this.sitW * KNEE_DROP;
      for (const s of ['l', 'r']) {
        const thigh = this.bones['thigh_' + s], calf = this.bones['calf_' + s], foot = this.bones['foot_' + s];
        if (!thigh || !calf || !foot) continue;
        foot.getWorldPosition(_foot);
        foot.getWorldQuaternion(_qFoot);
        _foot.y -= drop;
        thigh.getWorldPosition(_hip);
        calf.getWorldPosition(_knee);
        _knee.y -= drop;
        _dir.copy(_knee).sub(_hip).normalize(); // aimBone이 _v1·_v2를 다시 쓰므로 따로 담는다
        aimBone(thigh, calf, _dir, 1);
        calf.getWorldPosition(_knee);
        _dir.copy(_foot).sub(_knee).normalize();
        aimBone(calf, foot, _dir, 1);
        // 발은 원래 방향으로
        calf.getWorldQuaternion(_q2).invert();
        foot.quaternion.copy(_q2.multiply(_qFoot));
        foot.updateMatrixWorld(true);
      }
    }

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
