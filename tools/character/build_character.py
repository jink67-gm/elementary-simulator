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
OUT = os.path.join(ROOT, 'assets', 'source', 'procedural')  # 품질 확정 전에는 게임(public)에 넣지 않는다

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


# 세미리얼 스타일: 큰 눈·둥근 얼굴·짧은 목·살짝 웃는 입꼬리 (MakeHuman CC0 타깃)
STYLE_KID = {
    'eyes/l-eye-scale-incr': 0.75, 'eyes/r-eye-scale-incr': 0.75,
    'head/head-round': 0.35, 'head/head-age-decr': 0.6,
    'neck/neck-scale-vert-decr': 0.7,
    'mouth/mouth-angles-up': 0.9, 'mouth/mouth-scale-horiz-incr': 0.15,
    'nose/nose-scale-horiz-decr': 0.35, 'nose/nose-scale-vert-decr': 0.3,
    'cheek/l-cheek-bones-incr': 0.15, 'cheek/r-cheek-bones-incr': 0.15,
}
STYLE_ADULT = {
    'eyes/l-eye-scale-incr': 0.35, 'eyes/r-eye-scale-incr': 0.35,
    'head/head-round': 0.2, 'mouth/mouth-angles-up': 0.7, 'neck/neck-scale-vert-decr': 0.2,
}


def subtree(skel, root):
    kids = {}
    for n, b in skel['bones'].items():
        if b['parent']:
            kids.setdefault(b['parent'], []).append(n)
    out, stack = [], [root]
    while stack:
        n = stack.pop()
        out.append(n)
        stack.extend(kids.get(n, []))
    return out


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


def plane_cut(obj, co, no, region):
    """평면으로 자르고, 법선 반대쪽(그리고 region 안)의 면을 지운다 → 곧은 단면"""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    geom = [f for f in bm.faces if region(f.calc_center_median())]
    gset = set()
    for f in geom:
        gset.add(f)
        gset.update(f.verts)
        gset.update(f.edges)
    bmesh.ops.bisect_plane(bm, geom=list(gset), plane_co=co, plane_no=no, dist=1e-5)
    kill = [f for f in bm.faces if region(f.calc_center_median()) and (f.calc_center_median() - co).dot(no) < 0]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(obj.data)
    bm.free()


def fold_collar(obj, cy, neck_cut, r_ring, hem):
    """목을 감싼 옷 정점을 매끈한 타원 고리 위로 모은다 → 깔끔한 라운드 넥"""
    me = obj.data
    for v in me.vertices:
        p = v.co
        if p.z < hem + 0.25 or abs(p.x) > 0.13:
            continue
        dx, dy = p.x, p.y - cy
        a = math.atan2(dy, dx)
        front = max(0.0, -math.sin(a))
        zr = neck_cut - 0.02 * front ** 1.5
        rr = r_ring * (1.0 + 0.08 * front)
        dist = math.hypot(dx, dy)
        if p.z > zr and dist < rr + 0.02:
            p.x = math.cos(a) * rr
            p.y = cy + math.sin(a) * rr
            p.z = zr


def snap_boundary(obj, where, z_of):
    """열린 가장자리(밑단·바짓단·앞머리) 정점을 매끈한 선 위로 옮긴다"""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for v in bm.verts:
        if v.is_boundary and where(v.co):
            v.co.z = z_of(v.co)
    bm.to_mesh(obj.data)
    bm.free()


