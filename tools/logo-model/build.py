# Builds the EPIC BLAST logo as real 3D geometry, traced from the painted logo, and writes
# src/assets/branding/epic-blast-logo.bin, the compact model src/render/logo-model.ts reads.
#
# Every shape comes from the art itself: the whole silhouette becomes a thick navy body, and
# each letter, jewel and spark (the bright areas between the navy outlines) becomes its own
# solid standing in front of it. Every vertex keeps the art position it was traced from as its
# texture coordinate, so seen head-on the model shows exactly the painted logo.
#
#   pip install bpy==5.3.0 numpy scikit-image pillow
#   python tools/logo-model/build.py
import os, struct
import bpy
import numpy as np
from PIL import Image
from skimage.filters import gaussian
from skimage.measure import approximate_polygon, find_contours, label, regionprops

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ART = os.path.join(ROOT, 'src/assets/branding/epic-blast-logo-concept.png')
OUT = os.path.join(ROOT, 'src/assets/branding/epic-blast-logo.bin')

# Depths in logo widths. The body sits behind the art plane; the bright parts stand in front.
BODY = 0.05
LETTER = 0.032
JEWEL = 0.05
SPARK = 0.02
CAMERA = 2.6  # must match src/render/logo-3d.ts, so raised parts line up with the art at rest

rgba = np.asarray(Image.open(ART).convert('RGBA')).astype(np.float32) / 255
H, W = rgba.shape[:2]
alpha = rgba[..., 3]
rgb = rgba[..., :3]
value = rgb.max(-1)
navy = (rgb[..., 2] > rgb[..., 0] + 0.15) & (value < 0.62) & (rgb[..., 1] < 0.35)
bright = (alpha > 0.5) & ~navy & (value > 0.35)
saturated = (value - rgb.min(-1)) / (value + 1e-6)


def outlines(mask, tolerance=1.2):
    """Closed polygons around a mask, in art pixels (x, y)."""
    soft = gaussian(mask.astype(np.float32), 1.0)
    padded = np.pad(soft, 1)
    polys = []
    for c in find_contours(padded, 0.5):
        c = approximate_polygon(c, tolerance)
        if len(c) < 4:
            continue
        polys.append([(x - 1, y - 1) for y, x in c[:-1]])
    return polys


def solid(name, polys, z_front, depth):
    """A filled, extruded body whose front face sits at z_front (logo widths)."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '2D'
    cu.fill_mode = 'BOTH'
    cu.extrude = depth / 2
    # Shrink about the centre so that, through the camera, the front lines up with the art.
    k = (CAMERA - z_front) / CAMERA
    for poly in polys:
        sp = cu.splines.new('POLY')
        sp.points.add(len(poly) - 1)
        for p, (x, y) in zip(sp.points, poly):
            p.co = (((x - W / 2) / W) * k, ((H / 2 - y) / W) * k, 0, 1)
        sp.use_cyclic_u = True
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    ob.location = (0, 0, z_front - depth / 2)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    ob = bpy.context.view_layer.objects.active
    ob.select_set(False)
    return ob, k


bpy.ops.wm.read_factory_settings(use_empty=True)
parts = [solid('body', outlines(alpha > 0.5, 1.5), 0.0, BODY)]

labels = label(bright)
for region in regionprops(labels):
    if region.area < 400:
        continue  # specks stay painted on the body
    mask = labels == region.label
    sat = saturated[mask].mean()
    h = region.bbox[2] - region.bbox[0]
    w = region.bbox[3] - region.bbox[1]
    if region.area < 6000 and max(h, w) > 2.2 * min(h, w):
        z = SPARK
    elif region.area < 30000 and sat > 0.55 and abs(h - w) < 0.35 * max(h, w):
        z = JEWEL
    else:
        z = LETTER
    parts.append(solid(f'part{region.label}', outlines(mask), z, z))
print('parts', len(parts))

# Gather triangles: positions, corner normals and the art position each vertex was traced from.
pos, nor, uv, kind = [], [], [], []
for i, (ob, k) in enumerate(parts):
    me = ob.data
    for f in me.polygons:
        f.use_smooth = False
    mw = ob.matrix_world
    for tri in me.loop_triangles:
        n = (mw.to_3x3() @ tri.normal).normalized()
        for li in tri.loops:
            p = mw @ me.vertices[me.loops[li].vertex_index].co
            pos.append(p[:])
            nor.append(n[:])
            uv.append((p.x / k + 0.5, 0.5 * H / W - p.y / k))
            kind.append(0 if i == 0 else 1)
pos = np.array(pos, np.float32)
nor = np.array(nor, np.float32)
uv = np.array(uv, np.float32)
uv[:, 1] *= W / H
print('triangles', len(pos) // 3, 'bounds', pos.min(0), pos.max(0))

q = np.round(pos * 16384).astype(np.int16)
qn = np.round(nor * 127).astype(np.int8)
qt = np.round(np.clip(uv, 0, 1) * 65535).astype(np.uint16)
rec = np.ascontiguousarray(
    np.concatenate(
        [q.view(np.uint8).reshape(-1, 6), qn.view(np.uint8).reshape(-1, 3), np.array(kind, np.uint8).reshape(-1, 1), qt.view(np.uint8).reshape(-1, 4)],
        1,
    )
)
uniq, idx = np.unique(rec.view([('r', np.void, 14)]).ravel(), return_inverse=True)
verts = np.concatenate([uniq.view(np.uint8).reshape(-1, 14), np.zeros((len(uniq), 2), np.uint8)], 1)
print('vertices', len(verts))
ib = idx.astype(np.uint16 if len(verts) < 65536 else np.uint32)
with open(OUT, 'wb') as f:
    f.write(struct.pack('<4sII', b'LGO2', len(verts), len(ib)))
    f.write(verts.tobytes())
    f.write(ib.tobytes())
print('bytes', os.path.getsize(OUT))
