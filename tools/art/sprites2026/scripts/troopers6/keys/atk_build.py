import numpy as np, json
from PIL import Image
I="img2mo/tmp"; FX="afx/sheets"; OUT="atk_out"
import os; os.makedirs(OUT,exist_ok=True)
def L(p): return Image.open(p).convert("RGBA")
def squash(im):   # crouch 1px: everything above the knees moves down 1px
    a=np.asarray(im).copy(); ys,_=np.where(a[...,3]>0); top,bot=ys.min(),ys.max(); cut=bot-int((bot-top)*0.3)
    b=a.copy(); b[top+1:cut+1]=a[top:cut]; b[top]=0; return Image.fromarray(b)
def shift(im,dx): a=np.asarray(im); b=np.zeros_like(a); b[:,dx:]=a[:,:a.shape[1]-dx]; return Image.fromarray(b)
def sheet(path,fw,fh,cols,n): s=L(path); return [s.crop(((i%cols)*fw,(i//cols)*fh,(i%cols)*fw+fw,(i//cols)*fh+fh)) for i in range(n)]
FXS={"slash":(sheet(f"{FX}/melee/sword-slash/sword-slash.png",136,104,3,10),(44,92)),
     "bash":(sheet(f"{FX}/zerolegend/shield-bash/shield-bash.png",64,40,3,8),(32,18)),
     "muzzle":(sheet(f"{FX}/projectiles/muzzle-pistol/muzzle-pistol.png",96,72,5,23),(44,66)),
     "hack":(sheet(f"{FX}/zerolegend/hack-pulse/hack-pulse.png",64,48,3,10),(20,24))}
# frame list, durations (ms), fx: (name, start frame index, anchor in frame px)
SEQ={"tank":(["S","A","A2","M","B","B2","F","S"],[90,110,140,70,90,120,110,100],("bash",4,(41,23))),
     "melee":(["S","A","A2","M","B","B2","F","F2"],[90,110,140,60,80,120,110,100],("slash",3,(22,41))),
     "hacker":(["S","A","A2","M","B","B2","F","F2"],[100,120,160,80,110,160,120,100],("hack",4,(37,13))),
     "sniper":(["S","A","A2","B","M","F","A","A2"],[100,140,200,70,90,110,140,140],("muzzle",3,(45,47)))}
meta={}
for t,(seq,dur,fx) in SEQ.items():
    base={p:L(f"{I}/px_{t}_atk{p}.png") for p in "SAMBF"}
    base["A2"]=squash(base["A"]); base["F2"]=squash(base["F"]); base["B2"]=shift(base["B"],1) if t in("tank","melee") else squash(base["B"])
    F=base["S"].width; floor=41 if F==48 else 47
    frames=[base[p].crop((0,0,F,floor+1)) for p in seq]
    for i,f in enumerate(frames): f.save(f"{OUT}/trooper_{t}_atk_{i:02d}.png")
    meta[t]={"frames":len(frames),"size":[F,floor+1],"ms":dur,"fx":fx[0],"fxStartFrame":fx[1],"fxAnchor":list(fx[2])}
json.dump(meta,open(f"{OUT}/meta.json","w"),indent=1)
# preview: 4 troopers side by side, fx composited, 2 loops
W,H=150,110; Z=3; gif=[];gd=[]
for loop in range(2):
  maxn=max(len(v[0]) for v in SEQ.values())
  for k in range(maxn):
    c=Image.new("RGBA",(W*4,H),(26,16,48,255))
    for j,(t,(seq,dur,fx)) in enumerate(SEQ.items()):
        im=L(f"{OUT}/trooper_{t}_atk_{min(k,len(seq)-1):02d}.png"); ox=j*W+40; oy=H-8-im.height
        c.alpha_composite(im,(ox,oy))
        name,st,(ax,ay)=fx; fr,(px,py)=FXS[name]
        # fx runs at 12fps from its start frame; map elapsed ms to fx frame
        if k>=st:
            ms=sum(dur[st:k]); fi=int(ms/83.3)
            if fi<len(fr): c.alpha_composite(fr[fi],(ox+ax-px,oy+ay-py)) if 0<=ox+ax-px and ox+ax-px+fr[fi].width<=c.width+200 else None
    gif.append(c.resize((c.width*Z,c.height*Z),Image.NEAREST)); gd.append(110)
gif[0].save("../atk_prev2.gif",save_all=True,append_images=gif[1:],duration=gd,loop=0,disposal=2)
s=Image.new("RGBA",(8*58*3,4*56*3),(26,16,48,255))
for j,t in enumerate(SEQ):
    for i in range(len(SEQ[t][0])):
        im=L(f"{OUT}/trooper_{t}_atk_{i:02d}.png"); s.alpha_composite(im.resize((im.width*3,im.height*3),Image.NEAREST),(i*58*3,j*56*3+(54-im.height)*3))
s.save("../atk_prev2_sheet.png"); print(json.dumps(meta))
