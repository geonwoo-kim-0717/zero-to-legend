"""Shrink posed full-size boss frames to game pixels at one fixed scale: cell mean -> nearest of the 16-colour
palette (red-mean distance), small glows/highlights kept when they fill part of a cell; 1px outline."""
import numpy as np
from PIL import Image
PALH=["07060F","1A1030","2A1747","3D1F66","8A7AA8","E8F7FF","00F0FF","0A7A8A","FF2BD6","8A1A70","FFF23A","FF8A1F","8A3A10","FF2A3A","39FF88","B6FF3A"]
PAL=np.array([[int(h[i:i+2],16) for i in (0,2,4)] for h in PALH],float)
def near(m):
    r,g,b=m; mx,mn=max(m),min(m); sat=(mx-mn)/(mx+1e-6)
    if r>=g and r>=b and sat>0.42 and mx>60:
        if g>0.3*r and b<0.85*g:                    # skin / leather: orange ramp
            return 11 if mx>=175 else 12
        return 13 if r>125 else 9                    # red coat / bandana: red, shadow -> dark magenta
    if sat<0.2:                                      # chrome / greys / black
        return 5 if mx>205 else 4 if mx>120 else 3 if mx>70 else 2 if mx>42 else 1
    return near0(m)
def near0(m):
    rm=(PAL[:,0]+m[0])/2; d=PAL-m
    return int(np.argmin((2+rm/256)*d[:,0]**2+4*d[:,1]**2+(2+(255-rm)/256)*d[:,2]**2))
def cls(c):
    r,g,b=c
    if r>220 and g>200 and b<140: return 10        # Y
    if r>220 and 110<g<190 and b<90: return 11      # O glow
    if r>200 and g<70 and b<80: return 13           # R glow (eyes, circuits)
    if min(c)>200: return 5                          # w highlight
    return None
def pix(src,sc,F):
    a=np.asarray(Image.open(src).convert("RGBA")).astype(float); cs=1/sc
    out=np.full((F,F),-1)
    for y in range(F):
        for x in range(F):
            y0,y1=int(round(y*cs)),int(round((y+1)*cs)); x0,x1=int(round(x*cs)),int(round((x+1)*cs))
            cell=a[y0:y1,x0:x1].reshape(-1,4); sol=cell[cell[:,3]>128][:,:3]
            if len(sol)<0.4*len(cell): continue
            f=[cls(c) for c in sol]
            best=next((k for k in (10,11,13,5) if f.count(k)>=0.3*len(sol)),None)
            out[y,x]=best if best is not None else near(sol.mean(0))
    img=np.zeros((F,F,4),np.uint8)
    for y in range(F):
        for x in range(F):
            if out[y,x]>=0: img[y,x,:3]=PAL[out[y,x]]; img[y,x,3]=255
            elif any(0<=y+dy<F and 0<=x+dx<F and out[y+dy,x+dx]>=0 for dy,dx in((1,0),(-1,0),(0,1),(0,-1))): img[y,x]=[7,6,15,255]
    return img
for k in ["midboss","boss"]:
    sc,S=open(f"scale_{k}.txt").read().split(); sc=float(sc); S=int(S)
    for n in ["w1","w2","aim","charge"]:
        img=pix(f"full_{k}_{n}.png",sc,S+12)
        if n in ("w1","w2"): img=img[6:6+S,6:6+S]
        Image.fromarray(img,"RGBA").save(f"out/{k}_{n}.png")
    print(k,"ok")
