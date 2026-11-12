// NPC: idle / walk / sit / 손들기 / 환호. 격자 A*로 걸어간다.
import * as THREE from 'three';
import { Character, type Look } from '../world/Character';
import type { NavGrid, Pt } from '../world/NavGrid';
import type { Seat } from '../world/SchoolMap';

export interface NpcDef {
  id: string;
  name: string;
  look: Look;
}

export class Npc {
  char: Character;
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

  constructor(public def: NpcDef, private nav: NavGrid) {
    this.char = new Character(def.look);
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

  place(x: number, z: number, yaw = this.yaw) {
    this.cancelWalk();
    this.seat = null;
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.char.setPose('stand');
    this.sync();
  }

  sitAt(seat: Seat) {
    this.cancelWalk();
    this.seat = seat;
    this.pos.set(seat.x, 0, seat.z);
    this.yaw = seat.yaw;
    this.char.setPose('sit');
    this.sync();
  }

  /**
   * 목적지까지 걸어간다. 도착하면 true, 다른 명령(새 걷기·앉기·순간이동)에 밀리면 false로 끝난다.
   * 길이 없으면 순간이동(진행 막힘 방지).
   */
  walkTo(x: number, z: number, faceYaw?: number, speed = 2.2): Promise<boolean> {
    this.cancelWalk();
    this.seat = null;
    this.speed = speed;
    this.faceYaw = faceYaw ?? null;
    const path = this.nav.findPath({ x: this.pos.x, z: this.pos.z }, { x, z });
    if (!path || path.length === 0) {
      this.place(x, z, faceYaw ?? this.yaw);
      return Promise.resolve(true);
    }
    this.path = path;
    this.char.setPose(speed > 3 ? 'run' : 'walk');
    return new Promise((res) => (this.pending = res));
  }

  async walkToSeat(seat: Seat, speed = 2.2) {
    if (await this.walkTo(seat.x, seat.z + 0.05, seat.yaw, speed)) this.sitAt(seat);
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
