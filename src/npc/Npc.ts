// NPC: idle / walk / sit / 손들기 / 환호. 격자 A*로 걸어간다.
import * as THREE from 'three';
import { createAvatar, type Avatar, type Look } from '../world/Character';
import type { LevelNav, Pt } from '../world/NavGrid';
import type { Seat } from '../world/SchoolMap';

export interface NpcDef {
  id: string;
  name: string;
  look: Look;
}

export class Npc {
  char: Avatar;
  pos = new THREE.Vector3();
  yaw = 0;
  path: Pt[] = [];
  speed = 2.2;
  seat: Seat | null = null;
  /** 진행 중인 걷기의 완료 콜백 (true = 도착, false = 다른 명령에 밀려 취소) */
  private pending: ((arrived: boolean) => void) | null = null;
  private faceYaw: number | null = null;
  radius = 0.28;
  /** 이 NPC와 말을 몇 번 했는지 (대사 순환용) */
  talkCount = 0;
  private bobT = Math.random() * 10;

  /** 바닥 높이 (계단 경사 포함). Game이 지도와 연결한다 */
  static ground: ((x: number, z: number, y: number) => number) | null = null;

  constructor(public def: NpcDef, private nav: LevelNav) {
    this.char = createAvatar(def.look);
    this.char.root.userData.npc = this;
  }

  get id() {
    return this.def.id;
  }
  get name() {
    return this.def.name;
  }

  private cancelWalk() {
    const p = this.pending;
    this.pending = null;
    this.path = [];
    p?.(false);
  }

  /** 순간이동. y = 바닥 높이 (없으면 2층 0) */
  place(x: number, z: number, yaw = this.yaw, y = 0) {
    this.cancelWalk();
    this.seat = null;
    this.pos.set(x, y, z);
    this.yaw = yaw;
    this.char.setPose('stand');
    this.sync();
  }

  sitAt(seat: Seat) {
    this.cancelWalk();
    this.seat = seat;
    this.pos.set(seat.x, seat.y ?? 0, seat.z);
    this.yaw = seat.yaw;
    this.char.setPose('sit');
    this.sync();
  }

  /**
   * 목적지까지 걸어간다. 도착하면 true, 다른 명령(새 걷기·앉기·순간이동)에 밀리면 false로 끝난다.
   * 길이 없으면 순간이동(진행 막힘 방지).
   */
  walkTo(x: number, z: number, faceYaw?: number, speed = 2.2, y?: number): Promise<boolean> {
    this.cancelWalk();
    this.seat = null;
    this.speed = speed;
    this.faceYaw = faceYaw ?? null;
    // y를 주면 그 층으로 (다른 층이면 계단으로 걸어서), 안 주면 지금 층 안에서
    const path = this.nav.findPath({ x: this.pos.x, z: this.pos.z, y: this.pos.y }, { x, z, y: y ?? this.pos.y });
    if (!path || path.length === 0) {
      this.place(x, z, faceYaw ?? this.yaw, y ?? this.pos.y);
      return Promise.resolve(true);
    }
    this.path = path;
    this.char.setPose(speed > 3 ? 'run' : 'walk');
    return new Promise((res) => (this.pending = res));
  }

  async walkToSeat(seat: Seat, speed = 2.2) {
    const dx = seat.x - seat.deskX, dz = seat.z - seat.deskZ, l = Math.hypot(dx, dz) || 1;
    if (await this.walkTo(seat.x + (dx / l) * 0.05, seat.z + (dz / l) * 0.05, seat.yaw, speed, seat.y ?? 0)) this.sitAt(seat);
  }

  faceTo(x: number, z: number) {
    this.faceYaw = Math.atan2(x - this.pos.x, z - this.pos.z);
  }

  update(dt: number) {
    if (this.path.length) {
      const t = this.path[0];
      const dx = t.x - this.pos.x, dz = t.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const step = this.speed * dt;
      if (d <= step) {
        this.pos.x = t.x;
        this.pos.z = t.z;
        this.path.shift();
        if (!this.path.length) {
          this.char.setPose('stand');
          const p = this.pending;
          this.pending = null;
          p?.(true);
        }
      } else {
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
        const want = Math.atan2(dx, dz);
        this.turnTo(want, dt, 12);
      }
      if (Npc.ground) this.pos.y = Npc.ground(this.pos.x, this.pos.z, this.pos.y);
    } else if (this.faceYaw !== null && !this.seat) {
      this.turnTo(this.faceYaw, dt, 8);
    }
    this.bobT += dt;
    this.char.update(dt, this.path.length ? 1 : 0);
    this.sync();
  }

  private turnTo(want: number, dt: number, rate: number) {
    let d = want - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * (1 - Math.exp(-dt * rate));
  }

  sync() {
    this.char.root.position.copy(this.pos);
    this.char.root.rotation.y = this.yaw;
  }

  headPos(): THREE.Vector3 {
    return this.pos.clone().add(new THREE.Vector3(0, (this.seat ? 1.3 : 1.55) * this.char.scale, 0));
  }
}
