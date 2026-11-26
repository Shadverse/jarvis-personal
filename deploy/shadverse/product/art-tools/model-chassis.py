"""Build the SHADVERSE mechanical chassis. Run with blender -b -P this_file.py.

Coordinates are X across, Y up, Z forward, matching the renderer. All parts
are original hard-surface geometry. No scan or anatomical mesh is required.
"""
from pathlib import Path
import math
import struct
import bpy
import numpy as np
from mathutils import Vector
import bmesh

OUT = Path(__file__).resolve().parents[1] / "web/identity"
FRAME, SHELL, SILVER, GLASS, CYAN, MAGENTA, GRILLE, CHROME = range(8)
parts = []

def part(name, vertices, faces, material, bevel=.012):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if bevel:
        mod = obj.modifiers.new("Machined edges", "BEVEL")
        mod.width, mod.segments = bevel, 3
    parts.append((obj, material))

def body(name, rings, mat, bevel):
    vertices = []
    for y, width, front, back in rings:
        for x, z in [(0,1),(.66,.99),(.91,.69),(1,.10),(.94,-.62),(.63,-1),
                     (-.63,-1),(-.94,-.62),(-1,.10),(-.91,.69),(-.66,.99)]:
            vertices.append((x*width,y, z*(front if z>=0 else -back)))
    count=11
    faces=[tuple(range(count)),tuple(range(len(vertices)-count,len(vertices)))]
    for row in range(len(rings)-1):
        for i in range(count):
            a=row*count+i;b=row*count+(i+1)%count
            faces.append((a,b,b+count,a+count))
    part(name,vertices,faces,mat,bevel)

def panel(name, points, mat, depth=.04, bevel=.008, mirror=False):
    for side in ([1,-1] if mirror else [1]):
        front=[(x*side,y,z) for x,y,z in points]
        n=len(front)
        verts=front+[(x,y,z-depth) for x,y,z in front]
        surfaces=[tuple(range(n)),tuple(range(n,2*n))]
        surfaces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        part(name,verts,surfaces,mat,bevel)

