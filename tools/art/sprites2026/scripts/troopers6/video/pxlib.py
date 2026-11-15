import sys, numpy as np
sys.path.insert(0,"/home/user/zero-to-legend/tools/art/sprites2026/scripts")
sys.path.insert(0,"/home/user/zero-to-legend/tools/art/sprites2026/scripts/counters")
import process as PR, colorsys
def sat_mask(r):
    mx=r.max(-1); mn=r.min(-1); l=(mx+mn)/2/255; s=(mx-mn)/(255-np.abs(mx+mn-255)+1e-6)
    return (s>0.55)&(l>0.25)
def demagenta(a):
    r,g,b=[a[...,i].astype(float)/255 for i in range(3)]
    mx=np.maximum(np.maximum(r,g),b); mn=np.minimum(np.minimum(r,g),b); l=(mx+mn)/2; d=mx-mn
    s=np.where(d>0,d/(1-np.abs(2*l-1)+1e-6),0)
    h=np.where(mx==r,((g-b)/(d+1e-9))%6,np.where(mx==g,(b-r)/(d+1e-9)+2,(r-g)/(d+1e-9)+4))*60
    bad=(a[...,3]>0)&(d>0)&(h>=280)&(h<=335)&(s>0.45)
    for y,x in zip(*np.where(bad)):
        nb=[tuple(a[yy,xx]) for yy,xx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)) if 0<=yy<a.shape[0] and 0<=xx<a.shape[1] and a[yy,xx,3]>0 and not bad[yy,xx]]
        if nb: a[y,x]=max(set(nb),key=nb.count)
    return a
def match(img,ref):
    a=np.asarray(img).astype(np.float32); b=np.asarray(ref).astype(np.float32)
    ma=(a[...,3]>0)&~sat_mask(a[...,:3]); mb=(b[...,3]>0)&~sat_mask(b[...,:3])
    La=a[...,:3].mean(-1); Lb=np.sort(b[...,:3].mean(-1)[mb])
    src=La[ma]; q=np.argsort(np.argsort(src))/(len(src)-1); tgt=Lb[(q*(len(Lb)-1)).astype(int)]
    f=np.ones_like(La); f[ma]=(tgt+1)/(src+1)
    a[...,:3]*=f[...,None]
    return Image.fromarray(a.clip(0,255).astype(np.uint8),"RGBA")
from pix_ext import pix
from PIL import Image
import cv2
TR="/tmp/claude-0/-home-user-zero-to-legend/fc523c13-f461-57dc-a0b6-11384a630a05/scratchpad/s6/tr"
OUT=np.array([7,6,15,255],np.uint8)
def cut(sheet,i,n):
    a=np.asarray(Image.open(sheet).convert("RGBA")).astype(int)
    w=a.shape[1]//n; a=a[:,i*w:(i+1)*w].copy()
    r,g,b=a[...,0],a[...,1],a[...,2]
    bg=(r>150)&(b>120)&(g<110)&(r-g>80)&(b-g>60)
    k,lab,st,_=cv2.connectedComponentsWithStats((~bg).astype(np.uint8),8)
    j=1+np.argmax(st[1:,4]); keep=lab==j
    a[...,3]=np.where(keep,255,0); ys,xs=np.where(keep)
    return a[ys.min():ys.max()+1,xs.min():xs.max()+1].astype(np.uint8)
def headx(a):
    al=a[...,3]>0; ys,_=np.where(al); top,bot=ys.min(),ys.max(); H=bot-top
    band=al[top+int(H*0.08):top+int(H*0.24)]; xs=np.where(band)[1]; return xs.mean()
def make(t,a,k,dx_work=None):
    """a: cut RGBA uint8 array; k: sheet->source scale. dx_work: x of figure's left edge in work px (None = centre bbox)."""
    sc,S=open(f"{TR}/scale_trooper_{t}.txt").read().split(); sc=float(sc); S=int(S); F=S+12
    cw,ch=map(int,open(f"{TR}/cut_trooper_{t}.txt").read().split())
    Wc=int(np.ceil(F/sc)); ox_c=(6+S/2)/sc; floor=(6+S-1)/sc
    REF=Image.open(f"{TR}/work_trooper_{t}.png").convert("RGBA")
    to_work=k*140/ch
    af=a.astype(np.float32); fg=af[...,3]>0; rgb=PR.recolor_black(af[...,:3],fg)
    im=Image.fromarray(np.dstack([rgb,af[...,3]]).astype(np.uint8),"RGBA")
    w,h=round(im.width*to_work),round(im.height*to_work); im=im.resize((w,h),Image.LANCZOS)
    c=Image.new("RGBA",(Wc,Wc),(0,0,0,0)); x0=int(ox_c-w/2) if dx_work is None else int(ox_c+dx_work*to_work)
    c.alpha_composite(im,(x0,int(floor-h))); c=match(c,REF)
    tmp="/tmp/claude-0/-home-user-zero-to-legend/fc523c13-f461-57dc-a0b6-11384a630a05/scratchpad/s6/_full.png"; c.save(tmp)
    o=pix(tmp,sc,F).copy()
    mag=(o[...,3]>0)&(o[...,0]>200)&(o[...,2]>150)&(o[...,1]<90); o[mag]=0
    m=(o[...,3]>0)&~np.all(o==OUT,-1); o[np.all(o==OUT,-1)]=0
    nb=np.zeros_like(m); nb[1:]|=m[:-1]; nb[:-1]|=m[1:]; nb[:,1:]|=m[:,:-1]; nb[:,:-1]|=m[:,1:]; o[nb&~m]=OUT
    return demagenta(o)
