"""
공통 리그(MakeHuman default, 163뼈) 애니메이션을 코드로 만든다.
회전은 '쉬는 자세(rest)의 아마추어 좌표축' 기준으로 적고, 뼈 로컬 회전으로 변환한다.
Blender 좌표: Z 위, 캐릭터 정면 -Y, 캐릭터 왼쪽(.L) +X
"""
import math
import bpy
from mathutils import Matrix, Vector, Quaternion

FPS = 30
D = math.radians


def rx(a):
    return Matrix.Rotation(D(a), 3, 'X')


def ry(a):
    return Matrix.Rotation(D(a), 3, 'Y')


def rz(a):
    return Matrix.Rotation(D(a), 3, 'Z')


class Poser:
    def __init__(self, arm):
        self.arm = arm
        self.rest = {b.name: b.matrix_local.to_3x3() for b in arm.data.bones}
        self.dir = {b.name: (b.tail_local - b.head_local).normalized() for b in arm.data.bones}

    def to_local(self, name, R):
        M = self.rest[name]
        return (M.inverted() @ R @ M).to_quaternion()

    def aim(self, name, target):
        """뼈가 target 방향(아마추어 좌표)을 향하도록 하는 회전"""
        return self.dir[name].rotation_difference(Vector(target).normalized()).to_matrix()


def _keys(arm, poser, action_name, frames, pose_fn, loop=True, bones_only=None):
    """pose_fn(t) -> {bone: R(3x3, 아마추어 축)} , 'root_loc': Vector"""
    arm.animation_data_create()
    act = bpy.data.actions.new(action_name)
    act.use_fake_user = True
    arm.animation_data.action = act
    pbs = arm.pose.bones
    for pb in pbs:
        pb.rotation_mode = 'QUATERNION'
    for f in range(frames + 1 if loop else frames):
        t = (f % frames) / frames if loop else (f / max(1, frames - 1))
        pose = pose_fn(t)
        for pb in pbs:
            if bones_only and pb.name not in bones_only and pb.name != 'root':
                continue
            R = pose.get(pb.name)
            pb.rotation_quaternion = poser.to_local(pb.name, R) if R is not None else Quaternion()
            pb.keyframe_insert('rotation_quaternion', frame=f + 1)
        root = pbs['root']
        loc = pose.get('root_loc', Vector())
        root.location = poser.rest['root'].inverted() @ loc
        root.keyframe_insert('location', frame=f + 1)
    # 다음 동작을 위해 원래대로
    for pb in pbs:
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()
    track = arm.animation_data.nla_tracks.new()
    track.name = action_name
    track.strips.new(action_name, 1, act)
    arm.animation_data.action = None
    return act


