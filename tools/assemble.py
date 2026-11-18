import numpy as np, json, trimesh
def T(R=np.eye(3),t=(0,0,0)):
    M=np.eye(4);M[:3,:3]=R;M[:3,3]=t;return M
def place(R,src,dst):  # rotate then translate so R@src -> dst
    return T(R,np.array(dst)-np.array(R)@np.array(src))
def Rz(deg):
    a=np.radians(deg);c,s=np.cos(a),np.sin(a);return np.array([[c,-s,0],[s,c,0],[0,0,1]])
I=np.eye(3)
FLIPX=np.array([[1,0,0],[0,-1,0],[0,0,-1]])
LEG_H=23.7
busC=np.array([455.45,140.07,0.0])
def bus2w(p): return np.array(p)-busC+[0,0,LEG_H]
X={}
X['obj_9_bus']=T(I,-busC+[0,0,LEG_H])
X['obj_14_legs']=place(FLIPX,[56.88,137.03,0],[0,0,LEG_H])
# small blocks under bus (flip, long side tangential)
R=FLIPX@Rz(90)
X['obj_11_instrument_01']=place(R,[90.2,120.54,3.7],bus2w([475.43,138.87,0]))
X['obj_12_instrument_02']=place(R,[87.09,108.61,3.7],bus2w([435.35,141.24,0]))
X['obj_10_dish']=place(I,[162.93,154.99,0],bus2w([455.5,140.09,21.11]))
tgt=bus2w([438.6,128.11,12.67]); ang=np.degrees(np.arctan2(tgt[1],tgt[0]))-(-90)
X['obj_13_instrument_03']=place(Rz(ang),[110.85,112.52,0],tgt)
# RTG boom
R1=np.array([[1,0,0],[0,0,-1],[0,1,0]])
X['obj_2_arm_left_01']=place(R1,[369.15,134.84,0],bus2w([449.59,115.51,8.08]))
M=X['obj_2_arm_left_01']
tip=(M@[374.99,130.4,44.31,1])[:3]
sock=(M@[375.02,150.66,19.38,1])[:3]; a=M[:3,:3]@np.array([0,0.602,0.799]); a/=np.linalg.norm(a)
R2=np.array([[1,0,0],[0,0,1],[0,-1,0]])
X['obj_3_arm_left_02']=place(R2,[407.66,129.23,44.65],tip)
X['obj_1_Stand']=place(I,[189.0,37.5,0],[0,tip[1]+6,0])
# science boom halves
root=bus2w([455.44,164.63,20.1]); L=2.4
Ra=np.array([[0,0,1],[0,1,0],[-1,0,0]])   # (x,y,z)->(z,y,-x)
Rb=np.array([[0,0,-1],[0,1,0],[1,0,0]])   # (x,y,z)->(-z,y,x)
X['obj_4_arm_right_01']=place(Ra,[453.07,28.3+L,0],root)
X['obj_5_arm_right_02']=place(Rb,[416.6,28.1+L,0],root)
# mag boom chain
u=np.array([0,0.602,0.799]); 
Rm=np.column_stack([-a, np.cross(u,-a), u])
bnds={'obj_6_boom_01':(29.2,149.1,88.81),'obj_7_boom_02':(30.7,150.6,70.855),'obj_8_boom_03':(28.7,151.0,51.85)}
face=sock
for nm in ['obj_6_boom_01','obj_7_boom_02','obj_8_boom_03']:
    x0,x1,yc=bnds[nm]
    X[nm]=place(Rm,[x1,yc,1.3],face-L*a)
    face=(X[nm]@[x0,yc,1.3,1])[:3]
hot={'tip':tip.tolist(),'sock':sock.tolist(),'magTip':face.tolist(),'axis':a.tolist()}
# checks
A=(X['obj_4_arm_right_01']@[458.9,90.7,0,1])[:3]; F=(X['obj_5_arm_right_02']@[410.7,90.5,0,1])[:3]
print('pin check',A.round(2),F.round(2))
json.dump({'X':{k:v.tolist() for k,v in X.items()},'hot':hot},open('assembly.json','w'))
allm=[]
for k,v in X.items():
    m=trimesh.load(f'/home/claude/stl/{k}.stl');m.apply_transform(v);allm.append(m);print(k,m.bounds.round(1).tolist())
tot=trimesh.util.concatenate(allm);print('TOTAL',tot.bounds.round(1).tolist())
print(hot)
