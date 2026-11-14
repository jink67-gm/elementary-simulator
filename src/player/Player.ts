import { makeBackpack } from '../world/backpack';
import * as THREE from 'three';
import { createAvatar, type Avatar, type Look } from '../world/Character';
import { resolveCircle, separateCircles, type Aabb, type Circle } from '../world/Collision';
import type { Input } from '../core/Input';
import type { Seat } from '../world/SchoolMap';
import { makeItemMesh } from '../world/itemMesh';
import type { ItemId } from '../data/items';

export const PLAYER_RADIUS = 0.3;

export class Player {
  char: Avatar;
  pos = new THREE.Vector3();
  yaw = 0; // 바라보는 방향 (0 = +Z)
  private vy = 0;
  seat: Seat | null = null;
  speed = 0;
  private heldId: ItemId | null = null;
  private heldMesh: THREE.Object3D | null = null;
  frozen = false;
  /** 스페이스를 '점프' 대신 다른 동작(종이비행기 등)에 쓰는 중 */
  spaceBusy = false;

  constructor(look: Look) {
    this.char = createAvatar(look);
  }

  /** 등에 멘 책가방 (손에 드는 물건과 따로). 등 부착점(backSocket)에 붙는다 */
  private backpack: THREE.Object3D | null = null;
  get wearingBag() {
    return !!this.backpack;
  }
  setBackpack(on: boolean) {
    if (on && !this.backpack) {
      this.backpack = makeBackpack();
      this.char.backSocket.add(this.backpack);
    } else if (!on && this.backpack) {
      this.backpack.removeFromParent();
      this.backpack = null;
    }
  }

  get object() {
    return this.char.root;
  }

  /** 바닥 높이 (층·계단). Game이 지도에 맞춰 넣어 준다 */
  groundAt: (x: number, z: number, y: number) => number = () => 0;

  /** y를 주지 않으면 2층(우리 반 층, y=0) */
  teleport(x: number, z: number, yaw = this.yaw, y = 0) {
    this.seat = null;
    this.vy = 0;
    this.pos.set(x, y, z);
    this.yaw = yaw;
    this.char.setPose('stand');
    this.sync();
  }

  sitAt(seat: Seat) {
    this.seat = seat;
    this.pos.set(seat.x, 0, seat.z);
    this.yaw = seat.yaw;
    this.char.setPose('sit');
    this.sync();
  }

  standUp() {
    if (!this.seat) return;
    const s = this.seat;
    this.seat = null;
    // 의자 옆 통로 쪽으로 반 걸음
    const dx = s.x - s.deskX, dz = s.z - s.deskZ, l = Math.hypot(dx, dz) || 1;
    this.pos.set(s.x + (dx / l) * 0.35, 0, s.z + (dz / l) * 0.35);
    this.char.setPose('stand');
  }

  setHeld(id: ItemId | null) {
    if (id === this.heldId) return;
    if (this.heldMesh) this.char.hand.remove(this.heldMesh);
    this.heldMesh = null;
    this.heldId = id;
    if (id) {
      this.heldMesh = makeItemMesh(id, 'held');
      this.heldMesh.scale.setScalar(0.9);
      this.heldMesh.rotation.x = id === 'paperPlane' ? -Math.PI / 2 : 0;
      this.char.hand.add(this.heldMesh);
    }
  }

  forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  update(dt: number, input: Input, camYaw: number, colliders: Aabb[], others: Circle[]): { moved: boolean } {
    let mx = 0, mz = 0;
    let mag = 0, run = false;
    if (!this.frozen) {
      const mv = input.move();
      const { f, r } = mv;
      mag = mv.mag;
      run = mv.run;
      if (f || r) {
        // 카메라 기준 방향
        const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
        const rx = -fz, rz = fx;
        mx = fx * f + rx * r;
        mz = fz * f + rz * r;
        const l = Math.hypot(mx, mz);
        mx /= l;
        mz /= l;
      }
    }
    if (this.seat) {
      if (mx || mz) this.standUp();
      else {
        this.char.update(dt, 0);
        this.sync();
        return { moved: false };
      }
    }
    // 조이스틱을 살짝 밀면 천천히 걷는다
    const target = mx || mz ? (run ? 4.6 : 3.0 * Math.max(0.45, Math.min(1, mag * 1.15))) : 0;
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * 12));
    if (mx || mz) {
      const want = Math.atan2(mx, mz);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-dt * 14));
      this.pos.x += mx * this.speed * dt;
      this.pos.z += mz * this.speed * dt;
    }
    // 점프
    // 바닥(층·계단 높이)에 붙어 걷고, 점프하면 잠깐 떠오른다
    const ground = this.groundAt(this.pos.x, this.pos.z, this.pos.y);
    const onGround = this.pos.y <= ground + 0.02;
    if (!this.frozen && !this.spaceBusy && input.pressed('Space') && onGround) this.vy = 4.2;
    if (this.vy <= 0 && this.pos.y - ground < 0.45 && this.pos.y - ground > -0.6) {
      this.pos.y = ground; // 계단 오르내리기
      this.vy = 0;
    } else {
      this.vy -= 12 * dt;
      this.pos.y = Math.max(ground, this.pos.y + this.vy * dt);
      if (this.pos.y === ground) this.vy = 0;
    }

    const c: Circle = { x: this.pos.x, z: this.pos.z, r: PLAYER_RADIUS };
    for (const o of others) separateCircles(c, o);
    resolveCircle(c, colliders);
    this.pos.x = c.x;
    this.pos.z = c.z;

    this.char.setPose(this.speed > 0.3 ? (run ? 'run' : 'walk') : this.char.pose === 'raise' || this.char.pose === 'cheer' ? this.char.pose : 'stand');
    this.char.update(dt, Math.min(1, this.speed / 3));
    this.sync();
    return { moved: this.speed > 0.3 };
  }

  sync() {
    this.char.root.position.copy(this.pos);
    this.char.root.rotation.y = this.yaw;
  }
}
