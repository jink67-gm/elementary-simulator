// 뼈대·애니메이션이 있는 GLB 캐릭터 (tools/character/build_character.py로 만든 공통 리그).
// 블록 캐릭터(Character)와 같은 방식으로 쓸 수 있다: setPose / update / lookAt / hand / setHidden.
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Pose } from './Character';

/** 손들기처럼 팔만 움직이는 동작을 다른 동작 위에 얹을 때 쓰는 뼈 */
const RIGHT_ARM = ['upperarm01R', 'upperarm02R', 'lowerarm01R', 'lowerarm02R', 'wristR'];

function boneOf(track: THREE.KeyframeTrack) {
  return track.name.split('.')[0];
}

/** base 동작에 overlay의 일부 뼈만 덮어쓴 새 동작 */
function composeClip(name: string, base: THREE.AnimationClip, overlay: THREE.AnimationClip, bones: string[]): THREE.AnimationClip {
  const set = new Set(bones);
  const tracks = [
    ...base.tracks.filter((t) => !set.has(boneOf(t))).map((t) => t.clone()),
    ...overlay.tracks.filter((t) => set.has(boneOf(t))).map((t) => t.clone()),
  ];
  return new THREE.AnimationClip(name, -1, tracks);
}

const clipCache = new WeakMap<GLTF, Map<string, THREE.AnimationClip>>();

function clipsFor(gltf: GLTF): Map<string, THREE.AnimationClip> {
  let m = clipCache.get(gltf);
  if (m) return m;
  m = new Map(gltf.animations.map((c) => [c.name, c]));
  const raise = m.get('RaiseHand');
  for (const base of ['Idle', 'Sit']) {
    const b = m.get(base);
    if (b && raise) m.set(base + 'Raise', composeClip(base + 'Raise', b, raise, RIGHT_ARM));
  }
  const cheer = m.get('Cheer');
  const sit = m.get('Sit');
  if (cheer && sit) {
    const arms = [...new Set(cheer.tracks.map(boneOf))].filter((b) => /^(upperarm|lowerarm|wrist|finger|metacarpal)/.test(b));
    m.set('SitCheer', composeClip('SitCheer', sit, cheer, arms));
  }
  clipCache.set(gltf, m);
  return m;
}

export class HumanCharacter {
  root = new THREE.Group();
  /** 오른손에 물건을 붙이는 곳 */
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

  constructor(gltf: GLTF) {
    this.model = cloneSkinned(gltf.scene);
    this.root.add(this.model);
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.frustumCulled = false; // 뼈로 움직이면 경계 상자가 안 맞을 수 있다
      }
    });
    this.head = this.model.getObjectByName('head') ?? null;
    const wrist = this.model.getObjectByName('wristR') ?? this.model.getObjectByName('wrist.R');
    if (wrist) {
      wrist.add(this.hand);
      this.hand.position.set(0, 0.07, 0.02);
    } else this.root.add(this.hand);
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const [name, clip] of clipsFor(gltf)) {
      const a = this.mixer.clipAction(clip);
      if (name === 'Sit' || name.endsWith('Raise') || name === 'RaiseHand' ) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions.set(name, a);
    }
    this.root.traverse((o) => (o.userData.character = this));
    this.play('Idle', 0);
  }

  private play(name: string, fade = 0.25) {
    const next = this.actions.get(name) ?? this.actions.get('Idle');
    if (!next || next === this.current) return;
    next.reset().play();
    if (this.current) this.current.crossFadeTo(next, fade, false);
    this.current = next;
  }

  setPose(p: Pose) {
    if (p === 'sit') this.seated = true;
    else if (p !== 'raise' && p !== 'cheer') this.seated = false;
    this.pose = p;
    const clip = {
      stand: 'Idle',
      walk: 'Walk',
      run: 'Run',
      sit: 'Sit',
      cheer: this.seated ? 'SitCheer' : 'Cheer',
      raise: this.seated ? 'SitRaise' : 'IdleRaise',
    }[p];
    this.play(clip, p === 'sit' ? 0.3 : 0.2);
  }

  lookAt(target: THREE.Vector3 | null) {
    this.headTarget = target;
  }

  setHidden(h: boolean) {
    this.model.visible = !h;
  }

  update(dt: number, speed01 = 0) {
    if (this.current && (this.pose === 'walk' || this.pose === 'run')) this.current.timeScale = 0.6 + speed01 * 0.5;
    else if (this.current) this.current.timeScale = 1;
    this.mixer.update(dt);
    // 고개 돌리기: 애니메이션 위에 덧붙인다
    let yaw = 0;
    let pitch = 0;
    if (this.headTarget && this.head) {
      const hp = new THREE.Vector3();
      this.head.getWorldPosition(hp);
      const local = this.root.worldToLocal(this.headTarget.clone()).sub(this.root.worldToLocal(hp));
      yaw = Math.max(-1.1, Math.min(1.1, Math.atan2(local.x, local.z)));
      pitch = Math.max(-0.5, Math.min(0.5, -Math.atan2(local.y, Math.hypot(local.x, local.z))));
    }
    const k = 1 - Math.exp(-dt * 8);
    this.headYaw += (yaw - this.headYaw) * k;
    this.headPitch += (pitch - this.headPitch) * k;
    if (this.head && (Math.abs(this.headYaw) > 1e-3 || Math.abs(this.headPitch) > 1e-3)) {
      // 머리 뼈의 부모 좌표계 기준으로 루트의 위·옆 축을 써서 회전
      const parent = this.head.parent!;
      const inv = new THREE.Quaternion();
      parent.getWorldQuaternion(inv).invert();
      const rootQ = new THREE.Quaternion();
      this.root.getWorldQuaternion(rootQ);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rootQ).applyQuaternion(inv);
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(rootQ).applyQuaternion(inv);
      const q = new THREE.Quaternion().setFromAxisAngle(up, this.headYaw).multiply(new THREE.Quaternion().setFromAxisAngle(side, this.headPitch));
      this.head.quaternion.premultiply(q);
    }
  }
}
