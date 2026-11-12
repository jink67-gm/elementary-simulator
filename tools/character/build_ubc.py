"""
Quaternius 'Universal Base Characters'(무료 Standard, 팩 안 License.txt: CC0 / 사이트: QAL v1.0)를
초등학생 비율로 바꾸고 옷·머리를 입혀 GLB로 내보낸다 (헤드리스 Blender).
원본 팩은 저장소에 넣지 않는다(재배포 금지 조건 대비). 경로를 인자로 받는다.

실행: <bpy python> tools/character/build_ubc.py <팩 폴더> <설정 id> <출력.glb>
동작(걷기 등)은 같은 뼈대의 Universal Animation Library 클립을 게임에서 그대로 쓴다.
"""
import bpy
import bmesh
import json
import math
import os
import sys
from mathutils import Vector

HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)
from build_character import plane_cut, material, srgb_to_linear  # noqa: E402


# 아이 비율: (굵기 x, 길이 y, 굵기 z)  — 뼈 로컬 축 기준
KID_SCALE = {
    'Head': (1.3, 1.3, 1.3),
    'neck_01': (0.85, 0.75, 0.85),
    'spine_01': (0.84, 0.9, 0.84), 'spine_02': (0.84, 0.9, 0.84), 'spine_03': (0.82, 0.88, 0.82),
    'pelvis': (0.85, 0.9, 0.85),
    'clavicle_l': (0.85, 0.78, 0.85), 'clavicle_r': (0.85, 0.78, 0.85),
    'upperarm_l': (0.72, 0.86, 0.72), 'upperarm_r': (0.72, 0.86, 0.72),
    'lowerarm_l': (0.76, 0.86, 0.76), 'lowerarm_r': (0.76, 0.86, 0.76),
    'hand_l': (0.86, 0.86, 0.86), 'hand_r': (0.86, 0.86, 0.86),
    'thigh_l': (0.78, 0.84, 0.78), 'thigh_r': (0.78, 0.84, 0.78),
    'calf_l': (0.8, 0.86, 0.8), 'calf_r': (0.8, 0.86, 0.8),
    'foot_l': (0.88, 0.88, 0.88), 'foot_r': (0.88, 0.88, 0.88),
}


def objs_of(type_):
    return [o for o in bpy.context.scene.objects if o.type == type_]


def import_base(pack, sex):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    name = 'Superhero_Male_FullBody' if sex == 'm' else 'Superhero_Female_FullBody'
    bpy.ops.import_scene.gltf(filepath=os.path.join(pack, 'Base Characters', 'Godot - UE', name + '.gltf'))
    arm = objs_of('ARMATURE')[0]
    meshes = objs_of('MESH')
    body = max(meshes, key=lambda o: len(o.data.vertices))
    return arm, body, meshes


def add_rigid(obj, arm, bone):
    """머리카락 같은 별도 메시를 머리뼈에 100% 붙인다"""
    mw = obj.matrix_world.copy()
    obj.parent = arm
    obj.matrix_world = mw
    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)
    vg = obj.vertex_groups.new(name=bone)
    vg.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    if not any(m.type == 'ARMATURE' for m in obj.modifiers):
        m = obj.modifiers.new('Armature', 'ARMATURE')
        m.object = arm


def import_hair(pack, fname, arm):
    if not fname:
        return None
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(pack, 'Hairstyles', 'Origin at 0', 'glTF (Godot)', fname + '.gltf'))
    new = [o for o in bpy.context.scene.objects if o not in before]
    mesh = [o for o in new if o.type == 'MESH']
    for o in new:
        if o.type != 'MESH':
            continue
    for o in mesh:
        o.parent = None
    for o in new:
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    for o in mesh:
        add_rigid(o, arm, 'Head')
    return mesh


