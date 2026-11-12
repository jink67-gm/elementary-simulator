"""
초등학생 시뮬레이터 캐릭터 자동 제작 (헤드리스 Blender, bpy)

재료: MakeHuman 1.x 기본 인체 메시·체형 타깃·뼈대·웨이트 (모두 CC0, assets/source/makehuman)
결과: 뼈대와 애니메이션이 들어 있는 GLB (public/models/characters/<id>.glb)

실행:  <bpy가 설치된 python> tools/character/build_character.py <character_id> [<character_id> ...]
캐릭터 설정은 tools/character/characters.json
"""
import bpy
import bmesh
import json
import math
import os
import sys
from mathutils import Matrix, Vector, Quaternion

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MH = os.path.join(ROOT, 'assets', 'source', 'makehuman')
OUT = os.path.join(ROOT, 'public', 'models', 'characters')

sys.path.insert(0, os.path.dirname(__file__))
import anims  # noqa: E402  (같은 폴더의 애니메이션 정의)


# ───────────────────────── MakeHuman 데이터 읽기 ─────────────────────────
def read_obj(path):
    verts, uvs, faces = [], [], []  # faces: (group, [(vi, ti)...])
    group = None
    for line in open(path):
        if line.startswith('v '):
            _, x, y, z = line.split()[:4]
            verts.append(Vector((float(x), float(y), float(z))))
        elif line.startswith('vt '):
            p = line.split()
            uvs.append((float(p[1]), float(p[2])))
        elif line.startswith('g '):
            group = line.split()[1]
        elif line.startswith('f '):
            corners = []
            for t in line.split()[1:]:
                a = t.split('/')
                corners.append((int(a[0]) - 1, int(a[1]) - 1 if len(a) > 1 and a[1] else -1))
            faces.append((group, corners))
    return verts, uvs, faces


def apply_target(verts, path, weight):
    if weight == 0:
        return
    for line in open(path):
        if not line or line[0] == '#':
            continue
        p = line.split()
        if len(p) < 4:
            continue
        i = int(p[0])
        verts[i] += Vector((float(p[1]), float(p[2]), float(p[3]))) * weight


def mh_to_blender(v):
    # MakeHuman: Y-up, 데시미터 / Blender: Z-up, 미터
    return Vector((v.x * 0.1, -v.z * 0.1, v.y * 0.1))


# ───────────────────────── 메시 만들기 ─────────────────────────
def make_mesh(name, verts_all, uvs, faces, keep_groups, vert_filter=None):
    """원래 정점 번호를 유지하며 일부 그룹만 메시로 만든다. 반환: (obj, old→new 정점 번호)"""
    used = {}
    flist = []
    for g, corners in faces:
        if g not in keep_groups:
            continue
        if vert_filter and not vert_filter(g, [c[0] for c in corners]):
            continue
        flist.append(corners)
        for vi, _ in corners:
            if vi not in used:
                used[vi] = len(used)
    co = [None] * len(used)
    for old, new in used.items():
        co[new] = verts_all[old]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(co, [], [[used[vi] for vi, _ in c] for c in flist])
    uv_layer = mesh.uv_layers.new(name='UVMap')
    li = 0
    for c in flist:
        for _, ti in c:
            uv_layer.data[li].uv = uvs[ti] if ti >= 0 else (0, 0)
            li += 1
    mesh.update()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj, used


def inflate(obj, amount):
    """법선 방향으로 부풀리기 (옷 두께)"""
    me = obj.data
    me.update()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * amount
    bm.to_mesh(me)
    bm.free()


def material(name, color, rough=0.8, sheen=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*srgb_to_linear(color), 1)
    bsdf.inputs['Roughness'].default_value = rough
    return m


def srgb_to_linear(hexcol):
    r, g, b = ((hexcol >> 16) & 255) / 255, ((hexcol >> 8) & 255) / 255, (hexcol & 255) / 255
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return f(r), f(g), f(b)


