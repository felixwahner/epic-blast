# Builds the EPIC BLAST logo as real 3D geometry with Blender's Python module and writes
# src/assets/branding/epic-blast-logo.bin, the compact model src/render/logo-model.ts reads.
#
#   pip install bpy==5.3.0 fonttools brotli skia-pathops numpy
#   python tools/logo-model/build.py
import math, os, struct, tempfile
import bpy
import numpy as np
from fontTools.ttLib import TTFont
from fontTools.ttLib.removeOverlaps import removeOverlaps
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'src/assets/branding/epic-blast-logo.bin')

# The game's own display face, unpacked and with overlapping contours merged so the caps fill cleanly.
ttf = os.path.join(tempfile.mkdtemp(), 'exo2.ttf')
face = TTFont(os.path.join(ROOT, 'src/assets/fonts/Exo2-ExtraBoldItalic-latin.woff2'))
face.flavor = None
removeOverlaps(face)
face.save(ttf)

bpy.ops.wm.read_factory_settings(use_empty=True)
font = bpy.data.fonts.load(ttf)

def hexc(h): h=h.lstrip('#'); return [int(h[i:i+2],16)/255 for i in (0,2,4)]
def lerp(a,b,t): return [a[i]+(b[i]-a[i])*t for i in range(3)]

parts = []  # (mesh object, colour function(pos, normal) -> rgb)

def text(body, size, y, z, extrude, bevel, offset=0.0, res=3):
    cu = bpy.data.curves.new(body, 'FONT'); cu.body = body; cu.font = font
    cu.size = size; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    cu.extrude = extrude; cu.bevel_depth = bevel; cu.bevel_resolution = res; cu.offset = offset
    cu.space_character = 0.88; cu.resolution_u = 6
    ob = bpy.data.objects.new(body, cu); bpy.context.collection.objects.link(ob)
    ob.location = (0, y, z)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    bpy.ops.object.convert(target='MESH'); ob.select_set(False)
    return bpy.context.view_layer.objects.active if bpy.context.view_layer.objects.active.name.startswith(body) else ob

def box(name, size, loc, rot, bevel):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.active_object; ob.name = name; ob.scale = size
    bpy.ops.object.transform_apply(scale=True)
    m = ob.modifiers.new('b', 'BEVEL'); m.width = bevel; m.segments = 3; m.limit_method = 'NONE'
    bpy.ops.object.modifier_apply(modifier='b')
    return ob

# Letter faces: top-to-bottom gradient on the front, darker toned sides.
def word_colour(top, bottom, side_top, side_bottom, y0, y1):
    def f(p, n):
        t = min(1, max(0, (y1 - p.y) / (y1 - y0)))
        if n.z > 0.75: return lerp(top, bottom, t)
        if n.z > 0.2:  return lerp(lerp(top, bottom, t), [1,1,1], 0.25)  # bevel catches light
        return lerp(side_top, side_bottom, t)
    return f
def flat(front, side):
    return lambda p, n: front if n.z > 0.5 else lerp(front, side, 0.5) if n.z > 0.1 else side

D = 0.22  # letter depth
epic = text('EPIC', 1.2, 0.6, 0, D, 0.045)
blast = text('BLAST', 1.5, -0.5, 0, D, 0.05)
parts.append((epic, word_colour(hexc('ffe94a'), hexc('ff8f0a'), hexc('d06a00'), hexc('8a3000'), 0.2, 1.05)))
parts.append((blast, word_colour(hexc('7ff3ff'), hexc('1f8cff'), hexc('1a55d8'), hexc('0b2a8f'), -1.05, 0.05)))
# Outline: the same words grown outward and set back, one navy rim around both.
navy = flat(hexc('101a9a'), hexc('070c55'))
for body, size, y, z in (('EPIC', 1.2, 0.6, -0.1), ('BLAST', 1.5, -0.5, -0.11)):
    o = text(body, size, y, z, D + 0.02, 0.03, offset=0.1, res=2)
    parts.append((o, navy))

