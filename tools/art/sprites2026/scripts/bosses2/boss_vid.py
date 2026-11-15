"""Boss clip (side view, flat magenta, in place) -> pixel frames at ONE fixed scale per boss.
usage: boss_vid.py <clip.mp4> <out_prefix> <scale_file> <N> [start end] [--loop]
scale_file holds "src_px_per_game_px canvas_w canvas_h" for the boss; it is written on the first (walk) run from --height H.
Every motion of a boss uses the same scale file, so sizes never drift between motions; feet sit on the canvas bottom row."""
import sys, os, glob, subprocess, numpy as np, cv2
from PIL import Image
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "counters"))
from pix_ext import pix
def pix_keep(src,sc,F):
    # area average per game pixel, keeping the source colours (palette matching is a later step)
    a=np.asarray(Image.open(src).convert("RGBA")).astype(float); cs=1/sc; o=np.zeros((F,F,4),np.uint8)
    for y in range(F):
        for x in range(F):
            y0,y1=int(round(y*cs)),int(round((y+1)*cs)); x0,x1=int(round(x*cs)),int(round((x+1)*cs))
            cell=a[y0:y1,x0:x1].reshape(-1,4); sol=cell[cell[:,3]>128]
            if len(sol)>=0.4*len(cell) and len(cell): o[y,x,:3]=np.median(sol[:,:3],0); o[y,x,3]=255
    # magenta fringe: drop cells whose colour is pink/purple (the key colour bleeding in)
    r,g,b=o[...,0].astype(int),o[...,1].astype(int),o[...,2].astype(int)
    o[(o[...,3]>0)&(r-g>40)&(b-g>30)&(b>70)]=0
    al=o[...,3]>0; nb=np.zeros_like(al); nb[1:]|=al[:-1]; nb[:-1]|=al[1:]; nb[:,1:]|=al[:,:-1]; nb[:,:-1]|=al[:,1:]
    o[nb&~al]=[7,6,15,255]; return o
args=[a for a in sys.argv[1:] if not a.startswith("--")]; flags={a.split("=")[0]:(a.split("=")+[""])[1] for a in sys.argv[1:] if a.startswith("--")}
clip,pref,scf,N=args[0],args[1],args[2],int(args[3])
raw=pref+"_raw"; os.makedirs(raw,exist_ok=True)
if not glob.glob(raw+"/*.png"): subprocess.run(["ffmpeg","-loglevel","error","-i",clip,raw+"/%04d.png"],check=True)
fs=sorted(glob.glob(raw+"/*.png"))
def isbg(a):
    r,g,b=a[...,0],a[...,1],a[...,2]; return (r>140)&(b>110)&(g<120)&(r-g>70)&(b-g>50)
def key(p):
    a=np.asarray(Image.open(p).convert("RGBA")).astype(int); fg=~isbg(a)
    n,lab,st,_=cv2.connectedComponentsWithStats(fg.astype(np.uint8),8)
    big=[i for i in range(1,n) if st[i,4]>=0.02*st[1:,4].max()]   # keep the body and detached bits (chain, sparks)
    keep=np.isin(lab,big); a[...,3]=np.where(keep,255,0); return a.astype(np.uint8),keep
def legmask(p):
    a=np.asarray(Image.open(p).convert("RGB")).astype(int); m=~isbg(a); return m[int(m.shape[0]*0.55):]
if len(args)>5: s,e=int(args[4]),int(args[5])
elif "--loop" in flags:
    M=[legmask(p)[::2,::2] for p in fs]; best=None
    for P in range(16,40):
        for s0 in range(3,len(fs)-P):
            d=(M[s0]^M[s0+P]).sum()
            if best is None or d<best[0]: best=(d,s0,P)
    s,e=best[1],best[1]+best[2]; print("loop",s,e)
else: s,e=0,len(fs)
idx=[s+round(i*(e-s)/N) for i in range(N)] if "--loop" in flags or len(args)>5 else [round(i*(len(fs)-1)/(N-1)) for i in range(N)]
frames=[key(fs[i]) for i in idx]
if not os.path.exists(scf):
    H=int(flags["--height"]); ys,_=np.where(frames[0][1]); hsrc=ys.max()-ys.min()+1
    k=H/hsrc   # game px per source px
    W=int(flags.get("--w",H+16)); Hc=int(flags.get("--h",H+8))
    open(scf,"w").write(f"{k} {W} {Hc}"); print("scale",k,W,Hc)
k,W,Hc=open(scf).read().split(); k=float(k); W=int(W); Hc=int(Hc)
# common ground line and horizontal anchor (head x of frame 0) in source px
ground=int(np.median([np.where(m)[0].max() for _,m in frames]))
def headx(m):
    ys,xs=np.where(m); t=ys.min(); H=ys.max()-t; band=m[t:t+max(2,int(H*0.15))]; return np.where(band)[1].mean()
hx=headx(frames[0][1]) if "--anchor" not in flags else float(flags["--anchor"])
F=max(W,Hc); tmp=pref+"_tmp.png"
for i,(a,m) in enumerate(frames):
    # source window of F/k px whose bottom row is the ground and centre is the head x
    win=F/k; x0=hx-win/2; y0=ground+1-win*(Hc/F)   # feet land on row Hc-1 of the output
    cv=Image.new("RGBA",(int(np.ceil(win)),int(np.ceil(win))),(0,0,0,0)); cv.alpha_composite(Image.fromarray(a),(int(-x0),int(-y0)))
    cv.save(tmp); o=pix_keep(tmp,k,F)
    o=o[:Hc, (F-W)//2:(F-W)//2+W] if F>W else o[:Hc]
    Image.fromarray(o).save(f"{pref}_{i:02d}.png")
os.remove(tmp)
# one shared palette for the whole motion so colours do not flicker between frames
outs=[f"{pref}_{i:02d}.png" for i in range(len(frames))]
ims=[Image.open(p).convert("RGBA") for p in outs]; sheet=Image.new("RGB",(W*len(ims),Hc))
for i,im in enumerate(ims): sheet.paste(im.convert("RGB"),(i*W,0))
pal=sheet.quantize(colors=int(flags.get("--colors",32)),method=Image.Quantize.MEDIANCUT)
for p,im in zip(outs,ims):
    q=im.convert("RGB").quantize(palette=pal,dither=Image.Dither.NONE).convert("RGB"); a=np.asarray(im).copy(); a[...,:3]=np.asarray(q)
    a[np.asarray(im)[...,3]==0]=0; Image.fromarray(a).save(p)
print("frames",idx)
