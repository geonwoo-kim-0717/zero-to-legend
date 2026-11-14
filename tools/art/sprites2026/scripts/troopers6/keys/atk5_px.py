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
TR="/tmp/claude-0/-home-user-zero-to-legend/fc523c13-f461-57dc-a0b6-11384a630a05/scratchpad/s6/tr"
OUT=np.array([7,6,15,255],np.uint8)
import json
K=json.loads(open("tmp/atk_scales.json").read())
POSES=["S","A","M","B","F"]
rows=[]
for t,kk in K.items():
    sc,S=open(f"{TR}/scale_trooper_{t}.txt").read().split(); sc=float(sc); S=int(S); F=S+12
    cw,ch=map(int,open(f"{TR}/cut_trooper_{t}.txt").read().split())
    Wc=int(np.ceil(F/sc)); ox_c=(6+S/2)/sc; floor=(6+S-1)/sc
    REF=Image.open(f"{TR}/work_trooper_{t}.png").convert("RGBA")
    row=[np.asarray(Image.open(f"{TR}/out/trooper_{t}_walk_00.png"))]
    for n,k_src in [("atk"+p,kk[p]) for p in POSES]:
        to_work=k_src*140/ch
        a=np.asarray(Image.open(f"tmp/{t}_{n}.png").convert("RGBA")).astype(np.float32)
        fg=a[...,3]>0; rgb=PR.recolor_black(a[...,:3],fg)
        im=Image.fromarray(np.dstack([rgb,a[...,3]]).astype(np.uint8),"RGBA")
        w,h=round(im.width*to_work),round(im.height*to_work); im=im.resize((w,h),Image.LANCZOS)
        c=Image.new("RGBA",(Wc,Wc),(0,0,0,0)); x0=int(ox_c-w/2); c.alpha_composite(im,(x0,int(floor-h)))
        c=match(c,REF)
        c.save(f"tmp/full_{t}_{n}.png")
        o=pix(f"tmp/full_{t}_{n}.png",sc,F).copy()
        mag=(o[...,3]>0)&(o[...,0]>200)&(o[...,2]>150)&(o[...,1]<90); o[mag]=0
        m=(o[...,3]>0)&~np.all(o==OUT,-1); o[np.all(o==OUT,-1)]=0
        nb=np.zeros_like(m); nb[1:]|=m[:-1]; nb[:-1]|=m[1:]; nb[:,1:]|=m[:,:-1]; nb[:,:-1]|=m[:,1:]; o[nb&~m]=OUT
        o=demagenta(o); Image.fromarray(o).save(f"tmp/px_{t}_{n}.png"); row.append(o)
    rows.append(row)
Z=4; cell=54*Z
s=Image.new("RGBA",(6*(cell+10)+10,4*(cell+10)+10),(26,16,48,255))
for r,row in enumerate(rows):
    for i,o in enumerate(row):
        im=Image.fromarray(o); s.alpha_composite(im.resize((im.width*Z,im.height*Z),Image.NEAREST),(10+i*(cell+10),10+r*(cell+10)+cell-im.height*Z))
s.save("../../s6_atk5.png")
