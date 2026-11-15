"""usage: vid_proc.py <trooper> <sheet_for_size> <KW> [start period]  -> tmp/pxv12_<t>_NN.png (12-frame loop)"""
import sys, glob, os, subprocess; sys.path.insert(0,"tmp")
from pxlib import *
t,sheet,KW=sys.argv[1],sys.argv[2],float(sys.argv[3])
D=f"vid/{t}_raw"; os.makedirs(D,exist_ok=True)
if not glob.glob(f"{D}/*.png"): subprocess.run(["ffmpeg","-loglevel","error","-i",f"vid/{t}_walk.mp4",f"{D}/%04d.png"],check=True)
fs=sorted(glob.glob(f"{D}/*.png"))
def isbg(a):
    r,g,b=a[...,0],a[...,1],a[...,2]; return (r>150)&(b>120)&(g<110)&(r-g>80)&(b-g>60)
def key(p):
    a=np.asarray(Image.open(p).convert("RGBA")).astype(int); bg=isbg(a)
    n,lab,st,_=cv2.connectedComponentsWithStats((~bg).astype(np.uint8),8); j=1+np.argmax(st[1:,4]); keep=lab==j
    a[...,3]=np.where(keep,255,0); ys,xs=np.where(keep); return a[ys.min():ys.max()+1,xs.min():xs.max()+1].astype(np.uint8)
# clean = border is magenta
def clean(p):
    a=np.asarray(Image.open(p).convert("RGB")).astype(int); e=np.concatenate([a[:6].reshape(-1,3),a[-6:].reshape(-1,3),a[:,:6].reshape(-1,3),a[:,-6:].reshape(-1,3)])
    return isbg(e[None])[0].mean()>0.97
ok=[clean(p) for p in fs]; lastclean=next((i for i,o in enumerate(ok) if not o),len(fs))-1
if len(sys.argv)>5: s,P=int(sys.argv[4]),int(sys.argv[5])
else:
    M=[~isbg(np.asarray(Image.open(p).convert("RGB")).astype(int))[260:420] for p in fs[:lastclean+1]]
    best=None
    for P in range(16,30):
        for s in range(3,lastclean+1-P):
            d=(M[s]^M[s+P]).sum()
            if best is None or d<best[0]: best=(d,s,P)
    _,s,P=best
print(t,"clean frames",lastclean+1,"loop start",s,"period",P)
hA=cut(f"tmp/walk/{sheet}.png",0,4).shape[0]
cuts=[key(fs[s+round(i*P/12)]) for i in range(12)]
k=KW*hA/cuts[0].shape[0]
h0=headx(cuts[0]); off0=-cuts[0].shape[1]/2
for i,c in enumerate(cuts):
    o=make(t,c,k,off0+h0-headx(c)); Image.fromarray(o).save(f"tmp/pxv12_{t}_{i}.png")
print("k",round(k,3))
