"""Black Shield trooper frames: raise armour contrast and add a visor glow.
usage: contrast_glow.py <k> <out_dir> files...   (apply to the dropship-tone frames once)"""
import sys, os, numpy as np, cv2
from PIL import Image
K=float(sys.argv[1]); OUT=sys.argv[2]; os.makedirs(OUT,exist_ok=True)
PAINT=os.environ.get("PAINT_GLOW","0")=="1"; ANCH={}
OUTL=np.array([7,6,15])
def hsv(a):
    return cv2.cvtColor(a[...,:3].astype(np.uint8)[None] if a.ndim==2 else a[...,:3].astype(np.uint8),cv2.COLOR_RGB2HSV)
def process(p):
    a=np.asarray(Image.open(p).convert("RGBA")).astype(np.float32); al=a[...,3]>0
    rgb=a[...,:3]; outl=al&(np.abs(rgb-OUTL).sum(-1)<6)
    mx=rgb.max(-1); mn=rgb.min(-1); sat=(mx-mn)/(mx+1e-6)
    armour=al&~outl&(sat<0.45)
    L=rgb.mean(-1); mid=58.0
    Ln=np.clip(mid+(L-mid)*K,22,235); f=np.where(armour,Ln/np.maximum(L,1),1.0)
    rgb2=np.clip(rgb*f[...,None],0,255)
    # visor: green, or red/orange near the top of the figure (the chest emblem sits lower)
    ys,_=np.where(al); top,bot=ys.min(),ys.max(); H=bot-top
    r,g,b=rgb[...,0],rgb[...,1],rgb[...,2]
    green=al&(g>150)&(r<120)&(g-r>60)&(g-b>60)
    red=al&(r>150)&(g<90)&(b<90)
    isg=any(k in os.path.basename(p) for k in ('hacker','sniper'))
    vis=green if isg else red
    head=np.zeros_like(al); head[top:top+int(H*0.45)+1]=True
    vis=vis&head
    if vis.sum():
        n,lab,st,_=cv2.connectedComponentsWithStats(vis.astype(np.uint8),8)
        j=(1+np.argmax(st[1:,cv2.CC_STAT_AREA])) if isg else (1+np.argmin(st[1:,cv2.CC_STAT_TOP])); vis=lab==j
        col=rgb[vis].max(0)
        vy,vx=np.where(vis); ANCH[os.path.basename(p)[:-4]]={'x':round(float(vx.mean())+0.5,1),'y':round(float(vy.mean())+0.5,1),'color':'green' if isg else 'red','px':int(vis.sum())}
    if vis.sum() and PAINT:
        d=cv2.distanceTransform((~vis).astype(np.uint8),cv2.DIST_C,3)
        for dist,w_in,w_out in ((1,0.45,0.3),(2,0.15,0.0)):
            m=(d==dist)&al&~vis
            w=np.where(outl[m],w_out,w_in)[:,None]
            rgb2[m]=rgb2[m]*(1-w)+col*w
        # brighten the visor core a touch
        rgb2[vis]=np.clip(rgb2[vis]*0.6+np.array([255,255,255])*0.15+col*0.25,0,255)
    o=np.dstack([rgb2,a[...,3]]).astype(np.uint8)
    Image.fromarray(o).save(os.path.join(OUT,os.path.basename(p)))
for p in sys.argv[3:]: process(p)
import json; json.dump(ANCH,open(os.path.join(OUT,'visor_anchors.json'),'w'),indent=0,sort_keys=True)
