import sys, subprocess, numpy as np; sys.path.insert(0,"tmp")
from pxlib import *
K=dict(S=float(sys.argv[1]),A=float(sys.argv[2]),M=float(sys.argv[3]))
px={p:make("melee",np.asarray(Image.open(f"tmp/melee_atk{p}.png").convert("RGBA")),K[p]) for p in "SAM"}
def squash(a):
    a=a.copy(); ys,_=np.where(a[...,3]>0); top,bot=ys.min(),ys.max(); cut=bot-int((bot-top)*0.3)
    b=a.copy(); b[top+1:cut+1]=a[top:cut]; b[top]=0; return b
seq=[px["S"],px["A"],squash(px["A"]),px["M"]]
import os; os.makedirs("tmp/matk",exist_ok=True)
for i,a in enumerate(seq): Image.fromarray(a[:42]).save(f"tmp/matk/trooper_melee_atk_{i:02d}.png")
