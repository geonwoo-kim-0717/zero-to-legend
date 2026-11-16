"""transfer.py <config.json>
Phase-variant transfer: repaint every frame of a phase-1 motion with the phase-2 look, using ONE aligned pair
(ref1 = a phase-1 frame, ref2 = the same frame already repainted with the phase-2 look, same canvas and pose).

For each target frame and each region of the config:
  1. find the offset that best aligns the region of ref1 onto the target (grey-level match, search +-R px);
     if the mean error is above max_err the region is skipped and reported (pose too different).
  2. copy ref2 pixels where ref1 and the target agree (|colour diff| <= tol): the change lands only on matching
     structure, so limbs in another pose are left alone.
  3. pixels that did not agree but whose colour is a phase-1 colour seen in the region are mapped through a
     colour table learned from the ref1->ref2 pairs of that region (lut: true).
Optional "heat" entries recolour a weapon along an axis (tip hotter) with a table learned from the same pair.
Then new coat edges get the outline colour, and checks are printed.
Config keys: ref1, ref2, frames (list of [in, out]), outline [r,g,b], regions [{name, box [x0,y0,x1,y1], R, max_err,
tol, lut, remove}], heat [{name, ref_axis [[x,y],[x,y]], width, axes {frame_index: [[x,y],[x,y]]}}], coat_test.
"""
import sys, json, numpy as np, cv2
from PIL import Image
C=json.load(open(sys.argv[1]))
OUT=np.array(C.get('outline',[7,6,15]))
r1=np.array(Image.open(C['ref1']).convert('RGBA')).astype(int); r2=np.array(Image.open(C['ref2']).convert('RGBA')).astype(int)
def gray(a): x=a[...,:3].mean(2).astype(float); x[a[...,3]==0]=-60; return x
g1=gray(r1)
def is_out(c): return c[3]>0 and abs(c[:3]-OUT).sum()<10
def coat(c): r,g,b,a=c; return a>0 and r>b+30 and r<200 and g<110
def key(c): return tuple(int(v) for v in c)
def lut_for(box):
    x0,y0,x1,y1=box; T={}
    for y in range(y0,y1):
        for x in range(x0,x1):
            a,b=r1[y,x],r2[y,x]
            if a[3]>0 and not np.array_equal(a,b): T.setdefault(key(a),{}).setdefault(key(b),0); T[key(a)][key(b)]+=1
    return {k:np.array(max(v,key=v.get)) for k,v in T.items()}
def align(t,box,R):
    gt=gray(t); x0,y0,x1,y1=box; H,W=gt.shape; best=None
    for dy in range(-R,R+1):
        for dx in range(-R,R+1):
            if y0+dy<0 or x0+dx<0 or y1+dy>H or x1+dx>W: continue
            v=np.abs(gt[y0+dy:y1+dy,x0+dx:x1+dx]-g1[y0:y1,x0:x1]).mean()
            if best is None or v<best[0]: best=(v,dx,dy)
    return best
EX=np.zeros(r1.shape[:2],bool)   # ref pixels owned by a heat axis: never copied by regions (the weapon moves)
for h in C.get('heat',[]):
    (ax0,ay0),(ax1,ay1)=h['ref_axis']; A0=np.array([ax0,ay0]); u0=np.array([ax1-ax0,ay1-ay0],float); L0=np.linalg.norm(u0); u0/=L0
    yy,xx=np.mgrid[0:r1.shape[0],0:r1.shape[1]]; vx,vy=xx-A0[0],yy-A0[1]; s_=(vx*u0[0]+vy*u0[1])/L0; d_=np.abs(-vx*u0[1]+vy*u0[0])
    EX|=(s_>=-0.1)&(s_<=1.2)&(d_<=h['width']+1.5)