def inflate_fn(obj, fn):
    me = obj.data
    me.update()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * fn(v.co)
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
    targets = dict(STYLE_KID if cfg.get('age', 'kid') == 'kid' else STYLE_ADULT)
    targets.update(cfg['targets'])
    for t, w in targets.items():
        apply_target(verts, os.path.join(MH, 'targets', t + '.target'), w)

    skel = json.load(open(os.path.join(MH, 'rigs', 'default.mhskel')))
    weights = json.load(open(os.path.join(MH, 'rigs', 'default_weights.mhw')))['weights']

    # 세미리얼 아이 비율: 머리(얼굴뼈 포함)를 목 위에서 키운다. 눈·머리카락 보조 메시도 함께 커진다.
    hs = cfg.get('head_scale', 1.12 if cfg.get('age', 'kid') == 'kid' else 1.04)
    if hs != 1:
        head_bones = subtree(skel, 'head')
        wsum = [0.0] * len(verts)
        for b in head_bones:
            for vi, w in weights.get(b, []):
                wsum[vi] += w
        ids = skel['joints']['head____head']
        piv = sum((verts[i] for i in ids), Vector()) / len(ids)
        for i, w in enumerate(wsum):
            if w > 0:
                w = min(1.0, w)
                verts[i] = piv + (verts[i] - piv) * (1 + (hs - 1) * w)

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
        mouth=(B['oris05'].tail_local.z + B['oris01'].tail_local.z) / 2,
        mouth_y=B['oris05'].tail_local.y,
        corner=B['oris07.L'].tail_local.x + 0.004,
    )
    smile(bverts, L, cfg.get('smile', 1.0))
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
    neck_r = look.get('neck_r', 0.075)

    def in_neck(v):
        p = bverts[v]
        return p.z > L['neck'] + 0.012 or (p.z > neck_cut and ((p.x) ** 2 + (p.y - neck_c.y) ** 2) ** 0.5 < neck_r)

    def is_top(vids):
        # 목 부분도 일단 포함 → 아래에서 목둘레 고리로 접어 넣는다
        if any(bverts[v].z > L['neck'] + 0.04 for v in vids) or any(HAND(dom.get(v)) for v in vids):
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
        # 목둘레 안으로 들여다보이는 살은 남긴다
        cyb = B['neck01'].head_local.y
        if max(z) > neck_cut - 0.07 and all(math.hypot(bverts[v].x, bverts[v].y - cyb) < 0.105 for v in vids):
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
        skin(o, used, weights, arm)  # 자르기 전에 가중치를 붙여야 정점과 함께 따라간다
        knee = B['lowerleg01.L'].head_local.z
        chest = B['spine02'].head_local.z
        if key == 'top':
            cy = B['neck01'].head_local.y
            # 밑단: 수평면으로 자르기 (팔 부분은 제외)
            plane_cut(o, Vector((0, 0, hem - 0.01)), Vector((0, 0, 1)), lambda c: abs(c.x) < 0.14)
            # 목둘레: 앞이 낮은 기울어진 평면으로, 목 근처만 자르기
            tilt = math.radians(look.get('collar_tilt', 12))
            plane_cut(o, Vector((0, cy, neck_cut)), Vector((0, math.sin(tilt), -math.cos(tilt))),
                      lambda c: math.hypot(c.x, c.y - cy) < look.get('collar_r', 0.125) and c.z > hem + 0.25)
        elif key == 'bottom':
            plane_cut(o, Vector((0, 0, cuff)), Vector((0, 0, 1)), lambda c: True)
            plane_cut(o, Vector((0, 0, hem + 0.035)), Vector((0, 0, -1)), lambda c: True)
        if key == 'top':
            # 넉넉한 맨투맨: 몸통 아래쪽일수록 여유, 소매는 덜
            def amt(co, t=spec.get('thickness', 0.012)):
                arm_ = abs(co.x) > 0.13
                return t + (0.004 if arm_ else 0.012 * max(0.0, min(1.0, (chest - co.z) / 0.25)))
        elif key == 'bottom':
            # 일자 바지: 무릎 아래를 조금씩 더 부풀려 종아리 모양을 지운다
            def amt(co, t=spec.get('thickness', 0.008)):
                return t + (spec.get('straight', 0.05) * max(0.0, min(0.16, knee - co.z)))
        else:
            def amt(co, t=spec.get('thickness', 0.012)):
                return t
        inflate_fn(o, amt)
        o.data.materials.append(material(name, spec['color'], spec.get('rough', 0.85)))
        parts.append(o)

    if 'skirt' in cfg['clothes']:
        spec = cfg['clothes']['skirt']
        o, used = make_mesh('Skirt', bverts, uvs, faces, {'helper-skirt'})
        skin(o, used, weights, arm)
        plane_cut(o, Vector((0, 0, B['lowerleg01.L'].head_local.z + spec.get('above_knee', 0.06))), Vector((0, 0, 1)), lambda c: True)
        inflate(o, spec.get('thickness', 0.01))
        o.data.materials.append(material('Skirt', spec['color'], spec.get('rough', 0.8)))
        parts.append(o)
    hair = make_hair(bverts, uvs, faces, L, cfg)
    hair_used = hair[1]
    skin(hair[0], hair_used, weights, arm)
    parts.append(hair[0])
    if cfg.get('hair_style', 'short') != 'buzz':
        fr_ = make_fringe(body, L, cfg)
        attach_rigid(fr_, arm, 'head')
        parts.append(fr_)
    top_obj = next(o for o in parts if o.name == 'Top')
    col_ = make_collar_from_edge(top_obj, arm, L, cfg, hem)
    if col_:
        attach_rigid(col_, arm, 'spine01')
        parts.append(col_)
    brows = make_brows(body, L, cfg)
    brows.parent = arm
    vg = brows.vertex_groups.new(name='head')
    vg.add(list(range(len(brows.data.vertices))), 1.0, 'REPLACE')
    bm_ = brows.modifiers.new('Armature', 'ARMATURE')
    bm_.object = arm
    parts.append(brows)

    if cfg.get('glasses'):
        g = make_glasses(arm, L, cfg)
        parts.append(g)
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


