// 기본 도형으로 만든 블록형 캐릭터 + 간단한 절차적 애니메이션(걷기·앉기·손들기·환호).
import * as THREE from 'three';
import { mergeChildrenByColor } from './merge';
import { getModel } from './models';
import { HumanCharacter } from './HumanCharacter';

const SKIN_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });

export interface Look {
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  hairStyle: 'short' | 'long' | 'pony' | 'buzz' | 'bob';
  height: number; // 1 = 어린이 기준(약 1.35m)
  glasses?: boolean;
  /** public/models/characters/<model>.glb 가 있으면 그 3D 모델을 쓴다 */
  model?: string;
}

export const PLAYER_LOOKS: Look[] = [
  { skin: 0xf0cbaa, hair: 0x1b1714, shirt: 0x8a8d91, pants: 0x34507e, hairStyle: 'short', height: 1, model: 'boy' },
  { skin: 0xf0cbaa, hair: 0x1b1714, shirt: 0xa8e0cf, pants: 0x26324f, hairStyle: 'long', height: 1, model: 'girl' },
  { skin: 0xf0cbaa, hair: 0x1b1714, shirt: 0x52b788, pants: 0x34495e, hairStyle: 'buzz', height: 1, model: 'kid_m' },
  { skin: 0xf0cbaa, hair: 0x1b1714, shirt: 0xf28ab2, pants: 0x2d3142, hairStyle: 'pony', height: 1, model: 'kid_f' },
]

export type Pose = 'stand' | 'walk' | 'sit' | 'raise' | 'cheer' | 'run';
/**
 * 자세 위에 잠깐 덧붙이는 작은 동작 (교실에서 볼 법한 반응). 'carry'·'tablet'은 끝낼 때까지 유지.
 * fist 작은 주먹 쥐기 · lean 몸 앞으로 · wave 작은 손짓 · nod 고개 끄덕 · lookUp 고개 들기 · shrug 갸웃
 * carry 두 손으로 물건 들기 · place 내려놓기 · tablet 태블릿 만지기
 */
export type Gesture = 'none' | 'fist' | 'lean' | 'wave' | 'nod' | 'lookUp' | 'shrug' | 'carry' | 'place' | 'tablet';

function box(w: number, h: number, d: number, color: number, y = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.y = y;
  m.castShadow = true;
  return m;
}

export class Character {
  root = new THREE.Group();
  private body = new THREE.Group();
  head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  /** 오른손 위치(물건 들기용) */
  hand = new THREE.Group();
  /** 등 부착점 (책가방). 몸통 등 가운데, -z가 등 쪽 */
  backSocket = new THREE.Group();
  pose: Pose = 'stand';
  private phase = 0;
  private headTarget: THREE.Vector3 | null = null;
  readonly scale: number;

