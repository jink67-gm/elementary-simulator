"""
플레이어 모델 2단계: 참고 이미지(정면)를 메시 정면에 입혀 텍스처를 선명하게 다시 굽는다.

1) 메시를 정면 직교 투영으로 그린다 (원래 텍스처로).
2) 그 그림과 참고 이미지를 광학 흐름(optical flow)으로 부위별 정밀 정합한다 (다리·팔이 조금씩 어긋난 것 보정).
3) 텍스처 아틀라스의 텍셀마다 3D 위치·법선을 구해, 정면에서 보이는 곳은 참고 이미지 색을, 나머지는 원래 텍스처를 쓴다.
4) 뒷면(생성 모델이 어둡게 칠한 곳)은 앞면의 같은 부위 색에 맞춰 밝기를 보정한다.

실행: python3 tools/character/player_bake.py <입력.glb> <참고.png> <fit.json> <출력 폴더>
"""
import sys, os, json, struct, io
import numpy as np
import cv2
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import player_align as pa  # noqa: E402

S = 2048  # 새 텍스처 크기
GAMMA = 1.16  # 텍스처 밝기 보정 (1보다 크면 어두워짐)


def pa_back_depth(V, T, W, H, fit):
    """화소마다 가장 뒤쪽 표면의 y (Blender 좌표: +y가 뒤)"""
    Vb = V.copy(); Vb[:, 1] = -Vb[:, 1]
    d = pa.raster_front(Vb, T, W, H, fit['sx'], fit['ox'], fit['sz'], fit['oz'])  # = max(y)
    return d


def glb_image(path):
    """GLB 안의 첫 텍스처 이미지를 꺼낸다."""
    with open(path, 'rb') as f:
        data = f.read()
    jlen = struct.unpack('<I', data[12:16])[0]
    js = json.loads(data[20:20 + jlen])
    bin0 = 20 + jlen + 8
    bv = js['bufferViews'][js['images'][0]['bufferView']]
    raw = data[bin0 + bv.get('byteOffset', 0): bin0 + bv.get('byteOffset', 0) + bv['byteLength']]
    return Image.open(io.BytesIO(raw)).convert('RGB')


def vertex_normals(V, T):
    n = np.zeros_like(V)
    fn = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]])
    for i in range(3):
        np.add.at(n, T[:, i], fn)
    return n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-12)


def raster(px, py, T, W, H, depth_of=None):
    """삼각형을 그려 화소마다 (삼각형 번호, 무게중심 좌표)를 돌려준다. depth_of가 있으면 깊이 검사(큰 값이 앞)."""
    tri = np.full((H, W), -1, dtype=np.int64)
    bary = np.zeros((H, W, 3), dtype=np.float32)
    depth = np.full((H, W), -1e9)
    for ti, (a, b, c) in enumerate(T):
        xs = np.array([px[ti, 0], px[ti, 1], px[ti, 2]]); ys = np.array([py[ti, 0], py[ti, 1], py[ti, 2]])
        x0, x1 = int(max(0, np.floor(xs.min()))), int(min(W - 1, np.ceil(xs.max())))
        y0, y1 = int(max(0, np.floor(ys.min()))), int(min(H - 1, np.ceil(ys.max())))
        if x1 < x0 or y1 < y0:
            continue
        den = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
        if abs(den) < 1e-12:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        w0 = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / den
        w1 = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / den
        w2 = 1 - w0 - w1
        inside = (w0 >= -1e-4) & (w1 >= -1e-4) & (w2 >= -1e-4)
        if depth_of is not None:
            z = w0 * depth_of[ti, 0] + w1 * depth_of[ti, 1] + w2 * depth_of[ti, 2]
            inside &= z > depth[y0:y1 + 1, x0:x1 + 1]
            depth[y0:y1 + 1, x0:x1 + 1][inside] = z[inside]
        tri[y0:y1 + 1, x0:x1 + 1][inside] = ti
        sub = bary[y0:y1 + 1, x0:x1 + 1]
        sub[inside, 0] = w0[inside]; sub[inside, 1] = w1[inside]; sub[inside, 2] = w2[inside]
    return tri, bary, depth


