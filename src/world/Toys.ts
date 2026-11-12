// 쉬는 시간 놀잇감: 종이비행기(활강) · 축구공(차기·튕기기)
import * as THREE from 'three';
import { makeItemMesh } from './itemMesh';
import { resolveCircle, type Aabb } from './Collision';

export class PaperPlaneFlight {
  mesh = makeItemMesh('paperPlane');
  vel = new THREE.Vector3();
  active = false;
  private start = new THREE.Vector3();
  private t = 0;
  onLand: (dist: number, hitWall: boolean) => void = () => {};
  private hitWall = false;

  constructor(scene: THREE.Scene) {
    this.mesh.visible = false;
    this.mesh.scale.setScalar(1.3);
    scene.add(this.mesh);
  }

  /** power 0~1, dir: 수평 방향 */
  launch(from: THREE.Vector3, dir: THREE.Vector3, power: number) {
    this.active = true;
    this.hitWall = false;
    this.t = 0;
    this.start.copy(from);
    this.mesh.position.copy(from);
    const speed = 4 + power * 8;
    this.vel.set(dir.x * speed, 1.2 + power * 1.6, dir.z * speed);
    this.mesh.visible = true;
  }

  update(dt: number, colliders: Aabb[]) {
    if (!this.active) return;
    this.t += dt;
    // 활강: 속도가 빠를수록 양력, 공기 저항
    const v = this.vel.length();
    this.vel.y += (-9.8 + Math.min(8.6, v * 0.95)) * dt;
    this.vel.multiplyScalar(1 - 0.32 * dt);
    this.mesh.position.addScaledVector(this.vel, dt);
    const c = { x: this.mesh.position.x, z: this.mesh.position.z, r: 0.12 };
    const hit = resolveCircle(c, colliders, 1);
    if (hit.hit && this.mesh.position.y < 2.9) {
      this.hitWall = true;
      this.vel.set(0, -1.5, 0);
      this.mesh.position.x = c.x;
      this.mesh.position.z = c.z;
    }
    const look = this.mesh.position.clone().add(this.vel);
    this.mesh.lookAt(look);
    if (this.mesh.position.y <= 0.05 || this.t > 8) {
      this.mesh.position.y = 0.05;
      this.active = false;
      const dist = Math.hypot(this.mesh.position.x - this.start.x, this.mesh.position.z - this.start.z);
      this.onLand(dist, this.hitWall);
      setTimeout(() => (this.mesh.visible = false), 1500);
    }
  }
}

export class Ball {
  mesh: THREE.Mesh;
  vel = new THREE.Vector3();
  r = 0.22;
  onKick: () => void = () => {};
  private cooldown = 0;

  constructor(scene: THREE.Scene) {
    const tex = document.createElement('canvas');
    tex.width = tex.height = 64;
    const c = tex.getContext('2d')!;
    c.fillStyle = '#fff';
    c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#222';
    for (const [x, y] of [[16, 16], [48, 16], [32, 40], [8, 56], [56, 56]]) {
      c.beginPath();
      c.arc(x, y, 7, 0, Math.PI * 2);
      c.fill();
    }
    const t = new THREE.CanvasTexture(tex);
    t.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(this.r, 16, 12), new THREE.MeshLambertMaterial({ map: t }));
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  place(x: number, z: number) {
    this.mesh.position.set(x, this.r, z);
    this.vel.set(0, 0, 0);
    this.mesh.visible = true;
  }

  update(dt: number, colliders: Aabb[], playerPos: THREE.Vector3, playerVel: THREE.Vector3) {
    if (!this.mesh.visible) return;
    this.cooldown -= dt;
    const dx = this.mesh.position.x - playerPos.x;
    const dz = this.mesh.position.z - playerPos.z;
    const d = Math.hypot(dx, dz);
    if (d < this.r + 0.32 && this.cooldown <= 0) {
      const sp = Math.max(2.5, playerVel.length() * 1.8);
      this.vel.set((dx / (d || 1)) * sp, 0, (dz / (d || 1)) * sp);
      this.cooldown = 0.3;
      this.onKick();
    }
    this.mesh.position.addScaledVector(this.vel, dt);
    this.vel.multiplyScalar(1 - 0.9 * dt);
    const c = { x: this.mesh.position.x, z: this.mesh.position.z, r: this.r };
    const hit = resolveCircle(c, colliders, 2);
    if (hit.hit) {
      const dot = this.vel.x * hit.nx + this.vel.z * hit.nz;
      if (dot < 0) {
        this.vel.x -= 1.7 * dot * hit.nx;
        this.vel.z -= 1.7 * dot * hit.nz;
      }
    }
    this.mesh.position.x = c.x;
    this.mesh.position.z = c.z;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.01) this.mesh.rotateOnWorldAxis(new THREE.Vector3(this.vel.z, 0, -this.vel.x).normalize(), (sp / this.r) * dt);
  }
}