def smile(bverts, L, amount):
    """입꼬리·볼을 살짝 올려 웃는 얼굴로 (몸 정점만, 뼈는 그대로)"""
    if amount <= 0:
        return
    for i in range(13380):
        p = bverts[i]
        if p.y > L['mouth_y'] + 0.05 or abs(p.z - L['mouth']) > 0.05:
            continue
        # 입꼬리
        dx = (abs(p.x) - L['corner']) / 0.012
        dz = (p.z - L['mouth']) / 0.010
        g = math.exp(-(dx * dx + dz * dz))
        # 볼 (입꼬리 바깥 위)
        cx = (abs(p.x) - (L['corner'] + 0.018)) / 0.016
        cz = (p.z - (L['mouth'] + 0.018)) / 0.014
        gc = math.exp(-(cx * cx + cz * cz))
        p.z += amount * (0.0032 * g + 0.0014 * gc)
        p.y += amount * (0.0012 * g - 0.0010 * gc)
        p.x += amount * 0.0012 * g * (1 if p.x > 0 else -1)


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
        if fr > 0.55:   # 이마: 머리선 (앞머리는 아래에서 따로 내림)
            line = eye + (0.05 if style not in ('bob', 'long') else 0.042)
        elif fr > -0.2:  # 옆머리: 귀 위
            line = eye + (0.01 if style in ('short', 'spiky', 'buzz') else -0.06)
            if style in ('short', 'spiky', 'buzz') and side > 0.055 and fr < 0.4:
                line = eye + 0.025
        else:            # 뒷머리
            line = {'buzz': eye - 0.03, 'short': eye - 0.055, 'spiky': eye - 0.05, 'bob': eye - 0.11, 'long': eye - 0.12}[style]
        if style == 'long' and fr < -0.25 and abs(p.x) < 0.085 and p.z > L['neck'] - 0.17:
            return True
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
        amt = vol * (0.45 + 1.1 * h)
        if style == 'buzz':
            amt = 0.004
        if style == 'long' and v.co.z < L['neck'] + 0.03:
            amt = 0.022 + 0.004 * rnd.random()
        if style == 'spiky':
            amt += rnd.random() * 0.012 * h
        else:
            amt += rnd.random() * 0.002
        v.co += v.normal * amt
    # 앞머리: 이마 쪽 머리를 앞으로 내려 이마를 덮는다 (시안처럼)
    bang = cfg.get('bangs', 0.03 if style in ('short', 'bob', 'long') else 0.012)
    for v in bm.verts:
        fr = head_frame(v.co, L)
        if fr > 0.35 and style != 'buzz':
            k = min(1.0, (fr - 0.35) / 0.45) * max(0.0, min(1.0, (eye + 0.11 - v.co.z) / 0.06))
            v.co.z -= bang * k
            v.co.y -= 0.012 * k
    # 앞머리 끝을 눈썹 위 둥근 선에 맞춘다
    if style != 'buzz':
        for v in bm.verts:
            if v.is_boundary and head_frame(v.co, L) > 0.3 and v.co.z < eye + 0.09:
                v.co.z = eye + cfg.get('fringe', 0.03) + 0.012 * (abs(v.co.x) / 0.06) ** 2
    # 머리카락 가장자리(앞머리 끝) 지그재그 다듬기
    for _ in range(10):
        new = {}
        for v in bm.verts:
            if not v.is_boundary:
                continue
            nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(nb) == 2:
                new[v] = v.co * 0.5 + (nb[0].co + nb[1].co) * 0.25
        for v, co in new.items():
            v.co = co
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