def apply_pose_as_rest(arm):
    """지금 포즈(비율 조정)를 메시에 굽고, 뼈대의 쉬는 자세로 만든다"""
    for o in objs_of('MESH'):
        if not any(m.type == 'ARMATURE' for m in o.modifiers):
            continue
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers):
            if m.type == 'ARMATURE':
                bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='SELECT')
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in objs_of('MESH'):
        if o.parent == arm and not any(m.type == 'ARMATURE' for m in o.modifiers):
            m = o.modifiers.new('Armature', 'ARMATURE')
            m.object = arm


ADULT_SCALE = {
    'Head': (1.08, 1.08, 1.08),
    'upperarm_l': (0.85, 1, 0.85), 'upperarm_r': (0.85, 1, 0.85), 'lowerarm_l': (0.88, 1, 0.88), 'lowerarm_r': (0.88, 1, 0.88),
    'thigh_l': (0.88, 1, 0.88), 'thigh_r': (0.88, 1, 0.88), 'calf_l': (0.9, 1, 0.9), 'calf_r': (0.9, 1, 0.9),
    'spine_02': (0.92, 1, 0.92), 'spine_03': (0.9, 1, 0.9),
}


def flatten_chest(body, amount):
    """초등학생 체형: 가슴 볼륨을 몸통 평면 쪽으로 눌러 평평하게"""
    if amount <= 0:
        return
    w = group_weight(body, ['spine_03'])
    mw = body.matrix_world
    inv = mw.inverted()
    pts = [mw @ v.co for v in body.data.vertices]
    sel = [i for i, x in enumerate(w) if x > 0.35]
    if not sel:
        return
    zs = sorted(pts[i].z for i in sel)
    z0, z1 = zs[len(zs) // 5], zs[len(zs) * 4 // 5]
    front = [pts[i] for i in sel if pts[i].y < 0]
    if not front:
        return
    base_y = sorted(p.y for p in front)[len(front) * 2 // 3]  # 몸통 앞면의 대략적인 평면
    for i in sel:
        p = pts[i]
        if p.y < base_y and z0 < p.z < z1:
            p.y = base_y + (p.y - base_y) * (1 - amount)
            body.data.vertices[i].co = inv @ p


def kidify(arm, table=None):
    for b in arm.data.bones:
        b.inherit_scale = 'NONE'
    for pb in arm.pose.bones:
        s = (table or KID_SCALE).get(pb.name)
        if s:
            pb.scale = s
    bpy.context.view_layer.update()
    apply_pose_as_rest(arm)
    for b in arm.data.bones:
        b.inherit_scale = 'FULL'


def world_height(o):
    zs = [(o.matrix_world @ v.co).z for v in o.data.vertices]
    return min(zs), max(zs)


def scale_to(arm, body, height):
    z0, z1 = world_height(body)
    k = height / (z1 - z0)
    arm.scale = arm.scale * k
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True)
    for o in objs_of('MESH'):
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return k


def group_weight(obj, names):
    idx = {g.index for g in obj.vertex_groups if g.name in names}
    out = []
    for v in obj.data.vertices:
        out.append(sum(g.weight for g in v.groups if g.group in idx))
    return out


def smooth_region(obj, names, factor, iters):
    """근육 굴곡 줄이기: 정해진 뼈 영역만 부드럽게"""
    w = group_weight(obj, names)
    vg = obj.vertex_groups.new(name='_smooth')
    for i, x in enumerate(w):
        if x > 0.05:
            vg.add([i], min(1.0, x), 'REPLACE')
    m = obj.modifiers.new('Smooth', 'SMOOTH')
    m.factor = factor
    m.iterations = iters
    m.vertex_group = '_smooth'
    # 모디파이어 순서: 스무스를 아마추어보다 먼저
    bpy.context.view_layer.objects.active = obj
    while obj.modifiers.find('Smooth') > 0:
        bpy.ops.object.modifier_move_up(modifier='Smooth')
    bpy.ops.object.modifier_apply(modifier='Smooth')
    g = obj.vertex_groups.get('_smooth')
    if g:
        obj.vertex_groups.remove(g)


def clothing(body, arm, name, keep_bones, color, thickness, cuts, smooth=(1.0, 12)):
    """몸 메시를 복제해 옷 조각을 만든다 (가중치·UV가 그대로 따라옴)"""
    o = body.copy()
    o.data = body.data.copy()
    o.name = name
    bpy.context.scene.collection.objects.link(o)
    w = group_weight(o, keep_bones)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.verts.ensure_lookup_table()
    kill = [f for f in bm.faces if sum(w[v.index] for v in f.verts) / len(f.verts) < 0.3]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(o.data)
    bm.free()
    for co, no, region in cuts:
        plane_cut(o, co, no, region)
    # 옷감처럼 굴곡을 펴고 부풀린다
    m = o.modifiers.new('Smooth', 'SMOOTH')
    m.factor, m.iterations = smooth
    bpy.context.view_layer.objects.active = o
    while o.modifiers.find('Smooth') > 0:
        bpy.ops.object.modifier_move_up(modifier='Smooth')
    bpy.ops.object.modifier_apply(modifier='Smooth')
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * thickness(v.co)
    bm.to_mesh(o.data)
    bm.free()
    o.data.materials.clear()
    o.data.materials.append(material(name, color, 0.85))
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def tint_textures(obj, rgb_hex):
    """흑백 머리카락 텍스처에 색을 곱해 새 이미지로 굽는다 (원본 팩은 셰이더로 색을 입히는 구조)"""
    import numpy as np
    col = srgb_to_linear(rgb_hex)
    for slot in obj.material_slots:
        mt = slot.material
        if not mt or not mt.use_nodes:
            continue
        for n in mt.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image and 'BaseColor' in n.image.name:
                src = n.image
                w, h = src.size
                px = np.empty(w * h * 4, dtype=np.float32)
                src.pixels.foreach_get(px)
                px = px.reshape(-1, 4)
                px[:, 0] *= col[0] * 1.6
                px[:, 1] *= col[1] * 1.6
                px[:, 2] *= col[2] * 1.6
                img = bpy.data.images.new(src.name + '_tint', w, h, alpha=True)
                img.pixels.foreach_set(np.clip(px, 0, 1).ravel())
                img.file_format = 'PNG'
                img.pack()
                n.image = img


def hide_under(body, bones, zmin, zmax, margin=0.015, extra=None):
    """옷 안쪽으로 완전히 가려지는 몸 면을 지운다 (살이 옷을 뚫고 나오지 않게)"""
    w = group_weight(body, bones)
    mw = body.matrix_world
    bm = bmesh.new()
    bm.from_mesh(body.data)
    kill = []
    for f in bm.faces:
        if sum(w[v.index] for v in f.verts) / len(f.verts) < 0.7:
            continue
        zs = [(mw @ v.co).z for v in f.verts]
        if min(zs) > zmin + margin and max(zs) < zmax - margin and (extra is None or extra(f, mw)):
            kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(body.data)
    bm.free()


def classify(p, hand_w, L):
    """3D 위치(쉬는 자세)로 피부/상의/하의/신발 판정"""
    if hand_w > 0.5:
        return 'skin'
    if p.z < L['ankle']:
        return 'shoes'
    if p.z <= L['hem']:
        return 'bottom'
    # 팔(T자세): 손목 앞까지 소매
    if abs(p.x) > L['wrist_x']:
        return 'skin'
    # 목둘레(앞이 낮은 라운드넥)
    r = math.hypot(p.x, p.y - L['cy'])
    line = L['neck'] - 0.015 + (p.y - L['cy']) * math.tan(math.radians(20))
    if p.z > L['neck'] + 0.01 or (r < 0.07 and p.z > line):
        return 'skin'
    return 'top'


def paint_clothes(body, cfg, L):
    """몸 텍스처 위에 옷을 직접 그리고(경계는 픽셀마다 3D 위치로 판정), 옷 부분 정점을 살짝 부풀린다"""
    import numpy as np
    me = body.data
    mw = body.matrix_world
    hand_idx = {g.index for g in body.vertex_groups if g.name.startswith(('hand_', 'index', 'middle', 'ring', 'pinky', 'thumb'))}
    P = np.array([list(mw @ v.co) for v in me.vertices], dtype=np.float32)
    HW = np.array([sum(g.weight for g in v.groups if g.group in hand_idx) for v in me.vertices], dtype=np.float32)
    # 원본 피부 텍스처
    mat = body.material_slots[0].material
    tex = next(n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image and 'Superhero' in n.image.name and 'Normal' not in n.image.name and 'Rough' not in n.image.name)
    src = tex.image
    W, H = src.size
    img = np.empty(W * H * 4, dtype=np.float32)
    src.pixels.foreach_get(img)
    img = img.reshape(H, W, 4)
    lum = (img[..., 0] * 0.3 + img[..., 1] * 0.59 + img[..., 2] * 0.11)
    out = img.copy()
    colors = {k: np.array(srgb_to_linear(cfg['clothes'][k]) if k in cfg['clothes'] else (0.9, 0.9, 0.9), dtype=np.float32) for k in ('top', 'bottom', 'shoes')}
    rng = np.random.default_rng(3)
    me.calc_loop_triangles()
    uv = me.uv_layers.active.data
    from mathutils import Vector as V
    for tri in me.loop_triangles:
        vids = tri.vertices
        uvs = np.array([uv[l].uv[:] for l in tri.loops], dtype=np.float32) * [W, H]
        x0, y0 = np.floor(uvs.min(0)).astype(int)
        x1, y1 = np.ceil(uvs.max(0)).astype(int)
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, W - 1), min(y1, H - 1)
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        a, b, c = uvs
        den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(den) < 1e-9:
            continue
        w0 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / den
        w1 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / den
        w2 = 1 - w0 - w1
        inside = (w0 >= -0.01) & (w1 >= -0.01) & (w2 >= -0.01)
        if not inside.any():
            continue
        pv = P[list(vids)]
        hv = HW[list(vids)]
        iy, ix = np.nonzero(inside)
        for yy, xx in zip(iy, ix):
            ww = (w0[yy, xx], w1[yy, xx], w2[yy, xx])
            p = V((pv[0] * ww[0] + pv[1] * ww[1] + pv[2] * ww[2]).tolist())
            k = classify(p, hv[0] * ww[0] + hv[1] * ww[1] + hv[2] * ww[2], L)
            if k == 'skin':
                continue
            py, px = y0 + yy, x0 + xx
            shade = 0.86 + 0.22 * min(1.0, lum[py, px] / 0.45)
            out[py, px, :3] = np.clip(colors[k] * shade * (1 + rng.normal(0, 0.03)), 0, 1)
    # 피부 톤: 조금 밝고 따뜻하게 (옷이 아닌 픽셀)
    skin_mask = np.all(out[..., :3] == img[..., :3], axis=-1)
    tone = np.array(cfg.get('skin_gain', (1.16, 1.1, 1.05)), dtype=np.float32)
    out[skin_mask, :3] = np.clip(out[skin_mask, :3] * tone + 0.02, 0, 1)
    res = bpy.data.images.new('T_Kid_' + cfg.get('id', 'char'), W, H, alpha=True)
    res.pixels.foreach_set(out.ravel())
    res.file_format = 'PNG'
    res.pack()
    tex.image = res
    # 옷 부분을 살짝 부풀리기 (정점 기준)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    inv = mw.inverted()
    for v in bm.verts:
        p = mw @ v.co
        k = classify(p, HW[v.index], L)
        amt = {'top': 0.008, 'bottom': 0.006 + 0.03 * max(0.0, min(0.12, L['calf'] - p.z)), 'shoes': 0.01}.get(k, 0)
        if amt:
            v.co += v.normal * amt
    bm.to_mesh(me)
    bm.free()


