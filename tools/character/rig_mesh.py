"""
AI로 만든 사람 GLB(뼈대 없음)에 무료로 뼈대·가중치·애니메이션을 넣는다 (헤드리스 Blender).

뼈 이름은 build_character.py의 공통 리그(MakeHuman)와 같은 이름의 일부를 써서
anims.py의 동작(대기·걷기·달리기·앉기·손들기·환호)을 그대로 붙인다.

실행: <bpy python> tools/character/rig_mesh.py <입력.glb> <출력.glb> <키(m)> [front=-y|+y|-x|+x]
"""
import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(__file__))
import anims  # noqa: E402


def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    # 하나로 합치고 변형을 적용
    for o in bpy.context.scene.objects:
        o.select_set(o.type == 'MESH')
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(bpy.context.scene.objects):
        if o != obj:
            bpy.data.objects.remove(o, do_unlink=True)
    return obj


def normalize(obj, height, front):
    me = obj.data
    rot = {'-y': 0, '+y': math.pi, '-x': -math.pi / 2, '+x': math.pi / 2}[front]
    R = Matrix.Rotation(rot, 4, 'Z')
    me.transform(R)
    zs = [v.co.z for v in me.vertices]
    zmin, zmax = min(zs), max(zs)
    k = height / (zmax - zmin)
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    me.transform(Matrix.Scale(k, 4) @ Matrix.Translation((-cx, -cy, -zmin)))
    me.update()


def slice_center(verts, z0, z1, side=None, xmax=None):
    pts = [v for v in verts if z0 <= v.z <= z1 and (side is None or v.x * side > 0) and (xmax is None or abs(v.x) < xmax)]
    if not pts:
        return None
    return sum(pts, Vector()) / len(pts)


def landmarks(obj, H):
    V = [v.co.copy() for v in obj.data.vertices]
    J = {}
    J['hip'] = slice_center(V, 0.50 * H, 0.54 * H, xmax=0.12 * H) or Vector((0, 0, 0.52 * H))
    J['chest'] = slice_center(V, 0.70 * H, 0.74 * H, xmax=0.12 * H) or Vector((0, 0, 0.72 * H))
    J['spine'] = (J['hip'] + J['chest']) / 2
    J['neck'] = slice_center(V, 0.82 * H, 0.84 * H, xmax=0.06 * H) or Vector((0, 0, 0.83 * H))
    J['head'] = slice_center(V, 0.86 * H, 0.88 * H, xmax=0.08 * H) or Vector((0, 0, 0.87 * H))
    J['top'] = Vector((J['head'].x, J['head'].y, H))
    for s, n in ((1, 'L'), (-1, 'R')):
        # 손끝: 어깨 아래 높이에서 바깥으로 가장 먼 점
        arm_pts = [v for v in V if 0.40 * H < v.z < 0.82 * H and v.x * s > 0.13 * H]
        tip = max(arm_pts, key=lambda v: v.x * s) if arm_pts else Vector((s * 0.35 * H, 0, 0.45 * H))
        sh = Vector((s * 0.105 * H, J['chest'].y, 0.80 * H))
        sh_c = slice_center(V, 0.77 * H, 0.81 * H, side=s)
        if sh_c:
            sh.x = s * min(abs(sh_c.x) + 0.035 * H, 0.13 * H)
            sh.y = sh_c.y
        wrist = sh + (tip - sh) * 0.84
        elbow = sh + (wrist - sh) * 0.5 + Vector((0, 0.01 * H, 0))
        J['shoulder.' + n] = sh
        J['elbow.' + n] = elbow
        J['wrist.' + n] = wrist
        J['hand.' + n] = tip
        hipj = slice_center(V, 0.46 * H, 0.49 * H, side=s, xmax=0.12 * H) or Vector((s * 0.05 * H, 0, 0.47 * H))
        hipj.z = 0.49 * H
        J['upleg.' + n] = hipj
        J['knee.' + n] = slice_center(V, 0.27 * H, 0.30 * H, side=s, xmax=0.12 * H) or Vector((s * 0.05 * H, 0, 0.28 * H))
        J['ankle.' + n] = slice_center(V, 0.04 * H, 0.07 * H, side=s, xmax=0.12 * H) or Vector((s * 0.05 * H, 0, 0.05 * H))
        J['toe.' + n] = J['ankle.' + n] + Vector((0, -0.08 * H, -0.03 * H))
    return J


