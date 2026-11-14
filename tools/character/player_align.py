"""
플레이어 모델 1단계: AI 생성 메시(SAM 3D)와 참고 이미지(정면)의 정렬 확인.
메시를 정면 직교 투영해 실루엣을 만들고, 참고 이미지의 인물 영역과 맞춘 뒤 겹침 정도(IoU)와 겹쳐 본 그림을 저장한다.
실행: python3 tools/character/player_align.py <입력.glb> <참고.png> <출력 폴더>
"""
import sys, os, json
import numpy as np
from PIL import Image
import bpy

def load_mesh(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for o in bpy.context.scene.objects:
        o.select_set(o.type == 'MESH')
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    me = ob.data
    me.calc_loop_triangles()
    V = np.array([v.co[:] for v in me.vertices], dtype=np.float64)       # Blender: x 오른쪽, y 뒤(+)/앞(-), z 위
    T = np.array([t.vertices[:] for t in me.loop_triangles], dtype=np.int64)
    TL = np.array([t.loops[:] for t in me.loop_triangles], dtype=np.int64)
    uvl = me.uv_layers.active.data
    UV = np.array([uvl[i].uv[:] for i in range(len(uvl))], dtype=np.float64)
    return ob, V, T, TL, UV

def raster_front(V, T, W, H, sx, ox, sz, oz):
    """정면 직교 투영 깊이 지도. 화면 x = sx*X + ox, 화면 y = oz - sz*Z. 깊이 = -Y(앞일수록 큼)."""
    depth = np.full((H, W), -1e9)
    px = V[:, 0] * sx + ox
    py = oz - V[:, 2] * sz
    d = -V[:, 1]
    for a, b, c in T:
        xs = np.array([px[a], px[b], px[c]]); ys = np.array([py[a], py[b], py[c]]); ds = np.array([d[a], d[b], d[c]])
        x0, x1 = int(max(0, np.floor(xs.min()))), int(min(W - 1, np.ceil(xs.max())))
        y0, y1 = int(max(0, np.floor(ys.min()))), int(min(H - 1, np.ceil(ys.max())))
        if x1 < x0 or y1 < y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        den = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
        if abs(den) < 1e-12:
            continue
        w0 = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / den
        w1 = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / den
        w2 = 1 - w0 - w1
        inside = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
        z = w0 * ds[0] + w1 * ds[1] + w2 * ds[2]
        sub = depth[y0:y1 + 1, x0:x1 + 1]
        m = inside & (z > sub)
        sub[m] = z[m]
    return depth

def fg_mask(img):
    a = np.asarray(img.convert('RGB')).astype(np.float64)
    bg = np.median(np.concatenate([a[:20, :20].reshape(-1, 3), a[:20, -20:].reshape(-1, 3)]), axis=0)
    dist = np.abs(a - bg).sum(axis=2)
    m = dist > 26
    # 작은 잡음 제거: 3x3 다수결 두 번
    for _ in range(2):
        p = np.pad(m, 1).astype(np.int32)
        s = sum(p[1 + dy:p.shape[0] - 1 + dy, 1 + dx:p.shape[1] - 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1))
        m = s >= 5
    # 인물 안쪽의 구멍 메우기 (그늘진 눈 흰자처럼 배경과 비슷한 색): 가장자리에서 이어진 배경만 배경으로 본다
    import cv2
    inv = (~m).astype(np.uint8)
    n, lbl = cv2.connectedComponents(inv, connectivity=4)
    border = set(np.unique(np.concatenate([lbl[0], lbl[-1], lbl[:, 0], lbl[:, -1]])))
    keep = np.isin(lbl, list(border)) & (inv > 0)
    m = ~keep
    return m, bg

if __name__ == '__main__':
    glb, ref, out = sys.argv[-3:]
    os.makedirs(out, exist_ok=True)
    ob, V, T, TL, UV = load_mesh(glb)
    img = Image.open(ref)
    W, H = img.size
    m, bg = fg_mask(img)
    ys, xs = np.where(m)
    # 바닥 그림자를 빼려고 아래 2%는 열 개수 기준으로 자른다
    rows = m.sum(axis=1)
    top = np.where(rows > 3)[0][0]; bot = np.where(rows > 30)[0][-1]
    cols = m[top:bot].sum(axis=0)
    left = np.where(cols > 3)[0][0]; right = np.where(cols > 3)[0][-1]
    print('image fg bbox', left, right, top, bot, 'bg', bg)
    zmin, zmax = V[:, 2].min(), V[:, 2].max(); xmin, xmax = V[:, 0].min(), V[:, 0].max()
    sz = (bot - top) / (zmax - zmin)
    sx_fit = (right - left) / (xmax - xmin)
    print('scale by height', sz, 'scale by width', sx_fit, 'ratio', sx_fit / sz)
    res = {}
    for name, sx in (('uniform', sz), ('aniso', sx_fit)):
        ox = (left + right) / 2 - sx * (xmin + xmax) / 2
        oz = bot + sz * zmin
        depth = raster_front(V, T, W, H, sx, ox, sz, oz)
        sil = depth > -1e8
        iou = (sil & m).sum() / (sil | m).sum()
        res[name] = dict(sx=sx, ox=ox, sz=sz, oz=oz, iou=float(iou))
        ov = np.zeros((H, W, 3), dtype=np.uint8)
        ov[..., 0] = m * 255; ov[..., 1] = sil * 255; ov[..., 2] = (m & sil) * 255
        Image.fromarray(ov).resize((W // 2, H // 2)).save(os.path.join(out, f'align_{name}.png'))
        print(name, 'IoU', round(float(iou), 4))
    json.dump(res, open(os.path.join(out, 'align.json'), 'w'), indent=1)
