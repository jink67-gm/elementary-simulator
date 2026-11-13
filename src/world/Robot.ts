// 자동 청소 로봇: 스스로 길을 찾아 다니거나(자동), 플레이어가 원격으로 조종한다(WASD + Space 집게).
// 모양은 기본 도형으로 만든 둥근 청소기 + 집게 팔.
import * as THREE from 'three';
import type { LevelNav, Pt } from './NavGrid';
import { resolveCircle, type Aabb } from './Collision';
import type { Input } from '../core/Input';

export type RobotMode = 'auto' | 'remote' | 'stopped' | 'idle';

export class Robot {
  root = new THREE.Group();
  pos = new THREE.Vector3();
  yaw = 0;
  mode: RobotMode = 'idle';
  radius = 0.36;
  speed = 1.0;
  /** 집게에 든 물건 모양 (논리는 이벤트가 관리) */
  claw = new THREE.Group();
  private path: Pt[] = [];
  private pending: ((ok: boolean) => void) | null = null;
  private eye: THREE.MeshBasicMaterial;
  private arm: THREE.Group;
  private t = 0;
  private blink = 0;

  constructor(private nav: LevelNav) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.28, 20), new THREE.MeshLambertMaterial({ color: 0xe9ecef }));
    body.position.y = 0.2;
    body.castShadow = true;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.365, 0.365, 0.06, 20), new THREE.MeshLambertMaterial({ color: 0x4ea8de }));
    band.position.y = 0.12;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xced4da }));
    dome.position.y = 0.34;
    this.eye = new THREE.MeshBasicMaterial({ color: 0x7cfc8a });
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.02), this.eye);
    eye.position.set(0, 0.26, 0.35);
    for (const x of [-0.3, 0.3]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 12), new THREE.MeshLambertMaterial({ color: 0x343a40 }));
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.08, 0);
      this.root.add(w);
    }
    // 집게 팔
    this.arm = new THREE.Group();
    this.arm.position.set(0, 0.42, 0.1);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.42), new THREE.MeshLambertMaterial({ color: 0x6c757d }));
    bar.position.z = 0.21;
    this.arm.add(bar);
    this.claw.position.set(0, -0.06, 0.44);
    for (const x of [-0.06, 0.06]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.04), new THREE.MeshLambertMaterial({ color: 0xffc300 }));
      f.position.set(x, -0.03, 0);
      this.claw.add(f);
    }
    this.arm.add(this.claw);
    this.root.add(body, band, dome, eye, this.arm);
    this.root.visible = false;
  }

  place(x: number, z: number, yaw = 0) {
    this.cancel();
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.sync();
  }

  private cancel() {
    this.path = [];
    const p = this.pending;
    this.pending = null;
    p?.(false);
  }

  /** 자동 이동. 도착하면 true, 다른 명령에 밀리면 false */
  goTo(x: number, z: number): Promise<boolean> {
    this.cancel();
    const path = this.nav.findPath({ x: this.pos.x, z: this.pos.z }, { x, z });
    if (!path || !path.length) return Promise.resolve(true);
    this.path = path;
    return new Promise((r) => (this.pending = r));
  }

  setMode(m: RobotMode) {
    if (m !== 'auto') this.cancel();
    this.mode = m;
    this.eye.color.setHex(m === 'stopped' ? 0xff595e : m === 'remote' ? 0x4ea8de : 0x7cfc8a);
  }

  /** 집게 앞쪽 점(월드) */
  clawPoint(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.yaw) * 0.6, 0, Math.cos(this.yaw) * 0.6).add(this.pos);
  }

  update(dt: number, colliders: Aabb[], input?: Input, camYaw = 0) {
    this.t += dt;
    if (this.mode === 'auto' && this.path.length) {
      const tgt = this.path[0];
      const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const step = this.speed * dt;
      this.turnTo(Math.atan2(dx, dz), dt, 6);
      if (d <= step) {
        this.pos.x = tgt.x;
        this.pos.z = tgt.z;
        this.path.shift();
        if (!this.path.length) {
          const p = this.pending;
          this.pending = null;
          p?.(true);
        }
      } else {
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
      }
    } else if (this.mode === 'remote' && input) {
      const mv = input.move();
      const { f, r } = mv;
      if (f || r) {
        const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
        let mx = fx * f - fz * r, mz = fz * f + fx * r;
        const l = Math.hypot(mx, mz);
        mx /= l;
        mz /= l;
        this.turnTo(Math.atan2(mx, mz), dt, 9);
        const sp = mv.run ? 2.2 : 1.5 * Math.max(0.5, mv.mag);
        this.pos.x += mx * sp * dt;
        this.pos.z += mz * sp * dt;
      }
      const c = { x: this.pos.x, z: this.pos.z, r: this.radius };
      resolveCircle(c, colliders);
      this.pos.x = c.x;
      this.pos.z = c.z;
    }
    // 집게 흔들림 + 정지 시 눈 깜빡임
    this.arm.rotation.x = Math.sin(this.t * 3) * 0.05;
    if (this.mode === 'stopped') {
      this.blink += dt;
      this.eye.color.setHex(Math.floor(this.blink * 2) % 2 ? 0xff595e : 0x5c1a1a);
    }
    this.sync();
  }

  private turnTo(want: number, dt: number, rate: number) {
    let d = want - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * (1 - Math.exp(-dt * rate));
  }

  sync() {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }
}