BONES = [
    # 이름, 머리, 꼬리, 부모
    ('root', 'hip', 'spine', None),
    ('spine03', 'spine', 'chest', 'root'),
    ('spine01', 'chest', 'neck', 'spine03'),
    ('neck01', 'neck', 'head', 'spine01'),
    ('head', 'head', 'top', 'neck01'),
]
for n in 'LR':
    BONES += [
        ('upperarm01.' + n, 'shoulder.' + n, 'elbow.' + n, 'spine01'),
        ('lowerarm01.' + n, 'elbow.' + n, 'wrist.' + n, 'upperarm01.' + n),
        ('wrist.' + n, 'wrist.' + n, 'hand.' + n, 'lowerarm01.' + n),
        ('upperleg01.' + n, 'upleg.' + n, 'knee.' + n, 'root'),
        ('lowerleg01.' + n, 'knee.' + n, 'ankle.' + n, 'upperleg01.' + n),
        ('foot.' + n, 'ankle.' + n, 'toe.' + n, 'lowerleg01.' + n),
    ]


def build_armature(J):
    data = bpy.data.armatures.new('Armature')
    arm = bpy.data.objects.new('Armature', data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for name, h, t, parent in BONES:
        e = data.edit_bones.new(name)
        e.head, e.tail = J[h], J[t]
        if parent:
            e.parent = eb[parent]
        eb[name] = e
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.dot(ab))))
    return (p - (a + ab * t)).length


def weight(obj, arm, J, H):
    """뼈 구간까지 거리로 가중치 (팔·다리·몸통 영역을 나눠 섞임 방지)"""
    bones = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in arm.data.bones}
    groups = {n: obj.vertex_groups.new(name=n) for n in bones}
    torso = ['root', 'spine03', 'spine01', 'neck01', 'head']
    for v in obj.data.vertices:
        p = v.co
        s = 'L' if p.x > 0 else 'R'
        sx = abs(J['shoulder.' + s].x)
        if abs(p.x) > sx * 0.92 and p.z > J['hip'].z - 0.02 * H:
            cand = ['upperarm01.' + s, 'lowerarm01.' + s, 'wrist.' + s, 'spine01']
        elif p.z < J['upleg.' + s].z + 0.02 * H:
            cand = ['upperleg01.' + s, 'lowerleg01.' + s, 'foot.' + s, 'root']
        else:
            cand = torso + ['upperarm01.' + s]
        ds = [(seg_dist(p, *bones[c]), c) for c in cand]
        ds.sort()
        top = ds[:3]
        ws = [1.0 / max(1e-4, d) ** 4 for d, _ in top]
        tot = sum(ws)
        for (d, c), w in zip(top, ws):
            if w / tot > 0.02:
                groups[c].add([v.index], w / tot, 'REPLACE')
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    obj.parent = arm


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    src, dst, H = argv[0], argv[1], float(argv[2])
    front = argv[3] if len(argv) > 3 else '-y'
    obj = load(src)
    normalize(obj, H, front)
    J = landmarks(obj, H)
    arm = build_armature(J)
    weight(obj, arm, J, H)
    anims.add_all(arm, {'height': H, 'sex': 'm'})
    for o in bpy.context.scene.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=True, export_animations=True,
                              export_animation_mode='ACTIONS', export_force_sampling=True, export_yup=True, export_skins=True)
    print('RIGGED', dst, {k: tuple(round(x, 3) for x in v) for k, v in J.items() if k in ('hip', 'shoulder.L', 'wrist.L', 'knee.L')})


if __name__ == '__main__':
    main()
