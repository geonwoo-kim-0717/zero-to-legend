"""Selection-card art: realistic render (src/<id>.png, light grey background) -> background flood removal -> trim ->
fit 46px -> hue-aware 16-colour pixelation (same mapping as the counter units) -> 1px outline -> 48x48 card_<id>.png."""
import sys, os, numpy as np
from collections import deque
from PIL import Image
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "counters"))
from pix import PAL, PALH, near, cls
def nobg(a, step=7, minv=120, sat=0.14, holes=14):
    a=a[...,:3].astype(int); h,w,_=a.shape; mx=a.max(2); mn=a.min(2); ok=(mx>minv)&((mx-mn)/(mx+1e-6)<sat)
    bg=np.zeros((h,w),bool); q=deque()
    for y in range(h):
        for x in range(w):
            if (y in (0,h-1) or x in (0,w-1)) and ok[y,x]: bg[y,x]=1; q.append((y,x))
    while q:
        y,x=q.popleft()
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny,nx=y+dy,x+dx
            if 0<=ny<h and 0<=nx<w and not bg[ny,nx] and ok[ny,nx] and abs(a[ny,nx]-a[y,x]).max()<=step: bg[ny,nx]=1; q.append((ny,nx))
    if holes: ref=np.median(a[bg],0); bg|=ok&(np.abs(a-ref).max(2)<holes)
    return np.dstack([a,np.where(bg,0,255)]).astype(np.uint8)
ROT={"railgun":32,"shotgun":32,"mantisBlade":20}   # long side-on weapons: tilt to use the square card box
def card(src, out, S=48, pad=1, rot=0, mute=0.0):
    a=nobg(np.asarray(Image.open(src).convert("RGB")))
    if rot: a=np.asarray(Image.fromarray(a,"RGBA").rotate(rot,resample=Image.BICUBIC,expand=True))
    ys,xs=np.where(a[...,3]>0); a=a[ys.min():ys.max()+1, xs.min():xs.max()+1]
    h,w=a.shape[:2]; n=S-2*pad; cs=max(h,w)/n; gw,gh=round(w/cs),round(h/cs)
    g=np.full((gh,gw),-1)
    for y in range(gh):
        for x in range(gw):
            cell=a[int(y*cs):int((y+1)*cs), int(x*cs):int((x+1)*cs)].reshape(-1,4); sol=cell[cell[:,3]>128][:,:3].astype(float)
            if not len(sol): continue
            f=[cls(c) for c in sol]; nf=sum(v is not None for v in f)
            if len(sol)<0.4*len(cell) and not (len(sol)>=0.15*len(cell) and nf>=0.6*len(sol)): continue
            keep=(10,11,13,8,6,14) if not mute else (10,11,13)          # muted: only real light sources stay as glows
            best=next((k for k in keep if f.count(k)>=(0.3 if not mute else 0.5)*len(sol)),None)
            if best is None and f.count(5)>=0.3*len(sol): best=5
            m=sol.mean(0)
            if mute: lum=m@[0.3,0.59,0.11]; m=m+(lum-m)*mute; m=m*(1-0.18*mute)   # pull rim-light neon toward grey, a bit darker
            g[y,x]=best if best is not None else near(m)
    img=np.zeros((S,S,4),np.uint8); oy,ox=(S-gh)//2,(S-gw)//2
    full=np.full((S,S),-1); full[oy:oy+gh,ox:ox+gw]=g
    for y in range(S):
        for x in range(S):
            if full[y,x]>=0: img[y,x,:3]=PAL[full[y,x]]; img[y,x,3]=255
            elif any(0<=y+dy<S and 0<=x+dx<S and full[y+dy,x+dx]>=0 for dy,dx in((1,0),(-1,0),(0,1),(0,-1))): img[y,x]=[7,6,15,255]
    Image.fromarray(img,"RGBA").save(out)
if __name__=="__main__":
    mute=float(sys.argv[1]) if len(sys.argv)>1 else 0.0; od=sys.argv[2] if len(sys.argv)>2 else "out"
    os.makedirs(od,exist_ok=True)
    for f in sorted(os.listdir("src")):
        k=f[:-4]; card(f"src/{f}", f"{od}/card_{k}.png", rot=ROT.get(k,0), mute=mute); print(k)