# Jewel blocks and sparks behind the words.
def jewel(front, side): return flat(front, side)
parts.append((box('red', (0.42,0.42,0.42), (-1.72, 0.72, -0.25), (0.35, -0.45, 0.35), 0.05), jewel(hexc('ff4a2a'), hexc('a3140c'))))
parts.append((box('violet', (0.40,0.40,0.40), (1.45, 1.15, -0.3), (0.4, 0.35, -0.3), 0.05), jewel(hexc('c43dff'), hexc('6a10b0'))))
parts.append((box('cyan', (0.24,0.24,0.24), (1.78, 0.6, -0.15), (0.3, -0.3, 0.25), 0.03), jewel(hexc('3ad8ff'), hexc('0b6fc2'))))
spark = flat(hexc('ffd21a'), hexc('c87a00'))
for x, y, a, l in ((-1.3, 1.22, 1.15, 0.34), (-2.05, 0.3, 0.25, 0.3), (2.1, 0.42, -0.35, 0.32), (1.92, 1.3, -1.0, 0.3), (-0.98, 1.36, 1.45, 0.22)):
    parts.append((box('spark', (0.08, l, 0.08), (x, y, -0.35), (0, 0, a - math.pi/2), 0.015), spark))

def stagger(ob, step):
    # Neighbouring glyphs overlap a little; set each one a hair further forward so their faces never fight.
    import bmesh
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.verts.ensure_lookup_table()
    seen = set(); parts_ = []
    for v in bm.verts:
        if v.index in seen: continue
        stack = [v]; group = []; seen.add(v.index)
        while stack:
            u = stack.pop(); group.append(u)
            for e in u.link_edges:
                w = e.other_vert(u)
                if w.index not in seen: seen.add(w.index); stack.append(w)
        parts_.append(group)
    parts_.sort(key=lambda g: min(u.co.x for u in g))
    for i, g in enumerate(parts_):
        for u in g: u.co.z += i * step
    bm.to_mesh(ob.data); bm.free()

for ob, _ in parts[:4]: stagger(ob, 0.02)

def bend(ob, k):
    for v in ob.data.vertices:
        w = ob.matrix_world @ v.co
        v.co = ob.matrix_world.inverted() @ Vector((w.x, w.y - k * w.x * w.x, w.z))
for ob, _ in parts: bend(ob, 0.045)

# Weld the seams Blender leaves between caps, bevels and sides, so no hairline cracks show,
# and keep crisp normals across edges sharper than 35°.
import bmesh
for ob, _ in parts:
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.to_mesh(ob.data); bm.free()
    for f in ob.data.polygons: f.use_smooth = True
    ob.data.set_sharp_from_angle(angle=math.radians(35))

# Gather triangles with corner normals and colours.
pos, nor, col = [], [], []
for ob, colour in parts:
    me = ob.data; me.calc_loop_triangles() if hasattr(me,'calc_loop_triangles') else None
    mw = ob.matrix_world; nm = mw.to_3x3().inverted().transposed()
    cn = me.corner_normals
    for tri in me.loop_triangles:
        for li in tri.loops:
            v = me.loops[li].vertex_index
            p = mw @ me.vertices[v].co
            n = (nm @ cn[li].vector).normalized()
            fn = (nm @ tri.normal).normalized()
            pos.append(p[:]); nor.append(n[:]); col.append(colour(p, fn))
pos = np.array(pos, np.float32); nor = np.array(nor, np.float32); col = np.clip(np.array(col, np.float32), 0, 1)
print('triangles', len(pos)//3)
# Centre and scale to logo widths.
lo, hi = pos.min(0), pos.max(0); c = (lo + hi) / 2; c[2] = hi[2]
w = hi[0] - lo[0]; pos = (pos - c) / w
print('bounds', pos.min(0), pos.max(0))
# Dedupe and quantise: int16 positions (scale 1/16384), int8 normals, uint8 colours, uint16/32 indices.
q = np.round(pos * 16384).astype(np.int16); qn = np.round(nor * 127).astype(np.int8); qc = np.round(col * 255).astype(np.uint8)
rec = np.concatenate([q.view(np.uint8).reshape(-1,6), qn.view(np.uint8).reshape(-1,3), qc], 1)
rec = np.ascontiguousarray(rec)
uniq, idx = np.unique(rec.view([('r', np.void, rec.shape[1])]).ravel(), return_inverse=True)
verts = uniq.view(np.uint8).reshape(-1, 12)  # 6 pos + 3 normal + 3 colour bytes
print('vertices', len(verts))
ib = idx.astype(np.uint16 if len(verts) < 65536 else np.uint32)
with open(OUT, 'wb') as f:
    f.write(struct.pack('<4sII', b'LGO1', len(verts), len(ib)))
    f.write(verts.tobytes()); f.write(ib.tobytes())
print('bytes', os.path.getsize(OUT))