def lighten_skin(body, pack, skin):
    """피부 텍스처를 밝은 버전으로, 근육 그림자를 만드는 노멀맵은 끊는다"""
    for slot in body.material_slots:
        mt = slot.material
        if not mt or not mt.use_nodes:
            continue
        nt = mt.node_tree
        for n in list(nt.nodes):
            if n.type == 'NORMAL_MAP':
                nt.nodes.remove(n)
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf:
            # 속옷 부분이 반짝이게 만든 거칠기·금속 맵을 끊고 천·피부처럼 고르게
            for key in ('Roughness', 'Metallic'):
                for l in list(bsdf.inputs[key].links):
                    nt.links.remove(l)
            bsdf.inputs['Roughness'].default_value = 0.78
            bsdf.inputs['Metallic'].default_value = 0.0
        if skin == 'light':
            for n in nt.nodes:
                if n.type == 'TEX_IMAGE' and n.image and 'Dark' in n.image.name and 'Superhero' in n.image.name:
                    fn = 'T_Superhero_Male_Ligh.png' if 'Male' in n.image.name else 'T_Superhero_Female_Light_BaseColor.png'
                    p = os.path.join(pack, 'Base Characters', 'Textures', fn)
                    if os.path.exists(p):
                        n.image = bpy.data.images.load(p)


