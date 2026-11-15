"""anim_info.py <prefix> <json_out> name1 name2 ...  e.g. anim_info.py src/assets/midboss src/data/midboss_anim.json walk leap charge
Per motion: frame count, canvas w/h, originX = hip x (median x of the 50-70% height band of frame 0) / w, originY = 1 (feet on bottom row).
Keeps any other keys already in the json (chainEnd, fx, timingMs...)."""
import sys, glob, json, os, numpy as np
from PIL import Image
pre,out,names=sys.argv[1],sys.argv[2],sys.argv[3:]
J=json.load(open(out)) if os.path.exists(out) else {}
for n in names:
    fs=sorted(glob.glob(f"{pre}_{n}_[0-9][0-9].png")); a=np.asarray(Image.open(fs[0]).convert("RGBA"))
    ys,xs=np.where(a[...,3]>0); t,b=ys.min(),ys.max(); band=(ys>t+0.5*(b-t))&(ys<t+0.7*(b-t))
    J.setdefault(n,{}).update({"frames":len(fs),"w":a.shape[1],"h":a.shape[0],"originX":round(float(np.median(xs[band]))/a.shape[1],3),"originY":1})
    bottoms=[int(np.where(np.asarray(Image.open(f))[...,3]>0)[0].max()) for f in fs]
    print(n,J[n],"feet rows:",bottoms)
json.dump(J,open(out,"w"),indent=1)