# ───────────────────────── 뼈대 ─────────────────────────
def build_armature(skel, joint_pos):
    arm_data = bpy.data.armatures.new('Armature')
    arm = bpy.data.objects.new('Armature', arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    bones = skel['bones']
    eb = {}
    for name, b in bones.items():
        e = arm_data.edit_bones.new(name)
        e.head = joint_pos[b['head']]
        e.tail = joint_pos[b['tail']]
        if (e.tail - e.head).length < 1e-4:
            e.tail = e.head + Vector((0, 0, 0.01))
        eb[name] = e
    for name, b in bones.items():
        if b['parent']:
            eb[name].parent = eb[b['parent']]
    # 비틀림(roll): MakeHuman 회전 평면의 법선을 뼈의 Z축으로
    for name, b in bones.items():
        plane = skel['planes'].get(b.get('rotation_plane') or '')
        if not plane:
            continue
        p1, p2, p3 = (joint_pos[j] for j in plane)
        n = (p2 - p1).cross(p3 - p2)
        if n.length > 1e-6:
            eb[name].align_roll(n.normalized())
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def skin(obj, used, weights, arm):
    for bone, pairs in weights.items():
        vg = None
        for vi, w in pairs:
            if vi in used:
                if vg is None:
                    vg = obj.vertex_groups.new(name=bone)
                tgt = used[vi]
                vg.add(tgt if isinstance(tgt, list) else [tgt], w, 'REPLACE')
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    obj.parent = arm


def dominant_bone(weights):
    best = {}
    for bone, pairs in weights.items():
        for vi, w in pairs:
            if w > best.get(vi, ('', 0))[1]:
                best[vi] = (bone, w)
    return {vi: b for vi, (b, _) in best.items()}


# ───────────────────────── mhclo (눈 등) 맞추기 ─────────────────────────
def fit_mhclo(path, verts_all):
    lines = open(path).read().splitlines()
    scale = {}
    ref = []
    in_verts = False
    obj_file = None
    for ln in lines:
        p = ln.split()
        if not p or p[0].startswith('#'):
            continue
        if in_verts:
            if len(p) == 9:
                ref.append(([int(p[0]), int(p[1]), int(p[2])], [float(x) for x in p[3:6]], Vector([float(x) for x in p[6:9]])))
            elif len(p) == 1:
                ref.append(([int(p[0])], [1.0], Vector()))
            continue
        if p[0] == 'obj_file':
            obj_file = p[1]
        elif p[0] in ('x_scale', 'y_scale', 'z_scale'):
            scale[p[0][0]] = (int(p[1]), int(p[2]), float(p[3]))
        elif p[0] == 'verts':
            in_verts = True
    s = {}
    axis = {'x': 0, 'y': 1, 'z': 2}
    for k, (a, b, d) in scale.items():
        s[k] = abs(verts_all[a][axis[k]] - verts_all[b][axis[k]]) / d
    out = []
    for idx, w, off in ref:
        v = Vector()
        for i, wi in zip(idx, w):
            v += verts_all[i] * wi
        v += Vector((off.x * s.get('x', 1), off.y * s.get('y', 1), off.z * s.get('z', 1)))
        out.append(v)
    ov, ouv, of = read_obj(os.path.join(os.path.dirname(path), obj_file))
    return out, ouv, of


# ───────────────────────── 캐릭터 만들기 ─────────────────────────
def build(cfg):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    verts, uvs, faces = read_obj(os.path.join(MH, '3dobjs', 'base.obj'))
    for t, w in cfg['targets'].items():
        apply_target(verts, os.path.join(MH, 'targets', t + '.target'), w)

    skel = json.load(open(os.path.join(MH, 'rigs', 'default.mhskel')))
    weights = json.load(open(os.path.join(MH, 'rigs', 'default_weights.mhw')))['weights']

    # 키 맞추기 (발바닥 0, 정수리 = height)
    body_idx = range(0, 13380)
    ys = [verts[i].y for i in body_idx]
    ymin, ymax = min(ys), max(ys)
    k = cfg['height'] * 10 / (ymax - ymin)
    for i in range(len(verts)):
        v = verts[i]
        verts[i] = Vector((v.x * k, (v.y - ymin) * k, v.z * k))
    bverts = [mh_to_blender(v) for v in verts]

    # 관절 위치 = 관절 정점들의 평균
    joint_pos = {}
    for j, ids in skel['joints'].items():
        p = Vector()
        for i in ids:
            p += bverts[i]
        joint_pos[j] = p / len(ids)

    arm = build_armature(skel, joint_pos)
    dom = dominant_bone(weights)
    B = arm.data.bones
    L = dict(
        hip=B['upperleg01.L'].head_local.z,
        neck=B['neck01'].head_local.z,
        ankle=B['foot.L'].head_local.z,
        eye=B['eye.L'].head_local.z,
        head_y=B['head'].head_local.y,
        head_top=max(v.z for v in bverts[:13380]),
    )
    ARM_BONES = {f'{a}{n}.{s}' for a in ('upperarm0', 'lowerarm0') for n in (1, 2) for s in 'LR'} | {
        'clavicle.L', 'clavicle.R', 'shoulder01.L', 'shoulder01.R'}
    HAND = lambda b: b and (b.startswith(('wrist', 'finger', 'metacarpal')))
    FOOT = lambda b: b and (b.startswith(('foot', 'toe')))
    look = cfg.get('outfit', {})
    hem = L['hip'] + look.get('hem', -0.03)          # 상의 밑단
    neck_cut = L['neck'] - look.get('collar', 0.035)  # 목둘레
    waist = L['hip'] + 0.11                            # 바지 허리 (상의 밑으로 겹침)
    cuff = L['ankle'] + look.get('cuff', 0.05)        # 바지 끝
    shoe_top = L['ankle'] + 0.035

    def zs(vids):
        return [bverts[v].z for v in vids]

    neck_c = Vector((0, B['neck01'].head_local.y, 0))
    neck_r = look.get('neck_r', 0.072)

    def in_neck(v):
        p = bverts[v]
        return p.z > L['neck'] + 0.012 or (p.z > neck_cut and ((p.x) ** 2 + (p.y - neck_c.y) ** 2) ** 0.5 < neck_r)

    def is_top(vids):
        if any(in_neck(v) for v in vids) or any(HAND(dom.get(v)) for v in vids):
            return False
        if all(dom.get(v) in ARM_BONES for v in vids):
            return True
        return min(zs(vids)) >= hem

    def is_bottom(vids):
        z = zs(vids)
        if any(dom.get(v) in ARM_BONES or HAND(dom.get(v)) for v in vids):
            return False
        return max(z) <= waist and min(z) >= cuff

    def is_shoe(vids):
        return max(zs(vids)) <= shoe_top + 0.03

    # 몸: 옷 안쪽으로 완전히 가려지는 면은 지운다 (삼각형 절약 + 뚫림 방지)
    def body_filter(_g, vids):
        z = zs(vids)
        if any(HAND(dom.get(v)) for v in vids) or any(in_neck(v) for v in vids) or max(z) > L['neck']:
            return True
        if all(dom.get(v) in ARM_BONES for v in vids):
            return False
        if min(z) > hem + 0.01:
            return False
        if max(z) < waist - 0.01 and min(z) > cuff + 0.01:
            return False
        if max(z) < shoe_top - 0.005:
            return False
        return True

    body, body_used = make_mesh('Body', bverts, uvs, faces, {'body'}, body_filter)
    skin_colors(body, body_used, bverts, L, cfg)
    skin(body, body_used, weights, arm)
    parts = [body]

    for name, filt, key in (('Top', is_top, 'top'), ('Bottom', is_bottom, 'bottom'), ('Shoes', is_shoe, 'shoes')):
        spec = cfg['clothes'][key]
        o, used = make_mesh(name, bverts, uvs, faces, {'helper-tights'}, lambda _g, v, f=filt: f(v))
        inflate(o, spec.get('thickness', 0.006))
        o.data.materials.append(material(name, spec['color'], spec.get('rough', 0.85)))
        skin(o, used, weights, arm)
        parts.append(o)

    hair = make_hair(bverts, uvs, faces, L, cfg)
    hair_used = hair[1]
    skin(hair[0], hair_used, weights, arm)
    parts.append(hair[0])
    brows = make_brows(body, L, cfg)
    brows.parent = arm
    vg = brows.vertex_groups.new(name='head')
    vg.add(list(range(len(brows.data.vertices))), 1.0, 'REPLACE')
    bm_ = brows.modifiers.new('Armature', 'ARMATURE')
    bm_.object = arm
    parts.append(brows)

    # 눈
    eyes_v, eyes_uv, eyes_f = fit_mhclo(os.path.join(MH, 'eyes', 'high-poly', 'high-poly.mhclo'), verts)
    eyes_b = [mh_to_blender(v) for v in eyes_v]
    eo, _ = make_mesh('Eyes', eyes_b, eyes_uv, eyes_f, set(g for g, _ in eyes_f))
    eye_mat(eo, cfg)
    eo.parent = arm
    vg = eo.vertex_groups.new(name='head')
    vg.add(list(range(len(eo.data.vertices))), 1.0, 'REPLACE')
    m = eo.modifiers.new('Armature', 'ARMATURE')
    m.object = arm
    parts.append(eo)

    anims.add_all(arm, cfg)
    return arm, parts


def head_frame(v, L):
    """머리 기준 좌표: 앞쪽 정도(front: -1 뒤 ~ 1 앞)"""
    c = Vector((0, L['head_y'], L['eye'] + 0.02))
    d = v - c
    d.z = 0
    return (-d.y / d.length) if d.length > 1e-6 else 0.0


def make_hair(bverts, uvs, faces, L, cfg):
    """두피 영역의 몸 면을 복제해 부풀린 머리카락. 스타일: short / bob / long / buzz / spiky"""
    style = cfg.get('hair_style', 'short')
    eye = L['eye']
    top = L['head_top']

    def scalp(v):
        p = bverts[v]
        if p.z < L['neck'] + 0.02:
            return False
        fr = head_frame(p, L)
        side = abs(p.x)
        if fr > 0.55:   # 이마: 머리선
            line = eye + (0.045 if style not in ('bob', 'long') else 0.035)
        elif fr > -0.2:  # 옆머리: 귀 위
            line = eye + (0.01 if style in ('short', 'spiky', 'buzz') else -0.06)
            if style in ('short', 'spiky', 'buzz') and side > 0.055 and fr < 0.4:
                line = eye + 0.025
        else:            # 뒷머리
            line = {'buzz': eye - 0.03, 'short': eye - 0.055, 'spiky': eye - 0.05, 'bob': eye - 0.11, 'long': eye - 0.12}[style]
        return p.z >= line

    sel = {}
    flist = []
    for g, corners in faces:
        if g != 'body':
            continue
        vids = [c[0] for c in corners]
        if all(scalp(v) for v in vids):
            flist.append(corners)
    used = {}
    for c in flist:
        for vi, _ in c:
            used.setdefault(vi, len(used))
    co = [None] * len(used)
    vol = cfg.get('hair_volume', 0.012)
    for old, new in used.items():
        p = bverts[old].copy()
        co[new] = p
    mesh = bpy.data.meshes.new('Hair')
    mesh.from_pydata(co, [], [[used[vi] for vi, _ in c] for c in flist])
    mesh.update()
    obj = bpy.data.objects.new('Hair', mesh)
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.normal_update()
    import random
    rnd = random.Random(cfg.get('seed', 7))
    for v in bm.verts:
        h = max(0.0, (v.co.z - eye) / max(0.01, top - eye))  # 위로 갈수록 두껍게
        amt = vol * (0.35 + 0.9 * h)
        if style == 'buzz':
            amt = 0.004
        if style == 'spiky':
            amt += rnd.random() * 0.012 * h
        else:
            amt += rnd.random() * 0.002
        v.co += v.normal * amt
    # 앞머리: 이마 가장자리를 살짝 앞으로·아래로
    for v in bm.verts:
        fr = head_frame(v.co, L)
        if fr > 0.6 and v.co.z < eye + 0.075 and style != 'buzz':
            v.co.y -= 0.006
            v.co.z -= 0.012 if style in ('short', 'bob', 'long') else 0.004
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    sm = obj.modifiers.new('Smooth', 'SMOOTH')
    sm.factor = 0.6
    sm.iterations = 6
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier='Smooth')
    obj.select_set(False)
    sol = obj.modifiers.new('Solidify', 'SOLIDIFY')
    sol.thickness = 0.006
    sol.offset = -1
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier='Solidify')
    obj.select_set(False)
    # 묶은 머리 (포니테일)
    if cfg.get('ponytail'):
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        c = Vector((0, L['head_y'] + 0.075, eye - 0.01))
        ret = bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.028, radius2=0.012, depth=0.16)
        for v in ret['verts']:
            v.co = Vector((v.co.x, v.co.y + v.co.z * 0.25, v.co.z)) + c - Vector((0, 0, 0.07))
        bm.to_mesh(obj.data)
        bm.free()
    obj.data.materials.append(material('Hair', cfg['hair'], 0.5))
    # 웨이트: 원래 두피 정점 → 같은 몸 정점 (Solidify로 늘어난 정점은 가장 가까운 것)
    hv = obj.data.vertices
    nmap = {}
    src = [(new, bverts[old]) for old, new in used.items()]
    inv = {new: old for old, new in used.items()}
    from mathutils.kdtree import KDTree
    kd = KDTree(len(src))
    for new, p in src:
        kd.insert(p, new)
    kd.balance()
    final_used = {}
    for v in hv:
        _, idx, _ = kd.find(v.co)
        final_used.setdefault(inv[idx], []).append(v.index)
    return obj, _MultiMap(final_used)


