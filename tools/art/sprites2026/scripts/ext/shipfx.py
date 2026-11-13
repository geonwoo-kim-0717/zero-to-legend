"""Dropship effects drawn as pixel art in the game palette.
fx_ship_wash_NN / fx_ship_wash_move_NN: 112x90 overlays aligned to the ship sprite's top-left (ship = rows 0-54),
drawn BEHIND the ship: one exhaust plume under each ducted fan, straight down while hovering, angled back 40 degrees
while flying (fans tilted). fx_ship_dust_NN: 128x26 ground dust ring, centred under the ship on the floor."""
import numpy as np, math, os
from PIL import Image
PAL={"w":(232,247,255),"C":(0,240,255),"c":(10,122,138),"t":(46,154,168),"p":(143,216,222),"d1":(92,102,128),"d2":(58,64,88),"d3":(168,176,196)}
FANS=[(19,11),(82,11),(14,43),(81,42)]
def plume(img,x0,y0,ang,L,w0,w1,seed):
    rng=np.random.default_rng(seed); dx,dy=math.sin(ang),math.cos(ang)   # ang 0 = straight down
    for i in range(L):
        f=i/L; half=(w0+(w1-w0)*f)/2; cx=x0+dx*i; cy=y0+dy*i
        for s in np.arange(-half,half+0.5,0.5):
            x=int(round(cx-dy*s)); y=int(round(cy+dx*s))
            if not(0<=x<img.shape[1] and 0<=y<img.shape[0]): continue
            e=abs(s)/max(half,0.5); v=(1-f)*0.8+0.2*(1-e)-0.15*e+rng.uniform(-0.08,0.08)
            col="w" if v>0.82 else "p" if v>0.66 else "C" if v>0.5 else "t" if v>0.34 else "c" if v>0.2 else None
            if col is None or (v<0.28 and (x+y)%2): continue
            if img[y,x,3]==0 or "wpCtc".index(col)<"wpCtc".index(img[y,x,4] if False else "c"): img[y,x,:3]=PAL[col]; img[y,x,3]=255
def wash(k,tilt):
    img=np.zeros((90,112,4),np.uint8); L=[22,26,24,28][k]
    ang=-math.radians(40) if tilt else 0.0    # flying right: plume pushed back (left)
    for j,(x,y) in enumerate(FANS):
        plume(img,x,y+3,ang,L+(j%2)*2,6,12,k*7+j)
    return img
def dust(k):
    img=np.zeros((26,128,4),np.uint8); rng=np.random.default_rng(100+k); cx=64
    for side in (-1,1):
        for n in range(9):
            r=2+n*0.4+k*0.5; x=cx+side*(10+n*6+k*3+rng.uniform(-2,2)); y=20-abs(math.sin(n+k))*3-k*0.6
            for yy in range(int(y-r),int(y+r)+1):
                for xx in range(int(x-r*1.3),int(x+r*1.3)+1):
                    if 0<=xx<128 and 0<=yy<26 and ((xx-x)/(r*1.3))**2+((yy-y)/r)**2<=1:
                        e=((xx-x)/(r*1.3))**2+((yy-y)/r)**2; col="d3" if e<0.25 and k<3 else "d1" if e<0.6 else "d2"
                        if k>=4 and (xx+yy)%2: continue
                        img[yy,xx,:3]=PAL[col]; img[yy,xx,3]=255
    return img
os.makedirs("out",exist_ok=True)
for k in range(4):
    Image.fromarray(wash(k,False)).save(f"out/fx_ship_wash_{k:02d}.png"); Image.fromarray(wash(k,True)).save(f"out/fx_ship_wash_move_{k:02d}.png")
for k in range(6): Image.fromarray(dust(k)).save(f"out/fx_ship_dust_{k:02d}.png")