def make_glasses(arm, L, cfg):
    """둥근 안경: 고리 두 개 + 코다리 (관 모양 메시). 머리뼈를 따라 움직인다."""
    eye_l = arm.data.bones['eye.L'].head_local
    R, r = cfg.get('glasses_r', 0.019), 0.0018
    verts, faces = [], []

    def torus(center):
        base = len(verts)
        n, m = 24, 6
        for i in range(n):
            a = 2 * math.pi * i / n
            ca, sa = math.cos(a), math.sin(a)
            for j in range(m):
                b = 2 * math.pi * j / m
                rr = R + r * math.cos(b)
                verts.append(center + Vector((ca * rr, r * math.sin(b), sa * rr)))
        for i in range(n):
            for j in range(m):
                a0 = base + i * m + j
                faces.append([a0, base + i * m + (j + 1) % m, base + ((i + 1) % n) * m + (j + 1) % m, base + ((i + 1) % n) * m + j])

    y = eye_l.y - 0.03
    for side in (1, -1):
        torus(Vector((side * abs(eye_l.x) * 1.02, y, eye_l.z - 0.001)))
    # 코다리
    base = len(verts)
    gap = abs(eye_l.x) * 1.02 - R
    for x in (-gap, gap):
        for dy, dz in ((-r, -r), (r, -r), (r, r), (-r, r)):
            verts.append(Vector((x, y + dy, eye_l.z + 0.004 + dz)))
    for k in range(4):
        faces.append([base + k, base + (k + 1) % 4, base + 4 + (k + 1) % 4, base + 4 + k])
    me = bpy.data.meshes.new('Glasses')
    me.from_pydata(verts, [], faces)
    me.update()
    for p in me.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new('Glasses', me)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material('Glasses', cfg.get('glasses_color', 0x3a3a3a), 0.35))
    attach_rigid(obj, arm, 'head')
    return obj


def attach_rigid(obj, arm, bone):
    obj.parent = arm
    vg = obj.vertex_groups.new(name=bone)
    vg.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    m = obj.modifiers.new('Armature', 'ARMATURE')
    m.object = arm


def apply_solidify(obj, thickness, offset=-1.0):
    sol = obj.modifiers.new('Solidify', 'SOLIDIFY')
    sol.thickness = thickness
    sol.offset = offset
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier='Solidify')
    obj.select_set(False)


