# gradient flood from edges: neighbour step small, pixel low-sat & light -> background
import numpy as np, sys
from PIL import Image
from collections import deque
def cut(k, step=7, minv=120, sat=0.12, keep=None, holes=0, top=0, bot=None):
    a=np.asarray(Image.open(f"src/{k}.png").convert("RGB")).astype(int); h,w,_=a.shape
    mx=a.max(2); mn=a.min(2); s=(mx-mn)/(mx+1e-6)
    ok=(mx>minv)&(s<sat)
    bg=np.zeros((h,w),bool); q=deque()
    for x in range(w):
        for y in (0,h-1):
            if ok[y,x]: bg[y,x]=1; q.append((y,x))
    for y in range(h):
        for x in (0,w-1):
            if ok[y,x] and not bg[y,x]: bg[y,x]=1; q.append((y,x))
    while q:
        y,x=q.popleft()
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny,nx=y+dy,x+dx
            if 0<=ny<h and 0<=nx<w and not bg[ny,nx] and ok[ny,nx] and abs(a[ny,nx]-a[y,x]).max()<=step:
                bg[ny,nx]=1; q.append((ny,nx))
    if holes:
        ref=np.median(a[bg],0)
        bg|=ok&(np.abs(a-ref).max(2)<holes)
    if keep:
        from PIL import ImageDraw
        m=Image.new("L",(w,h),0); ImageDraw.Draw(m).polygon([tuple(p) for p in keep],fill=1); bg&=~np.asarray(m).astype(bool)
    bg[:top]=1
    if bot: bg[bot:]=1
    out=np.dstack([a,np.where(bg,0,255)]).astype(np.uint8)
    Image.fromarray(out,"RGBA").save(f"nobg_{k}.png")
OPT={"c_mirror":dict(step=4,keep=[[300,100],[340,88],[358,100],[358,500],[330,522],[300,515]]),
 "c_prism":dict(holes=16),"c_thorn":dict(holes=14),"c_dampener":dict(top=62,holes=12),"c_insulator":dict(holes=12)}
for k in ["c_mirror","c_insulator","c_dampener","c_thorn","c_prism","c_firewall"]: cut(k,**OPT.get(k,{}))