def sample(img, x, y):
    return cv2.remap(img, x.astype(np.float32), y.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def find_eyes(img):
    """정면 그림에서 두 눈(피부 안의 어둡고 둥근 덩어리 한 쌍)의 중심을 찾는다. 못 찾으면 None"""
    H, W = img.shape[:2]
    top = img[: int(H * 0.28)]
    r, g, b = [top[..., i].astype(np.int32) for i in range(3)]
    skin = (r > 140) & (g > 95) & (b > 70) & (r > b + 14) & (r >= g)
    sk = cv2.morphologyEx(skin.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((41, 41), np.uint8))
    gray = cv2.cvtColor(top, cv2.COLOR_RGB2GRAY)
    dark = ((gray < 95) & (sk > 0)).astype(np.uint8)
    dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, _, st, cen = cv2.connectedComponentsWithStats(dark, 8)
    c = [(st[i][4], cen[i][0], cen[i][1]) for i in range(1, n) if 150 < st[i][4] < 6000 and 0.6 < st[i][2] / st[i][3] < 2.2 and st[i][4] / (st[i][2] * st[i][3]) > 0.4]
    best = None
    for i in range(len(c)):
        for j in range(i + 1, len(c)):
            a, bb = c[i], c[j]
            dx = abs(a[1] - bb[1])
            if abs(a[2] - bb[2]) < 14 and 0.05 * W < dx < 0.2 * W and 0.5 < a[0] / bb[0] < 2:
                score = a[0] + bb[0]
                if best is None or score > best[0]:
                    best = (score, sorted([(a[1], a[2]), (bb[1], bb[2])]))
    return None if best is None else np.array(best[1])


def bake(glb, ref_path, fit, out):
    os.makedirs(out, exist_ok=True)
    ob, V, T, TL, UV = pa.load_mesh(glb)
    ref = np.asarray(Image.open(ref_path).convert('RGB'))
    H, W = ref.shape[:2]
    fg, bgcol = pa.fg_mask(Image.fromarray(ref))
    tex = np.asarray(glb_image(glb))
    th = fit['theta']
    c, s = np.cos(th), np.sin(th)
    V2 = V.copy(); V2[:, 0] = c * V[:, 0] + s * V[:, 2]; V2[:, 2] = -s * V[:, 0] + c * V[:, 2]
    N = vertex_normals(V2, T)
    # 화면 좌표 (정면 직교)
    sx = V2[:, 0] * fit['sx'] + fit['ox']; sy = fit['oz'] - V2[:, 2] * fit['sz']; dep = -V2[:, 1]
    tuv = UV[TL]  # (삼각형, 3, 2)
    # 1) 원래 텍스처로 정면 그림
    tri, bary, depth = raster(sx[T], sy[T], T, W, H, depth_of=dep[T])
    vis = tri >= 0
    uvp = (bary[..., None] * tuv[np.clip(tri, 0, None)]).sum(axis=2)
    th_, tw_ = tex.shape[:2]
    render = np.empty_like(ref); render[:] = bgcol.astype(np.uint8)
    col = sample(tex, uvp[..., 0] * tw_ - 0.5, (1 - uvp[..., 1]) * th_ - 0.5)
    render[vis] = col[vis]
    Image.fromarray(render).save(os.path.join(out, 'bake_render.png'))
    # 2) 정합: 그린 그림의 화소 p → 참고 이미지의 p + F(p)
    #    몸: 실루엣 거리장(SDF)끼리의 부드러운 흐름 (다리·팔이 조금 어긋난 것 보정)
    #    머리: 두 눈 위치로 맞춘 닮음 변환(이동 + 균일 배율) — 얼굴이 일그러지지 않는다
    gy, gx = np.mgrid[0:H, 0:W].astype(np.float32)
    def sdf(m):
        m8 = m.astype(np.uint8)
        return cv2.distanceTransform(m8, cv2.DIST_L2, 5) - cv2.distanceTransform(1 - m8, cv2.DIST_L2, 5)
    n0 = ((np.clip(sdf(vis), -32, 32) + 32) / 64 * 255).astype(np.uint8)
    n1 = ((np.clip(sdf(fg), -32, 32) + 32) / 64 * 255).astype(np.uint8)
    fb = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM).calc(n0, n1, None)
    fb = cv2.GaussianBlur(fb, (0, 0), 10)
    e_ref = fit.get('eyes_ref') and np.array(fit['eyes_ref']) or find_eyes(ref)
    e_mesh = fit.get('eyes_mesh') and np.array(fit['eyes_mesh']) or find_eyes(render)
    print('눈 (참고):', None if e_ref is None else e_ref.round(1).tolist(), ' 눈 (메시):', None if e_mesh is None else e_mesh.round(1).tolist())
    Fx, Fy = fb[..., 0].copy(), fb[..., 1].copy()
    neck_row = None
    if e_ref is not None and e_mesh is not None:
        cr, cm = e_ref.mean(axis=0), e_mesh.mean(axis=0)
        sc = np.clip(np.linalg.norm(e_ref[1] - e_ref[0]) / np.linalg.norm(e_mesh[1] - e_mesh[0]), 0.8, 1.25)
        hx = cr[0] + sc * (gx - cm[0]) - gx; hy = cr[1] + sc * (gy - cm[1]) - gy
        # 목 높이(화면 y): 머리 아래에서 실루엣이 가장 좁아지는 줄
        rows = vis.sum(axis=1).astype(np.float32)
        y0 = int(cm[1] + 0.02 * H); y1 = int(cm[1] + 0.14 * H)
        neck = y0 + int(np.argmin(cv2.GaussianBlur(rows[y0:y1].reshape(-1, 1), (0, 0), 3).ravel()))
        hw = np.clip((neck + 0.012 * H - gy) / (0.03 * H), 0, 1); hw = hw * hw * (3 - 2 * hw)
        Fx = hw * hx + (1 - hw) * Fx; Fy = hw * hy + (1 - hw) * Fy
        neck_row = neck
        print(f'머리 배율 {sc:.3f}, 이동 ({cr[0] - cm[0]:.1f}, {cr[1] - cm[1]:.1f}), 목 줄 {neck}')
    Fx = Fx.astype(np.float32); Fy = Fy.astype(np.float32)
    warped = cv2.remap(ref, gx + Fx, gy + Fy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    chk = np.concatenate([render, warped, ref], axis=1)
    Image.fromarray(chk).resize((chk.shape[1] // 2, chk.shape[0] // 2)).save(os.path.join(out, 'bake_flow_check.png'))
    # 3) 아틀라스 텍셀마다 굽기
    ux = tuv[..., 0] * S; uy = (1 - tuv[..., 1]) * S
    atri, abary, _ = raster(ux, uy, T, S, S)
    filled = atri >= 0
    ti = np.clip(atri, 0, None)
    P = (abary[..., None] * V2[T[ti]]).sum(axis=2)
    Nn = (abary[..., None] * N[T[ti]]).sum(axis=2)
    Nn /= np.linalg.norm(Nn, axis=2, keepdims=True) + 1e-9
    qx = (P[..., 0] * fit['sx'] + fit['ox']).astype(np.float32); qy = (fit['oz'] - P[..., 2] * fit['sz']).astype(np.float32)
    qd = -P[..., 1]
    front_depth = sample(depth.astype(np.float32), qx - 0.5, qy - 0.5)
    visible = (qd > front_depth - 0.012).astype(np.float32)
    facing = -Nn[..., 1]
    wt = np.clip((facing - 0.12) / 0.4, 0, 1); wt = wt * wt * (3 - 2 * wt)
    rx = qx + sample(Fx, qx - 0.5, qy - 0.5); ry = qy + sample(Fy, qx - 0.5, qy - 0.5)
    fg_er = cv2.erode(fg.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(np.float32)
    infg = sample(cv2.GaussianBlur(fg_er, (0, 0), 1.5), rx - 0.5, ry - 0.5)
    w = wt * visible * np.clip(infg * 1.5 - 0.25, 0, 1)
    w = w * filled  # (UV 공간에서 흐리면 안 됨: 아틀라스 조각이 잘게 나뉘어 있어 이웃 조각으로 번진다)
    proj = sample(ref, rx - 0.5, ry - 0.5).astype(np.float32)
    orig = cv2.resize(tex, (S, S), interpolation=cv2.INTER_CUBIC).astype(np.float32)
    # 4) 뒷면: 몸(목 아래)은 참고 이미지를 뒤에서도 입힌다 (맨투맨·청바지 천 질감은 앞뒤가 비슷함).
    #    가슴의 주황 라벨은 지운 그림을 쓴다. 머리 뒤(머리카락)는 생성 텍스처를 쓴다.
    r_, g_, b_ = [ref[..., i].astype(np.int32) for i in range(3)]
    patch = ((r_ > 200) & (g_ > 110) & (g_ < 175) & (b_ < 90)).astype(np.uint8)
    patch = cv2.dilate(patch, np.ones((9, 9), np.uint8))
    ref_back = cv2.inpaint(ref, patch, 7, cv2.INPAINT_TELEA)
    projb = sample(ref_back, rx - 0.5, ry - 0.5).astype(np.float32)
    back_maxy = sample(np.maximum(pa_back_depth(V2, T, W, H, fit), -10).astype(np.float32), qx - 0.5, qy - 0.5)
    visible_b = (-qd > back_maxy - 0.012).astype(np.float32)
    wb = np.clip((-facing - 0.12) / 0.4, 0, 1); wb = wb * wb * (3 - 2 * wb)
    below_neck = np.clip((qy - (neck_row + 0.012 * H)) / (0.02 * H), 0, 1) if neck_row is not None else np.zeros_like(qy)
    wb = wb * visible_b * np.clip(infg * 1.5 - 0.25, 0, 1) * below_neck
    wb = wb * filled
    # 5) 나머지(옆면·머리 뒤): 생성 텍스처를 쓰되, 참고 이미지와 전체 색조가 이어지게 LAB 채널별 직선 보정 (전역, 어긋난 곳에 강한 회귀)
    lab_o = cv2.cvtColor(orig.astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
    lab_p = cv2.cvtColor(proj.astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
    m_front = (w > 0.8) & filled
    corrected = lab_o.copy()
    for ch in range(3):
        x = lab_o[..., ch][m_front]; y = lab_p[..., ch][m_front]
        ok = np.abs(y - x) < (45 if ch == 0 else 18)
        A = np.stack([x[ok], np.ones(ok.sum())], axis=1)
        (ga, of), *_ = np.linalg.lstsq(A, y[ok], rcond=None)
        ga = float(np.clip(ga, 0.8, 1.25))
        of = float(np.median(y[ok] - ga * x[ok]))
        corrected[..., ch] = lab_o[..., ch] * ga + of
        print(f'  색 보정 {"Lab"[ch]}: x{ga:.3f} {of:+.1f}')
    corr_rgb = cv2.cvtColor(np.clip(corrected, 0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB).astype(np.float32)
    # 신발(발목 아래): 참고 이미지에서는 바짓단이 신발등을 덮지만 메시는 신발이 더 나와 있어 어긋난다 → 생성 텍스처를 쓴다
    zlo = V2[:, 2].min(); hgt = V2[:, 2].max() - zlo
    shoe = np.clip((P[..., 2] - (zlo + 0.055 * hgt)) / (0.02 * hgt), 0, 1)
    w = w * shoe; wb = wb * shoe
    rest = np.clip(1 - w - wb, 0, 1)
    tot = w + wb + rest
    outimg = (proj * w[..., None] + projb * wb[..., None] + corr_rgb * rest[..., None]) / tot[..., None]
    # 참고 이미지에는 조명이 이미 그려져 있어 게임 조명을 한 번 더 받으면 너무 밝다 → 중간 밝기를 조금 낮춘다
    outimg = 255 * np.power(np.clip(outimg, 0, 255) / 255, GAMMA)
    outimg = np.clip(outimg, 0, 255).astype(np.uint8)
    # 빈 곳 채우기 (이음매 번짐 방지)
    hole = (~filled).astype(np.uint8)
    outimg = cv2.inpaint(outimg, cv2.dilate(hole, np.ones((3, 3), np.uint8)), 4, cv2.INPAINT_TELEA) if hole.mean() < 0.9 else outimg
    Image.fromarray(outimg).save(os.path.join(out, 'player_boy_basecolor.png'))
    # 디버그: 정면에서 본 가중치 (빨강 = 정면 투영, 초록 = 보임 판정, 파랑 = 정면을 향함)
    dbg = np.dstack([w, visible * filled, np.clip(facing, 0, 1) * filled]).astype(np.float32)
    fv = sample(dbg, uvp[..., 0] * S - 0.5, (1 - uvp[..., 1]) * S - 0.5)
    fv[~vis] = 0
    Image.fromarray((fv * 255).astype(np.uint8)).save(os.path.join(out, 'bake_weight_front.png'))
    print('front-projected texel share:', float((w > 0.5).sum() / filled.sum()))
    np.save(os.path.join(out, 'verts_deformed.npy'), V2)
    return ob, V2


if __name__ == '__main__':
    glb, ref, fitp, out = sys.argv[-4:]
    bake(glb, ref, json.load(open(fitp)), out)