def cylinder(name,center,axis,radius,length,mat,sides=32):
    axis=Vector(axis).normalized()
    across=axis.cross(Vector((0,0,1)) if abs(axis.z)<.8 else Vector((0,1,0))).normalized()
    up=axis.cross(across)
    verts=[]
    for offset in [-length/2,length/2]:
        for i in range(sides):
            angle=i*math.tau/sides
            verts.append(Vector(center)+offset*axis+radius*(math.cos(angle)*across+math.sin(angle)*up))
    faces=[tuple(range(sides)),tuple(range(sides,2*sides))]
    faces += [(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
    part(name,verts,faces,mat,min(.008,length*.18))

body("Pressure shell", [(-.55,.27,.24,-.24),(-.34,.44,.30,-.38),(.0,.55,.39,-.46),
 (.40,.59,.42,-.48),(.63,.51,.33,-.40),(.79,.32,.17,-.25),(.82,.21,.09,-.16)],FRAME,.026)
body("Optical canopy", [(-.035,.47,.41,-.19),(.105,.585,.52,-.26),(.30,.58,.50,-.30),
 (.365,.52,.42,-.29)],GLASS,.021)
# Crown tile terminating in two overhanging brow vanes.
panel("Vault",[(0,.835,.10),(.30,.79,.17),(.51,.62,.37),(.44,.46,.504),
 (.20,.385,.553),(0,.32,.556),(-.20,.385,.553),(-.44,.46,.504),(-.51,.62,.37),(-.30,.79,.17)],SHELL,.052,.015)
panel("Crown keel",[(0,.823,.146),(.068,.79,.215),(.052,.49,.484),(0,.403,.553),
 (-.052,.49,.484),(-.068,.79,.215)],SILVER,.016,.005)
panel("Brow",[(.015,.317,.564),(.43,.462,.509),(.53,.55,.413),(.595,.422,.309),
 (.575,.292,.405),(.425,.253,.513),(.105,.197,.562)],SILVER,.049,.012,True)
panel("Side skirt",[(.465,.238,.48),(.582,.307,.38),(.596,.22,.282),(.539,-.045,.32),
 (.376,-.268,.376),(.291,-.234,.487)],SHELL,.071,.014,True)
# A single optical bar underneath the brow. Three small inset optics sit centrally.
panel("Sensor recess",[(.026,.159,.54),(.43,.229,.49),(.55,.268,.404),(.51,.14,.442),
 (.407,.097,.512),(.047,.062,.554)],FRAME,.024,.006,True)
panel("Sensor strip",[(.054,.141,.558),(.408,.212,.514),(.492,.233,.474),
 (.444,.181,.506),(.389,.159,.529),(.084,.115,.563)],CYAN,.012,.004,True)
panel("Mask",[(0,.033,.533),(.179,.081,.532),(.38,.112,.494),(.386,.003,.485),
 (.267,-.221,.448),(.155,-.394,.423),(0,-.469,.406),
 (-.155,-.394,.423),(-.267,-.221,.448),(-.386,.003,.485),(-.38,.112,.494),(-.179,.081,.532)],SHELL,.055,.015)
panel("Cheek facet",[(.44,.092,.474),(.506,.066,.403),(.447,-.153,.41),(.233,-.403,.397),
 (.17,-.377,.428),(.291,-.19,.477)],SILVER,.042,.010,True)
panel("Acoustic insert",[(0,-.19,.484),(.173,-.15,.481),(.122,-.324,.449),(0,-.374,.44),
 (-.122,-.324,.449),(-.173,-.15,.481)],GRILLE,.025,.007)
for i in range(6):
    y=-.195-.024*i; extent=.135-.012*i;z=.499-.006*i
    panel("Acoustic louvre",[(-extent,y,z),(extent,y,z),(extent-.012,y-.009,z),(-extent+.012,y-.009,z)],CHROME,.008,.002)
for side in [-1,1]:
    for x,r,l,mat in [(.551,.225,.09,FRAME),(.607,.196,.051,SILVER),(.639,.156,.030,GLASS),
                       (.660,.090,.019,CHROME),(.675,.048,.012,MAGENTA)]:
        cylinder("Rotary joint",(side*x,.045,-.05),(side,0,0),r,l,mat)
    for i in range(4) if side==1 else ():
        y=.44+i*.040
        panel("Telemetry slot",[(.471,y,.421),(.516,y+.029,.378),(.517,y+.038,.375),(.471,y+.009,.424)],MAGENTA,.006,.001,True)
    cylinder("Jaw pivot",(side*.386,-.23,.23),(side,.05,.41),.085,.062,FRAME,16)
for i in range(4):
    cylinder("Neck coupling",(0,-.545-i*.080,-.045),(0,1,0),.24-i*.014,.065,CHROME if i%2==0 else FRAME)
body("Collar",[(-.91,.535,.260,-.27),(-.86,.52,.24,-.25),(-.78,.28,.14,-.18)],SHELL,.014)

graph=bpy.context.evaluated_depsgraph_get()
verts=[];faces=[];dots=[]
rng=np.random.default_rng(3303)
for obj,material in parts:
    evaluated=obj.evaluated_get(graph)
    mesh=evaluated.to_mesh()
    mesh.calc_loop_triangles()
    for tri in mesh.loop_triangles:
        a=np.array([tuple(mesh.vertices[k].co) for k in tri.vertices])
        normal=np.cross(a[1]-a[0],a[2]-a[0]);twice_area=np.linalg.norm(normal)
        if twice_area<1e-9:continue
        normal=np.array(mesh.polygons[tri.polygon_index].normal,dtype=float)
        faces.append([len(verts),len(verts)+1,len(verts)+2])
        verts.extend([(*point,*normal,material) for point in a])
        # Lay down a regular machining grain across adjacent triangles. Project
        # onto the least oblique plane, then lift each lattice site onto the face.
        axes=np.delete(np.arange(3),np.argmax(abs(normal)))
        uv=a[:,axes]
        pitch=.012
        lo=np.ceil(uv.min(0)/pitch).astype(int)
        hi=np.floor(uv.max(0)/pitch).astype(int)
        if np.any(lo>hi):continue
        gr=np.mgrid[lo[0]:hi[0]+1,lo[1]:hi[1]+1].reshape(2,-1).T*pitch
        basis=np.column_stack((uv[1]-uv[0],uv[2]-uv[0]))
        if abs(np.linalg.det(basis))<1e-9:continue
        weights=(gr-uv[0])@np.linalg.inv(basis).T
        weights=weights[(weights.min(1)>=0)&(weights.sum(1)<1)]
        n=len(weights)
        if not n:continue
        points=a[0]+weights[:,0:1]*(a[1]-a[0])+weights[:,1:2]*(a[2]-a[0])
        batch=np.zeros((n,12),dtype='u1')
        batch[:,:6]=np.rint(points*22000).astype('<i2').view('u1').reshape(-1,6)
        batch[:,6:9]=np.rint(normal*127).astype('i1').view('u1')
        batch[:,9]=rng.integers(186,251,n);batch[:,10]=material
        dots.append(batch)
    evaluated.to_mesh_clear()
data=np.concatenate(dots)
rng.shuffle(data)
# Keep the shuffled prefix representative at all three rendering tiers.
data=data[:56000]
OUT.mkdir(exist_ok=True)
(OUT/'chassis.points').write_bytes(data.tobytes())
v,lookup=np.unique(np.round(np.asarray(verts,dtype='<f4'),6),axis=0,return_inverse=True)
assert len(v)<65536
idx=lookup.astype('<u2')
packed=np.zeros((len(v),10),dtype='u1')
packed[:,:6]=np.rint(v[:,:3]*22000).astype('<i2').view('u1').reshape(-1,6)
packed[:,6:9]=np.rint(v[:,3:6]*127).astype('i1').view('u1')
packed[:,9]=v[:,6].astype('u1')
(OUT/'chassis.mesh').write_bytes(struct.pack('<I',len(v))+packed.tobytes()+idx.tobytes())
print("CHASSIS",len(parts),"parts,",len(faces),"triangles,",len(data),"samples")