class _MultiMap(dict):
    """skin()이 old→new 하나를 기대하므로, 여러 정점에 같은 웨이트를 주는 어댑터"""
    pass


def make_brows(body, L, cfg):
    """눈썹: 얼굴 표면을 따라가는 가늘고 끝이 좁아지는 띠 (계단 없이 매끈하게)"""
    from mathutils.bvhtree import BVHTree
    dg = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(body, dg)
    eye = L['eye']
    thick = cfg.get('brow_thick', 0.0045)
    verts, faces = [], []
    n = 12
    for side in (1, -1):
        base = len(verts)
        for i in range(n + 1):
            u = i / n
            x = 0.013 + u * 0.040
            z = eye + 0.021 + 0.007 * math.sin(math.pi * min(1, u * 1.2)) - 0.004 * u
            w = thick * (1.0 - 0.6 * u) + 0.0008
            for dz in (w / 2, -w / 2):
                origin = Vector((side * x, L['head_y'] - 0.3, z + dz))
                hit = tree.ray_cast(origin, Vector((0, 1, 0)))
                p, nrm = hit[0], hit[1]
                if p is None:
                    p, nrm = Vector((side * x, L['head_y'] - 0.08, z + dz)), Vector((0, -1, 0))
                verts.append(p + nrm * 0.0012)
        for i in range(n):
            a = base + i * 2
            f = [a, a + 1, a + 3, a + 2]
            faces.append(f if side > 0 else f[::-1])
    me = bpy.data.meshes.new('Brows')
    me.from_pydata(verts, [], faces)
    me.update()
    obj = bpy.data.objects.new('Brows', me)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material('Brows', cfg['hair'], 0.8))
    return obj


