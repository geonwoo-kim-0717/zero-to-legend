"""tile_check.py <tile.png> <head.png> <body_frame.png> <endX> <endY> [lengths...]
Tiled projectile (chain/rope/beam) check: draws tile cropped to each length from (endX-1, endY-2) plus head at
(endX-2+len, endY-2), reports connected components (must be 1) and whether it touches the body. Saves tile_check.png."""
import sys, numpy as np, cv2
from PIL import Image
tile,head,body=[np.asarray(Image.open(p).convert("RGBA")) for p in sys.argv[1:4]]
ex,ey=int(sys.argv[4]),int(sys.argv[5]); Ls=[int(v) for v in sys.argv[6:]] or [1,2,7,13,14,15,40,150]
def paste(d,s,x,y): m=s[...,3]>0; d[y:y+s.shape[0],x:x+s.shape[1]][m]=s[m]
rows=[]
for L in Ls:
    CW=body.shape[1]+L+head.shape[1]+8; CH=body.shape[0]+8; img=np.zeros((CH,CW,4),np.uint8); img[...]=(40,40,48,255); paste(img,body,2,4)
    lay=np.zeros_like(img); n=(L+tile.shape[1]-1)//tile.shape[1]
    paste(lay,np.concatenate([tile]*n,1)[:,:L],2+ex-1,4+ey-2); paste(lay,head,2+ex-2+L,4+ey-2)
    comp=cv2.connectedComponents((lay[...,3]>0).astype(np.uint8),connectivity=8)[0]-1
    bm=np.zeros(img.shape[:2],np.uint8); bm[4:4+body.shape[0],2:2+body.shape[1]]=body[...,3]>0
    touch=bool((cv2.dilate(bm,np.ones((3,3),np.uint8))>0)[lay[...,3]>0].any())
    print(f"len {L}: components {comp} {'OK' if comp==1 else 'BROKEN'}, touches body {touch}"); paste(img,lay,0,0); rows.append(img)
W=max(r.shape[1] for r in rows); sheet=np.concatenate([np.pad(r,((0,2),(0,W-r.shape[1]),(0,0))) for r in rows],0)
Image.fromarray(sheet).resize((sheet.shape[1]*3,sheet.shape[0]*3),0).save("tile_check.png")