def add_all(arm, cfg):
    P = Poser(arm)
    hip_z = arm.data.bones['upperleg01.L'].head_local.z
    sex = cfg.get('sex', 'm')
    out = 0.17 if sex == 'm' else 0.13
    DOWN = {'L': Vector((out, 0.03, -1)).normalized(), 'R': Vector((-out, 0.03, -1)).normalized()}

    def arm_pose(p, side, upper_dir, bend, swing=0.0):
        """위팔 방향(아마추어 좌표) + 팔꿈치 굽힘(앞쪽, 도). 아래팔은 위팔 기준 상대 회전으로 넣는다."""
        ud = (rx(swing) @ Vector(upper_dir)).normalized()
        Wu = P.aim('upperarm01.' + side, ud)
        fd = rx(-bend) @ ud  # 앞으로 굽힘
        Wf = P.aim('lowerarm01.' + side, fd.normalized())
        p['upperarm01.' + side] = Wu
        p['lowerarm01.' + side] = Wu.inverted() @ Wf

    def base(bend=10):
        p = {}
        arm_pose(p, 'L', DOWN['L'], bend)
        arm_pose(p, 'R', DOWN['R'], bend)
        return p

    # ── 대기: 숨쉬기 + 살짝 흔들림 ──
    def idle(t):
        s = math.sin(2 * math.pi * t)
        p = {}
        arm_pose(p, 'L', DOWN['L'], 10, 1.5 * s)
        arm_pose(p, 'R', DOWN['R'], 10, -1.5 * s)
        p['spine03'] = rx(1.2 * s)
        p['spine01'] = rz(1.0 * math.sin(2 * math.pi * t + 1))
        p['neck01'] = rx(-1.0 * s)
        p['root_loc'] = Vector((0, 0, 0.003 * s))
        return p

    # ── 걷기·달리기 ──
    def walk_like(amp_leg, amp_arm, knee, bob, lean, elbow):
        def f(t):
            w = 2 * math.pi * t
            s, c = math.sin(w), math.cos(w)
            p = {}
            p['upperleg01.L'] = rx(-amp_leg * s)
            p['upperleg01.R'] = rx(amp_leg * s)
            p['lowerleg01.L'] = rx(knee * max(0.0, c) ** 1.2 + 5)
            p['lowerleg01.R'] = rx(knee * max(0.0, -c) ** 1.2 + 5)
            p['foot.L'] = rx(-8 * max(0.0, c))
            p['foot.R'] = rx(-8 * max(0.0, -c))
            arm_pose(p, 'L', DOWN['L'], elbow + amp_arm * 0.4 * max(0.0, -s), amp_arm * s)
            arm_pose(p, 'R', DOWN['R'], elbow + amp_arm * 0.4 * max(0.0, s), -amp_arm * s)
            p['spine01'] = rz(4 * s) @ rx(-lean)
            p['spine03'] = rz(-3 * s)
            p['neck01'] = rx(lean * 0.5)
            p['root_loc'] = Vector((0, 0, -bob * abs(c)))
            return p
        return f

    # ── 앉기: 엉덩이 관절을 의자 높이(약 0.42m)로, 손은 책상 위로 ──
    def sit(t):
        p = {}
        p['upperleg01.L'] = rx(-82) @ rz(-3)
        p['upperleg01.R'] = rx(-82) @ rz(3)
        p['lowerleg01.L'] = rx(80)
        p['lowerleg01.R'] = rx(80)
        p['foot.L'] = rx(-5)
        p['foot.R'] = rx(-5)
        p['spine01'] = rx(-4)
        arm_pose(p, 'L', (0.12, -0.55, -1), 70)
        arm_pose(p, 'R', (-0.12, -0.55, -1), 70)
        p['root_loc'] = Vector((0, 0.0, -(hip_z - 0.42)))
        return p

    # ── 손들기 (오른팔만: 앉기·서기 위에 겹쳐 쓴다) ──
    def raise_hand(t):
        k = min(1.0, t * 1.5)
        k = k * k * (3 - 2 * k)
        p = {}
        d = DOWN['R'].lerp(Vector((-0.15, -0.08, 1)).normalized(), k)
        if d.length < 0.3:
            d = Vector((-0.6, -0.4, 0.2))
        arm_pose(p, 'R', d.normalized(), 10 + 10 * k)
        return p

    # ── 환호: 두 팔 위로 흔들기 ──
    def cheer(t):
        s = math.sin(2 * math.pi * t * 2)
        p = {}
        arm_pose(p, 'L', (0.45 + 0.12 * s, -0.1, 1), 25)
        arm_pose(p, 'R', (-0.45 + 0.12 * s, -0.1, 1), 25)
        p['root_loc'] = Vector((0, 0, 0.03 * abs(s)))
        return p

    _keys(arm, P, 'Idle', 60, idle)
    _keys(arm, P, 'Walk', 32, walk_like(24, 18, 45, 0.018, 2, 14))
    _keys(arm, P, 'Run', 20, walk_like(40, 36, 85, 0.035, 10, 70))
    _keys(arm, P, 'Sit', 2, sit, loop=False)
    _keys(arm, P, 'Cheer', 30, cheer)
    _keys(arm, P, 'RaiseHand', 12, raise_hand, loop=False,
          bones_only={'upperarm01.R', 'upperarm02.R', 'lowerarm01.R', 'lowerarm02.R', 'wrist.R'})
