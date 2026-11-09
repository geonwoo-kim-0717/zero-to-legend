import sys as _s; _s.path.insert(0,"/home/user/zero-to-legend/tools/art/sprites2026/scripts/ext"); from palx import PALX, nearx, hybrid
"""Shrink posed full-size counter frames to game pixels at one fixed scale: hue-aware mapping onto the 16-colour
palette (yellow, orange, red, magenta, cyan, green ramps; greys by value; navy lifted), small glows kept; 1px outline."""
import numpy as np, colorsys, os
from PIL import Image
PALH=["07060F","1A1030","2A1747","3D1F66","8A7AA8","E8F7FF","00F0FF","0A7A8A","FF2BD6","8A1A70","FFF23A","FF8A1F","8A3A10","FF2A3A","39FF88","B6FF3A"]
PAL=np.array([[int(h[i:i+2],16) for i in (0,2,4)] for h in PALH],float)
def near(m):
    r,g,b=m; mx=max(m); h,s,v=colorsys.rgb_to_hsv(r/255,g/255,b/255); h*=360; v*=255
    if s<0.2 or mx<40:                                # chrome / greys / black
        return 5 if mx>185 else 4 if mx>115 else 3 if mx>70 else 2 if mx>42 else 1
    if 200<=h<280: return 4 if v>170 else 3 if v>55 else 2      # navy, lifted
    if 40<=h<75:  return 10 if v>150 else 11 if v>95 else 12      # yellow
    if 15<=h<40:  return 11 if v>140 else 12                      # orange / skin
    if h<15 or h>=345: return 13 if v>85 else 9                  # red
    if 280<=h<345: return 8 if v>140 else 9                       # magenta
    if 160<=h<200: return 6 if v>150 else 7                       # cyan
    if 75<=h<160: return 14 if v>120 else 7                       # green
    return 4
def cls(c):
    r,g,b=c
    if r>220 and g>200 and b<140: return 10
    if r>220 and 110<g<190 and b<90: return 11
    if r>200 and g<70 and b<80: return 13
    if r>200 and b>170 and g<120: return 8
    if g>200 and b>200 and r<120: return 6
    if g>200 and r<150 and b<160: return 14
    if min(c)>205: return 5
    return None
def pix(src,sc,F,wthr=0.3):
    a=np.asarray(Image.open(src).convert("RGBA")).astype(float); cs=1/sc
    out=np.full((F,F),-1)
    for y in range(F):
        for x in range(F):
            y0,y1=int(round(y*cs)),int(round((y+1)*cs)); x0,x1=int(round(x*cs)),int(round((x+1)*cs))
            cell=a[y0:y1,x0:x1].reshape(-1,4); sol=cell[cell[:,3]>128][:,:3]
            f=[cls(c) for c in sol]; nf=sum(v is not None for v in f)
            if len(sol)<0.4*len(cell) and not (len(sol)>=0.15*len(cell) and nf>=0.6*len(sol)): continue
            best=next((k for k in (10,11,13,8,6,14) if f.count(k)>=0.3*len(sol)),None)
            if best is None and f.count(5)>=wthr*len(sol): best=5
            out[y,x]=best if best is not None else hybrid(sol.mean(0), near(sol.mean(0)), skin=False)
    img=np.zeros((F,F,4),np.uint8)
    for y in range(F):
        for x in range(F):
            if out[y,x]>=0: img[y,x,:3]=PALX[out[y,x]]; img[y,x,3]=255
            elif any(0<=y+dy<F and 0<=x+dx<F and out[y+dy,x+dx]>=0 for dy,dx in((1,0),(-1,0),(0,1),(0,-1))): img[y,x]=[7,6,15,255]
    return img
if __name__=="__main__":
  os.makedirs("outx",exist_ok=True)
  for k in ["c_mirror","c_insulator","c_dampener","c_thorn","c_prism","c_firewall"]:
    sc,S=open(f"scale_{k}.txt").read().split(); sc=float(sc); S=int(S)
    for n in ["","_w2"]:
        img=pix(f"full_{k}{n}.png",sc,S+12)[6:6+S,6:6+S]
        Image.fromarray(img,"RGBA").save(f"outx/{k}{n}.png")
    print(k,"ok")
