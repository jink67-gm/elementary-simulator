import * as THREE from 'three';
import type { Input } from '../core/Input';

/** 마우스로 도는 3인칭 카메라. 벽에 막히면 앞으로 당겨진다. */
export class ThirdPersonCamera {
  yaw = 0;
  pitch = 0.35;
  dist = 4.2;
  private curDist = 4.2;
  sensitivity = 1;
  shakeEnabled = true;
  private shakeT = 0;
  private shakeAmp = 0;
  private ray = new THREE.Raycaster();
  /** 컷신용: 설정되면 이 지점을 바라본다 */
  override: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
  private smoothPos = new THREE.Vector3();
  private smoothLook = new THREE.Vector3();
  private first = true;

  constructor(public cam: THREE.PerspectiveCamera) {}

  shake(amp = 0.12, sec = 1.5) {
    if (!this.shakeEnabled) return;
    this.shakeAmp = amp;
    this.shakeT = sec;
  }

  update(dt: number, input: Input, target: THREE.Vector3, seated: boolean, blockers: THREE.Object3D[]) {
    const s = 0.0025 * this.sensitivity;
    this.yaw -= input.mouseDX * s;
    this.pitch += input.mouseDY * s;
    if (input.down('ArrowLeft')) this.yaw += dt * 2;
    if (input.down('ArrowRight')) this.yaw -= dt * 2;
    if (input.down('ArrowUp')) this.pitch -= dt * 1.2;
    if (input.down('ArrowDown')) this.pitch += dt * 1.2;
    this.dist = Math.max(1.8, Math.min(6, this.dist + input.wheel * 0.4));
    this.pitch = Math.max(-0.25, Math.min(1.2, this.pitch));

    const want = seated ? Math.min(this.dist, 2.4) : this.dist;
    const look = target.clone().add(new THREE.Vector3(0, seated ? 0.9 : 1.25, 0));
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    // 벽 충돌
    this.ray.set(look, dir);
    this.ray.far = want;
    const hits = this.ray.intersectObjects(blockers, false);
    const allowed = hits.length ? Math.max(0.6, hits[0].distance - 0.25) : want;
    this.curDist += (allowed - this.curDist) * (allowed < this.curDist ? 1 : 1 - Math.exp(-dt * 4));
    let pos = look.clone().addScaledVector(dir, this.curDist);
    let lookAt = look;

    if (this.override) {
      pos = this.override.pos.clone();
      lookAt = this.override.look.clone();
    }
    const k = this.first ? 1 : this.override ? 1 - Math.exp(-dt * 3) : 1;
    this.first = false;
    this.smoothPos.lerp(pos, k);
    this.smoothLook.lerp(lookAt, k);
    this.cam.position.copy(this.smoothPos);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.min(1, this.shakeT);
      this.cam.position.x += (Math.random() - 0.5) * a;
      this.cam.position.y += (Math.random() - 0.5) * a;
    }
    this.cam.lookAt(this.smoothLook);
  }

  /** 플레이어 뒤쪽으로 카메라를 돌린다 */
  behind(yaw: number) {
    this.yaw = yaw + Math.PI;
  }
}