def skin_colors(obj, used, bverts, L, cfg):
    """피부 정점 색: 입술·볼·눈두덩 (텍스처 없이 얼굴 표정을 또렷하게)"""
    base = srgb_to_linear(cfg['skin'])
    lip = srgb_to_linear(cfg.get('lip', 0xc97a73))
    blush = srgb_to_linear(0xf0a0a0)
    me = obj.data
    col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    inv = {new: old for old, new in used.items()}
    eye = L['eye']
    for v in me.vertices:
        p = bverts[inv[v.index]]
        c = list(base)
        fr = head_frame(p, L) if p.z > L['neck'] else 0
        if fr > 0.8:
            mz = eye - 0.072
            dl = ((abs(p.x) / 0.022) ** 2 + ((p.z - mz) / 0.007) ** 2)
            if dl < 1:
                k = (1 - dl) ** 0.5
                c = [b * (1 - k) + l * k for b, l in zip(c, lip)]
            dc = (((abs(p.x) - 0.042) / 0.018) ** 2 + ((p.z - (eye - 0.035)) / 0.014) ** 2)
            if dc < 1:
                k = (1 - dc) * 0.35
                c = [b * (1 - k) + l * k for b, l in zip(c, blush)]
        col.data[v.index].color = (*c, 1)
    m = bpy.data.materials.new('Skin')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.6
    me.materials.append(m)


