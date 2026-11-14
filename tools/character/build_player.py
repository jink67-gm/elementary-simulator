"""
플레이어(남학생) 모델 만들기 — 헤드리스 Blender.
  1) AI 생성 메시(SAM 3D)를 참고 이미지 실루엣에 맞춰 변형 + 참고 이미지를 정면에 입혀 텍스처 다시 굽기 (player_bake.py)
  2) 표면 다듬기(세분화·매끄럽게), 키 맞춤, 바닥에 세우기
  3) 뼈대·가중치·애니메이션 (player_rig.py — 다음 단계)
  4) GLB 내보내기

실행: python3 tools/character/build_player.py [--no-rig]
"""
import sys, os, json
import numpy as np
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import player_bake  # noqa: E402

SRC = os.path.join(ROOT, 'assets/source/ai/player_boy_sam3d.glb')
REF = os.path.join(ROOT, 'assets/concept/player_boy_front.png')
WORK = os.path.join(ROOT, 'assets/source/ai/player_boy')
HEIGHT = 1.42  # 초등 5~6학년 (게임 기준 학생 키 약 1.35~1.45m)


def main():
    os.makedirs(WORK, exist_ok=True)
    fit = json.load(open(os.path.join(WORK, 'fit.json')))
    ob, V = player_bake.bake(SRC, REF, fit, WORK)
    me = ob.data
    me.vertices.foreach_set('co', V.astype(np.float32).ravel())
    me.update()
    # 새 텍스처
    img = bpy.data.images.load(os.path.join(WORK, 'player_boy_basecolor.png'))
    img.pack()
    mat = bpy.data.materials.new('PlayerBoy')
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = img
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.82
    bsdf.inputs['Metallic'].default_value = 0.0
    me.materials.clear()
    me.materials.append(mat)
    # 표면 다듬기: 세분화 1단계(삼각형 약 6.5천 → 약 2.6만) 후 살짝 매끄럽게
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    # 생성 메시는 UV 이음매마다 꼭짓점이 갈라져 있다 → 먼저 붙여야 세분화할 때 틈·날개가 생기지 않는다
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(me)
    n0 = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    print('꼭짓점 붙이기', n0, '→', len(bm.verts))
    bm.to_mesh(me)
    bm.free()
    me.update()
    sub = ob.modifiers.new('sub', 'SUBSURF')
    sub.levels = 1
    sub.subdivision_type = 'CATMULL_CLARK'
    sub.uv_smooth = 'NONE'
    bpy.ops.object.modifier_apply(modifier='sub')
    bpy.ops.object.shade_smooth()
    # 키 맞춤 + 바닥
    co = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    k = HEIGHT / (co[:, 2].max() - co[:, 2].min())
    co *= k
    co[:, 2] -= co[:, 2].min()
    co[:, 0] -= (co[:, 0].min() + co[:, 0].max()) / 2
    me.vertices.foreach_set('co', co.ravel())
    me.update()
    ob.name = 'PlayerBoy'
    me.name = 'PlayerBoyMesh'
    me.calc_loop_triangles()
    print('삼각형', len(me.loop_triangles), '꼭짓점', len(me.vertices))
    if '--no-rig' not in sys.argv:
        import player_rig
        player_rig.rig_and_animate(ob, HEIGHT)
    out = os.path.join(WORK, 'player_boy_stage.glb' if '--no-rig' in sys.argv else 'player_boy_rigged.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=92, export_animations='--no-rig' not in sys.argv, export_yup=True, export_apply=False)
    print('저장', out, os.path.getsize(out) // 1024, 'KB')


if __name__ == '__main__':
    main()
