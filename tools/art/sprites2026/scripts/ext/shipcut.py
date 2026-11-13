import numpy as np
from PIL import Image
from collections import deque
def cut(path):
    a=np.asarray(Image.open(path).convert("RGB")).astype(int); h,w,_=a.shape
    mx=a.max(2); r,g,b=a[...,0],a[...,1],a[...,2]
    ok=((mx<62)&(mx>16))|((r>g*1.6)&(mx<150))|((b>r+15)&(mx<120)&(mx>16))
    bg=np.zeros((h,w),bool); q=deque()
    for y in range(h):
        for x in (0,w-1):
            if ok[y,x]: bg[y,x]=1; q.append((y,x))
    for x in range(w):
        for y in (0,h-1):
            if ok[y,x] and not bg[y,x]: bg[y,x]=1; q.append((y,x))
    while q:
        y,x=q.popleft()
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny,nx=y+dy,x+dx
            if 0<=ny<h and 0<=nx<w and not bg[ny,nx] and ok[ny,nx] and abs(a[ny,nx]-a[y,x]).max()<=10: bg[ny,nx]=1; q.append((ny,nx))
    m=(~bg)&(mx>16)
    def dil(m,n):
        for _ in range(n):
            o=m.copy(); o[1:]|=m[:-1]; o[:-1]|=m[1:]; o[:,1:]|=m[:,:-1]; o[:,:-1]|=m[:,1:]; m=o
        return m
    d=dil(m,5); out=np.zeros_like(d); q=deque()
    for y in range(h):
        for x in range(w):
            if (y in (0,h-1) or x in (0,w-1)) and not d[y,x]: out[y,x]=1; q.append((y,x))
    while q:
        y,x=q.popleft()
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny,nx=y+dy,x+dx
            if 0<=ny<h and 0<=nx<w and not d[ny,nx] and not out[ny,nx]: out[ny,nx]=1; q.append((ny,nx))
    ship=~dil(~(~out),3)
    lab=np.zeros((h,w),int); best=(0,0); k=0
    for y0,x0 in zip(*np.where(ship)):
        if lab[y0,x0]: continue
        k+=1; n=0; q=deque([(y0,x0)]); lab[y0,x0]=k
        while q:
            y,x=q.popleft(); n+=1
            for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
                ny,nx=y+dy,x+dx
                if 0<=ny<h and 0<=nx<w and ship[ny,nx] and not lab[ny,nx]: lab[ny,nx]=k; q.append((ny,nx))
        if n>best[0]: best=(n,k)
    ship=lab==best[1]; ship[:,1495:]=False
    return np.dstack([a,np.where(ship,255,0)]).astype(np.uint8)