  constructor(look: Look) {
    const s = (this.scale = look.height);
    const legH = 0.5, torsoH = 0.5, headS = 0.36;
    this.root.add(this.body);
    this.body.scale.setScalar(s);

    // 다리 (엉덩이 축)
    for (const [leg, x] of [[this.legL, -0.09], [this.legR, 0.09]] as const) {
      leg.position.set(x, legH, 0);
      const m = box(0.14, legH, 0.16, look.pants, -legH / 2);
      const shoe = box(0.15, 0.07, 0.2, 0xf4f4f4, -legH + 0.035);
      shoe.position.z = 0.02;
      leg.add(m, shoe);
      this.body.add(leg);
    }
    const torso = box(0.36, torsoH, 0.22, look.shirt, legH + torsoH / 2);
    this.body.add(torso);
    this.backSocket.position.set(0, legH + torsoH / 2, -0.11);
    this.body.add(this.backSocket);
    // 팔 (어깨 축)
    for (const [arm, x] of [[this.armL, -0.24], [this.armR, 0.24]] as const) {
      arm.position.set(x, legH + torsoH - 0.05, 0);
      arm.add(box(0.11, 0.42, 0.12, look.shirt, -0.16));
      arm.add(box(0.1, 0.1, 0.1, look.skin, -0.4));
      this.body.add(arm);
    }
    this.hand.position.set(0, -0.42, 0.12);
    this.armR.add(this.hand);

    // 머리
    this.head.position.y = legH + torsoH;
    this.body.add(this.head);
    const face = box(headS, headS, headS, look.skin, headS / 2 + 0.02);
    this.head.add(face);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1d1d1d });
    for (const x of [-0.08, 0.08]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, 0.01), eyeMat);
      eye.position.set(x, headS / 2 + 0.04, headS / 2 + 0.006);
      this.head.add(eye);
    }
    const cheekMat = new THREE.MeshBasicMaterial({ color: 0xff9e9e });
    for (const x of [-0.12, 0.12]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.01), cheekMat);
      c.position.set(x, headS / 2 - 0.03, headS / 2 + 0.006);
      this.head.add(c);
    }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 0.01), eyeMat);
    mouth.position.set(0, headS / 2 - 0.07, headS / 2 + 0.006);
    this.head.add(mouth);
    if (look.glasses) {
      const gm = new THREE.MeshBasicMaterial({ color: 0x333333 });
      for (const x of [-0.08, 0.08]) {
        const g = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 4, 12), gm);
        g.position.set(x, headS / 2 + 0.04, headS / 2 + 0.012);
        this.head.add(g);
      }
    }
    this.addHair(look, headS);
    // 부위별로 합쳐 그리기 호출을 줄인다 (캐릭터당 약 20개 → 6개)
    for (const g of [this.legL, this.legR, this.armL, this.armR, this.head]) mergeChildrenByColor(g, SKIN_MAT);
    this.root.traverse((o) => (o.userData.character = this));
  }

  private addHair(look: Look, s: number) {
    const top = s / 2 + 0.02 + s / 2;
    const c = look.hair;
    if (look.hairStyle === 'buzz') {
      this.head.add(box(s + 0.02, 0.06, s + 0.02, c, top));
      return;
    }
    this.head.add(box(s + 0.04, 0.1, s + 0.04, c, top + 0.02));
    this.head.add(box(s + 0.04, s * 0.55, 0.06, c, top - s * 0.25).translateZ(-s / 2 - 0.01));
    if (look.hairStyle === 'short') {
      this.head.add(box(s + 0.04, 0.07, 0.05, c, top - 0.04).translateZ(s / 2));
    }
    if (look.hairStyle === 'bob' || look.hairStyle === 'long') {
      const len = look.hairStyle === 'long' ? s * 1.1 : s * 0.75;
      for (const x of [-s / 2 - 0.02, s / 2 + 0.02]) this.head.add(box(0.05, len, s + 0.02, c, top - len / 2).translateX(x));
      this.head.add(box(s + 0.04, 0.08, 0.05, c, top - 0.03).translateZ(s / 2));
      if (look.hairStyle === 'long') this.head.add(box(s + 0.02, len, 0.06, c, top - len / 2).translateZ(-s / 2 - 0.03));
    }
    if (look.hairStyle === 'pony') {
      this.head.add(box(0.1, 0.24, 0.1, c, top - 0.12).translateZ(-s / 2 - 0.08));
      this.head.add(box(s + 0.04, 0.07, 0.05, c, top - 0.04).translateZ(s / 2));
    }
  }

  /** 카메라가 너무 가까울 때 몸을 숨긴다 (상호작용은 그대로) */
  setHidden(h: boolean) {
    this.body.visible = !h;
  }

  setPose(p: Pose) {
    this.pose = p;
  }

  private gestureKind: Gesture = 'none';
  private gestureT = 0;
  private gestureDur = 0;
  /** 작은 동작. dur 초 뒤 끝난다 (Infinity면 'none'으로 끝낼 때까지) */
  gesture(g: Gesture, dur = 1.2) {
    this.gestureKind = g;
    this.gestureT = 0;
    this.gestureDur = dur;
  }

  lookAt(target: THREE.Vector3 | null) {
    this.headTarget = target;
  }

  update(dt: number, speed01 = 0) {
    const sitting = this.pose === 'sit' || (this.pose === 'raise' && this.body.position.y < -0.05);
    this.phase += dt * (this.pose === 'run' ? 14 : 9) * Math.max(speed01, this.pose === 'walk' || this.pose === 'run' ? 0.6 : 0);
    const swing = this.pose === 'walk' || this.pose === 'run' ? Math.sin(this.phase) * (this.pose === 'run' ? 0.9 : 0.6) : 0;
    const k = 1 - Math.exp(-dt * 12);
    const lerp = (o: THREE.Object3D, x: number) => (o.rotation.x += (x - o.rotation.x) * k);

    const sitY = sitting ? -0.18 : 0;
    this.body.position.y += (sitY - this.body.position.y) * k;
    lerp(this.legL, sitting ? -1.45 : swing);
    lerp(this.legR, sitting ? -1.45 : -swing);
    if (this.pose === 'raise') {
      lerp(this.armR, -2.9);
      lerp(this.armL, sitting ? -0.5 : 0);
    } else if (this.pose === 'cheer') {
      const w = Math.sin(performance.now() / 120) * 0.3;
      lerp(this.armR, -2.6 + w);
      lerp(this.armL, -2.6 - w);
    } else {
      lerp(this.armL, sitting ? -0.7 : -swing * 0.8);
      lerp(this.armR, sitting ? -0.7 : swing * 0.8);
    }
    // 작은 동작 (자세 위에 덧붙임)
    let leanX = 0, headNod = 0, headTilt = 0;
    if (this.gestureKind !== 'none') {
      this.gestureT += dt;
      const t = this.gestureT, g = this.gestureKind;
      const env = Math.min(1, t / 0.2, this.gestureDur === Infinity ? 1 : Math.max(0, (this.gestureDur - t) / 0.25));
      if (g === 'fist') this.armR.rotation.x = -1.5 + Math.sin(t * 14) * 0.18 * env;
      else if (g === 'lean') leanX = 0.22 * env;
      else if (g === 'wave') {
        this.armR.rotation.x = -1.9 * env + this.armR.rotation.x * (1 - env);
        this.armR.rotation.z = Math.sin(t * 9) * 0.25 * env;
      } else if (g === 'nod') headNod = Math.sin(t * 10) * 0.18 * env;
      else if (g === 'lookUp') headNod = -0.35 * env;
      else if (g === 'shrug') headTilt = 0.25 * env;
      else if (g === 'carry' || g === 'tablet') {
        const a = g === 'carry' ? -1.25 : -1.05 + Math.sin(t * 6) * 0.06;
        this.armL.rotation.x = a;
        this.armR.rotation.x = a;
      } else if (g === 'place') {
        this.armL.rotation.x = -0.9 * env;
        this.armR.rotation.x = -0.9 * env;
        leanX = 0.3 * env;
      }
      if (t > this.gestureDur) {
        this.gestureKind = 'none';
        this.armR.rotation.z = 0;
      }
    }
    this.body.rotation.x += (leanX - this.body.rotation.x) * k;
    // 머리 돌리기
    let yaw = 0, pitch = 0;
    if (this.headTarget) {
      const hp = new THREE.Vector3();
      this.head.getWorldPosition(hp);
      const local = this.root.worldToLocal(this.headTarget.clone());
      const headLocal = this.root.worldToLocal(hp);
      const d = local.sub(headLocal);
      yaw = Math.max(-1.2, Math.min(1.2, Math.atan2(d.x, d.z)));
      pitch = Math.max(-0.6, Math.min(0.6, -Math.atan2(d.y, Math.hypot(d.x, d.z))));
    }
    this.head.rotation.y += (yaw - this.head.rotation.y) * k;
    this.head.rotation.x += (pitch + headNod - this.head.rotation.x) * k;
    this.head.rotation.z += (headTilt - this.head.rotation.z) * k;
  }
}

/** 블록 캐릭터와 GLB 캐릭터가 함께 따르는 모양 */
export interface Avatar {
  root: THREE.Group;
  hand: THREE.Group;
  /** 등 부착점 (블록 캐릭터: 몸통 뒤 / GLB: 척추 본에 붙일 자리) */
  backSocket: THREE.Object3D;
  pose: Pose;
  readonly scale: number;
  setPose(p: Pose): void;
  update(dt: number, speed01?: number): void;
  lookAt(target: THREE.Vector3 | null): void;
  setHidden(h: boolean): void;
  /** 작은 동작 (블록 캐릭터). GLB 캐릭터는 나중에 본 애니메이션으로 */
  gesture(g: Gesture, dur?: number): void;
}

/** 모델이 준비돼 있으면 GLB 캐릭터, 아니면(불러오기 실패 포함) 블록 캐릭터 */
export function createAvatar(look: Look): Avatar {
  const g = look.model ? getModel(look.model) : undefined;
  return g ? new HumanCharacter(g, look.model!) : new Character(look);
}