def make_fringe(body, L, cfg):
    """앞머리: 이마 표면을 따라 덮는 매끈한 판 (아래 끝이 둥근 선)"""
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    eye = L['eye']
    nx, nz = 16, 6
    half = cfg.get('fringe_half', 0.064)
    verts, faces = [], []
    for j in range(nz + 1):
        for i in range(nx + 1):
            x = -half + 2 * half * i / nx
            bottom = eye + cfg.get('fringe', 0.03) + 0.014 * (abs(x) / half) ** 2
            z = bottom + (eye + 0.082 - bottom) * j / nz
            hit = tree.ray_cast(Vector((x, L['head_y'] - 0.3, z)), Vector((0, 1, 0)))
            p, n = hit[0], hit[1]
            if p is None:
                p, n = Vector((x, L['head_y'] - 0.09, z)), Vector((0, -1, 0))
            verts.append(p + n * (0.006 + 0.012 * (j / nz)))
    for j in range(nz):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append([a, a + 1, a + nx + 2, a + nx + 1])
    me = bpy.data.meshes.new('Fringe')
    me.from_pydata(verts, [], faces)
    me.update()
    for poly in me.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new('Fringe', me)
    bpy.context.scene.collection.objects.link(obj)
    apply_solidify(obj, 0.005, 0.0)
    obj.data.materials.append(material('Hair', cfg['hair'], 0.5))
    return obj


def make_collar_from_edge(top, arm, L, cfg, hem):
    """상의 목둘레(평면으로 자른 곧은 가장자리)를 따라 말린 시보리 띠"""
    cy = arm.data.bones['neck01'].head_local.y
    bm = bmesh.new()
    bm.from_mesh(top.data)
    edge = [v.co.copy() for v in bm.verts if v.is_boundary and v.co.z > hem + 0.25 and math.hypot(v.co.x, v.co.y - cy) < 0.13]
    bm.free()
    if len(edge) < 8:
        return None
    edge.sort(key=lambda p: math.atan2(p.y - cy, p.x))
    out = bmesh.new()
    rows = []
    for p in edge:
        d = Vector((p.x, p.y - cy, 0)).normalized()
        rows.append((out.verts.new(p + d * 0.002 + Vector((0, 0, 0.004))), out.verts.new(p + d * 0.007 - Vector((0, 0, 0.004)))))
    for i in range(len(rows)):
        a0, b0 = rows[i]
        a1, b1 = rows[(i + 1) % len(rows)]
        try:
            out.faces.new((a0, a1, b1, b0))
        except ValueError:
            pass
    mesh = bpy.data.meshes.new('Collar')
    out.to_mesh(mesh)
    out.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new('Collar', mesh)
    bpy.context.scene.collection.objects.link(obj)
    apply_solidify(obj, 0.005)
    c = cfg['clothes']['top']['color']
    dark = (((c >> 16) & 255) * 88 // 100 << 16) | (((c >> 8) & 255) * 88 // 100 << 8) | ((c & 255) * 88 // 100)
    obj.data.materials.append(material('Collar', dark, 0.9))
    return obj


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
            mz = L['mouth'] + 0.0025 * (abs(p.x) / L['corner']) ** 2  # 입꼬리 쪽이 살짝 올라감
            dl = ((abs(p.x) / (L['corner'] - 0.002)) ** 2 + ((p.z - mz) / 0.0058) ** 2)
            if dl < 1:
                k = (1 - dl) ** 0.6 * 0.75
                c = [b * (1 - k) + l * k for b, l in zip(c, lip)]
            dc = (((abs(p.x) - (L['corner'] + 0.024)) / 0.016) ** 2 + ((p.z - (L['mouth'] + 0.03)) / 0.013) ** 2)
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
            if front > 0.92:
                rgb = (0.02, 0.015, 0.01)
            elif front > 0.74:
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
