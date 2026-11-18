import json,trimesh,numpy as np
from trimesh.visual.material import PBRMaterial
A=json.load(open('assembly.json'))['X']
# Z-up mm -> Y-up meters
C=np.array([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]],float); C[:3,:3]*=0.001
def hexc(h,a=255): return [(h>>16)&255,(h>>8)&255,h&255,a]
mat={
 'obj_10_dish':(0xd9d5ca,0.0,0.8),'obj_9_bus':(0xb8913f,0.75,0.35),'obj_14_legs':(0xa88a50,0.6,0.45),
 'obj_11_instrument_01':(0x2a2a2a,0.2,0.6),'obj_12_instrument_02':(0x2a2a2a,0.2,0.6),'obj_13_instrument_03':(0xc9a24a,0.8,0.3),
 'obj_2_arm_left_01':(0x55575c,0.6,0.45),'obj_3_arm_left_02':(0x3d3f44,0.7,0.4),'obj_1_Stand':(0x8a8f99,0.0,0.8),
 'obj_6_boom_01':(0xdcd6c4,0.0,0.7),'obj_7_boom_02':(0xdcd6c4,0.0,0.7),'obj_8_boom_03':(0xdcd6c4,0.0,0.7),
}
names={'obj_10_dish':'dish','obj_9_bus':'bus','obj_14_legs':'legs','obj_11_instrument_01':'block_a','obj_12_instrument_02':'block_b',
 'obj_13_instrument_03':'bus_box','obj_2_arm_left_01':'rtg_boom','obj_3_arm_left_02':'rtg','obj_1_Stand':'stand',
 'obj_6_boom_01':'mag_1','obj_7_boom_02':'mag_2','obj_8_boom_03':'mag_3','obj_4_arm_right_01':'sci_a','obj_5_arm_right_02':'sci_b'}
sc=trimesh.Scene()
for k,M in A.items():
    m=trimesh.load(f'/home/claude/stl/{k}.stl'); m.apply_transform(np.array(M))
    if k.startswith('obj_4') or k.startswith('obj_5'):
        tc=m.triangles_center
        gold=((tc[:,1]>68)&(tc[:,2]<50))|((tc[:,1]>52)&(tc[:,1]<68)&((tc[:,2]>55)|(tc[:,2]<44)))
        fc=np.tile(hexc(0x46484d),(len(m.faces),1)); fc[gold]=hexc(0xc49a3e)
        m.apply_transform(C)
        m.visual=trimesh.visual.ColorVisuals(m,face_colors=fc)
        m.visual=m.visual.to_texture() if False else m.visual
    else:
        m.apply_transform(C)
        c,me,ro=mat[k]
        m.visual=trimesh.visual.TextureVisuals(material=PBRMaterial(baseColorFactor=hexc(c),metallicFactor=me,roughnessFactor=ro,name=names[k]))
    sc.add_geometry(m,node_name=names[k],geom_name=names[k])
sc.export('www/assets/voyager.glb')
import os;print(os.path.getsize('www/assets/voyager.glb')/1e6,'MB')