report=[]
for src,dst in C['frames']:
    t=np.array(Image.open(src).convert('RGBA')).astype(int); f=t.copy(); H,W=t.shape[:2]; done=np.zeros((H,W),bool); rep={'frame':src,'regions':{}}
    def teal_c(a):
        r,g,b=a[...,0],a[...,1],a[...,2]; m=(a[...,3]>0)&(g>r+60)&(b>r+60)&(g>150)
        ys,xs=np.where(m); return (xs.mean(),ys.mean()) if len(xs)>=6 else None
    # target pixels on this frame's weapon axis: rigid patches never paint over the weapon (it is in front)
    HB=np.zeros((H,W),bool); fidx=str(C['frames'].index([src,dst]))
    for h in C.get('heat',[]):
        ax=h['axes'].get(fidx)
        if ax is None: continue
        (bx0,by0),(bx1,by1)=ax; uu=np.array([bx1-bx0,by1-by0],float); LL=np.linalg.norm(uu); uu/=LL
        yy_,xx_=np.mgrid[0:H,0:W]; vx_,vy_=xx_-bx0,yy_-by0; s__=(vx_*uu[0]+vy_*uu[1])/LL; d__=np.abs(-vx_*uu[1]+vy_*uu[0])
        HB|=(s__>=-0.6)&(s__<=1.15)&(d__<=h.get('guard',h['width']+1))
    for R_ in C['regions']:
        box=R_['box']
        if R_.get('mode')=='patch':
            # rigid feature: copy every changed ref pixel within radius of the anchor, onto opaque non-outline target pixels
            ca=teal_c(r1[box[1]:box[3],box[0]:box[2]]); M=R_.get('R',6)
            tb=t[max(0,box[1]-M):box[3]+M,max(0,box[0]-M):box[2]+M]; ct=teal_c(tb)
            if ct is not None: ct=(ct[0]+max(0,box[0]-M),ct[1]+max(0,box[1]-M))
            if ct is None or ca is None: rep['regions'][R_['name']]='skipped (no anchor)'; continue
            ax_,ay_=ca[0]+box[0],ca[1]+box[1]; dx,dy=int(round(ct[0]-ax_)),int(round(ct[1]-ay_)); rad=R_.get('radius',12); n=0
            cx,cy=R_.get('centre',[ax_,ay_])
            for Y in range(r1.shape[0]):
                for X in range(r1.shape[1]):
                    if (X-cx)**2+(Y-cy)**2>rad*rad: continue
                    a,b=r1[Y,X],r2[Y,X]; x,y=X+dx,Y+dy
                    if np.array_equal(a,b) or b[3]==0 or not(0<=x<W and 0<=y<H) or done[y,x]: continue
                    c=t[y,x]
                    if R_.get('avoid_heat',True) and HB[y,x]: continue
                    if c[3]>0 and not is_out(c): f[y,x]=b; done[y,x]=True; n+=1
            rep['regions'][R_['name']]=dict(offset=(dx,dy),patch=n); continue
        err,dx,dy=align(t,box,R_.get('R',4))
        if err>R_.get('max_err',30): rep['regions'][R_['name']]=f'skipped (err {err:.1f})'; continue
        L=lut_for(box) if R_.get('lut') else {}; tol=R_.get('tol',40); n=nl=nr=0
        x0,y0,x1,y1=box
        for y in range(max(0,y0+dy),min(H,y1+dy)):
            for x in range(max(0,x0+dx),min(W,x1+dx)):
                if done[y,x]: continue
                X,Y=x-dx,y-dy; a,b,c=r1[Y,X],r2[Y,X],t[y,x]
                if np.array_equal(a,b) or (EX[Y,X] and R_.get('respect_heat',True) and not (dx==0 and dy==0 and np.array_equal(t,r1))): continue
                if R_.get('nbr',0):
                    agree=0
                    for oy in (-1,0,1):
                        for ox in (-1,0,1):
                            yy,xx,YY,XX=y+oy,x+ox,Y+oy,X+ox
                            if 0<=yy<H and 0<=xx<W and 0<=YY<r1.shape[0] and 0<=XX<r1.shape[1]:
                                p1,p2=r1[YY,XX],t[yy,xx]
                                if (p1[3]==0)==(p2[3]==0) and abs(p1[:3]-p2[:3]).sum()<=tol: agree+=1
                    if agree<R_['nbr']: continue
                if np.array_equal(a,c) and (b[3]>0 or R_.get('remove',False) or c[3]==0):
                    if c[3]==0 and not R_.get('add',False): continue
                    f[y,x]=b; done[y,x]=True; n+=1; continue
                if c[3]>0 and a[3]>0 and abs(c[:3]-a[:3]).sum()<=tol and not is_out(c):
                    if b[3]==0 and not R_.get('remove',False): continue
                    f[y,x]=b; done[y,x]=True; n+=1
                elif c[3]>0 and key(c) in L and not is_out(c):
                    f[y,x]=L[key(c)]; done[y,x]=True; nl+=1
                elif c[3]==0 and a[3]==0 and b[3]>0 and R_.get('add',False):
                    near=t[max(0,y-2):y+3,max(0,x-2):x+3].reshape(-1,4)
                    if any(coat(q) for q in near): f[y,x]=b; done[y,x]=True; nr+=1
        rep['regions'][R_['name']]=dict(offset=(dx,dy),err=round(float(err),1),copied=n,lut=nl,added=nr)
    for h in C.get('heat',[]):
        ax=h['axes'].get(str(C['frames'].index([src,dst])))
        if ax is None: continue
        (ax0,ay0),(ax1,ay1)=h['ref_axis']; A=np.array([ax0,ay0]); T_=np.array([ax1,ay1]); Lr=np.linalg.norm(T_-A); u=(T_-A)/Lr; nn=np.array([-u[1],u[0]])
        bands={}
        for y in range(r1.shape[0]):
            for x in range(r1.shape[1]):
                a,b=r1[y,x],r2[y,x]
                if a[3]==0 or np.array_equal(a,b) or is_out(a): continue
                v=np.array([x,y])-A; s=v@u/Lr
                if -0.05<=s<=1.15 and abs(v@nn)<=h['width']:
                    bands.setdefault(min(3,max(0,int(s*4))),{}).setdefault(key(a),{}).setdefault(key(b),0); bands[min(3,max(0,int(s*4)))][key(a)][key(b)]+=1
        tabs={k:{kk:np.array(max(vv,key=vv.get)) for kk,vv in v.items()} for k,v in bands.items()}
        P1=lambda band: np.array(list(tabs[band].keys())) if band in tabs and tabs[band] else None
        (bx0,by0),(bx1,by1)=ax; B=np.array([bx0,by0]); E=np.array([bx1,by1]); Lb=np.linalg.norm(E-B); ub=(E-B)/Lb; nb=np.array([-ub[1],ub[0]]); n=0
        for y in range(H):
            for x in range(W):
                c=t[y,x]
                if c[3]==0 or is_out(c) or coat(c) or done[y,x]: continue
                v=np.array([x,y])-B; s=v@ub/Lb
                if not(-0.05<=s<=1.15 and abs(v@nb)<=h['width']): continue
                band=min(3,max(0,int(s*4))); keys=P1(band)
                if keys is None: continue
                k=keys[np.argmin(np.abs(keys[:,:3]-c[:3]).sum(1))]
                f[y,x]=tabs[band][key(k)]; done[y,x]=True; n+=1
        rep['regions'][h['name']]=dict(heat_px=n)
    al=f[...,3]>0; e=0
    for y in range(H):
        for x in range(W):
            if al[y,x] and coat(f[y,x]) and any(not(0<=yy<H and 0<=xx<W) or not al[yy,xx] for yy,xx in ((y+1,x),(y-1,x),(y,x+1),(y,x-1))):
                f[y,x,:3]=OUT; e+=1
    # drop tiny bits that the edit cut loose from the body (the input had one body)
    al=(f[...,3]>0).astype(np.uint8); n_,lab_,st_,_=cv2.connectedComponentsWithStats(al,8)
    if n_>2:
        big_=1+np.argmax(st_[1:,4]); loose=(lab_!=big_)&(lab_>0)&np.isin(lab_,[k for k in range(1,n_) if st_[k,4]<=6])
        f[loose]=0; rep['loose_removed']=int(loose.sum())
    Image.fromarray(f.astype(np.uint8)).save(dst)
    al=f[...,3]>0; parts=cv2.connectedComponentsWithStats(al.astype(np.uint8),8)[0]-1
    ys,xs=np.where(t[...,3]>0); yn,xn=np.where(al)
    pal=set(map(tuple,t[t[...,3]>0][:,:3]))|set(map(tuple,r1[r1[...,3]>0][:,:3]))|set(map(tuple,r2[r2[...,3]>0][:,:3]))
    rep.update(edge=e,parts=parts,bbox_in=(int(xs.min()),int(xs.max()),int(ys.min()),int(ys.max())),bbox_out=(int(xn.min()),int(xn.max()),int(yn.min()),int(yn.max())),
               new_colours=len(set(map(tuple,f[al][:,:3]))-pal))
    report.append(rep); print(json.dumps(rep,ensure_ascii=False))