def eye_mat(obj, cfg):
    """눈동자: 앞쪽(정면)일수록 갈색→검정, 나머지 흰자 (정점 색)"""
    me = obj.data
    col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    # 두 눈 각각의 중심
    xs = [v.co.x for v in me.vertices]
    for side in (1, -1):
        idx = [v.index for v in me.vertices if (v.co.x > 0) == (side > 0)]
        c = sum((me.vertices[i].co for i in idx), Vector()) / len(idx)
        for i in idx:
            d = (me.vertices[i].co - c).normalized()
            front = -d.y  # 정면은 -Y
            if front > 0.93:
                rgb = (0.02, 0.015, 0.01)
            elif front > 0.80:
                rgb = srgb_to_linear(cfg.get('iris', 0x4a2c1a))
            else:
                rgb = (0.85, 0.85, 0.83)
            col.data[i].color = (*rgb, 1)
    m = bpy.data.materials.new('Eye')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.2
    me.materials.append(m)
    del xs


def export(arm, cid):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, cid + '.glb')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_animations=True,
        export_animation_mode='ACTIONS',
        export_force_sampling=True,
        export_frame_step=1,
        export_apply=False,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_skins=True,
        export_morph=False,
    )
    return path


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    chars = json.load(open(os.path.join(os.path.dirname(__file__), 'characters.json')))
    for cid in argv or list(chars):
        arm, _ = build(chars[cid])
        print('EXPORTED', export(arm, cid))


if __name__ == '__main__':
    main()
