"""Shrink posed full-size frames to game pixels at one fixed scale; keep thin bright features; 16-colour palette; 1px outline."""
import numpy as np, sys
from PIL import Image
PALH=["07060F","1A1030","2A1747","3D1F66","8A7AA8","E8F7FF","00F0FF","0A7A8A","FF2BD6","8A1A70","FFF23A","FF8A1F","8A3A10","FF2A3A","39FF88","B6FF3A"]
PAL=np.array([[int(h[i:i+2],16) for i in (0,2,4)] for h in PALH],float)
FEAT={"C":"00F0FF","w":"E8F7FF","W":"8A7AA8","B":"8A3A10","Y":"FFF23A","O":"FF8A1F"}
def cls(c):
    r,g,b=c; mx,mn=max(c),min(c)
    if r>200 and g>200 and b<120: return "Y"
    if r>200 and 100<g<180 and b<80: return "O"
    if mx>200 and mn>170: return "w"
    if g>150 and b>150 and r<120: return "C"
    if mx-mn<30 and mx>90: return "W"
    if mx-mn<22 and mx>48: return "W"          # dark gunmetal reads as weapon grey
    if r>g+20 and r>b and mx>70: return "B"
    return None
def pix(src,sc,F,wthr=0.32,cov=0.15):
    a=np.asarray(Image.open(src).convert("RGBA")).astype(float); cs=1/sc
    out=np.full((F,F),-1)
    for y in range(F):
        for x in range(F):
            y0,y1=int(round(y*cs)),int(round((y+1)*cs)); x0,x1=int(round(x*cs)),int(round((x+1)*cs))
            cell=a[y0:y1,x0:x1].reshape(-1,4); sol=cell[cell[:,3]>128][:,:3]
            if not len(sol): continue
            nb=sol[sol.max(1)>24]                      # outline-black pixels don't vote
            f=[cls(c) for c in nb]; nf=sum(v is not None for v in f)
            if len(sol)<0.38*len(cell) and not (len(sol)>=cov*len(cell) and len(nb) and nf>=0.6*len(nb)): continue
            best=None
            for ch,thr in (("Y",0.2),("O",0.2),("C",0.2),("w",wthr),("B",0.3),("W",0.4)):
                if len(nb) and f.count(ch)>=thr*len(nb): best=ch; break
            if best: out[y,x]=PALH.index(FEAT[best]); continue
            m=sol.mean(0); r,g,b=m
            if b>r+10 and b>g+5: m=m*np.array([1.45,1.2,1.55])
            out[y,x]=int(np.argmin(((PAL-m)**2).sum(1)))
    img=np.zeros((F,F,4),np.uint8)
    for y in range(F):
        for x in range(F):
            if out[y,x]>=0: img[y,x,:3]=PAL[out[y,x]]; img[y,x,3]=255
            elif any(0<=y+dy<F and 0<=x+dx<F and out[y+dy,x+dx]>=0 for dy,dx in((1,0),(-1,0),(0,1),(0,-1))): img[y,x]=[7,6,15,255]
    return img
OPT={"guard_charger":dict(wthr=0.42),"spider_bot":dict(cov=0.08,wthr=0.4)}
for k in ["guard_baton","guard_rifle","guard_shotgun","guard_charger","spider_bot"]:
    sc,S=open(f"scale_{k}.txt").read().split(); sc=float(sc); S=int(S)
    for n in ["","_w2","_aim"]:
        img=pix(f"full_{k}{n}.png",sc,S+12,**OPT.get(k,{}))
        if n!="_aim": img=img[6:6+S,6:6+S]
        Image.fromarray(img,"RGBA").save(f"out/{k}{n}.png")
    print(k,"ok")