def build(pack, cfg):
    arm, body, meshes = import_base(pack, cfg.get('sex', 'm'))
    for o in meshes:
        if o != body and len(o.data.vertices) > 600 and cfg.get('hide_brows'):
            pass
    hair = import_hair(pack, cfg.get('hair'), arm)
    kidify(arm, ADULT_SCALE if cfg.get('age') == 'adult' else KID_SCALE)
    scale_to(arm, body, cfg.get('height', 1.45))
    lighten_skin(body, pack, cfg.get('skin', 'light'))
    if cfg.get('sex') == 'f':
        flatten_chest(body, 0.85 if cfg.get('age') != 'adult' else 0.3)
    smooth_region(body, ['spine_01', 'spine_02', 'spine_03', 'pelvis', 'upperarm_l', 'upperarm_r', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'clavicle_l', 'clavicle_r'], 0.6, 6)

    B = {b.name: b for b in arm.data.bones}
    mw = arm.matrix_world

    def wpos(n, end='head'):
        return mw @ getattr(B[n], end + '_local')

    L = dict(
        hem=wpos('pelvis').z + cfg.get('hem', 0.03),
        neck=wpos('neck_01').z,
        cy=wpos('neck_01').y,
        ankle=wpos('foot_l').z + 0.06,
        wrist_x=abs(wpos('hand_l').x) - 0.03,
        calf=wpos('calf_l').z,
    )
    paint_clothes(body, cfg, L)
    # 머리카락·눈썹 색
    hc = cfg.get('hair_color', 0x1b1714)
    brows = [o for o in meshes if o != body and any(s_.material and 'Hair' in s_.material.name for s_ in o.material_slots)]
    for o in (hair or []) + brows:
        tint_textures(o, hc)
    for o in brows:
        me_ = o.data
        mwb = o.matrix_world
        pts = [mwb @ v.co for v in me_.vertices]
        for side in (1, -1):
            ids = [i for i, p in enumerate(pts) if p.x * side > 0]
            if not ids:
                continue
            cz = sum(pts[i].z for i in ids) / len(ids)
            inv_ = mwb.inverted()
            for i in ids:
                p = pts[i].copy()
                p.z = cz + (p.z - cz) * cfg.get('brow_thin', 0.6)
                me_.vertices[i].co = inv_ @ p
    return arm


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    pack, cid, out = argv
    cfg = json.load(open(os.path.join(HERE, 'ubc_characters.json')))[cid]
    build(pack, cfg)
    # 학교 노트북용: 텍스처 1024px 이하, WebP
    for img in bpy.data.images:
        if img.size[0] > 1024 or img.size[1] > 1024:
            img.scale(min(1024, img.size[0]), min(1024, img.size[1]))
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_animations=False,
                              export_skins=True, export_yup=True, export_image_format='WEBP')
    print('EXPORTED', out)


if __name__ == '__main__':
    main()
