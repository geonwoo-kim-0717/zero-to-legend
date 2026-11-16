"""Torn skirt for phase-2 frames, modelled on the approved phase-2 walk hem: the bottom band of the coat skirt
turns into hanging strips (dark red, from the walk's tatter colours) with gaps between them. The strip pattern
is tied to the skirt's left edge so it moves with the coat from frame to frame."""
import numpy as np
from PIL import Image
OUT=np.array([7,6,15])
red=lambda a:(a[...,3]>0)&(a[...,0]>a[...,2]+30)&(a[...,0]<200)&(a[...,1]<110)
p=np.array(Image.open(__import__('sys').argv[1]).convert('RGBA')).astype(int)
reg=p[70:92,10:42].reshape(-1,4); TP=np.array(sorted({tuple(c[:3]) for c in reg if c[3]>0 and c[0]>c[2]+25 and c[0]<200},key=sum))
GAP=[0,0,1,0,0,1,1,0,0,0,1,0,0,1,0,1,0,0,0,1,1,0,0,1]           # 1 = gap column
LEN=[11,13,9,12,10,14,8,12,11,9,13,10,12,8,11,14,9,12,10,13,9,11,12,10]   # band depth per column
def hem_cols(m,ymin):
    cols={}
    for x in range(m.shape[1]):
        ys=np.where(m[ymin:,x])[0]
        if len(ys): cols[x]=ymin+ys.max()
    return cols
def apply(src1,src2,dst):
    t1=np.array(Image.open(src1).convert('RGBA')).astype(int); f=np.array(Image.open(src2).convert('RGBA')).astype(int)
    H,W=t1.shape[:2]; m=red(t1); TC=hem_cols(m,H//2)
    xs=sorted(TC); runs=[[xs[0]]]
    for x in xs[1:]:
        if x-runs[-1][-1]<=5: runs[-1].append(x)
        else: runs.append([x])
    seg=[x for x in max(runs,key=len) if x in TC]; L=seg[0]; n=0
    lum=lambda c: c[:3].sum()
    for x in seg:
        i=(x-L)%len(GAP); b=TC[x]; depth=LEN[i]
        for k in range(depth):
            y=b-k
            if y<0 or not m[y,x] or not red(f[y:y+1,x:x+1])[0,0]: continue
            if GAP[i] and k< depth-2: f[y,x]=0; n+=1                           # gap between strips
            elif k<2 and (x+k)%3==0: f[y,x]=0; n+=1                            # ragged strip ends
            else:
                c=f[y,x]; tt=min(len(TP)-1,int(lum(c)/600*len(TP)*0.8)); f[y,x,:3]=TP[tt]; n+=1   # burnt tatter colour
    al=f[...,3]>0
    for y in range(H):
        for x in range(W):
            if al[y,x] and red(f[y:y+1,x:x+1])[0,0] and any(not(0<=yy<H and 0<=xx<W) or not al[yy,xx] for yy,xx in ((y+1,x),(y-1,x),(y,x+1),(y,x-1))):
                f[y,x,:3]=OUT
    Image.fromarray(f.astype(np.uint8)).save(dst); return (L,seg[-1],n)
A=__import__('sys').argv[2]
for i in range(12): print(i,apply(A+f'boss_stomp_{i:02d}.png',A+f'boss_p2_stomp_{i:02d}.png',f'pvt/stomp/hem_{i:02d}.png'))
